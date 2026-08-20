import { WebSocketServer, WebSocket } from "ws";
import {
  BOSS_MIN_RARITY,
  GATHER_RESPAWN_MS,
  INVENTORY_CAP,
  INTERACTION_RANGE_PX,
  LOOT_DROP_CHANCE,
  LOOT_PICKUP_RANGE_PX,
  LOOT_RESERVED_MS,
  LOOT_LIFETIME_MS,
  type DroppedItemState,
  MONSTER_STATS,
  PLAYER_SPAWN,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  POTION_CRAFT_COST,
  POTION_HEAL_AMOUNT,
  TONIC_CRAFT_COST,
  TONIC_XP_AMOUNT,
  playerAttackIntervalMs,
  ENGAGE_RANGE_PX,
  AGGRO_RANGE_PX,
  MONSTER_LEASH_PX,
  SKILLS,
  CLASSES,
  WEAPONS,
  classForWeapon,
  attackRangeFor,
  weaponDef,

  ITEM_SLOTS,
  VISIBLE_GEAR_SLOTS,
  type ItemSlot,
  type CharacterClass,
  type Appearance,
  maxManaFor,
  manaRegenAmount,
  primaryStatValue,
  talentPassives,
  addPassives,
  appearanceFromItems,
  unlockedActives,
  hasActive,
  canLearnTalent,
  spentTalentPoints,
  talentPointsAtLevel,
  talentTree,
  normalizeHotbar,
  pruneHotbar,
  suggestedHotbar,
  type HotbarLayout,
  weaponProgress,
  applyDamagePercent,
  applyAttackSpeed,
  applyCooldown,
  applyManaCost,
  type TalentRanks,
  type WeaponProgressMessage,
  MANA_REGEN_INTERVAL_MS,
  SHIELD_WALL_MS,
  SHIELD_WALL_REDUCTION,
  type WeaponType,
  MIN_XP_SHARE,
  MAX_MELEE_ATTACKERS,
  MELEE_RING_STEP_PX,
  MONSTER_SEPARATION_PX,
  PLAYER_BODY_RADIUS_PX,
  ATTACK_ORDER_LAPSE_MS,
  type AttackStateMessage,
  resolveBodyCollision,
  separationFor,
  GLOBAL_COOLDOWN_MS,
  POTION_COOLDOWN_MS,
  COMBAT_LOCKOUT_MS,
  DEATH_XP_LOSS_FRACTION,
  WEAKENED_DURATION_MS,
  WEAKENED_DAMAGE_PENALTY,
  BASE_MOVE_SPEED_PX_PER_SEC,
  SLOW_MULTIPLIER,
  SLOW_DURATION_MS,
  WARCRY_DURATION_MS,
  WARCRY_DAMAGE_BONUS,
  skillPower,
  type SkillId,
  battlePowerUpgradeCost,
  craftCostFor,
  critDamageMultiplier,
  doubleAttackChance,
  gatherDurationForLevel,
  gatherYieldFor,
  bandAt,
  gatherUpgradeCost,
  maxHpForLevel,
  playerAccuracy,
  playerCritChance,
  playerMaxHit,
  playerMinHit,
  regenAmountForVitality,
  resolveHit,
  resistOf,
  applyResist,
  passiveResist,
  STATUSES,
  statusFits,
  statusModifiers,
  statusMoveMultiplier,
  statusDamageTaken,
  findRead,
  readMultiplier,
  type ActiveStatus,
  type StatusId,
  type DamageSchool,

  gearArmor,
  gearEvasion,
  gearCritChance,
  gearDamageBonus,

  xpRewardFor,
  type AttributeName,
  type ClientToServerMessage,
  type CraftingStationState,
  type ItemInstance,
  type ItemRarity,
  type MonsterKind,
  type MonsterState,
  type PlayerState,
  type ResourceNodeState,
  type ServerToClientMessage,
  resourceForNodeKind,
} from "../../shared/protocol-types.ts";
import {
  FORGE_OUTPUT_RARITY,
  ITEM_BASES,
  bagRoomFor,
  bagSlotsUsed,
  canForge,
  describeCost,
  essenceFor,
  forgeCost,
  gearPassives,
  weaponSchool,
  itemBase,
  itemName,
  reforgeCost,
  reforgeItem,
  rollBase,
  rollItem,
  rollRarity,
  rollRarityWithFloor,
  AFFIXES_BY_ID,
  canEtch,
  etchAffix,
  etchCost,
  consumableDef,
  consumableSummary,
  hitBandOf,
  reachOf,
  refineDef,
  swingIntervalOf,
  type MaterialCost,
  type Material,
} from "../../shared/items.ts";
import {
  loadOrCreateCharacter,
  savePosition,
  addWood,
  addOre,
  addHerb,
  tryUpgradeGatherSpeed,
  tryUpgradeBattlePower,
  trySpendCraftResources,
  addXp,
  applyDamage,
  addHp,
  addItem,
  getItem,
  replaceItemRolls,
  salvageItem,
  materialsOf,
  spendMaterials,
  addMaterial,
  addEssence,
  runesOf,
  addRune,
  spendRune,
  drawRune,
  knownRecipes,
  addConsumable,
  consumablesOf,
  spendConsumable,
  listItems,
  equipItem,
  craftPotion,
  usePotion,
  craftTonic,
  useTonic,
  allocateStat,
  loseXpFraction,
  setMana,
  getMana,
  markDisconnected,
  getLeaderboard,
  claimDailyBonus,
  getWeaponXp,
  addWeaponXp,
  getTalentRanks,
  setTalentRank,
  clearTalents,
  getHotbar,
  setHotbar,
  questRows,
  acceptQuest,
  advanceQuest,
  completeQuest,
} from "./db.ts";
import {
  NPC_TALK_RANGE_PX,
  PLAYER_ARRIVAL,
  npcById,
  propById,
  propPosition,
} from "../../shared/town.ts";
import { SHOP_OUTPUT_RARITY, shopEntry } from "../../shared/shop.ts";
import {
  offerStateFor,
  questDef,
  questSatisfied,
  type QuestObjective,
} from "../../shared/quests.ts";

const PORT = 8080;
const TICK_MS = 100;
const SAVE_INTERVAL_MS = 1000;
const MONSTER_RESPAWN_MS = 10000;
const MAX_AOE_TARGETS = 5;
const HP_REGEN_INTERVAL_MS = 5000; // 1 HP per interval while below max, no regen needed once full

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Position/identity only. Equipment lives in its own maps below and is
// merged in at broadcast time, so there is no second copy of a player's
// weapon rarity that could drift out of sync with `weaponRarities`.
type LivePlayer = Omit<PlayerState, "weaponRarity" | "armorRarity">;
const players = new Map<string, LivePlayer>();
const sockets = new Map<string, WebSocket>();
const lastSavedAt = new Map<string, number>();
const gatherLevels = new Map<string, number>();
const battlePowerLevels = new Map<string, number>();
const weaponRarities = new Map<string, ItemRarity | null>();
const armorRarities = new Map<string, ItemRarity | null>();
const bootsRarities = new Map<string, ItemRarity | null>();
const woodBalances = new Map<string, number>();
const oreBalances = new Map<string, number>();
const herbBalances = new Map<string, number>();
const potionBalances = new Map<string, number>();
const tonicBalances = new Map<string, number>();
const playerLevels = new Map<string, number>();
const hpBalances = new Map<string, number>();
const lastRegenAt = new Map<string, number>();
const manaBalances = new Map<string, number>();
const lastManaRegenAt = new Map<string, number>();
// Shield Wall halves incoming damage while it lasts.

interface Attributes {
  strength: number;
  agility: number;
  vitality: number;
  intelligence: number;
  statPoints: number;
}
const attributes = new Map<string, Attributes>();
const EMPTY_ATTRS: Attributes = { strength: 0, agility: 0, vitality: 0, intelligence: 0, statPoints: 0 };

// Class is not stored anywhere — it is read off the equipped weapon every
// time it is asked for. That is what makes swapping weapons swap your class
// with no re-spec step and no way for a cached class to disagree with the
// gear the player is actually wearing.
function weaponTypeOf(playerId: string): WeaponType | undefined {
  return equippedItems.get(playerId)?.weapon?.weaponType;
}

function classOf(playerId: string): CharacterClass {
  return classForWeapon(weaponTypeOf(playerId));
}

// The attribute this player's damage scales from — Strength, Agility or
// Intelligence depending on class. Everything downstream just wants a number.
function powerOf(playerId: string, attrs: Attributes): number {
  return primaryStatValue(classOf(playerId), attrs);
}

// Unlocked passives, totalled. Recomputed rather than cached because level
// and class are the only inputs and both are cheap to read.
// --- Weapon proficiency ------------------------------------------------------
// Cached per connected player so combat resolution is not hitting SQLite on
// every swing. Written through on every change, exactly as the other caches
// here are.
const weaponXpCache = new Map<string, Map<WeaponType, number>>();
const talentCache = new Map<string, Map<WeaponType, TalentRanks>>();

function weaponXpOf(playerId: string, weapon: WeaponType): number {
  let byWeapon = weaponXpCache.get(playerId);
  if (!byWeapon) {
    byWeapon = new Map();
    weaponXpCache.set(playerId, byWeapon);
  }
  const cached = byWeapon.get(weapon);
  if (cached !== undefined) return cached;
  const xp = getWeaponXp(playerId, weapon);
  byWeapon.set(weapon, xp);
  return xp;
}

function ranksOf(playerId: string, weapon: WeaponType): TalentRanks {
  let byWeapon = talentCache.get(playerId);
  if (!byWeapon) {
    byWeapon = new Map();
    talentCache.set(playerId, byWeapon);
  }
  const cached = byWeapon.get(weapon);
  if (cached !== undefined) return cached;
  const ranks = getTalentRanks(playerId, weapon);
  byWeapon.set(weapon, ranks);
  return ranks;
}

/** The weapon whose tree is currently in force. Fists are a real weapon here,
 *  with a real tree, so there is no null case. */
function heldWeapon(playerId: string): WeaponType {
  return weaponTypeOf(playerId) ?? "fist";
}

function weaponLevelOf(playerId: string, weapon = heldWeapon(playerId)): number {
  return weaponProgress(weaponXpOf(playerId, weapon)).level;
}

/** Passive totals from the held weapon's learned talents. Replaces the old
 *  class+level lookup: bonuses now come from what you chose, on this weapon. */
function passivesOf(playerId: string): ReturnType<typeof talentPassives> {
  const weapon = heldWeapon(playerId);
  const total = talentPassives(weapon, ranksOf(playerId, weapon));
  // Running statuses total into the SAME bag, which is the whole reason a
  // buff needed no plumbing of its own: War Cry reaches damage, Focused
  // reaches accuracy and crit, and Rallied reaches armour and max health,
  // through code that was written years before any of them existed.
  addPassives(total, statusModifiers(statusesOf(playerId, Date.now())));
  // Gear affixes total into the SAME bag, here, in the one function every
  // combat number already flows through. That is the whole reason affixes reuse
  // `PassiveBonus`: damage, accuracy, armour, mana and cooldowns all pick them
  // up without any of them learning that gear exists — and the character sheet
  // reads the same totals the server resolves with.
  return addPassives(total, gearPassives(equippedItems.get(playerId)));
}

/**
 * What the player's blows are made of right now.
 *
 * Derived from the weapon in hand on every read rather than cached, exactly as
 * the CLASS is and for the same reason: the failure mode of a stale copy is a
 * player who swapped to Frostbrand and is still dealing physical, which nothing
 * on screen would explain.
 */
function schoolOf(playerId: string): DamageSchool {
  return weaponSchool(equippedItems.get(playerId)?.weapon ?? null);
}

/**
 * How much a monster shrugs off a school. One lookup, so the number the target
 * frame shows a player and the number the server resolves with are the same
 * number.
 */
function monsterResist(kind: MonsterKind, school: DamageSchool): number {
  return resistOf(MONSTER_STATS[kind].resist, school);
}

/**
 * How much the PLAYER shrugs off one. Reads the totalled passives, which is the
 * one bag talents, affixes and matched sets all already flow into — so a
 * Rimeward kit and a suffix of the Glacier reach a dragon's breath without
 * either of them knowing the other exists.
 */
function playerResist(playerId: string, school: DamageSchool): number {
  return passiveResist(passivesOf(playerId), school);
}

/** Whether a player is standing at the station they named. */
function atStation(playerId: string, stationId: string): boolean {
  const player = players.get(playerId);
  const station = stations.find((s) => s.id === stationId);
  if (!player || !station) return false;
  return Math.hypot(player.x - station.x, player.y - station.y) <= INTERACTION_RANGE_PX;
}

/**
 * The player's bar for a weapon: their stored layout if they have edited one,
 * otherwise a suggested starting bar. Always pruned, so refunding a talent
 * cannot leave a button that casts nothing.
 */
function hotbarOf(playerId: string, weapon: WeaponType, ranks: TalentRanks): HotbarLayout {
  const stored = getHotbar(playerId, weapon);
  const layout = stored
    ? normalizeHotbar(stored as Partial<HotbarLayout>)
    : suggestedHotbar(weapon, ranks);
  return pruneHotbar(layout, weapon, ranks);
}

function sendWeaponProgress(playerId: string, reason?: string): void {
  const socket = sockets.get(playerId);
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const weapon = heldWeapon(playerId);
  const ranks = ranksOf(playerId, weapon);
  const xp = weaponXpOf(playerId, weapon);
  const progress = weaponProgress(xp);
  const spent = spentTalentPoints(weapon, ranks);
  const msg: WeaponProgressMessage = {
    type: "WEAPON_PROGRESS",
    payload: {
      weaponType: weapon,
      xp,
      level: progress.level,
      intoLevel: progress.intoLevel,
      needed: progress.needed,
      pointsSpent: spent,
      pointsAvailable: talentPointsAtLevel(progress.level) - spent,
      ranks,
      hotbar: hotbarOf(playerId, weapon, ranks),
      reason,
    },
  };
  socket.send(JSON.stringify(msg));
}

/** Proficiency is earned only by the weapon that did the work. */
function awardWeaponXp(playerId: string, amount: number): void {
  if (amount <= 0) return;
  const weapon = heldWeapon(playerId);
  const before = weaponProgress(weaponXpOf(playerId, weapon)).level;
  const total = addWeaponXp(playerId, weapon, amount);
  weaponXpCache.get(playerId)?.set(weapon, total);
  const after = weaponProgress(total).level;
  if (after > before) {
    const socket = sockets.get(playerId);
    const name = WEAPONS[weapon].name;
    if (socket) {
      sendInfo(socket, `${name} proficiency ${after} — a talent point to spend.`, "#ffd873");
    }
  }
  sendWeaponProgress(playerId);
}

function maxManaOf(playerId: string, attrs: Attributes): number {
  return (
    maxManaFor(classOf(playerId), playerLevels.get(playerId) ?? 1, attrs.intelligence) +
    passivesOf(playerId).maxManaBonus
  );
}

/**
 * Re-sends the numbers a talent purchase or a weapon swap can move.
 *
 * Max HP, max mana, reach and swing speed are all now downstream of which
 * talents are learned on the weapon in hand, so any of the three events that
 * change that set has to push them: buying a node, refunding a tree, or
 * picking up a different weapon.
 */
function refreshDerivedStats(playerId: string): void {
  const socket = sockets.get(playerId);
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const attrs = attributes.get(playerId) ?? EMPTY_ATTRS;
  const maxHp = maxHpOf(playerId, attrs);
  const hp = Math.min(hpBalances.get(playerId) ?? maxHp, maxHp);
  hpBalances.set(playerId, hp);
  sendHpUpdate(socket, hp, maxHp, false);
  const maxMana = maxManaOf(playerId, attrs);
  const mana = Math.min(manaBalances.get(playerId) ?? maxMana, maxMana);
  manaBalances.set(playerId, mana);
  sendManaUpdate(socket, mana, maxMana);
  sendAttackState(playerId);
}

function sendManaUpdate(socket: WebSocket | undefined, mana: number, maxMana: number): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "MANA_UPDATE", payload: { mana, maxMana } } satisfies ServerToClientMessage));
}

type EquippedItems = Record<ItemSlot, ItemInstance | null>;
const equippedItems = new Map<string, EquippedItems>();

function computeEquipped(items: ItemInstance[]): EquippedItems {
  const out = {} as EquippedItems;
  for (const slot of ITEM_SLOTS) {
    out[slot] = items.find((item) => item.slot === slot && item.equipped) ?? null;
  }
  return out;
}

/**
 * What other clients need in order to draw this player.
 *
 * Delegates to `appearanceFromItems`, the shared derivation the local player
 * already rebuilds its own look with. This used to be a second, independent
 * copy of that logic living here — and the moment the catalogue added a base id
 * to the appearance, this copy silently stopped carrying it, so every remote
 * player was drawn holding nothing while the local one was armed. Exactly the
 * drift the shared function exists to prevent, and it had been latent since the
 * function was written.
 */
function appearanceOf(playerId: string): Appearance {
  const eq = equippedItems.get(playerId);
  const worn = ITEM_SLOTS.map((slot) => eq?.[slot]).filter(
    (item): item is ItemInstance => !!item,
  );
  return appearanceFromItems(worn);
}


/**
 * Places `count` nodes evenly around a ring centred on spawn.
 *
 * These were absolute coordinates until the world grew from 2200x1600 to
 * 4800x3600, at which point every one of them sat bunched in the north-west
 * corner. Expressing them relative to spawn means the layout follows the world
 * size instead of silently going stale the next time it changes.
 */
