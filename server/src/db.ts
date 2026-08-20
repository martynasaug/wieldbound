import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import {
  xpToNextLevel,
  maxHpForLevel,
  xpRewardFor,
  POTION_CRAFT_COST,
  TONIC_CRAFT_COST,
  LOOT_DROP_CHANCE,
  INVENTORY_CAP,
  PLAYER_SPAWN,
  STAT_POINTS_PER_LEVEL,
  DAILY_BONUS_COOLDOWN_MS,
  DAILY_BONUS_REWARD,
  type ItemRarity,
  type ItemSlot,
  type ItemInstance,
  type GatherableResource,
  type MonsterKind,
  maxManaFor,
  CLASSES,
  type WeaponType,
  type GearStyle,
  type AttributeName,
  type LeaderboardEntry,
} from "../../shared/protocol-types.ts";
import {
  MATERIALS,
  isBasicRecipe,
  isTwoHanded,
  salvageYield,
  type Material,
  type MaterialCost,
} from "../../shared/items.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "wieldbound.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    characterId TEXT NOT NULL,
    slot TEXT NOT NULL,
    rarity TEXT NOT NULL,
    equipped INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  );
`);
for (const itemMigration of [
  "ALTER TABLE items ADD COLUMN statValue REAL NOT NULL DEFAULT 0",
  "ALTER TABLE items ADD COLUMN bonusStatValue REAL NOT NULL DEFAULT 0",
  // Which family a weapon belongs to. This is what decides the wielder's
  // class, so it is load-bearing rather than cosmetic.
  "ALTER TABLE items ADD COLUMN weaponType TEXT",
  // Which art an armour piece layers onto the body.
  "ALTER TABLE items ADD COLUMN style TEXT",
  // Which entry in the catalogue this is an instance of. The item system's
  // centre of gravity: everything an item IS now hangs off this.
  "ALTER TABLE items ADD COLUMN baseId TEXT",
  // Affix ids as a JSON array. A list on one row is the one shape a wide table
  // genuinely cannot hold — and unlike the talent ranks, which are keyed by
  // (character, weapon, node) and therefore earn their own table, these are
  // read and written only ever as a whole, with the item.
  "ALTER TABLE items ADD COLUMN affixes TEXT NOT NULL DEFAULT '[]'",
]) {
  try {
    db.exec(itemMigration);
  } catch {
    // column already exists from a previous run
  }
}

// --- One-time wipe: the old item model is gone ------------------------------
// Every item that predates the catalogue is an anonymous slot-and-rarity pair
// whose rarity is a word this game no longer has — "common" is not a step on
// the ladder any more. There is nothing to migrate them TO: a Broken Notched
// Dirk is not a translation of "a common weapon (sword)", it is a different
// object.
//
// So they are deleted, once, and the fact that it has happened is recorded —
// otherwise every restart would wipe a player's bag. The denormalised rarity
// columns on `characters` are cleared in the same breath, because they cache
// what is equipped and nothing is any more.
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_marks (
    mark TEXT PRIMARY KEY,
    appliedAt INTEGER NOT NULL
  );
`);
const ITEM_WIPE_MARK = "items-v2-catalogue";
const alreadyWiped = db
  .prepare("SELECT mark FROM schema_marks WHERE mark = ?")
  .get(ITEM_WIPE_MARK);
if (!alreadyWiped) {
  const before = (db.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n;
  db.exec("DELETE FROM items");
  db.exec("UPDATE characters SET weaponRarity = NULL, armorRarity = NULL, bootsRarity = NULL");
  db.prepare("INSERT INTO schema_marks (mark, appliedAt) VALUES (?, ?)").run(
    ITEM_WIPE_MARK,
    Date.now(),
  );
  console.log(`[db] item catalogue: cleared ${before} pre-catalogue item(s), once`);
}
for (const migration of [
  "ALTER TABLE characters ADD COLUMN wood INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN gatherLevel INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN xp INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN level INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE characters ADD COLUMN weaponRarity TEXT",
  "ALTER TABLE characters ADD COLUMN ore INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN battlePowerLevel INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN lastSeenAt INTEGER",
  "ALTER TABLE characters ADD COLUMN offlineGatherResource TEXT",
  "ALTER TABLE characters ADD COLUMN armorRarity TEXT",
  "ALTER TABLE characters ADD COLUMN bootsRarity TEXT",
  "ALTER TABLE characters ADD COLUMN hp INTEGER NOT NULL DEFAULT 50",
  "ALTER TABLE characters ADD COLUMN strength INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN agility INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN vitality INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN statPoints INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN offlineBattleMonsterKind TEXT",
  "ALTER TABLE characters ADD COLUMN potions INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN herb INTEGER NOT NULL DEFAULT 0",
  // The fourth material, and the only one that comes off a kill rather than out
  // of the ground. The top of the reforge ladder needs it, which is what stops
  // the strongest gear in the game being made by whoever stood at a tree
  // longest.
  "ALTER TABLE characters ADD COLUMN essence INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN lastDailyAt INTEGER",
  "ALTER TABLE characters ADD COLUMN tonics INTEGER NOT NULL DEFAULT 0",
  // Vestigial: class is no longer stored. It is derived from the equipped
  // weapon on every read (see classForWeapon), so this column is never
  // selected or written. It stays only because dropping a column would
  // rewrite the table for no benefit.
  "ALTER TABLE characters ADD COLUMN characterClass TEXT NOT NULL DEFAULT 'warrior'",
  "ALTER TABLE characters ADD COLUMN intelligence INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN mana INTEGER NOT NULL DEFAULT 40",
  // The refined tier. Made at the bench out of raw, never found and never given
  // back — see REFINING in shared/items.ts. Columns rather than a table because
  // the material list is small, fixed and read on every wallet update; the
  // statements below are GENERATED from that list, so a seventh material is a
  // row in shared and a migration line here, not four SQL strings to keep in
  // step with each other.
  "ALTER TABLE characters ADD COLUMN ingot INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN weave INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(migration);
  } catch {
    // column already exists from a previous run
  }
}

// --- Weapon proficiency and talents -----------------------------------------
// Two narrow tables rather than columns on `characters`: both are keyed by
// (character, weapon) and one of them is additionally keyed by node, which is
// a shape a wide row cannot hold without turning into JSON. Rows also mean the
// absence of a row is the honest representation of "never touched that weapon",
// instead of eight columns of zero on every character.
db.exec(`
  CREATE TABLE IF NOT EXISTS weapon_progress (
    characterId TEXT NOT NULL,
    weaponType TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (characterId, weaponType)
  );
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS weapon_talents (
    characterId TEXT NOT NULL,
    weaponType TEXT NOT NULL,
    nodeId TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (characterId, weaponType, nodeId)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS weapon_hotbar (
    characterId TEXT NOT NULL,
    weaponType TEXT NOT NULL,
    layout TEXT NOT NULL,
    PRIMARY KEY (characterId, weaponType)
  );
`);

/** The stored bar for one weapon, or null if the player has never edited it.
 *  Stored as JSON because it is a small opaque blob the database never needs
 *  to query into — the alternative is ten columns of nothing. */
export function getHotbar(characterId: string, weaponType: string): unknown {
  const row = db
    .prepare("SELECT layout FROM weapon_hotbar WHERE characterId = ? AND weaponType = ?")
    .get(characterId, weaponType) as { layout: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.layout);
  } catch {
    return null;
  }
}

