// WHAT RUNS DURING THE LOAD'S ONE BIG FRAME, AND NOTHING ELSE.
//
// `loadcpu.mjs` ranks the whole load by self time, which answers "what is the
// load made of" but not "what is the 800ms frame at +1.6s made of" — and those
// have different answers, because the load is ten seconds long and a function
// that is 3% of it can still be 100% of one frame.
//
// Two changes from `loadcpu.mjs`:
//
//   1. Self time is bucketed into 100ms slices, and the timeline is PRINTED.
//      A stall shows up as a run of buckets each holding nearly their full
//      100ms — which is also the check that the profiler's clock and the
//      page's clock agree. If the timeline shows no stall where the frame
//      recorder says one happened, the alignment is wrong and the slice
//      breakdown below it means nothing. That check is the point of printing
//      it: this directory has produced more broken instruments than broken
//      game code, and a breakdown of the wrong 800ms is exactly that failure
//      again.
//
//   2. The busiest contiguous window is picked automatically and broken down
//      on its own, rather than a window chosen by hand from a previous run.
//
//   node tools/soak/loadslice.mjs
import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const BUCKET_MS = 100;

const short = (url) => {
  if (!url) return "(native)";
  const u = url.replace(/^https?:\/\/[^/]+\//, "");
  if (u.includes("node_modules/.vite/deps")) return "three/deps (" + u.split("/").pop().split("?")[0] + ")";
  return u.split("?")[0];
};

const { browser, page } = await open({ headless: false });
await page.addInitScript(() => {
  window.__frames = [];
  let last = 0;
  const tick = (ts) => { if (last > 0) window.__frames.push({ dt: ts - last, at: ts }); last = ts; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
// FOCUSED, because the cross-check depends on it. A Chromium window that is
// not in front throttles requestAnimationFrame to about once a second, and a
// run of this came back with worst frames of 1417/1017/1017/1017ms — the
// throttle, not the game, which makes the one number this script uses to
// validate its own clock alignment worthless.
await page.bringToFront();
const cdp = await page.context().newCDPSession(page);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
await cdp.send("Profiler.start");
const loadMs = await login(page, NAME);
const { profile } = await cdp.send("Profiler.stop");
const frames = await page.evaluate(() => window.__frames);

const byId = new Map();
for (const n of profile.nodes) byId.set(n.id, n);

// Self time per sample, carrying the sample's own timestamp so it can be
// placed on the timeline as well as summed.
const events = [];
let t = profile.startTime;
for (let i = 0; i < profile.samples.length; i++) {
  const dt = profile.timeDeltas[i] ?? 0;
  t += dt;
  if (dt <= 0) continue;
  // IDLE IS NOT WORK. The first version bucketed every sample and the timeline
  // came back reading a flat 100ms of "CPU" in all 138 buckets — because V8
  // samples the idle thread too, and a page waiting on the network is idle at
  // full sampling rate. The breakdown underneath was 98.8% `(idle)`, which is
  // the instrument describing itself rather than the load.
  const node = byId.get(profile.samples[i]);
  if (node && node.callFrame.functionName === "(idle)") continue;
  events.push({ at: (t - profile.startTime) / 1000, us: dt, id: profile.samples[i] });
}

const label = (n) => {
  const f = n.callFrame;
  return `${f.functionName || "(anonymous)"}  —  ${short(f.url)}${f.lineNumber >= 0 && f.url ? ":" + (f.lineNumber + 1) : ""}`;
};

// --- the timeline, so the alignment can be checked before it is trusted -----
const buckets = new Map();
for (const e of events) {
  const b = Math.floor(e.at / BUCKET_MS);
  buckets.set(b, (buckets.get(b) ?? 0) + e.us / 1000);
}
const lastB = Math.max(...buckets.keys());
console.log(`load ${(loadMs / 1000).toFixed(1)}s, ${events.length} samples\n`);
console.log(`busy time per ${BUCKET_MS}ms of the load (# = 10ms of CPU):`);
for (let b = 0; b <= lastB; b++) {
  const ms = buckets.get(b) ?? 0;
  const bar = "#".repeat(Math.round(ms / 10));
  console.log(`  +${((b * BUCKET_MS) / 1000).toFixed(1)}s ${ms.toFixed(0).padStart(4)}ms ${bar}`);
}

const worstFrames = [...frames].sort((a, b) => b.dt - a.dt).slice(0, 4);
console.log("\nthe page's own worst frames, for cross-checking the clocks:");
for (const f of worstFrames) console.log(`  +${(f.at / 1000).toFixed(1)}s  ${f.dt.toFixed(0)}ms`);

// --- the busiest contiguous window ------------------------------------------
const WIN = 8; // 800ms
let best = { from: 0, ms: -1 };
for (let b = 0; b + WIN <= lastB + 1; b++) {
  let ms = 0;
  for (let k = 0; k < WIN; k++) ms += buckets.get(b + k) ?? 0;
  if (ms > best.ms) best = { from: b, ms };
}
const lo = best.from * BUCKET_MS;
const hi = lo + WIN * BUCKET_MS;
console.log(`\nbusiest ${WIN * BUCKET_MS}ms of the load: +${(lo / 1000).toFixed(1)}s to +${(hi / 1000).toFixed(1)}s, ${best.ms.toFixed(0)}ms of CPU in it`);

const selfUs = new Map();
let total = 0;
for (const e of events) {
  if (e.at < lo || e.at >= hi) continue;
  selfUs.set(e.id, (selfUs.get(e.id) ?? 0) + e.us);
  total += e.us;
}
const rows = [...selfUs.entries()].map(([id, us]) => ({ node: byId.get(id), us })).filter((r) => r.node).sort((a, b) => b.us - a.us);
console.log("\n--- what ran in it, by self time ---");
for (const r of rows.slice(0, 18)) {
  const ms = r.us / 1000;
  if (ms < 2) break;
  console.log(`  ${ms.toFixed(0).padStart(5)}ms  ${((ms * 100000) / total).toFixed(1).padStart(5)}%  ${label(r.node)}`);
}
const byFile = new Map();
for (const r of rows) {
  const k = short(r.node.callFrame.url);
  byFile.set(k, (byFile.get(k) ?? 0) + r.us);
}
console.log("\n--- and by file ---");
for (const [k, us] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  const ms = us / 1000;
  if (ms < 4) break;
  console.log(`  ${ms.toFixed(0).padStart(5)}ms  ${((ms * 100000) / total).toFixed(1).padStart(5)}%  ${k}`);
}
console.log("\nconsole errors:", page.__errors.length);
await browser.close();
