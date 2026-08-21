// Walks the North Road across the Coldwater and fails if the ground steps.
//
//   node tools/test/crossing.mjs
//
// THE CROSSING HAS NOW BEEN REPORTED FROM PLAY THREE TIMES, and every one of
// them was the same class of fault: two answers to "where is the ground".
//
//   M54.1a  you walked THROUGH the bridge, because the player's feet read
//           `terrainHeight` and over the Coldwater that is the riverbed.
//   M55.3   the feet were in the floor, because the mesh you see joins its
//           samples with flat triangles and a chord rides above the curve.
//   M57.3   a trench at each abutment, 1.27 units deep on the north side,
//           because the height field STEPPED there — riverbed under the deck,
//           ramp outside it — and a mesh cannot draw a step, so it drew a wedge.
//
// Not one of those could be caught by anything in this directory, because the
// height field lived inside a module that pulls in a renderer. It does not any
// more (see `client/src/three/heightfield.ts`), so this walks it.
//
// What is asserted is CONTINUITY rather than any particular shape. The land is
// allowed to be whatever it is; what it may not do is jump, because a jump is
// the one thing that is always a bug and is always invisible until somebody
// walks into it.

import {
  bridgePoint,
  bridgeFrame,
  BRIDGE_HALF_SPAN_PX,
  BRIDGE_RAMP_PX,
  RIVER_HALF_WIDTH_PX,
  riverAt,
} from "../../shared/river.ts";
import { roadPath } from "../../shared/road.ts";
import {
  bridgeDeckHeight,
  drawnHeight,
  surfaceHeight,
  terrainHeight,
  toWorldX,
  toWorldZ,
} from "../../client/src/three/heightfield.ts";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
}

const at = (sx, sy) => surfaceHeight(toWorldX(sx), toWorldZ(sy));
const deck = bridgeDeckHeight();

/**
 * A STEP IS NOT A SLOPE, and the first version of this test could not tell them
 * apart.
 *
 * Asserting on the height difference between two samples fails on the north
 * bank, which climbs a steady 0.19 units every 25 pixels for hundreds of
 * pixels. That is an eighteen-degree hillside; it is supposed to be there, and
 * a threshold low enough to catch a trench is low enough to ban hills.
 *
 * What a step actually is, is a discontinuity — and a discontinuity shows up in
 * the SECOND difference, which is flat for any slope however steep and spikes
 * for any break however short. The trench that prompted this test scored 1.79.
 * The land, measured across the whole crossing and the whole road, never
 * exceeds a tenth of that.
 */
const MAX_KINK = 0.35;
/** And nothing may be an outright cliff either, however smooth. */
const MAX_SLOPE = 0.45;
const STRIDE_PX = 25;

console.log(`deck height ${deck.toFixed(3)}, span +-${BRIDGE_HALF_SPAN_PX}, ramp ${BRIDGE_RAMP_PX}`);

// --- along the crossing itself ----------------------------------------------
console.log("\nthe ground does not step anywhere along the crossing");
{
  const reach = BRIDGE_HALF_SPAN_PX + BRIDGE_RAMP_PX + 400;
  const hs = [];
  const alongs = [];
  for (let a = -reach; a <= reach; a += STRIDE_PX) {
    const p = bridgePoint(a, 0);
    hs.push(at(p.x, p.y));
    alongs.push(a);
  }
  let kink = 0, kinkAt = 0, slope = 0, slopeAt = 0;
  for (let i = 1; i < hs.length - 1; i++) {
    const k = Math.abs(hs[i + 1] - 2 * hs[i] + hs[i - 1]);
    if (k > kink) { kink = k; kinkAt = alongs[i]; }
    const s = Math.abs(hs[i] - hs[i - 1]);
    if (s > slope) { slope = s; slopeAt = alongs[i]; }
  }
  check(
    `worst kink over ${STRIDE_PX}px`,
    kink <= MAX_KINK,
    `${kink.toFixed(3)} at along ${kinkAt} (limit ${MAX_KINK}; the trench scored 1.79)`,
  );
  check(
    "and nothing is a cliff",
    slope <= MAX_SLOPE,
    `steepest ${slope.toFixed(3)} per ${STRIDE_PX}px at along ${slopeAt}`,
  );
}

// --- and the deck lands ON the ground, not above a hole ----------------------
// The abutment is where the planks stop and the earth takes over, so those two
// heights have to be the same number. This is the check that would have caught
// M57.3 on its own.
console.log("\nthe deck and the land meet at each abutment");
for (const side of [-1, 1]) {
  const label = side < 0 ? "south" : "north";
  const inside = bridgePoint(side * (BRIDGE_HALF_SPAN_PX - 5), 0);
  const outside = bridgePoint(side * (BRIDGE_HALF_SPAN_PX + 5), 0);
  const gap = at(outside.x, outside.y) - at(inside.x, inside.y);
  check(
    `${label} abutment`,
    Math.abs(gap) <= 0.1,
    `${gap >= 0 ? "+" : ""}${gap.toFixed(3)} across the joint`,
  );
}

