// WHAT DOES THE NEW GATHERING COST?
//
// M70.227-229 put work on the frame that was not there before: `GatherFx.update`
// runs every frame, and while a gather is live it moves an index range, walks a
// spring for the node recoil, and three times per gather spawns eight to ten
// debris meshes that then integrate a ballistic path each frame until they land.
//
// None of that is obviously expensive and "obviously" is not a measurement. The
// method is `outlinecost.mjs`'s, for its reasons: hooking the work itself
// rather than watching frames, because frame timing needs a focused window and
// a backgrounded Chromium throttles rAF to 1Hz and voids the run.
//
//   node tools/soak/gathercost.mjs Fighter 90
import { open, login, approach } from "./driver.mjs";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Fighter";
const SECONDS = Number(process.argv[3] ?? 90);

const { browser, page } = await open({ headless: true, width: 1000, height: 800 });
await login(page, NAME);

const hooked = await page.evaluate(() => {
  const g = window.__wieldbound;
  const fx = g.gatherFx;
  if (!fx || typeof fx.update !== "function") return false;
  window.__gc = { calls: 0, ms: 0, worst: 0 };
  const orig = fx.update.bind(fx);
  fx.update = () => {
    const t = performance.now();
    orig();
    const d = performance.now() - t;
    window.__gc.calls++;
    window.__gc.ms += d;
    if (d > window.__gc.worst) window.__gc.worst = d;
  };
  return true;
});
if (!hooked) {
  console.log("could not hook GatherFx.update — this run measures nothing");
  await browser.close();
  process.exit(1);
}

// Stand in a node and gather continuously, which is the busy case for this
// path — not travelling, the way the outline probe had to.
const nearest = () => page.evaluate(() => {
  const g = window.__wieldbound;
  let best = null;
  for (const n of g.nodeStates?.values?.() ?? []) {
    if (n.status !== "available") continue;
    const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
    if (!best || d < best.d) best = { x: n.x, y: n.y, d, id: n.id };
  }
  return best;
});
for (let i = 0; i < 80; i++) {
  const at = await nearest();
  if (!at || at.d <= INTERACTION_RANGE_PX * 0.5) break;
  await approach(page, at, 400);
}
// ASK FOR IT. Since M70.230 standing next to a node gathers nothing, so a
// version of this that only walks measures an idle GatherFx and reports it as
// "gathering is free" — which is exactly what the first run of this file did,
// and the guard at the bottom is what caught it.
const parkedNode = await nearest();
if (parkedNode) await page.evaluate((id) => window.__wieldbound.socket.sendGather(id), parkedNode.id);
await page.waitForTimeout(600);
const parked = await page.evaluate(() => ({ id: window.__wieldbound.gatherNodeId }));
await page.evaluate(() => { window.__gc = { calls: 0, ms: 0, worst: 0 }; });

const until = Date.now() + SECONDS * 1000;
let gathers = 0;
let lastNode = null;
while (Date.now() < until) {
  await page.waitForTimeout(250);
  const now = await page.evaluate(() => window.__wieldbound.gatherNodeId);
  if (now && now !== lastNode) gathers++;
  lastNode = now;
  // The order ends when the node is spent and again if anything interrupts, so
  // it has to be re-placed to keep gathering for the length of the run.
  if (!now) {
    const again = await nearest();
    if (again && again.d <= INTERACTION_RANGE_PX) {
      await page.evaluate((id) => window.__wieldbound.socket.sendGather(id), again.id);
    }
  }
}

const r = await page.evaluate(() => ({ ...window.__gc, wood: window.__wieldbound.wallet?.wood }));
await browser.close();

// PROVE IT WAS ACTUALLY GATHERING. Zero gathers is a cheap frame and a
// meaningless number: the whole cost of this path is only paid while a gather
// is live, so a run that never started one measures an idle no-op and reports
// it as "gathering is free".
console.log(`parked at ${parked.id ?? "nothing"}, ${gathers} gather(s) started during the run`);
if (gathers === 0) {
  console.log("!! it never gathered — the figures below are of an idle GatherFx and mean nothing");
}
console.log(`over ${SECONDS}s standing in a node:`);
console.log(`  GatherFx.update ran ${r.calls} times (${(r.calls / SECONDS).toFixed(0)}/s)`);
console.log(`  ${r.ms.toFixed(1)}ms total, ${(r.ms / Math.max(1, r.calls)).toFixed(4)}ms average, ${r.worst.toFixed(2)}ms worst`);
console.log(`  ${(r.ms / SECONDS).toFixed(3)}ms per second of play`);
console.log(
  r.worst > 4
    ? "  a single update took a quarter of a frame — worth looking at"
    : "  no single update comes close to a frame's budget",
);
