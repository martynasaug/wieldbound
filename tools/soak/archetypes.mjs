// THE SHADER BUDGET, AS A GATE.
//
// WHY THIS EXISTS. The loading screen is the game compiling shader programs —
// 129 of them, roughly 50ms each, about 6.4s of a ~10s cold load (M70.192).
// Everything else in the load is noise beside it. And the count does not grow
// with how much art there is: 340 distinct materials in the world collapse
// into 26 shader ARCHETYPES, because three.js keys a program on a material's
// FEATURE MIX — skinned, transparent, double-sided, which texture maps it has
// — and never on the content of a texture. A hundred different barks are one
// program. One model that is the only double-sided alpha-tested thing in the
// game is a program all by itself.
//
// So the rule that keeps the load flat while the game grows is not "use less
// art". It is "use the archetypes that already exist". A thousand new models
// that reuse them cost ZERO new programs and ZERO extra load. One that
// introduces a 27th combination costs ~50ms forever, on every player's first
// visit, whether or not anybody notices.
//
// Nobody can follow that rule by remembering it, so this checks it. The
// approved set lives in `archetypes.json` beside this file; the tool walks the
// real scene, builds the same signature three.js would key on, and fails if a
// combination appears that is not in the list.
//
//   node tools/soak/archetypes.mjs            check against the baseline
//   node tools/soak/archetypes.mjs --bless    accept the current set as the baseline
//
// A NEW ARCHETYPE IS NOT AUTOMATICALLY WRONG. Sometimes an effect genuinely
// needs one and it is worth 50ms. `--bless` is how that is recorded — but it
// should be a decision somebody made, which is the entire point of making it a
// separate command rather than a silent update.
//
// This cannot live in `tools/test/` with the rest of the suite: every test
// there is Node-only, and a material's feature mix does not exist until a real
// WebGL context has loaded the models. It is a gate to run when art changes.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { open, login } from "./driver.mjs";

const BASELINE = new URL("./archetypes.json", import.meta.url);
const BLESS = process.argv.includes("--bless");

const { browser, page } = await open({ headless: false, width: 1200, height: 700 });
await page.bringToFront();
await login(page, process.argv[2]?.startsWith("--") ? "Player3619" : process.argv[2] ?? "Player3619");
// The tail of the load compiles the last of the programs; sampling before it
// settles reports a set that is missing whatever had not been drawn yet.
await page.waitForTimeout(1500);

const found = await page.evaluate(() => {
  const g = window.__wieldbound;
  const seen = new Map();
  g.world.scene.traverse((o) => {
    const mesh = o;
    if (!mesh.isMesh && !mesh.isSkinnedMesh && !mesh.isPoints && !mesh.isLine) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!m) continue;
      // EXACTLY THE FIELDS THREE FORKS A PROGRAM ON, and nothing else. Colour,
      // roughness value, texture content and object count are all absent on
      // purpose: none of them creates a program, and including them would turn
      // this into a diff of the art instead of a budget on the shaders.
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
        m.defines ? "defines:" + Object.keys(m.defines).sort().join("+") : "",
      ].filter(Boolean).join(" ");
      const rec = seen.get(sig) ?? { n: 0, names: new Set() };
      rec.n++;
      rec.names.add(m.name || "(unnamed)");
      seen.set(sig, rec);
    }
  });
  return {
    archetypes: [...seen.entries()].map(([sig, r]) => ({ sig, n: r.n, names: [...r.names].slice(0, 4) })),
    materials: [...seen.values()].reduce((a, r) => a + r.n, 0),
    programs: g.world.renderer.info.programs.length,
  };
});
await browser.close();

found.archetypes.sort((a, b) => b.n - a.n);
const names = found.archetypes.map((a) => a.sig).sort();

console.log(
  `${found.archetypes.length} shader archetypes across ${found.materials} materials ` +
    `(${found.programs} programs compiled)\n`,
);

if (BLESS || !existsSync(BASELINE)) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ archetypes: names, note: "Approved shader archetypes — see archetypes.mjs" }, null, 2) + "\n",
  );
  console.log(`baseline written with ${names.length} archetypes.`);
  for (const a of found.archetypes) console.log(`  n=${String(a.n).padStart(3)}  ${a.sig}`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, "utf8")).archetypes;
const added = names.filter((n) => !base.includes(n));
const gone = base.filter((n) => !names.includes(n));

for (const a of found.archetypes) {
  const mark = added.includes(a.sig) ? "NEW " : "    ";
  console.log(`  ${mark}n=${String(a.n).padStart(3)}  ${a.sig}`);
  if (added.includes(a.sig)) console.log(`         first seen on: ${a.names.join(", ")}`);
}

// A DISAPPEARING ARCHETYPE IS NOT A FAILURE. The scene is sampled live, and
// what is standing in it depends on where the character logged in and what has
// spawned. Something missing means it was not on screen; something NEW means an
// asset genuinely introduced a combination the game did not have.
if (gone.length) console.log(`\n${gone.length} baseline archetype(s) not seen this run — probably just absent from the scene, not removed.`);

if (added.length) {
  console.log(
    `\nFAIL — ${added.length} new shader archetype(s), paid on every player's first load,\n` +
      `  forever. An archetype is not one program: it also gets a depth program for\n` +
      `  casting shadows and, if it is a tree or a wall, a see-through variant for\n` +
      `  fading — 30 archetypes stand behind 129 programs at ~50ms each. So budget a\n` +
      `  new one at somewhere between 50 and 150ms, not at 50.\n` +
      `  Either rebuild the asset to use a combination the game already has, or accept\n` +
      `  the cost deliberately with:  node tools/soak/archetypes.mjs --bless`,
  );
  process.exit(1);
}
console.log("\nOK — no new shader archetypes.");
