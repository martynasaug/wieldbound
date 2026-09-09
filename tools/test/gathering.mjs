// THE GATHERING LOOP, WHICH NOTHING CHECKED.
//
// Wood, ore and herb are where the early game's money comes from and what the
// shop, the forge and the reforge ladder are all priced against, and not one of
// the four numbers behind it had a test: `gatherDurationForLevel`,
// `gatherUpgradeCost`, `gatherYieldFor`, `RESOURCE_BAND_RADII`.
//
// THE INVARIANT THAT MATTERS MOST IS THE ONE M70.200 LEARNED THE HARD WAY. The
// accuracy cap sat at 95, agility 23 reached it, and every point, affix, set
// bonus and talent after that bought NOTHING while still being sold as an
// upgrade. The same shape is available here: gather duration floors at 500ms,
// which `gatherDurationForLevel` reaches at gather level 7 — earlier with
// agility — while `gatherUpgradeCost` keeps charging 12 + 9L². Past that point
// the speed half of the upgrade is finished, so the YIELD half has to keep
// paying or the upgrade becomes a price for nothing.
//
// Arithmetic over the shared tables. No server, no browser.
//
//   node tools/test/gathering.mjs
import {
  GATHER_DURATION_MS,
  GATHER_DURATION_FLOOR_MS,
  GATHER_LEVEL_STEP_MS,
  AGILITY_GATHER_STEP_MS,
  RESOURCE_BAND_RADII,
  PLAYER_SPAWN,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  gatherDurationForLevel,
  gatherUpgradeCost,
  gatherYieldFor,
} from "../../shared/protocol-types.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);
const BANDS = [1, 2, 3, 4, 5];

section("1. gathering gets faster, and stops somewhere sane");
{
  check("an untrained gather takes the full duration", gatherDurationForLevel(0, 0) === GATHER_DURATION_MS,
    String(gatherDurationForLevel(0, 0)));
  let prev = Infinity;
  for (let level = 0; level <= 40; level++) {
    const d = gatherDurationForLevel(level, 0);
    check(`level ${level} is not slower than level ${level - 1}`, d <= prev, `${prev} -> ${d}`);
    check(`level ${level} never goes under the floor`, d >= GATHER_DURATION_FLOOR_MS, String(d));
    check(`level ${level} is a real number`, Number.isFinite(d) && d > 0, String(d));
    prev = d;
  }
  // Agility helps too, and must not push it through the floor either — a
  // negative or zero duration is an instant gather, which is a different game.
  check("agility also speeds it up", gatherDurationForLevel(0, 10) < gatherDurationForLevel(0, 0));
  check("and cannot break the floor", gatherDurationForLevel(0, 9999) >= GATHER_DURATION_FLOOR_MS,
    String(gatherDurationForLevel(0, 9999)));
  check("nor can the two together", gatherDurationForLevel(9999, 9999) >= GATHER_DURATION_FLOOR_MS);

  const floorsAt = Array.from({ length: 60 }, (_, i) => i).find((l) => gatherDurationForLevel(l, 0) === GATHER_DURATION_FLOOR_MS);
  console.log(`  ${GATHER_DURATION_MS}ms untrained, -${GATHER_LEVEL_STEP_MS}/level, -${AGILITY_GATHER_STEP_MS}/agility, floor ${GATHER_DURATION_FLOOR_MS}ms reached at gather level ${floorsAt}`);
  // Not instantly, or the upgrade is decoration from the first purchase.
  check("the floor is not reached immediately", floorsAt >= 3, `reached at ${floorsAt}`);
}

section("2. walking further pays better");
{
  for (const gl of [0, 5, 12]) {
    for (let b = 2; b <= 5; b++) {
      check(
        `at gather level ${gl}, band ${b} beats band ${b - 1}`,
        gatherYieldFor(b, gl) > gatherYieldFor(b - 1, gl),
        `${gatherYieldFor(b - 1, gl)} vs ${gatherYieldFor(b, gl)}`,
      );
    }
  }
  console.log(`  band yields at level 0: ${BANDS.map((b) => gatherYieldFor(b, 0)).join(", ")}`);
}

section("3. every upgrade buys something");
{
  // THE ACCURACY-CAP CHECK, generalised. Once duration floors, the only thing
  // left is yield; if that ever stops moving too, the shop is selling a level
  // that does nothing — which is exactly what `playerAccuracy` did for fifty
  // levels before anybody noticed.
  for (let level = 0; level < 25; level++) {
    const fasterSomewhere = gatherDurationForLevel(level + 1, 0) < gatherDurationForLevel(level, 0);
    const richerSomewhere = BANDS.some((b) => gatherYieldFor(b, level + 1) > gatherYieldFor(b, level));
    check(
      `gather level ${level} -> ${level + 1} is worth buying`,
      fasterSomewhere || richerSomewhere,
      `duration ${gatherDurationForLevel(level, 0)}->${gatherDurationForLevel(level + 1, 0)}, ` +
        `yields ${BANDS.map((b) => gatherYieldFor(b, level)).join("/")} -> ${BANDS.map((b) => gatherYieldFor(b, level + 1)).join("/")}`,
    );
  }
}

section("4. the upgrade outruns the income it is priced against");
{
  // The quadratic is deliberate and the reason is written above
  // `gatherUpgradeCost`: a linear cost fell behind the yield it was meant to
  // pace, so "level ten cost fifty-five wood, which is five gathers". The
  // property is that the price per level grows faster than the yield per level.
  let prev = -1;
  for (let level = 0; level <= 20; level++) {
    const c = gatherUpgradeCost(level);
    check(`level ${level} costs more than level ${level - 1}`, c > prev, `${prev} -> ${c}`);
    prev = c;
  }
  const costGrowth = gatherUpgradeCost(12) / gatherUpgradeCost(6);
  const yieldGrowth = gatherYieldFor(5, 12) / gatherYieldFor(5, 6);
  check(
    "cost grows faster than yield",
    costGrowth > yieldGrowth,
    `cost x${costGrowth.toFixed(1)} against yield x${yieldGrowth.toFixed(1)} between levels 6 and 12`,
  );
  console.log(`  levels 6->12: cost x${costGrowth.toFixed(1)}, best-band yield x${yieldGrowth.toFixed(1)}`);
}

section("5. every band ring is somewhere a player can stand");
{
  // A ring wider than the distance from spawn to the nearest map edge puts part
  // of itself outside the world, and a node there is a node nobody can reach.
  // Measured against the ACTUAL geometry rather than a remembered one: the note
  // by `RESOURCE_BAND_RADII` still reasons from a 5400-tall world, and it is
  // 12000 now.
  const margin = Math.min(
    PLAYER_SPAWN.x, WORLD_WIDTH - PLAYER_SPAWN.x,
    PLAYER_SPAWN.y, WORLD_HEIGHT - PLAYER_SPAWN.y,
  );
  for (const r of RESOURCE_BAND_RADII) {
    check(`a ring at ${r} fits inside the world`, r < margin, `nearest edge is ${margin} from spawn`);
  }
  let prev = 0;
  for (const r of RESOURCE_BAND_RADII) {
    check(`ring ${r} is outside the one before it`, r > prev, `${prev} -> ${r}`);
    prev = r;
  }
  console.log(`  rings ${RESOURCE_BAND_RADII.join(", ")} inside a margin of ${margin}`);
}

console.log(failures === 0 ? "\nOK — the ground pays, and paying for it is worth it" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