export function setHotbar(characterId: string, weaponType: string, layout: unknown): void {
  db.prepare(
    "INSERT INTO weapon_hotbar (characterId, weaponType, layout) VALUES (?, ?, ?)" +
      " ON CONFLICT(characterId, weaponType) DO UPDATE SET layout = excluded.layout",
  ).run(characterId, weaponType, JSON.stringify(layout));
}

/** Total proficiency XP for one weapon. Absent rows read as zero. */
export function getWeaponXp(characterId: string, weaponType: string): number {
  const row = db
    .prepare("SELECT xp FROM weapon_progress WHERE characterId = ? AND weaponType = ?")
    .get(characterId, weaponType) as { xp: number } | undefined;
  return row?.xp ?? 0;
}

export function addWeaponXp(characterId: string, weaponType: string, amount: number): number {
  const next = getWeaponXp(characterId, weaponType) + Math.max(0, Math.round(amount));
  db.prepare(
    "INSERT INTO weapon_progress (characterId, weaponType, xp) VALUES (?, ?, ?)" +
      " ON CONFLICT(characterId, weaponType) DO UPDATE SET xp = excluded.xp",
  ).run(characterId, weaponType, next);
  return next;
}

/** Every talent rank for one weapon, as node id to rank. */
export function getTalentRanks(characterId: string, weaponType: string): Record<string, number> {
  const rows = db
    .prepare("SELECT nodeId, rank FROM weapon_talents WHERE characterId = ? AND weaponType = ? AND rank > 0")
    .all(characterId, weaponType) as { nodeId: string; rank: number }[];
  const out: Record<string, number> = {};
  for (const row of rows) out[row.nodeId] = row.rank;
  return out;
}

export function setTalentRank(
  characterId: string,
  weaponType: string,
  nodeId: string,
  rank: number,
): void {
  db.prepare(
    "INSERT INTO weapon_talents (characterId, weaponType, nodeId, rank) VALUES (?, ?, ?, ?)" +
      " ON CONFLICT(characterId, weaponType, nodeId) DO UPDATE SET rank = excluded.rank",
  ).run(characterId, weaponType, nodeId, rank);
}

export function clearTalents(characterId: string, weaponType: string): void {
  db.prepare("DELETE FROM weapon_talents WHERE characterId = ? AND weaponType = ?")
    .run(characterId, weaponType);
}

export interface CharacterRow {
  id: string;
  name: string;
  x: number;
  y: number;
  wood: number;
  ore: number;
  gatherLevel: number;
  battlePowerLevel: number;
  xp: number;
  level: number;
  weaponRarity: ItemRarity | null;
  armorRarity: ItemRarity | null;
  bootsRarity: ItemRarity | null;
  hp: number;
  strength: number;
  agility: number;
  vitality: number;
  statPoints: number;
  intelligence: number;
  mana: number;
  lastSeenAt: number | null;
  potions: number;
  herb: number;
  tonics: number;
}

