// DOES OPENING THE DOOR EARLY COST A FREEZE LATER?
//
// The loading screen compiles all 129 shader programs before the player is let
// in, and 86 of them are for things not on screen: every monster, every effect,
// and the see-through variant of every tree and wall. That tail is ~4.5s of a
// ~10s cold load, and unlike the rest of the load it SCALES — it grows with
// every monster and weapon added, so a much bigger game means a proportionally
// longer wait.
//
// `?deferwarm=1` starts the game before that tail and compiles it behind the
// first frames instead. The obvious win is time-to-play. The obvious risk is
// the thing this codebase spent a dozen milestones removing: a shader compiled
// in the middle of a frame is a visible freeze, and a monster walking into view
// during the first few seconds is exactly when it would happen.
//
// So both are measured, and the second one is measured DURING THE WINDOW WHERE
// THE RISK LIVES — the first half-minute, walking, not standing still.
//
//   node tools/soak/deferwarm.mjs           the current behaviour
//   node tools/soak/deferwarm.mjs --defer   the door opened early
//
// Run each a few times. One load is one sample and shader compilation is at the
// mercy of a driver.
const DEFER = process.argv.includes("--defer");

// THE FLAG HAS TO REACH THE PAGE, and the first version of this file did not
// send it — `--defer` changed the printed heading and nothing else, so both
// arms ran the same code and reported 10.6s against 10.3s. A convincing null
// result produced by an instrument that never applied the treatment.
//
// `login` navigates to the driver's `CLIENT_URL`, which is read at import time,
// so the environment has to be set BEFORE the module is pulled in — hence the
// dynamic import. Static imports are hoisted above everything and would run
// first no matter where the assignment was written.
process.env.WB_CLIENT_URL =
  (process.env.WB_CLIENT_URL ?? "http://localhost:5173") + (DEFER ? "/?deferwarm=1" : "/?deferwarm=0");
const { open, login, step } = await import("./driver.mjs");
const PLAY_MS = 30000;

const INSTALL = () => {
  window.__frames = [];
  window.__hitches = [];
  const warn = console.warn.bind(console);
  console.warn = (...a) => {
    const text = a.map(String).join(" ");
    if (text.includes("[hitch]")) window.__hitches.push({ t: performance.now(), text: text.slice(0, 160) });
    return warn(...a);
  };
  let last = 0;
  const tick = (ts) => {
    if (last > 0) window.__frames.push({ dt: ts - last, at: ts });
    last = ts;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const { browser, page } = await open({ headless: false, width: 1600, height: 900 });
// FOCUSED. An unfocused Chromium throttles rAF to about 1Hz and manufactures
// 1000ms "frames"; a run with those in it measures the window manager.
await page.bringToFront();
await page.addInitScript(INSTALL);

const loadMs = await login(page, process.argv[2]?.startsWith("--") ? "Player3619" : process.argv[2] ?? "Player3619");
const playFrom = await page.evaluate(() => performance.now());

// PROOF THE TREATMENT APPLIED, printed every run.
//
// The phases that finish BEFORE the loading screen lifts are the ones the
// player waits for. In the deferred arm `warmFadedOccluders` and
// `warmWholeScene` must not be among them; if they are, the flag did not take
// and every number below describes the control arm twice. That already
// happened once here, with a tidy 10.6s-versus-10.3s to show for it.
const doorOpen = await page.evaluate(() => ({
  url: location.href,
  phases: (window.__wieldbound.loadPhases ?? []).map((p) => `${p.name.split(":")[0]} ${p.ms.toFixed(0)}ms`),
}));
console.log(`\nurl: ${doorOpen.url}`);
console.log(`phases finished before the door opened: ${doorOpen.phases.join(" | ") || "(none)"}`);
const tailWaited = doorOpen.phases.some((p) => p.startsWith("warmWholeScene"));
if (DEFER && tailWaited) console.log("  !! the tail was still waited on — the flag did NOT take effect");
if (!DEFER && !tailWaited) console.log("  !! the control arm did not wait for the tail — something is wrong");

// WALKING, NOT STANDING. The programs at risk belong to monsters and effects,
// and neither appears if the character never goes anywhere. This is the same
// reason `warmup.mjs` moved from a standing probe to a moving one.
const until = Date.now() + PLAY_MS;
const dirs = [["w"], ["w", "d"], ["d"], ["s", "d"], ["s"], ["s", "a"], ["a"], ["w", "a"]];
let i = 0;
while (Date.now() < until) {
  // RE-FOCUSED EVERY LEG. The launch flags that are supposed to stop rAF
  // throttling do not always hold — a run came back with p50 1016ms and 30
  // frames in thirty seconds, which is a 1Hz window and not a game. Cheap
  // insurance; the void check below still has the last word.
  await page.bringToFront();
  await step(page, dirs[i++ % dirs.length], 900);
}

const frames = await page.evaluate(() => window.__frames);
const hitches = await page.evaluate(() => window.__hitches);
await browser.close();

const play = frames.filter((f) => f.at >= playFrom).map((f) => f.dt);
const sorted = [...play].sort((a, b) => a - b);
const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const throttled = play.filter((f) => f > 900 && f < 1100).length;

// The first ten seconds of play are where a deferred compile would land, so
// they are reported apart from the rest. A run whose damage is spread evenly
// across thirty seconds is a different problem from one that hurts at the start
// and then behaves.
const early = frames.filter((f) => f.at >= playFrom && f.at < playFrom + 10000).map((f) => f.dt);
const late = frames.filter((f) => f.at >= playFrom + 10000).map((f) => f.dt);
const worstOf = (xs) => (xs.length ? Math.max(...xs) : 0);
const overOf = (xs) => xs.filter((f) => f > 50).length;

console.log(
  `\n=== ${DEFER ? "deferwarm=1 — door opened early (THE DEFAULT since M70.197)" : "deferwarm=0 — everything warmed first (the old order)"} ===`,
);
console.log(`time to playable      ${(loadMs / 1000).toFixed(1)}s`);
if (!sorted.length) {
  console.log("no frames after the loading screen — nothing to report");
  process.exit(1);
}
console.log(
  `frames while playing  n=${play.length}  p50 ${at(0.5).toFixed(1)}ms  p95 ${at(0.95).toFixed(1)}  ` +
    `p99 ${at(0.99).toFixed(1)}  max ${sorted[sorted.length - 1].toFixed(0)}  >50ms ${overOf(play)}`,
);
console.log(`  first 10s of play   n=${early.length}  max ${worstOf(early).toFixed(0)}ms  >50ms ${overOf(early)}`);
console.log(`  after that          n=${late.length}  max ${worstOf(late).toFixed(0)}ms  >50ms ${overOf(late)}`);
if (throttled) console.log(`  ${throttled} frames near 1000ms — the window lost focus; treat this run as void`);

const costly = hitches.filter((h) => !h.text.includes("BETWEEN") && h.t >= playFrom);
console.log(`${costly.length} in-play frame-cost hitches`);
for (const h of costly.slice(0, 8)) console.log(`   +${((h.t - playFrom) / 1000).toFixed(1)}s into play  ${h.text}`);
console.log("console errors:", page.__errors.length);
