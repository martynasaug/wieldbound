// Checks the wind field.
//
// It is fourteen lines of arithmetic and it drives every blade of grass in the
// world, which is exactly the combination that goes wrong quietly. The failure
// modes are all things you would never catch by looking at one frame:
//
//   * a period that divides the day, so the field arrives at the same strength
//     at the same hour forever and the whole thing reads as a loop;
//   * a strength that touches zero, which reads as the animation having broken
//     rather than as calm;
//   * a direction that jumps, which snaps fifty thousand plants across at once;
//   * a phase that is not monotonic, which makes the grass run backwards.
//
//   node tools/test/wind.mjs

import { DAY_LENGTH_MS } from "../../shared/protocol-types.ts";
import {
  WIND_MIN,
  WIND_MAX,
  WIND_PHASE_WRAP,
  SWAY_RATE_STEP,
  SWAY_LEAN_MUL,
  SWAY_FLUTTER_MUL,
  windAt,
  windVector,
} from "../../shared/wind.ts";
import { readFileSync } from "node:fs";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n== ${name} ==`);

// A fixed epoch, so a failure is reproducible rather than a thing that happened
// at four in the afternoon.
const T0 = 1_700_000_000_000;

section("strength");
{
  let min = Infinity;
  let max = -Infinity;
  // Twelve hours at a one-second stride: long enough to see the slow swell come
  // round many times and every phase relationship between the two terms.
  for (let t = 0; t < 12 * 60 * 60 * 1000; t += 1000) {
    const s = windAt(T0 + t).strength;
    if (s < min) min = s;
    if (s > max) max = s;
  }
  if (min < WIND_MIN - 1e-9) fail(`strength drops to ${min.toFixed(3)}, below the ${WIND_MIN} floor`);
  if (max > WIND_MAX + 1e-9) fail(`strength reaches ${max.toFixed(3)}, above the ${WIND_MAX} ceiling`);
  // The floor exists because dead calm reads as the animation having stopped.
  // A floor that is never approached is a floor that is not doing anything, and
  // a field that never reaches its ceiling has no gusts in it.
  if (min > WIND_MIN + 0.05) fail(`the calmest it ever gets is ${min.toFixed(3)} — the floor is unused`);
  if (max < WIND_MAX - 0.05) fail(`the hardest it ever blows is ${max.toFixed(3)} — it never gusts`);
  console.log(`  ranges ${min.toFixed(3)} to ${max.toFixed(3)} over twelve hours`);

  // Smooth. A step between two consecutive frames is a gust that arrives as a
  // jolt across the whole field at once.
  let worst = 0;
  for (let t = 0; t < 60 * 60 * 1000; t += 16) {
    const a = windAt(T0 + t).strength;
    const b = windAt(T0 + t + 16).strength;
    worst = Math.max(worst, Math.abs(b - a));
  }
  if (worst > 0.01) fail(`strength moves ${worst.toFixed(4)} in one frame — that is a jolt`);
  else console.log(`  never moves more than ${worst.toFixed(5)} in a frame`);
}

section("it is not a loop");
{
  // The one property that separates weather from an animation: the wind at a
  // given time of day must not be the wind at that time of day tomorrow.
  //
  // Checked by SAMPLING rather than by asserting a ratio, because "the periods
  // are not commensurate with the day" is a claim about what the field DOES and
  // a ratio is a claim about how it happens to be written.
  let sameAsYesterday = 0;
  let samples = 0;
  for (let k = 0; k < 400; k++) {
    const t = T0 + k * 137_000;
    const a = windAt(t).strength;
    const b = windAt(t + DAY_LENGTH_MS).strength;
    samples++;
    if (Math.abs(a - b) < 0.02) sameAsYesterday++;
  }
  const pct = (100 * sameAsYesterday) / samples;
  if (pct > 20) fail(`${pct.toFixed(0)}% of the time the wind repeats a day later — it is on the clock`);
  else console.log(`  only ${pct.toFixed(0)}% of samples repeat one game-day later`);
}

section("direction");
{
  // Veers one way and comes back round, rather than swinging between two
  // bearings. Measured as: over a long run every quadrant of the compass is
  // visited, and no single frame turns it more than a hair.
  const quadrants = new Set();
  let worstTurn = 0;
  let prev = windAt(T0).bearingDeg;
  for (let t = 0; t < 90 * 60 * 1000; t += 200) {
    const b = windAt(T0 + t).bearingDeg;
    quadrants.add(Math.floor(b / 90));
    // Shortest signed difference, so the wrap from 359 to 0 is not a 359-degree
    // turn. Getting this wrong is how a test like this reports a false alarm
    // exactly once per revolution.
    const turn = Math.abs(((b - prev + 540) % 360) - 180);
    worstTurn = Math.max(worstTurn, turn);
    prev = b;
  }
  if (quadrants.size < 4) fail(`only ${quadrants.size} quadrants of the compass are ever used`);
  else console.log("  boxes the compass");
  if (worstTurn > 1) fail(`the direction turns ${worstTurn.toFixed(2)} degrees between samples`);
  else console.log(`  turns at most ${worstTurn.toFixed(3)} degrees per 200ms`);

  // And the vector agrees with the bearing it came from, in the same degrees
  // the rest of the project uses: 0 is +x, 90 is +y.
  for (const t of [T0, T0 + 999_000, T0 + 5_000_000]) {
    const w = windAt(t);
    const v = windVector(t);
    const a = (w.bearingDeg * Math.PI) / 180;
    if (Math.abs(v.x - Math.cos(a)) > 1e-9 || Math.abs(v.y - Math.sin(a)) > 1e-9) {
      fail("windVector does not match the bearing windAt reports");
    }
    if (Math.abs(Math.hypot(v.x, v.y) - 1) > 1e-9) fail("windVector is not a unit vector");
  }
  console.log("  the vector and the bearing are the same wind");
}

section("phase");
{
  // Rising, EXCEPT at the wrap — and every drop has to be exactly one wrap, or
  // it is not the wrap, it is a bug. Checking "strictly monotonic" would have
  // been the obvious assertion and it would now be wrong: the phase is bounded
  // on purpose, and a test that forbade the bound would forbid the fix.
  let steps = 0;
  let wraps = 0;
  let backwards = 0;
  for (let t = 0; t < 60 * 60 * 1000; t += 500) {
    const a = windAt(T0 + t).phase;
    const b = windAt(T0 + t + 500).phase;
    steps++;
    if (b > a) continue;
    // A wrap: the drop must be the wrap minus however much it advanced.
    const advance = b - a + WIND_PHASE_WRAP;
    if (Math.abs(advance - 0.8) > 1e-6) backwards++;
    else wraps++;
  }
  if (backwards > 0) fail(`the phase goes backwards at ${backwards} points that are not the wrap`);
  else console.log(`  rises over ${steps} steps and wraps cleanly ${wraps} times an hour`);

  if (windAt(T0).phase !== windAt(T0).phase) fail("the phase is not deterministic");
  // 1.6 phase-units a second, so ten seconds is sixteen — modulo the wrap.
  const raw = windAt(T0 + 10_000).phase - windAt(T0).phase;
  const gap = ((raw % WIND_PHASE_WRAP) + WIND_PHASE_WRAP) % WIND_PHASE_WRAP;
  if (Math.abs(gap - 16) > 1e-6) fail(`ten seconds moves the phase by ${gap}, not 16`);
  else console.log("  and is a pure function of the clock, so two clients cannot drift");
}

section("the phase fits in a float32");
{
  // THE BUG THIS SECTION EXISTS FOR. The phase goes to a shader uniform, which
  // is a float32. Built straight out of Date.now() it is about 2.9 billion, and
  // float32 spacing at 2.9 billion is 256 — so the wind stood still for minutes
  // and then jumped a hundred and sixty radians. Nothing about a screenshot
  // shows that; what showed was "the grass moves and the trees do not", which
  // is a completely different-looking symptom.
  let biggest = 0;
  for (let t = 0; t < 6 * 60 * 60 * 1000; t += 7919) {
    biggest = Math.max(biggest, windAt(T0 + t).phase);
  }
  if (biggest > WIND_PHASE_WRAP + 1e-9) fail(`the phase reaches ${biggest}, past its own wrap`);
  // The real assertion: at the largest value it takes, one frame of elapsed
  // time has to survive the round trip through a float32.
  const step = Math.fround(biggest + 0.016) - Math.fround(biggest);
  if (step < 0.008) fail(`at ${biggest.toFixed(1)} a frame of phase rounds away in float32`);
  else console.log(`  tops out at ${biggest.toFixed(1)}, where a frame still resolves`);

  // And the wrap is SEAMLESS rather than merely small: advancing by a whole
  // wrap has to be a whole number of turns for every rate the client may use,
  // or there is a field-wide snap every five minutes.
  let rough = 0;
  for (let k = 1; k <= 60; k++) {
    const rate = k * SWAY_RATE_STEP;
    for (const mul of [SWAY_LEAN_MUL, SWAY_FLUTTER_MUL]) {
      const turns = (WIND_PHASE_WRAP * rate * mul) / (Math.PI * 2);
      if (Math.abs(turns - Math.round(turns)) > 1e-9) rough++;
    }
  }
  if (rough > 0) fail(`${rough} rate/frequency pairs do not come back round at the wrap`);
  else console.log("  and comes back to itself exactly, for every legal rate");

  // The flutter has to stay a WHOLE multiple of the lean, which is what makes
  // the line above possible at all.
  const ratio = SWAY_FLUTTER_MUL / SWAY_LEAN_MUL;
  if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
    fail(`the flutter is ${ratio}x the lean — it has to be a whole multiple`);
  }
}

section("every authored sway rate is legal");
{
  // The client snaps rates on the way into the shader, so an illegal one cannot
  // break the wrap — but a snapped rate is not the rate somebody typed, and a
  // species quietly swaying at 1.35 when its table says 1.33 is a table that
  // has stopped describing the game. Read out of the real files, the same way
  // the forest test reads the model lists.
  const sources = [
    "../../client/src/three/scatter.ts",
    "../../client/src/three/forest.ts",
    "../../client/src/three/World.ts",
  ];
  let checked = 0;
  let off = 0;
  for (const rel of sources) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    const rates = [
      ...[...src.matchAll(/swayRate:\s*([\d.]+)/g)].map((m) => Number(m[1])),
      // The forest and the treeline pass theirs positionally to windyGeometry.
      ...[...src.matchAll(/windyGeometry\([^)]*?,\s*[\d.]+,\s*([\d.]+)\)/gs)].map((m) => Number(m[1])),
      ...[...src.matchAll(/soft \? [\d.]+ : [\d.]+,\s*soft \? ([\d.]+) : ([\d.]+)/g)].flatMap((m) => [
        Number(m[1]),
        Number(m[2]),
      ]),
    ];
    for (const r of rates) {
      checked++;
      const k = r / SWAY_RATE_STEP;
      if (Math.abs(k - Math.round(k)) > 1e-9) {
        off++;
        fail(`${rel} authors a sway rate of ${r}, which is not a multiple of ${SWAY_RATE_STEP}`);
      }
    }
  }
  if (checked === 0) fail("found no authored sway rates at all — the patterns have gone stale");
  else if (off === 0) console.log(`  all ${checked} authored rates land on the ${SWAY_RATE_STEP} step`);
}

console.log(failures === 0 ? "\nOK — the wind checks out." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
