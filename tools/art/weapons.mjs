// Fetches the weapon models the item catalogue is built on.
//
// Quaternius's "LowPoly Medieval Weapons" (Sept 2018), CC0, 23 models in one
// 3.7 MB zip served directly by OpenGameArt — so unlike the Ultimate Monsters
// pack, which lives behind a Google Drive folder and had to be downloaded by
// hand, this one is reproducible from a script.
//
// Two things make this pack the right one rather than merely an available one:
//
//   1. It is the same stylisation as everything else in the world. The nature
//      kit, the props kit and the monsters are all Quaternius, and a weapon
//      from a different artist reads as a mistake in the player's hand even
//      when it is a better model.
//   2. It ships NO TEXTURES. Every mesh is flat material colour under a small
//      shared vocabulary — Steel, DarkSteel, LightSteel, Wood, Gold, Black and
//      a few accents. That is exactly what the gear system already wants: the
//      material names map onto the game's material ROLES, so an item's palette
//      can repaint a mesh and rarity can tint it, both without touching a UV.
//
// The FBX are copied through unconverted. They are 888 KB for all twenty-three
// and the client already loads FBX for the character rigs, so a glTF conversion
// step would buy nothing and cost a dependency.
//
//   node tools/art/weapons.mjs

import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

const ZIP_URL =
  "https://opengameart.org/sites/default/files/Medieval%20Weapons%20Pack%20-%20Sept%202018.zip";
const OUT_DIR = path.resolve(import.meta.dirname, "../../client/public/models/weapons");

// What the game actually names. Everything in the zip's FBX folder is copied,
// but this list is what `shared/items.ts` points at, and the run fails loudly
// if any of it is missing — a weapon whose model 404s is invisible in the
// player's hand and silent everywhere else.
const REQUIRED = [
  "Sword", "Sword_2", "Sword_Big", "Sword_Golden", "Claymore",
  "Axe", "Axe_Double", "Axe_Small",
  "Hammer_Double", "Hammer_Small",
  "Dagger", "Dagger_2",
  "Bow_Wooden", "Bow_Wooden2", "Bow_Golden", "Bow_Evil",
  "Spear", "Scythe",
  "Shield_Round", "Shield_Round_2", "Shield_Heater", "Shield_Heater_2",
  "Shield_Celtic_Golden",
  "Arrow",
];

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wb-weapons-"));
  const zipPath = path.join(tmp, "weapons.zip");

  process.stdout.write(`fetching ${ZIP_URL}\n`);
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zipPath));
  const { size } = await fs.stat(zipPath);
  process.stdout.write(`  ${(size / 1024 / 1024).toFixed(1)} MB\n`);

  // PowerShell's Expand-Archive rather than a zip dependency: this is a
  // Windows-first checkout and the script already assumes nothing else.
  const unpacked = path.join(tmp, "unpacked");
  execFileSync("powershell", [
    "-NoProfile", "-Command",
    `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${unpacked}' -Force`,
  ]);

  const fbxDir = await findFbxDir(unpacked);
  if (!fbxDir) throw new Error("no FBX folder in the archive");

  await fs.mkdir(OUT_DIR, { recursive: true });
  const files = (await fs.readdir(fbxDir)).filter((f) => f.toLowerCase().endsWith(".fbx"));
  let bytes = 0;
  for (const file of files) {
    const from = path.join(fbxDir, file);
    await fs.copyFile(from, path.join(OUT_DIR, file));
    bytes += (await fs.stat(from)).size;
  }
  process.stdout.write(`copied ${files.length} models (${(bytes / 1024).toFixed(0)} KB) to ${OUT_DIR}\n`);

  const have = new Set(files.map((f) => f.replace(/\.fbx$/i, "")));
  const missing = REQUIRED.filter((r) => !have.has(r));
  if (missing.length) {
    // Same reasoning as the icon generator validating names before it fetches:
    // when the data is hand-authored and the failure is silent, assert it.
    process.stdout.write(`MISSING, and the catalogue names these:\n  ${missing.join(", ")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`all ${REQUIRED.length} models the catalogue names are present\n`);

  await fs.rm(tmp, { recursive: true, force: true });
}

async function findFbxDir(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const here = path.join(root, e.name);
    if (e.name.toUpperCase() === "FBX") return here;
    const nested = await findFbxDir(here);
    if (nested) return nested;
  }
  return null;
}

await main();
