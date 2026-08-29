// Ground cover's per-species chunk size, walked as arithmetic.
//
// The rule exists because of a measurement: standing in open field, 448 cover
// chunks were drawn for 6,456 plants — 14.4 plants per draw call, with twenty
// chunks drawing a single plant. Dense grass was fine; the sparse species were
// each paying a full draw call for a handful of flowers, because every species
// was diced on the same 26-unit lattice however thinly it was scattered.
import {
  COVER_CULL_UNITS, coverChunkStep, COVER_TARGET_PER_CHUNK, MAX_CHUNK_STEP,
} from "../../client/src/three/culling.ts";

const problems = [];
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) problems.push(what); };

// The real grid: 400x300 units of playable area on a 26-unit lattice.
// The lattice, spelled out rather than imported: `scatter.ts` reaches into the
// asset loader and cannot be loaded under plain Node, which is the same reason
// `culling.mjs` builds its own field. 26 is `CHUNK_UNITS`.
const CHUNK_UNITS = 26;
const CELLS = Math.ceil(400 / CHUNK_UNITS) * Math.ceil(300 / CHUNK_UNITS);

// 1. A DENSE species is left exactly as it was. Grass_Common_Short measured
//    56 instances per chunk; splitting it finer is what culling is for.
check(coverChunkStep(CELLS * 60, CELLS) === 1, "a dense species keeps the base 26-unit cell");
check(coverChunkStep(CELLS * COVER_TARGET_PER_CHUNK, CELLS) === 1, "so does one exactly at the target");

// 2. A SPARSE species gets a bigger cell. Flower_4_Group measured 2.6 per
//    chunk — the worst case in the field and the reason for the rule.
const sparse = coverChunkStep(Math.round(CELLS * 2.6), CELLS);
check(sparse > 1, `a species at 2.6 per chunk gets a bigger cell (step ${sparse})`);
check(sparse === MAX_CHUNK_STEP, "and the sparsest species reach the cap");
check(sparse <= MAX_CHUNK_STEP, "and never a bigger one than the cap allows");

// 3. MONOTONIC: thinner scattering never gets a smaller cell than denser.
let last = 0, monotonic = true;
for (const per of [60, 48, 30, 20, 12, 6, 3, 1, 0.2]) {
  const step = coverChunkStep(Math.round(CELLS * per), CELLS);
  if (step < last) monotonic = false;
  last = step;
}
check(monotonic, "the step never shrinks as a species gets sparser");

// 4. THE CAP IS REAL, and it is what keeps a chunk cullable. A cell far larger
//    than a species' own cull radius stops being rejectable, because the
//    culler adds the chunk's bounding radius to its reach.
check(coverChunkStep(1, CELLS) === MAX_CHUNK_STEP, "an almost-empty species stops at the cap");
// The cap is 2 for a structural reason, not a taste one: a 3-step cell is 78
// units across, which is exactly COVER_CULL_UNITS, and a chunk as big as the
// distance it is culled at can never be rejected by the distance cut at all.
check(MAX_CHUNK_STEP * CHUNK_UNITS < COVER_CULL_UNITS,
  `the largest cell (${MAX_CHUNK_STEP * CHUNK_UNITS}u) stays inside the cover cull radius (${COVER_CULL_UNITS}u)`);

// 5. Degenerate inputs do not produce a zero or a fraction — a step of 0 would
//    divide the grid to nothing and a fraction would misalign every cell.
for (const [t, c] of [[0, CELLS], [0, 0], [10, 0], [1e6, 1]]) {
  const s = coverChunkStep(t, c);
  if (!Number.isInteger(s) || s < 1 || s > MAX_CHUNK_STEP) {
    check(false, `coverChunkStep(${t}, ${c}) returned ${s}`);
  }
}
check(true, "degenerate inputs still give a whole step within range");

// 6. The point of the whole thing: a sparse species really does end up with
//    fewer chunks, which is what a draw call is spent on.
{
  const per = 2.6;
  const step = coverChunkStep(Math.round(CELLS * per), CELLS);
  const before = CELLS;
  const after = Math.ceil(Math.ceil(400 / CHUNK_UNITS) / step) * Math.ceil(Math.ceil(300 / CHUNK_UNITS) / step);
  check(after <= before / 3, `a sparse species goes from ${before} chunks to ${after}`);
}

console.log(problems.length ? `\n${problems.length} failure(s).` : "\nOK — a draw call is spent where there is something to draw.");
process.exit(problems.length ? 1 : 0);
