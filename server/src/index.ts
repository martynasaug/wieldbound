import { WebSocketServer, WebSocket } from "ws";
import {
  BOSS_MIN_RARITY,
  GATHER_RESPAWN_MS,
  INVENTORY_CAP,
  INTERACTION_RANGE_PX,
  LOOT_DROP_CHANCE,
  MONSTER_STATS,
  PLAYER_SPAWN,
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
  rollWeaponType,
  rollGearStyle,
  ITEM_SLOTS,
  VISIBLE_GEAR_SLOTS,
  type ItemSlot,
  type CharacterClass,
  type Appearance,
  maxManaFor,
  manaRegenAmount,
  primaryStatValue,
  passiveBonuses,
  unlockedActives,
  MANA_REGEN_INTERVAL_MS,
  SHIELD_WALL_MS,
  SHIELD_WALL_REDUCTION,
  type WeaponType,
  MIN_XP_SHARE,
  MAX_MELEE_ATTACKERS,
  MELEE_RING_STEP_PX,
  MONSTER_SEPARATION_PX,
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
  gatherUpgradeCost,
  maxHpForLevel,
  playerAccuracy,
  playerCritChance,
  playerMaxHit,
  playerMinHit,
  regenAmountForVitality,
  resolveHit,
  rollItemRarity,
  rollItemRarityWithFloor,
  rollItemSlot,
  gearArmor,
  gearEvasion,
  gearCritChance,
  gearDamageBonus,
  rollItemStatValue,
  rollItemBonusStatValue,
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
} from "../../shared/protocol-types.ts";
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
  listItems,
  equipItem,
  sellItem,
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
} from "./db.ts";

const PORT = 8080;
const TICK_MS = 100;
const SAVE_INTERVAL_MS = 1000;
const MONSTER_RESPAWN_MS = 10000;
const MAX_AOE_TARGETS = 5;
const HP_REGEN_INTERVAL_MS = 5000; // 1 HP per interval while below max, no regen needed once full

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
const shieldUntil = new Map<string, number>();

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
function passivesOf(playerId: string): ReturnType<typeof passiveBonuses> {
  return passiveBonuses(classOf(playerId), playerLevels.get(playerId) ?? 1);
}

