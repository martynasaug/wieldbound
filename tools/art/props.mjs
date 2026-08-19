// Pulls named models out of the Fantasy Props MegaKit.
//
// The kit is 94 models in one 74 MB zip served directly by OpenGameArt, and the
// game uses a handful of them: six for the smithy (fetched by hand originally,
// listed here now so the set is reproducible) and two for ground loot.
//
// WHAT MAKES A PROP CHEAP TO ADD. The whole kit shares three "trim" atlases —
// furniture, metal and props — each with a BaseColor, Normal and ORM map. Every
// model already in the repo uses those three, so a new prop that also uses them
// costs its own geometry and NOTHING else. `REQUIRED` below is checked against
// exactly that: a model needing a fourth atlas is refused rather than quietly
// dragging two megabytes of texture in behind it.
//
//   node tools/art/props.mjs

import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

const ZIP_URL = "https://opengameart.org/sites/default/files/fantasy_props_megakitstandard.zip";
const OUT_DIR = path.resolve(import.meta.dirname, "../../client/public/models/props");

/** The atlases already in the repo. A model wanting anything else is refused. */
const ALLOWED_TEXTURES = new Set([
  "T_Trim_Furniture_BaseColor.png", "T_Trim_Furniture_Normal.png", "T_Trim_Furniture_ORM.png",
  "T_Trim_Metal_BaseColor.png", "T_Trim_Metal_Normal.png", "T_Trim_Metal_ORM.png",
  "T_Trim_Props_BaseColor.png", "T_Trim_Props_Normal.png", "T_Trim_Props_ORM.png",
]);

const REQUIRED = [
  // the smithy
  "Anvil_Log", "Workbench", "WeaponStand", "Barrel", "Crate_Wooden", "Whetstone",
  // ground loot: what a drop looks like when the item itself has no model
  "Pouch_Large", "Chest_Wood",
];

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wb-props-"));
  const zipPath = path.join(tmp, "props.zip");

  process.stdout.write(`fetching ${ZIP_URL}\n`);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
  const { size } = await fs.stat(zipPath);
  process.stdout.write(`  ${(size / 1024 / 1024).toFixed(1)} MB\n`);

  const unpacked = path.join(tmp, "unpacked");
  execFileSync("powershell", [
    "-NoProfile", "-Command",
    `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${unpacked}' -Force`,
  ]);

  const gltfDir = await findDir(unpacked, "glTF");
  if (!gltfDir) throw new Error("no glTF folder in the archive");

  await fs.mkdir(OUT_DIR, { recursive: true });
  let copied = 0;
  let refused = 0;
  for (const name of REQUIRED) {
    const gltfPath = path.join(gltfDir, `${name}.gltf`);
    let source;
    try {
      source = await fs.readFile(gltfPath, "utf8");
    } catch {
      process.stdout.write(`  MISSING ${name}.gltf\n`);
      process.exitCode = 1;
      continue;
    }
    // Every texture it references must already be one we ship.
    const wants = [...source.matchAll(/"uri"\s*:\s*"([^"]+\.png)"/g)].map((m) => m[1]);
    const extra = wants.filter((t) => !ALLOWED_TEXTURES.has(t));
    if (extra.length) {
      process.stdout.write(`  REFUSED ${name}: needs ${[...new Set(extra)].join(", ")}\n`);
      refused++;
      continue;
    }
    await fs.copyFile(gltfPath, path.join(OUT_DIR, `${name}.gltf`));
    await fs.copyFile(path.join(gltfDir, `${name}.bin`), path.join(OUT_DIR, `${name}.bin`));
    copied++;
  }

  process.stdout.write(
    `copied ${copied} models to ${OUT_DIR}` +
      (refused ? `, refused ${refused} for wanting a new atlas\n` : "\n"),
  );
  await fs.rm(tmp, { recursive: true, force: true });
}

async function findDir(root, name) {
  for (const e of await fs.readdir(root, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const here = path.join(root, e.name);
    if (e.name.toLowerCase() === name.toLowerCase()) return here;
    const nested = await findDir(here, name);
    if (nested) return nested;
  }
  return null;
}

await main();
