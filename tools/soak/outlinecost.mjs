// WHAT DID `refreshOutlines` COST?
//
// M70.219 made the two through-walls passes rebuild whenever GEAR lands, not
// just when the body is built — the fix for a swapped-away weapon leaving its
// ghost behind. That call now runs on every actor that dresses, which includes
// every monster that spawns, and it rebuilds all of that actor's hulls each
// time. Cheap per call or not, it is new work on the busiest path in the game.
//
// Measured by hooking the method rather than by watching frames, deliberately:
// frame timing needs a focused window, and a backgrounded Chromium throttles
// rAF to 1Hz and voids the whole run — which is exactly what happened when this
// was first attempted while the machine was in use. Counting the work itself
// needs no focus and isolates the change instead of the session around it.
//
//   node tools/soak/outlinecost.mjs Fighter 120
import { open, login, step } from "./driver.mjs";

const NAME = process.argv[2] ?? "Fighter";
const SECONDS = Number(process.argv[3] ?? 120);

const { browser, page } = await open({ headless: true, width: 1000, height: 800 });
await login(page, NAME);

const hooked = await page.evaluate(() => {
  const g = window.__wieldbound;
  const proto = Object.getPrototypeOf(g.localActor);
  if (typeof proto.refreshOutlines !== "function") return false;
  window.__outline = { calls: 0, ms: 0, worst: 0 };
  const orig = proto.refreshOutlines;
  proto.refreshOutlines = function patched(...args) {
    const t = performance.now();
    const out = orig.apply(this, args);
    const d = performance.now() - t;
    window.__outline.calls++;
    window.__outline.ms += d;
    if (d > window.__outline.worst) window.__outline.worst = d;
    return out;
  };
  return true;
});
if (!hooked) {
  console.log("could not hook refreshOutlines — this run measures nothing");
  await browser.close();
  process.exit(1);
}

// Travel, so monsters spawn and despawn continuously: that is what makes this
// path busy, far more than the player changing gear.
const dirs = [["w"], ["w", "d"], ["d"], ["s", "d"], ["s"], ["s", "a"], ["a"], ["w", "a"]];
const until = Date.now() + SECONDS * 1000;
let i = 0;
while (Date.now() < until) await step(page, dirs[i++ % dirs.length], 800);

// PROVE THE HOOK IS LIVE. A count of zero is the expected answer here —
// monsters never call `dress`, so only a player changing gear reaches this —
// and it is also exactly what a broken hook returns. One deliberate equip
// separates those two.
const before = await page.evaluate(() => window.__outline.calls);
await page.evaluate(async () => {
  const g = window.__wieldbound;
  const spare = g.items.find((i) => i.slot === "weapon" && !i.equipped);
  if (spare) g.socket.sendEquipItem(spare.id);
  await new Promise((res) => setTimeout(res, 1800));
});
const after = await page.evaluate(() => window.__outline.calls);
console.log(
  `hook check: one equip took the counter ${before} -> ${after}` +
    (after > before ? "" : "   !! HOOK IS DEAD, so the totals below mean nothing"),
);

const r = await page.evaluate(() => ({
  ...window.__outline,
  monsters: window.__wieldbound.monsters.size,
}));
await browser.close();

console.log(`over ${SECONDS}s of travelling, with ${r.monsters} monsters known at the end:`);
console.log(`  refreshOutlines called ${r.calls} times`);
console.log(`  ${r.ms.toFixed(1)}ms total, ${(r.ms / Math.max(1, r.calls)).toFixed(2)}ms average, ${r.worst.toFixed(1)}ms worst`);
console.log(`  ${(r.ms / SECONDS).toFixed(2)}ms per second of play`);
console.log(
  r.worst > 16
    ? "  a single call exceeded a frame — worth splitting or debouncing"
    : "  no single call reaches a frame's budget",
);
