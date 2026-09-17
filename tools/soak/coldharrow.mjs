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

// TRAVEL to the last stone before the wall, then in on foot. The comment above
// claimed this already and the code walked: five thousand three hundred pixels
// at level one, which spent twenty-two minutes failing to reach the first
// waypoint. `tools/seed.mjs` marks every waystone reached, so run it for this
// character first and the journey is one message.
const travelled = await page.evaluate(() => {
  const g = window.__wieldbound;
  if (!g.travelPanel?.knows?.("pinewardstone")) return false;
  g.socket.sendTravelTo("pinewardstone");
  return true;
});
if (travelled) {
  await page.waitForTimeout(1400);
  console.log(`  travelled to ${PINEWARD.name}`);
} else {
  console.log(`  ${PINEWARD.name} not known — walking (seed the character to skip this)`);
  await goTo(landmarkPosition(PINEWARD), PINEWARD.name, 900);
}
await page.waitForTimeout(600);

// OFF THE ROAD AXIS, every one of them. The first pass put the camera on
// bearing 90 outside the wall and reported empty grass — because bearing 90 IS
// the Landward Gate, twenty-six degrees of opening, so the shot was looking
// straight THROUGH the gap with the masonry off both edges of the frame. And
// every interior point was a building's own centre, where collision pushes you
// out and the camera ends up in the gap between two walls.
//
// These stand where a person would stand to look at the thing being
// photographed: off the axis outside, and in the open spaces inside.
const shots = [
  ["wall", at(COLDHARROW.radiusPx + 620, 62), "the curtain wall from outside"],
  ["towers", at(COLDHARROW.radiusPx + 520, 130), "the west towers"],
  ["gate", at(COLDHARROW.radiusPx + 260, 90), "the Landward Gate from the road"],
  ["works", at(1760, 146), "between the Foundry and the ore stores"],
  ["wharf", at(1120, 270), "the harbour, looking north at the quays"],
  ["commons", at(1240, 24), "the Commons"],
];

let n = 0;
for (const [id, to, what] of shots) {
  if (!(await goTo(to, what))) continue;
  // FACE THE THING. The camera follows the player's heading, and `approach`
  // leaves them pointing wherever the last step went — which for a shot taken
  // on arrival is away from the subject as often as not. Three photographs of
  // "the curtain wall from outside" came back as empty grass for exactly this
  // reason, with the city behind the camera. A short step toward the middle
  // turns them round.
  await approach(page, { x: centre.x, y: centre.y }, 240);
  await page.waitForTimeout(700);
  writeFileSync(`${OUT}/coldharrow-${id}.png`, await page.screenshot());
  const me = await posOf();
  console.log(`  ${id.padEnd(9)} ${what} — ${PLAYER_SPAWN.y - Math.round(me.y)}px north`);
  n++;
}

console.log(`\n  ${n} shots in ${OUT}/coldharrow-*.png`);
if (errors.length) console.log("page errors:", errors.slice(0, 4));
await browser.close();
