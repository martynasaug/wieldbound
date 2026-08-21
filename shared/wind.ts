// The wind.
//
// Everything in this world has been standing perfectly still since Phase 47.
// Fifty-three thousand plants, eleven hundred trees, a treeline round the whole
// map, and not one of them has ever moved — which is the single loudest thing
// left saying "this is a diorama" rather than "this is outdoors". A day passes
// overhead, a river runs, torches flicker, and the grass under all of it is
// frozen.
//
// DERIVED, NOT SENT, exactly as the hour is. The reasoning is the same and it
// is worth restating rather than assumed: wind drives colour and motion and
// nothing the server resolves, so a message carrying it would be a message that
// can arrive late, be missed, or drift between two people standing in the same
// field. Computing it from wall-clock time means every client agrees by
// construction and the protocol did not have to grow a field. It lives in
// `shared/` for the same reason `dayNight` does — the moment anything in the
// simulation wants it (an arrow that drifts, a fire that spreads downwind) it
// has to be the same wind the grass is bending in.
//
// THE PERIODS ARE DELIBERATELY INCOMMENSURATE with each other and with the
// 24-minute day. Wind that gusted on a whole fraction of the day would arrive
// at the same strength at the same hour forever, which is the one thing that
// would make it read as an animation loop instead of as weather.

/** How long the slow swell takes to come round. Just over three minutes. */
const SWELL_MS = 191_000;
/** And the gust riding on it. Under a minute, and not a divisor of the swell. */
const GUST_MS = 43_700;
/** How long the wind takes to box the compass once. Not a divisor of the day. */
const VEER_MS = 37 * 60 * 1000 + 11_000;

/**
 * How hard it can blow, as a multiplier on every sway amplitude in the client.
 *
 * The floor is not zero and that is a choice: dead calm reads as the animation
 * having stopped, which is worse than no animation at all because the player
 * has just watched it work. Air is never actually still outdoors.
 */
export const WIND_MIN = 0.34;
export const WIND_MAX = 1.0;
const WIND_RANGE = WIND_MAX - WIND_MIN;

// --- Why the phase wraps, and why it wraps THERE ------------------------------
//
// The phase is handed to a shader, and a shader uniform is a **float32**. A
// phase built straight out of `Date.now()` is about 2.9 billion, and float32
// spacing at 2.9 billion is 256 — so every value between one representable
// number and the next collapses onto the same one, and the wind does not move
// at all for several minutes and then jumps a hundred and sixty radians. That
// is not a rounding nicety: it is the difference between grass that sways and
// grass that occasionally teleports, and it is invisible in a screenshot.
//
// So the phase wraps. A naive wrap would put a whole-field snap at the wrap,
// which is worse than the problem — so it wraps at a value chosen to make every
// sine come out exactly where it started:
//
//   the shader computes sin(phase * rate * LEAN) and sin(phase * rate * FLUTTER)
//
// If every `rate` is a multiple of RATE_STEP and FLUTTER is a whole multiple of
// LEAN, then wrapping the phase at 2*PI / (RATE_STEP * LEAN) advances every one
// of those arguments by a whole number of turns. The wrap is not smoothed over
// or hidden; it is exact.
//
// The client snaps every rate to RATE_STEP on the way in rather than trusting
// the tables, because "all the sway rates happen to be multiples of 0.05" is
// precisely the kind of invariant that is true until somebody types 1.33.

/** Sway rates are snapped to this. */
export const SWAY_RATE_STEP = 0.05;
/** The shader's slow term, as a multiple of phase * rate. */
export const SWAY_LEAN_MUL = 0.42;
/** And its fast one — a WHOLE multiple of the slow one, which the wrap needs. */
export const SWAY_FLUTTER_MUL = SWAY_LEAN_MUL * 4;
/** Where the phase comes back round to itself, in the phase's own units. */
export const WIND_PHASE_WRAP = (Math.PI * 2) / (SWAY_RATE_STEP * SWAY_LEAN_MUL);

export interface Wind {
  /** Where it is blowing TO, as a bearing in the same degrees everything else
   *  in this project uses: 0 is +x, 90 is +y. */
  bearingDeg: number;
  /** WIND_MIN..WIND_MAX. */
  strength: number;
  /**
   * The sway phase, wrapped into 0..WIND_PHASE_WRAP.
   *
   * Derived rather than accumulated, because a renderer that integrates `dt`
   * drifts: a tab backgrounded for ten minutes comes back ten minutes behind
   * everybody else, and two players standing in the same grass would see it
   * moving differently. And wrapped rather than rising, because it ends up in a
   * float32 — see the note above.
   */
  phase: number;
}

/**
 * The wind right now.
 *
 * Three terms, none of them random. A random walk is what everybody reaches for
 * and it is wrong here for the same reason it was wrong for the forge fire in
 * Phase 49: real gusting varies SMOOTHLY, and noise reads as a fault rather
 * than as weather. Two sines at unrelated periods never settle into an obvious
 * loop and cost two multiplies.
 */
export function windAt(nowMs: number = Date.now()): Wind {
  const swell = Math.sin((nowMs / SWELL_MS) * Math.PI * 2);
  const gust = Math.sin((nowMs / GUST_MS) * Math.PI * 2 + 1.7);
  // Weighted toward the swell, so the strength has a shape over minutes and the
  // gust is what breaks it up. Both folded into 0..1 before the range is
  // applied, so the floor and ceiling mean what they say.
  const t = (swell * 0.62 + gust * 0.38) * 0.5 + 0.5;
  return {
    // Veering ONE WAY rather than oscillating. A wind that swung back and forth
    // between two bearings would look like something being waved; weather turns
    // through the compass and comes back round.
    bearingDeg: ((nowMs / VEER_MS) * 360) % 360,
    strength: WIND_MIN + WIND_RANGE * t,
    phase: (((nowMs / 1000) * 1.6) % WIND_PHASE_WRAP + WIND_PHASE_WRAP) % WIND_PHASE_WRAP,
  };
}

/** The wind as a unit vector in the XY plane the simulation is written in. */
export function windVector(nowMs: number = Date.now()): { x: number; y: number; strength: number } {
  const w = windAt(nowMs);
  const a = (w.bearingDeg * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a), strength: w.strength };
}
