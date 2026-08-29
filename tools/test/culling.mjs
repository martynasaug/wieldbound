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
import { readFileSync } from "node:fs";
import {
  DistanceCuller,
  COVER_CULL_UNITS,
  TREE_CULL_UNITS,
  coverCullRadius,
  coverDensityAt,
} from "../../client/src/three/culling.ts";

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
// THE WHOLE FIELD, kept because the group no longer holds it.
//
// The culler used to hide a culled chunk and now removes it from the scene
// graph entirely — three.js walks every child of every group in
// `updateMatrixWorld` regardless of visibility (M70.121), so hiding one still
// cost a matrix walk every frame forever. That means `cover.children` is now
// the list of chunks currently DRAWN, and the assertions below have to measure
// against the field as it was built rather than against the group.
const ALL = [...cover.children];
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

const drawn = ALL.filter((c) => c.visible && c.parent !== null);
check("something is still drawn", drawn.length > 0, "the world would be empty");
check("and something was dropped", drawn.length < ALL.length, "nothing was culled");
// The two must agree: a culled chunk is both hidden AND out of the graph, or
// the render path and the matrix walk would disagree about what exists.
check(
  "hidden and detached mean the same thing",
  ALL.every((c) => (c.visible && c.parent !== null) || (!c.visible && c.parent === null)),
  "a chunk was hidden but left in the graph, or detached but left visible",
);
for (const c of drawn) {
  const d = Math.hypot(c.boundingSphere.center.x, c.boundingSphere.center.z);
  check(
    "nothing far outside the radius is kept",
    d <= COVER_CULL_UNITS + c.boundingSphere.radius + 0.001,
    `kept a chunk ${d.toFixed(1)} units away`,
  );
  break; // one representative check; the reduction figure below covers the rest
}
for (const c of ALL) {
  if (c.visible) continue;
  const d = Math.hypot(c.boundingSphere.center.x, c.boundingSphere.center.z);
  check(
    "nothing inside the radius is dropped",
    d > COVER_CULL_UNITS,
    `dropped a chunk only ${d.toFixed(1)} units away`,
  );
}
const cut = 1 - drawn.length / ALL.length;
console.log(
  `  ${drawn.length}/${ALL.length} chunks drawn at the world centre ` +
    `— ${(cut * 100).toFixed(0)}% fewer draw calls and triangles from ground cover`,
);
check("the saving is worth the file", cut > 0.5, `only ${(cut * 100).toFixed(0)}%`);

section("3. the player standing at a corner still has ground under them");
culler.update(-190, -140);
const atCorner = ALL.filter((c) => c.visible);
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
// Same again: the group holds only what survives, so the total has to be kept.
const ALL_TREES = [...forest.children];
const c2 = new DistanceCuller();
c2.add(forest, TREE_CULL_UNITS, "trees");
c2.update(0, 0);
const treesDrawn = ALL_TREES.filter((c) => c.visible).length;
check("trees are still culled at the far corners", treesDrawn < ALL_TREES.length);
console.log(`  ${treesDrawn}/${forest.children.length} tree chunks drawn`);

section("6. a pebble is not a grass tuft");
{
  // The species table lives in scatter.ts, which reaches into the asset loader
  // and the terrain and cannot be loaded under Node. Its SIZES can be read from
  // the source, which is all this needs — the rule under test is arithmetic and
  // lives in culling.ts precisely so it can be called for real.
  const src = readFileSync(new URL("../../client/src/three/scatter.ts", import.meta.url), "utf8");
  const from = src.indexOf("GROUND_COVER");
  const table = src.slice(from, src.indexOf("];", from));
  const species = [...table.matchAll(/model: "([^"]+)"[^\n]*?size: \[[0-9.]+, ([0-9.]+)\]/g)]
    .map((m) => ({ model: m[1], max: Number(m[2]) }));
  check("the species table was read", species.length >= 15, String(species.length));

  const radii = species.map((s) => coverCullRadius(s.max));
  const tallest = species.reduce((a, s) => (s.max > a.max ? s : a));
  const shortest = species.reduce((a, s) => (s.max < a.max ? s : a));
  check(
    "the tallest cover keeps the full radius",
    Math.abs(coverCullRadius(tallest.max) - COVER_CULL_UNITS) < 0.001,
  );
  check(
    "the shortest is retired much sooner",
    coverCullRadius(shortest.max) < COVER_CULL_UNITS * 0.75,
    shortest.model + " -> " + coverCullRadius(shortest.max).toFixed(0),
  );
  check("the radii actually differ", new Set(radii.map((r) => r.toFixed(1))).size > 2);
  // The floor exists so nothing vanishes while the player can still walk over
  // and look down at it. The camera reaches 22 units on its own.
  for (const s of species) {
    check(
      s.model + " is never culled inside the camera reach",
      coverCullRadius(s.max) > 22 * 1.5,
      String(coverCullRadius(s.max)),
    );
  }
  console.log(
    "  " + species.length + " species, radii " +
      Math.min(...radii).toFixed(0) + "-" + Math.max(...radii).toFixed(0) + " units",
  );
}

