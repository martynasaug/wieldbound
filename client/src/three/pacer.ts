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

/**
 * How often to give up one frame purely to measure the display.
 *
 * THE CIRCULARITY THIS BREAKS. rAF is called on a refresh boundary, and a frame
 * that overruns one is called again at the boundary after it — so once the game
 * is slower than the display, EVERY gap is two or three refreshes and there is
 * no honest sample of the refresh interval anywhere in the data. Reading those
 * gaps as the refresh rate reports a 144Hz display as 72Hz, and then the pacer
 * compares the frame cost against a doubled budget, concludes it is comfortably
 * meeting it, and never steps the divisor up. It locks itself at half rate
 * believing everything is fine. That is not a hypothetical: it shipped, and the
 * overlay read "72Hz display, 1 frame per 2 refreshes = 36fps target" on a
 * 144Hz machine.
 *
 * No amount of statistics fixes it, because the information is not in the
 * samples — every one of them is contaminated by the same cause. It has to be
 * OBSERVED: skip one frame, draw nothing, and the browser calls back at the
 * very next boundary. That gap is the refresh interval, measured rather than
 * inferred.
 *
 * Three seconds costs one dropped frame in about four hundred, which is below
 * anything a player can see, and it is the difference between pacing to the
 * real display and pacing to a halved guess.
 */
const PROBE_INTERVAL_MS = 3000;

export class FramePacer {
  /** Measured, not assumed: `screen.refreshRate` does not exist on the web, so
   *  the only way to know is to watch how fast rAF is called. */
  private refreshMs = 0;
  private deltas: number[] = [];
  /**
   * Gaps measured immediately after a deliberately skipped frame, which are the
   * only honest samples of the refresh interval. See `PROBE_INTERVAL_MS`.
   */
  private cleanDeltas: number[] = [];
  private probeArmed = false;
  private probePending = false;
  private lastProbeAt = 0;
  private probeAt = 0;
  private lastTs = 0;
  /** Exponential average of what a rendered frame costs. */
  private costMs = 0;
  private costs: number[] = [];
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

    // The frame after a probe: nothing was drawn last time, so the browser
    // called us again at the very next boundary and this gap IS the refresh
    // interval. These are the only samples that mean anything.
    if (this.probePending) {
      this.probePending = false;
      this.cleanDeltas.push(ts - this.probeAt);
      if (this.cleanDeltas.length > 24) this.cleanDeltas.shift();
    }

    if (ts - this.lastProbeAt >= PROBE_INTERVAL_MS) {
      this.lastProbeAt = ts;
      this.probeArmed = true;
    }
    if (this.probeArmed) {
      this.probeArmed = false;
      this.probePending = true;
      this.probeAt = ts;
      return false;
    }

    this.tick++;
    return this.tick % this.divisor === 0;
  }

  /** Called after each RENDERED frame with what it cost. */
  onFrameCost(ms: number, now: number): void {
    // A ROLLING MEDIAN, NOT A RUNNING AVERAGE.
    //
    // An exponential average is the obvious choice and it is wrong here,
    // because the thing it has to be robust against is exactly what this game
    // produces: occasional enormous frames. A single 919ms render — a batch of
    // GPU uploads, a shader compile — drags an EMA up for ten seconds, and the
    // pacer spends that whole time believing frames cost far more than they do
    // and pacing to a target well below what the machine can hold. It was
    // observed doing precisely that: an 11.68ms average frame paced to 48fps
    // when 72 was comfortably in reach, because the average it was reading was
    // not the average of anything a player experiences.
    //
    // A median ignores the spikes completely, which is right: a spike is a
    // stutter to be FIXED, not a reason to permanently lower the frame rate.
    this.costs.push(ms);
    if (this.costs.length > 90) this.costs.shift();
    const byCost = [...this.costs].sort((a, b) => a - b);
    this.costMs = byCost[byCost.length >> 1];

    if (now - this.decidedAt < SETTLE_MS) return;
    // Not enough evidence about the display yet. Probes arrive every three
    // seconds, so this holds the divisor at 1 for the first few of them —
    // which is the right default: render everything until told otherwise.
    if (this.cleanDeltas.length < 3) return;
    this.decidedAt = now;

    // Only the probe samples. See PROBE_INTERVAL_MS for why the ordinary gaps
    // cannot be used once the game is slower than the display: they are all
    // whole multiples of the refresh and there is no way to tell which multiple
    // from the numbers alone.
    //
    // The lowest quarter of them, not the minimum: a probe can still be
    // lengthened by something outside our control landing on the same frame,
    // and one unlucky sample should not set the display rate for the session.
    const sorted = [...this.cleanDeltas].sort((a, b) => a - b);
    this.refreshMs = sorted[Math.floor(sorted.length * 0.25)];

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
