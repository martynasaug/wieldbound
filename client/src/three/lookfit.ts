// SEATING A HARVESTED PIECE ON THE HEAD IT IS ACTUALLY BEING WORN ON.
//
// Every hairstyle and beard in the creator is cut from one of the pack's own
// characters and dropped onto the player. `boneAttachMatrix` gets the FRAME
// right — the piece lands on the head rather than at the ankles, which five
// hand-tuned constants in `hair.ts` never managed — but a correct frame is not
// a correct fit, and two faults survive it:
//
//   THE DONOR'S HEAD IS NOT THIS HEAD. Measured off the source files with
//   `tools/art/skull_compare.py`: the Monk's skull matches the player's to
//   within 0.3%, the Wizard's is 1-3% larger, and the WARRIOR'S IS 15% NARROWER
//   and 9% shorter. Hair cut from the Warrior is a size too small for this
//   head — it clings inside the scalp instead of capping it, which is why the
//   crown showed through the "shaggy" mop.
//
//   THE DONOR'S FACE IS NOT THIS FACE. The Monk's features project 0.251 in
//   front of its skull; the player's grafted nose sits flush with it. A
//   moustache authored to rest on the Monk's lip therefore hangs in mid-air on
//   this one, measured at 0.090 clear of a head only 0.54 tall.
//
// So a piece is SCALED by the ratio of the two skulls and then PUSHED until it
// touches. Both numbers come from geometry present at runtime. That is the
// whole point of doing it here rather than adding a constant: `hair.ts` records
// five derived-or-tuned offsets that each put the hair somewhere new and wrong,
// and closes by saying the placement should be computed at attach time against
// the skull's measured surface. This is that.
//
// AGAINST TRIANGLES, NOT VERTICES. The skull is 75 vertices over a whole head,
// so its vertices sit roughly 0.1 apart — a piece resting exactly on the middle
// of a face reads as 0.05 clear of the nearest corner. Measuring to the nearest
// vertex would invent a gap and then dutifully close it, pushing every piece
// into the skull by half a face width.

import * as THREE from "three";

/** How close counts as touching. Below this a piece is left where it is. */
const CONTACT = 0.015;

/**
 * The skull's triangles, in the same space the look pieces are placed in.
 *
 * Only the triangles the Head bone OWNS. A gap measured against the whole body
 * is measured against a shoulder, and the bind pose has the arms out.
 */
export interface Skull {
  /** Flat triples of vertex positions: 9 numbers per triangle. */
  tris: Float32Array;
  centre: THREE.Vector3;
  size: THREE.Vector3;
}

/** Squared distance from a point to a triangle. */
function pointTriangleSq(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;

  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = ax + abx * v - px, qy = ay + aby * v - py, qz = az + abz * v - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = ax + acx * w - px, qy = ay + acy * w - py, qz = az + acz * w - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const qx = bx + (cx - bx) * w - px, qy = by + (cy - by) * w - py, qz = bz + (cz - bz) * w - pz;
    return qx * qx + qy * qy + qz * qz;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  const qx = ax + abx * v + acx * w - px;
  const qy = ay + aby * v + acy * w - py;
  const qz = az + abz * v + acz * w - pz;
  return qx * qx + qy * qy + qz * qz;
}

/** The closest any of `points` comes to the skull. */
function standoff(points: Float32Array, skull: Skull): number {
  const t = skull.tris;
  let best = Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const px = points[i], py = points[i + 1], pz = points[i + 2];
    for (let j = 0; j < t.length; j += 9) {
      const d = pointTriangleSq(
        px, py, pz,
        t[j], t[j + 1], t[j + 2],
        t[j + 3], t[j + 4], t[j + 5],
        t[j + 6], t[j + 7], t[j + 8],
      );
      if (d < best) best = d;
    }
    // Already touching somewhere; no later vertex can improve on that.
    if (best <= 1e-6) break;
  }
  return Math.sqrt(best);
}

