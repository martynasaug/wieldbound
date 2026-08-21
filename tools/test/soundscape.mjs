// Checks the world the soundscape reads, not the sound it makes.
//
//   node tools/test/soundscape.mjs
//
// The beds themselves are Web Audio and are measured in the browser off an
// AnalyserNode — level and spectrum, per place and per hour, which is the only
// honest way to check something with nothing on screen. What CANNOT be checked
// there is the thing this file is for: whether the places a bed is written for
// actually exist in the world, at the sizes the bed assumes.
//
// Every failure here is silent by construction. A wood whose canopy never
// reaches the threshold the birdsong branches on is a call that plays nowhere
// and throws nothing. A river audible from the town square is a river nobody
// would ever question, because the town is not quiet. A brazier out of range of
// the square is an Emberhold that goes silent after dark. None of it is visible
// and none of it is audible as a FAULT — it is just an absence.
//
// The thresholds are PARSED OUT OF THE CLIENT rather than restated, the same
// way the waystone test parses the server's own camp table. A copy agrees on
// the day it is written and stops agreeing the first time somebody retunes a
// range, which is exactly the moment this test would have to fail.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { FORESTS, forestStrengthAt } from "../../shared/forests.ts";
import { riverAt, RIVER_HALF_WIDTH_PX, riverPath } from "../../shared/river.ts";
import { roadTorches, roadPath } from "../../shared/road.ts";
import {
  SMITHY_ANGLE_DEG,
  SMITHY_RADIUS_PX,
  TOWN_CENTER,
  TOWN_PROPS,
  TOWN_RADIUS_PX,
  propPosition,
} from "../../shared/town.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "client", "src", "three", "soundscape.ts"), "utf8");

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ok   ${name}${detail ? "  " + detail : ""}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? "  " + detail : ""}`);
  }
}

/** One `const NAME = <number>;` out of the client file. */
function constant(name) {
  const m = source.match(new RegExp(`const ${name} = ([0-9.]+);`));
  if (!m) throw new Error(`soundscape.ts no longer declares ${name}`);
  return Number(m[1]);
}

const FIRE_RANGE_PX = constant("FIRE_RANGE_PX");
const WATER_RANGE_PX = constant("WATER_RANGE_PX");

/**
 * The canopy value the wood's own birdcall branches on, read off the line that
 * uses it. Two calls exist and the whole reason for a second one is that a wood
 * sounds different from a field, so a threshold nothing ever crosses would
 * quietly leave the game with one call and no error anywhere.
 */
const woodMatch = source.match(/const inWood = canopy > ([0-9.]+);/);
if (!woodMatch) throw new Error("soundscape.ts no longer decides `inWood` from `canopy`");
const WOOD_THRESHOLD = Number(woodMatch[1]);

console.log(
  `soundscape thresholds: fire ${FIRE_RANGE_PX}px, water ${WATER_RANGE_PX}px, wood canopy > ${WOOD_THRESHOLD}`,
);

// --- every wood is a wood, out loud ----------------------------------------
console.log("\nthe wood birdcall is reachable in every named wood");
for (const f of FORESTS) {
  const atCentre = forestStrengthAt(f.x, f.y);
  check(f.name, atCentre > WOOD_THRESHOLD, `canopy ${atCentre.toFixed(2)} at its centre`);
}

// And not on a knife edge: a wood whose canopy only just clears the threshold
// at one point is a wood you cannot stand in and hear.
console.log("\nand over a real share of each wood, not just its exact centre");
for (const f of FORESTS) {
  let inside = 0, total = 0;
  const step = f.radiusPx / 8;
  for (let dx = -f.radiusPx; dx <= f.radiusPx; dx += step) {
    for (let dy = -f.radiusPx; dy <= f.radiusPx; dy += step) {
      if (dx * dx + dy * dy > f.radiusPx * f.radiusPx) continue;
      total++;
      if (forestStrengthAt(f.x + dx, f.y + dy) > WOOD_THRESHOLD) inside++;
    }
  }
  const share = inside / total;
  check(f.name, share > 0.25, `${(share * 100).toFixed(0)}% of its disc is over the threshold`);
}

// --- Emberhold is never silent ----------------------------------------------
console.log("\nEmberhold can hear a fire at every hour");
const smithy = {
  x: TOWN_CENTER.x + Math.cos((SMITHY_ANGLE_DEG * Math.PI) / 180) * SMITHY_RADIUS_PX,
  y: TOWN_CENTER.y + Math.sin((SMITHY_ANGLE_DEG * Math.PI) / 180) * SMITHY_RADIUS_PX,
};
const forgeFromCentre = Math.hypot(smithy.x - TOWN_CENTER.x, smithy.y - TOWN_CENTER.y);
check(
  "the forge reaches the square",
  forgeFromCentre < FIRE_RANGE_PX,
  `${forgeFromCentre.toFixed(0)}px of ${FIRE_RANGE_PX}`,
);
// And from anywhere inside the walls, not merely from the middle of them.
let worstInside = 0;
for (let a = 0; a < 360; a += 15) {
  const r = (a * Math.PI) / 180;
  const px = TOWN_CENTER.x + Math.cos(r) * TOWN_RADIUS_PX * 0.9;
  const py = TOWN_CENTER.y + Math.sin(r) * TOWN_RADIUS_PX * 0.9;
  const d = Math.hypot(px - smithy.x, py - smithy.y);
  if (d > worstInside) worstInside = d;
}
check(
  "and from every point inside the palisade",
  worstInside < FIRE_RANGE_PX,
  `worst ${worstInside.toFixed(0)}px`,
);

const braziers = TOWN_PROPS.filter((p) => p.id.startsWith("brazier")).map(propPosition);
check("there are braziers to light after dark", braziers.length >= 2, `${braziers.length} of them`);

// --- the road is a chain of fires you can hear ------------------------------
console.log("\nthe North Road never runs out of earshot of a torch");
const torches = roadTorches();
let worstGap = 0;
for (const p of roadPath(10)) {
  let nearest = Infinity;
  for (const t of torches) {
    const d = Math.hypot(p.x - t.x, p.y - t.y);
    if (d < nearest) nearest = d;
  }
  if (nearest > worstGap) worstGap = nearest;
}
check(
  `${torches.length} torches cover the whole route`,
  worstGap < FIRE_RANGE_PX,
  `worst gap ${worstGap.toFixed(0)}px of ${FIRE_RANGE_PX}`,
);

// --- and the water stays where the water is ---------------------------------
console.log("\nthe Coldwater is not audible from places that are not the Coldwater");
const audibleFrom = RIVER_HALF_WIDTH_PX + WATER_RANGE_PX;
const townToRiver = riverAt(TOWN_CENTER.x, TOWN_CENTER.y).distancePx;
check(
  "not from Emberhold",
  townToRiver > audibleFrom + TOWN_RADIUS_PX,
  `${townToRiver.toFixed(0)}px away, audible within ${audibleFrom}`,
);
// And it IS audible standing on it, which is the other half and the one that
// would fail if the range were ever tuned down to fix the first.
const mid = riverPath()[Math.floor(riverPath().length / 2)];
check(
  "and it is, standing on the bank",
  riverAt(mid.x, mid.y).distancePx < audibleFrom,
  `${riverAt(mid.x, mid.y).distancePx.toFixed(0)}px`,
);

console.log(
  failures ? `\n${failures} check(s) failed` : "\nall soundscape checks passed",
);
process.exit(failures ? 1 : 0);