function maxManaOf(playerId: string, attrs: Attributes): number {
  return (
    maxManaFor(classOf(playerId), playerLevels.get(playerId) ?? 1, attrs.intelligence) +
    passivesOf(playerId).maxManaBonus
  );
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

// What other clients need in order to draw this player: the weapon in hand
// (which is also their class) and one layer per equipped visible slot. Built
// straight from the equipment map, so it cannot describe gear the player is
// not actually wearing.
function appearanceOf(playerId: string): Appearance {
  const eq = equippedItems.get(playerId);
  const layers: Appearance["layers"] = {};
  for (const slot of VISIBLE_GEAR_SLOTS) {
    const item = eq?.[slot];
    if (item?.style) layers[slot] = { style: item.style, rarity: item.rarity };
  }
  return {
    weaponType: eq?.weapon?.weaponType,
    weaponRarity: eq?.weapon?.rarity,
    layers,
  };
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
  ...ringNodes("bush", "bush", 330, 6, 15),
  // Wood and ore spread outward. The outer rings sit in the same ground as the
  // band-2/3 camps, so gathering out there is a decision rather than a chore.
  ...ringNodes("tree-inner", "tree", 560, 8, 22),
  ...ringNodes("rock-inner", "rock", 820, 6, 30),
  ...ringNodes("tree-mid", "tree", 1150, 10, 12),
  ...ringNodes("rock-outer", "rock", 1400, 8, 15),
  ...ringNodes("tree-outer", "tree", 1560, 10, 30),
];
const nodeRespawnAt = new Map<string, number>();

function spawnMonster(id: string, kind: MonsterState["kind"], x: number, y: number): MonsterState {
  const maxHp = MONSTER_STATS[kind].maxHp;
  return { id, kind, x, y, status: "alive", hp: maxHp, maxHp, slowed: false, windingUp: false };
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

const monsters: MonsterState[] = [
  // Band 1 (~620px) — clearable at level 1. Deliberately no camp closer than
  // this, so spawn and the workbench stay safe ground.
  ...ringPack("slime-a", "slime", 620, 0),
  ...ringPack("mushnub-a", "mushnub", 620, 90),
  ...ringPack("slime-b", "slime", 620, 180),
  ...ringPack("mushnub-b", "mushnub", 620, 270),

  // Band 2 (~1000px)
  ...ringPack("goblin-a", "goblin", 1000, 45),
  ...ringPack("spikyblob-a", "spikyblob", 1000, 135),
  ...ringPack("goblin-b", "goblin", 1000, 225),
  ...ringPack("armabee-a", "armabee", 1000, 315),

  // Band 3 (~1350-1450px)
  ...ringPack("wolf-a", "wolf", 1350, 20),
  ...ringPack("cactoro-a", "cactoro", 1350, 100),
  ...ringPack("orcbrute-a", "orcbrute", 1350, 200),
  ...ringPack("wolf-b", "wolf", 1350, 280),
  ...ringPack("spikyblob-b", "spikyblob", 1450, 160),
  ...ringPack("armabee-b", "armabee", 1450, 340),

  // Band 4 (~1700-1750px). Troll and demon come in threes — three things
  // hitting this hard at once is already the whole fight.
  ...ringPack("ghost-a", "ghost", 1700, 70),
  ...ringPack("troll-a", "troll", 1700, 190, TRIANGLE_OFFSETS),
  ...ringPack("demon-a", "demon", 1700, 310, TRIANGLE_OFFSETS),
  ...ringPack("cactoro-b", "cactoro", 1750, 130),
  ...ringPack("orcbrute-b", "orcbrute", 1750, 250),

  // Band 5 (~2050px) — the far corners. Angles are kept off vertical because
  // the world is wider than it is tall and a pack at 90 degrees would spawn
  // outside the south edge.
  ...ringPack("golem-a", "golem", 2050, 140, TRIANGLE_OFFSETS),
  ...ringPack("dragon-a", "dragon", 2050, 320, TRIANGLE_OFFSETS),
];
const monsterRespawnAt = new Map<string, number>();

const stations: CraftingStationState[] = [{ id: "workbench-1", x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y }];

// There are no standing "intents" any more. Gathering and fighting are
// decided purely by where a player is standing, evaluated fresh each tick,
// so these are just cooldown clocks rather than state machines: when the
// next swing / next gather is allowed. Absent means "not currently doing
// that", and the first tick in range seeds the clock so walking in and out
// of reach can't be used to rush attacks.
const nextAttackAt = new Map<string, number>();
const nextGatherAt = new Map<string, number>();
// The monster a player has explicitly selected. Auto-attack prefers it, and
// falls back to "whatever is nearest" when unset, so walking into a camp
// still fights back but picking a target lets you focus something.
const playerTargets = new Map<string, string | null>();
// Per-player, per-skill "ready at" timestamps.
const skillReadyAt = new Map<string, Map<SkillId, number>>();
// Timed status effects. Both are just "modifier expires at T", which is why
// one shape covers a monster being chilled and a player being enraged.
const monsterSlowUntil = new Map<string, number>();
const playerBuffUntil = new Map<string, number>();
const globalCooldownUntil = new Map<string, number>();
const potionReadyAt = new Map<string, number>();
// Last moment this player dealt or took damage. Regen waits on it, so
// healing only resumes once the fight has genuinely stopped.
const lastCombatAt = new Map<string, number>();
// Post-death penalty: you hit softer for a while after respawning.
const weakenedUntil = new Map<string, number>();
// The ally a player has selected, for the skills that can help someone else.
const playerAllyTargets = new Map<string, string | null>();

function markInCombat(playerId: string, now: number): void {
  lastCombatAt.set(playerId, now);
}

// Everything that happens when a player drops. Kept in one place because
// both normal attacks and telegraphed slams can kill, and the penalty must
// not depend on which one did it.
function handlePlayerDeath(playerId: string, socket: WebSocket | undefined, now: number): void {
  clearCombatClocks(playerId);
  weakenedUntil.set(playerId, now + WEAKENED_DURATION_MS);
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
      player.x = PLAYER_SPAWN.x;
      player.y = PLAYER_SPAWN.y;
      handlePlayerDeath(playerId, socket, now);
    }
    if (socket) {
      sendHpUpdate(socket, result.hp, maxHp, result.defeated, result.defeated ? PLAYER_SPAWN : undefined);
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
    playerLevels.set(playerId, level);
    attrs.statPoints = statPoints;
    if (socket) {
      sendXpUpdate(socket, xp, level, leveledUp);
      if (leveledUp) sendStatsUpdate(socket, attrs, maxHpOf(playerId, attrs));
    }
  }

  const topSocket = sockets.get(topId);
  if (topSocket) maybeDropLoot(topId, topSocket, monster);
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
  monsterSlowUntil.delete(monster.id);
  monster.slowed = false;
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
): { hit: boolean; crit: boolean; damage: number; killed: boolean } {
  const stats = MONSTER_STATS[monster.kind];
  const equipped = equippedItems.get(playerId);
  const enraged = (playerBuffUntil.get(playerId) ?? 0) > now;
  const weakened = (weakenedUntil.get(playerId) ?? 0) > now;
  let scaled = enraged ? power * (1 + WARCRY_DAMAGE_BONUS) : power;
  if (weakened) scaled *= 1 - WEAKENED_DAMAGE_PENALTY;

  const result = resolveHit({
    attackerAccuracy: playerAccuracy(attrs.agility) + (equipped?.ring?.bonusStatValue ?? 0),
    // A spread around the skill's rated power, so it varies like a weapon
    // swing rather than landing for exactly the same number every cast.
    attackerMinHit: Math.max(1, Math.round(scaled * 0.85)),
    attackerMaxHit: Math.max(2, Math.round(scaled * 1.15)),
    attackerCritChance:
      playerCritChance(attrs.agility) + gearCritChance(equipped) + passivesOf(playerId).critChance,
    attackerCritMultiplier: critDamageMultiplier(weaponRarities.get(playerId) ?? null),
    defenderEvasion: stats.evasion,
    defenderArmor: stats.armor,
  });

  if (!result.hit) return { hit: false, crit: false, damage: 0, killed: false };

  monster.hp = Math.max(0, monster.hp - result.damage);
  addThreat(monster.id, playerId, result.damage);
  markInCombat(playerId, now);
  if (monster.hp > 0) return { hit: true, crit: result.crit, damage: result.damage, killed: false };

  killMonster(monster, now);
  onPlayerKill(playerId, attrs);
  return { hit: true, crit: result.crit, damage: result.damage, killed: true };
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
  // Permanent facts first, transient ones second: being told "not ready"
  // when the real answer is "your class will never have this" is actively
  // misleading, and that is exactly what checking the GCD first produced.
  const level = playerLevels.get(playerId) ?? 1;
  if (skill.classId !== classOf(playerId) || skill.kind === "passive") {
    sendSkillResult(socket, { skillId, ok: false, reason: "not your class", cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
    return;
  }
  if (skill.unlockLevel > level) {
    sendSkillResult(socket, { skillId, ok: false, reason: `unlocks at level ${skill.unlockLevel}`, cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
    return;
  }

  const gcdUntil = globalCooldownUntil.get(playerId) ?? 0;
  if (now < gcdUntil) {
    sendSkillResult(socket, { skillId, ok: false, reason: "not ready", cooldownRemainingMs: 0, globalCooldownMs: gcdUntil - now, hits: [] });
    return;
  }

  const attrs = attributes.get(playerId) ?? EMPTY_ATTRS;
  const maxMana = maxManaOf(playerId, attrs);
  const mana = manaBalances.get(playerId) ?? maxMana;
  if (mana < skill.manaCost) {
    sendSkillResult(socket, { skillId, ok: false, reason: "not enough mana", cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
    return;
  }

  const power = skillPower(skill, powerOf(playerId, attrs), attrs.vitality, level);
  const hits: { monsterId: string; hit: boolean; damage: number; crit: boolean }[] = [];
  let healed: number | undefined;
  let buffMs: number | undefined;
  let slowMs: number | undefined;

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
    if (before >= maxHp) {
      sendSkillResult(socket, { skillId, ok: false, reason: "already at full health", cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
      return;
    }
    const after = addHp(beneficiaryId, power, maxHp);
    hpBalances.set(beneficiaryId, after);
    healed = after - before;
    if (beneficiarySocket) sendHpUpdate(beneficiarySocket, after, maxHp, false);
    if (beneficiaryId !== playerId && beneficiarySocket) {
      sendInfo(beneficiarySocket, `${players.get(playerId)?.name ?? "Someone"} healed you for ${healed}.`, "#7ed957");
    }
  } else if (skill.kind === "buff") {
    if (skill.selfShieldMs) {
      // Shield Wall is self-only: a damage-reduction cooldown you hand to
      // someone else stops being the warrior's own survival tool.
      shieldUntil.set(playerId, now + SHIELD_WALL_MS);
      buffMs = SHIELD_WALL_MS;
    } else {
      playerBuffUntil.set(beneficiaryId, now + WARCRY_DURATION_MS);
      buffMs = WARCRY_DURATION_MS;
      if (beneficiaryId !== playerId && beneficiarySocket) {
        sendInfo(beneficiarySocket, `${players.get(playerId)?.name ?? "Someone"} empowered you!`, "#ffc107");
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
      // rather than around you (Rain of Arrows, Firebolt).
      if (!selected || selected.status !== "alive" ||
          Math.hypot(selected.x - player.x, selected.y - player.y) > skill.rangePx) {
        sendSkillResult(socket, { skillId, ok: false, reason: "no target in range", cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
        return;
      }
      struck = monsters.filter(
        (m) => m.status === "alive" && Math.hypot(m.x - selected.x, m.y - selected.y) <= skill.radiusPx,
      );
    } else if (skill.radiusPx > 0) {
      struck = monsters.filter(
        (m) => m.status === "alive" && Math.hypot(m.x - player.x, m.y - player.y) <= skill.radiusPx,
      );
    } else {
      const inRange = selected && Math.hypot(selected.x - player.x, selected.y - player.y) <= skill.rangePx;
      if (!selected || selected.status !== "alive" || !inRange) {
        sendSkillResult(socket, { skillId, ok: false, reason: "no target in range", cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
        return;
      }
      struck = [selected];
    }

    if (struck.length === 0) {
      sendSkillResult(socket, { skillId, ok: false, reason: "nothing in range", cooldownRemainingMs: 0, globalCooldownMs: 0, hits: [] });
      return;
    }

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

    for (const monster of struck) {
      // Control lands regardless of the damage roll — a nova that both
      // misses and fails to slow would be infuriating on an 11s cooldown.
      if (skill.kind === "control" || skill.appliesSlow) {
        monsterSlowUntil.set(monster.id, now + SLOW_DURATION_MS);
        monster.slowed = true;
        slowMs = SLOW_DURATION_MS;
        addThreat(monster.id, playerId, 1);
      }
      const result = applySkillDamage(playerId, monster, power, attrs, now);
      hits.push({ monsterId: monster.id, hit: result.hit, damage: result.damage, crit: result.crit });
    }
  }

  // Only charged once the cast is known to have gone through: every failure
  // path above returns before this, so a refused skill costs nothing.
  spendMana(playerId, skill.manaCost, attrs);
  cooldowns.set(skillId, now + skill.cooldownMs);
  globalCooldownUntil.set(playerId, now + GLOBAL_COOLDOWN_MS);
  sendSkillResult(socket, {
    skillId,
    ok: true,
    cooldownRemainingMs: skill.cooldownMs,
    globalCooldownMs: GLOBAL_COOLDOWN_MS,
    hits,
    healed,
    buffMs,
    slowMs,
  });
}

// Resolves a telegraphed slam: everyone still inside the radius when the
// wind-up completes takes a heavy hit. Anyone who walked out takes nothing,
// which is the entire mechanic — the answer is your feet, not your stats.
function resolveSlam(monster: MonsterState, radiusPx: number, damageMultiplier: number, now: number): void {
  const stats = MONSTER_STATS[monster.kind];
  for (const [playerId, player] of players) {
    if (Math.hypot(player.x - monster.x, player.y - monster.y) > radiusPx) continue;

    const attrs = attributes.get(playerId) ?? EMPTY_ATTRS;
    const equipped = equippedItems.get(playerId);
    const hit = resolveHit({
      attackerAccuracy: stats.accuracy,
      attackerMinHit: Math.round(stats.minHit * damageMultiplier),
      attackerMaxHit: Math.round(stats.maxHit * damageMultiplier),
      attackerCritChance: stats.critChance,
      attackerCritMultiplier: stats.critMultiplier,
      defenderEvasion: gearEvasion(equipped),
      defenderArmor: gearArmor(equipped),
    });

    const socket = sockets.get(playerId);
    if (hit.hit) {
      const maxHp = maxHpOf(playerId, attrs);
      markInCombat(playerId, now);
      const result = applyDamage(playerId, hit.damage, maxHp);
      hpBalances.set(playerId, result.hp);
      if (result.defeated) {
        player.x = PLAYER_SPAWN.x;
        player.y = PLAYER_SPAWN.y;
        handlePlayerDeath(playerId, socket, now);
      }
      if (socket) {
        sendHpUpdate(socket, result.hp, maxHp, result.defeated, result.defeated ? PLAYER_SPAWN : undefined);
      }
    }
    if (socket) {
      sendMonsterAttack(socket, {
        monsterId: monster.id,
        hit: hit.hit,
        crit: hit.crit,
        damage: hit.damage,
      });
    }
  }
  void now;
}

// One swing (or two, with the Agility double-attack) against a monster the
// player is already confirmed to be standing next to.
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
  const critChance = playerCritChance(attrs.agility) + gearCritChance(equipped) + passivesOf(playerId).critChance;
  const critMultiplier = critDamageMultiplier(weaponRarities.get(playerId) ?? null);
  const baseDamageBonus = gearDamageBonus(equipped);
  // War Cry rides on top of gear rather than replacing it, so the buff is
  // worth more the better geared you already are.
  const enraged = (playerBuffUntil.get(playerId) ?? 0) > now;
  const weakened = (weakenedUntil.get(playerId) ?? 0) > now;
  let totalDamageBonus = enraged
    ? Math.round(baseDamageBonus + playerMaxHit(powerOf(playerId, attrs)) * WARCRY_DAMAGE_BONUS)
    : baseDamageBonus;
  // Weakened bites into the same number War Cry inflates, so the two are
  // directly comparable and can cancel each other out.
  if (weakened) totalDamageBonus -= Math.round(playerMaxHit(powerOf(playerId, attrs)) * WEAKENED_DAMAGE_PENALTY);
  const totalAccuracy = playerAccuracy(attrs.agility) + (equipped?.ring?.bonusStatValue ?? 0);

  let monsterDefeated = false;
  // Agility gives a chance to swing twice — resolved as an independent extra
  // attack, not a damage multiplier, so it still rolls its own hit/miss/crit
  // and shows up as its own combat-log line.
  const swingCount = Math.random() * 100 < doubleAttackChance(attrs.agility) ? 2 : 1;

  for (let swing = 0; swing < swingCount && !monsterDefeated; swing++) {
    // The weapon's damage multiplier scales the hit band. It is the inverse
    // of its speed multiplier, so a slow axe hits proportionally harder and
    // total DPS stays in the same neighbourhood across families.
    const wpnDamage = weaponDef(weaponTypeOf(playerId)).damageMultiplier;
    const playerAttack = resolveHit({
      attackerAccuracy: totalAccuracy,
      attackerMinHit: Math.round(playerMinHit(powerOf(playerId, attrs)) * wpnDamage),
      attackerMaxHit: Math.round(playerMaxHit(powerOf(playerId, attrs), totalDamageBonus) * wpnDamage),
      attackerCritChance: critChance,
      attackerCritMultiplier: critMultiplier,
      defenderEvasion: monsterStats.evasion,
      defenderArmor: monsterStats.armor,
    });

    if (playerAttack.hit) {
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
  return maxHpForLevel(playerLevels.get(playerId) ?? 1, attrs.vitality) + CLASSES[classOf(playerId)].baseHpBonus;
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

function maybeDropLoot(playerId: string, socket: WebSocket, monster: MonsterState): void {
  const guaranteed = MONSTER_STATS[monster.kind].guaranteedDrop;
  if (!guaranteed && Math.random() > LOOT_DROP_CHANCE) return;

  if (listItems(playerId).length >= INVENTORY_CAP) {
    sendInfo(socket, `Bag is full (${INVENTORY_CAP}/${INVENTORY_CAP}) — a drop was lost! Sell some items.`, "#ef5350");
    return;
  }

  const slot = rollItemSlot();
  const dropped = guaranteed ? rollItemRarityWithFloor(BOSS_MIN_RARITY) : rollItemRarity();
  const statValue = rollItemStatValue(slot, dropped);
  const bonusStatValue = rollItemBonusStatValue(slot, dropped);
  // Weapons drop in ANY family, not the finder's. Since the weapon IS the
  // class, an unfamiliar drop is the game offering a different way to play
  // rather than the dead loot it used to be under the old equip restriction.
  const weaponType = slot === "weapon" ? rollWeaponType() : null;
  const style = rollGearStyle(slot, dropped, Math.random) ?? null;
  const item = addItem(playerId, slot, dropped, statValue, bonusStatValue, weaponType, style);

  sendLootUpdate(socket, item);
  sendItemsUpdate(socket, playerId, listItems(playerId));
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
      return;
    }

    if (msg.type === "MOVE" && id) {
      const p = players.get(id);
      if (!p) return;
      p.x = msg.payload.x;
      p.y = msg.payload.y;

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
      const result = equipItem(id, msg.payload.itemId);
      if (!result) return;

      weaponRarities.set(id, result.weaponRarity);
      armorRarities.set(id, result.armorRarity);
      bootsRarities.set(id, result.bootsRarity);
      equippedItems.set(id, computeEquipped(result.items));
      sendItemsUpdate(socket, id, result.items);

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

    if (msg.type === "SELL_ITEM" && id) {
      const result = sellItem(id, msg.payload.itemId);
      if (!result) return;

      woodBalances.set(id, result.wood);
      equippedItems.set(id, computeEquipped(result.items));
      sendItemsUpdate(socket, id, result.items);
      sendInventoryUpdate(socket, result.wood, gatherLevels.get(id) ?? 0);
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

    if (msg.type === "REQUEST_LEADERBOARD") {
      sendLeaderboardUpdate(socket);
    }

    if (msg.type === "CRAFT_ITEM" && id) {
      const player = players.get(id);
      const station = stations.find((s) => s.id === msg.payload.stationId);
      if (!player || !station) return;
      if (Math.hypot(player.x - station.x, player.y - station.y) > INTERACTION_RANGE_PX) return;

      if (listItems(id).length >= INVENTORY_CAP) {
        sendInfo(socket, `Bag is full (${INVENTORY_CAP}/${INVENTORY_CAP}) — sell some items first.`, "#ef5350");
        return;
      }

      const { slot, rarity } = msg.payload;
      const cost = craftCostFor(slot, rarity);
      const spendResult = trySpendCraftResources(id, cost.wood, cost.ore);
      if (!spendResult) return;

      woodBalances.set(id, spendResult.wood);
      oreBalances.set(id, spendResult.ore);
      const statValue = rollItemStatValue(slot, rarity);
      const bonusStatValue = rollItemBonusStatValue(slot, rarity);
      // Crafting is the deterministic counterweight to drop RNG, so it is
      // also the reliable way to change class: the player names the family.
      // Defaulting to what they already wield means "craft me a better one"
      // never silently re-classes someone who just wanted an upgrade.
      const craftedWeapon =
        slot === "weapon" ? (msg.payload.weaponType ?? weaponTypeOf(id) ?? "sword") : null;
      const craftedStyle = msg.payload.style ?? rollGearStyle(slot, rarity, Math.random) ?? null;
      const item = addItem(id, slot, rarity, statValue, bonusStatValue, craftedWeapon, craftedStyle);

      sendLootUpdate(socket, item);
      sendItemsUpdate(socket, id, listItems(id));
      sendOreUpdate(socket, spendResult.wood, spendResult.ore, battlePowerLevels.get(id) ?? 0);
    }

    if (msg.type === "CRAFT_POTION" && id) {
      const player = players.get(id);
      const station = stations.find((s) => s.id === msg.payload.stationId);
      if (!player || !station) return;
      if (Math.hypot(player.x - station.x, player.y - station.y) > INTERACTION_RANGE_PX) return;

      const result = craftPotion(id);
      if (!result) return;

      woodBalances.set(id, result.wood);
      oreBalances.set(id, result.ore);
      herbBalances.set(id, result.herb);
      potionBalances.set(id, result.potions);
      sendPotionsUpdate(socket, result.potions, result.wood, result.ore, result.herb);
    }

    if (msg.type === "USE_POTION" && id) {
      // Gated, because without this the whole stack can be drunk in one
      // frame and a stocked player simply cannot be killed.
      const readyAt = potionReadyAt.get(id) ?? 0;
      const nowMs = Date.now();
      if (nowMs < readyAt) {
        sendInfo(socket, `Potion not ready (${Math.ceil((readyAt - nowMs) / 1000)}s)`, "#9e9e9e");
        return;
      }
      const result = usePotion(id);
      if (!result) return;
      potionReadyAt.set(id, nowMs + POTION_COOLDOWN_MS);

      potionBalances.set(id, result.potions);
      const attrs = attributes.get(id) ?? EMPTY_ATTRS;
      const maxHp = maxHpForLevel(playerLevels.get(id) ?? 1, attrs.vitality);
      const newHp = addHp(id, POTION_HEAL_AMOUNT, maxHp);
      hpBalances.set(id, newHp);
      lastRegenAt.set(id, Date.now());

      sendPotionsUpdate(
        socket,
        result.potions,
        woodBalances.get(id) ?? 0,
        oreBalances.get(id) ?? 0,
        herbBalances.get(id) ?? 0,
      );
      sendHpUpdate(socket, newHp, maxHp, false);
    }

    if (msg.type === "CRAFT_TONIC" && id) {
      const player = players.get(id);
      const station = stations.find((s) => s.id === msg.payload.stationId);
      if (!player || !station) return;
      if (Math.hypot(player.x - station.x, player.y - station.y) > INTERACTION_RANGE_PX) return;

      const result = craftTonic(id);
      if (!result) return;

      woodBalances.set(id, result.wood);
      oreBalances.set(id, result.ore);
      herbBalances.set(id, result.herb);
      tonicBalances.set(id, result.tonics);
      sendTonicsUpdate(socket, result.tonics, result.wood, result.ore, result.herb);
    }

    if (msg.type === "USE_TONIC" && id) {
      const result = useTonic(id);
      if (!result) return;

      tonicBalances.set(id, result.tonics);
      const { xp, level, leveledUp, statPoints } = addXp(id, TONIC_XP_AMOUNT);
      playerLevels.set(id, level);
      const attrs = attributes.get(id) ?? EMPTY_ATTRS;
      attrs.statPoints = statPoints;
      attributes.set(id, attrs);

      sendTonicsUpdate(
        socket,
        result.tonics,
        woodBalances.get(id) ?? 0,
        oreBalances.get(id) ?? 0,
        herbBalances.get(id) ?? 0,
      );
      sendXpUpdate(socket, xp, level, leveledUp);
      if (leveledUp) sendStatsUpdate(socket, attrs, maxHpOf(id, attrs), maxManaOf(id, attrs));
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
    playerBuffUntil.delete(id);
    globalCooldownUntil.delete(id);
      manaBalances.delete(id);
    lastManaRegenAt.delete(id);
    shieldUntil.delete(id);
    potionReadyAt.delete(id);
    weakenedUntil.delete(id);
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

  // Expire timed status effects before anything reads them.
  for (const [monsterId, until] of monsterSlowUntil) {
    if (now >= until) {
      monsterSlowUntil.delete(monsterId);
      const m = monsters.find((mm) => mm.id === monsterId);
      if (m) m.slowed = false;
    }
  }
  for (const [pid, until] of playerBuffUntil) {
    if (now >= until) playerBuffUntil.delete(pid);
  }

  // --- Monster AI ---------------------------------------------------------
  // Monsters coming to you is what makes this a fight rather than a
  // stationary target dummy, and it gives running away a real meaning.
  for (const monster of monsters) {
    const ai = monsterAi.get(monster.id);
    if (!ai) continue;
    const stats = MONSTER_STATS[monster.kind];
    const slowed = (monsterSlowUntil.get(monster.id) ?? 0) > now;
    const stepPx = ((stats.speedPxPerSec * (slowed ? SLOW_MULTIPLIER : 1)) * TICK_MS) / 1000;

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
        const stopAt = stats.attackRangePx * 0.8 + overflow * MELEE_RING_STEP_PX;

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
          monster.x += ((target.x - monster.x) / d) * speed;
          monster.y += ((target.y - monster.y) / d) * speed;
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
  // wolves render as one silhouette and occupy zero space. A light push
  // apart, applied after movement, spreads them into a believable cluster
  // without needing real collision or pathfinding.
  for (const monster of monsters) {
    if (monster.status !== "alive") continue;
    let pushX = 0;
    let pushY = 0;
    for (const other of monsters) {
      if (other === monster || other.status !== "alive") continue;
      const dx = monster.x - other.x;
      const dy = monster.y - other.y;
      const d = Math.hypot(dx, dy);
      if (d >= MONSTER_SEPARATION_PX) continue;
      if (d < 0.01) {
        // Exactly coincident: nudge deterministically off the id so the pair
        // don't jitter against each other forever.
        pushX += monster.id < other.id ? 1 : -1;
        continue;
      }
      const strength = (MONSTER_SEPARATION_PX - d) / MONSTER_SEPARATION_PX;
      pushX += (dx / d) * strength;
      pushY += (dy / d) * strength;
    }
    if (pushX !== 0 || pushY !== 0) {
      const mag = Math.hypot(pushX, pushY) || 1;
      const shove = Math.min(6, mag * 6);
      monster.x += (pushX / mag) * shove;
      monster.y += (pushY / mag) * shove;
    }
  }

  // --- Player actions: decided by proximity, re-evaluated every tick ------
  for (const [playerId, player] of players) {
    const socket = sockets.get(playerId);
    const playerAttrs = attributes.get(playerId) ?? EMPTY_ATTRS;

    // Fighting takes priority over gathering: you cannot calmly chop a tree
    // while something is biting you.
    let target: MonsterState | null = null;
    let targetDist = Infinity;
    // Reach comes from the weapon: an axe fights nose-to-nose, a bow opens up
    // from roughly five times further out, and a dagger is shorter still than
    // a sword. This single number is most of what makes weapons feel
    // different to swing.
    const reach = attackRangeFor(weaponTypeOf(playerId));
    for (const monster of monsters) {
      if (monster.status !== "alive") continue;
      const d = Math.hypot(player.x - monster.x, player.y - monster.y);
      if (d < targetDist && d <= reach) {
        target = monster;
        targetDist = d;
      }
    }

    // An explicitly selected target wins over proximity, as long as it is
    // still alive and in reach — that is the whole point of selecting one.
    const selectedId = playerTargets.get(playerId);
    if (selectedId) {
      const selected = monsters.find((m) => m.id === selectedId);
      if (!selected || selected.status !== "alive") {
        playerTargets.set(playerId, null);
      } else if (Math.hypot(player.x - selected.x, player.y - selected.y) <= reach) {
        target = selected;
      }
    }

    if (target) {
      nextGatherAt.delete(playerId);
      // Weapon speed scales the whole interval, so a dagger flurries and an
      // axe lands one heavy swing in the same window. damageMultiplier moves
      // the other way (see resolvePlayerAttack), keeping DPS comparable so
      // the choice is burst-vs-steady rather than one weapon simply winning.
      const interval = Math.round(
        playerAttackIntervalMs(
          weaponRarities.get(playerId) ?? null,
          battlePowerLevels.get(playerId) ?? 0,
          playerAttrs.agility,
        ) * weaponDef(weaponTypeOf(playerId)).speedMultiplier,
      );
      const readyAt = nextAttackAt.get(playerId);
      // First tick in reach only starts the clock — closing to melee has a
      // wind-up, and without it stepping in and out would rush every swing.
      if (readyAt === undefined) {
        nextAttackAt.set(playerId, now + interval);
        continue;
      }
      if (now < readyAt) continue;
      nextAttackAt.set(playerId, now + interval);

      resolvePlayerAttack(playerId, player, target, playerAttrs, socket, now);
      continue;
    }

    nextAttackAt.delete(playerId);

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

      if (node.kind === "tree") {
        const wood = addWood(playerId, 1);
        woodBalances.set(playerId, wood);
        if (socket) sendInventoryUpdate(socket, wood, gatherLevels.get(playerId) ?? 0);
      } else if (node.kind === "rock") {
        const ore = addOre(playerId, 1);
        oreBalances.set(playerId, ore);
        if (socket) {
          sendOreUpdate(socket, woodBalances.get(playerId) ?? 0, ore, battlePowerLevels.get(playerId) ?? 0);
        }
      } else {
        const herb = addHerb(playerId, 1);
        herbBalances.set(playerId, herb);
        if (socket) sendHerbUpdate(socket, herb);
      }
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
    const monsterAttack = resolveHit({
      attackerAccuracy: stats.accuracy,
      attackerMinHit: stats.minHit,
      attackerMaxHit: stats.maxHit,
      attackerCritChance: stats.critChance,
      attackerCritMultiplier: stats.critMultiplier,
      defenderEvasion: totalEvasion,
      defenderArmor: playerArmor,
    });

    const socket = sockets.get(victimId);
    if (monsterAttack.hit) {
      const maxHp = maxHpOf(victimId, attrs);
      markInCombat(victimId, now);
      const shielded = (shieldUntil.get(victimId) ?? 0) > now;
      const incoming = shielded ? Math.max(1, Math.round(monsterAttack.damage * (1 - SHIELD_WALL_REDUCTION))) : monsterAttack.damage;
      const result = applyDamage(victimId, incoming, maxHp);
      hpBalances.set(victimId, result.hp);

      if (result.defeated) {
        const p = players.get(victimId);
        if (p) {
          p.x = PLAYER_SPAWN.x;
          p.y = PLAYER_SPAWN.y;
        }
        handlePlayerDeath(victimId, socket, now);
      }
      if (socket) {
        sendHpUpdate(socket, result.hp, maxHp, result.defeated, result.defeated ? PLAYER_SPAWN : undefined);
      }
    }

    if (socket) {
      sendMonsterAttack(socket, {
        monsterId: monster.id,
        hit: monsterAttack.hit,
        crit: monsterAttack.crit,
        damage: monsterAttack.damage,
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
    payload: { serverTime: now, players: playerStates, nodes, monsters, stations },
  };
  const data = JSON.stringify(snapshot);
  for (const socket of sockets.values()) {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  }
}, TICK_MS);

console.log(`WebSocket server listening on ws://localhost:${PORT}`);
