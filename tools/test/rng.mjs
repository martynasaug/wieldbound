// Checks the seeded generator.
//
// THIS TEST EXISTS BECAUSE THE OLD GENERATOR PASSED EVERY OBVIOUS CHECK. It was
// the textbook C LCG, copy-pasted into six files, and in JavaScript the
// multiply overflows a double before the mask runs — so the low bits of the
// state, which are the only bits an LCG has, were rounded away.
//
// What that looked like from outside:
//
//   * deterministic — yes;
//   * uniform — yes, a histogram of 200,000 draws over twenty buckets was flat
//     to within one per cent;
//   * fast — yes;
//   * and it produced **11,064 distinct values** before repeating.
//
// The ground cover placed eighty-two thousand plants on roughly five thousand
// distinct positions, in stacks. Every counter in the game reported a full
// world and the world looked empty. Nothing about a screenshot says "your
// random numbers repeat"; what it says is "the frontier looks bare", which
// sends you off to tune densities that were never the problem.
//
// So the properties asserted here are the ones that failed, not the ones that
// are easy to write: PERIOD and PAIR COVERAGE. Uniformity is checked too, but
// only because a fix that broke it would be a different disaster.
//
//   node tools/test/rng.mjs

import { seededRandom, hashedRandom } from "../../shared/rng.ts";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n== ${name} ==`);

section("it does not repeat");
{
  // The number that mattered. A generator used to place tens of thousands of
  // things must have at least tens of thousands of distinct outputs.
  const N = 200_000;
  const rand = seededRandom(91117);
  const seen = new Set();
  for (let i = 0; i < N; i++) seen.add(rand());
  const ratio = seen.size / N;
  if (ratio < 0.999) {
    fail(`only ${seen.size} distinct values in ${N} draws — the sequence repeats`);
  } else {
    console.log(`  ${seen.size} distinct values in ${N} draws`);
  }
}

section("pairs cover the plane");
{
  // The property the SCATTER actually needs, which is not the same as the one
  // above: positions are taken two draws at a time, so what matters is how many
  // distinct (x, z) pairs come out. A generator can have a long period and
  // still walk a lattice.
  const rand = seededRandom(4242);
  const cells = new Set();
  const N = 100_000;
  for (let i = 0; i < N; i++) {
    cells.add(Math.floor(rand() * 64) * 64 + Math.floor(rand() * 64));
  }
  if (cells.size < 4096) {
    fail(`${N} pairs only reached ${cells.size} of 4096 cells`);
  } else {
    console.log(`  ${N} pairs reach all ${cells.size} cells of a 64x64 grid`);
  }

  // And no pair may repeat the one before it, which is what a collapsed state
  // looks like from the placement loop's point of view.
  const r2 = seededRandom(7);
  let prevX = -1;
  let prevY = -1;
  let repeats = 0;
  for (let i = 0; i < 50_000; i++) {
    const x = r2();
    const y = r2();
    if (x === prevX && y === prevY) repeats++;
    prevX = x;
    prevY = y;
  }
  if (repeats > 0) fail(`${repeats} consecutive placements landed on the same spot`);
  else console.log("  and no placement repeats the one before it");
}

section("it is uniform");
{
  const rand = seededRandom(555);
  const bins = new Array(20).fill(0);
  const N = 200_000;
  for (let i = 0; i < N; i++) bins[Math.min(19, Math.floor(rand() * 20))]++;
  const expect = N / bins.length;
  let worst = 0;
  for (const b of bins) worst = Math.max(worst, Math.abs(b - expect) / expect);
  if (worst > 0.05) fail(`the worst bucket is ${(worst * 100).toFixed(1)}% off flat`);
  else console.log(`  flat to within ${(worst * 100).toFixed(2)}%`);

  let lo = 1;
  let hi = 0;
  const r = seededRandom(999);
  for (let i = 0; i < 200_000; i++) {
    const v = r();
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo < 0 || hi >= 1) fail(`values leave [0, 1): saw ${lo} and ${hi}`);
  else console.log(`  stays inside [0, 1) — ${lo.toFixed(6)} to ${hi.toFixed(6)}`);
}

section("it is the same for everybody");
{
  // The whole reason it is seeded. Two generators from one seed must agree
  // forever, and two from different seeds must not agree at all.
  const a = seededRandom(12345);
  const b = seededRandom(12345);
  let drift = 0;
  for (let i = 0; i < 10_000; i++) if (a() !== b()) drift++;
  if (drift > 0) fail(`two generators on the same seed disagreed ${drift} times`);
  else console.log("  same seed, same sequence");

  const c = seededRandom(12346);
  const d = seededRandom(12345);
  let same = 0;
  for (let i = 0; i < 10_000; i++) if (c() === d()) same++;
  if (same > 5) fail(`two different seeds produced ${same} identical draws`);
  else console.log("  and different seeds do not shadow each other");
}

section("the positional hash");
{
  // Used where something has to decide the same way every time for a spot
  // without threading a sequence through — the ground cover thinning under a
  // canopy, for one. Determinism and spread are what it owes.
  if (hashedRandom(12.5, -8.25) !== hashedRandom(12.5, -8.25)) {
    fail("hashedRandom is not deterministic");
  }
  const bins = new Array(10).fill(0);
  let n = 0;
  for (let x = -40; x < 40; x += 0.37) {
    for (let y = -40; y < 40; y += 0.41) {
      const v = hashedRandom(x, y);
      if (v < 0 || v >= 1) fail(`hashedRandom returned ${v}`);
      bins[Math.min(9, Math.floor(v * 10))]++;
      n++;
    }
  }
  const expect = n / 10;
  let worst = 0;
  for (const b of bins) worst = Math.max(worst, Math.abs(b - expect) / expect);
  if (worst > 0.12) fail(`the hash is ${(worst * 100).toFixed(0)}% off flat across a grid`);
  else console.log(`  spreads flat to within ${(worst * 100).toFixed(1)}% over ${n} points`);

  // Neighbouring points must differ. A hash that returned the same value for a
  // whole neighbourhood would thin the ground cover in patches rather than
  // evenly, which is the failure it was chosen over a sequence to avoid.
  let stuck = 0;
  for (let i = 0; i < 5000; i++) {
    const x = i * 0.013;
    if (hashedRandom(x, 3.5) === hashedRandom(x + 0.013, 3.5)) stuck++;
  }
  if (stuck > 5) fail(`${stuck} neighbouring points hashed identically`);
  else console.log("  and neighbouring points do not collide");
}

console.log(failures === 0 ? "\nOK — the generator checks out." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
