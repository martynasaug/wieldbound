// WHAT THE 128 SHADER PROGRAMS ACTUALLY ARE.
//
// M70.192 established that the load IS the programs — 128 of them, ~50ms each,
// 6.4s of a ~10s load — and that program count follows the number of distinct
// materials in the art. That was the end of the measurement and the start of a
// content decision, and a content decision cannot be made from the number 128.
// "Use fewer materials" is not an instruction anybody can act on.
//
// So this asks three.js directly. `renderer.info.programs` is the real list,
// each with the cache key it was built from and how many materials share it —
// no decoding of internals, no guessing.
//
// AND SEPARATELY, a signature per material built from the properties three
// keys programs on: which texture maps it has, whether it is skinned,
// transparent, double-sided, vertex-coloured. Two materials with the same
// signature COMPILE THE SAME PROGRAM no matter how different they look, so
// this is the thing that says whether the variety is real or accidental.
// A hundred stone textures cost one program; one material that is the only
// double-sided one in the game costs a whole program by itself.
//
// A program used by exactly one material is the interesting row: it is a
// feature combination nothing else in the game shares.
//
//   node tools/soak/programs.mjs
import { open, login } from "./driver.mjs";

const { browser, page } = await open({ headless: false, width: 1200, height: 700 });
await page.bringToFront();
await login(page, process.argv[2] ?? "Player3619");
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  const g = window.__wieldbound;
  const r = g.world.renderer;

  // --- ground truth: three's own program list ------------------------------
  const programs = [...r.info.programs].map((p) => ({
    key: p.cacheKey,
    used: p.usedTimes,
  }));

  // --- every material in the world, and what three would key it on ---------
  const seen = new Map(); // material -> { sig, names:Set }
  const visit = (root, where) => {
    if (!root) return;
    root.traverse((o) => {
      const mesh = o;
      if (!mesh.isMesh && !mesh.isSkinnedMesh && !mesh.isPoints && !mesh.isLine) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) {
        if (!m) continue;
        const sig = [
          m.type,
          mesh.isSkinnedMesh ? "skinned" : "",
          m.map ? "map" : "",
          m.normalMap ? "normal" : "",
          m.roughnessMap ? "rough" : "",
          m.metalnessMap ? "metal" : "",
          m.aoMap ? "ao" : "",
          m.emissiveMap ? "emissive" : "",
          m.alphaMap ? "alpha" : "",
          m.lightMap ? "light" : "",
          m.envMap ? "env" : "",
          m.displacementMap ? "disp" : "",
          m.vertexColors ? "vcolors" : "",
          m.transparent ? "transparent" : "",
          m.alphaTest > 0 ? "alphaTest" : "",
          m.side === 2 ? "double" : m.side === 1 ? "back" : "",
          m.flatShading ? "flat" : "",
          m.wireframe ? "wire" : "",
          m.fog === false ? "nofog" : "",
          m.toneMapped === false ? "notonemap" : "",
          m.onBeforeCompile ? "CUSTOM" : "",
          m.defines ? "defines:" + Object.keys(m.defines).sort().join("+") : "",
        ].filter(Boolean).join(" ");
        let rec = seen.get(m);
        if (!rec) seen.set(m, (rec = { sig, names: new Set(), where: new Set() }));
        rec.names.add(m.name || "(unnamed)");
        rec.where.add(where);
      }
    });
  };
  visit(g.world.scene, "scene");

  const bySig = new Map();
  for (const rec of seen.values()) {
    let b = bySig.get(rec.sig);
    if (!b) bySig.set(rec.sig, (b = { n: 0, names: new Set(), where: new Set() }));
    b.n++;
    for (const x of rec.names) b.names.add(x);
    for (const x of rec.where) b.where.add(x);
  }

  return {
    programCount: programs.length,
    programs,
    materialCount: seen.size,
    sigs: [...bySig.entries()].map(([sig, b]) => ({
      sig,
      n: b.n,
      names: [...b.names].slice(0, 6),
    })),
  };
});

console.log(`${out.programCount} shader programs, ${out.materialCount} distinct materials in the scene\n`);

const once = out.programs.filter((p) => p.used === 1).length;
console.log(`programs shared by more than one material: ${out.programs.length - once}`);
console.log(`programs used by exactly ONE material:     ${once}   <- each of these is ~50ms spent for a single object type\n`);

// WHICH PARAMETER IS DOING THE SPLITTING. The cache key is a comma-joined list
// of every parameter, in a fixed order, so a position whose value differs
// across programs is a feature that is forking them. Positions that never vary
// are shared settings and cost nothing.
const rows = out.programs.map((p) => p.key.split(","));
const width = Math.max(...rows.map((r) => r.length));
const varying = [];
for (let i = 0; i < width; i++) {
  const vals = new Set(rows.map((r) => r[i]));
  if (vals.size > 1) varying.push({ i, vals: [...vals].slice(0, 8), n: vals.size });
}
console.log(`the cache key has ${width} fields; ${varying.length} of them differ between programs:`);
for (const v of varying.slice(0, 30)) {
  console.log(`   field ${String(v.i).padStart(3)}  ${v.n} values: ${v.vals.map((x) => (x.length > 22 ? x.slice(0, 22) + "…" : x)).join(" | ")}`);
}

console.log(`\n--- material feature combinations, commonest first ---`);
console.log(`(materials sharing a line share a program; a line with n=1 is a program of its own)`);
for (const s of out.sigs.sort((a, b) => b.n - a.n)) {
  console.log(`  n=${String(s.n).padStart(3)}  ${s.sig}`);
  if (s.n <= 2) console.log(`         ${s.names.join(", ")}`);
}
console.log("\nconsole errors:", page.__errors.length);
await browser.close();
