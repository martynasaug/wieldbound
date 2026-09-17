// WALK THROUGH COLDHARROW AND PHOTOGRAPH THE WHOLE WAY.
//
//   node tools/soak/coldwalk.mjs [Name]
//
// `coldharrow.mjs` takes posed shots at named places, and posing is exactly
// what kept going wrong with it: the camera follows the player's heading, so
// every framing decision is really a decision about which way they were walking
// when the shutter went. Three runs came back as empty grass.
//
// A traverse does not have that problem. Walk one straight line from the
// Landward Gate to the quays — through the gate, across the paving, past the
// Works and out onto the harbour — and photograph every step of it. Whatever
// the city looks like, some of these frames have it in them.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach, unstick } from "./driver.mjs";
import { COLDHARROW } from "../../shared/town.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Cold3498";
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const c = COLDHARROW.center;
const at = (r, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
};

const { browser, page } = await open({ headless: true, width: 1500, height: 940 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(1800);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.42));

const posOf = () =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

await page.evaluate(() => {
  const g = window.__wieldbound;
  if (g.travelPanel?.knows?.("pinewardstone")) g.socket.sendTravelTo("pinewardstone");
});
await page.waitForTimeout(1400);

// The line: outside the gate, through the middle, out to the quays.
const start = at(COLDHARROW.radiusPx + 500, 90);
const end = at(COLDHARROW.radiusPx - 300, 270);

let shot = 0;
let stalled = 0;
let best = Infinity;
// Walk to the start first.
for (let i = 0; i < 400; i++) {
  const me = await posOf();
  const d = Math.hypot(start.x - me.x, start.y - me.y);
  if (d < 220) break;
  if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
  if (stalled > 0 && stalled % 14 === 0) await unstick(page, 200);
  await approach(page, start, d > 900 ? 800 : 340);
}
console.log("at the gate approach; crossing the city\n");

best = Infinity;
stalled = 0;
let lastShotAt = null;
for (let i = 0; i < 700; i++) {
  const me = await posOf();
  const d = Math.hypot(end.x - me.x, end.y - me.y);
  if (d < 240) break;
  if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
  if (stalled > 0 && stalled % 14 === 0) await unstick(page, 200);

  // A frame every 420px of ground covered, so the set is evenly spaced along
  // the walk rather than evenly spaced in time — a bot stuck on a wall would
  // otherwise fill the folder with the same picture.
  if (!lastShotAt || Math.hypot(me.x - lastShotAt.x, me.y - lastShotAt.y) > 420) {
    lastShotAt = me;
    const north = Math.round(PLAYER_SPAWN.y - me.y);
    const fromCentre = Math.round(Math.hypot(me.x - c.x, me.y - c.y));
    writeFileSync(`${OUT}/coldwalk-${String(shot).padStart(2, "0")}.png`, await page.screenshot());
    console.log(`  ${String(shot).padStart(2, "0")}  ${north}px north, ${fromCentre}px from the middle`);
    shot++;
  }
  await approach(page, end, 340);
}

console.log(`\n  ${shot} frames in ${OUT}/coldwalk-*.png`);
if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