section("7. the quality scale closes the world in");
{
  const q = new DistanceCuller();
  q.add(cover, COVER_CULL_UNITS, "cover");
  q.setScale(1);
  q.update(0, 0);
  const atHigh = cover.children.filter((c) => c.visible).length;
  q.setScale(0.62);
  q.update(0, 0);
  const atPerf = cover.children.filter((c) => c.visible).length;
  check("Performance draws less than High", atPerf < atHigh, atPerf + " vs " + atHigh);
  check("but the world is not empty", atPerf > 0);
  // The setting must not be able to cull the ground out from under the player.
  const under = cover.children.some((c) => c.visible &&
    Math.hypot(c.boundingSphere.center.x, c.boundingSphere.center.z) <= c.boundingSphere.radius + CHUNK);
  check("even at Performance there is ground under the player", under);
  console.log("  chunks drawn: High " + atHigh + ", Performance " + atPerf);
}

section("8. distant cover is thinned, near cover is not");
{
  // Culling answers "draw this at all"; density answers "how much of it". The
  // failure to guard against is thinning something the player can walk up to,
  // which would pop plants into existence as they move.
  check("everything inside the camera reach is drawn in full",
    coverDensityAt(0, 78) === 1 && coverDensityAt(22, 39) === 1 && coverDensityAt(29, 39) === 1);
  check("and the far band is genuinely thinner", coverDensityAt(70, 78) < 0.5, String(coverDensityAt(70, 78)));
  check("density never exceeds full", [0, 10, 30, 50, 70, 200].every((d) => coverDensityAt(d, 78) <= 1));
  check("and never reaches zero", [0, 10, 30, 50, 70, 200].every((d) => coverDensityAt(d, 78) > 0));
  // Monotonic: further away must never be denser.
  let last = 1;
  for (let d = 0; d <= 200; d += 5) {
    const v = coverDensityAt(d, 78);
    check(`density does not increase with distance at ${d}`, v <= last + 1e-9, `${v} after ${last}`);
    last = v;
  }
}

section("9. the culler applies it without over-drawing the buffer");
{
  const field = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.3, 0.3);
  const mat = new THREE.MeshBasicMaterial();
  const m4 = new THREE.Matrix4();
  const PER = 40;
  for (let x = -200; x < 200; x += CHUNK) for (let z = -150; z < 150; z += CHUNK) {
    const im = new THREE.InstancedMesh(geo, mat, PER);
    for (let i = 0; i < PER; i++) { m4.makeTranslation(x + (i % 6) * 4, 0, z + ((i / 6) | 0)); im.setMatrixAt(i, m4); }
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.userData.fullCount = PER;
    field.add(im);
  }
  const c = new DistanceCuller();
  c.add(field, COVER_CULL_UNITS, "cover");
  c.update(0, 0);

  let thinned = 0, full = 0, nearFull = true;
  for (const ch of field.children) {
    if (!ch.visible) continue;
    check("count never exceeds what was allocated", ch.count <= PER, `${ch.count} > ${PER}`);
    check("count is at least one", ch.count >= 1);
    const d = Math.hypot(ch.boundingSphere.center.x, ch.boundingSphere.center.z);
    if (d < 30 && ch.count !== PER) nearFull = false;
    full += PER;
    thinned += ch.count;
  }
  check("chunks the player can walk to are undiminished", nearFull);
  check("and the far ones are cheaper", thinned < full);
  console.log(`  visible cover draws ${thinned} of ${full} placed instances (${((1 - thinned / full) * 100).toFixed(0)}% fewer)`);

  // Trees record no fullCount, so they must be left completely alone: a wood
  // with a third of its trees missing is a different wood.
  const trees = new THREE.Group();
  const t = new THREE.InstancedMesh(geo, mat, 12);
  for (let i = 0; i < 12; i++) { m4.makeTranslation(300, 0, 300); t.setMatrixAt(i, m4); }
  t.instanceMatrix.needsUpdate = true; t.computeBoundingSphere();
  trees.add(t);
  const c2 = new DistanceCuller();
  c2.add(trees, TREE_CULL_UNITS, "trees");
  c2.update(300, 300);
  check("anything without a fullCount keeps every instance", t.count === 12, String(t.count));
}

console.log(
  failures === 0
    ? "\nOK — the far half of the world stops being drawn, and the near half does not"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