function ringNodes(
  prefix: string,
  kind: ResourceNodeState["kind"],
  radius: number,
  count: number,
  startDeg = 0,
): ResourceNodeState[] {
  return Array.from({ length: count }, (_, i) => {
    const a = ((startDeg + (360 / count) * i) * Math.PI) / 180;
    return {
      id: `${prefix}-${i + 1}`,
      kind,
      x: Math.round(PLAYER_SPAWN.x + Math.cos(a) * radius),
      y: Math.round(PLAYER_SPAWN.y + Math.sin(a) * radius),
      status: "available" as const,
    };
  });
}

const nodes: ResourceNodeState[] = [
  // Herb bushes ring the workbench — a garden around town, convenient since
  // potions are crafted at the bench they surround.
  //
  // They used to sit at 330px, which is exactly where Emberhold's buildings now
  // stand: six bushes growing through the inn's front wall. Moved INSIDE the
  // square rather than outside the ring, which is the better answer anyway — a
  // herb garden between the anvil and the well is a thing a town would have,
  // and it keeps the one gatherable a beginner needs within sight of spawn.
  ...ringNodes("bush", "bush", 1000, 6, 15),
  // Wood and ore spread outward. The outer rings sit in the same ground as the
  // band-2/3 camps, so gathering out there is a decision rather than a chore.
  //
  // Nothing gatherable stands inside the walls any more. It did for one build —
  // a herb garden in the square, which was convenient and was also the only
  // place in the game where a resource node and a shopfront were the same
  // scenery. A town is somewhere you go BETWEEN gathering trips; a bush growing
  // between the anvil and the inn quietly makes the square another field.
  ...ringNodes("tree-inner", "tree", 1150, 8, 22),
  ...ringNodes("rock-inner", "rock", 1500, 6, 30),
  ...ringNodes("tree-mid", "tree", 1850, 10, 12),
  ...ringNodes("rock-outer", "rock", 2050, 8, 15),
  ...ringNodes("tree-outer", "tree", 2150, 10, 30),
  // Out where the ghosts and trolls are. Nothing forces a player this far for
  // materials, but the reforge ladder's upper steps cost thousands and the
  // inner rings cannot pay for them in any reasonable time — so the ground has
  // to reach as far as the economy does.
  ...ringNodes("bush-far", "bush", 2300, 6, 40),
  ...ringNodes("rock-far", "rock", 2400, 8, 22),
  ...ringNodes("tree-far", "tree", 2500, 8, 5),
  // The outermost two are hard against the map's short axis: the world is 5400
  // tall, so a ring past 2700 leaves the world at the top and bottom of its
  // circle. These sit just inside that and no ring may be added beyond them
  // without the world growing first.
  ...ringNodes("rock-deep", "rock", 2680, 6, 35),
  ...ringNodes("tree-deep", "tree", 2660, 6, 8),
];
const nodeRespawnAt = new Map<string, number>();

function spawnMonster(id: string, kind: MonsterState["kind"], x: number, y: number): MonsterState {
  const maxHp = MONSTER_STATS[kind].maxHp;
  return { id, kind, x, y, status: "alive", hp: maxHp, maxHp, slowed: false, windingUp: false, statuses: [] };
}

// Monsters live in tight packs, not scattered individually, so clearing a
// camp is a running fight against several at once rather than a queue of
// separate duels.
const DIAMOND_OFFSETS = [
  [0, -70],
  [70, 0],
  [0, 70],
  [-70, 0],
] as const;
const TRIANGLE_OFFSETS = [
  [0, -70],
  [65, 45],
  [-65, 45],
] as const;

function spawnPack(
  prefix: string,
  kind: MonsterState["kind"],
  centerX: number,
  centerY: number,
  offsets: readonly (readonly [number, number])[],
): MonsterState[] {
  return offsets.map(([dx, dy], i) => spawnMonster(`${prefix}-${i + 1}`, kind, centerX + dx, centerY + dy));
}

/**
 * Places a pack at a polar offset from spawn.
 *
 * Difficulty is laid out as distance: the further you walk from the workbench,
 * the worse what you meet. Expressing that as (radius, angle) rather than
 * absolute coordinates is what keeps it readable — the band a camp belongs to
 * is the number you are looking at, not something you infer by comparing two
 * coordinates against the map centre.
 */
function ringPack(
  prefix: string,
  kind: MonsterState["kind"],
  radius: number,
  angleDeg: number,
  offsets: readonly (readonly [number, number])[] = DIAMOND_OFFSETS,
): MonsterState[] {
  const a = (angleDeg * Math.PI) / 180;
  return spawnPack(
    prefix,
    kind,
    PLAYER_SPAWN.x + Math.cos(a) * radius,
    PLAYER_SPAWN.y + Math.sin(a) * radius,
    offsets,
  );
}

/** Every living body a player can bump into, as plain circles. */
function aliveMonsterBodies(): { x: number; y: number; radiusPx: number }[] {
  const out: { x: number; y: number; radiusPx: number }[] = [];
  for (const m of monsters) {
    if (m.status !== "alive") continue;
    out.push({ x: m.x, y: m.y, radiusPx: MONSTER_STATS[m.kind].bodyRadiusPx });
  }
  return out;
}

const monsters: MonsterState[] = [
  // Band 1 (~980px) — clearable at level 1. Deliberately no camp closer than
  // this, so spawn and the workbench stay safe ground.
  //
  // Pushed out from 620 when Emberhold was built, and again when the square was
  // widened. A pack reaches 70px in from its own centre, so the number that has
  // to clear the 800px palisade is 980 - 70 = 910, not 980. "Nothing spawns
  // inside the walls" is a rule the Herald says out loud, and a rule stated in
  // dialogue has to be true in the layout — which is why the town test asserts
  // it against the pack's near edge rather than its centre.
  ...ringPack("slime-a", "slime", 1320, 0),
  ...ringPack("mushnub-a", "mushnub", 1320, 90),
  ...ringPack("slime-b", "slime", 1320, 180),
  ...ringPack("mushnub-b", "mushnub", 1320, 270),

  // Band 2 (~1600px)
  ...ringPack("goblin-a", "goblin", 1600, 45),
  ...ringPack("spikyblob-a", "spikyblob", 1600, 135),
  ...ringPack("goblin-b", "goblin", 1600, 225),
  ...ringPack("armabee-a", "armabee", 1600, 315),

  // Band 3 (~1900-2000px)
  ...ringPack("wolf-a", "wolf", 1900, 20),
  ...ringPack("cactoro-a", "cactoro", 1900, 100),
  ...ringPack("orcbrute-a", "orcbrute", 1900, 200),
  ...ringPack("wolf-b", "wolf", 1900, 280),
  ...ringPack("spikyblob-b", "spikyblob", 2000, 160),
  ...ringPack("armabee-b", "armabee", 2000, 340),

  // Band 4 (~1700-1750px). Troll and demon come in threes — three things
  // hitting this hard at once is already the whole fight.
  ...ringPack("ghost-a", "ghost", 2350, 70),
  ...ringPack("troll-a", "troll", 2350, 190, TRIANGLE_OFFSETS),
  ...ringPack("demon-a", "demon", 2350, 310, TRIANGLE_OFFSETS),
  ...ringPack("cactoro-b", "cactoro", 2450, 130),
  ...ringPack("orcbrute-b", "orcbrute", 2450, 250),

  // Band 5 (~2050px) — the far corners. Angles are kept off vertical because
  // the world is wider than it is tall and a pack at 90 degrees would spawn
  // outside the south edge.
  ...ringPack("golem-a", "golem", 2750, 140, TRIANGLE_OFFSETS),
  ...ringPack("dragon-a", "dragon", 2750, 320, TRIANGLE_OFFSETS),
];
const monsterRespawnAt = new Map<string, number>();

// The smithy stands to one side of the square, not on top of spawn.
//
// It was at PLAYER_SPAWN for every phase up to 49 and that was fine while it
// was the only object in the world — it WAS the landmark. In a town it is one
// building among several, and putting it on the exact point every player
// materialises on meant arriving inside the anvil and looking at a workbench
// from the middle of it. Offset by a third of the way to the buildings, on a
// bearing that clears the road and every other feature in the square.
// Read from the town's own prop table, so the thing the client draws, the thing
// the collision keeps you out of and the thing the server lets you craft at are
// one entry rather than three numbers that agree today.
const smithyProp = propById("smithy")!;
const stations: CraftingStationState[] = [
  { id: "workbench-1", ...propPosition(smithyProp) },
];

// There are no standing "intents" any more. Gathering and fighting are
// decided purely by where a player is standing, evaluated fresh each tick,
// so these are just cooldown clocks rather than state machines: when the
// next swing / next gather is allowed. Absent means "not currently doing
// that", and the first tick in range seeds the clock so walking in and out
// of reach can't be used to rush attacks.
const nextAttackAt = new Map<string, number>();
// A standing attack order. Empty means the player is not fighting, however
// close they happen to be standing to something — walking past a camp is not
// an instruction to draw a weapon.
const attackOrders = new Map<string, { since: number; lastInReachAt: number }>();
const nextGatherAt = new Map<string, number>();
// The monster a player has explicitly selected. Auto-attack prefers it, and
// falls back to "whatever is nearest" when unset, so walking into a camp
// still fights back but picking a target lets you focus something.
const playerTargets = new Map<string, string | null>();
// Per-player, per-skill "ready at" timestamps.
const skillReadyAt = new Map<string, Map<SkillId, number>>();
const globalCooldownUntil = new Map<string, number>();
const potionReadyAt = new Map<string, number>();
// Last moment this player dealt or took damage. Regen waits on it, so
// healing only resumes once the fight has genuinely stopped.
const lastCombatAt = new Map<string, number>();
// The ally a player has selected, for the skills that can help someone else.
const playerAllyTargets = new Map<string, string | null>();

function markInCombat(playerId: string, now: number): void {
  lastCombatAt.set(playerId, now);
}

// --- Statuses ---------------------------------------------------------------
// ONE STORE, keyed by entity id, and the id may be a player or a monster.
//
// This replaced four Maps that each held "a modifier expires at T" and each
// reached combat by its own route: `playerBuffUntil`, `shieldUntil`,
// `weakenedUntil` and `monsterSlowUntil`. They were never four ideas, they were
// one idea written four times — and the cost was not the duplication, it was
// that adding a fifth timed effect meant adding a fifth map, a fifth expiry
// branch, a fifth integration into damage, and a fifth chance to forget one.
//
// Players and monsters share it deliberately. `STATUSES[id].on` is what decides
// where a given effect may sit, checked in `applyStatus`, so the rule lives in
// the table rather than in which Map somebody reached for.
const statuses = new Map<string, ActiveStatus[]>();
/** When each running dot last ticked, keyed `entityId|statusId`. */
const statusTickedAt = new Map<string, number>();

/** Everything currently on an entity, expired entries dropped. */
function statusesOf(entityId: string, now: number): ActiveStatus[] {
  const list = statuses.get(entityId);
  if (!list || list.length === 0) return [];
  const live = list.filter((s) => s.endsAt > now);
  if (live.length !== list.length) {
    if (live.length === 0) statuses.delete(entityId);
    else statuses.set(entityId, live);
  }
  return live;
}

function hasStatus(entityId: string, id: StatusId, now: number): boolean {
  return statusesOf(entityId, now).some((s) => s.id === id);
}

/**
 * Puts a status on something, or refreshes it if it is already there.
 *
 * REFRESH RATHER THAN STACK. Two casts of the same debuff on one target extend
 * it instead of doubling it, which is what keeps a stack of slows from being a
 * root and a pair of marks from being a one-shot — the same "never immunity"
 * argument the resistance cap is written under, one level up. Duration is the
 * thing a second cast buys.
 *
 * Returns whether anything changed, so a caller can decide whether to tell the
 * player about it without asking twice.
 */
function applyStatus(
  entityId: string,
  id: StatusId,
  target: "player" | "monster",
  now: number,
  by?: string,
): boolean {
  if (!statusFits(id, target)) return false;
  const def = STATUSES[id];
  const list = statusesOf(entityId, now);
  const endsAt = now + def.durationMs;
  const existing = list.find((s) => s.id === id);
  if (existing) {
    // Never shortens. A weak source refreshing a strong one down would make
    // casting something a way of helping whatever you cast it at.
    existing.endsAt = Math.max(existing.endsAt, endsAt);
    existing.by = by ?? existing.by;
  } else {
    list.push({ id, endsAt, by });
    // The tick clock starts now rather than at zero, so a dot applied this
    // instant does not fire immediately and hand the caster a free tick.
    if (def.dot) statusTickedAt.set(`${entityId}|${id}`, now);
  }
  statuses.set(entityId, list);
  if (target === "monster") syncMonsterStatuses(entityId, now);
  return true;
}

/**
 * Takes one named status off something, if it is there.
 *
 * The other half of `applyStatus`, and it did not exist until skills started
 * READING statuses: everything the game did to a timed effect until now was
 * put one on or let it run out. A detonator spends the burn it goes off, and a
 * cleanse lifts one thing off you — both of those are this.
 *
 * Returns whether anything was actually removed, so the caller can tell the
 * player "you shook it off" rather than announcing a cleanse that cleansed
 * nothing.
 */
function removeStatus(
  entityId: string,
  id: StatusId,
  target: "player" | "monster",
  now: number,
): boolean {
  const live = statusesOf(entityId, now);
  const next = live.filter((s) => s.id !== id);
  if (next.length === live.length) return false;
  if (next.length === 0) statuses.delete(entityId);
  else statuses.set(entityId, next);
  statusTickedAt.delete(`${entityId}|${id}`);
  if (target === "monster") syncMonsterStatuses(entityId, now);
  return true;
}

function clearStatuses(entityId: string): void {
  statuses.delete(entityId);
  for (const key of [...statusTickedAt.keys()]) {
    if (key.startsWith(`${entityId}|`)) statusTickedAt.delete(key);
  }
}

/** Copies a monster's running statuses onto its broadcast state, which is how
 *  the client draws nameplate pips and the target frame's row. */
function syncMonsterStatuses(monsterId: string, now: number): void {
  const monster = monsters.find((m) => m.id === monsterId);
  if (!monster) return;
  monster.statuses = statusesOf(monsterId, now).map((s) => ({ id: s.id, endsAt: s.endsAt }));
}

function sendStatuses(socket: WebSocket | undefined, playerId: string, now: number): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const msg: ServerToClientMessage = {
    type: "STATUS_UPDATE",
    payload: { statuses: statusesOf(playerId, now) },
  };
  socket.send(JSON.stringify(msg));
}


/**
 * Expires everything that has run out, and fires every dot that is due.
 *
 * Runs before anything reads a status, so a modifier can never outlive its own
 * end time by a tick — which is the class of bug the four separate expiry
 * branches used to make possible one at a time.
 *
 * A dot is resolved as REAL DAMAGE of its own school, so a burn is reduced by
 * fire resistance exactly as a firebolt is and there is no second rule about
 * how much a tick hurts. And it credits whoever applied it: without `by`, a
 * poison landing the killing blow would hand the experience to nobody and the
 * loot to no one.
 */
function tickStatuses(now: number): void {
  for (const [entityId, list] of [...statuses]) {
    const live = list.filter((s) => s.endsAt > now);
    if (live.length !== list.length) {
      if (live.length === 0) statuses.delete(entityId);
      else statuses.set(entityId, live);
      const expiredMonster = monsters.find((m) => m.id === entityId);
      if (expiredMonster) {
        syncMonsterStatuses(entityId, now);
        expiredMonster.slowed = statusMoveMultiplier(live) < 1;
      } else {
        sendStatuses(sockets.get(entityId), entityId, now);
      }
    }
    for (const s of live) {
      const def = STATUSES[s.id];
      if (!def.dot) continue;
      const key = `${entityId}|${s.id}`;
      const last = statusTickedAt.get(key) ?? now;
      const every = def.tickMs ?? 1000;
      if (now - last < every) continue;
      statusTickedAt.set(key, now);
      applyDotTick(entityId, s, def.dot, now);
    }
  }
}

/** One tick of one dot, on whichever kind of thing is carrying it. */
function applyDotTick(
  entityId: string,
  active: ActiveStatus,
  dot: { damage: number; school: DamageSchool },
  now: number,
): void {
  const monster = monsters.find((m) => m.id === entityId);
  if (monster) {
    if (monster.status !== "alive") return;
    // The same two multipliers a swing goes through: what the creature is made
    // of, and whatever is raising or lowering what it takes. A burn on a troll
    // is worth what fire is worth on a troll.
    const resist = resistOf(MONSTER_STATS[monster.kind].resist, dot.school);
    const taken = statusDamageTaken(statusesOf(entityId, now));
    const damage = Math.max(1, Math.round(applyResist(dot.damage, resist) * taken));
    monster.hp = Math.max(0, monster.hp - damage);
    const by = active.by;
    if (by) addThreat(monster.id, by, damage);
    for (const [pid, socket] of sockets) {
      if (!socket || socket.readyState !== WebSocket.OPEN) continue;
      // Only to people who can see it. A tick is a floating number over a
      // body, and a body nobody is near is a message nobody can use.
      const p = players.get(pid);
      if (!p || Math.hypot(p.x - monster.x, p.y - monster.y) > 900) continue;
      sendStatusTick(socket, { entityId, statusId: active.id, damage, school: dot.school, monster: true });
    }
    if (monster.hp <= 0) {
      killMonster(monster, now);
      if (by) {
        const attrs = attributes.get(by) ?? EMPTY_ATTRS;
        onPlayerKill(by, attrs);
      }
    }
    return;
  }

  const player = players.get(entityId);
  if (!player) return;
  const attrs = attributes.get(entityId) ?? EMPTY_ATTRS;
  const resist = playerResist(entityId, dot.school);
  const taken = statusDamageTaken(statusesOf(entityId, now));
  const damage = Math.max(1, Math.round(applyResist(dot.damage, resist) * taken));
  const maxHp = maxHpOf(entityId, attrs);
  markInCombat(entityId, now);
  const result = applyDamage(entityId, damage, maxHp);
  hpBalances.set(entityId, result.hp);
  const socket = sockets.get(entityId);
  if (result.defeated) {
    player.x = PLAYER_ARRIVAL.x;
    player.y = PLAYER_ARRIVAL.y;
    handlePlayerDeath(entityId, socket, now);
  }
  if (socket) {
    sendHpUpdate(socket, result.hp, maxHp, result.defeated, result.defeated ? PLAYER_ARRIVAL : undefined);
    sendStatusTick(socket, { entityId, statusId: active.id, damage, school: dot.school, monster: false });
  }
}

