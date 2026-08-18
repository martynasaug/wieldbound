import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import {
  xpToNextLevel,
  maxHpForLevel,
  xpRewardFor,
  sellValueFor,
  POTION_CRAFT_COST,
  TONIC_CRAFT_COST,
  rollItemSlot,
  rollItemRarity,
  rollItemStatValue,
  rollItemBonusStatValue,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "idlekin.db"));
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
  // class, so it is load-bearing rather than cosmetic. Null on pre-class
  // weapons, which resolve to fists.
  "ALTER TABLE items ADD COLUMN weaponType TEXT",
  // Which art an armour piece layers onto the paperdoll.
  "ALTER TABLE items ADD COLUMN style TEXT",
]) {
  try {
    db.exec(itemMigration);
  } catch {
    // column already exists from a previous run
  }
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
  "ALTER TABLE characters ADD COLUMN lastDailyAt INTEGER",
  "ALTER TABLE characters ADD COLUMN tonics INTEGER NOT NULL DEFAULT 0",
  // Vestigial: class is no longer stored. It is derived from the equipped
  // weapon on every read (see classForWeapon), so this column is never
  // selected or written. It stays only because dropping a column would
  // rewrite the table for no benefit.
  "ALTER TABLE characters ADD COLUMN characterClass TEXT NOT NULL DEFAULT 'warrior'",
  "ALTER TABLE characters ADD COLUMN intelligence INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE characters ADD COLUMN mana INTEGER NOT NULL DEFAULT 40",
]) {
  try {
    db.exec(migration);
  } catch {
    // column already exists from a previous run
  }
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
  "INSERT INTO items (id, characterId, slot, rarity, statValue, bonusStatValue, equipped, createdAt, weaponType, style) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
);
const selectItemsByCharacter = db.prepare(
  "SELECT id, slot, rarity, statValue, bonusStatValue, equipped, weaponType, style FROM items WHERE characterId = ? ORDER BY createdAt DESC",
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
  slot: string;
  rarity: string;
  statValue: number;
  bonusStatValue: number;
  equipped: number;
  weaponType: string | null;
  style: string | null;
}

function toItemInstance(row: ItemRow): ItemInstance {
  return {
    id: row.id,
    slot: row.slot as ItemSlot,
    rarity: row.rarity as ItemRarity,
    statValue: row.statValue,
    bonusStatValue: row.bonusStatValue,
    equipped: row.equipped === 1,
    // Both are nullable in SQLite and optional on the wire. weaponType was
    // being dropped here even though the SELECT fetched it, which silently
    // turned every stored weapon back into fists on reload — and with class
    // now derived from the weapon, that would reset the player's class too.
    weaponType: (row.weaponType as WeaponType | null) ?? undefined,
    style: (row.style as GearStyle | null) ?? undefined,
  };
}

export function addItem(
  characterId: string,
  slot: ItemSlot,
  rarity: ItemRarity,
  statValue: number,
  bonusStatValue: number,
  weaponType: WeaponType | null = null,
  style: GearStyle | null = null,
): ItemInstance {
  const id = randomUUID();
  insertItem.run(id, characterId, slot, rarity, statValue, bonusStatValue, Date.now(), weaponType, style);
  return {
    id,
    slot,
    rarity,
    statValue,
    bonusStatValue,
    equipped: false,
    weaponType: weaponType ?? undefined,
    style: style ?? undefined,
  };
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

export function sellItem(characterId: string, itemId: string): { wood: number; items: ItemInstance[] } | null {
  const row = selectItemForSell.get(itemId, characterId) as { rarity: string; equipped: number } | undefined;
  if (!row || row.equipped === 1) return null;

  deleteItemStmt.run(itemId);
  const wood = addWood(characterId, sellValueFor(row.rarity as ItemRarity));
  return { wood, items: listItems(characterId) };
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
