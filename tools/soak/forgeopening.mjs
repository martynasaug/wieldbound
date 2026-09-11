// THE THIRD THING THE HERALD TELLS YOU TO DO.
//
// "Take work from Cabel and Marda... gather the rest yourself... THEN STAND AT
// THE ANVIL AND FORGE SOMETHING." The first two steps have been measured to
// death (M70.233). The third had never been exercised at all: `guidedopening`
// buys from the shop and stops, so the anvil — the thing the whole material
// economy feeds — had never been opened, let alone used, by a new character in
// any harness.
//
// This walks a character that has never logged in to the workbench and makes
// something, reporting what it cost, what arrived, and whether it beats what
// they walked in with.
//
// IT FORGES THROUGH `sendForgeItem` RATHER THAN BY CLICKING THE PANEL, and that
// is a deliberate narrowing. Driving the DOM here measured the panel, not the
// anvil, and did it badly: `/craft|forge/` matched the TAB BAR, whose text is
// "ForgeRefineReforgeEtchSalvage", so the probe clicked a tab and reported
// "nothing was made" about a working forge. What is worth guarding here is that
// a new character can reach the bench and afford something on their first
// visit — the panel has its own coverage.
//
//   node tools/soak/forgeopening.mjs Forge1
import { open, login, approach } from "./driver.mjs";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";
import { ITEM_BASES, forgeCost } from "../../shared/items.ts";

const NAME = process.argv[2] ?? `Forge${Math.floor(Math.random() * 90000)}`;
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const loadMs = await login(page, NAME);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.5));
await page.waitForTimeout(1200);

const state = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    const w = g.items?.find?.((i) => i.slot === "weapon" && i.equipped);
    return {
      wood: g.wallet?.wood ?? 0,
      ore: g.wallet?.ore ?? 0,
      items: g.items?.length ?? 0,
      weapon: w ? `${w.baseId} (${w.rarity})` : "nothing",
    };
  });

const start = await state();
console.log(
  `${NAME} arrives in ${(loadMs / 1000).toFixed(1)}s with ${start.wood} wood, ${start.ore} ore, ` +
    `holding ${start.weapon}`,
);

const bench = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    for (const [id, s] of g.stationStates ?? []) {
      return { id, x: s.x, y: s.y, d: Math.hypot(s.x - g.playerX, s.y - g.playerY) };
    }
    return null;
  });

// THE CHEAPEST WEAPON A NEW CHARACTER ALREADY KNOWS. Band 1 needs no recipe —
// see `isBasicRecipe` — so this is available on a first visit by design.
const options = Object.values(ITEM_BASES)
  .filter((b) => b.band === 1 && b.slot === "weapon")
  .map((b) => ({ id: b.id, name: b.name, cost: forgeCost(b) }))
  .sort((a, b) => a.cost.wood + a.cost.ore - (b.cost.wood + b.cost.ore));
const pick = options[0];
const affordable = options.filter((o) => o.cost.wood <= start.wood && o.cost.ore <= start.ore);
console.log(
  `  ${options.length} band-1 weapons need no recipe; ${affordable.length} affordable on arrival. ` +
    `Forging ${pick.name} (${pick.cost.wood} wood, ${pick.cost.ore} ore)`,
);

// ASK WHILE YOU ARE STANDING THERE, not after the walk finishes.
//
// Eight-way movement cannot land on a point, so the approach settles into an
// orbit — measured against this bench it touched 29, 31, 32, 33, 34, 36, 38 and
// 39px around a 40px range, but never STAYED inside. A probe that walks first
// and forges second is therefore asking where the last leg happened to stop:
// four runs in a row ended at 43, 41, 33 and 44 and only one forged, which says
// nothing about the anvil.
//
// Holding the keys down and releasing mid-stride was tried and is worse — every
// poll costs a round trip to the page, during which the character keeps moving,
// so it thrashes at a radius set by latency and stopped at 62px three runs
// running. The legged walk is the better instrument; it just has to ACT on the
// iteration that finds itself in range, the way a player clicks when they
// arrive.
let closest = Infinity;
let forged = false;
let at = null;
for (let i = 0; i < 140; i++) {
  at = await bench();
  if (!at) break;
  closest = Math.min(closest, at.d);
  // TRY THROUGHOUT THE ORBIT, because the SERVER decides range and this
  // distance is the client's estimate of it. A refused attempt is one INFO
  // line and costs nothing, so gating on a number that can disagree with the
  // server only adds a way to miss. Anything inside half again the range is
  // worth an ask.
  if (at.d <= INTERACTION_RANGE_PX * 1.5) {
    await page.evaluate(
      ([sid, bid]) => window.__wieldbound.socket.sendForgeItem(sid, bid),
      [at.id, pick.id],
    );
    await page.waitForTimeout(900);
    const n = await page.evaluate(() => window.__wieldbound.items.length);
    if (n > start.items) { forged = true; break; }
  }
  await approach(page, at, at.d > 200 ? 350 : 90);
}
console.log(`  closest approach ${closest.toFixed(0)}px of ${INTERACTION_RANGE_PX}px range`);
if (!at) {
  console.log("FAIL — no workbench in stationStates");
  await browser.close();
  process.exit(1);
}

const after = await page.evaluate(() => {
  const g = window.__wieldbound;
  return {
    wood: g.wallet.wood,
    ore: g.wallet.ore,
    items: g.items.length,
    // The log line is what the PLAYER is told, and it carries the rarity and
    // affixes the item list does not make obvious.
    log: [...document.querySelectorAll("#combat-log div")].slice(-2).map((e) => e.textContent),
  };
});
console.log(`  materials ${start.wood}/${start.ore} -> ${after.wood}/${after.ore}, items ${start.items} -> ${after.items}`);
console.log(`  log: ${after.log.join(" | ")}`);

const spentRight = start.wood - after.wood === pick.cost.wood && start.ore - after.ore === pick.cost.ore;
if (after.items > start.items && spentRight) {
  console.log("\nOK — a new character can walk to the anvil and make something on arrival");
} else if (after.items > start.items) {
  console.log(`\n!! an item arrived but the cost was wrong (expected ${pick.cost.wood}/${pick.cost.ore})`);
} else {
  console.log("\n!! nothing was forged");
}
await browser.close();