function sendStatusTick(
  socket: WebSocket,
  payload: Extract<ServerToClientMessage, { type: "STATUS_TICK" }>["payload"],
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "STATUS_TICK", payload } satisfies ServerToClientMessage));
}

/** A monster's armour with whatever is on it applied — Expose Weakness is the
 *  only thing that moves it, and it moves it here rather than at three call
 *  sites. Never below zero: a negative armour would ADD damage, which is what
 *  a vulnerability is for and is not what stripping armour means. */
function monsterArmor(monster: MonsterState, now: number): number {
  const base = MONSTER_STATS[monster.kind].armor;
  const mod = statusModifiers(statusesOf(monster.id, now)).armor;
  return Math.max(0, base + mod);
}

/** A monster's accuracy, likewise — `shocked` is what moves it. */
function monsterAccuracy(monster: MonsterState, now: number): number {
  const base = MONSTER_STATS[monster.kind].accuracy;
  return Math.max(5, base + statusModifiers(statusesOf(monster.id, now)).accuracyBonus);
}


// Everything that happens when a player drops. Kept in one place because
// both normal attacks and telegraphed slams can kill, and the penalty must
// not depend on which one did it.
function handlePlayerDeath(playerId: string, socket: WebSocket | undefined, now: number): void {
  // Dying cancels the attack order along with the swing clock: you come back
  // standing, not mid-fight with whatever killed you.
  clearCombatClocks(playerId);
  sendAttackState(playerId);
  applyStatus(playerId, "weakened", "player", now);
  sendStatuses(socket, playerId, now);
  const { xp, lost } = loseXpFraction(playerId, DEATH_XP_LOSS_FRACTION);
  // Threat dies with you: a corpse should not still be holding a pack's
  // attention while it walks home.
  for (const table of monsterThreat.values()) table.delete(playerId);
  if (socket) {
    sendXpUpdate(socket, xp, playerLevels.get(playerId) ?? 1, false);
    if (lost > 0) sendInfo(socket, `Defeated — lost ${lost} XP and feel weakened.`, "#ef5350");
    else sendInfo(socket, "Defeated — you feel weakened.", "#ef5350");
  }
}

// Accumulated damage per player, per monster. This one table answers two
// questions that used to be answered wrongly: who the monster should be
// attacking (the biggest threat, not the closest body), and who has earned
// a share of the XP when it dies (everyone who hurt it, not just whoever
// landed the final blow). Cleared when the monster dies or resets, which is
// also what makes threat "decay" — no separate decay pass needed.
const monsterThreat = new Map<string, Map<string, number>>();
// When a telegraphed attack lands, and where the monster was aiming.
const monsterWindupAt = new Map<string, number>();

// When a monster is leaping, and when it may leap again.
const monsterLeapUntil = new Map<string, number>();
const monsterLeapReadyAt = new Map<string, number>();
// Packmates a shout has already woken, so one pull doesn't re-alert forever.
const alertedMonsters = new Set<string>();

function addThreat(monsterId: string, playerId: string, amount: number): void {
  let table = monsterThreat.get(monsterId);
  if (!table) {
    table = new Map<string, number>();
    monsterThreat.set(monsterId, table);
  }
  table.set(playerId, (table.get(playerId) ?? 0) + amount);

  // Social aggro: the first time this monster is hurt, it shouts, and every
  // packmate of the same kind nearby inherits a token amount of threat on
  // the attacker — enough to make them engage. This is what turns pulling
  // into something you plan rather than something that happens to you.
  if (alertedMonsters.has(monsterId)) return;
  const self = monsters.find((m) => m.id === monsterId);
  if (!self) return;
  const radius = MONSTER_STATS[self.kind].alertRadiusPx;
  if (radius === undefined) return;
  alertedMonsters.add(monsterId);

  for (const other of monsters) {
    if (other.id === monsterId || other.kind !== self.kind || other.status !== "alive") continue;
    if (Math.hypot(other.x - self.x, other.y - self.y) > radius) continue;
    // A token 1 point: enough to acquire the target, not enough to distort
    // the kill-credit share the same table feeds.
    const table2 = monsterThreat.get(other.id) ?? new Map<string, number>();
    monsterThreat.set(other.id, table2);
    if (!table2.has(playerId)) table2.set(playerId, 0);
    const ai = monsterAi.get(other.id);
    if (ai && ai.state !== "chase") {
      ai.state = "chase";
      ai.targetId = playerId;
    }
  }
}

function clearThreat(monsterId: string): void {
  monsterThreat.delete(monsterId);
  monsterWindupAt.delete(monsterId);
  monsterLeapUntil.delete(monsterId);
  // Re-arm the shout, so a camp that resets can be pulled fresh.
  alertedMonsters.delete(monsterId);
}

// A dying monster's parting shot. Only the kinds with a burst have one, and
// it fires from where the corpse fell — so wading into a swarm and cleaving
// it down costs you something.
function resolveDeathBurst(monster: MonsterState, now: number): void {
  const stats = MONSTER_STATS[monster.kind];
  const radius = stats.deathBurstRadiusPx;
  const damage = stats.deathBurstDamage;
  if (radius === undefined || damage === undefined) return;

  for (const [playerId, player] of players) {
    if (Math.hypot(player.x - monster.x, player.y - monster.y) > radius) continue;
    const attrs = attributes.get(playerId) ?? EMPTY_ATTRS;
    const equipped = equippedItems.get(playerId);
    const mitigated = Math.max(1, damage - gearArmor(equipped));
    const maxHp = maxHpOf(playerId, attrs);
    const socket = sockets.get(playerId);
    markInCombat(playerId, now);
    const result = applyDamage(playerId, mitigated, maxHp);
    hpBalances.set(playerId, result.hp);
    if (result.defeated) {
      player.x = PLAYER_ARRIVAL.x;
      player.y = PLAYER_ARRIVAL.y;
      handlePlayerDeath(playerId, socket, now);
    }
    if (socket) {
      sendHpUpdate(socket, result.hp, maxHp, result.defeated, result.defeated ? PLAYER_ARRIVAL : undefined);
      sendMonsterAttack(socket, { monsterId: monster.id, hit: true, crit: false, damage: mitigated });
    }
  }
}

// Splits a kill's XP across everyone who damaged the monster, proportional
// to how much they contributed. Loot is not divisible, so it goes to the
// largest contributor rather than being duplicated per player.
function awardKill(monster: MonsterState, now: number): void {
  const table = monsterThreat.get(monster.id);
  const contributors = table ? [...table.entries()].filter(([, dmg]) => dmg > 0) : [];
  if (contributors.length === 0) return;

  const total = contributors.reduce((sum, [, dmg]) => sum + dmg, 0);
  let topId = contributors[0][0];
  let topDamage = -1;

  for (const [playerId, damage] of contributors) {
    if (damage > topDamage) {
      topDamage = damage;
      topId = playerId;
    }
    const attrs = attributes.get(playerId);
    const socket = sockets.get(playerId);
    if (!attrs) continue;

    const share = Math.max(MIN_XP_SHARE, damage / total);
    const reward = Math.max(1, Math.round(xpRewardFor(monster.kind, armorRarities.get(playerId) ?? null) * share));
    const { xp, level, leveledUp, statPoints } = addXp(playerId, reward);
    // Proficiency follows the same share, so the weapon that did the work is
    // the weapon that improves — and only while it is actually in hand.
    awardWeaponXp(playerId, reward);
    playerLevels.set(playerId, level);
    attrs.statPoints = statPoints;
    if (socket) {
      sendXpUpdate(socket, xp, level, leveledUp);
      if (leveledUp) sendStatsUpdate(socket, attrs, maxHpOf(playerId, attrs));
    }
  }

  // Quest credit follows the SAME rule the experience split does — everybody
  // who damaged it gets the kill — rather than going only to the top
  // contributor like the loot. A shared quest that only advanced for whoever
  // landed the killing blow is the exact defect Phase 42 fixed for XP, and
  // re-introducing it here would make questing together worse than questing
  // alone.
  for (const [playerId] of contributors) {
    advanceQuests(playerId, (o) => (o.kind === "kill" && o.monster === monster.kind ? 1 : 0));
  }

  const topSocket = sockets.get(topId);
  if (topSocket) {
    maybeDropLoot(topId, topSocket, monster);
    // Essence goes to the same player the loot does, and for the same reason:
    // it is not divisible, and the threat table already decided who did the
    // most work.
    maybeDropEssence(topId, topSocket, monster);
  }
  void now;
}

// Everything that happens when a monster's HP reaches zero, in one place so
// auto-attacks and skills cannot drift apart on respawn/credit handling.
function killMonster(monster: MonsterState, now: number): void {
  // Burst first: it fires from where the corpse fell, before the body is
  // sent back to its spawn point below.
  resolveDeathBurst(monster, now);
  monster.status = "dead";
  monster.windingUp = false;
  monsterRespawnAt.set(monster.id, now + MONSTER_RESPAWN_MS * MONSTER_STATS[monster.kind].respawnMultiplier);
  monsterAttackAt.delete(monster.id);
  // Everything on it dies with it. Without this a respawn walks back out
  // still poisoned by a fight that happened five minutes ago.
  clearStatuses(monster.id);
  monster.slowed = false;
  monster.statuses = [];
  const ai = monsterAi.get(monster.id);
  if (ai) {
    monster.x = ai.home.x;
    monster.y = ai.home.y;
    ai.state = "idle";
    ai.targetId = null;
  }
  awardKill(monster, now);
  clearThreat(monster.id);
}
// Next time a monster gets its own attack in, keyed by monster id (not by
// player) now that any number of players can be in a monster's reach.
const monsterAttackAt = new Map<string, number>();

// Standard MMO monster brain: idle at its post -> aggro whoever walks too
// close -> chase them -> leash and walk home (healing on the way) if dragged
// too far. Aggro is sticky: it keeps its current target until that target
// dies, logs out, or outruns it, rather than re-picking the nearest player
// every tick, which would make packs flip between targets constantly.
type MonsterAiState = "idle" | "chase" | "return";
interface MonsterAi {
  state: MonsterAiState;
  targetId: string | null;
  home: { x: number; y: number };
}
const monsterAi = new Map<string, MonsterAi>();
for (const monster of monsters) {
  monsterAi.set(monster.id, { state: "idle", targetId: null, home: { x: monster.x, y: monster.y } });
}

function clearCombatClocks(playerId: string): void {
  nextAttackAt.delete(playerId);
  attackOrders.delete(playerId);
  weaponXpCache.delete(playerId);
  talentCache.delete(playerId);
  nextGatherAt.delete(playerId);
}

function sendSkillResult(
  socket: WebSocket | undefined,
  payload: Extract<ServerToClientMessage, { type: "SKILL_RESULT" }>["payload"],
): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "SKILL_RESULT", payload } satisfies ServerToClientMessage));
}

// Damage a monster from a skill. Shared by every offensive skill so single
// target and AoE go down the same death/XP/loot path as an auto-attack.
// Skills go through the same hit resolution as an auto-attack: they can
// miss, they can crit, and evasion/armour apply. Previously they applied
// flat damage, which quietly made Agility worthless the moment you pressed
// a hotbar key — an inconsistency nothing in the UI hinted at.
function applySkillDamage(
  playerId: string,
  monster: MonsterState,
  power: number,
  attrs: Attributes,
  now: number,
  /** The school of the skill being cast. Passed in rather than read off the
   *  weapon: a firebolt is fire in anybody's hands, which is the whole reason a
   *  caster can answer a golem that a swordsman cannot. */
  school: DamageSchool = "physical",
): { hit: boolean; crit: boolean; damage: number; killed: boolean; school: DamageSchool; resisted: number } {
  const stats = MONSTER_STATS[monster.kind];
  const equipped = equippedItems.get(playerId);
  // Enraged and Weakened used to be two bespoke multiplications right here.
  // They are `damagePercent` on a status row now, so they arrive inside
  // `passives` with the talents and the affixes and need no arithmetic of
  // their own — which is the entire argument for the status table.
  const passives = passivesOf(playerId);
  const scaled = applyDamagePercent(power, passives.damagePercent);
  const result = resolveHit({
    attackerAccuracy:
      playerAccuracy(attrs.agility, passives.accuracyBonus) + (equipped?.ring?.bonusStatValue ?? 0),
    // A spread around the skill's rated power, so it varies like a weapon
    // swing rather than landing for exactly the same number every cast.
    attackerMinHit: Math.max(1, Math.round(scaled * 0.85)),
    attackerMaxHit: Math.max(2, Math.round(scaled * 1.15)),
    attackerCritChance:
      playerCritChance(attrs.agility) + gearCritChance(equipped) + passives.critChance,
    attackerCritMultiplier: critDamageMultiplier(
      weaponRarities.get(playerId) ?? null,
      passives.critDamagePercent,
    ),
    defenderEvasion: stats.evasion,
    // Its armour with whatever is on it applied, so Expose Weakness reaches
    // a spell and a swing through one function rather than two.
    defenderArmor: monsterArmor(monster, now),
    school,
    defenderResist: monsterResist(monster.kind, school),
  });

  const resisted = monsterResist(monster.kind, school);
  if (!result.hit) return { hit: false, crit: false, damage: 0, killed: false, school, resisted };

  // Whatever is raising or lowering what it takes — a mark is the only thing
  // that raises it today, and it works on anything that can land.
  const damage = Math.max(
    1,
    Math.round(result.damage * statusDamageTaken(statusesOf(monster.id, now))),
  );
  result.damage = damage;
  monster.hp = Math.max(0, monster.hp - result.damage);
  addThreat(monster.id, playerId, result.damage);
  markInCombat(playerId, now);
  if (monster.hp > 0) {
    return { hit: true, crit: result.crit, damage: result.damage, killed: false, school, resisted };
  }

  killMonster(monster, now);
  onPlayerKill(playerId, attrs);
  return { hit: true, crit: result.crit, damage: result.damage, killed: true, school, resisted };
}

// Passive payoff for landing a killing blow (the warrior's Second Wind).
// Sits here so both auto-attacks and skills trigger it identically.
function onPlayerKill(playerId: string, attrs: Attributes): void {
  const heal = passivesOf(playerId).healOnKill;
  if (heal <= 0) return;
  const maxHp = maxHpOf(playerId, attrs);
  const current = hpBalances.get(playerId) ?? maxHp;
  if (current >= maxHp) return;
  const after = addHp(playerId, heal, maxHp);
  hpBalances.set(playerId, after);
  const socket = sockets.get(playerId);
  if (socket) sendHpUpdate(socket, after, maxHp, false);
}

function spendMana(playerId: string, cost: number, attrs: Attributes): void {
  if (cost <= 0) return;
  const maxMana = maxManaOf(playerId, attrs);
  const next = Math.max(0, (manaBalances.get(playerId) ?? maxMana) - cost);
  manaBalances.set(playerId, next);
  setMana(playerId, next);
  sendManaUpdate(sockets.get(playerId), next, maxMana);
}

