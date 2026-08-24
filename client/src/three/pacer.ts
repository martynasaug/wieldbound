// FRAME PACING, which matters more than frame rate on a high-refresh display.
//
// The reading that prompted this: 62.6fps, 15.04ms a frame, zero stutters —
// and the player describing it as choppy. Both were true, and the missing fact
// was the monitor: 144Hz.
//
// A display shows a new image only on a refresh boundary. At 144Hz those come
// every 6.94ms, so a frame that takes 15.04ms is shown for either two
// boundaries (13.9ms) or three (20.8ms), depending on which side of the line it
// lands — and at 15.04ms it lands on BOTH, alternating unpredictably. The
// picture then advances in steps of 13.9, 20.8, 13.9, 20.8ms while the game's
// own clock advances smoothly, and the eye reads that unevenness as stutter far
// more readily than it reads a low frame rate. This is why 62fps on a 144Hz
// screen looks worse than a locked 48fps does.
//
// So the fix is not only to be faster. It is to be CONSISTENT: pick a whole
// number of refreshes per frame and hit it every time. Every frame then lasts
// exactly as long as the one before it, and motion is even.
//
//   divisor 1 -> every refresh      144fps   6.94ms budget
//   divisor 2 -> every 2nd          72fps   13.89ms
//   divisor 3 -> every 3rd          48fps   20.83ms
//
// Choosing the divisor from what the machine can actually sustain is the whole
// job, and it is why this is automatic rather than a setting: the right answer
// depends on the display's refresh rate AND the frame's cost, neither of which
// a player knows or should have to.

/** Never skip more than this many refreshes. Beyond it the input lag of a
 *  keypress waiting for the next rendered frame becomes the worse problem —
 *  at 144Hz, divisor 3 is already 21ms of latency before anything is drawn. */
const MAX_DIVISOR = 3;

/** Fraction of the budget a frame must fit inside to claim a divisor. Leaves
 *  room for the frames that are worse than average — claiming a divisor the
 *  machine can only just meet is how you get the alternating cadence this
 *  exists to remove. */
const HEADROOM = 0.82;

/** How long to watch before changing the divisor, and how long to hold it
 *  afterwards. Pacing that renegotiates every few frames is its own kind of
 *  unevenness. */
const SETTLE_MS = 900;

export class FramePacer {
  /** Measured, not assumed: `screen.refreshRate` does not exist on the web, so
   *  the only way to know is to watch how fast rAF is called. */
  private refreshMs = 0;
  private deltas: number[] = [];
  private lastTs = 0;
  /** Exponential average of what a rendered frame costs. */
  private costMs = 0;
  private decidedAt = 0;
  private tick = 0;

  divisor = 1;

  /** Called on every animation frame, rendered or skipped, with rAF's own
   *  timestamp — which is the refresh time, and is steadier than
   *  `performance.now()` read inside the callback. */
  onRaf(ts: number): boolean {
    if (this.lastTs > 0) {
      const d = ts - this.lastTs;
      // Ignore absurd gaps: a backgrounded tab, a breakpoint, an alt-tab. They
      // are not the refresh rate and would drag the median badly.
      if (d > 1 && d < 100) {
        this.deltas.push(d);
        if (this.deltas.length > 180) this.deltas.shift();
      }
    }
    this.lastTs = ts;

    this.tick++;
    return this.tick % this.divisor === 0;
  }

  /** Called after each RENDERED frame with what it cost. */
  onFrameCost(ms: number, now: number): void {
    this.costMs = this.costMs === 0 ? ms : this.costMs * 0.9 + ms * 0.1;

    if (now - this.decidedAt < SETTLE_MS) return;
    // Not enough evidence about the display yet.
    if (this.deltas.length < 30) return;
    this.decidedAt = now;

    // The MEDIAN gap, not the mean. A handful of long frames while the world
    // loads would pull a mean toward them and convince this that the monitor is
    // 40Hz; the median ignores them.
    const sorted = [...this.deltas].sort((a, b) => a - b);
    // The loop is rescheduled on EVERY refresh whatever the divisor — only the
    // body is skipped — so these gaps are the real refresh interval and must
    // not be divided by anything.
    this.refreshMs = sorted[sorted.length >> 1];

    // STEP UP ONLY WHEN THE BUDGET IS GENUINELY MISSED, and step down with
    // headroom. Applying the headroom in both directions was wrong in a way
    // that only showed up when the rule was run against other machines: a 60Hz
    // display at 15.04ms fits inside its 16.67ms budget and was being demoted
    // to 30fps for missing an 82% margin it never needed to meet. Missing the
    // budget is a fact — the frame does not appear — while the margin is only a
    // guard against oscillating, and a guard belongs on the reversible half.
    let want = this.divisor;
    if (this.costMs > this.refreshMs * this.divisor && this.divisor < MAX_DIVISOR) {
      want = this.divisor + 1;
    } else if (this.divisor > 1 && this.costMs < this.refreshMs * (this.divisor - 1) * HEADROOM) {
      want = this.divisor - 1;
    }
    if (want !== this.divisor) {
      this.divisor = want;
      this.tick = 0;
    }
  }

  /** For the profiler's readout. */
  get refreshHz(): number {
    return this.refreshMs > 0 ? 1000 / this.refreshMs : 0;
  }

  get targetFps(): number {
    return this.refreshMs > 0 ? 1000 / (this.refreshMs * this.divisor) : 0;
  }
}