const selectByName = db.prepare(
  "SELECT id, name, x, y, wood, ore, gatherLevel, battlePowerLevel, xp, level, weaponRarity, armorRarity, bootsRarity, hp, strength, agility, vitality, statPoints, intelligence, mana, lastSeenAt, potions, herb, tonics FROM characters WHERE name = ?",
);
const insertCharacter = db.prepare(
  "INSERT INTO characters (id, name, x, y, wood, ore, gatherLevel, battlePowerLevel, xp, level, weaponRarity, armorRarity, bootsRarity, hp, strength, agility, vitality, statPoints, intelligence, mana, lastSeenAt, offlineGatherResource) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
);
const selectMana = db.prepare("SELECT mana FROM characters WHERE id = ?");
const setManaStmt = db.prepare("UPDATE characters SET mana = ? WHERE id = ?");
const selectHp = db.prepare("SELECT hp FROM characters WHERE id = ?");
const setHpStmt = db.prepare("UPDATE characters SET hp = ? WHERE id = ?");
const setHpAndPositionStmt = db.prepare("UPDATE characters SET hp = ?, x = ?, y = ? WHERE id = ?");
const selectForOffline = db.prepare(
  "SELECT wood, ore, herb, gatherLevel, lastSeenAt, offlineGatherResource, offlineBattleMonsterKind FROM characters WHERE id = ?",
);
const applyOfflineWoodStmt = db.prepare(
  "UPDATE characters SET wood = wood + ?, lastSeenAt = ?, offlineGatherResource = NULL, offlineBattleMonsterKind = NULL WHERE id = ?",
);
const applyOfflineOreStmt = db.prepare(
  "UPDATE characters SET ore = ore + ?, lastSeenAt = ?, offlineGatherResource = NULL, offlineBattleMonsterKind = NULL WHERE id = ?",
);
const applyOfflineHerbStmt = db.prepare(
  "UPDATE characters SET herb = herb + ?, lastSeenAt = ?, offlineGatherResource = NULL, offlineBattleMonsterKind = NULL WHERE id = ?",
);
const clearOfflineStmt = db.prepare(
  "UPDATE characters SET lastSeenAt = ?, offlineGatherResource = NULL, offlineBattleMonsterKind = NULL WHERE id = ?",
);
const markDisconnectedStmt = db.prepare(
  "UPDATE characters SET lastSeenAt = ?, offlineGatherResource = ?, offlineBattleMonsterKind = ? WHERE id = ?",
);
const setWeaponStmt = db.prepare("UPDATE characters SET weaponRarity = ? WHERE id = ?");
const setArmorStmt = db.prepare("UPDATE characters SET armorRarity = ? WHERE id = ?");
const setBootsStmt = db.prepare("UPDATE characters SET bootsRarity = ? WHERE id = ?");
const updatePosition = db.prepare("UPDATE characters SET x = ?, y = ? WHERE id = ?");
const addWoodStmt = db.prepare("UPDATE characters SET wood = wood + ? WHERE id = ?");
const addOreStmt = db.prepare("UPDATE characters SET ore = ore + ? WHERE id = ?");
const selectOre = db.prepare("SELECT ore FROM characters WHERE id = ?");
const selectForUpgrade = db.prepare("SELECT wood, gatherLevel FROM characters WHERE id = ?");
const applyUpgrade = db.prepare(
  "UPDATE characters SET wood = wood - ?, gatherLevel = gatherLevel + 1 WHERE id = ?",
);
const selectForXp = db.prepare("SELECT xp, level, statPoints FROM characters WHERE id = ?");
const applyXp = db.prepare("UPDATE characters SET xp = ?, level = ?, statPoints = ? WHERE id = ?");
const selectForAllocate = db.prepare(
  "SELECT strength, agility, vitality, intelligence, statPoints FROM characters WHERE id = ?",
);
const applyAllocateStmt = db.prepare(
  "UPDATE characters SET strength = ?, agility = ?, vitality = ?, intelligence = ?, statPoints = ? WHERE id = ?",
);
const selectForBattlePower = db.prepare(
  "SELECT wood, ore, battlePowerLevel FROM characters WHERE id = ?",
);
const applyBattlePowerUpgrade = db.prepare(
  "UPDATE characters SET wood = wood - ?, ore = ore - ?, battlePowerLevel = battlePowerLevel + 1 WHERE id = ?",
);
const selectForCraft = db.prepare("SELECT wood, ore FROM characters WHERE id = ?");
const applyCraftSpend = db.prepare("UPDATE characters SET wood = wood - ?, ore = ore - ? WHERE id = ?");
const selectForCraftPotion = db.prepare("SELECT wood, ore, herb, potions FROM characters WHERE id = ?");
const applyCraftPotionStmt = db.prepare(
  "UPDATE characters SET wood = wood - ?, ore = ore - ?, herb = herb - ?, potions = potions + 1 WHERE id = ?",
);
const addHerbStmt = db.prepare("UPDATE characters SET herb = herb + ? WHERE id = ?");
const selectHerb = db.prepare("SELECT herb FROM characters WHERE id = ?");
const selectForUsePotion = db.prepare("SELECT potions FROM characters WHERE id = ?");
const applyUsePotionStmt = db.prepare("UPDATE characters SET potions = potions - 1 WHERE id = ?");
const selectForCraftTonic = db.prepare("SELECT wood, ore, herb, tonics FROM characters WHERE id = ?");
const applyCraftTonicStmt = db.prepare(
  "UPDATE characters SET wood = wood - ?, ore = ore - ?, herb = herb - ?, tonics = tonics + 1 WHERE id = ?",
);
const selectForUseTonic = db.prepare("SELECT tonics FROM characters WHERE id = ?");
const applyUseTonicStmt = db.prepare("UPDATE characters SET tonics = tonics - 1 WHERE id = ?");

const START_ATTRIBUTE = 1;
const START_VITALITY = 2;