function useSkill(playerId: string, skillId: SkillId, now: number): void {
  const socket = sockets.get(playerId);
  const player = players.get(playerId);
  const skill = SKILLS[skillId];
  if (!player || !skill) return;

  const cooldowns = skillReadyAt.get(playerId) ?? new Map<SkillId, number>();
  skillReadyAt.set(playerId, cooldowns);
  const readyAt = cooldowns.get(skillId) ?? 0;
  if (now < readyAt) {
    sendSkillResult(socket, { skillId, ok: false, reason: "cooling down", cooldownRemainingMs: readyAt - now, globalCooldownMs: 0, hits: [] });
    return;
  }
  // Permanent facts first, transient ones second: being told "not ready" when
  // the real answer is "you never learned this" is actively misleading, and
  // that is exactly what checking the GCD first produced.
  const level = playerLevels.get(playerId) ?? 1;
  const weapon = heldWeapon(playerId);
  const ranks = ranksOf(playerId, weapon);
  if (!hasActive(weapon, ranks, skillId)) {
    // Covers both "this weapon's tree has no such talent" and "it does, and
    // you have not bought it" — from the player's side those are one fact.
    sendSkillResult(socket, { skillId, ok: false, reason: "not learned for this weapon", cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
    return;
  }

  const gcdUntil = globalCooldownUntil.get(playerId) ?? 0;
  if (now < gcdUntil) {
    sendSkillResult(socket, { skillId, ok: false, reason: "not ready", cooldownRemainingMs: 0, globalCooldownMs: gcdUntil - now, hits: [] });
    return;
  }

  const attrs = attributes.get(playerId) ?? EMPTY_ATTRS;
  const passives = passivesOf(playerId);
  const manaCost = applyManaCost(skill.manaCost, passives.manaCostPercent);
  const cooldownMs = applyCooldown(skill.cooldownMs, passives.cooldownPercent);
  const maxMana = maxManaOf(playerId, attrs);
  const mana = manaBalances.get(playerId) ?? maxMana;
  if (mana < manaCost) {
    sendSkillResult(socket, { skillId, ok: false, reason: "not enough mana", cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
    return;
  }

  // Using something meant to hurt is an attack order in its own right, so
  // opening with a skill works as well as opening with the basic attack. Heals,
  // buffs and dashes are exempt: mending an ally or dashing away from a fight
  // are not instructions to start one.
  if (skill.kind !== "heal" && skill.kind !== "buff" && skill.kind !== "mobility") {
    orderAttack(playerId, now);
  }

  const power = skillPower(skill, powerOf(playerId, attrs), attrs.vitality, level, passives.skillPowerPercent);
  // Typed off the message rather than restated, so the payload shape has one
  // definition and this list cannot drift from it — which it just did, the
  // first time the wire grew a field.
  const hits: Extract<ServerToClientMessage, { type: "SKILL_RESULT" }>["payload"]["hits"] = [];
  let healed: number | undefined;
  let buffMs: number | undefined;
  let slowMs: number | undefined;
  /** What a `consume` read took off, so the client can say which one went. */
  let consumed: StatusId | undefined;

  // Support skills prefer a selected ally, falling back to yourself. This
  // is what makes two players in a camp actually cooperate rather than
  // merely coexist: you can spend your cooldown on someone else.
  const allyId = playerAllyTargets.get(playerId) ?? null;
  const ally = allyId ? players.get(allyId) : undefined;
  const allyInRange =
    ally && Math.hypot(ally.x - player.x, ally.y - player.y) <= Math.max(skill.rangePx, 260);
  const beneficiaryId = allyInRange && ally ? ally.id : playerId;
  const beneficiarySocket = sockets.get(beneficiaryId);

  if (skill.kind === "mobility") {
    // The displacement itself is applied client-side, consistent with
    // movement already being client-authoritative; the server's job here is
    // solely to own the cooldown so it cannot be spammed.
    markInCombat(playerId, now);
  } else if (skill.kind === "heal") {
    const targetAttrs = attributes.get(beneficiaryId) ?? attrs;
    const maxHp = maxHpOf(beneficiaryId, targetAttrs);
    const before = hpBalances.get(beneficiaryId) ?? maxHp;

    // A CLEANSE is a heal with a read on it. Resolved before the full-health
    // refusal below, because otherwise the one moment a cleanse is most wanted
    // — poisoned, burning, and topped up by a potion — is the moment the button
    // refuses to work.
    const read = skill.reads;
    const lifted =
      read?.on === "self" && read.consume
        ? findRead(read, statusesOf(beneficiaryId, now))
        : null;

    if (before >= maxHp && !lifted) {
      sendSkillResult(socket, {
        skillId,
        ok: false,
        reason: read ? "unhurt, and nothing on you to lift" : "already at full health",
        cooldownRemainingMs: 0,
        globalCooldownMs: 0,
        hits: [],
      });
      return;
    }
    if (lifted) {
      removeStatus(beneficiaryId, lifted, "player", now);
      consumed = lifted;
      sendStatuses(beneficiarySocket, beneficiaryId, now);
    }
    const after = addHp(beneficiaryId, power, maxHp);
    hpBalances.set(beneficiaryId, after);
    healed = after - before;
    if (beneficiarySocket) sendHpUpdate(beneficiarySocket, after, maxHp, false);
    if (beneficiaryId !== playerId && beneficiarySocket) {
      sendInfo(beneficiarySocket, `${players.get(playerId)?.name ?? "Someone"} healed you for ${healed}.`, "#7ed957");
    }
  } else if (skill.kind === "buff") {
    // Which buff comes off the SKILL now rather than out of a two-armed
    // branch that knew the names of the only two that existed. Adding Focus,
    // Rally and Bloodlust needed nothing here at all, which is the test of
    // whether the table was worth building.
    const applied = skill.applies ?? "enraged";
    // Self-only when the skill says so. A damage-reduction cooldown you can
    // hand to someone else stops being the warrior's own survival tool, and
    // Bloodlust is the same argument: recklessness is not a gift.
    const selfOnly = !!skill.selfShieldMs || skill.rangePx === 0;
    const on = selfOnly ? playerId : beneficiaryId;
    applyStatus(on, applied, "player", now, playerId);
    sendStatuses(sockets.get(on), on, now);
    buffMs = STATUSES[applied].durationMs;
    if (on !== playerId) {
      const theirs = sockets.get(on);
      if (theirs) {
        sendInfo(
          theirs,
          `${players.get(playerId)?.name ?? "Someone"} put ${STATUSES[applied].name} on you.`,
          "#ffc107",
        );
      }
    }
  } else {
    // Offensive, in three shapes: a radius around you, a chain that jumps
    // between separate targets, or a single selected enemy.
    let struck: MonsterState[] = [];
    const selectedId = playerTargets.get(playerId);
    let selected = selectedId ? monsters.find((m) => m.id === selectedId) : undefined;
    // Fall back to the nearest enemy in range when nothing is selected, the
    // same way auto-attack already does. Refusing to cast at something you
    // are visibly standing in front of, purely because you never clicked
    // it, is the kind of friction nobody would defend out loud.
    if ((!selected || selected.status !== "alive") && skill.rangePx > 0) {
      let best: MonsterState | undefined;
      let bestDist = skill.rangePx;
      for (const m of monsters) {
        if (m.status !== "alive") continue;
        const d = Math.hypot(m.x - player.x, m.y - player.y);
        if (d <= bestDist) {
          best = m;
          bestDist = d;
        }
      }
      selected = best;
    }

    if (skill.chainTargets && skill.chainTargets > 1) {
      // Starts on your target and jumps to the next nearest, so it rewards
      // fighting a clump without being a free full-camp nuke like a radius.
      const reachable = monsters
        .filter((m) => m.status === "alive" && Math.hypot(m.x - player.x, m.y - player.y) <= skill.rangePx)
        .sort(
          (a, b) =>
            Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
        );
      if (selected && selected.status === "alive") {
        struck = [selected, ...reachable.filter((m) => m.id !== selected.id)];
      } else {
        struck = reachable;
      }
      struck = struck.slice(0, skill.chainTargets);
    } else if (skill.radiusPx > 0 && skill.rangePx > 0) {
      // Ground-targeted: lands on your selected enemy and splashes there,
      // rather than around you (Rain of Arrows, Firebolt). With nothing to aim
      // at it falls on the caster's own feet instead of being refused — see
      // the note on firing into empty air below.
      const aimed =
        selected &&
        selected.status === "alive" &&
        Math.hypot(selected.x - player.x, selected.y - player.y) <= skill.rangePx
          ? selected
          : null;
      const cx = aimed ? aimed.x : player.x;
      const cy = aimed ? aimed.y : player.y;
      struck = monsters.filter(
        (m) => m.status === "alive" && Math.hypot(m.x - cx, m.y - cy) <= skill.radiusPx,
      );
    } else if (skill.radiusPx > 0) {
      struck = monsters.filter(
        (m) => m.status === "alive" && Math.hypot(m.x - player.x, m.y - player.y) <= skill.radiusPx,
      );
    } else {
      const inRange =
        selected &&
        selected.status === "alive" &&
        Math.hypot(selected.x - player.x, selected.y - player.y) <= skill.rangePx;
      struck = inRange && selected ? [selected] : [];
    }

    // Deliberately NOT refused when `struck` is empty.
    //
    // Skills used to be gated on having something to hit: press one with no
    // enemy in range and the server answered "nothing in range" and the press
    // did nothing at all. That made the hotbar feel like it belonged to the
    // monsters rather than to the player — you could not swing a sword at the
    // air, test what a spell looked like, or open a fight with your opener
    // rather than closing into auto-attack range first.
    //
    // Now a skill fires whenever the player can actually afford it: off
    // cooldown, enough mana, right class, unlocked. Whether it connects is a
    // separate question, and `hits: []` is a perfectly good answer to it. The
    // refusals that remain are all about the caster, never about the world.

    // AoE is capped rather than unbounded: without a limit one Cleave in a
    // big camp hits everything at full damage, trivialising the exact fights
    // packs are supposed to make dangerous. Chains carry their own,
    // narrower cap, so they are exempt.
    if (!skill.chainTargets && struck.length > MAX_AOE_TARGETS) {
      struck.sort(
        (a, b) =>
          Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y),
      );
      struck = struck.slice(0, MAX_AOE_TARGETS);
    }

    // A read that looks at the CASTER resolves once, before anything is hit:
    // Onslaught spends one buff on the whole swing, not one per body in front
    // of it. And only once there is something to swing at — a finisher that
    // eats your War Cry on empty air is a button nobody presses twice, and the
    // rest of the hotbar has fired freely into nothing since M3.6 precisely so
    // that pressing a key is never punished.
    let selfBonus = 1;
    if (struck.length > 0 && skill.reads?.on === "self") {
      const found = findRead(skill.reads, statusesOf(playerId, now));
      selfBonus = readMultiplier(skill.reads, found);
      if (found && skill.reads.consume) {
        removeStatus(playerId, found, "player", now);
        consumed = found;
        sendStatuses(socket, playerId, now);
      }
    }

    for (const monster of struck) {
      // The rider lands regardless of the damage roll — a nova that both
      // misses and fails to chill would be infuriating on an 11s cooldown.
      // Which status it is comes off the skill now, so a poison arrow
      // poisons and a gut punch staggers instead of both being called a slow
      // because a slow was the only thing the engine could do.
      if (skill.applies) {
        applyStatus(monster.id, skill.applies, "monster", now, playerId);
        const def = STATUSES[skill.applies];
        if (def.moveMultiplier) {
          monster.slowed = true;
          slowMs = def.durationMs;
        }
        // A debuff is an act of aggression even when it does no damage, or
        // marking something from three hundred pixels away would leave it
        // attacking whoever happened to be nearest.
        addThreat(monster.id, playerId, 1);
      }
      // A read that looks at the TARGET resolves per body, which is the whole
      // reason `empowered` is reported per hit: a detonator in a pack finds the
      // condition on some of what it lands on and not the rest.
      let bonus = selfBonus;
      if (skill.reads?.on === "target") {
        const found = findRead(skill.reads, statusesOf(monster.id, now));
        bonus = readMultiplier(skill.reads, found);
        if (found && skill.reads.consume) {
          removeStatus(monster.id, found, "monster", now);
          consumed = found;
        }
      }
      const empowered = bonus > 1;

      // A skill that names no school is physical, and that is most of the
      // warrior and ranger trees on purpose — Earthshatter splits the ground
      // with a body behind it and Backstab is a knife, and calling either of
      // them an element to make the table look even would be inventing magic
      // where the design has none.
      const result = applySkillDamage(
        playerId,
        monster,
        Math.max(1, Math.round(power * bonus)),
        attrs,
        now,
        skill.school ?? "physical",
      );
      hits.push({
        monsterId: monster.id,
        hit: result.hit,
        damage: result.damage,
        crit: result.crit,
        school: result.school,
        resisted: result.resisted,
        empowered,
      });
    }
  }

  // Only charged once the cast is known to have gone through: every failure
  // path above returns before this, so a refused skill costs nothing.
  spendMana(playerId, manaCost, attrs);
  cooldowns.set(skillId, now + cooldownMs);
  globalCooldownUntil.set(playerId, now + GLOBAL_COOLDOWN_MS);
  sendSkillResult(socket, {
    skillId,
    ok: true,
    cooldownRemainingMs: cooldownMs,
    globalCooldownMs: GLOBAL_COOLDOWN_MS,
    hits,
    healed,
    buffMs,
    slowMs,
    consumed,
  });
}

// Resolves a telegraphed slam: everyone still inside the radius when the
// wind-up completes takes a heavy hit. Anyone who walked out takes nothing,
// which is the entire mechanic — the answer is your feet, not your stats.
function resolveSlam(monster: MonsterState, radiusPx: number, damageMultiplier: number, now: number): void {
  const stats = MONSTER_STATS[monster.kind];
  // The same school its ordinary swing is. A dragon that bites fire and slams
  // physical would make resistance worth exactly half against the one creature
  // it is most obviously for.
  const slamSchool = stats.attackSchool ?? "physical";
  for (const [playerId, player] of players) {
    if (Math.hypot(player.x - monster.x, player.y - monster.y) > radiusPx) continue;

    const attrs = attributes.get(playerId) ?? EMPTY_ATTRS;
    const equipped = equippedItems.get(playerId);
    // A slam obeys the same debuffs its ordinary swing does — a staggered
    // troll should not be able to answer with its best attack at full force.
    const slamPassives = statusModifiers(statusesOf(monster.id, now));
    const hit = resolveHit({
      attackerAccuracy: monsterAccuracy(monster, now),
      attackerMinHit: applyDamagePercent(Math.round(stats.minHit * damageMultiplier), slamPassives.damagePercent),
      attackerMaxHit: applyDamagePercent(Math.round(stats.maxHit * damageMultiplier), slamPassives.damagePercent),
      attackerCritChance: stats.critChance,
      attackerCritMultiplier: stats.critMultiplier,
      defenderEvasion: gearEvasion(equipped),
      defenderArmor: gearArmor(equipped),
      school: slamSchool,
      defenderResist: playerResist(playerId, slamSchool),
    });

    const socket = sockets.get(playerId);
    if (hit.hit) {
      const maxHp = maxHpOf(playerId, attrs);
      markInCombat(playerId, now);
      const result = applyDamage(playerId, hit.damage, maxHp);
      hpBalances.set(playerId, result.hp);
      if (result.defeated) {
        player.x = PLAYER_ARRIVAL.x;
        player.y = PLAYER_ARRIVAL.y;
        handlePlayerDeath(playerId, socket, now);
      }
      if (socket) {
        sendHpUpdate(socket, result.hp, maxHp, result.defeated, result.defeated ? PLAYER_ARRIVAL : undefined);
      }
    }
    if (socket) {
      sendMonsterAttack(socket, {
        monsterId: monster.id,
        hit: hit.hit,
        crit: hit.crit,
        damage: hit.damage,
        school: slamSchool,
      });
    }
  }
  void now;
}

// One swing (or two, with the Agility double-attack) against a monster the
// player is already confirmed to be standing next to.
/** The player's swing interval: base speed, tuned by the weapon family. */
function swingIntervalFor(playerId: string, agility: number): number {
  // Weapon speed scales the whole interval, so a dagger flurries and an axe
  // lands one heavy swing in the same window. damageMultiplier moves the other
  // way (see resolvePlayerAttack), keeping DPS comparable so the choice is
  // burst-vs-steady rather than one weapon simply winning.
  // One resolver, so the item's own tuning arrives with the family's: a
  // claymore is slower than an arming sword and both are slower than a dagger,
  // and the client's stat sheet computes it the same way.
  return swingIntervalOf(
    equippedItems.get(playerId)?.weapon ?? null,
    weaponRarities.get(playerId) ?? null,
    battlePowerLevels.get(playerId) ?? 0,
    agility,
    passivesOf(playerId).attackSpeedPercent,
  );
}

/** Tells one client where its swing clock stands. Cheap enough to send on
 *  every change, which is roughly once a swing. */
function sendAttackState(playerId: string, reason?: string): void {
  const socket = sockets.get(playerId);
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const attrs = attributes.get(playerId) ?? EMPTY_ATTRS;
  const interval = swingIntervalFor(playerId, attrs.agility);
  const readyAt = nextAttackAt.get(playerId);
  const msg: AttackStateMessage = {
    type: "ATTACK_STATE",
    payload: {
      attacking: attackOrders.has(playerId),
      readyInMs: readyAt === undefined ? 0 : Math.max(0, readyAt - Date.now()),
      intervalMs: interval,
      reason,
    },
  };
  socket.send(JSON.stringify(msg));
}

/**
 * Finds what this player's attack order applies to right now: their selection
 * if it is alive and in reach, otherwise the nearest thing that is. The same
 * resolution the auto-swing uses, so a manual press and the swings that follow
 * it can never disagree about who is being hit.
 */
function attackTargetFor(playerId: string, player: LivePlayer): MonsterState | null {
  const reach = reachOf(
    equippedItems.get(playerId)?.weapon ?? null,
    passivesOf(playerId).rangePercent,
  );
  const selectedId = playerTargets.get(playerId);
  if (selectedId) {
    const selected = monsters.find((m) => m.id === selectedId);
    if (selected && selected.status === "alive" &&
        Math.hypot(player.x - selected.x, player.y - selected.y) <= reach) {
      return selected;
    }
  }
  let best: MonsterState | null = null;
  let bestDist = reach;
  for (const monster of monsters) {
    if (monster.status !== "alive") continue;
    const d = Math.hypot(player.x - monster.x, player.y - monster.y);
    if (d <= bestDist) {
      best = monster;
      bestDist = d;
    }
  }
  return best;
}

/** Records that the player has ordered an attack — by pressing the default
 *  attack, or by using a skill that means to hurt something. */
function orderAttack(playerId: string, now: number): void {
  const existing = attackOrders.get(playerId);
  if (existing) existing.lastInReachAt = now;
  else attackOrders.set(playerId, { since: now, lastInReachAt: now });
}

/**
 * A manual swing. Differs from waiting for the auto-swing in one way that
 * matters: an undefined clock means "just closed", and pressing the button
 * cashes that in immediately instead of eating the closing wind-up. Opening a
 * fight is therefore something you do, not something you wait through.
 */
function useDefaultAttack(playerId: string, now: number): void {
  const player = players.get(playerId);
  if (!player) return;
  // The order stands whether or not this particular swing lands, so walking
  // into range after pressing it opens the fight on arrival.
  orderAttack(playerId, now);

  const target = attackTargetFor(playerId, player);
  if (!target) {
    sendAttackState(playerId, "nothing in reach");
    return;
  }
  const readyAt = nextAttackAt.get(playerId);
  if (readyAt !== undefined && now < readyAt) {
    sendAttackState(playerId, "still recovering");
    return;
  }
  const attrs = attributes.get(playerId) ?? EMPTY_ATTRS;
  nextAttackAt.set(playerId, now + swingIntervalFor(playerId, attrs.agility));
  resolvePlayerAttack(playerId, player, target, attrs, sockets.get(playerId), now);
  sendAttackState(playerId);
}

function resolvePlayerAttack(
  playerId: string,
  player: LivePlayer,
  monster: MonsterState,
  attrs: Attributes,
  socket: WebSocket | undefined,
  now: number,
): void {
  const monsterStats = MONSTER_STATS[monster.kind];
  const equipped = equippedItems.get(playerId);
  const passives = passivesOf(playerId);
  const critChance = playerCritChance(attrs.agility) + gearCritChance(equipped) + passives.critChance;
  const critMultiplier = critDamageMultiplier(
    weaponRarities.get(playerId) ?? null,
    passives.critDamagePercent,
  );
  const baseDamageBonus = gearDamageBonus(equipped);
  // War Cry rides on top of gear rather than replacing it, so the buff is
  // worth more the better geared you already are.
  // War Cry and Weakened used to be two hand-written adjustments to this
  // number, one adding a fraction of max hit and one subtracting another.
  // Both are `damagePercent` on a status row now, which `hitBandOf` already
  // applies below — so they are gone from here rather than reimplemented,
  // and any future buff reaches the swing for free.
  const totalDamageBonus = baseDamageBonus;
  const totalAccuracy =
    playerAccuracy(attrs.agility, passives.accuracyBonus) + (equipped?.ring?.bonusStatValue ?? 0);

  let monsterDefeated = false;
  // Agility gives a chance to swing twice — resolved as an independent extra
  // attack, not a damage multiplier, so it still rolls its own hit/miss/crit
  // and shows up as its own combat-log line.
  const swingCount = Math.random() * 100 < doubleAttackChance(attrs.agility) ? 2 : 1;

  for (let swing = 0; swing < swingCount && !monsterDefeated; swing++) {
    // The hit band this particular weapon swings for — family multiplier times
    // the item's own, resolved in one place so a rebalance of either moves the
    // server and the character sheet together.
    const band = hitBandOf(
      equippedItems.get(playerId)?.weapon ?? null,
      powerOf(playerId, attrs),
      totalDamageBonus,
      passives.damagePercent,
    );
    // What the thing in your hand is made of. This is the sentence the whole
    // premise of the game was missing: until now the weapon decided how you
    // fought and never what you were good against, so Frostbrand was a sword
    // with a cold-coloured mesh.
    const school = schoolOf(playerId);
    const playerAttack = resolveHit({
      attackerAccuracy: totalAccuracy,
      attackerMinHit: band.min,
      attackerMaxHit: band.max,
      attackerCritChance: critChance,
      attackerCritMultiplier: critMultiplier,
      defenderEvasion: monsterStats.evasion,
      defenderArmor: monsterArmor(monster, now),
      school,
      defenderResist: monsterResist(monster.kind, school),
    });

    if (playerAttack.hit) {
      playerAttack.damage = Math.max(
        1,
        Math.round(playerAttack.damage * statusDamageTaken(statusesOf(monster.id, now))),
      );
      monster.hp = Math.max(0, monster.hp - playerAttack.damage);
      // Damage is threat: it is what decides who this monster turns on, and
      // what earns a share of the XP when it dies.
      addThreat(monster.id, playerId, playerAttack.damage);
      markInCombat(playerId, now);
      if (monster.hp <= 0) {
        monsterDefeated = true;
        killMonster(monster, now);
      }
    }

    if (socket) {
      sendBattleResult(socket, {
        monsterId: monster.id,
        playerHit: playerAttack.hit,
        playerCrit: playerAttack.crit,
        playerDamage: playerAttack.damage,
        monsterDefeated,
        school,
        resisted: monsterResist(monster.kind, school),
      });
    }
  }

  // No target-chaining needed any more: the next tick simply picks whatever
  // is nearest, which naturally rolls onto the next pack member.
  void player;
}

function sendInventoryUpdate(socket: WebSocket, wood: number, gatherLevel: number): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "INVENTORY_UPDATE", payload: { wood, gatherLevel } };
  socket.send(JSON.stringify(update));
}

function sendOreUpdate(socket: WebSocket, wood: number, ore: number, battlePowerLevel: number): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "ORE_UPDATE", payload: { wood, ore, battlePowerLevel } };
  socket.send(JSON.stringify(update));
}

