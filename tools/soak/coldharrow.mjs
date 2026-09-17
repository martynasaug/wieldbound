// WHAT COLDHARROW LOOKS LIKE, WHICH NO TEST CAN SAY.
//
//   node tools/soak/coldharrow.mjs [Name]
//
// Phase 71 C is the one part of the plan nothing in `tools/test/` can check. A
// layout test can prove no two footprints overlap and no road runs through a
// wall; it cannot prove the place reads as a northern port rather than as
// Emberhold built larger, and that was the user's one explicit requirement for
// it. So this walks in through the landward gate and photographs it.
//
// It cheats on the distance deliberately. Coldharrow is 8,400px north and this
// is a question about ARCHITECTURE, not about the journey — `kingsway.mjs`
// already walks the road. So: travel to the Pineward Stone, which is the last
// waystone before the wall, and go the rest on foot.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach, unstick } from "./driver.mjs";
import { COLDHARROW, COLDHARROW_GATES } from "../../shared/town.ts";
import { landmarkPosition, LANDMARKS } from "../../shared/landmarks.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Cold${Math.floor(Math.random() * 90000)}`;
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const PINEWARD = LANDMARKS.find((l) => l.id === "pinewardstone");
const centre = COLDHARROW.center;
const at = (radiusPx, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: centre.x + Math.cos(a) * radiusPx, y: centre.y + Math.sin(a) * radiusPx };
};

console.log(
  `Coldharrow: ${COLDHARROW.buildings.length} buildings, ${COLDHARROW_GATES.length} gates, ` +
  `radius ${COLDHARROW.radiusPx}, centred ${PLAYER_SPAWN.y - centre.y}px north\n`,
);

const { browser, page } = await open({ headless: true, width: 1500, height: 940 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(1800);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.42));

const posOf = () =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

const goTo = async (to, label, budget = 420) => {
  let best = Infinity;
  let stalled = 0;
  for (let i = 0; i < budget; i++) {
    const me = await posOf();
    const d = Math.hypot(to.x - me.x, to.y - me.y);
    if (d < 200) return true;
    if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
    if (stalled > 0 && stalled % 14 === 0) await unstick(page, 200);
    await approach(page, to, d > 900 ? 800 : 340);
  }
  console.log(`  !! never reached ${label}`);
  return false;
};

// Straight to the last stone before the wall, then in on foot.
await goTo(landmarkPosition(PINEWARD), PINEWARD.name, 900);
await page.waitForTimeout(600);

const shots = [
  ["approach", at(COLDHARROW.radiusPx + 900, 90), "from the road, outside the wall"],
  ["gate", at(COLDHARROW.radiusPx - 120, 90), "in the Landward Gate"],
  ["works", at(1520, 140), "the Grey Foundry"],
  ["wharf", at(1400, 270), "the Fishmarket, facing the ice"],
  ["commons", at(1480, 20), "the Frozen Bell"],
];

let n = 0;
for (const [id, to, what] of shots) {
  if (!(await goTo(to, what))) continue;
  await page.waitForTimeout(700);
  writeFileSync(`${OUT}/coldharrow-${id}.png`, await page.screenshot());
  const me = await posOf();
  console.log(`  ${id.padEnd(9)} ${what} — ${PLAYER_SPAWN.y - Math.round(me.y)}px north`);
  n++;
}

console.log(`\n  ${n} shots in ${OUT}/coldharrow-*.png`);
if (errors.length) console.log("page errors:", errors.slice(0, 4));
await browser.close();