export function loadOrCreateCharacter(name: string): CharacterRow {
  const existing = selectByName.get(name) as CharacterRow | undefined;
  if (existing) return existing;

  const row: CharacterRow = {
    id: randomUUID(),
    name,
    x: PLAYER_SPAWN.x,
    y: PLAYER_SPAWN.y,
    wood: 0,
    ore: 0,
    gatherLevel: 0,
    battlePowerLevel: 0,
    xp: 0,
    level: 1,
    weaponRarity: null,
    armorRarity: null,
    bootsRarity: null,
    hp: maxHpForLevel(1, START_VITALITY) + CLASSES.adventurer.baseHpBonus,
    // An even spread, because there is no class at creation to lean toward.
    // Your build comes from the weapon you pick up and the points you spend,
    // both of which are reversible — which is the point of the whole design.
    strength: START_ATTRIBUTE,
    agility: START_ATTRIBUTE,
    vitality: START_VITALITY,
    statPoints: 0,
    intelligence: START_ATTRIBUTE,
    mana: maxManaFor("adventurer", 1, START_ATTRIBUTE),
    lastSeenAt: Date.now(),
    potions: 0,
    herb: 0,
    tonics: 0,
  };
  insertCharacter.run(
    row.id,
    row.name,
    row.x,
    row.y,
    row.wood,
    row.ore,
    row.gatherLevel,
    row.battlePowerLevel,
    row.xp,
    row.level,
    row.weaponRarity,
    row.armorRarity,
    row.bootsRarity,
    row.hp,
    row.strength,
    row.agility,
    row.vitality,
    row.statPoints,
    row.intelligence,
    row.mana,
    row.lastSeenAt,
    null,
  );
  return row;
}

export function addHp(id: string, amount: number, maxHp: number): number {
  const row = selectHp.get(id) as { hp: number };
  const hp = Math.min(maxHp, row.hp + amount);
  setHpStmt.run(hp, id);
  return hp;
}

export function applyDamage(
  id: string,
  damage: number,
  maxHp: number,
): { hp: number; defeated: boolean } {
  const row = selectHp.get(id) as { hp: number };
  const hp = row.hp - damage;

  if (hp <= 0) {
    const respawnHp = Math.floor(maxHp / 2);
    setHpAndPositionStmt.run(respawnHp, PLAYER_SPAWN.x, PLAYER_SPAWN.y, id);
    return { hp: respawnHp, defeated: true };
  }

  setHpStmt.run(hp, id);
  return { hp, defeated: false };
}

export function markDisconnected(
  id: string,
  gatheringResource: GatherableResource | null,
  battleMonsterKind: MonsterKind | null,
): void {
  markDisconnectedStmt.run(Date.now(), gatheringResource, battleMonsterKind, id);
}

// Offline progress used to live here: on reconnect it simulated whatever
// the player had been auto-gathering or auto-battling while away. Removed
// with the rest of the idle model — gathering and combat are now driven by
// where a player is physically standing, which has no offline equivalent.
// `markDisconnected` is kept purely to stamp the last-seen time.

const insertItem = db.prepare(
  "INSERT INTO items (id, characterId, baseId, slot, rarity, statValue, bonusStatValue, affixes, equipped, createdAt, weaponType, style) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
);
const selectItemsByCharacter = db.prepare(
  "SELECT id, baseId, slot, rarity, statValue, bonusStatValue, affixes, equipped, weaponType, style FROM items WHERE characterId = ? ORDER BY createdAt DESC",
);
const selectOneItem = db.prepare(
  "SELECT id, baseId, slot, rarity, statValue, bonusStatValue, affixes, equipped, weaponType, style FROM items WHERE id = ? AND characterId = ?",
);
const updateItemStmt = db.prepare(
  "UPDATE items SET rarity = ?, statValue = ?, bonusStatValue = ?, affixes = ? WHERE id = ?",
);
const selectItemForEquip = db.prepare(
  "SELECT id, slot FROM items WHERE id = ? AND characterId = ?",
);
const unequipSlotStmt = db.prepare(
  "UPDATE items SET equipped = 0 WHERE characterId = ? AND slot = ?",
);
const equipItemStmt = db.prepare("UPDATE items SET equipped = 1 WHERE id = ?");
const selectItemForSell = db.prepare("SELECT rarity, equipped FROM items WHERE id = ? AND characterId = ?");
const deleteItemStmt = db.prepare("DELETE FROM items WHERE id = ?");

interface ItemRow {
  id: string;
  baseId: string | null;
  slot: string;
  rarity: string;
  statValue: number;
  bonusStatValue: number;
  affixes: string | null;
  equipped: number;
  weaponType: string | null;
  style: string | null;
}

function toItemInstance(row: ItemRow): ItemInstance {
  return {
    id: row.id,
    // Falls back rather than throwing: a catalogue entry can be retired while a
    // saved character is still wearing it, and `itemBase` resolves an unknown
    // id to a placeholder. A bag full of "Lost Relic" is recoverable; a
    // character who cannot log in is not.
    baseId: row.baseId ?? "unknown",
    slot: row.slot as ItemSlot,
    rarity: row.rarity as ItemRarity,
    statValue: row.statValue,
    bonusStatValue: row.bonusStatValue,
    affixes: parseAffixes(row.affixes),
    equipped: row.equipped === 1,
    // Both are nullable in SQLite and optional on the wire. weaponType was
    // being dropped here even though the SELECT fetched it, which silently
    // turned every stored weapon back into fists on reload — and with class
    // now derived from the weapon, that would reset the player's class too.
    weaponType: (row.weaponType as WeaponType | null) ?? undefined,
    style: (row.style as GearStyle | null) ?? undefined,
  };
}

