// FRAME TIMING WHILE ACTUALLY PLAYING, with hitches attributed.
//
// THE MEASUREMENT PROBLEM THIS HAS TO SOLVE FIRST. Neither obvious browser mode
// gives an honest frame time:
//
//   headless  -> SwiftShader. CPU rasterisation, no KHR_parallel_shader_compile.
//                Frame cost is dominated by software rendering and says nothing
//                about the player's GPU.
//   headed    -> Chromium throttles a backgrounded or occluded window to about
//                1fps, which manufactures fake ~1000ms "hitches". A previous
//                session chased one of those as far as blaming a network
//                handler that took 8ms.
//
// The throttle, though, is switchable: `--disable-renderer-backgrounding`,
// `--disable-backgrounding-occluded-windows` and
// `--disable-background-timer-throttling` exist precisely to turn it off, and
// `driver.mjs` passes all three. So headed-with-those-flags is worth measuring
// rather than assuming, and this script SAYS WHICH IT GOT: if the frame
// distribution comes back centred near a multiple of the refresh interval the
// numbers mean something, and if it comes back centred near 1000ms the run is
// throttled and must be thrown away rather than interpreted.
//
// Hitch attribution comes from the game's own profiler, which logs `[hitch]`
// lines naming the worst section during the stutter. Those are captured here
// rather than inferred.

import { open, login, probe, hotbarKeys, step, nearestMonster, keysToward } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const MINUTES = Number(process.argv[3] ?? 6);
const HEADLESS = process.argv[4] === "headless";

const SPAWN = { x: 8000, y: 6000 };
const CAMPS = [
  [1320, 0], [1600, 45], [1900, 100], [1600, 135], [2000, 160],
  [1320, 180], [1900, 200], [1600, 225], [2450, 250], [1900, 280], [1600, 315],
].map(([r, deg]) => {
  const a = (deg * Math.PI) / 180;
  return { x: SPAWN.x + Math.cos(a) * r, y: SPAWN.y + Math.sin(a) * r, r, deg };
});

/** Records every frame interval in the page, where the clock is honest. */
const INSTALL = () => {
  window.__frames = [];
  let last = 0;
  const tick = (ts) => {
    if (last > 0) window.__frames.push(ts - last);
    last = ts;
    if (window.__frames.length > 200000) window.__frames.shift();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const me = (page) =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

const run = async () => {
  const { browser, page } = await open({ headless: HEADLESS });
  const hitches = [];
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[hitch]")) hitches.push(t.slice(0, 220));
  });

  const loadMs = await login(page, NAME);
  console.log(`mode=${HEADLESS ? "headless (SwiftShader)" : "headed"}  load ${(loadMs / 1000).toFixed(1)}s`);
  await page.evaluate(INSTALL);
  const keys = await hotbarKeys(page);

  const t0 = Date.now();
  const endAt = t0 + MINUTES * 60000;
  let i = 0;
  let swings = 0;
  while (Date.now() < endAt) {
    const wp = CAMPS[i++ % CAMPS.length];
    const until = Date.now() + 22000;
    let sign = 1;
    // Walk to the camp, sliding along anything solid.
    while (Date.now() < until) {
      const p = await me(page);
      if (Math.hypot(wp.x - p.x, wp.y - p.y) < 260) break;
      const dirs = keysToward(p, wp);
      const r = await step(page, dirs, 650);
      if (r.moved < 25) {
        const perp = dirs.includes("w") || dirs.includes("s") ? [sign > 0 ? "d" : "a"] : [sign > 0 ? "s" : "w"];
        await step(page, perp, 900);
        sign = -sign;
      }
    }
    // Fight here, moving.
    const fightUntil = Date.now() + 22000;
    while (Date.now() < fightUntil) {
      const t = await nearestMonster(page);
      if (t && t.d > 240) {
        const p = await me(page);
        await step(page, keysToward(p, t), 600);
        continue;
      }
      swings++;
      const strafe = step(page, [swings % 2 ? "a" : "d"], 800);
      for (const k of keys) {
        await page.keyboard.press(k);
        await page.waitForTimeout(80);
      }
      await strafe;
    }
  }

  const frames = await page.evaluate(() => window.__frames);
  const p = await probe(page);
  const sorted = [...frames].sort((a, b) => a - b);
  const over = (n) => frames.filter((f) => f > n).length;
  const median = pct(sorted, 0.5);

  console.log(`\nframes=${frames.length} over ${((Date.now() - t0) / 60000).toFixed(1)}m, swings=${swings}`);
  console.log(
    `p50=${median.toFixed(1)}ms  p95=${pct(sorted, 0.95).toFixed(1)}  p99=${pct(sorted, 0.99).toFixed(1)}  ` +
      `max=${sorted[sorted.length - 1].toFixed(0)}`,
  );
  console.log(
    `>33ms ${over(33)}  >50ms ${over(50)}  >100ms ${over(100)}  >250ms ${over(250)}  ` +
      `(${((over(50) / frames.length) * 100).toFixed(2)}% of frames over 50ms)`,
  );
  // THE VALIDITY CHECK, AND IT CANNOT BE THE MEDIAN.
  //
  // The first version of this checked `p50 > 200ms` and passed a run that was
  // thoroughly throttled: p50 was a healthy 16.7ms while p95 and p99 were both
  // 1016ms. Chromium does not throttle steadily, it throttles in BURSTS, so the
  // median stays perfect and the tail is entirely fabricated. The give-away is
  // that the distribution is bimodal with nothing in between — that run had
  // exactly 179 frames over 33ms, over 50ms, over 100ms AND over 250ms, which
  // is one cluster at a second and not a spread of real stutters.
  //
  // So look for the cluster itself. A backgrounded renderer ticks at about 1Hz;
  // real stutters do not land in a tight band around exactly 1000ms.
  const throttled = frames.filter((f) => f > 900 && f < 1100).length;
  const throttleShare = throttled / frames.length;
  if (throttleShare > 0.005) {
    console.log(
      `\n*** THROTTLED RUN — ${throttled} frames (${(throttleShare * 100).toFixed(1)}%) sit in a tight ` +
        `band around 1000ms. That is Chromium idling a backgrounded window, not the game stuttering.`,
    );
    console.log("*** The rAF-interval numbers above are void. The `Nms frame` hitches below are still good:");
    console.log("*** frame COST is measured inside the game and the throttle does not touch it.");
  } else {
    console.log(`\nmedian ${median.toFixed(1)}ms => ${(1000 / median).toFixed(0)}fps sustained. Numbers are usable.`);
  }

  // TWO KINDS OF HITCH, AND ONLY ONE SURVIVES A THROTTLED RUN. The profiler says
  // which it is: "Nms frame" timed the work inside a frame, while "Nms BETWEEN
  // frames" timed a gap in scheduling — and a gap is exactly what throttling
  // manufactures. A previous session chased one of those as far as blaming
  // `net:STATE_SNAPSHOT`, whose handler took 8ms.
  const costHitches = hitches.filter((h) => !h.includes("BETWEEN"));
  const gapHitches = hitches.filter((h) => h.includes("BETWEEN"));
  console.log(`\nreal frame-cost hitches: ${costHitches.length}   scheduling gaps: ${gapHitches.length}`);
  for (const h of costHitches.slice(0, 25)) console.log("  ", h);
  console.log("\nfinal:", JSON.stringify(p));
  console.log("console errors:", page.__errors.length);
  for (const e of page.__errors.slice(0, 5)) console.log("  ", e);
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