/**
 * The correction that seats one piece on one skull, in the piece's own space.
 *
 * `donorScale` is the player's skull divided by the donor's, per axis, and is
 * the only thing the caller has to supply that cannot be read off the geometry:
 * the file does not record which character it was cut from.
 */
export function seatMatrix(
  geometry: THREE.BufferGeometry,
  skull: Skull,
  donorScale: THREE.Vector3,
  /**
   * A correction the CALLER has already applied, so the gap is measured where
   * the piece will actually be.
   *
   * Without this the seat measured the raw geometry — which is still 0.105 low,
   * before `calibrate`'s fix — found a large gap to the throat, and pushed the
   * piece backwards to close it. The nose came out 0.108 behind the face: a
   * correct placement followed by a confident correction of a problem that had
   * already been solved one line earlier.
   */
  applied: THREE.Vector3,
): THREE.Matrix4 {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const pts = new Float32Array(n * 3);

  // Scaled about the SKULL's centre, not the piece's own. The piece was authored
  // around the donor's head, which sits where this head sits; scaling about the
  // piece's own centroid would resize it in place and leave a long hairstyle
  // hanging off the wrong point.
  const c = skull.centre;
  for (let i = 0; i < n; i++) {
    pts[i * 3] = c.x + (pos.getX(i) - c.x) * donorScale.x + applied.x;
    pts[i * 3 + 1] = c.y + (pos.getY(i) - c.y) * donorScale.y + applied.y;
    pts[i * 3 + 2] = c.z + (pos.getZ(i) - c.z) * donorScale.z + applied.z;
  }

  const scaled = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z)
    .multiply(new THREE.Matrix4().makeScale(donorScale.x, donorScale.y, donorScale.z))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));

  const gap = standoff(pts, skull);
  if (gap <= CONTACT) return scaled;

  // WHICH WAY IS "IN". The piece's centroid relative to the skull's centre says
  // where it sits — a moustache is in front, a fringe is above — and the piece
  // is pushed back along the LARGEST component of that. Axis-aligned on purpose:
  // pushing along the raw centroid direction would move a moustache backwards
  // AND upwards, sliding it up the face while closing a gap that is purely
  // forward.
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < n; i++) { sx += pts[i * 3]; sy += pts[i * 3 + 1]; sz += pts[i * 3 + 2]; }
  const dx = sx / n - c.x, dy = sy / n - c.y, dz = sz / n - c.z;
  const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
  const dir = new THREE.Vector3(
    ax >= ay && ax >= az ? Math.sign(dx) : 0,
    ay > ax && ay >= az ? Math.sign(dy) : 0,
    az > ax && az > ay ? Math.sign(dz) : 0,
  );

  // Stopped just short of flush, so a piece rests ON the surface rather than
  // starting inside it — a beard sunk into the jaw loses its silhouette exactly
  // as surely as one hanging off it.
  const push = gap - CONTACT * 0.5;
  return new THREE.Matrix4()
    .makeTranslation(-dir.x * push, -dir.y * push, -dir.z * push)
    .multiply(scaled);
}

/** The average of a geometry's vertices. */
export function centroidOf(geometry: THREE.BufferGeometry): THREE.Vector3 {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const out = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) out.x += pos.getX(i), out.y += pos.getY(i), out.z += pos.getZ(i);
  return pos.count ? out.divideScalar(pos.count) : out;
}

/**
 * THE OFFSET BETWEEN THE TWO SCRIPTS THAT BAKE FACES, measured off the one
 * piece that exists in both forms.
 *
 * The player's nose is on this body twice over. `base_body.py` grafted a copy
 * onto the skull as `Face_nose`, and `look_pieces.py` cut the same feature out
 * of the same character as `Monk_nose.glb` for the creator. They are the same 32
 * vertices of the same nose — and they do not agree about where those vertices
 * sit, because the two scripts bake different transforms into them.
 *
 * `tools/soak/nosecheck.mjs` put the harvested copy on the head beside the baked
 * one: it landed 0.105 low, 0.044 off centre and 0.040 forward, on a head 0.54
 * tall. Every piece the creator wears comes from the second script, so every
 * piece carries that same error — the moustache on the collarbone and the beard
 * hanging down one side are one bug wearing two costumes, not two.
 *
 * MEASURED HERE RATHER THAN WRITTEN DOWN. The number could be a constant; the
 * long note in `hair.ts` is a list of five constants that were each right until
 * the art changed under them. Deriving it from the two copies costs one small
 * file and survives the next re-cut, which is the point: when the pipeline
 * changes, the correction changes with it instead of going quietly stale.
 */