/** Defensive: the column is a JSON array written by this process, but a bad
 *  row must not take a character's whole bag down with it. */
function parseAffixes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Writes one rolled item.
 *
 * Takes the roll rather than the ingredients of a roll: `rollItem` in
 * shared/items.ts is the single place an item comes into existence, so the
 * forge and the loot table cannot disagree about what a Tempered Falchion is.
 */
export function addItem(
  characterId: string,
  rolled: Omit<ItemInstance, "id" | "equipped">,
): ItemInstance {
  const id = randomUUID();
  insertItem.run(
    id,
    characterId,
    rolled.baseId,
    rolled.slot,
    rolled.rarity,
    rolled.statValue,
    rolled.bonusStatValue,
    JSON.stringify(rolled.affixes ?? []),
    Date.now(),
    rolled.weaponType ?? null,
    rolled.style ?? null,
  );
  return { ...rolled, id, equipped: false };
}

export function getItem(characterId: string, itemId: string): ItemInstance | null {
  const row = selectOneItem.get(itemId, characterId) as unknown as ItemRow | undefined;
  return row ? toItemInstance(row) : null;
}

/** Replaces an item's quality and rolls in place, keeping its id and whether it
 *  is worn. What reforging does. */
export function replaceItemRolls(
  characterId: string,
  itemId: string,
  next: Pick<ItemInstance, "rarity" | "statValue" | "bonusStatValue" | "affixes">,
): ItemInstance | null {
  const existing = getItem(characterId, itemId);
  if (!existing) return null;
  updateItemStmt.run(
    next.rarity,
    next.statValue,
    next.bonusStatValue,
    JSON.stringify(next.affixes ?? []),
    itemId,
  );
  return getItem(characterId, itemId);
}

export function deleteItem(characterId: string, itemId: string): boolean {
  const existing = getItem(characterId, itemId);
  if (!existing) return false;
  deleteItemStmt.run(itemId);
  return true;
}

export function listItems(characterId: string): ItemInstance[] {
  return (selectItemsByCharacter.all(characterId) as unknown as ItemRow[]).map(toItemInstance);
}

export interface EquipResult {
  items: ItemInstance[];
  weaponRarity: ItemRarity | null;
  armorRarity: ItemRarity | null;
  bootsRarity: ItemRarity | null;
}

export function equipItem(characterId: string, itemId: string): EquipResult | null {
  const target = selectItemForEquip.get(itemId, characterId) as { id: string; slot: ItemSlot } | undefined;
  if (!target) return null;

  unequipSlotStmt.run(characterId, target.slot);
  equipItemStmt.run(itemId);

  // Two hands are two hands. A greatsword, a bow and a staff all empty the
  // off-hand, and putting something in the off-hand puts down a two-hander —
  // enforced HERE rather than in the message handler because it is a property
  // of what is worn, and every future path that equips something (a starting
  // kit, a reward, a test) has to obey it too.
  const afterEquip = listItems(characterId);
  const worn = (slot: ItemSlot) => afterEquip.find((i) => i.slot === slot && i.equipped) ?? null;
  if (target.slot === "weapon" && isTwoHanded(worn("weapon"))) {
    unequipSlotStmt.run(characterId, "offhand");
  } else if (target.slot === "offhand" && isTwoHanded(worn("weapon"))) {
    unequipSlotStmt.run(characterId, "weapon");
  }

  const items = listItems(characterId);
  const equippedRarity = (slot: ItemSlot): ItemRarity | null =>
    items.find((item) => item.slot === slot && item.equipped)?.rarity ?? null;
  const weaponRarity = equippedRarity("weapon");
  const armorRarity = equippedRarity("armor");
  const bootsRarity = equippedRarity("boots");

  setWeaponStmt.run(weaponRarity, characterId);
  setArmorStmt.run(armorRarity, characterId);
  setBootsStmt.run(bootsRarity, characterId);

  return { items, weaponRarity, armorRarity, bootsRarity };
}

/**
 * Breaks an item down and returns the materials to the character.
 *
 * Replaces selling for wood, which was a sink with no decision in it: one
 * currency out, always, scaled only by rarity. Salvage gives back a share of
 * what the thing would cost to forge, so what you get depends on WHAT you
 * broke — and a Broken drop, which used to be strictly the worst outcome, is
 * now a small pile of ore you would otherwise have gone mining for.
 */
export function salvageItem(
  characterId: string,
  itemId: string,
): {
  yielded: MaterialCost;
  /** The base whose recipe this taught, or null if it taught nothing new. */
  learned: string | null;
  items: ItemInstance[];
  materials: MaterialTotals;
} | null {
  const item = getItem(characterId, itemId);
  if (!item || item.equipped) return null;

  const yielded = salvageYield(item);
  // Taking it apart is how you learn to make one. This is the whole reason
  // salvage exists as a verb rather than as a delete button, and it is what
  // gives a duplicate an answer better than "throw it away".
  const learned = !isBasicRecipe(item.baseId) && learnRecipe(characterId, item.baseId);
  deleteItemStmt.run(itemId);
  // Whatever `salvageYield` decided, paid generically — three named calls is
  // three places a new material would have to be remembered in, and it never
  // would be, because the yield table would simply stop mentioning it and
  // nothing would throw.
  for (const m of MATERIALS) {
    if (yielded[m]) addMaterial(characterId, m, yielded[m]!);
  }

  return {
    yielded,
    learned: learned ? item.baseId : null,
    items: listItems(characterId),
    materials: materialsOf(characterId),
  };
}