function sendHerbUpdate(socket: WebSocket, herb: number): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "HERB_UPDATE", payload: { herb } };
  socket.send(JSON.stringify(update));
}

function sendPotionsUpdate(socket: WebSocket, potions: number, wood: number, ore: number, herb: number): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "POTIONS_UPDATE", payload: { potions, wood, ore, herb } };
  socket.send(JSON.stringify(update));
}

function sendTonicsUpdate(socket: WebSocket, tonics: number, wood: number, ore: number, herb: number): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "TONICS_UPDATE", payload: { tonics, wood, ore, herb } };
  socket.send(JSON.stringify(update));
}

const LEADERBOARD_SIZE = 10;

function sendLeaderboardUpdate(socket: WebSocket): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = {
    type: "LEADERBOARD_UPDATE",
    payload: { entries: getLeaderboard(LEADERBOARD_SIZE) },
  };
  socket.send(JSON.stringify(update));
}

function sendDailyBonus(
  socket: WebSocket,
  reward: Extract<ServerToClientMessage, { type: "DAILY_BONUS" }>["payload"],
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "DAILY_BONUS", payload: reward };
  socket.send(JSON.stringify(update));
}

function sendXpUpdate(socket: WebSocket, xp: number, level: number, leveledUp: boolean): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "XP_UPDATE", payload: { xp, level, leveledUp } };
  socket.send(JSON.stringify(update));
}

function sendLootUpdate(socket: WebSocket, item: ItemInstance): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "LOOT_UPDATE", payload: { item } };
  socket.send(JSON.stringify(update));
}

function sendItemsUpdate(socket: WebSocket, playerId: string, items: ItemInstance[]): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = {
    type: "ITEMS_UPDATE",
    payload: {
      items,
      weaponRarity: weaponRarities.get(playerId) ?? null,
      armorRarity: armorRarities.get(playerId) ?? null,
      bootsRarity: bootsRarities.get(playerId) ?? null,
    },
  };
  socket.send(JSON.stringify(update));
}

function sendHpUpdate(
  socket: WebSocket,
  hp: number,
  maxHp: number,
  defeated: boolean,
  respawnPos?: { x: number; y: number },
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = {
    type: "HP_UPDATE",
    payload: { hp, maxHp, defeated, x: respawnPos?.x, y: respawnPos?.y },
  };
  socket.send(JSON.stringify(update));
}

function sendStatsUpdate(socket: WebSocket, attrs: Attributes, maxHp: number, maxMana = 0): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = {
    type: "STATS_UPDATE",
    payload: { ...attrs, maxHp, maxMana },
  };
  socket.send(JSON.stringify(update));
}

// Max HP including the class modifier. A warrior is simply sturdier than a
// mage at the same level and Vitality, which is most of what "class" means
// before a single skill is unlocked.
function maxHpOf(playerId: string, attrs: Attributes): number {
  return (
    maxHpForLevel(playerLevels.get(playerId) ?? 1, attrs.vitality, passivesOf(playerId).maxHpBonus) +
    CLASSES[classOf(playerId)].baseHpBonus
  );
}

function sendBattleResult(
  socket: WebSocket,
  payload: Extract<ServerToClientMessage, { type: "BATTLE_RESULT" }>["payload"],
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "BATTLE_RESULT", payload };
  socket.send(JSON.stringify(update));
}

function sendMonsterAttack(
  socket: WebSocket,
  payload: Extract<ServerToClientMessage, { type: "MONSTER_ATTACK" }>["payload"],
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "MONSTER_ATTACK", payload };
  socket.send(JSON.stringify(update));
}


function sendInfo(socket: WebSocket, text: string, color: string): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "INFO", payload: { text, color } };
  socket.send(JSON.stringify(update));
}

// --- Loot on the ground -----------------------------------------------------
// Everything currently lying in the world, by id. Server memory only, like
// monsters and nodes: a drop lives a couple of minutes and persisting it would
// mean a restart leaving items scattered across a world nobody is standing in.
const drops = new Map<string, DroppedItemState>();
let dropCounter = 0;

/**
 * Puts an item on the ground where the monster fell.
 *
 * Deliberately NOT straight into the bag. A kill is the one moment an item
 * system has the player's whole attention, and spending it on a line of text
 * was a waste of the only art the item has. It also gives the bag-full case an
 * honest answer — the drop waits rather than being destroyed.
 */
function dropOnGround(ownerId: string, item: ItemInstance, x: number, y: number): void {
  const now = Date.now();
  const id = `drop-${++dropCounter}`;
  // Scattered slightly, so two drops from one pack are not one pile.
  const angle = Math.random() * Math.PI * 2;
  const spread = 14 + Math.random() * 18;
  drops.set(id, {
    id,
    x: clamp(x + Math.cos(angle) * spread, 0, WORLD_WIDTH),
    y: clamp(y + Math.sin(angle) * spread, 0, WORLD_HEIGHT),
    item,
    ownerId,
    freeAt: now + LOOT_RESERVED_MS,
    expiresAt: now + LOOT_LIFETIME_MS,
  });
}

/**
 * Walk over it and it is yours. Proximity, like everything else in this game —
 * gathering, combat and the workbench are all decided by where you are standing,
 * and a pick-up key would be the only thing that was not.
 */
function collectDrops(now: number): void {
  for (const [id, drop] of drops) {
    if (now >= drop.expiresAt) {
      drops.delete(id);
      continue;
    }
    const free = now >= drop.freeAt;
    for (const player of players.values()) {
      if (!free && player.id !== drop.ownerId) continue;
      if (Math.hypot(player.x - drop.x, player.y - drop.y) > LOOT_PICKUP_RANGE_PX) continue;

      const socket = sockets.get(player.id);
      // Asked with the item in hand rather than as a bare count: a seventh copy
      // of something already in the bag needs no new cell, so a bag the old
      // rule called full can still take it. That is what a cap counting cells
      // rather than instances buys.
      if (!bagRoomFor(listItems(player.id), drop.item, INVENTORY_CAP)) {
        // The drop stays where it is rather than being destroyed, which is what
        // makes a full bag a delay instead of a loss.
        if (socket) {
          sendInfo(socket, `Bag is full (${bagSlotsUsed(listItems(player.id))}/${INVENTORY_CAP} slots) — salvage something.`, "#ef5350");
        }
        continue;
      }

      const stored = addItem(player.id, {
        baseId: drop.item.baseId,
        slot: drop.item.slot,
        rarity: drop.item.rarity,
        statValue: drop.item.statValue,
        bonusStatValue: drop.item.bonusStatValue,
        affixes: drop.item.affixes,
        weaponType: drop.item.weaponType,
        style: drop.item.style,
      });
      drops.delete(id);
      if (socket) {
        sendLootUpdate(socket, stored);
        sendItemsUpdate(socket, player.id, listItems(player.id));
      }
      break;
    }
  }
}

function maybeDropLoot(playerId: string, socket: WebSocket, monster: MonsterState): void {
  const guaranteed = MONSTER_STATS[monster.kind].guaranteedDrop;
  if (!guaranteed && Math.random() > LOOT_DROP_CHANCE) return;

  // WHAT drops is decided by where the player is fighting, not by a flat roll
  // over every item in the game. The monster's own difficulty band is the
  // input, so walking one ring further out changes the loot table as well as
  // the danger — which is the whole point of laying the world out as bands.
  //
  // Weapons still drop in ANY family, not the finder's: since the weapon IS the
  // class, an unfamiliar drop is the game offering a different way to play
  // rather than the dead loot it used to be under the old equip restriction.
  // The kind, not just its band: what a thing is made of decides what it is
  // carrying, and a boss has one item it is known for.
  const band = MONSTER_STATS[monster.kind].band;
  const base = rollBase(band, monster.kind);
  const quality = guaranteed ? rollRarityWithFloor(BOSS_MIN_RARITY) : rollRarity();
  const rolled = rollItem(base, quality);
  // On the ground, not in the bag. It is reserved for the player the threat
  // table credited with the kill — the same answer the experience split uses —
  // and goes free after a while so nobody's drop becomes somebody else's litter.
  dropOnGround(playerId, { ...rolled, id: `pending-${dropCounter}`, equipped: false }, monster.x, monster.y);
}

/**
 * Essence off a kill. The one material that cannot be gathered, and the reason
 * the top of the reforge ladder is not a function of time spent at trees.
 */
function maybeDropEssence(playerId: string, socket: WebSocket, monster: MonsterState): void {
  const stats = MONSTER_STATS[monster.kind];
  const amount = essenceFor(stats.band, stats.guaranteedDrop);
  if (amount <= 0) return;
  addEssence(playerId, amount);
  sendMaterials(socket, playerId);
  sendInfo(socket, `+${amount} essence`, "#c0a6ff");
}

/** Every consumable stack the character holds. */
function sendConsumables(socket: WebSocket, counts: Record<string, number>): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "CONSUMABLES_UPDATE", payload: { counts } };
  socket.send(JSON.stringify(update));
}

/** Everything this character has learned to make. */
function sendRecipes(socket: WebSocket, playerId: string): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = {
    type: "RECIPES_UPDATE",
    payload: { known: knownRecipes(playerId) },
  };
  socket.send(JSON.stringify(update));
}

function sendRunes(socket: WebSocket, counts: Record<string, number>): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const update: ServerToClientMessage = { type: "RUNES_UPDATE", payload: { counts } };
  socket.send(JSON.stringify(update));
}

// --- Emberhold ---------------------------------------------------------------

/**
 * Everything this character has taken and everything they have finished.
 *
 * Read straight out of SQLite each time rather than mirrored in a map, which is
 * the same call the recipes make: this is sent when something changes, not
 * sixty times a second, and a cached copy of a table is one more thing that can
 * disagree with the table.
 */
function sendQuestState(socket: WebSocket | undefined, playerId: string): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const rows = questRows(playerId);
  const update: ServerToClientMessage = {
    type: "QUEST_STATE",
    payload: {
      active: rows.filter((r) => r.completedAt === null).map((r) => ({ id: r.questId, count: r.count })),
      completed: rows.filter((r) => r.completedAt !== null).map((r) => r.questId),
    },
  };
  socket.send(JSON.stringify(update));
}

/** Is this player standing close enough to the named townsperson to deal? */
function nearNpc(playerId: string, npcId: string): boolean {
  const npc = npcById(npcId);
  const player = players.get(playerId);
  if (!npc || !player) return false;
  // A little slack over the client's own range, for the same reason the bench
  // has it: the server's copy of where you are standing lags yours by up to a
  // send interval, and a refusal at exactly the boundary reads as a bug.
  return Math.hypot(player.x - npc.x, player.y - npc.y) <= NPC_TALK_RANGE_PX * 1.5;
}

/**
 * Moves every active quest whose objective matches.
 *
 * One funnel for all four objective kinds, called from the four places the
 * server already resolves those events. Written as a predicate over the
 * objective rather than as a switch per call site, so adding a quest that
 * counts something new is a change in `shared/quests.ts` and one line here —
 * not a fifth hook nobody remembers to add.
 */
function advanceQuests(
  playerId: string,
  matches: (o: QuestObjective) => number,
): void {
  const rows = questRows(playerId).filter((r) => r.completedAt === null);
  if (rows.length === 0) return;
  let changed = false;
  for (const row of rows) {
    const def = questDef(row.questId);
    if (!def) continue;
    const amount = matches(def.objective);
    if (amount <= 0) continue;
    if (row.count >= def.objective.count) continue;
    const next = advanceQuest(playerId, def.id, amount, def.objective.count);
    changed = true;
    const socket = sockets.get(playerId);
    // Said out loud at the moment it completes, because the alternative is a
    // player who finished a quest an hour ago and never went back.
    if (socket && questSatisfied(def, next)) {
      sendInfo(socket, `"${def.name}" — done. Return to ${npcById(def.giver)?.name ?? "the giver"}.`, "#ffd873");
    }
  }
  if (changed) sendQuestState(sockets.get(playerId), playerId);
}