export function calibrate(
  baked: THREE.BufferGeometry | null,
  harvested: THREE.BufferGeometry | null,
): THREE.Vector3 {
  // No reference on this body: place pieces exactly as before rather than
  // inventing a correction. A body with no baked face is not necessarily wrong,
  // it is just one this cannot speak about.
  if (!baked || !harvested) return new THREE.Vector3();
  if (baked.attributes.position.count !== harvested.attributes.position.count) {
    // Not the same nose. Comparing a nose to a different nose would produce a
    // confident number describing nothing.
    console.warn("[look] calibration reference is not the same mesh; pieces left uncorrected");
    return new THREE.Vector3();
  }
  return centroidOf(baked).sub(centroidOf(harvested));
}

/**
 * The skull of a body, as triangles in the space look pieces are placed in.
 *
 * Returns null for a body whose head cannot be identified, which leaves the
 * caller placing pieces exactly as it did before this file existed.
 */
export function readSkull(root: THREE.Object3D, boneName: string): Skull | null {
  let mesh: THREE.SkinnedMesh | null = null;
  let headIndex = -1;
  root.traverse((o) => {
    const s = o as THREE.SkinnedMesh;
    if (mesh || !s.isSkinnedMesh) return;
    const i = s.skeleton.bones.findIndex((b) => b.name === boneName);
    if (i < 0) return;
    mesh = s;
    headIndex = i;
  });
  if (!mesh || headIndex < 0) return null;

  const geo = (mesh as THREE.SkinnedMesh).geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const si = geo.attributes.skinIndex as THREE.BufferAttribute | undefined;
  const sw = geo.attributes.skinWeight as THREE.BufferAttribute | undefined;
  if (!si || !sw) return null;

  // DOMINANT, not merely present. A vertex the neck shares with the spine
  // belongs to the throat, and counting it stretches the skull down the body.
  const owned = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const idx = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
    const wts = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    for (let k = 0; k < 4; k++) {
      if (idx[k] === headIndex && wts[k] > 0.5) { owned[i] = 1; break; }
    }
  }

  const index = geo.index;
  const tris: number[] = [];
  const corners = index ? index.count : pos.count;
  for (let f = 0; f + 2 < corners; f += 3) {
    const a = index ? index.getX(f) : f;
    const b = index ? index.getX(f + 1) : f + 1;
    const cI = index ? index.getX(f + 2) : f + 2;
    // Every corner, so a triangle spanning the jaw and the throat is left out
    // rather than dragging the skull's surface down into the neck.
    if (!owned[a] || !owned[b] || !owned[cI]) continue;
    tris.push(
      pos.getX(a), pos.getY(a), pos.getZ(a),
      pos.getX(b), pos.getY(b), pos.getZ(b),
      pos.getX(cI), pos.getY(cI), pos.getZ(cI),
    );
  }
  if (!tris.length) return null;

  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < tris.length; i += 9) {
    for (let k = 0; k < 9; k += 3) {
      lo.x = Math.min(lo.x, tris[i + k]); hi.x = Math.max(hi.x, tris[i + k]);
      lo.y = Math.min(lo.y, tris[i + k + 1]); hi.y = Math.max(hi.y, tris[i + k + 1]);
      lo.z = Math.min(lo.z, tris[i + k + 2]); hi.z = Math.max(hi.z, tris[i + k + 2]);
    }
  }
  return {
    tris: new Float32Array(tris),
    centre: lo.clone().add(hi).multiplyScalar(0.5),
    size: hi.clone().sub(lo),
  };
}
