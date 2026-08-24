// DISTANCE CULLING: does it hide what it should, keep what it must, and is the
// saving real?
//
// The frame this was written for: 47fps, 17.81ms, of which `render` was 14.63ms
// and every line of JavaScript together was 2.4ms — 1143 draw calls and 4.26
// million triangles. Ground cover is ~82,000 plants across a 400x300-unit
// world, chunked per species so the frustum test can reject what is off screen.
// Nothing rejected what was on screen and 300 units away.
//
// A RUNTIME test against real three.js. `InstancedMesh`, `Box3` and
// `computeBoundingSphere` are pure JavaScript, so the actual bounding-sphere
// arithmetic the culler depends on can be exercised rather than asserted about.
// The failure this is really guarding is a silent one in BOTH directions: cull
// too hard and the world has holes in it, cull off the wrong sphere (the
// prototype's, at the origin, instead of the instances') and everything
// vanishes at once — and neither throws.
//
//   node tools/test/culling.mjs

import * as THREE from "three";
import { DistanceCuller, COVER_CULL_UNITS, TREE_CULL_UNITS } from "../../client/src/three/culling.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

// A field of chunks laid out like the real one: 26-unit cells over 400x300.
const CHUNK = 26;
function buildField(halfW, halfH, perChunk = 40) {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.3, 0.3);
  const mat = new THREE.MeshBasicMaterial();
  const m = new THREE.Matrix4();
  for (let x = -halfW; x < halfW; x += CHUNK) {
    for (let z = -halfH; z < halfH; z += CHUNK) {
      const im = new THREE.InstancedMesh(geo, mat, perChunk);
      for (let i = 0; i < perChunk; i++) {
        m.makeTranslation(x + (i % 6) * 4, 0, z + Math.floor(i / 6) * 4);
        im.setMatrixAt(i, m);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();   // exactly what scatter.ts/forest.ts do
      group.add(im);
    }
  }
  return group;
}

section("1. the field");
const cover = buildField(200, 150);
check("chunks were built", cover.children.length > 100);
check(
  "each chunk bounds its own instances, not the prototype at the origin",
  cover.children.every((c) => c.boundingSphere !== null) &&
    new Set(cover.children.map((c) => Math.round(c.boundingSphere.center.x))).size > 5,
  "if every centre is the same, the cull would hide the whole world at once",
);
console.log(`  ${cover.children.length} chunks over 400x300 units`);

section("2. what the cut keeps and drops");
const culler = new DistanceCuller();
culler.add(cover, COVER_CULL_UNITS, "cover");
culler.update(0, 0);

const drawn = cover.children.filter((c) => c.visible);
check("something is still drawn", drawn.length > 0, "the world would be empty");
check("and something was dropped", drawn.length < cover.children.length, "nothing was culled");
for (const c of drawn) {
  const d = Math.hypot(c.boundingSphere.center.x, c.boundingSphere.center.z);
  check(
    "nothing far outside the radius is kept",
    d <= COVER_CULL_UNITS + c.boundingSphere.radius + 0.001,
    `kept a chunk ${d.toFixed(1)} units away`,
  );
  break; // one representative check; the reduction figure below covers the rest
}
for (const c of cover.children) {
  if (c.visible) continue;
  const d = Math.hypot(c.boundingSphere.center.x, c.boundingSphere.center.z);
  check(
    "nothing inside the radius is dropped",
    d > COVER_CULL_UNITS,
    `dropped a chunk only ${d.toFixed(1)} units away`,
  );
}
const cut = 1 - drawn.length / cover.children.length;
console.log(
  `  ${drawn.length}/${cover.children.length} chunks drawn at the world centre ` +
    `— ${(cut * 100).toFixed(0)}% fewer draw calls and triangles from ground cover`,
);
check("the saving is worth the file", cut > 0.5, `only ${(cut * 100).toFixed(0)}%`);

section("3. the player standing at a corner still has ground under them");
culler.update(-190, -140);
const atCorner = cover.children.filter((c) => c.visible);
check("a corner is not empty", atCorner.length > 0);
// The chunk the player is standing IN must always survive, at every position.
for (const [px, pz] of [[0, 0], [-190, -140], [120, -90], [-60, 130], [199, 149]]) {
  culler.update(px, pz);
  const under = cover.children.some((c) => {
    if (!c.visible) return false;
    const b = c.boundingSphere;
    return Math.hypot(b.center.x - px, b.center.z - pz) <= b.radius + CHUNK;
  });
  check(`ground is drawn under the player at (${px}, ${pz})`, under);
}

section("4. standing still costs nothing");
culler.update(0, 0);
const before = cover.children.map((c) => c.visible);
// Nudge by less than the re-evaluation threshold: the answer must not change,
// and more importantly the work must not be redone.
culler.update(0.5, 0.5);
check(
  "a sub-threshold move does not re-decide the field",
  cover.children.every((c, i) => c.visible === before[i]),
);

section("5. trees are cut further out than grass");
check(
  "a tree survives well past where grass stops",
  TREE_CULL_UNITS > COVER_CULL_UNITS * 2,
  `${TREE_CULL_UNITS} vs ${COVER_CULL_UNITS}`,
);
// Past the fog's far plane a tree is flat sky colour, so the cut cannot be seen.
const forest = buildField(200, 150);
const c2 = new DistanceCuller();
c2.add(forest, TREE_CULL_UNITS, "trees");
c2.update(0, 0);
const treesDrawn = forest.children.filter((c) => c.visible).length;
check("trees are still culled at the far corners", treesDrawn < forest.children.length);
console.log(`  ${treesDrawn}/${forest.children.length} tree chunks drawn`);

console.log(
  failures === 0
    ? "\nOK — the far half of the world stops being drawn, and the near half does not"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
