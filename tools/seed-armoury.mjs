// ONE OF EVERY WEAPON AND OFF-HAND, FOR LOOKING AT.
//
// `weapongrip.mjs` can only photograph what a character can hold, and the
// seeded kit carries one weapon per FAMILY — eight of the fifty-four bases. But
// how a weapon sits in the hand is a property of its MODEL, not its family:
// fifty-four bases share twenty-nine distinct (model, lay) pairs, and a fault in
// one of them is invisible from the other twenty-eight.
//
// So this grants the whole armoury to one character, so every distinct model
// can be held and judged.
//
// Idempotent in the same way `seed.mjs` is: it deletes exactly the ids it
// grants before granting them, so anything found or forged is left alone and
// re-running does not fill the bag with duplicates.
//
//     npm run dev:server   (stop it first — SQLite is single-writer)
//     node tools/seed-armoury.mjs Armoury
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITEM_BASES, rollItem } from "../shared/items.ts";

const NAME = process.argv[2] ?? "Armoury";
const RARITY = process.argv[3] ?? "honed";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(here, "..", "server", "data", "wieldbound.db");
const db = new DatabaseSync(dbPath);

const character = db.prepare("SELECT id FROM characters WHERE name = ?").get(NAME);
if (!character) {
  console.error(`no character called "${NAME}". Log in once with that name first, then re-run.`);
  process.exit(1);
}

const bases = Object.values(ITEM_BASES).filter((b) => b.slot === "weapon" || b.slot === "offhand");
const ids = bases.map((b) => b.id);

const cleared = db
  .prepare(`DELETE FROM items WHERE characterId = ? AND baseId IN (${ids.map(() => "?").join(",")})`)
  .run(character.id, ...ids).changes;

const insert = db.prepare(
  "INSERT INTO items (id, characterId, baseId, slot, rarity, statValue, bonusStatValue," +
    " affixes, etched, equipped, createdAt, weaponType, style) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
);

let seed = 0x9e3779b9;
const rand = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

const now = Date.now();
for (const base of bases) {
  const rolled = rollItem(base, RARITY, rand);
  insert.run(
    randomUUID(),
    character.id,
    rolled.baseId,
    rolled.slot,
    rolled.rarity,
    rolled.statValue,
    rolled.bonusStatValue,
    JSON.stringify(rolled.affixes ?? []),
    JSON.stringify(rolled.etched ?? []),
    0,
    now,
    rolled.weaponType ?? null,
    rolled.style ?? null,
  );
}

const models = new Set(bases.map((b) => `${b.art?.model ?? b.art?.build}|${b.art?.lay ?? "along"}`));
console.log(
  `${NAME}: cleared ${cleared}, granted ${bases.length} bases at "${RARITY}" ` +
    `covering ${models.size} distinct (model, lay) pairs.`,
);
