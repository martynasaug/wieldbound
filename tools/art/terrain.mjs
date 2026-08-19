// Downloads the ground textures the terrain is drawn with, from Poly Haven.
//
// Three maps per surface, and the third is the reason this is worth doing
// properly: Poly Haven ships an "arm" texture that packs ambient occlusion,
// roughness and metalness into the R, G and B channels of ONE image. three.js
// reads exactly those channels for aoMap, roughnessMap and metalnessMap, so a
// single 200 KB download does the work of three and costs one texture unit
// instead of three.
//
// Everything here is CC0. Sizes are 1k deliberately: the ground is tiled every
// few metres, so resolution buys nothing past the tile — what stops it looking
// repetitive is the macro variation the shader adds, not a bigger source image.
//
//   node tools/art/terrain.mjs
//   node tools/art/terrain.mjs --check   # report sizes, download nothing

import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const DEST = "client/public/textures/terrain";
const API = "https://api.polyhaven.com/files";

// surface -> the Poly Haven asset it comes from.
const SURFACES = {
  grass: "leafy_grass",
  dirt: "dirt",
};

// Poly Haven's map name -> ours. `nor_gl` is the OpenGL-convention normal map,
// which is the one three.js wants; `nor_dx` has its green channel inverted and
// would light every bump from the wrong side.
const MAPS = {
  Diffuse: "diff",
  nor_gl: "nor",
  arm: "arm",
};

const checkOnly = process.argv.includes("--check");
mkdirSync(DEST, { recursive: true });

let total = 0;
for (const [surface, asset] of Object.entries(SURFACES)) {
  const res = await fetch(`${API}/${asset}`);
  if (!res.ok) throw new Error(`${asset}: HTTP ${res.status}`);
  const files = await res.json();

  for (const [phName, ours] of Object.entries(MAPS)) {
    const entry = files[phName]?.["1k"]?.jpg;
    if (!entry) throw new Error(`${asset}: no 1k jpg for ${phName}`);

    const out = join(DEST, `${surface}_${ours}.jpg`);
    total += entry.size;
    if (checkOnly) {
      console.log(`  ${surface}_${ours}`.padEnd(18) + `${(entry.size / 1024).toFixed(0)} KB  ${entry.url}`);
      continue;
    }
    if (existsSync(out) && statSync(out).size === entry.size) {
      console.log(`  ${surface}_${ours}`.padEnd(18) + "already current");
      continue;
    }
    const img = await fetch(entry.url);
    if (!img.ok) throw new Error(`${entry.url}: HTTP ${img.status}`);
    writeFileSync(out, Buffer.from(await img.arrayBuffer()));
    console.log(`  ${surface}_${ours}`.padEnd(18) + `${(entry.size / 1024).toFixed(0)} KB`);
  }
}

console.log(`\n${Object.keys(SURFACES).length} surfaces, ${(total / 1024 / 1024).toFixed(1)} MB total`);