// --- Known recipes ----------------------------------------------------------
// A smith knows what they have taken apart. Rows rather than a column, because
// this is a set keyed by (character, base) — the shape a wide row cannot hold
// without turning into JSON, and the same argument the talent ranks make.
// The absence of a row is the honest representation of "never seen one".
db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    characterId TEXT NOT NULL,
    baseId TEXT NOT NULL,
    learnedAt INTEGER NOT NULL,
    PRIMARY KEY (characterId, baseId)
  );
`);

const selectRecipes = db.prepare("SELECT baseId FROM recipes WHERE characterId = ?");
const insertRecipe = db.prepare(
  "INSERT OR IGNORE INTO recipes (characterId, baseId, learnedAt) VALUES (?, ?, ?)",
);

export function knownRecipes(characterId: string): string[] {
  return (selectRecipes.all(characterId) as unknown as { baseId: string }[]).map((r) => r.baseId);
}

/** Records a recipe, and says whether it was new — which is what decides
 *  whether the player is told anything. */
export function learnRecipe(characterId: string, baseId: string): boolean {
  const result = insertRecipe.run(characterId, baseId, Date.now());
  return Number(result.changes) > 0;
}

// --- Consumables ------------------------------------------------------------
// Counters, keyed by (character, id). Rows rather than a column each, so adding
// a consumable is a row in `CONSUMABLES` and nothing here — which is the whole
// point of the table replacing two hardcoded constants.
db.exec(`
  CREATE TABLE IF NOT EXISTS consumables (
    characterId TEXT NOT NULL,
    id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (characterId, id)
  );
