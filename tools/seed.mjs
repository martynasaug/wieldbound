// Gives a named character an endgame kit, for testing things a fresh character
// cannot reach.
//
// PLAN has referred to "the seeding recipe" since Phase 50 without one actually
// existing — it was a paragraph describing what somebody had once typed into
// sqlite by hand. This is that, written down and repeatable, because the things
// it exists to test are the things nobody can reach by playing for ten minutes:
// a tier-3 talent, a band-5 affix, a level-gated quest chain, a matched set
// bonus, or simply what the game looks like when the player is not holding a
// stick.
//
// THE SERVER MUST BE STOPPED. It holds the SQLite file open with a write-ahead
// log, and writing underneath it means the next thing it flushes will overwrite
// this — silently, and only sometimes, which is the worst way for a dev tool to
// fail.
//
// The check is an EXCLUSIVE LOCK rather than a look at the WAL's size, and the
// difference matters: a server killed rather than shut down leaves megabytes of
// WAL behind it, so the size heuristic refused to run against a database that
// was perfectly free. Asking SQLite for the lock asks the actual question, and
// it is the question that has a right answer.
//
//   node tools/seed.mjs Sawyer
//   node tools/seed.mjs Sawyer --level 40
//
// It is deliberately IDEMPOTENT for items: every run clears what it gave last
// time before granting again, so running it twice does not leave forty
// Frostbrands in the bag. It never touches anything else the character owns.

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ITEM_BASES, rollItem, itemName } from "../shared/items.ts";
import {
  MAX_WEAPON_LEVEL,
  WEAPON_TYPES,
  classForWeapon,
  maxHpForLevel,
  weaponXpToNext,
} from "../shared/protocol-types.ts";

const DB_PATH = "server/data/wieldbound.db";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const levelArg = Number(args[args.indexOf("--level") + 1]);
const LEVEL = Number.isFinite(levelArg) && levelArg > 0 ? Math.floor(levelArg) : 40;