/** The whole wallet, in one message. */
function sendMaterials(socket: WebSocket, playerId: string): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  const m = materialsOf(playerId);
  woodBalances.set(playerId, m.wood);
  oreBalances.set(playerId, m.ore);
  herbBalances.set(playerId, m.herb);
  const update: ServerToClientMessage = { type: "MATERIALS_UPDATE", payload: m };
  socket.send(JSON.stringify(update));
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket) => {
  let id: string | null = null;

  socket.on("message", (raw) => {
    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "HELLO") {
      const name = msg.payload.name.trim().slice(0, 16) || "Adventurer";
      const character = loadOrCreateCharacter(name);
      id = character.id;

      // No offline progress: nothing accrues while logged out, because
      // nothing happens without a player standing somewhere to make it happen.
      const daily = claimDailyBonus(id);
      const wood = daily ? daily.wood : character.wood;
      const ore = daily ? daily.ore : character.ore;
      const herb = daily ? daily.herb : character.herb;
      const potions = daily ? daily.potions : character.potions;

      // Equipment must land before anything that reads the player's class:
      // classOf() derives it from the equipped weapon, so until this map is
      // populated every class-dependent value (mana pool, HP bonus, attack
      // range) would be computed as if the character were unarmed.
      const characterItems = listItems(id);
      equippedItems.set(id, computeEquipped(characterItems));

      players.set(id, {
        id: character.id,
        name: character.name,
        x: character.x,
        y: character.y,
        appearance: appearanceOf(id),
      });
      sockets.set(id, socket);
      lastSavedAt.set(id, Date.now());
      gatherLevels.set(id, character.gatherLevel);
      battlePowerLevels.set(id, character.battlePowerLevel);
      weaponRarities.set(id, character.weaponRarity);
      armorRarities.set(id, character.armorRarity);
      bootsRarities.set(id, character.bootsRarity);
      woodBalances.set(id, wood);
      oreBalances.set(id, ore);
      herbBalances.set(id, herb);
      potionBalances.set(id, potions);
      tonicBalances.set(id, character.tonics);
      playerLevels.set(id, character.level);
      hpBalances.set(id, character.hp);
      lastRegenAt.set(id, Date.now());
      const attrs: Attributes = {
        strength: character.strength,
        agility: character.agility,
        vitality: character.vitality,
        intelligence: character.intelligence,
        statPoints: character.statPoints,
      };
      attributes.set(id, attrs);
      // Clamp on load: a passive or level change while offline can leave the
      // stored pool larger than the current maximum.
      const startMaxMana = maxManaOf(id, attrs);
      const startMana = Math.min(character.mana, startMaxMana);
      manaBalances.set(id, startMana);
      setMana(id, startMana);
      lastManaRegenAt.set(id, Date.now());
      console.log(`[connect] ${character.name} (${id}) at (${character.x}, ${character.y})`);

      const welcome: ServerToClientMessage = {
        type: "WELCOME",
        payload: {
          id,
          x: character.x,
          y: character.y,
          wood,
          ore,
          herb,
          gatherLevel: character.gatherLevel,
          battlePowerLevel: character.battlePowerLevel,
          xp: character.xp,
          level: character.level,
          hp: character.hp,
          maxHp: maxHpForLevel(character.level, character.vitality) + CLASSES[classOf(id)].baseHpBonus,
          strength: character.strength,
          agility: character.agility,
          vitality: character.vitality,
          intelligence: character.intelligence,
          statPoints: character.statPoints,
          appearance: appearanceOf(id),
          mana: startMana,
          maxMana: startMaxMana,
          weaponRarity: character.weaponRarity,
          armorRarity: character.armorRarity,
          bootsRarity: character.bootsRarity,
          items: characterItems,
          potions,
          tonics: character.tonics,
        },
      };
      socket.send(JSON.stringify(welcome));
      if (daily) {
        sendDailyBonus(socket, daily);
      }
      // Seeds the bar's swing timer and the talent panel before anything else
      // happens.
      sendAttackState(id);
      sendWeaponProgress(id);
      // And the wallet, which WELCOME does not carry: essence arrived after the
      // welcome payload was settled, and one message that always says all four
      // is better than a fifth field that only some paths remember to set.
      sendMaterials(socket, id);
      sendRecipes(socket, id);
      sendConsumables(socket, consumablesOf(id));
      sendRunes(socket, runesOf(id));
      // Work in hand, so the tracker is populated on the first frame rather
      // than only after the next kill.
      sendQuestState(socket, id);
      // Whatever is still running. Statuses do not survive a disconnect — they
      // live in memory and a character who logged out is not standing anywhere
      // to be on fire — but a reconnect inside one still has to be told, or the
      // indicator row starts empty while the server keeps applying the numbers.
      sendStatuses(socket, id, Date.now());
      return;
    }

    if (msg.type === "MOVE" && id) {
      const p = players.get(id);
      if (!p) return;
      // Movement stays client-authoritative — the client integrates it and the
      // server takes its word for where it went. "Takes its word" is not the
      // same as "accepts anything", though: the position is clamped into the
      // world and pushed out of any body it is standing inside, using the same
      // shared function the client already ran. A client that honoured the rule
      // sees no change; one that skipped it gains nothing, because every range
      // check in combat reads the corrected position.
      const wanted = resolveBodyCollision(
        clamp(msg.payload.x, 0, WORLD_WIDTH),
        clamp(msg.payload.y, 0, WORLD_HEIGHT),
        PLAYER_BODY_RADIUS_PX,
        aliveMonsterBodies(),
      );
      p.x = wanted.x;
      p.y = wanted.y;

      const now = Date.now();
      if (now - (lastSavedAt.get(id) ?? 0) >= SAVE_INTERVAL_MS) {
        savePosition(id, p.x, p.y);
        lastSavedAt.set(id, now);
      }
      return;
    }

    if (msg.type === "SET_TARGET" && id) {
      const targetId = msg.payload.targetId;
      // One selection, resolved by looking the id up in each collection —
      // an enemy to fight or an ally to help, without a second message or a
      // second click. Unknown or dead ids simply clear.
      const monster = targetId ? monsters.find((m) => m.id === targetId) : null;
      if (monster) {
        playerTargets.set(id, monster.status === "alive" ? monster.id : null);
        playerAllyTargets.set(id, null);
        return;
      }
      const ally = targetId && targetId !== id ? players.get(targetId) : undefined;
      playerAllyTargets.set(id, ally ? ally.id : null);
      if (!targetId) playerTargets.set(id, null);
      return;
    }

    if (msg.type === "USE_SKILL" && id) {
      useSkill(id, msg.payload.skillId, Date.now());
      return;
    }

    if (msg.type === "USE_ATTACK" && id) {
      useDefaultAttack(id, Date.now());
      return;
    }

    if (msg.type === "LEARN_TALENT" && id) {
      const weapon = heldWeapon(id);
      const ranks = ranksOf(id, weapon);
      const nodeId = msg.payload.nodeId;
      // The same shared check the client greyed the button with, re-run here
      // because a message can say anything.
      const verdict = canLearnTalent(weapon, ranks, nodeId, weaponLevelOf(id, weapon));
      if (!verdict.ok) {
        sendWeaponProgress(id, verdict.reason);
        return;
      }
      const next = (ranks[nodeId] ?? 0) + 1;
      setTalentRank(id, weapon, nodeId, next);
      ranks[nodeId] = next;
      sendWeaponProgress(id);
      // A new talent can change the whole stat line — max HP, mana, reach —
      // so the derived numbers have to be re-sent, not just the tree.
      refreshDerivedStats(id);
      return;
    }

    if (msg.type === "SET_HOTBAR" && id) {
      // Normalised before storage rather than on the way out, so a bad layout
      // is repaired once instead of on every read.
      setHotbar(id, msg.payload.weaponType, normalizeHotbar(msg.payload.layout));
      return;
    }

    if (msg.type === "RESET_TALENTS" && id) {
      const weapon = msg.payload.weaponType;
      clearTalents(id, weapon);
      talentCache.get(id)?.set(weapon, {});
      const socket2 = sockets.get(id);
      if (socket2) sendInfo(socket2, `${WEAPONS[weapon].name} talents refunded.`, "#9ad4ff");
      sendWeaponProgress(id);
      refreshDerivedStats(id);
      return;
    }

    if (msg.type === "UPGRADE_GATHER_SPEED" && id) {
      const level = gatherLevels.get(id) ?? 0;
      const result = tryUpgradeGatherSpeed(id, gatherUpgradeCost(level));
      if (!result) return;

      gatherLevels.set(id, result.gatherLevel);
      woodBalances.set(id, result.wood);
      sendInventoryUpdate(socket, result.wood, result.gatherLevel);
      return;
    }

    if (msg.type === "UPGRADE_BATTLE_POWER" && id) {
      const level = battlePowerLevels.get(id) ?? 0;
      const cost = battlePowerUpgradeCost(level);
      const result = tryUpgradeBattlePower(id, cost.wood, cost.ore);
      if (!result) return;

      battlePowerLevels.set(id, result.battlePowerLevel);
      woodBalances.set(id, result.wood);
      oreBalances.set(id, result.ore);
      sendOreUpdate(socket, result.wood, result.ore, result.battlePowerLevel);
      return;
    }

    if (msg.type === "EQUIP_ITEM" && id) {
      // Nothing is gated: any character can equip any weapon, because doing so
      // IS the class change. What used to be a rejection is now the feature.
      const before = classOf(id);
      const offhandBefore = equippedItems.get(id)?.offhand ?? null;
      const weaponBefore = equippedItems.get(id)?.weapon ?? null;
      const result = equipItem(id, msg.payload.itemId);
      if (!result) return;

      // Two hands are two hands, and `equipItem` enforces that silently — which
      // from the player's side is a shield disappearing for no stated reason.
      // Said out loud here rather than in the rule itself: the rule belongs to
      // the equipment, the explanation belongs to the person who was surprised.
      const nowWorn = (slot: ItemSlot) =>
        result.items.find((i) => i.slot === slot && i.equipped) ?? null;
      if (offhandBefore && !nowWorn("offhand")) {
        sendInfo(
          socket,
          `${itemName(offhandBefore)} put away — both hands are on your weapon.`,
          "#c9b47a",
        );
      } else if (weaponBefore && !nowWorn("weapon")) {
        sendInfo(
          socket,
          `${itemName(weaponBefore)} put away — you cannot hold it and an off-hand.`,
          "#c9b47a",
        );
      }

      weaponRarities.set(id, result.weaponRarity);
      armorRarities.set(id, result.armorRarity);
      bootsRarities.set(id, result.bootsRarity);
      equippedItems.set(id, computeEquipped(result.items));
      sendItemsUpdate(socket, id, result.items);
      // A new weapon is a new swing speed, a new tree, and a different set of
      // learned talents. All of it has to be pushed: the bar's timer, the
      // tree panel, and every stat the tree feeds.
      sendWeaponProgress(id);
      refreshDerivedStats(id);

      // Other clients render from the broadcast appearance, so it has to be
      // refreshed here or remote players keep drawing the old gear.
      const live = players.get(id);
      if (live) live.appearance = appearanceOf(id);

      const after = classOf(id);
      if (after !== before) {
        // Changing class moves the HP and mana ceilings, and both pools can
        // now sit above their maximum (a mage's robe-sized mana pool does not
        // survive picking up an axe). Clamp and push both, or the bars show
        // impossible numbers until the next unrelated update.
        const attrs = attributes.get(id) ?? EMPTY_ATTRS;
        const maxHp = maxHpOf(id, attrs);
        const maxMana = maxManaOf(id, attrs);
        // addHp(0) is the clamp-and-persist path: it stores min(current, max).
        const hp = addHp(id, 0, maxHp);
        const mana = Math.min(manaBalances.get(id) ?? maxMana, maxMana);
        hpBalances.set(id, hp);
        manaBalances.set(id, mana);
        setMana(id, mana);
        sendStatsUpdate(socket, attrs, maxHp, maxMana);
        sendHpUpdate(socket, hp, maxHp, false);
        sendManaUpdate(socket, mana, maxMana);
        sendInfo(socket, `${WEAPONS[weaponTypeOf(id) ?? "fist"].name} in hand — you fight as a ${CLASSES[after].name}.`, "#ffd479");
      }
      return;
    }

    if (msg.type === "SALVAGE_MANY" && id) {
      // Capped, and every entry re-validated: the list arrives from the client
      // and can say anything, including ids belonging to somebody else or to
      // something being worn. Bad entries are dropped rather than failing the
      // whole request, because a partially-stale list is the normal case when
      // a drop lands mid-click.
      const wanted = msg.payload.itemIds.slice(0, INVENTORY_CAP);
      const total: Record<string, number> = {};
      let count = 0;
      let learnedAny = false;
      for (const itemId of wanted) {
        const one = salvageItem(id, itemId);
        if (!one) continue;
        count++;
        if (one.learned) learnedAny = true;
        for (const [k, v] of Object.entries(one.yielded)) {
          total[k] = (total[k] ?? 0) + (v ?? 0);
        }
      }
      if (count === 0) return;

      const items = listItems(id);
      equippedItems.set(id, computeEquipped(items));
      sendItemsUpdate(socket, id, items);
      sendMaterials(socket, id);
      if (learnedAny) sendRecipes(socket, id);
      sendInfo(
        socket,
        `Salvaged ${count} item${count === 1 ? "" : "s"}: ${describeCost(total)}.`,
        "#c9b47a",
      );
      return;
    }

    if (msg.type === "SALVAGE_ITEM" && id) {
      const result = salvageItem(id, msg.payload.itemId);
      if (!result) return;

      equippedItems.set(id, computeEquipped(result.items));
      sendItemsUpdate(socket, id, result.items);
      sendMaterials(socket, id);
      sendInfo(socket, `Salvaged: ${describeCost(result.yielded)}.`, "#c9b47a");
      if (result.learned) {
        // Worth its own line, and a louder colour: this is the moment the loop
        // closes, and a player who misses it never learns that salvage teaches.
        sendInfo(
          socket,
          `You learn to forge ${ITEM_BASES[result.learned]?.name ?? "it"}.`,
          "#ffd873",
        );
        sendRecipes(socket, id);
      }
      return;
    }

    if (msg.type === "ALLOCATE_STAT" && id) {
      const result = allocateStat(id, msg.payload.stat as AttributeName);
      if (!result) return;

      const nextAttrs: Attributes = { ...result };
      attributes.set(id, nextAttrs);
      // Intelligence changes the mana ceiling, so the pool has to be pushed
      // back alongside the stat sheet or the bar shows a stale maximum.
      const maxMana = maxManaOf(id, nextAttrs);
      sendStatsUpdate(socket, nextAttrs, maxHpOf(id, nextAttrs), maxMana);
      sendManaUpdate(socket, manaBalances.get(id) ?? maxMana, maxMana);
    }

    // --- Emberhold: the shop ------------------------------------------------
    if (msg.type === "BUY_FROM_VENDOR" && id) {
      const npc = npcById(msg.payload.npcId);
      if (!npc || npc.role !== "vendor") return;
      if (!nearNpc(id, npc.id)) {
        sendInfo(socket, `You are too far from ${npc.name}.`, "#c98d5e");
        return;
      }
      const entry = shopEntry(msg.payload.entryId);
      if (!entry) return;

      if (entry.kind === "item") {
        const base = ITEM_BASES[entry.ref];
        if (!base) return;
        // Room checked BEFORE the materials are taken. The forge does the same,
        // and for the same reason: the alternative is paying for something that
        // then does not arrive.
        if (!bagRoomFor(listItems(id), { baseId: base.id, rarity: SHOP_OUTPUT_RARITY, affixes: [] }, INVENTORY_CAP)) {
          sendInfo(socket, `Bag is full (${bagSlotsUsed(listItems(id))}/${INVENTORY_CAP} slots).`, "#ef5350");
          return;
        }
        if (!spendMaterials(id, entry.cost)) {
          sendInfo(socket, `Not enough — ${base.name} costs ${describeCost(entry.cost)}.`, "#c98d5e");
          return;
        }
        const item = addItem(id, rollItem(base, SHOP_OUTPUT_RARITY));
        sendLootUpdate(socket, item);
        sendItemsUpdate(socket, id, listItems(id));
        sendMaterials(socket, id);
        return;
      }

      const def = consumableDef(entry.ref);
      if (!def) return;
      if (!spendMaterials(id, entry.cost)) {
        sendInfo(socket, `Not enough — ${def.name} costs ${describeCost(entry.cost)}.`, "#c98d5e");
        return;
      }
      sendConsumables(socket, addConsumable(id, def.id));
      sendMaterials(socket, id);
      sendInfo(socket, `Bought ${def.name}.`, "#9fe0a8");
      return;
    }

    // --- Emberhold: work ----------------------------------------------------
    if (msg.type === "ACCEPT_QUEST" && id) {
      const def = questDef(msg.payload.questId);
      if (!def || def.giver !== msg.payload.npcId) return;
      if (!nearNpc(id, def.giver)) return;

      // The same gate the client greys the row out with, re-run here — the
      // client's list and the server's rule have to BE the same rule, or a
      // hand-written message walks straight past the level requirement.
      const rows = questRows(id);
      const state = offerStateFor(
        def,
        playerLevels.get(id) ?? 1,
        rows.filter((r) => r.completedAt === null).map((r) => ({ id: r.questId, count: r.count })),
        rows.filter((r) => r.completedAt !== null).map((r) => r.questId),
      );
      if (state !== "offer") return;

      if (acceptQuest(id, def.id)) {
        sendInfo(socket, `Taken: "${def.name}".`, "#ffd873");
        sendQuestState(socket, id);
      }
      return;
    }

    if (msg.type === "TURN_IN_QUEST" && id) {
      const def = questDef(msg.payload.questId);
      if (!def || def.giver !== msg.payload.npcId) return;
      if (!nearNpc(id, def.giver)) return;

      const row = questRows(id).find((r) => r.questId === def.id);
      if (!row || row.completedAt !== null) return;
      if (!questSatisfied(def, row.count)) return;

      // The write is the gate. `completeQuest` only changes a row whose
      // completedAt is still null, so two turn-in messages arriving together
      // cannot both pay out — the second one changes nothing and returns false.
      if (!completeQuest(id, def.id)) return;

      if (def.reward.materials) {
        for (const [material, amount] of Object.entries(def.reward.materials)) {
          if (amount) addMaterial(id, material as Material, amount);
        }
        sendMaterials(socket, id);
      }
      if (def.reward.consumable) {
        sendConsumables(socket, addConsumable(id, def.reward.consumable.id, def.reward.consumable.count));
      }
      const attrs = attributes.get(id);
      const { xp, level, leveledUp, statPoints } = addXp(id, def.reward.xp);
      playerLevels.set(id, level);
      if (attrs) attrs.statPoints = statPoints;
      sendXpUpdate(socket, xp, level, leveledUp);
      if (leveledUp && attrs) sendStatsUpdate(socket, attrs, maxHpOf(id, attrs));
      sendQuestState(socket, id);
      return;
    }

    if (msg.type === "REQUEST_LEADERBOARD") {
      sendLeaderboardUpdate(socket);
    }

    // --- forge: make a named thing ----------------------------------------
    if (msg.type === "FORGE_ITEM" && id) {
      if (!atStation(id, msg.payload.stationId)) return;
      const base = ITEM_BASES[msg.payload.baseId];
      if (!base) return;
      // Checked against what is about to be made rather than against a count,
      // for the same reason a drop is: forging a second copy of something you
      // already carry needs no new cell.
      if (!bagRoomFor(listItems(id), { baseId: base.id, rarity: FORGE_OUTPUT_RARITY, affixes: [] }, INVENTORY_CAP)) {
        sendInfo(socket, `Bag is full (${bagSlotsUsed(listItems(id))}/${INVENTORY_CAP} slots) — salvage something first.`, "#ef5350");
        return;
      }
      // Re-checked here rather than trusted from the client, for the same
      // reason `canLearnTalent` is: the button the client greys out and the
      // rule the server enforces have to be the same rule, and a hand-written
      // message can say anything at all.
      const gate = canForge(base, knownRecipes(id));
      if (!gate.ok) {
        sendInfo(socket, `${base.name}: ${gate.reason}.`, "#c98d5e");
        return;
      }

      const cost = forgeCost(base);
      if (!spendMaterials(id, cost)) {
        sendInfo(socket, `Not enough materials — ${base.name} needs ${describeCost(cost)}.`, "#c98d5e");
        return;
      }

      const item = addItem(id, rollItem(base, FORGE_OUTPUT_RARITY));
      sendLootUpdate(socket, item);
      sendItemsUpdate(socket, id, listItems(id));
      sendMaterials(socket, id);
      advanceQuests(id, (o) => (o.kind === "forge" ? 1 : 0));
      return;
    }

    // --- reforge: one step up the ladder -----------------------------------
    if (msg.type === "REFORGE_ITEM" && id) {
      if (!atStation(id, msg.payload.stationId)) return;

      const item = getItem(id, msg.payload.itemId);
      if (!item) return;
      const base = itemBase(item.baseId);
      const cost = reforgeCost(base, item.rarity);
      if (!cost) {
        sendInfo(socket, `${itemName(item)} is already at the top of the ladder.`, "#c98d5e");
        return;
      }
      if (!spendMaterials(id, cost)) {
        sendInfo(socket, `Not enough materials — reforging needs ${describeCost(cost)}.`, "#c98d5e");
        return;
      }

      // The chosen affix is passed through rather than trusted: `rollAffixes`
      // ignores anything the quality does not allow or the item could not have
      // rolled, so a hand-written message naming an archmage's affix on a band-1
      // cap simply gets a normal roll.
      const next = reforgeItem(item, Math.random, msg.payload.affix);
      if (!next) return;
      const saved = replaceItemRolls(id, item.id, next);
      if (!saved) return;

      const items = listItems(id);
      // The reforged item may be the one being worn, and its numbers have just
      // changed — so the equipped cache has to be rebuilt or combat keeps
      // resolving against the old rolls.
      equippedItems.set(id, computeEquipped(items));
      sendItemsUpdate(socket, id, items);
      sendMaterials(socket, id);
      sendInfo(socket, `Reforged: ${itemName(saved)}.`, "#ffd873");
      return;
    }

    // --- draw: an item's one worthwhile part --------------------------------
    if (msg.type === "DRAW_RUNE" && id) {
      if (!atStation(id, msg.payload.stationId)) return;
      const drawn = drawRune(id, msg.payload.itemId, msg.payload.affix);
      // Says so rather than failing silently. Every reason this can refuse is a
      // "should not happen" from the client's side — a stale item id, something
      // being worn, an affix the item does not carry — which is exactly why a
      // silent return is the wrong answer: it leaves a button that does nothing
      // and no way to tell whether the click landed.
      if (!drawn) {
        sendInfo(socket, "Nothing to draw there — that item is gone, worn, or carries no such rune.", "#c98d5e");
        return;
      }

      const items = listItems(id);
      // Drawing can only destroy something in the bag — `drawRune` refuses an
      // equipped item — but the cache is rebuilt anyway, for the same reason
      // reforging does it: the list every combat number reads is derived from
      // this one and must never be a frame behind it.
      equippedItems.set(id, computeEquipped(items));
      sendItemsUpdate(socket, id, items);
      sendRunes(socket, drawn.runes);
      const affix = AFFIXES_BY_ID[msg.payload.affix];
      sendInfo(
        socket,
        `Drew ${affix?.label ?? msg.payload.affix} out of ${itemName(drawn.item)}. Nothing else survived.`,
        "#c0a6ff",
      );
      return;
    }

    // --- etch: a rune, cut into something you own ---------------------------
    if (msg.type === "ETCH_AFFIX" && id) {
      if (!atStation(id, msg.payload.stationId)) return;
      const item = getItem(id, msg.payload.itemId);
      if (!item) return;

      // Re-checked here rather than trusted from the client, exactly as the
      // chosen reforge affix is: the button the client greys out and the rule
      // the server enforces have to be the same rule.
      const gate = canEtch(item, msg.payload.affix);
      if (!gate.ok) {
        sendInfo(socket, `Cannot etch that: ${gate.reason}.`, "#c98d5e");
        return;
      }
      const next = etchAffix(item, msg.payload.affix, msg.payload.replacing);
      if (!next) return;

      // The rune first, then the materials, then the write. Each is its own
      // atomic statement, so the order decides what a half-failure costs — and
      // a player who cannot pay should not have lost the rune, which is why the
      // rune is handed back if the materials do not go through.
      if (!spendRune(id, msg.payload.affix)) {
        sendInfo(socket, "You have no such rune.", "#c98d5e");
        return;
      }
      const cost = etchCost(item);
      if (!spendMaterials(id, cost)) {
        addRune(id, msg.payload.affix, 1);
        sendRunes(socket, runesOf(id));
        sendInfo(socket, `Not enough materials — etching needs ${describeCost(cost)}.`, "#c98d5e");
        return;
      }

      const saved = replaceItemRolls(id, item.id, next);
      if (!saved) return;
      const items = listItems(id);
      // The etched item may be the one being worn, and its passives have just
      // changed — so the equipped cache has to be rebuilt or combat keeps
      // resolving against the old affixes.
      equippedItems.set(id, computeEquipped(items));
      sendItemsUpdate(socket, id, items);
      sendMaterials(socket, id);
      sendRunes(socket, runesOf(id));
      sendInfo(socket, `Etched: ${itemName(saved)}.`, "#ffd873");
      return;
    }

    // --- refine: raw into stock --------------------------------------------
    if (msg.type === "REFINE_MATERIAL" && id) {
      if (!atStation(id, msg.payload.stationId)) return;
      const def = refineDef(msg.payload.id);
      if (!def) return;

      // Clamped, then paid for one at a time until the wallet runs out. The
      // alternative — price the whole batch and refuse it whole — makes the
      // commonest case a failure: the client sized the button off a wallet that
      // was true when the panel last drew, and a gather landing mid-click is
      // enough to make it stale. Refining nine of the ten asked for is the
      // honest answer, and each step is its own atomic spend so nothing is
      // charged for stock that was never made.
      const wanted = Math.max(1, Math.min(50, Math.round(msg.payload.count ?? 1)));
      let made = 0;
      for (let i = 0; i < wanted; i++) {
        if (!spendMaterials(id, def.cost)) break;
        addMaterial(id, def.id, 1);
        made++;
      }

      if (made === 0) {
        sendInfo(socket, `Not enough materials — one ${def.name} needs ${describeCost(def.cost)}.`, "#c98d5e");
        return;
      }
      sendMaterials(socket, id);
      const spent: MaterialCost = {};
      for (const [k, v] of Object.entries(def.cost)) spent[k as keyof MaterialCost] = (v ?? 0) * made;
      sendInfo(
        socket,
        `Refined ${made} ${def.name}${made === 1 ? "" : "s"} from ${describeCost(spent)}.`,
        "#ffd873",
      );
      return;
    }

    // --- consumables: one pair of handlers for the whole table --------------
    if (msg.type === "CRAFT_CONSUMABLE" && id) {
      if (!atStation(id, msg.payload.stationId)) return;
      const def = consumableDef(msg.payload.id);
      if (!def) return;
      if (!spendMaterials(id, def.cost)) {
        sendInfo(socket, `Not enough materials — ${def.name} needs ${describeCost(def.cost)}.`, "#c98d5e");
        return;
      }
      const counts = addConsumable(id, def.id);
      sendMaterials(socket, id);
      sendConsumables(socket, counts);
      return;
    }

    if (msg.type === "USE_CONSUMABLE" && id) {
      const def = consumableDef(msg.payload.id);
      if (!def) return;
      const nowMs = Date.now();

      // One cooldown group for everything that heals. Without it a stack of two
      // different healing items is exactly the immunity button the potion
      // cooldown exists to prevent, and "add a consumable" would quietly be a
      // way around it.
      if (def.gated) {
        const readyAt = potionReadyAt.get(id) ?? 0;
        if (nowMs < readyAt) {
          sendInfo(socket, `Not ready (${Math.ceil((readyAt - nowMs) / 1000)}s)`, "#9e9e9e");
          return;
        }
      }

      const counts = spendConsumable(id, def.id);
      if (!counts) return;
      if (def.gated) potionReadyAt.set(id, nowMs + POTION_COOLDOWN_MS);
      sendConsumables(socket, counts);

      const attrs = attributes.get(id) ?? EMPTY_ATTRS;
      if (def.effect.heal) {
        const maxHp = maxHpForLevel(playerLevels.get(id) ?? 1, attrs.vitality);
        const newHp = addHp(id, def.effect.heal, maxHp);
        hpBalances.set(id, newHp);
        lastRegenAt.set(id, nowMs);
        sendHpUpdate(socket, newHp, maxHp, false);
      }
      if (def.effect.mana) {
        const maxMana = maxManaOf(id, attrs);
        const next = Math.min(maxMana, (manaBalances.get(id) ?? 0) + def.effect.mana);
        manaBalances.set(id, next);
        sendManaUpdate(socket, next, maxMana);
      }
      if (def.effect.xp) {
        const { xp, level, leveledUp, statPoints } = addXp(id, def.effect.xp);
        playerLevels.set(id, level);
        attrs.statPoints = statPoints;
        attributes.set(id, attrs);
        sendXpUpdate(socket, xp, level, leveledUp);
        if (leveledUp) sendStatsUpdate(socket, attrs, maxHpOf(id, attrs), maxManaOf(id, attrs));
      }
      if (def.effect.buffMs) {
        // The same buff War Cry grants, which is the point: a consumable that
        // needed a new mechanic would be a new mechanic wearing a potion bottle.
        applyStatus(id, "enraged", "player", nowMs, id);
        sendStatuses(socket, id, nowMs);
        sendInfo(socket, `${def.name} — ${consumableSummary(def)}.`, "#ffd873");
      }
      return;
    }

  });

  socket.on("close", () => {
    if (!id) return;
    const p = players.get(id);
    if (p) savePosition(id, p.x, p.y);

    // Nothing to resume on reconnect any more, so the disconnect record no
    // longer needs to remember what the player was busy with.
    markDisconnected(id, null, null);

    console.log(`[disconnect] ${p?.name ?? id}`);
    // Anything this player had aggro on falls back to walking home.
    for (const ai of monsterAi.values()) {
      if (ai.targetId === id) {
        ai.targetId = null;
        ai.state = "return";
      }
    }
    players.delete(id);
    sockets.delete(id);
    lastSavedAt.delete(id);
    clearCombatClocks(id);
    playerTargets.delete(id);
    skillReadyAt.delete(id);
    globalCooldownUntil.delete(id);
      manaBalances.delete(id);
    lastManaRegenAt.delete(id);
    potionReadyAt.delete(id);
    clearStatuses(id);
    lastCombatAt.delete(id);
    playerAllyTargets.delete(id);
    for (const [pid, allyId] of playerAllyTargets) if (allyId === id) playerAllyTargets.set(pid, null);
    // Drop this player's threat everywhere so packs don't hold aggro on a ghost.
    for (const table of monsterThreat.values()) table.delete(id);
    gatherLevels.delete(id);
    battlePowerLevels.delete(id);
    weaponRarities.delete(id);
    armorRarities.delete(id);
    bootsRarities.delete(id);
    woodBalances.delete(id);
    oreBalances.delete(id);
    herbBalances.delete(id);
    potionBalances.delete(id);
    tonicBalances.delete(id);
    playerLevels.delete(id);
    hpBalances.delete(id);
    attributes.delete(id);
    equippedItems.delete(id);
    lastRegenAt.delete(id);
  });
});