// --- the channel is still a channel -----------------------------------------
// The landing raises the ground to deck height under the overhanging ends of
// the deck, which is what an abutment is. It must not fill the water: a bridge
// over dry earth is a worse bug than the one this fixed, and it would look
// entirely deliberate.
console.log("\nand the water still runs under it");
{
  const mid = bridgePoint(0, 0);
  const bed = terrainHeight(toWorldX(mid.x), toWorldZ(mid.y));
  check(
    "the bed under mid-span is well below the deck",
    deck - bed > 1.5,
    `${(deck - bed).toFixed(2)} units of clearance`,
  );
  // And across the channel's own width, not only at the exact centreline.
  let highest = -Infinity;
  for (let a = -RIVER_HALF_WIDTH_PX + 10; a <= RIVER_HALF_WIDTH_PX - 10; a += 10) {
    for (let c = -60; c <= 60; c += 20) {
      const p = bridgePoint(a, c);
      if (riverAt(p.x, p.y).distancePx > RIVER_HALF_WIDTH_PX) continue;
      highest = Math.max(highest, terrainHeight(toWorldX(p.x), toWorldZ(p.y)));
    }
  }
  check(
    "and nowhere in the channel rises to it",
    deck - highest > 1.0,
    `highest bed ${highest.toFixed(2)} against a deck at ${deck.toFixed(2)}`,
  );
}

// --- the whole road, not just the bridge ------------------------------------
// The crossing is where it went wrong three times, but the property is about
// the road: a cart track that steps anywhere is a cart track nobody could use.
console.log("\nand the North Road does not step anywhere else either");
{
  // Resampled at an even stride rather than walked at the polyline's own
  // spacing, because a second difference is only meaningful over equal steps.
  const path = roadPath(60);
  const even = [];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const d = Math.hypot(dx, dy);
    if (d <= 0) continue;
    for (let t = carry; t < d; t += STRIDE_PX) {
      const u = t / d;
      even.push({ x: path[i - 1].x + dx * u, y: path[i - 1].y + dy * u });
    }
    carry = (carry - d) % STRIDE_PX;
    if (carry < 0) carry += STRIDE_PX;
  }
  const hs = even.map((p) => at(p.x, p.y));
  let kink = 0, kinkIdx = 1;
  for (let i = 1; i < hs.length - 1; i++) {
    const k = Math.abs(hs[i + 1] - 2 * hs[i] + hs[i - 1]);
    if (k > kink) { kink = k; kinkIdx = i; }
  }
  const f = bridgeFrame(even[kinkIdx].x, even[kinkIdx].y);
  check(
    `worst kink over ${STRIDE_PX}px of road`,
    kink <= MAX_KINK,
    `${kink.toFixed(3)} at (${Math.round(even[kinkIdx].x)}, ${Math.round(even[kinkIdx].y)}), along ${f.along.toFixed(0)} — ${even.length} samples`,
  );
}

// --- the mesh you see, not the field it came from ----------------------------
// M55.3's lesson, kept: `surfaceHeight` answers with the DRAWN ground, and the
// drawn ground is the mesh. A field that is smooth and a mesh that is not would
// pass every check above and still drop somebody into a hole.
console.log("\nthe drawn ground agrees with the field it was sampled from");
{
  let worst = 0, worstAt = null;
  const reach = BRIDGE_HALF_SPAN_PX + BRIDGE_RAMP_PX + 200;
  for (let a = -reach; a <= reach; a += 10) {
    for (let c = -120; c <= 120; c += 40) {
      const p = bridgePoint(a, c);
      const x = toWorldX(p.x), z = toWorldZ(p.y);
      // Over the span the two are entitled to differ: one is the deck and the
      // other is the riverbed under it.
      if (Math.abs(bridgeFrame(p.x, p.y).along) <= BRIDGE_HALF_SPAN_PX) continue;
      const d = Math.abs(drawnHeight(x, z) - terrainHeight(x, z));
      if (d > worst) { worst = d; worstAt = [a, c]; }
    }
  }
  check(
    "the mesh never rides far from the field",
    worst <= 0.35,
    `worst ${worst.toFixed(3)} at along ${worstAt?.[0]}, across ${worstAt?.[1]}`,
  );
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall crossing checks passed");
process.exit(failures ? 1 : 0);
