// WHAT THE FIRST FROST ATTACK IN THE GAME ACTUALLY LOOKS LIKE.
//
//   node tools/soak/frostfight.mjs [Name]
//
// Nothing in the world dealt frost until the troll did, which means the frost
// side of every presentation path — the combat log's wording, the damage
// number, the impact, the resistance actually subtracting — has never once run
// in play. All of it is written and none of it has been seen, which is the
// exact state a screenshot is for.
//
// Walks out to the frost troll, fights it, and reports the lines the log
// produced plus a burst of frames.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach, unstick, hotbarKeys } from "./driver.mjs";
import { MONSTER_LABELS, PLAYER_SPAWN, MONSTER_STATS, schoolDef } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Trait20463";
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

// Where the troll camp stands. The server lays camps out as a radius and an
// angle from spawn, so this is that arithmetic rather than a second table.
const a = (190 * Math.PI) / 180;
const TO = { x: PLAYER_SPAWN.x + Math.cos(a) * 2350, y: PLAYER_SPAWN.y + Math.sin(a) * 2350 };

console.log(
  `${MONSTER_LABELS.troll} throws ${MONSTER_STATS.troll.attackSchool} ` +
  `(${schoolDef(MONSTER_STATS.troll.attackSchool).color}), verb "${schoolDef(MONSTER_STATS.troll.attackSchool).verb}"\n`,
);

const { browser, page } = await open({ headless: true, width: 1400, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.45));

let best = Infinity;
let stalled = 0;
for (let i = 0; i < 420; i++) {
  const at = await page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));
  const d = Math.hypot(TO.x - at.x, TO.y - at.y);
  if (d < 260) break;
  if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
  if (stalled > 0 && stalled % 12 === 0) await unstick(page, 200);
  await approach(page, TO, d > 900 ? 900 : 350);
}

const found = await page.evaluate(() => {
  const g = window.__wieldbound;
  for (const [id, v] of g.monsters) {
    if (v.state?.kind === "troll" && v.state?.status === "alive") { g.setTarget(id); return id; }
  }
  return null;
});
if (!found) {
  console.log("INCONCLUSIVE — no frost troll in view");
  await browser.close();
  process.exit(0);
}
console.log("reached the camp, engaging\n");

// Fight it. Swing and cast, and take frames across the whole thing rather than
// at one instant: a fight is four things happening at once and whether that
// reads is not a number.
const keys = await hotbarKeys(page);
let shot = 0;
for (let i = 0; i < 90; i++) {
  const m = await page.evaluate(() => {
    const g = window.__wieldbound;
    const v = g.monsters.get(g.lockedId ?? "");
    return v?.state?.status === "alive"
      ? { d: Math.hypot(v.state.x - g.playerX, v.state.y - g.playerY), hp: v.state.hp }
      : null;
  });
  if (!m) break;
  // The frame comes FIRST and unconditionally. It used to sit after a
  // `continue` that fires whenever the target is out of range, so a fight that
  // opened at distance took none at all and the harness reported zero frames
  // about a fight it had just won.
  if (i % 7 === 0 && shot < 6) {
    writeFileSync(`${OUT}/frostfight-${String(shot++).padStart(2, "0")}.png`, await page.screenshot());
  }
  if (m.d > 70) { await approach(page, TO, 120); continue; }
  await page.keyboard.press(keys[i % Math.min(keys.length, 3)] ?? keys[0]);
  await page.waitForTimeout(320);
}

// Stand in it. The troll has to LAND something or the frost half of the log
// never runs, and a seeded character kills it before it connects.
for (let i = 0; i < 60; i++) {
  const alive = await page.evaluate(() => {
    const g = window.__wieldbound;
    for (const [, v] of g.monsters) {
      if (v.state?.kind === "troll" && v.state?.status === "alive") {
        return Math.hypot(v.state.x - g.playerX, v.state.y - g.playerY);
      }
    }
    return null;
  });
  if (alive === null) break;
  if (alive > 70) await approach(page, TO, 150);
  else await page.waitForTimeout(400);
  const took = await page.evaluate(() =>
    [...document.querySelectorAll("#combat-log div")].some((e) => /Frost Troll (chills|CRITs) you/.test(e.textContent ?? "")));
  if (took) break;
}

// THE WORDS, which are the half a screenshot reads worst. Frost is the sixth
// creature to carry an element and the first anybody will meet often.
const log = await page.evaluate(() =>
  [...document.querySelectorAll("#combat-log div")].slice(-14).map((e) => e.textContent));
console.log("combat log:");
for (const line of log) console.log(`  ${line}`);

const hp = await page.evaluate(() => ({ hp: Math.round(window.__wieldbound.hp), max: window.__wieldbound.maxHp }));
console.log(`\nplayer ${hp.hp}/${hp.max};  ${shot} frames in ${OUT}/frostfight-*.png`);
if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