if (!name) {
  console.error("usage: node tools/seed.mjs <characterName> [--level N]");
  process.exit(1);
}
if (!existsSync(DB_PATH)) {
  console.error(`no database at ${DB_PATH} — run the game once first`);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

// Is anybody else in here? An exclusive lock fails outright if the server has
// the file open for writing, and costs nothing if it does not.
try {
  db.exec("BEGIN EXCLUSIVE");
  db.exec("ROLLBACK");
} catch (err) {
  console.error(
    "the database is locked — the server is still running.\n" +
      "Stop it first, or this write will be overwritten when it next flushes.",
  );
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}

// Fold the write-ahead log back into the file before touching anything. A
// server that was killed rather than stopped leaves the whole session sitting
// in the WAL, and a seed written on top of an unmerged log is a seed that may
// or may not survive the next process to open the file.
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
const character = db.prepare("SELECT * FROM characters WHERE name = ?").get(name);
if (!character) {
  const near = db
    .prepare("SELECT name FROM characters ORDER BY lastSeenAt DESC LIMIT 8")
    .all()
    .map((r) => r.name);
  console.error(`no character called "${name}". Log in with that name once first.`);
  console.error(`recently seen: ${near.join(", ")}`);
  process.exit(1);
}

// --- What "the best" means ----------------------------------------------------
//
// Best-in-slot at the top of the ladder, NOT a matched set — the two are
// different answers and this is the one that tests the ceiling. A full matched
// kit deliberately loses to a mixed set one quality step higher (see the set
// bonus note in items.ts), so a set would be testing the weaker of the two.
//
// The affixes are asked for rather than rolled. `rollItem` filters a keep-list
// against exactly the same eligibility a real roll uses, so this is not a way
// past the rules — an affix the base could never have rolled is dropped and the
// dice fill the gap, which is also what makes the list below safe to leave
// slightly optimistic.
const KIT = [
  // Every weapon family, so every talent tree and every damage school is one
  // bag slot away. This is the whole point of the seed: "you are whatever
  // you're holding" is untestable while you own one weapon.
  { base: "frostbrand", affixes: ["heavy", "cruel", "tempest"] },
  { base: "claymore", affixes: ["heavy", "boar", "tempest"] },
  { base: "reaperscythe", affixes: ["heavy", "cruel", "tempest"] },
  { base: "dawnbreaker", affixes: ["heavy", "mountain", "tempest"] },
  { base: "thunderhead", affixes: ["heavy", "cruel", "tempest"], equip: true },
  { base: "venomkiss", affixes: ["keen", "adder", "swift"] },
  { base: "ruinstring", affixes: ["keen", "cruel", "tempest"] },
  { base: "starcaller", affixes: ["attuned", "archive", "rapid"] },
  { base: "stormrod", affixes: ["attuned", "archive", "thrifty"] },

  // And one of everything else, worn.
  { base: "verdantaegis", affixes: ["warded", "mountain", "bear"], equip: true },
  { base: "dreadhelm", affixes: ["stout", "mountain", "warded"], equip: true },
  { base: "dragonscale", affixes: ["stout", "mountain", "warded"], equip: true },
  { base: "striderboots", affixes: ["fleet", "stag", "supple"], equip: true },
  { base: "shadowveil", affixes: ["fleet", "supple", "bear"], equip: true },
  { base: "runedloop", affixes: ["keen", "adder", "attuned"], equip: true },

  // Spares in the other styles, so the paperdoll's four visible slots can be
  // looked at in plate, robe and scale without re-running this.
  { base: "archmagerobe", affixes: ["attuned", "archive", "wellspring"] },
  { base: "gildedplate", affixes: ["stout", "mountain", "warded"] },
  { base: "blackglassmail", affixes: ["supple", "fox", "adder"] },
  { base: "gildedcrown", affixes: ["attuned", "archive", "keen"] },
  { base: "rimeboots", affixes: ["fleet", "glacier", "stag"] },
  { base: "stormcloak", affixes: ["fleet", "earthed", "supple"] },
  { base: "blackglassring", affixes: ["keen", "adder", "leech"] },
];

// A fixed generator, so two runs of this produce the same kit. The jitter in
// `rollItem` is ±8% and nothing here is a surprise worth preserving; what a
// repeatable seed buys is a bug report that means the same thing twice.
let s = 0x5eed1234;
const rand = () => {
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  return s / 4294967296;
};

const now = Date.now();
const insert = db.prepare(
  "INSERT INTO items (id, characterId, baseId, slot, rarity, statValue, bonusStatValue," +
    " affixes, etched, equipped, createdAt, weaponType, style) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
);

// Idempotent: clear what a previous run granted. Matched on the exact base ids
// this tool hands out, so anything the player found or forged is left alone.
const ids = KIT.map((k) => k.base);
const cleared = db
  .prepare(
    `DELETE FROM items WHERE characterId = ? AND baseId IN (${ids.map(() => "?").join(",")})`,
  )
  .run(character.id, ...ids).changes;

// UNEQUIP WHAT IS ALREADY WORN in every slot this run is about to fill.
//
// Not tidiness — a correctness bug the first run shipped. Sawyer still had the
// starter weapon on, so granting an equipped Thunderhead left TWO items flagged
// equipped in the weapon slot. The server reads a slot expecting one thing and
// takes whichever the query returns first, which is a coin flip that would have
// looked like "the seed sometimes does not work".
const fillSlots = [
  ...new Set(KIT.filter((k) => k.equip).map((k) => ITEM_BASES[k.base]?.slot).filter(Boolean)),
];
const unequipped = db
  .prepare(
    `UPDATE items SET equipped = 0 WHERE characterId = ? AND equipped = 1` +
      ` AND slot IN (${fillSlots.map(() => "?").join(",")})`,
  )
  .run(character.id, ...fillSlots).changes;

let equippedWeapon = null;
const granted = [];
for (const entry of KIT) {
  const base = ITEM_BASES[entry.base];
  if (!base) {
    console.error(`  ! no such base item "${entry.base}" — skipped`);
    continue;
  }
  const rolled = rollItem(base, "enchanted", rand, undefined, entry.affixes);
  const equip = entry.equip ? 1 : 0;
  if (equip && base.weaponType) equippedWeapon = base.weaponType;
  insert.run(
    randomUUID(),
    character.id,
    rolled.baseId,
    rolled.slot,
    rolled.rarity,
    rolled.statValue,
    rolled.bonusStatValue,
    JSON.stringify(rolled.affixes),
    "[]",
    equip,
    now,
    rolled.weaponType ?? null,
    rolled.style ?? null,
  );
  granted.push({ entry, rolled, base, equip });
}

// --- The character themselves --------------------------------------------------
//
// Attributes are spent rather than left as points, because an unspent pool is a
// character who still cannot hit anything — and the whole reason to seed is to
// skip that. A few points are left over so the spend screen is testable too.
const STR = 40;
const AGI = 40;
const VIT = 40;
const INT = 40;
const SPARE_POINTS = 10;

db.prepare(
  "UPDATE characters SET level = ?, xp = 0, statPoints = ?, strength = ?, agility = ?," +
    " vitality = ?, intelligence = ?, hp = ?, wood = ?, ore = ?, herb = ?, essence = ?," +
    " ingot = ?, weave = ?, potions = ?, tonics = ?, characterClass = ? WHERE id = ?",
).run(
  LEVEL,
  SPARE_POINTS,
  STR,
  AGI,
  VIT,
  INT,
  maxHpForLevel(LEVEL, VIT),
  9999,
  9999,
  9999,
  999,
  999,
  999,
  50,
  50,
  classForWeapon(equippedWeapon),
  character.id,
);

// Every weapon tree at the cap, so all eight are spendable immediately. XP is
// the total the curve asks for rather than a big round number, because the
// interface shows progress WITHIN the level and a character carrying nine
// thousand spare points into level 20 would render as a full bar forever.
let capXp = 0;
for (let level = 1; level < MAX_WEAPON_LEVEL; level++) capXp += weaponXpToNext(level);
const setProgress = db.prepare(
  "INSERT INTO weapon_progress (characterId, weaponType, xp) VALUES (?,?,?)" +
    " ON CONFLICT(characterId, weaponType) DO UPDATE SET xp = excluded.xp",
);
for (const w of WEAPON_TYPES) setProgress.run(character.id, w, capXp);
// Talent RANKS are deliberately not touched. Points are the thing that is hard
// to reach; which nodes they go into is the decision being tested, and spending
// them for somebody would remove the thing they were seeded to try.
const spentRanks = db
  .prepare("SELECT COUNT(*) AS n FROM weapon_talents WHERE characterId = ?")
  .get(character.id).n;

console.log(`\nSeeded "${character.name}" (${character.id.slice(0, 8)})`);
console.log(`  level ${LEVEL}, ${STR}/${AGI}/${VIT}/${INT} + ${SPARE_POINTS} unspent`);
console.log(`  ${maxHpForLevel(LEVEL, VIT)} hp, materials topped up, 50 potions, 50 tonics`);
console.log(
  `  every weapon tree at level ${MAX_WEAPON_LEVEL} — ${MAX_WEAPON_LEVEL} points each,` +
    ` ${spentRanks} rank(s) already spent`,
);
if (cleared > 0) console.log(`  cleared ${cleared} item(s) from a previous seed`);
if (unequipped > 0) console.log(`  took off ${unequipped} item(s) already worn`);
console.log(`  ${granted.length} items:`);
for (const g of granted) {
  const asked = new Set(g.entry.affixes);
  const got = g.rolled.affixes;
  const substituted = got.filter((a) => !asked.has(a));
  console.log(
    `    ${g.equip ? "*" : " "} ${itemName(g.rolled).padEnd(42)} ` +
      `${String(g.rolled.statValue).padStart(4)}/${String(g.rolled.bonusStatValue).padStart(4)}` +
      (substituted.length ? `   (rolled ${substituted.join(", ")} instead)` : ""),
  );
}
console.log("  * = equipped\n");
db.close();
