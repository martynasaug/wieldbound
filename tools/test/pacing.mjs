// FRAME PACING on a display faster than the frame can be drawn.
//
// The reading this exists for: 62.6fps, 15.04ms a frame, zero stutters, and a
// player calling it choppy. Both were true. The missing fact was the monitor —
// 144Hz — and with it the arithmetic is not subtle: a display shows a new image
// only on a refresh boundary, 144Hz puts those 6.94ms apart, and a 15.04ms
// frame lands on the wrong side of two of them and the right side of three,
// alternating. The picture then advances 13.9ms, 20.8ms, 13.9ms, 20.8ms while
// the game clock advances evenly, and the eye reads that unevenness as stutter
// much more readily than it reads a low frame rate.
//
// So the pacer picks a whole number of refreshes per frame and holds it. What
// this file guards is the DECISION, which is easy to get wrong in a way that
// only shows on hardware the author does not have: the first version applied
// its safety margin in both directions and would have demoted a 60Hz machine
// comfortably making 60fps all the way to 30.
//
//   node tools/test/pacing.mjs

import { FramePacer } from "../../client/src/three/pacer.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

/**
 * Runs a machine for a while: a display of `hz`, a frame that costs `costMs`
 * whenever it is actually drawn, and returns where the pacer settles.
 */
function settle(hz, costMs, seconds = 12) {
  const pacer = new FramePacer();
  const refresh = 1000 / hz;
  let ts = 0;
  const frames = Math.round(hz * seconds);
  for (let i = 0; i < frames; i++) {
    ts += refresh;
    if (pacer.onRaf(ts)) pacer.onFrameCost(costMs, ts);
  }
  return pacer;
}

section("1. it measures the display rather than assuming one");
{
  for (const hz of [60, 75, 120, 144, 240]) {
    const p = settle(hz, 4);
    check(`${hz}Hz is detected`, Math.abs(p.refreshHz - hz) < 2, p.refreshHz.toFixed(1));
  }
}

section("2. the case this was built for");
{
  const p = settle(144, 15.04);
  check("a 15ms frame on 144Hz settles on a whole number of refreshes", p.divisor === 3, String(p.divisor));
  check("which is an even 48fps", Math.abs(p.targetFps - 48) < 1, p.targetFps.toFixed(1));
  console.log(`  144Hz, 15.04ms -> 1 frame per ${p.divisor} refreshes = ${p.targetFps.toFixed(0)}fps, evenly`);
}

section("3. and it must not punish anybody else");
{
  // THE REGRESSION THE FIRST VERSION SHIPPED WITH. 15.04ms fits inside a 60Hz
  // budget of 16.67ms — that machine is making its frames and must be left
  // alone. Demoting it to 30fps for missing a safety margin it never needed to
  // meet would have made the game worse for every 60Hz player to help one.
  const sixty = settle(60, 15.04);
  check("a 60Hz machine making its budget is left at full rate", sixty.divisor === 1, String(sixty.divisor));
  check("i.e. 60fps, not 30", Math.abs(sixty.targetFps - 60) < 1, sixty.targetFps.toFixed(1));

  // And one that genuinely cannot should still be paced.
  const slow = settle(60, 20);
  check("a 60Hz machine that misses is paced down", slow.divisor === 2, String(slow.divisor));
}

section("4. a fast machine is not held back");
{
  const p = settle(144, 5.5);
  check("a frame that fits every refresh renders every refresh", p.divisor === 1, String(p.divisor));
  check("all 144 of them", Math.abs(p.targetFps - 144) < 2, p.targetFps.toFixed(1));
}

section("5. the budget is what it claims to be");
{
  // Whatever divisor is chosen, the frame must actually fit inside the time
  // that divisor buys — otherwise the pacing is a lie and the cadence is still
  // uneven, which is the entire problem.
  for (const hz of [60, 144, 240]) {
    for (const cost of [3, 6, 9, 12, 15, 18, 25]) {
      const p = settle(hz, cost);
      const budget = (1000 / hz) * p.divisor;
      check(
        `${hz}Hz / ${cost}ms fits its own budget`,
        cost <= budget || p.divisor === 3,
        `divisor ${p.divisor}, budget ${budget.toFixed(1)}ms`,
      );
      check(`${hz}Hz / ${cost}ms never exceeds the cap`, p.divisor <= 3);
    }
  }
}

section("6. it settles rather than oscillating");
{
  // Right on a boundary is where a naive rule flaps between two divisors
  // forever, which is worse than either of them.
  const refresh = 1000 / 144;
  const p = new FramePacer();
  let ts = 0;
  const seen = new Set();
  for (let i = 0; i < 144 * 20; i++) {
    ts += refresh;
    if (p.onRaf(ts)) {
      p.onFrameCost(refresh * 2 - 0.05, ts); // a hair inside the divisor-2 budget
      if (i > 144 * 10) seen.add(p.divisor);
    }
  }
  check("the divisor stops changing once settled", seen.size === 1, [...seen].join("/"));
}

