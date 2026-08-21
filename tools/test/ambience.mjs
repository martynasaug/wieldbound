// Checks the ambient pool's BUDGET — how much of the screen the small living
// things are allowed to take up.
//
//   node tools/test/ambience.mjs
//
// This file exists because the same defect was reported from play twice, and
// the second time it was six times worse than the first while every individual
// number in it had been argued for in writing.
//
// M54.2 cut the butterfly pool from 150 to 62 because forty on screen read as a
// hatch, and in the same milestone cut the neighbourhood radius from 74 to 26
// because most of a 74-unit disc is never looked at. Both changes are right.
// Together they raised the DENSITY sixfold — the disc got eight times smaller
// and the count only halved — and nothing anywhere noticed, because the file
// declared headcounts and the thing that had changed was an area. Measured
// afterwards: ninety butterflies on screen at once, against forty that had
// already been reported as too many.
//
// And the same milestone left a bird at seventy-three pixels across, three
// times the height of the whole player character, under a comment asserting it
// would be "still small on screen". `ambience.ts` opens by saying that nothing
// in it is "larger than a fist". That was the rule the whole time and nothing
// enforced it.
//
// So: two things are asserted here, and both of them are properties the file
// already claims about itself in prose.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "client", "src", "three", "ambience.ts"), "utf8");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
}

const radiusMatch = source.match(/const RADIUS = ([0-9.]+);/);
if (!radiusMatch) throw new Error("ambience.ts no longer declares RADIUS");
const RADIUS = Number(radiusMatch[1]);
const areaThousands = (Math.PI * RADIUS * RADIUS) / 1000;

/**
 * Every kind in the table, read out of the source.
 *
 * Parsed rather than imported because `ambience.ts` is a renderer module that
 * reaches for three.js and the DOM, and because what is being checked is the
 * TABLE — the authored numbers — rather than anything the class does with them.
 */
const kinds = [];
const kindRe = /name: "([a-z-]+)",[\s\S]*?density: ([0-9.]+),[\s\S]*?size: \[([0-9.]+), ([0-9.]+)\]/g;
for (const m of source.matchAll(kindRe)) {
  kinds.push({
    name: m[1],
    density: Number(m[2]),
    size: [Number(m[3]), Number(m[4])],
    pool: Math.max(1, Math.round(Number(m[2]) * areaThousands)),
  });
}

console.log(`neighbourhood radius ${RADIUS} units (${areaThousands.toFixed(1)}k square units)`);
console.log(`${kinds.length} kinds:`);
for (const k of kinds) {
  console.log(
    `  ${k.name.padEnd(14)} density ${String(k.density).padStart(5)} -> pool ${String(k.pool).padStart(3)}   size ${k.size[0]}–${k.size[1]}`,
  );
}

// --- nothing may be declared as a headcount ---------------------------------
// The whole point of a density is that moving the neighbourhood moves the pool
// with it. One kind added with a `count:` reintroduces exactly the bug this
// file was written for, and it would look perfectly reasonable in review.
console.log("\nevery kind is declared as a density, not a headcount");
const strayCount = source.match(/^\s*count: \d+,/m);
check("no `count:` survives in the species table", !strayCount, strayCount ? strayCount[0].trim() : "");
check("and every kind declares one", kinds.length >= 5, `${kinds.length} parsed`);

// --- nothing is larger than a fist ------------------------------------------
// `ambience.ts`'s own opening rule, enforced for the first time. The ceiling is
// deliberately well under a character's 1.8 units rather than merely under it:
// these are the things a player must never mistake for something that matters,
// which is the same argument that keeps the ground cover from resembling a
// resource node.
const SIZE_CEILING = 0.5;
console.log(`\nnothing in the ambience is sized like a character (ceiling ${SIZE_CEILING})`);
for (const k of kinds) {
  check(k.name, k.size[1] <= SIZE_CEILING, `largest ${k.size[1]}`);
}

// --- and the air is not thick with them -------------------------------------
// At this radius the WHOLE neighbourhood projects inside the viewport, so the
// pool size is the on-screen count and there is nowhere for a surplus to hide.
// The band is bracketed by two measurements rather than by taste: three on
// screen was photographed and read as an empty field, and ninety was reported
// from play as too many.
const FLUTTERERS = ["butterfly", "cabbage-white"];
const flutter = kinds.filter((k) => FLUTTERERS.includes(k.name));
const flutterPool = flutter.reduce((a, k) => a + k.pool, 0);
console.log("\nthe two flutterers between them, which is the number that was reported");
check(
  "not a hatch",
  flutterPool <= 26,
  `${flutterPool} in the pool (ninety was reported as too many)`,
);
check(
  "and not an empty field",
  flutterPool >= 8,
  `${flutterPool} in the pool (three was photographed and read as empty)`,
);
check(
  "both kinds are counted, not just the yellow one",
  flutter.length === 2,
  flutter.map((k) => k.name).join(" + "),
);

// The whole pool, which is what the instancing actually pays for.
const total = kinds.reduce((a, k) => a + k.pool, 0);
console.log("\nand the pool as a whole");
check("stays inside its instancing budget", total <= 400, `${total} instances across ${kinds.length} kinds`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall ambience checks passed");
process.exit(failures ? 1 : 0);