`);

// The two that predate the table, carried across once. Their columns stay on
// `characters` — reading them is how this migration knows what to carry, and
// dropping a column in SQLite is a table rebuild for no gain.
const CONSUMABLE_MOVE_MARK = "consumables-v2-table";
if (!db.prepare("SELECT mark FROM schema_marks WHERE mark = ?").get(CONSUMABLE_MOVE_MARK)) {
  const rows = db
    .prepare("SELECT id, potions, tonics FROM characters")
    .all() as unknown as { id: string; potions: number; tonics: number }[];
  const move = db.prepare(
    "INSERT OR REPLACE INTO consumables (characterId, id, count) VALUES (?, ?, ?)",
  );
  let moved = 0;
  for (const row of rows) {
    if (row.potions > 0) { move.run(row.id, "potion", row.potions); moved++; }
    if (row.tonics > 0) { move.run(row.id, "tonic", row.tonics); moved++; }
  }
  db.prepare("INSERT INTO schema_marks (mark, appliedAt) VALUES (?, ?)").run(
    CONSUMABLE_MOVE_MARK,
    Date.now(),
  );
  console.log(`[db] consumables: carried ${moved} stack(s) into the new table, once`);
}

const selectConsumables = db.prepare(
  "SELECT id, count FROM consumables WHERE characterId = ?",
);
const addConsumableStmt = db.prepare(
  "INSERT INTO consumables (characterId, id, count) VALUES (?, ?, ?)" +
    " ON CONFLICT(characterId, id) DO UPDATE SET count = count + excluded.count",
);
const spendConsumableStmt = db.prepare(
  "UPDATE consumables SET count = count - 1 WHERE characterId = ? AND id = ? AND count > 0",
);

export function consumablesOf(characterId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of selectConsumables.all(characterId) as unknown as {
    id: string;
    count: number;
  }[]) {
    out[row.id] = row.count;
  }
  return out;
}

export function addConsumable(characterId: string, id: string, count = 1): Record<string, number> {
  addConsumableStmt.run(characterId, id, count);
  return consumablesOf(characterId);
}

/** Spends one, atomically. Returns null if there was none — the check is in the
 *  statement's WHERE clause for the same reason every other spend here is:
 *  two rapid clicks must not both succeed against one bottle. */
export function spendConsumable(characterId: string, id: string): Record<string, number> | null {
  const result = spendConsumableStmt.run(characterId, id);
  if (Number(result.changes) === 0) return null;
  return consumablesOf(characterId);
}

export type MaterialTotals = Record<Material, number>;

// Every statement that touches the wallet is BUILT from the shared material
// list rather than typed out. Four hand-written SQL strings naming the same
// four columns is four places a fifth material has to be remembered in, and the
// failure mode is silent: a spend that forgets a column simply never charges
// for it.
const selectMaterials = db.prepare(
  `SELECT ${MATERIALS.join(", ")} FROM characters WHERE id = ?`,
);
const addEssenceStmt = db.prepare(
  "UPDATE characters SET essence = essence + ? WHERE id = ?",
);
const spendMaterialsStmt = db.prepare(
  `UPDATE characters SET ${MATERIALS.map((m) => `${m} = ${m} - ?`).join(", ")}` +
    ` WHERE id = ? AND ${MATERIALS.map((m) => `${m} >= ?`).join(" AND ")}`,
);
/** Credits one material. Used by refining, which is the only thing that pays
 *  out something the world cannot drop. */
const addMaterialStmt: Record<Material, ReturnType<typeof db.prepare>> = Object.fromEntries(
  MATERIALS.map((m) => [m, db.prepare(`UPDATE characters SET ${m} = ${m} + ? WHERE id = ?`)]),
) as Record<Material, ReturnType<typeof db.prepare>>;

const EMPTY_WALLET: MaterialTotals = Object.fromEntries(
  MATERIALS.map((m) => [m, 0]),
) as MaterialTotals;

export function materialsOf(characterId: string): MaterialTotals {
  const row = selectMaterials.get(characterId) as unknown as Partial<MaterialTotals> | undefined;
  if (!row) return { ...EMPTY_WALLET };
  // Coerced rather than trusted: a column added by a migration on an existing
  // row reads back as its default, but a row written before the migration ran
  // in this process would not have the key at all.
  const out = { ...EMPTY_WALLET };
  for (const m of MATERIALS) out[m] = Number(row[m] ?? 0);
  return out;
}

export function addMaterial(characterId: string, material: Material, amount: number): MaterialTotals {
  if (amount > 0) addMaterialStmt[material].run(Math.round(amount), characterId);
  return materialsOf(characterId);
}

export function addEssence(characterId: string, amount: number): number {
  if (amount > 0) addEssenceStmt.run(amount, characterId);
  return materialsOf(characterId).essence;
}

/**
 * Spends a cost atomically, returning null if the character could not pay.
 *
 * One statement with the balance check in its WHERE clause, for the same reason
 * the gather-speed upgrade has always been one statement: two rapid clicks on a
 * forge button must not both succeed against the same wood.
 */
export function spendMaterials(
  characterId: string,
  cost: MaterialCost,
): MaterialTotals | null {
  const amounts = MATERIALS.map((m) => Math.max(0, Math.round(cost[m] ?? 0)));
  // Amounts twice: once for the SET clause and once for the balance check in
  // the WHERE, which is what makes two rapid clicks on a forge button unable to
  // both succeed against the same wood.
  const result = spendMaterialsStmt.run(...amounts, characterId, ...amounts);
  if (Number(result.changes) === 0) return null;
  return materialsOf(characterId);
}

export function setWeapon(id: string, rarity: ItemRarity): void {
  setWeaponStmt.run(rarity, id);
}

export function setArmor(id: string, rarity: ItemRarity): void {
  setArmorStmt.run(rarity, id);
}

export function setBoots(id: string, rarity: ItemRarity): void {
  setBootsStmt.run(rarity, id);
}

export function savePosition(id: string, x: number, y: number): void {
  updatePosition.run(x, y, id);
}

export function addWood(id: string, amount: number): number {
  addWoodStmt.run(amount, id);
  const row = selectForUpgrade.get(id) as { wood: number };
  return row.wood;
}

export function tryUpgradeGatherSpeed(
  id: string,
  cost: number,
): { wood: number; gatherLevel: number } | null {
  const row = selectForUpgrade.get(id) as { wood: number; gatherLevel: number } | undefined;
  if (!row || row.wood < cost) return null;

  applyUpgrade.run(cost, id);
  return { wood: row.wood - cost, gatherLevel: row.gatherLevel + 1 };
}

export function addOre(id: string, amount: number): number {
  addOreStmt.run(amount, id);
  const row = selectOre.get(id) as { ore: number };
  return row.ore;
}

export function addHerb(id: string, amount: number): number {
  addHerbStmt.run(amount, id);
  const row = selectHerb.get(id) as { herb: number };
  return row.herb;
}

export function tryUpgradeBattlePower(
  id: string,
  woodCost: number,
  oreCost: number,
): { wood: number; ore: number; battlePowerLevel: number } | null {
  const row = selectForBattlePower.get(id) as
    | { wood: number; ore: number; battlePowerLevel: number }
    | undefined;
  if (!row || row.wood < woodCost || row.ore < oreCost) return null;

  applyBattlePowerUpgrade.run(woodCost, oreCost, id);
  return { wood: row.wood - woodCost, ore: row.ore - oreCost, battlePowerLevel: row.battlePowerLevel + 1 };
}

export function trySpendCraftResources(
  id: string,
  woodCost: number,
  oreCost: number,
): { wood: number; ore: number } | null {
  const row = selectForCraft.get(id) as { wood: number; ore: number } | undefined;
  if (!row || row.wood < woodCost || row.ore < oreCost) return null;

  applyCraftSpend.run(woodCost, oreCost, id);
  return { wood: row.wood - woodCost, ore: row.ore - oreCost };
}

export function craftPotion(id: string): { wood: number; ore: number; herb: number; potions: number } | null {
  const row = selectForCraftPotion.get(id) as
    | { wood: number; ore: number; herb: number; potions: number }
    | undefined;
  if (
    !row ||
    row.wood < POTION_CRAFT_COST.wood ||
    row.ore < POTION_CRAFT_COST.ore ||
    row.herb < POTION_CRAFT_COST.herb
  ) {
    return null;
  }

  applyCraftPotionStmt.run(POTION_CRAFT_COST.wood, POTION_CRAFT_COST.ore, POTION_CRAFT_COST.herb, id);
  return {
    wood: row.wood - POTION_CRAFT_COST.wood,
    ore: row.ore - POTION_CRAFT_COST.ore,
    herb: row.herb - POTION_CRAFT_COST.herb,
    potions: row.potions + 1,
  };
}

export function usePotion(id: string): { potions: number } | null {
  const row = selectForUsePotion.get(id) as { potions: number } | undefined;
  if (!row || row.potions <= 0) return null;

  applyUsePotionStmt.run(id);
  return { potions: row.potions - 1 };
}

export function craftTonic(id: string): { wood: number; ore: number; herb: number; tonics: number } | null {
  const row = selectForCraftTonic.get(id) as
    | { wood: number; ore: number; herb: number; tonics: number }
    | undefined;
  if (
    !row ||
    row.wood < TONIC_CRAFT_COST.wood ||
    row.ore < TONIC_CRAFT_COST.ore ||
    row.herb < TONIC_CRAFT_COST.herb
  ) {
    return null;
  }

  applyCraftTonicStmt.run(TONIC_CRAFT_COST.wood, TONIC_CRAFT_COST.ore, TONIC_CRAFT_COST.herb, id);
  return {
    wood: row.wood - TONIC_CRAFT_COST.wood,
    ore: row.ore - TONIC_CRAFT_COST.ore,
    herb: row.herb - TONIC_CRAFT_COST.herb,
    tonics: row.tonics + 1,
  };
}

export function useTonic(id: string): { tonics: number } | null {
  const row = selectForUseTonic.get(id) as { tonics: number } | undefined;
  if (!row || row.tonics <= 0) return null;

  applyUseTonicStmt.run(id);
  return { tonics: row.tonics - 1 };
}

const selectLeaderboard = db.prepare(
  "SELECT name, level, xp FROM characters ORDER BY level DESC, xp DESC LIMIT ?",
);

export function getLeaderboard(limit: number): LeaderboardEntry[] {
  return selectLeaderboard.all(limit) as unknown as LeaderboardEntry[];
}

const selectForDailyBonus = db.prepare(
  "SELECT lastDailyAt, wood, ore, herb, potions FROM characters WHERE id = ?",
);
const applyDailyBonusStmt = db.prepare(
  "UPDATE characters SET wood = wood + ?, ore = ore + ?, herb = herb + ?, potions = potions + ?, lastDailyAt = ? WHERE id = ?",
);

export interface DailyBonusResult {
  wood: number;
  ore: number;
  herb: number;
  potions: number;
}

// Eligible if never claimed, or the cooldown has elapsed since the last
// claim — gated by elapsed time rather than calendar date so timezone
// doesn't matter and there's no midnight-rollover edge case to handle.
export function claimDailyBonus(id: string): DailyBonusResult | null {
  const row = selectForDailyBonus.get(id) as
    | { lastDailyAt: number | null; wood: number; ore: number; herb: number; potions: number }
    | undefined;
  if (!row) return null;

  const now = Date.now();
  if (row.lastDailyAt !== null && now - row.lastDailyAt < DAILY_BONUS_COOLDOWN_MS) return null;

  applyDailyBonusStmt.run(
    DAILY_BONUS_REWARD.wood,
    DAILY_BONUS_REWARD.ore,
    DAILY_BONUS_REWARD.herb,
    DAILY_BONUS_REWARD.potions,
    now,
    id,
  );
  return {
    wood: row.wood + DAILY_BONUS_REWARD.wood,
    ore: row.ore + DAILY_BONUS_REWARD.ore,
    herb: row.herb + DAILY_BONUS_REWARD.herb,
    potions: row.potions + DAILY_BONUS_REWARD.potions,
  };
}

export function addXp(
  id: string,
  amount: number,
): { xp: number; level: number; leveledUp: boolean; statPoints: number } {
  const row = selectForXp.get(id) as { xp: number; level: number; statPoints: number };
  let xp = row.xp + amount;
  let level = row.level;
  let statPoints = row.statPoints;
  let leveledUp = false;

  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
    statPoints += STAT_POINTS_PER_LEVEL;
    leveledUp = true;
  }

  applyXp.run(xp, level, statPoints, id);
  return { xp, level, leveledUp, statPoints };
}

/**
 * Death penalty: shave a slice off progress toward the *current* level.
 * Deliberately never de-levels and never drops below zero — losing a level
 * you had already earned is the kind of punishment that makes people stop
 * playing, whereas losing a few minutes of progress is a real cost you can
 * shrug off. Returns the new xp so the caller can push it to the client.
 */
/** Mana is persisted like HP so a relog doesn't hand you a free full pool. */
export function setMana(id: string, mana: number): number {
  const clamped = Math.max(0, Math.round(mana));
  setManaStmt.run(clamped, id);
  return clamped;
}

export function getMana(id: string): number {
  const row = selectMana.get(id) as { mana: number } | undefined;
  return row?.mana ?? 0;
}

export function loseXpFraction(id: string, fraction: number): { xp: number; lost: number } {
  const row = selectForXp.get(id) as { xp: number; level: number; statPoints: number };
  const lost = Math.floor(row.xp * fraction);
  const xp = Math.max(0, row.xp - lost);
  applyXp.run(xp, row.level, row.statPoints, id);
  return { xp, lost };
}

export interface AllocateResult {
  strength: number;
  agility: number;
  vitality: number;
  intelligence: number;
  statPoints: number;
}

export function allocateStat(id: string, stat: AttributeName): AllocateResult | null {
  const row = selectForAllocate.get(id) as
    | { strength: number; agility: number; vitality: number; intelligence: number; statPoints: number }
    | undefined;
  if (!row || row.statPoints <= 0) return null;

  const next = { ...row, statPoints: row.statPoints - 1 };
  next[stat] += 1;

  applyAllocateStmt.run(next.strength, next.agility, next.vitality, next.intelligence, next.statPoints, id);
  return next;
}
