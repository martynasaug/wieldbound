// One seeded random number generator, for everything in the game that has to
// look scattered and be identical for every player.
//
// THIS FILE EXISTS BECAUSE THE OLD ONE WAS BROKEN FOR SIX PHASES, in a way that
// is worth writing down at length because nothing about it looked wrong.
//
// The generator was the textbook C `rand`, copy-pasted into six files:
//
//     s = (s * 1103515245 + 12345) & 0x7fffffff;
//     return s / 0x7fffffff;
//
// In C that is exact, because the multiply wraps at 32 bits. In JavaScript
// there are no integers: `s` reaches about 2^31, the product reaches 2.4e18,
// and **the double loses every bit below 2^53** before the mask ever runs. The
// low bits of the state — the only bits that matter to an LCG — are rounded
// away, so the sequence collapses. Measured: 200,000 draws produced **11,064
// distinct values**.
//
// The reason it survived six phases is the reason it is worth a comment. Every
// obvious check passes. The output is uniform: a histogram of 200,000 draws
// across twenty buckets is flat to within one per cent. It is deterministic. It
// is fast. It just repeats after about five thousand pairs — so the ground
// cover placed eighty-two thousand plants on roughly five thousand distinct
// positions, in stacks, and the world looked EMPTY while every counter in the
// game reported it full.
//
// That is what finally exposed it: raising the plant count from 53,000 to
// 82,000 changed the picture not at all. Scaling every instance within twelve
// units of the player up six times showed five giant clumps where the counters
// said there were three hundred and seventy-nine plants.
//
// The fix is `Math.imul`, which is the one operation JavaScript has that
// multiplies two 32-bit integers and keeps the low 32 bits, exactly as C does.
//
// It lives in `shared/` rather than in the renderer because the tests need the
// same guarantee, and because six copies of a generator is six places for this
// to happen again.

/**
 * A seeded uniform generator over [0, 1).
 *
 * Numerical Recipes' LCG constants, which are a full-period generator modulo
 * 2^32 — every one of the four billion states is visited before any repeats.
 * The state is kept unsigned with `>>> 0` so it never goes negative, and the
 * division is by 2^32 rather than by the state's maximum, so the result can
 * reach neither 0.999... nor 1 by accident.
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // Math.imul is the whole point: it is the only multiply in the language
    // that keeps the LOW 32 bits rather than the high ones. `a * b` on the same
    // inputs silently discards them.
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A stable value in [0, 1) for a given pair of coordinates.
 *
 * For the places that want "the same answer every time for this spot" without
 * threading a sequence through — a plant deciding whether to grow under a
 * canopy, say. Not a substitute for `seededRandom`: it is a hash, so it has no
 * sequence and no period, and asking it for two numbers at nearly the same
 * point gives two nearly identical answers.
 */
export function hashedRandom(x: number, y: number): number {
  let h = Math.imul(Math.round(x * 8192) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.round(y * 8192) ^ 0xc2b2ae35, 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