section("7. a slow game must not be mistaken for a slow display");
{
  // THE SPIRAL. rAF is called on a refresh boundary, and a frame that overruns
  // one is called again at the boundary AFTER it — so a game running at half
  // rate produces two-refresh gaps for most of its samples. Measured as the
  // refresh interval, that reports a 144Hz display as 72Hz; the divisor is then
  // chosen against the halved figure, which lowers the target, which produces
  // longer gaps still. Observed in the wild: a 144Hz machine drawing 13.7ms
  // frames reported "72Hz display, 1 frame per 2 refreshes = 36fps target".
  //
  // Simulated faithfully: the display ticks at a true 144Hz, and a frame that
  // does not fit its budget is delivered at the next boundary that clears it.
  function realistic(hz, costMs, seconds = 14) {
    const pacer = new FramePacer();
    const refresh = 1000 / hz;
    let ts = 0;
    const end = seconds * 1000;
    while (ts < end) {
      // The next boundary, always — this is what the browser actually does.
      ts += refresh;
      if (!pacer.onRaf(ts)) continue;
      pacer.onFrameCost(costMs, ts);
      // The frame overran; boundaries pass while it is being drawn and rAF is
      // not called on them.
      const overrun = Math.max(0, costMs - refresh);
      ts += Math.ceil(overrun / refresh) * refresh;
    }
    return pacer;
  }

  const p = realistic(144, 13.7);
  check(
    "a 144Hz display is still measured as 144Hz while the game runs slowly",
    Math.abs(p.refreshHz - 144) < 12,
    `measured ${p.refreshHz.toFixed(0)}Hz`,
  );
  check(
    "so the target is not halved on top of the slowness",
    p.targetFps > 40,
    `${p.targetFps.toFixed(0)}fps target at divisor ${p.divisor}`,
  );
  console.log(`  144Hz display, 13.7ms frames -> measured ${p.refreshHz.toFixed(0)}Hz, ${p.targetFps.toFixed(0)}fps target`);

  // And the same for a machine that is struggling much harder, where the
  // spiral would have been worst.
  const bad = realistic(144, 26);
  check(
    "even a badly overrunning game does not shrink its own display",
    Math.abs(bad.refreshHz - 144) < 20,
    `measured ${bad.refreshHz.toFixed(0)}Hz`,
  );
  console.log(`  144Hz display, 26ms frames   -> measured ${bad.refreshHz.toFixed(0)}Hz, ${bad.targetFps.toFixed(0)}fps target`);

  const sixty = realistic(60, 14);
  check("a genuine 60Hz display still reads as 60Hz", Math.abs(sixty.refreshHz - 60) < 6, `${sixty.refreshHz.toFixed(0)}Hz`);
}

section("8. one enormous frame must not lower the target for ten seconds");
{
  // Observed: an 11.68ms average frame paced to 48fps when 72 was comfortably
  // in reach, because the cost estimate was an exponential average and the
  // session contained occasional 500-900ms frames (a batch of GPU uploads, a
  // shader compile). One of those drags an EMA up for seconds, and the pacer
  // spends that time pacing to a target the machine does not need.
  //
  // A spike is a stutter to be fixed, not a reason to permanently lower the
  // frame rate.
  const refresh = 1000 / 144;
  const pacer = new FramePacer();
  let ts = 0;
  for (let i = 0; i < 144 * 20; i++) {
    ts += refresh;
    if (!pacer.onRaf(ts)) continue;
    // A comfortable 11.7ms frame, with a 900ms catastrophe every few seconds.
    const cost = i % 700 === 0 ? 900 : 11.7;
    pacer.onFrameCost(cost, ts);
    const overrun = Math.max(0, cost - refresh * pacer.divisor);
    ts += Math.ceil(overrun / refresh) * refresh;
  }
  check(
    "the divisor reflects the typical frame, not the worst one",
    pacer.divisor === 2,
    `divisor ${pacer.divisor} (${pacer.targetFps.toFixed(0)}fps)`,
  );
  console.log(`  11.7ms frames with 900ms spikes -> ${pacer.targetFps.toFixed(0)}fps target`);

  // And a machine that is genuinely and consistently slow must still be paced
  // down — the robustness must not become deafness.
  const slow = new FramePacer();
  let t2 = 0;
  for (let i = 0; i < 144 * 20; i++) {
    t2 += refresh;
    if (!slow.onRaf(t2)) continue;
    slow.onFrameCost(19, t2);
    const overrun = Math.max(0, 19 - refresh * slow.divisor);
    t2 += Math.ceil(overrun / refresh) * refresh;
  }
  check("a consistently slow machine is still paced down", slow.divisor === 3, String(slow.divisor));
}

console.log(
  failures === 0
    ? "\nOK — every frame lasts as long as the one before it"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