setInterval(() => {
  const now = Date.now();

  // Anything lying on the ground that somebody is now standing on, and anything
  // that has been lying there too long.
  collectDrops(now);

  for (const node of nodes) {
    if (node.status === "depleted" && now >= (nodeRespawnAt.get(node.id) ?? 0)) {
      node.status = "available";
      nodeRespawnAt.delete(node.id);
    }
  }

  for (const monster of monsters) {
    if (monster.status === "dead" && now >= (monsterRespawnAt.get(monster.id) ?? 0)) {
      monster.status = "alive";
      monster.hp = monster.maxHp;
      monsterRespawnAt.delete(monster.id);
    }
  }

  tickStatuses(now);

  // --- Monster AI ---------------------------------------------------------
  // Monsters coming to you is what makes this a fight rather than a
  // stationary target dummy, and it gives running away a real meaning.
  for (const monster of monsters) {
    const ai = monsterAi.get(monster.id);
    if (!ai) continue;
    const stats = MONSTER_STATS[monster.kind];
    // Every slow on it, composed — a chill and a poison together are worse
    // than either alone, and neither can root it.
    const stepPx =
      ((stats.speedPxPerSec * statusMoveMultiplier(statusesOf(monster.id, now))) * TICK_MS) / 1000;

    if (monster.status !== "alive") {
      ai.state = "idle";
      ai.targetId = null;
      continue;
    }

    const distFromHome = Math.hypot(monster.x - ai.home.x, monster.y - ai.home.y);

    // Leash check first: being dragged too far from home overrides anything
    // else and sends it back, which is what stops a player towing a whole
    // pack across the map and abandoning it there.
    if (ai.state === "chase" && distFromHome > MONSTER_LEASH_PX) {
      ai.state = "return";
      ai.targetId = null;
    }

    if (ai.state === "chase") {
      // Threat overrides the initial pick: whoever has hurt this monster
      // most is who it turns on, so damage pulls it off a bystander who
      // merely walked past — the behaviour that makes tanking possible.
      const threatTable = monsterThreat.get(monster.id);
      if (threatTable) {
        let topId: string | null = null;
        let topDamage = 0;
        for (const [pid, damage] of threatTable) {
          const candidate = players.get(pid);
          if (!candidate || (hpBalances.get(pid) ?? 1) <= 0) continue;
          if (Math.hypot(candidate.x - monster.x, candidate.y - monster.y) > AGGRO_RANGE_PX * 1.4) continue;
          if (damage > topDamage) {
            topDamage = damage;
            topId = pid;
          }
        }
        if (topId) ai.targetId = topId;
      }

      const target = ai.targetId ? players.get(ai.targetId) : undefined;
      const targetDead = ai.targetId ? (hpBalances.get(ai.targetId) ?? 1) <= 0 : true;
      // Give up if the target vanished, died, or has outrun the aggro radius
      // (with slack, so walking the boundary doesn't blink aggro on and off).
      if (!target || targetDead || Math.hypot(target.x - monster.x, target.y - monster.y) > AGGRO_RANGE_PX * 1.4) {
        ai.state = "return";
        ai.targetId = null;
        clearThreat(monster.id);
      } else {
        const d = Math.hypot(target.x - monster.x, target.y - monster.y);
        // Melee slots: only MAX_MELEE_ATTACKERS press into contact; the rest
        // hold at successively wider rings and rotate in as those die. Rank
        // is by distance among everything already chasing this same player.
        const queue = monsters
          .filter((m) => m.status === "alive" && monsterAi.get(m.id)?.targetId === ai.targetId)
          .sort(
            (a, b) =>
              Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
          );
        const rank = queue.findIndex((m) => m.id === monster.id);
        const overflow = Math.max(0, rank - (MAX_MELEE_ATTACKERS - 1));
        // Never closer than the two bodies allow. Without the floor a small,
        // short-reach monster would keep walking until it was standing in the
        // player, and the collision pass would then shove the player back out
        // every tick — the pair would jitter against each other instead of
        // squaring up.
        const contact = separationFor(PLAYER_BODY_RADIUS_PX, stats.bodyRadiusPx);
        const stopAt = Math.max(
          contact,
          stats.attackRangePx * 0.8 + overflow * MELEE_RING_STEP_PX,
        );

        // Leap: the gap-closer. Triggered from mid-range and only by front
        // rank monsters, so a pack doesn't all pounce at once. While
        // leaping the monster simply moves much faster — the burst is the
        // whole mechanic, and it is what makes the fast kind something you
        // need an escape tool for rather than something you outwalk.
        let speed = stepPx;
        const leapingUntil = monsterLeapUntil.get(monster.id) ?? 0;
        if (now < leapingUntil) {
          speed = stepPx * (stats.leapSpeedMultiplier ?? 1);
        } else if (
          stats.leapRangePx !== undefined &&
          stats.leapDurationMs !== undefined &&
          rank < MAX_MELEE_ATTACKERS &&
          d > stats.attackRangePx * 1.6 &&
          d <= stats.leapRangePx &&
          now >= (monsterLeapReadyAt.get(monster.id) ?? 0)
        ) {
          monsterLeapUntil.set(monster.id, now + stats.leapDurationMs);
          monsterLeapReadyAt.set(monster.id, now + (stats.leapCooldownMs ?? 8000));
          speed = stepPx * (stats.leapSpeedMultiplier ?? 1);
        }

        if (d > stopAt) {
          // Clamped to the remaining gap. A leaping monster moves several
          // times its normal step, and without this it would sail straight
          // through the stop distance and end up inside its target.
          const step = Math.min(speed, d - stopAt);
          monster.x += ((target.x - monster.x) / d) * step;
          monster.y += ((target.y - monster.y) / d) * step;
        }
      }
    } else if (ai.state === "return") {
      if (distFromHome <= 2) {
        monster.x = ai.home.x;
        monster.y = ai.home.y;
        // Reset on arrival, the way MMOs do: a monster that broke off a
        // fight shouldn't sit at its post permanently half-dead.
        monster.hp = monster.maxHp;
        ai.state = "idle";
      } else {
        const step = Math.min(stepPx, distFromHome);
        monster.x += ((ai.home.x - monster.x) / distFromHome) * step;
        monster.y += ((ai.home.y - monster.y) / distFromHome) * step;
      }
    }

    // Acquire a target when idle (or when returning and someone walks into
    // it) — nearest living player inside the aggro radius.
    if (ai.state !== "chase") {
      let nearest: LivePlayer | null = null;
      let nearestDist = AGGRO_RANGE_PX;
      for (const player of players.values()) {
        if ((hpBalances.get(player.id) ?? 1) <= 0) continue;
        const d = Math.hypot(player.x - monster.x, player.y - monster.y);
        if (d <= nearestDist) {
          nearest = player;
          nearestDist = d;
        }
      }
      if (nearest) {
        ai.state = "chase";
        ai.targetId = nearest.id;
      }
    }
  }

  // --- Separation: keep bodies out of each other ---------------------------
  // Chasing alone converges every pack member onto the same point, so four
  // wolves render as one silhouette and occupy zero space. A push apart,
  // applied after movement, spreads them into a believable cluster without
  // needing real pathfinding.
  //
  // Two rules keep this from becoming the thing it is meant to prevent. The
  // distance each pair wants is their own two radii, not one global number, or
  // a golem and a dragon overlap while two slimes stand absurdly far apart. And
  // the shove can never exceed what the monster could walk in the same tick:
  // being slid sideways faster than its own top speed is exactly the
  // ice-skating this is supposed to look like the opposite of.
  for (const monster of monsters) {
    if (monster.status !== "alive") continue;
    const stats = MONSTER_STATS[monster.kind];
    let pushX = 0;
    let pushY = 0;
    for (const other of monsters) {
      if (other === monster || other.status !== "alive") continue;
      const want = Math.max(
        MONSTER_SEPARATION_PX,
        separationFor(stats.bodyRadiusPx, MONSTER_STATS[other.kind].bodyRadiusPx),
      );
      const dx = monster.x - other.x;
      const dy = monster.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d >= want) continue;
      if (d < 0.01) {
        // Exactly coincident: nudge deterministically off the id so the pair
        // don't jitter against each other forever.
        pushX += monster.id < other.id ? 1 : -1;
        continue;
      }
      const strength = (want - d) / want;
      pushX += (dx / d) * strength;
      pushY += (dy / d) * strength;
    }
    if (pushX !== 0 || pushY !== 0) {
      const mag = Math.hypot(pushX, pushY) || 1;
      const walkable = (stats.speedPxPerSec * TICK_MS) / 1000;
      const shove = Math.min(walkable, mag * 6);
      monster.x += (pushX / mag) * shove;
      monster.y += (pushY / mag) * shove;
    }
  }

  // --- And out of the players ---------------------------------------------
  // The pass above is blind to players, so a monster on the far side of a
  // crowded pack can be shoved straight through one — which is how a body ends
  // up overlapping a player who never walked into anything.
  //
  // The monster yields, never the player. Displacing a player from the server
  // would fight the client's own authority over its position, arrive a round
  // trip late, and feel like being shoved by something invisible.
  const playerBodies = [...players.values()].map((p) => ({
    x: p.x,
    y: p.y,
    radiusPx: PLAYER_BODY_RADIUS_PX,
  }));
  if (playerBodies.length > 0) {
    for (const monster of monsters) {
      if (monster.status !== "alive") continue;
      const clear = resolveBodyCollision(
        monster.x,
        monster.y,
        MONSTER_STATS[monster.kind].bodyRadiusPx,
        playerBodies,
      );
      monster.x = clear.x;
      monster.y = clear.y;
    }
  }

  // --- Player actions: decided by proximity, re-evaluated every tick ------
  for (const [playerId, player] of players) {
    const socket = sockets.get(playerId);
    const playerAttrs = attributes.get(playerId) ?? EMPTY_ATTRS;

    // Fighting is something you ordered, not something proximity decides for
    // you. Without a standing order the player is simply standing there, and
    // may gather or walk through a camp untouched by their own weapon — the
    // monsters' own AI is what decides whether they get attacked back.
    const order = attackOrders.get(playerId);
    const target = order ? attackTargetFor(playerId, player) : null;

    if (order && !target) {
      // An order outlives a moment out of reach — chasing a fleeing monster or
      // stepping between two pack members should not end the fight. It lapses
      // only once nothing has been reachable for a while, which is what
      // walking away actually looks like.
      if (now - order.lastInReachAt > ATTACK_ORDER_LAPSE_MS) {
        attackOrders.delete(playerId);
        nextAttackAt.delete(playerId);
        sendAttackState(playerId);
      }
    }

    if (order && target) {
      order.lastInReachAt = now;
      nextGatherAt.delete(playerId);
      const interval = swingIntervalFor(playerId, playerAttrs.agility);
      const readyAt = nextAttackAt.get(playerId);
      // First tick in reach only starts the clock — closing to melee has a
      // wind-up, and without it stepping in and out would rush every swing.
      // Pressing the attack button is how you skip it (see useDefaultAttack).
      if (readyAt === undefined) {
        nextAttackAt.set(playerId, now + interval);
        sendAttackState(playerId);
        continue;
      }
      if (now < readyAt) continue;
      nextAttackAt.set(playerId, now + interval);

      resolvePlayerAttack(playerId, player, target, playerAttrs, socket, now);
      sendAttackState(playerId);
      continue;
    }

    if (nextAttackAt.has(playerId)) {
      nextAttackAt.delete(playerId);
      sendAttackState(playerId);
    }

    // Otherwise gather from whatever node is underfoot.
    let node: ResourceNodeState | null = null;
    let nodeDist = Infinity;
    for (const candidate of nodes) {
      if (candidate.status !== "available") continue;
      const d = Math.hypot(player.x - candidate.x, player.y - candidate.y);
      if (d < nodeDist && d <= INTERACTION_RANGE_PX) {
        node = candidate;
        nodeDist = d;
      }
    }
    if (!node) {
      nextGatherAt.delete(playerId);
      continue;
    }

    const gatherInterval = gatherDurationForLevel(gatherLevels.get(playerId) ?? 0, playerAttrs.agility);
    const gatherReadyAt = nextGatherAt.get(playerId);
    if (gatherReadyAt === undefined) {
      nextGatherAt.set(playerId, now + gatherInterval);
      continue;
    }
    if (now < gatherReadyAt) continue;
    nextGatherAt.set(playerId, now + gatherInterval);

    {
      node.status = "depleted";
      nodeRespawnAt.set(node.id, now + GATHER_RESPAWN_MS);

      // How much depends on where the node stands. One gather used to be worth
      // exactly one wherever it happened, which made the ground the one part of
      // the world that did not reward walking further out.
      const yielded = gatherYieldFor(bandAt(node.x, node.y), gatherLevels.get(playerId) ?? 0);

      if (node.kind === "tree") {
        const wood = addWood(playerId, yielded);
        woodBalances.set(playerId, wood);
        if (socket) sendInventoryUpdate(socket, wood, gatherLevels.get(playerId) ?? 0);
      } else if (node.kind === "rock") {
        const ore = addOre(playerId, yielded);
        oreBalances.set(playerId, ore);
        if (socket) {
          sendOreUpdate(socket, woodBalances.get(playerId) ?? 0, ore, battlePowerLevels.get(playerId) ?? 0);
        }
      } else {
        const herb = addHerb(playerId, yielded);
        herbBalances.set(playerId, herb);
        if (socket) sendHerbUpdate(socket, herb);
      }

      // Counted as the YIELD, not as one gather. "Thirty wood" has to mean
      // thirty wood in the bag, or the same quest is four trips at the wall and
      // fifteen out where the ground is rich — and the number on the tracker
      // would not match the number in the materials panel, which is the kind of
      // disagreement players rightly read as a bug.
      const gained = resourceForNodeKind(node.kind);
      advanceQuests(playerId, (o) =>
        o.kind === "gather" && o.resource === gained ? yielded : 0,
      );
    }
  }

  // Monster counter-attacks, on each monster's own cadence. Keyed by
  // monster rather than by player now that combat is proximity-based and
  // any number of players can be standing in one monster's reach.
  for (const monster of monsters) {
    if (monster.status !== "alive") continue;
    const stats = MONSTER_STATS[monster.kind];

    // Telegraphed attackers resolve on a separate clock: they announce the
    // swing, then land it wherever they are standing when it completes. The
    // whole point is that the gap between those two moments is long enough
    // to walk out of, so this must NOT re-check range at wind-up time.
    const windupMs = stats.windupMs;
    // Hoisted into a local because TypeScript cannot keep the narrowing on
    // `stats.slamRadiusPx` alive inside the closure below.
    const slamRadius = stats.slamRadiusPx;
    if (windupMs !== undefined && slamRadius !== undefined) {
      const landsAt = monsterWindupAt.get(monster.id);
      if (landsAt !== undefined) {
        if (now < landsAt) continue;
        monsterWindupAt.delete(monster.id);
        monster.windingUp = false;
        monsterAttackAt.set(monster.id, now + stats.attackIntervalMs);
        resolveSlam(monster, slamRadius, stats.slamDamageMultiplier ?? 1, now);
        continue;
      }

      const due = monsterAttackAt.get(monster.id);
      if (due === undefined) {
        monsterAttackAt.set(monster.id, now + stats.attackIntervalMs);
        continue;
      }
      if (now < due) continue;

      // Only start winding up if someone is actually close enough to be
      // worth swinging at — otherwise it flails at an empty clearing.
      const someoneNear = [...players.values()].some(
        (p) => Math.hypot(p.x - monster.x, p.y - monster.y) <= slamRadius,
      );
      if (!someoneNear) continue;
      monsterWindupAt.set(monster.id, now + windupMs);
      monster.windingUp = true;
      continue;
    }

    const dueAt = monsterAttackAt.get(monster.id);
    if (dueAt === undefined) {
      monsterAttackAt.set(monster.id, now + stats.attackIntervalMs);
      continue;
    }
    if (now < dueAt) continue;

    // Each kind swings at its own reach, which is what makes stepping back
    // from a troll work and stepping back from a slime trivial.
    let victimId: string | null = null;
    let victimDist = Infinity;
    for (const p of players.values()) {
      const d = Math.hypot(p.x - monster.x, p.y - monster.y);
      if (d < victimDist && d <= stats.attackRangePx) {
        victimId = p.id;
        victimDist = d;
      }
    }
    if (!victimId) continue;

    monsterAttackAt.set(monster.id, now + stats.attackIntervalMs);
    const attrs = attributes.get(victimId) ?? EMPTY_ATTRS;
    const equipped = equippedItems.get(victimId);
    const defPassives = passivesOf(victimId);
    const totalEvasion = gearEvasion(equipped) + defPassives.evasion;
    const playerArmor = gearArmor(equipped) + defPassives.armor;
    // Monsters deal typed damage too, which is what stops this being a one-way
    // conversation about offence: a dragon breathes fire, so Rimeward mail and
    // a suffix of the Salamander have something to be for.
    const monsterSchool = stats.attackSchool ?? "physical";
    // The monster's own statuses cut both ways: Shocked takes its aim and
    // Staggered takes the weight out of its blows. Without this half, every
    // debuff in the game would be a damage bonus wearing a different name.
    const foePassives = statusModifiers(statusesOf(monster.id, now));
    const monsterAttack = resolveHit({
      attackerAccuracy: monsterAccuracy(monster, now),
      attackerMinHit: applyDamagePercent(stats.minHit, foePassives.damagePercent),
      attackerMaxHit: applyDamagePercent(stats.maxHit, foePassives.damagePercent),
      attackerCritChance: stats.critChance,
      attackerCritMultiplier: stats.critMultiplier,
      defenderEvasion: totalEvasion,
      defenderArmor: playerArmor,
      school: monsterSchool,
      defenderResist: passiveResist(defPassives, monsterSchool),
    });

    const socket = sockets.get(victimId);
    if (monsterAttack.hit) {
      const maxHp = maxHpOf(victimId, attrs);
      markInCombat(victimId, now);
      // Every damage-taken multiplier on the victim, composed. Shield Wall
      // used to be a bespoke branch here, which is why nothing else could
      // ever raise or lower incoming damage without a second one beside it.
      const taken = statusDamageTaken(statusesOf(victimId, now));
      const incoming = Math.max(1, Math.round(monsterAttack.damage * taken));
      const result = applyDamage(victimId, incoming, maxHp);
      hpBalances.set(victimId, result.hp);
      // What the blow leaves behind. Only on a hit, and only sometimes —
      // every swing landing a debuff makes it a stat rather than an event,
      // and the whole point of the indicator is that something changed.
      if (stats.inflicts && Math.random() < stats.inflicts.chance) {
        if (applyStatus(victimId, stats.inflicts.status, "player", now, monster.id)) {
          sendStatuses(socket, victimId, now);
        }
      }

      if (result.defeated) {
        const p = players.get(victimId);
        if (p) {
          p.x = PLAYER_ARRIVAL.x;
          p.y = PLAYER_ARRIVAL.y;
        }
        handlePlayerDeath(victimId, socket, now);
      }
      if (socket) {
        sendHpUpdate(socket, result.hp, maxHp, result.defeated, result.defeated ? PLAYER_ARRIVAL : undefined);
      }
    }

    if (socket) {
      sendMonsterAttack(socket, {
        monsterId: monster.id,
        hit: monsterAttack.hit,
        crit: monsterAttack.crit,
        damage: monsterAttack.damage,
        school: monsterSchool,
      });
    }
  }

  for (const [playerId] of players) {
    const attrs = attributes.get(playerId);
    const maxHp = maxHpForLevel(playerLevels.get(playerId) ?? 1, attrs?.vitality ?? 0);
    const hp = hpBalances.get(playerId) ?? maxHp;

    if (hp >= maxHp) {
      lastRegenAt.set(playerId, now);
      continue;
    }
    // Mana comes back on its own clock and, unlike health, keeps ticking
    // during a fight — otherwise a caster runs dry mid-pull and has nothing
    // to do but auto-attack, which is the opposite of playing a mage.
    const manaAttrs = attributes.get(playerId) ?? EMPTY_ATTRS;
    const maxMana = maxManaOf(playerId, manaAttrs);
    const currentMana = manaBalances.get(playerId) ?? maxMana;
    if (currentMana < maxMana && now - (lastManaRegenAt.get(playerId) ?? 0) >= MANA_REGEN_INTERVAL_MS) {
      const gain = manaRegenAmount(manaAttrs.intelligence) + passivesOf(playerId).manaRegenBonus;
      const nextMana = Math.min(maxMana, currentMana + gain);
      manaBalances.set(playerId, nextMana);
      setMana(playerId, nextMana);
      lastManaRegenAt.set(playerId, now);
      sendManaUpdate(sockets.get(playerId), nextMana, maxMana);
    }

    // Out-of-combat only. Regenerating mid-fight meant retreating to
    // recover was never necessary, and left Mend without a job.
    if (now - (lastCombatAt.get(playerId) ?? -Infinity) < COMBAT_LOCKOUT_MS) continue;
    if (now - (lastRegenAt.get(playerId) ?? now) < HP_REGEN_INTERVAL_MS) continue;

    const newHp = addHp(playerId, regenAmountForVitality(attrs?.vitality ?? 0), maxHp);
    hpBalances.set(playerId, newHp);
    lastRegenAt.set(playerId, now);

    const socket = sockets.get(playerId);
    if (socket) sendHpUpdate(socket, newHp, maxHp, false);
  }

  if (players.size === 0) return;
  const playerStates: PlayerState[] = [...players.values()].map((p) => ({
    ...p,
    weaponRarity: weaponRarities.get(p.id) ?? null,
    armorRarity: armorRarities.get(p.id) ?? null,
  }));
  const snapshot: ServerToClientMessage = {
    type: "STATE_SNAPSHOT",
    payload: {
      serverTime: now,
      players: playerStates,
      nodes,
      monsters,
      stations,
      drops: [...drops.values()],
    },
  };
  const data = JSON.stringify(snapshot);
  for (const socket of sockets.values()) {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  }
}, TICK_MS);

console.log(`WebSocket server listening on ws://localhost:${PORT}`);
