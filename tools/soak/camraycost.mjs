// WHAT DOES THE CAMERA'S WALL CHECK COST, AND WHAT WOULD IT COST WITH THE
// PALISADE IN IT?
//
// `World.clearDistance` casts five rays from points spread over the character
// against `cameraColliders`, every frame. That list is `town.buildings` — the
// houses — and NOT the palisade, which has no object of its own: its boxes go
// into the shared town `Builder` and are merged with everything else. So a
// character standing against the town wall has their legs eaten by it and
// nothing can help, because the wall can neither push the camera out nor fade.
//
// Giving it a group of its own would fix that, and the reason to measure first
// is that a merged RING has a bounding sphere covering the whole town: every
// ray cast inside the walls would fall past the cheap sphere test and into
// per-triangle work, five times a frame, forever.
//
// Hooks the method rather than watching frames, for `outlinecost.mjs`'s reason:
// a backgrounded Chromium throttles rAF to 1Hz and voids any frame measurement.
//
//   node tools/soak/camraycost.mjs Player3619 60
import { open, login, approach } from "./driver.mjs";
import { TOWN_CENTER } from "../../shared/town.ts";

const NAME = process.argv[2] ?? "Player3619";
const SECONDS = Number(process.argv[3] ?? 60);

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);

const hooked = await page.evaluate(() => {
  const g = window.__wieldbound;
  const w = g.world;
  // `clearDistance` is private in TypeScript and an ordinary property at
  // runtime. Wrap it on the instance so the original stays on the prototype.
  const proto = Object.getPrototypeOf(w);
  const original = proto.clearDistance;
  if (typeof original !== "function") return false;
  window.__ray = { calls: 0, total: 0, worst: 0, colliders: 0 };
  w.clearDistance = function (...args) {
    const t0 = performance.now();
    const out = original.apply(this, args);
    const dt = performance.now() - t0;
    window.__ray.calls++;
    window.__ray.total += dt;
    if (dt > window.__ray.worst) window.__ray.worst = dt;
    window.__ray.colliders = this.cameraColliders?.length ?? 0;
    return out;
  };
  return true;
});
if (!hooked) { console.log("could not hook clearDistance"); await browser.close(); process.exit(1); }

// Into town and along the wall, which is the place the question is about.
const wall = { x: TOWN_CENTER.x + 700, y: TOWN_CENTER.y };
for (let i = 0; i < 40; i++) await approach(page, wall, 500);

await page.evaluate(() => { window.__ray.calls = 0; window.__ray.total = 0; window.__ray.worst = 0; });
const until = Date.now() + SECONDS * 1000;
let n = 0;
while (Date.now() < until) {
  // Walk the perimeter, so the rays keep meeting different stretches of wall.
  const a = (n % 24) * 15 * (Math.PI / 180);
  await approach(page, {
    x: TOWN_CENTER.x + Math.cos(a) * 700,
    y: TOWN_CENTER.y + Math.sin(a) * 700,
  }, 700);
  n++;
}

const r = await page.evaluate(() => window.__ray);
const avg = r.calls ? r.total / r.calls : 0;
console.log(`\ncameraColliders: ${r.colliders} object(s)`);
console.log(`clearDistance:   ${r.calls} calls over ${SECONDS}s`);
console.log(`                 ${avg.toFixed(4)}ms average, ${r.worst.toFixed(3)}ms worst`);
console.log(`                 ${(r.total / SECONDS).toFixed(3)}ms per second of play`);
console.log(`                 ${((avg / 6.94) * 100).toFixed(3)}% of a 144Hz frame budget`);
await page.screenshot({ path: "tools/soak/shots/camraycost.png" });
await browser.close();
