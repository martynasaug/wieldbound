// Message shapes exchanged over the WebSocket connection between client and server.
// Kept as plain types (no classes) so they can be JSON-serialized directly.

export const INTERACTION_RANGE_PX = 40;
export const GATHER_RESPAWN_MS = 8000;

// Battle uses a looser range than gathering: monsters live in packs (see server
// world layout) and killing one should let the auto-battler pick up the next
// member of the pack without the player needing to shuffle a few pixels over.
export const BATTLE_RANGE_PX = 110;

// Grown from 2200x1600 when the monster roster went from 4 kinds to 13. The
// point is not raw size: it is that difficulty can now be laid out as distance
// from spawn, so wandering further is the progression rather than a menu of
// equally-dangerous camps sitting a few steps apart.
export const WORLD_WIDTH = 4800;
export const WORLD_HEIGHT = 3600;

export const GATHER_DURATION_MS = 3000;
export const GATHER_LEVEL_STEP_MS = 400;
export const GATHER_DURATION_FLOOR_MS = 500;

// --- Classes --------------------------------------------------------------
// CLASS IS NOT CHOSEN — IT IS WORN.
//
// There is no class picker and no class column that outlives a session. Your
// class is whatever the weapon in your hand implies: draw a bow and you are a
// ranger until you sheathe it. That makes respeccing free and reversible, and
// it makes every weapon drop a potential change of playstyle rather than
// vendor trash for the wrong archetype. Swapping weapons swaps your skill bar,
// your attack range, and which attribute scales your damage.
//
// Fists count as a weapon family, so an unequipped character is a real (if
// weak) archetype rather than a broken state with no skills and no range.
export type CharacterClass = "adventurer" | "warrior" | "ranger" | "mage";
export type WeaponType =
  | "fist"
  | "sword"
  | "axe"
  | "mace"
  | "dagger"
  | "bow"
  | "staff"
  | "wand";

export interface ClassDef {
  id: CharacterClass;
  name: string;
  icon: string;
  blurb: string;
  // Which attribute scales this class's damage. Everything else is shared.
  primaryStat: AttributeName;
  // Reach of the ordinary auto-attack. This single number is most of what
  // makes the archetypes feel different to play. Individual weapons nudge it.
  attackRangePx: number;
  baseHpBonus: number;
  baseManaBonus: number;
}

export const CLASSES: Record<CharacterClass, ClassDef> = {
  adventurer: {
    id: "adventurer",
    name: "Adventurer",
    icon: "✊",
    blurb: "Bare hands. Pick up a weapon and you become something.",
    primaryStat: "strength",
    attackRangePx: 54,
    baseHpBonus: 0,
    baseManaBonus: 0,
  },
  warrior: {
    id: "warrior",
    name: "Warrior",
    icon: "🗡️",
    blurb: "Swords, axes and maces. Highest health, has to be in the thick of it.",
    primaryStat: "strength",
    attackRangePx: 62,
    baseHpBonus: 30,
    baseManaBonus: 0,
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    icon: "🏹",
    blurb: "Bows and daggers. Strikes from far outside anything's reach.",
    primaryStat: "agility",
    attackRangePx: 300,
    baseHpBonus: 10,
    baseManaBonus: 20,
  },
  mage: {
    id: "mage",
    name: "Mage",
    icon: "🪄",
    blurb: "Staves and wands. Frail, but the widest and loudest spell book.",
    primaryStat: "intelligence",
    attackRangePx: 250,
    baseHpBonus: -10,
    baseManaBonus: 60,
  },
};

export const CLASS_IDS: CharacterClass[] = ["adventurer", "warrior", "ranger", "mage"];

// --- Weapon families
// Each weapon names its archetype and tunes the archetype's baseline. Two
// warrior weapons play differently: a dagger-fast sword against a slow axe
// that hits far harder per swing.
export interface WeaponDef {
  type: WeaponType;
  name: string;
  icon: string;
  classId: CharacterClass;
  // Multiplies the class's base attack range, so a spear-ish poleaxe outreaches
  // a dagger without either leaving its archetype.
  rangeMultiplier: number;
  // Multiplies swing interval. Below 1 is faster; above 1 is slower.
  speedMultiplier: number;
  // Multiplies damage per hit. Roughly the inverse of speed, so DPS stays
  // comparable and the choice is about burst-vs-steady rather than strictly
  // better numbers.
  damageMultiplier: number;
}

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  fist: { type: "fist", name: "Fists", icon: "✊", classId: "adventurer", rangeMultiplier: 1, speedMultiplier: 0.8, damageMultiplier: 0.6 },
  sword: { type: "sword", name: "Sword", icon: "🗡️", classId: "warrior", rangeMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
  axe: { type: "axe", name: "Axe", icon: "🪓", classId: "warrior", rangeMultiplier: 1.05, speedMultiplier: 1.35, damageMultiplier: 1.45 },
  mace: { type: "mace", name: "Mace", icon: "🔨", classId: "warrior", rangeMultiplier: 0.95, speedMultiplier: 1.2, damageMultiplier: 1.25 },
  dagger: { type: "dagger", name: "Dagger", icon: "🔪", classId: "ranger", rangeMultiplier: 0.2, speedMultiplier: 0.6, damageMultiplier: 0.7 },
  bow: { type: "bow", name: "Bow", icon: "🏹", classId: "ranger", rangeMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
  staff: { type: "staff", name: "Staff", icon: "🪄", classId: "mage", rangeMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
  wand: { type: "wand", name: "Wand", icon: "✨", classId: "mage", rangeMultiplier: 0.8, speedMultiplier: 0.7, damageMultiplier: 0.75 },
};

export const WEAPON_TYPES: WeaponType[] = ["sword", "axe", "mace", "dagger", "bow", "staff", "wand"];

// The one function that decides what you are. Everything class-derived on both
// sides — skills, range, damage stat, mana pool — routes through here, so
// there is exactly one place where "no weapon" and "unknown weapon" are
// resolved and no caller can disagree about the answer.
export function classForWeapon(weaponType: WeaponType | undefined | null): CharacterClass {
  if (!weaponType) return "adventurer";
  return WEAPONS[weaponType]?.classId ?? "adventurer";
}

export function weaponDef(weaponType: WeaponType | undefined | null): WeaponDef {
  if (!weaponType) return WEAPONS.fist;
  return WEAPONS[weaponType] ?? WEAPONS.fist;
}

// Effective auto-attack reach: the archetype's baseline, tuned by the weapon.
export function attackRangeFor(weaponType: WeaponType | undefined | null): number {
  const w = weaponDef(weaponType);
  return Math.round(CLASSES[w.classId].attackRangePx * w.rangeMultiplier);
}

// --- Primary attributes — earned as points on level-up, spent freely.
// Intelligence joined the original three when spells needed a resource:
// it drives mana pool, mana regeneration, and a mage's damage. ---
export type AttributeName = "strength" | "agility" | "vitality" | "intelligence";
export const STAT_POINTS_PER_LEVEL = 3;
export const AGILITY_GATHER_STEP_MS = 20;
export const AGILITY_MOVE_STEP_PX_PER_SEC = 2;
export const VITALITY_HP_STEP = 5;

// --- Combat resolution: real hit/miss/crit/damage exchange, not an
// abstracted "roll a chance to instantly finish" model. Strength sets your
// damage range, Agility sets your accuracy and crit chance; armor/evasion/
// bonus damage come from equipped item rolls (see ItemInstance.statValue),
// crit damage multiplier comes from weapon rarity tier. ---
// Damage scales off whichever attribute the class is built around, so the
// parameter is "power" rather than "strength" — a ranger's arrows care about
// Agility and a mage's spells about Intelligence, but the curve is shared.
export function playerMinHit(power: number): number {
  return 1 + Math.floor(power / 2);
}

export function playerMaxHit(power: number, weaponBonus = 0): number {
  return playerMinHit(power) + 3 + power + weaponBonus;
}

export function primaryStatValue(cls: CharacterClass, attrs: { strength: number; agility: number; vitality: number; intelligence: number }): number {
  const stat = CLASSES[cls].primaryStat;
  return attrs[stat];
}

// --- Mana -----------------------------------------------------------------
// Skills cost mana on top of their cooldowns. Cooldowns alone answer "how
// often", mana answers "how many in a row" — which is what stops a fight
// being solved by pressing every button the moment it starts.
export const BASE_MANA = 40;
export const MANA_PER_LEVEL = 6;
export const INTELLIGENCE_MANA_STEP = 8;
export const MANA_REGEN_INTERVAL_MS = 2000;

export function maxManaFor(cls: CharacterClass, level: number, intelligence = 0): number {
  return BASE_MANA + CLASSES[cls].baseManaBonus + (level - 1) * MANA_PER_LEVEL + intelligence * INTELLIGENCE_MANA_STEP;
}

export function manaRegenAmount(intelligence = 0): number {
  return 2 + Math.floor(intelligence / 3);
}

export function playerAccuracy(agility: number): number {
  return Math.min(95, 50 + agility * 2);
}

export function playerCritChance(agility: number): number {
  return Math.min(60, 5 + agility);
}

// A fourth thing Agility buys, on top of accuracy/crit/move-speed/gather
// speed: a chance to swing twice in one attack cycle. Capped well below
// 100% so it stays a bonus, not a guaranteed double-cast at high agility.
export function doubleAttackChance(agility: number): number {
  return Math.min(25, agility);
}

export interface HitResult {
  hit: boolean;
  crit: boolean;
  damage: number;
}

export function resolveHit(
  params: {
    attackerAccuracy: number;
    attackerMinHit: number;
    attackerMaxHit: number;
    attackerCritChance: number;
    attackerCritMultiplier: number;
    defenderEvasion: number;
    defenderArmor: number;
  },
  random: () => number = Math.random,
): HitResult {
  const hitChance = Math.max(5, Math.min(95, params.attackerAccuracy - params.defenderEvasion));
  if (random() * 100 > hitChance) return { hit: false, crit: false, damage: 0 };

  const crit = random() * 100 < params.attackerCritChance;
  let damage = params.attackerMinHit + random() * (params.attackerMaxHit - params.attackerMinHit);
  damage = Math.round(damage);
  if (crit) damage = Math.round(damage * params.attackerCritMultiplier);
  damage = Math.max(1, damage - params.defenderArmor);

  return { hit: true, crit, damage };
}

export function gatherDurationForLevel(level: number, agility = 0): number {
  return Math.max(
    GATHER_DURATION_FLOOR_MS,
    GATHER_DURATION_MS - level * GATHER_LEVEL_STEP_MS - agility * AGILITY_GATHER_STEP_MS,
  );
}

export function gatherUpgradeCost(level: number): number {
  return 5 + level * 5;
}

export const BATTLE_DURATION_MS = 1500;
export const BATTLE_DURATION_FLOOR_MS = 450;
export const BATTLE_POWER_STEP_MS = 120;
export const AGILITY_ATTACK_SPEED_STEP_MS = 25;

// Combat is proximity-driven rather than something you click to start:
// walk into a monster's reach and you trade blows until one of you leaves
// or dies. ENGAGE is the player's reach, AGGRO is how far a monster will
// notice and chase, and it is deliberately larger so monsters come to you.
export const ENGAGE_RANGE_PX = 62;
export const AGGRO_RANGE_PX = 260;
export const MONSTER_LEASH_PX = 520;

// Status effects. One timed-modifier mechanism serves both the player-side
// buff and the monster-side slow, rather than two bespoke systems.
export const SLOW_MULTIPLIER = 0.4;
export const SLOW_DURATION_MS = 3500;
export const WARCRY_DURATION_MS = 8000;
export const WARCRY_DAMAGE_BONUS = 0.35;

// A monster attacks whoever has hurt it most, not whoever happens to be
// closest. Without this a passer-by pulls a monster off the player actually
// fighting it, and no group role (tank, healer) can exist at all. The same
// accumulated-damage table doubles as the kill-credit share, which is why
// it is damage rather than an abstract threat number.
export const THREAT_FALLBACK_TO_NEAREST = true;
// Everyone who hurt a monster shares its XP in proportion to the damage
// they did, so two players on one enemy is no longer winner-takes-all.
// The floor stops a large contribution rounding a small one down to zero.
export const MIN_XP_SHARE = 0.15;

// Melee crowding: only this many monsters may press into contact at once;
// the rest hold at a wider ring and rotate in. Without a cap an entire pack
// occupies the same pixel and every one of them hits you simultaneously.
export const MAX_MELEE_ATTACKERS = 3;
export const MELEE_RING_STEP_PX = 46;
// How hard monsters push apart from each other, so a pack reads as several
// bodies rather than one stacked silhouette.
export const MONSTER_SEPARATION_PX = 34;

// One shared cooldown across the whole hotbar, on top of each skill's own.
// Without it every skill can be dumped in a single frame, which turns the
// bar into one alpha strike followed by a long empty gap.
export const GLOBAL_COOLDOWN_MS = 900;

// --- Stakes ---------------------------------------------------------------
// Three things that between them decide whether combat can be lost at all.
//
// Potions had no gate whatsoever, so a stocked player could drink their
// entire stack in one frame and simply could not die. A cooldown is the
// difference between a consumable and an immunity button.
export const POTION_COOLDOWN_MS = 9000;
// Regen used to tick while you were being hit, so disengaging to recover
// was never necessary and Mend had no job. Healing now waits until the
// fight has actually stopped.
export const COMBAT_LOCKOUT_MS = 6000;
// Dying cost nothing and teleported you home for free, which made suicide
// strictly better than a careful retreat. Now it takes a slice of progress
// toward the current level (never a level, never below zero) and leaves you
// briefly weakened, so fleeing beats dying.
export const DEATH_XP_LOSS_FRACTION = 0.15;
export const WEAKENED_DURATION_MS = 20000;
export const WEAKENED_DAMAGE_PENALTY = 0.25;
export const LOOT_DROP_CHANCE = 0.3;

// Thirteen kinds, laid out in the world as five difficulty bands radiating from
// spawn (see the server's monster layout). Adding one is still a single
// MONSTER_STATS row plus a model mapping on the client — the Phase 9 promise,
// re-tested here at scale: going from 4 kinds to 13 needed no new branching
// anywhere in the tick loop, the AI, or the loot roller.
export type MonsterKind =
  // band 1 — the ring you can clear at level 1
  | "slime"
  | "mushnub"
  // band 2
  | "spikyblob"
  | "goblin"
  | "armabee"
  // band 3
  | "wolf"
  | "cactoro"
  | "orcbrute"
  // band 4
  | "ghost"
  | "troll"
  | "demon"
  // band 5 — the far corners
  | "golem"
  | "dragon";

export interface MonsterStats {
  maxHp: number;
  minHit: number;
  maxHit: number;
  accuracy: number;
  evasion: number;
  armor: number;
  critChance: number;
  critMultiplier: number;
  xpReward: number;
  durationMultiplier: number; // attack-interval multiplier (base attack speed)
  respawnMultiplier: number;
  guaranteedDrop: boolean;
  // How often the monster gets its own attack in, independent of the
  // player's battle speed — a fast weapon no longer also makes the monster
  // hit you more often, and a boss's slow heavy swing is its own stat, not
  // a byproduct of your gear.
  attackIntervalMs: number;
  // Reach and chase speed, the two knobs that make positioning matter.
  // Speeds are meaningful only against BASE_MOVE_SPEED_PX_PER_SEC (220):
  // a wolf nearly matches you and cannot be shaken off, a troll is slow
  // enough to outrun but hits from much further away, and a slime has to
  // physically touch you. Kiting works or doesn't per monster, by design.
  attackRangePx: number;
  speedPxPerSec: number;
  // Telegraphed attack. When set, the monster does not simply hit whoever
  // is in reach: it winds up visibly for `windupMs`, then slams everything
  // within `slamRadiusPx` of where it is standing at that moment. That
  // makes it the first enemy you answer by moving rather than by stats.
  windupMs?: number;
  slamRadiusPx?: number;
  slamDamageMultiplier?: number;
  // Leap: a gap-closer. Given to the fast kind so that being fast means
  // *committing* to a distance rather than merely jogging slightly quicker.
  leapRangePx?: number;
  leapSpeedMultiplier?: number;
  leapDurationMs?: number;
  leapCooldownMs?: number;
  // Social aggro: taking a hit wakes nearby packmates. Turns pulling from
  // something that happens to you into something you have to plan.
  alertRadiusPx?: number;
  // Death burst: hurts whoever is standing on top of it when it dies, so
  // clearing a swarm with AoE is not entirely free.
  deathBurstRadiusPx?: number;
  deathBurstDamage?: number;
}

export const MONSTER_STATS: Record<MonsterKind, MonsterStats> = {
  slime: {
    maxHp: 15,
    minHit: 1,
    maxHit: 3,
    accuracy: 40,
    evasion: 5,
    armor: 0,
    critChance: 2,
    critMultiplier: 1.3,
    xpReward: 5,
    durationMultiplier: 1,
    respawnMultiplier: 1,
    guaranteedDrop: false,
    attackIntervalMs: 2200,
    attackRangePx: 42,
    speedPxPerSec: 105,
    // Bursts on death: the weakest enemy still punishes standing in the
    // middle of a swarm and cleaving blindly.
    deathBurstRadiusPx: 70,
    deathBurstDamage: 6,
  },
  goblin: {
    maxHp: 35,
    minHit: 3,
    maxHit: 7,
    accuracy: 55,
    evasion: 15,
    armor: 2,
    critChance: 5,
    critMultiplier: 1.4,
    xpReward: 12,
    durationMultiplier: 1.6,
    respawnMultiplier: 1,
    guaranteedDrop: false,
    attackIntervalMs: 1800,
    attackRangePx: 56,
    speedPxPerSec: 150,
    // Shouts for help, so a careless pull brings the whole camp.
    alertRadiusPx: 210,
  },
  // Fast and evasive rather than tanky — low HP and light hits, but its
  // own attack cadence is the quickest of any monster, and its evasion is
  // high for its tier. A "death by a thousand cuts" pack fight instead of
  // a slow tank-and-spank, contrasting with the troll's opposite profile.
  wolf: {
    maxHp: 22,
    minHit: 1,
    maxHit: 4,
    accuracy: 50,
    evasion: 20,
    armor: 0,
    critChance: 4,
    critMultiplier: 1.3,
    xpReward: 8,
    durationMultiplier: 1.2,
    respawnMultiplier: 1,
    guaranteedDrop: false,
    attackIntervalMs: 1400,
    attackRangePx: 50,
    speedPxPerSec: 200,
    // Closes the gap in one bound rather than grinding you down over a long
    // chase, which is what makes it the enemy you need an escape tool for.
    leapRangePx: 230,
    leapSpeedMultiplier: 3.4,
    leapDurationMs: 420,
    leapCooldownMs: 7000,
  },
  troll: {
    maxHp: 150,
    minHit: 8,
    maxHit: 16,
    accuracy: 70,
    evasion: 10,
    armor: 6,
    critChance: 8,
    critMultiplier: 1.6,
    xpReward: 40,
    durationMultiplier: 4,
    respawnMultiplier: 3,
    guaranteedDrop: true,
    attackIntervalMs: 3000,
    attackRangePx: 82,
    speedPxPerSec: 92,
    // Slow enough to outrun, hits a wide area for far more than its normal
    // swing, and gives you 900ms to get out — so the fight is about reading it,
    // not out-healing it.
    windupMs: 900,
    slamRadiusPx: 120,
    slamDamageMultiplier: 1.7,
  },

  // ---------------------------------------------------------------- band 1
  // Slower and meatier than a slime but with no trick at all — the kind you
  // learn the attack rhythm on.
  mushnub: {
    maxHp: 22,
    minHit: 2,
    maxHit: 4,
    accuracy: 45,
    evasion: 4,
    armor: 1,
    critChance: 2,
    critMultiplier: 1.3,
    xpReward: 8,
    durationMultiplier: 1.1,
    respawnMultiplier: 1,
    guaranteedDrop: false,
    attackIntervalMs: 2400,
    attackRangePx: 44,
    speedPxPerSec: 82,
  },

  // ---------------------------------------------------------------- band 2
  // The slime's lesson taken seriously: a much bigger death burst, so clearing
  // a cluster with AoE while standing in it genuinely hurts.
  spikyblob: {
    maxHp: 30,
    minHit: 3,
    maxHit: 5,
    accuracy: 50,
    evasion: 6,
    armor: 1,
    critChance: 3,
    critMultiplier: 1.3,
    xpReward: 12,
    durationMultiplier: 1.2,
    respawnMultiplier: 1,
    guaranteedDrop: false,
    attackIntervalMs: 2000,
    attackRangePx: 46,
    speedPxPerSec: 100,
    deathBurstRadiusPx: 110,
    deathBurstDamage: 13,
  },
  // Faster than the player and it leaps, but folds immediately once caught.
  // The answer is Frost Nova or a wall, not out-running it.
  armabee: {
    maxHp: 26,
    minHit: 3,
    maxHit: 6,
    accuracy: 58,
    evasion: 26,
    armor: 0,
    critChance: 6,
    critMultiplier: 1.35,
    xpReward: 15,
    durationMultiplier: 1.1,
    respawnMultiplier: 1,
    guaranteedDrop: false,
    attackIntervalMs: 1300,
    attackRangePx: 46,
    speedPxPerSec: 215,
    leapRangePx: 250,
    leapSpeedMultiplier: 3.2,
    leapDurationMs: 380,
    leapCooldownMs: 6000,
  },

  // ---------------------------------------------------------------- band 3
  // Armoured enough that low hit-bands scrape off it, and it bursts on death.
  cactoro: {
    maxHp: 60,
    minHit: 5,
    maxHit: 9,
    accuracy: 62,
    evasion: 8,
    armor: 4,
    critChance: 5,
    critMultiplier: 1.4,
    xpReward: 22,
    durationMultiplier: 1.6,
    respawnMultiplier: 1,
    guaranteedDrop: false,
    attackIntervalMs: 2000,
    attackRangePx: 52,
    speedPxPerSec: 112,
    deathBurstRadiusPx: 90,
    deathBurstDamage: 10,
  },
  // The goblin's shout, with a much wider radius and a body behind it. Pulling
  // one carelessly brings a camp that can actually kill you.
  orcbrute: {
    maxHp: 90,
    minHit: 7,
    maxHit: 12,
    accuracy: 68,
    evasion: 12,
    armor: 4,
    critChance: 7,
    critMultiplier: 1.45,
    xpReward: 30,
    durationMultiplier: 2,
    respawnMultiplier: 1.4,
    guaranteedDrop: false,
    attackIntervalMs: 1900,
    attackRangePx: 60,
    speedPxPerSec: 142,
    alertRadiusPx: 300,
  },

  // ---------------------------------------------------------------- band 4
  // Answers accuracy rather than damage: 38 evasion means a low-Agility build
  // simply cannot land on it, whatever its gear says.
  ghost: {
    maxHp: 45,
    minHit: 6,
    maxHit: 10,
    accuracy: 66,
    evasion: 38,
    armor: 0,
    critChance: 10,
    critMultiplier: 1.5,
    xpReward: 26,
    durationMultiplier: 1.7,
    respawnMultiplier: 1.2,
    guaranteedDrop: false,
    attackIntervalMs: 1700,
    attackRangePx: 58,
    speedPxPerSec: 168,
  },
  // The troll's damage without the tell — fast, hard-hitting and it crits.
  demon: {
    maxHp: 130,
    minHit: 10,
    maxHit: 16,
    accuracy: 74,
    evasion: 14,
    armor: 5,
    critChance: 16,
    critMultiplier: 1.8,
    xpReward: 45,
    durationMultiplier: 3,
    respawnMultiplier: 1.6,
    guaranteedDrop: false,
    attackIntervalMs: 1800,
    attackRangePx: 64,
    speedPxPerSec: 152,
  },

  // ---------------------------------------------------------------- band 5
  // Armour 14 is the point: it subtracts from every hit, so chip damage does
  // nothing and you need a real weapon rather than a fast one.
  golem: {
    maxHp: 240,
    minHit: 11,
    maxHit: 19,
    accuracy: 72,
    evasion: 4,
    armor: 14,
    critChance: 6,
    critMultiplier: 1.5,
    xpReward: 70,
    durationMultiplier: 4.5,
    respawnMultiplier: 3,
    guaranteedDrop: true,
    attackIntervalMs: 3200,
    attackRangePx: 78,
    speedPxPerSec: 70,
    windupMs: 1100,
    slamRadiusPx: 140,
    slamDamageMultiplier: 1.8,
  },
  // The apex: it telegraphs AND closes the gap, so neither standing still nor
  // running is a whole answer on its own.
  dragon: {
    maxHp: 340,
    minHit: 15,
    maxHit: 25,
    accuracy: 78,
    evasion: 12,
    armor: 9,
    critChance: 12,
    critMultiplier: 1.7,
    xpReward: 110,
    durationMultiplier: 5,
    respawnMultiplier: 4,
    guaranteedDrop: true,
    attackIntervalMs: 2600,
    attackRangePx: 95,
    speedPxPerSec: 124,
    windupMs: 950,
    slamRadiusPx: 165,
    slamDamageMultiplier: 1.9,
    leapRangePx: 320,
    leapSpeedMultiplier: 2.8,
    leapDurationMs: 500,
    leapCooldownMs: 9000,
  },
};

// --- Skills ---------------------------------------------------------------
// Each class has its own tree of seven: five actives and two passives,
// unlocked purely by level. Level-gating rather than spendable skill points
// is deliberate — the game already has a point economy (attributes), and a
// second one competing with it would make both feel thin. "Reach level N,
// gain this" is also the thing the request actually described.
//
// Actives cost mana and sit on cooldowns; passives have no button and are
// folded into the stat calculations the moment their level is reached.
// Every skill names a row of the shared effect atlas, so adding one is
// picking a school and a number rather than producing new art.
export type SkillId =
  // adventurer (unarmed) — deliberately thin, so finding a weapon is an
  // obvious upgrade rather than a lateral move
  | "haymaker" | "scrappy"
  // warrior
  | "cleave" | "toughness" | "charge" | "warcry" | "shieldwall" | "secondwind" | "earthshatter"
  // ranger
  | "powershot" | "eagleeye" | "multishot" | "poisonarrow" | "disengage" | "fleetfooted" | "rainofarrows"
  // mage
  | "arcanebolt" | "arcanemind" | "firebolt" | "frostnova" | "mend" | "manafont" | "chainlightning";

export type SkillKind = "damage" | "heal" | "control" | "buff" | "mobility" | "passive";

// What a passive contributes once unlocked. Kept as a flat bag of optional
// modifiers so the server can total them in one pass without knowing which
// skill supplied what.
export interface PassiveBonus {
  armor?: number;
  critChance?: number;
  maxManaBonus?: number;
  manaRegenBonus?: number;
  moveSpeedBonus?: number;
  healOnKill?: number;
  evasion?: number;
}

export interface SkillDef {
  id: SkillId;
  classId: CharacterClass;
  name: string;
  icon: string;
  kind: SkillKind;
  unlockLevel: number;
  manaCost: number;
  cooldownMs: number;
  // 0 means self-cast. Otherwise how far the target may be.
  rangePx: number;
  // 0 means single-target; otherwise everything within this of the impact.
  radiusPx: number;
  // Base magnitude before attribute scaling (see skillPower). For mobility
  // this is the distance travelled instead.
  power: number;
  effect: string;
  sfx: string;
  description: string;
  passive?: PassiveBonus;
  // Optional riders, so one resolution path covers a lot of variety.
  appliesSlow?: boolean;
  selfShieldMs?: boolean;
  // Hits several separate targets rather than everything in a radius.
  chainTargets?: number;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  // ------------------------------------------------------------ adventurer
  haymaker: {
    id: "haymaker", classId: "adventurer", name: "Haymaker", icon: "✊", kind: "damage",
    unlockLevel: 1, manaCost: 0, cooldownMs: 6000, rangePx: 58, radiusPx: 0, power: 5,
    effect: "impact", sfx: "hit",
    description: "A wild swing. Free, because you have nothing better.",
  },
  scrappy: {
    id: "scrappy", classId: "adventurer", name: "Scrappy", icon: "🥊", kind: "passive",
    unlockLevel: 1, manaCost: 0, cooldownMs: 0, rangePx: 0, radiusPx: 0, power: 0,
    effect: "", sfx: "",
    passive: { evasion: 4, moveSpeedBonus: 15 },
    description: "Nothing to weigh you down: +4% evasion, faster on your feet.",
  },
  // ---------------------------------------------------------------- warrior
  cleave: {
    id: "cleave", classId: "warrior", name: "Cleave", icon: "🗡️", kind: "damage",
    unlockLevel: 1, manaCost: 8, cooldownMs: 5000, rangePx: 0, radiusPx: 95, power: 7,
    effect: "slash", sfx: "crit", description: "Sweep every enemy around you.",
  },
  toughness: {
    id: "toughness", classId: "warrior", name: "Toughness", icon: "🛡️", kind: "passive",
    unlockLevel: 1, manaCost: 0, cooldownMs: 0, rangePx: 0, radiusPx: 0, power: 0,
    effect: "shield", sfx: "hit", description: "Plate sits better on you. +3 armour.",
    passive: { armor: 3 },
  },
  charge: {
    id: "charge", classId: "warrior", name: "Charge", icon: "💨", kind: "mobility",
    unlockLevel: 4, manaCost: 10, cooldownMs: 6000, rangePx: 0, radiusPx: 0, power: 180,
    effect: "quake", sfx: "swing", description: "Barrel forward, closing the gap.",
  },
  warcry: {
    id: "warcry", classId: "warrior", name: "War Cry", icon: "⚡", kind: "buff",
    unlockLevel: 8, manaCost: 14, cooldownMs: 18000, rangePx: 260, radiusPx: 0, power: 0,
    effect: "buff", sfx: "levelup", description: "Strike harder for a while. Targets an ally if you have one selected.",
  },
  shieldwall: {
    id: "shieldwall", classId: "warrior", name: "Shield Wall", icon: "🔰", kind: "buff",
    unlockLevel: 12, manaCost: 16, cooldownMs: 22000, rangePx: 0, radiusPx: 0, power: 0,
    effect: "shield", sfx: "hit", description: "Brace. Halves incoming damage briefly.",
    selfShieldMs: true,
  },
  secondwind: {
    id: "secondwind", classId: "warrior", name: "Second Wind", icon: "❤️", kind: "passive",
    unlockLevel: 16, manaCost: 0, cooldownMs: 0, rangePx: 0, radiusPx: 0, power: 0,
    effect: "heal", sfx: "heal", description: "Recover 6 health whenever you land a killing blow.",
    passive: { healOnKill: 6 },
  },
  earthshatter: {
    id: "earthshatter", classId: "warrior", name: "Earthshatter", icon: "🪨", kind: "damage",
    unlockLevel: 20, manaCost: 26, cooldownMs: 14000, rangePx: 0, radiusPx: 150, power: 20,
    effect: "quake", sfx: "die", description: "Split the ground. Heavy damage all around you.",
  },

  // ----------------------------------------------------------------- ranger
  powershot: {
    id: "powershot", classId: "ranger", name: "Power Shot", icon: "🏹", kind: "damage",
    unlockLevel: 1, manaCost: 8, cooldownMs: 4000, rangePx: 340, radiusPx: 0, power: 12,
    effect: "arrow", sfx: "swing", description: "A single heavy arrow at long range.",
  },
  eagleeye: {
    id: "eagleeye", classId: "ranger", name: "Eagle Eye", icon: "👁️", kind: "passive",
    unlockLevel: 1, manaCost: 0, cooldownMs: 0, rangePx: 0, radiusPx: 0, power: 0,
    effect: "arrow", sfx: "hit", description: "You pick your shots. +8% critical chance.",
    passive: { critChance: 8 },
  },
  multishot: {
    id: "multishot", classId: "ranger", name: "Multishot", icon: "🎯", kind: "damage",
    unlockLevel: 4, manaCost: 14, cooldownMs: 7000, rangePx: 300, radiusPx: 0, power: 9,
    effect: "arrow", sfx: "swing", description: "Loose at three enemies at once.",
    chainTargets: 3,
  },
  poisonarrow: {
    id: "poisonarrow", classId: "ranger", name: "Poison Arrow", icon: "🧪", kind: "control",
    unlockLevel: 8, manaCost: 12, cooldownMs: 9000, rangePx: 320, radiusPx: 0, power: 8,
    effect: "poison", sfx: "cast", description: "A venomous shot that slows what it hits.",
    appliesSlow: true,
  },
  disengage: {
    id: "disengage", classId: "ranger", name: "Disengage", icon: "🌀", kind: "mobility",
    unlockLevel: 12, manaCost: 10, cooldownMs: 5000, rangePx: 0, radiusPx: 0, power: 200,
    effect: "buff", sfx: "swing", description: "Leap clear, away from whatever is closest.",
  },
  fleetfooted: {
    id: "fleetfooted", classId: "ranger", name: "Fleet Footed", icon: "🍃", kind: "passive",
    unlockLevel: 16, manaCost: 0, cooldownMs: 0, rangePx: 0, radiusPx: 0, power: 0,
    effect: "buff", sfx: "hit", description: "You move lighter. +35 speed and +4 evasion.",
    passive: { moveSpeedBonus: 35, evasion: 4 },
  },
  rainofarrows: {
    id: "rainofarrows", classId: "ranger", name: "Rain of Arrows", icon: "☔", kind: "damage",
    unlockLevel: 20, manaCost: 28, cooldownMs: 15000, rangePx: 320, radiusPx: 130, power: 16,
    effect: "arrow", sfx: "crit", description: "Blanket the ground around your target.",
  },

  // ------------------------------------------------------------------- mage
  arcanebolt: {
    id: "arcanebolt", classId: "mage", name: "Arcane Bolt", icon: "🔮", kind: "damage",
    unlockLevel: 1, manaCost: 6, cooldownMs: 2500, rangePx: 300, radiusPx: 0, power: 10,
    effect: "arcane", sfx: "cast", description: "A quick bolt of raw magic.",
  },
  arcanemind: {
    id: "arcanemind", classId: "mage", name: "Arcane Mind", icon: "📘", kind: "passive",
    unlockLevel: 1, manaCost: 0, cooldownMs: 0, rangePx: 0, radiusPx: 0, power: 0,
    effect: "arcane", sfx: "hit", description: "A deeper well. +30 maximum mana.",
    passive: { maxManaBonus: 30 },
  },
  firebolt: {
    id: "firebolt", classId: "mage", name: "Firebolt", icon: "🔥", kind: "damage",
    unlockLevel: 4, manaCost: 14, cooldownMs: 5000, rangePx: 320, radiusPx: 70, power: 15,
    effect: "fire", sfx: "cast", description: "Hurl fire that bursts on impact.",
  },
  frostnova: {
    id: "frostnova", classId: "mage", name: "Frost Nova", icon: "❄️", kind: "control",
    unlockLevel: 8, manaCost: 18, cooldownMs: 11000, rangePx: 0, radiusPx: 150, power: 6,
    effect: "frost", sfx: "cast", description: "Chill everything nearby, slowing it so you can break away.",
    appliesSlow: true,
  },
  mend: {
    id: "mend", classId: "mage", name: "Mend", icon: "✨", kind: "heal",
    unlockLevel: 12, manaCost: 20, cooldownMs: 12000, rangePx: 260, radiusPx: 0, power: 30,
    effect: "heal", sfx: "heal", description: "Close wounds. Targets an ally if you have one selected.",
  },
  manafont: {
    id: "manafont", classId: "mage", name: "Mana Font", icon: "💧", kind: "passive",
    unlockLevel: 16, manaCost: 0, cooldownMs: 0, rangePx: 0, radiusPx: 0, power: 0,
    effect: "arcane", sfx: "hit", description: "Mana returns faster. +3 per tick.",
    passive: { manaRegenBonus: 3 },
  },
  chainlightning: {
    id: "chainlightning", classId: "mage", name: "Chain Lightning", icon: "🌩️", kind: "damage",
    unlockLevel: 20, manaCost: 30, cooldownMs: 13000, rangePx: 320, radiusPx: 0, power: 18,
    effect: "lightning", sfx: "crit", description: "Arcs from target to target, up to four.",
    chainTargets: 4,
  },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** Every skill belonging to a class, in unlock order — the tree, top to bottom. */
export function skillsForClass(cls: CharacterClass): SkillDef[] {
  return SKILL_IDS.map((id) => SKILLS[id])
    .filter((s) => s.classId === cls)
    .sort((a, b) => a.unlockLevel - b.unlockLevel || a.name.localeCompare(b.name));
}

/** The actives a character can currently use, in hotbar order. */
export function unlockedActives(cls: CharacterClass, level: number): SkillDef[] {
  return skillsForClass(cls).filter((s) => s.kind !== "passive" && s.unlockLevel <= level);
}

/** Totals every unlocked passive into one bag of modifiers. */
export function passiveBonuses(cls: CharacterClass, level: number): Required<PassiveBonus> {
  const total = {
    armor: 0, critChance: 0, maxManaBonus: 0, manaRegenBonus: 0,
    moveSpeedBonus: 0, healOnKill: 0, evasion: 0,
  };
  for (const skill of skillsForClass(cls)) {
    if (skill.kind !== "passive" || skill.unlockLevel > level || !skill.passive) continue;
    for (const key of Object.keys(total) as (keyof PassiveBonus)[]) {
      total[key] += skill.passive[key] ?? 0;
    }
  }
  return total;
}

// Skills scale off the class's primary attribute, so gear and stat choices
// carry over rather than being a separate power curve, and level is in there
// too — without it the hotbar quietly falls behind as auto-attacks keep
// scaling through gear.
export function skillPower(skill: SkillDef, power: number, vitality: number, level = 1): number {
  const levelBonus = (level - 1) * 1.5;
  if (skill.kind === "heal") return Math.round(skill.power + vitality * 2 + power + levelBonus * 2);
  if (skill.kind === "mobility" || skill.kind === "buff" || skill.kind === "passive") return skill.power;
  return Math.round(skill.power + power * 1.6 + levelBonus);
}

// Shield Wall's duration and how much it cuts.
export const SHIELD_WALL_MS = 6000;
export const SHIELD_WALL_REDUCTION = 0.5;

export function xpToNextLevel(level: number): number {
  return 20 + (level - 1) * 10;
}

export const PLAYER_SPAWN = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

export function maxHpForLevel(level: number, vitality = 0): number {
  return 50 + (level - 1) * 10 + vitality * VITALITY_HP_STEP;
}

// A second thing Vitality buys, on top of max HP: how much passive regen
// ticks for while below max (see HP_REGEN_INTERVAL_MS in the server tick
// loop, which stays a flat cadence — only the *amount* per tick scales).
export function regenAmountForVitality(vitality: number): number {
  return Math.min(5, 1 + Math.floor(vitality / 8));
}

// Daily login bonus: a flat resource grant, claimable once per real-world
// day (gated server-side by elapsed time since the last claim, not by
// calendar date, so timezone doesn't matter and it's simple to check).
export const DAILY_BONUS_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h, not 24h — forgives logging in a bit earlier each day
export interface DailyBonusReward {
  wood: number;
  ore: number;
  herb: number;
  potions: number;
}
export const DAILY_BONUS_REWARD: DailyBonusReward = { wood: 20, ore: 20, herb: 15, potions: 1 };

export interface DailyBonusMessage {
  type: "DAILY_BONUS";
  payload: DailyBonusReward;
}

// Generic server-initiated toast — for one-off notifications (e.g. "bag
// full") that don't warrant a dedicated message type and matching client
// handler of their own.
export interface InfoMessage {
  type: "INFO";
  payload: { text: string; color: string };
}

// Offline progress is gone along with the rest of the idle model: nothing
// accrues while logged out, because nothing happens without a player
// standing somewhere. Gathering and combat are now both proximity-driven,
// which has no offline equivalent to simulate.
export type GatherableResource = "wood" | "ore" | "herb";

export interface BattlePowerCost {
  wood: number;
  ore: number;
}

export function battlePowerUpgradeCost(level: number): BattlePowerCost {
  return { wood: 5 + level * 5, ore: 3 + level * 3 };
}

// --- Equipment / rarity (mirrors Idlekin's weapon slot + common..mythic tiers,
// scaled down to a few tiers for the MVP) ---

export const RARITY_ORDER = ["common", "rare", "epic"] as const;
export type ItemRarity = (typeof RARITY_ORDER)[number];

const RARITY_DROP_WEIGHTS: Record<ItemRarity, number> = { common: 60, rare: 30, epic: 10 };
const RARITY_SPEED_BONUS_MS: Record<ItemRarity, number> = { common: 200, rare: 500, epic: 900 };
const RARITY_XP_BONUS: Record<ItemRarity, number> = { common: 0.1, rare: 0.25, epic: 0.5 };
const RARITY_MOVE_SPEED_BONUS: Record<ItemRarity, number> = { common: 20, rare: 50, epic: 90 };

export const ITEM_SLOTS = ["weapon", "helm", "armor", "cape", "boots", "ring"] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

// --- Gear appearance
// The paperdoll draws the body naked and layers one sprite per equipped
// visible slot. A style names WHICH art to layer; rarity only tints it. These
// strings are the contract between the loot roller and the gear.png rows, so
// adding a look means adding a style here and a row there — nothing else.
export const GEAR_STYLES = [
  "leather",
  "chain",
  "plate",
  "robe",
  "cap",
  "hood",
  "full",
  "low",
  "tall",
  "cape",
] as const;
export type GearStyle = (typeof GEAR_STYLES)[number];

// Which looks a slot may roll. Rarity biases the pick (see rollGearStyle) so
// plate and great helms read as the high-end results without being exclusive.
export const SLOT_STYLES: Partial<Record<ItemSlot, GearStyle[]>> = {
  armor: ["leather", "chain", "plate", "robe"],
  helm: ["cap", "hood", "full"],
  boots: ["low", "tall"],
  cape: ["cape"],
};

// Later entries in each slot's list are the fancier looks, so shifting the
// index by rarity is enough to make epics look like epics.
export function rollGearStyle(slot: ItemSlot, rarity: ItemRarity, rand: () => number): GearStyle | undefined {
  const styles = SLOT_STYLES[slot];
  if (!styles || styles.length === 0) return undefined;
  const bias = RARITY_ORDER.indexOf(rarity);
  const idx = Math.min(styles.length - 1, Math.floor(rand() * styles.length) + (bias > 0 && rand() < 0.5 ? bias : 0));
  return styles[idx];
}

// Slots that put a layer on the character. `ring` and `weapon` are absent:
// rings are invisible, and the weapon is a separate hand sprite that has to
// rotate and tween independently of the body.
export const VISIBLE_GEAR_SLOTS: ItemSlot[] = ["cape", "armor", "helm", "boots"];

// The bag can only ever grow via loot/crafting (selling is the only way
// back down) — a cap gives that sink somewhere to matter, instead of
// selling being purely optional busywork.
export const INVENTORY_CAP = 30;

export const BASE_MOVE_SPEED_PX_PER_SEC = 220;

export function movePxPerSec(bootsRarity: ItemRarity | null, agility = 0, bootsBonusSpeed = 0): number {
  return (
    BASE_MOVE_SPEED_PX_PER_SEC +
    (bootsRarity ? RARITY_MOVE_SPEED_BONUS[bootsRarity] : 0) +
    agility * AGILITY_MOVE_STEP_PX_PER_SEC +
    bootsBonusSpeed
  );
}

export function rarityRank(rarity: ItemRarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

// How often the player swings. Deliberately independent of what they are
// fighting: attack speed is a property of the attacker, not the target.
// (It previously scaled with the monster kind, so a troll made your arms
// slower, which never made sense — a tougher monster should be tougher
// through its HP, armour and evasion, all of which it already has.)
export function playerAttackIntervalMs(
  weaponRarity: ItemRarity | null,
  battlePowerLevel: number,
  agility: number,
): number {
  const weaponBonus = weaponRarity ? RARITY_SPEED_BONUS_MS[weaponRarity] : 0;
  const powerBonus = battlePowerLevel * BATTLE_POWER_STEP_MS;
  const agilityBonus = agility * AGILITY_ATTACK_SPEED_STEP_MS;
  return Math.max(BATTLE_DURATION_FLOOR_MS, BATTLE_DURATION_MS - weaponBonus - powerBonus - agilityBonus);
}

const RARITY_CRIT_DAMAGE_BONUS: Record<ItemRarity, number> = { common: 0.1, rare: 0.25, epic: 0.5 };
export const BASE_CRIT_MULTIPLIER = 1.5;

export function critDamageMultiplier(weaponRarity: ItemRarity | null): number {
  return BASE_CRIT_MULTIPLIER + (weaponRarity ? RARITY_CRIT_DAMAGE_BONUS[weaponRarity] : 0);
}

export function xpRewardFor(monsterKind: MonsterKind, armorRarity: ItemRarity | null): number {
  const base = MONSTER_STATS[monsterKind].xpReward;
  const bonus = armorRarity ? RARITY_XP_BONUS[armorRarity] : 0;
  return Math.round(base * (1 + bonus));
}

export function xpBonusPercent(armorRarity: ItemRarity | null): number {
  return armorRarity ? Math.round(RARITY_XP_BONUS[armorRarity] * 100) : 0;
}

// Selling an unequipped item refunds wood — a simple sink so the bag
// doesn't only ever grow, without introducing a whole new currency.
const RARITY_SELL_VALUE: Record<ItemRarity, number> = { common: 5, rare: 20, epic: 60 };

export function sellValueFor(rarity: ItemRarity): number {
  return RARITY_SELL_VALUE[rarity];
}

export function rollItemRarity(random: () => number = Math.random): ItemRarity {
  const total = RARITY_ORDER.reduce((sum, r) => sum + RARITY_DROP_WEIGHTS[r], 0);
  let roll = random() * total;
  for (const rarity of RARITY_ORDER) {
    roll -= RARITY_DROP_WEIGHTS[rarity];
    if (roll <= 0) return rarity;
  }
  return RARITY_ORDER[RARITY_ORDER.length - 1];
}

// Boss kills (see MonsterStats.guaranteedDrop) always drop at least this rarity.
export const BOSS_MIN_RARITY: ItemRarity = "rare";

export function rollItemRarityWithFloor(
  minRarity: ItemRarity,
  random: () => number = Math.random,
): ItemRarity {
  const rolled = rollItemRarity(random);
  return rarityRank(rolled) >= rarityRank(minRarity) ? rolled : minRarity;
}

export function rollItemSlot(random: () => number = Math.random): ItemSlot {
  return ITEM_SLOTS[Math.floor(random() * ITEM_SLOTS.length)];
}

// Any family, uniformly. Deliberately NOT biased toward what the finder is
// already using: an off-class weapon is the interesting drop, because
// equipping it changes what they are.
export function rollWeaponType(random: () => number = Math.random): WeaponType {
  return WEAPON_TYPES[Math.floor(random() * WEAPON_TYPES.length)];
}

// Each slot rolls one primary numeric stat on drop, ranged by rarity:
// weapon -> bonus damage (added to max hit), armor -> flat damage reduction,
// boots -> evasion% (subtracted from attackers' accuracy against you),
// ring -> bonus damage too (stacks with weapon's, a pure damage slot with
// no defensive/utility side-effect).
// Helm and cape roll smaller than the chest piece, so filling every slot is
// an upgrade without making the chest irrelevant.
const STAT_ROLL_RANGES: Record<ItemSlot, Record<ItemRarity, [number, number]>> = {
  weapon: { common: [1, 3], rare: [4, 8], epic: [9, 15] },
  armor: { common: [1, 3], rare: [4, 8], epic: [9, 15] },
  helm: { common: [1, 2], rare: [3, 5], epic: [6, 10] },
  cape: { common: [1, 2], rare: [2, 4], epic: [5, 8] },
  boots: { common: [1, 3], rare: [4, 7], epic: [8, 12] },
  ring: { common: [1, 2], rare: [3, 5], epic: [6, 9] },
};

export function rollItemStatValue(
  slot: ItemSlot,
  rarity: ItemRarity,
  random: () => number = Math.random,
): number {
  const [min, max] = STAT_ROLL_RANGES[slot][rarity];
  return min + Math.floor(random() * (max - min + 1));
}

// Second roll per item, a different stat flavor than the primary so gear
// has two numbers worth checking, not just a bigger version of one:
// weapon -> bonus crit chance%, armor -> bonus evasion% (stacks with
// boots' evasion), boots -> bonus move speed, ring -> bonus accuracy%.
// Smaller ranges than the primary roll since these are a secondary bonus,
// not the main reason to equip the item.
const SECONDARY_STAT_ROLL_RANGES: Record<ItemSlot, Record<ItemRarity, [number, number]>> = {
  weapon: { common: [0, 1], rare: [1, 3], epic: [3, 6] },
  armor: { common: [0, 1], rare: [1, 3], epic: [3, 6] },
  helm: { common: [0, 1], rare: [1, 2], epic: [2, 4] },
  cape: { common: [1, 3], rare: [4, 8], epic: [9, 14] },
  boots: { common: [2, 5], rare: [6, 12], epic: [13, 20] },
  ring: { common: [0, 1], rare: [1, 3], epic: [3, 5] },
};

export function rollItemBonusStatValue(
  slot: ItemSlot,
  rarity: ItemRarity,
  random: () => number = Math.random,
): number {
  const [min, max] = SECONDARY_STAT_ROLL_RANGES[slot][rarity];
  return min + Math.floor(random() * (max - min + 1));
}

// --- Crafting: a deterministic alternative to monster-drop RNG. Mirrors
// Idlekin's real interactableId+recipeCode/claim model, scaled way down —
// one station, one guaranteed-common recipe per slot, no timer/claim step
// (instant, since we don't have a separate crafting-duration mechanic yet).
export interface CraftCost {
  wood: number;
  ore: number;
}

export const CRAFT_COSTS: Record<ItemSlot, CraftCost> = {
  weapon: { wood: 15, ore: 10 },
  armor: { wood: 15, ore: 10 },
  helm: { wood: 8, ore: 12 },
  cape: { wood: 14, ore: 4 },
  boots: { wood: 10, ore: 15 },
  ring: { wood: 12, ore: 12 },
};

// Higher rarities cost proportionally more of the same two resources rather
// than needing new resource types — keeps the recipe table one multiplier
// per rarity instead of a full slot x rarity cost matrix.
export const CRAFT_RARITY_MULTIPLIER: Record<ItemRarity, number> = {
  common: 1,
  rare: 4,
  epic: 12,
};

export function craftCostFor(slot: ItemSlot, rarity: ItemRarity): CraftCost {
  const base = CRAFT_COSTS[slot];
  const mult = CRAFT_RARITY_MULTIPLIER[rarity];
  return { wood: base.wood * mult, ore: base.ore * mult };
}

export interface CraftingStationState {
  id: string;
  x: number;
  y: number;
}

export interface CraftItemMessage {
  type: "CRAFT_ITEM";
  payload: {
    stationId: string;
    slot: ItemSlot;
    rarity: ItemRarity;
    // Weapons only. Omitted means "same family I already wield" — crafting an
    // upgrade should not change your class behind your back.
    weaponType?: WeaponType;
    // Armour only. Omitted rolls a look appropriate to the rarity.
    style?: GearStyle;
  };
}

// Consumables are a plain stack count on the character (mirrors
// wood/ore/herb), not an ItemInstance — there's nothing to equip or roll a
// stat on, just a quantity that goes up when crafted and down when used.
export interface PotionCraftCost {
  wood: number;
  ore: number;
  herb: number;
}
export const POTION_CRAFT_COST: PotionCraftCost = { wood: 2, ore: 0, herb: 8 };
export const POTION_HEAL_AMOUNT = 30;

export interface CraftPotionMessage {
  type: "CRAFT_POTION";
  payload: { stationId: string };
}

export interface UsePotionMessage {
  type: "USE_POTION";
}

export interface PotionsUpdateMessage {
  type: "POTIONS_UPDATE";
  payload: { potions: number; wood: number; ore: number; herb: number };
}

// Second consumable, mirroring the potion pattern exactly but a different
// effect (flat XP instead of HP) — herb's "maybe some other things" beyond
// just potions.
export interface TonicCraftCost {
  wood: number;
  ore: number;
  herb: number;
}
export const TONIC_CRAFT_COST: TonicCraftCost = { wood: 0, ore: 4, herb: 12 };
export const TONIC_XP_AMOUNT = 25;

export interface CraftTonicMessage {
  type: "CRAFT_TONIC";
  payload: { stationId: string };
}

export interface UseTonicMessage {
  type: "USE_TONIC";
}

export interface TonicsUpdateMessage {
  type: "TONICS_UPDATE";
  payload: { tonics: number; wood: number; ore: number; herb: number };
}

// Display names for world objects — used by client-side title labels.
export const NODE_LABELS: Record<ResourceNodeKind, string> = { tree: "Tree", rock: "Rock", bush: "Herb Bush" };
export const MONSTER_LABELS: Record<MonsterKind, string> = {
  slime: "Slime",
  mushnub: "Mushnub",
  spikyblob: "Spiky Blob",
  goblin: "Goblin",
  armabee: "Armabee",
  wolf: "Wolf",
  cactoro: "Cactoro",
  orcbrute: "Orc Brute",
  ghost: "Ghost",
  troll: "Troll",
  demon: "Demon",
  golem: "Golem",
  dragon: "Dragon",
};
export const STATION_LABEL = "Workbench";

// A real inventory: items you pick up sit unequipped until you choose to gear
// them up (see EquipItemMessage). "Better rarity auto-equips" is gone — the
// player decides.
export interface ItemInstance {
  id: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  equipped: boolean;
  statValue: number;
  bonusStatValue: number;
  // Only meaningful on weapons. Nothing gates equipping it — the family IS
  // the class, so picking up an unfamiliar weapon is an invitation to play
  // differently rather than a restriction. Weapons that predate this system
  // have no family recorded and resolve to fists.
  weaponType?: WeaponType;
  // Visual variant within the slot: which armour/accessory art to layer on
  // the paperdoll. Cosmetic only — stats come from rarity and rolls.
  style?: GearStyle;
}

// --- Aggregated gear stats
// Six slots feed four numbers, and each number is needed in several places:
// player-vs-monster, monster-vs-player, skill resolution, and the character
// sheet. Summing the contributions inline at each site is exactly how helm
// and cape came to roll stats that nothing ever read — every new slot
// silently needed an edit at four sites nobody was reminded about. One
// function per number means adding a slot is one line, once, and the sheet
// cannot show a total combat does not use.
//
// Who contributes what: armour and helm reduce damage; boots and cape dodge
// it; weapon and helm sharpen crits; boots and cape carry you faster. Chest
// and boots stay the biggest contributors, so the newer slots top you up
// rather than replace the decision you already made.
export type EquippedGear = Partial<Record<ItemSlot, ItemInstance | null>>;

export function equippedBySlot(items: ItemInstance[]): EquippedGear {
  const out: EquippedGear = {};
  for (const slot of ITEM_SLOTS) out[slot] = items.find((i) => i.equipped && i.slot === slot) ?? null;
  return out;
}

export function gearArmor(eq: EquippedGear | undefined): number {
  return (eq?.armor?.statValue ?? 0) + (eq?.helm?.statValue ?? 0);
}

export function gearEvasion(eq: EquippedGear | undefined): number {
  return (eq?.boots?.statValue ?? 0) + (eq?.cape?.statValue ?? 0) + (eq?.armor?.bonusStatValue ?? 0);
}

export function gearCritChance(eq: EquippedGear | undefined): number {
  return (eq?.weapon?.bonusStatValue ?? 0) + (eq?.helm?.bonusStatValue ?? 0);
}

export function gearMoveBonus(eq: EquippedGear | undefined): number {
  return (eq?.boots?.bonusStatValue ?? 0) + (eq?.cape?.bonusStatValue ?? 0);
}

// Bonus damage is the one total that is purely offensive gear: weapon and
// ring, the two slots with no defensive side.
export function gearDamageBonus(eq: EquippedGear | undefined): number {
  return (eq?.weapon?.statValue ?? 0) + (eq?.ring?.statValue ?? 0);
}

// Display label for the secondary roll, keyed by slot — used by tooltips
// and the character stat sheet.
export const SECONDARY_STAT_LABEL: Record<ItemSlot, string> = {
  weapon: "Crit chance",
  armor: "Evasion",
  helm: "Crit chance",
  cape: "Move speed",
  boots: "Move speed",
  ring: "Accuracy",
};

// No class is sent at login any more — the server derives it from whatever
// weapon the character has equipped.
export interface HelloMessage {
  type: "HELLO";
  payload: { clientVersion: string; name: string };
}

// Everything needed to draw a character, and nothing else. The body is always
// the same naked sprite; each equipped visible slot contributes one layer with
// a style (which art) and a rarity (how it is tinted). Empty slots are absent,
// which is exactly what "naked until equipped" means at the wire level.
//
// The local player and every remote player render from this same shape, so
// there is one drawing path rather than a self-case and an others-case that
// drift apart.
export interface GearLayer {
  style: GearStyle;
  rarity: ItemRarity;
}

export interface Appearance {
  // Absent when unarmed. Also decides the class, so it is never redundant
  // with a class field — there is no class field.
  weaponType?: WeaponType;
  weaponRarity?: ItemRarity;
  layers: Partial<Record<ItemSlot, GearLayer>>;
}

export function appearanceClass(a: Appearance): CharacterClass {
  return classForWeapon(a.weaponType);
}

// Derives the look from an item list. The server broadcasts `Appearance` for
// remote players, but the messages that follow an equip (ITEMS_UPDATE) carry
// only the items — so the local player rebuilds its own appearance from the
// same list rather than waiting for a snapshot to tell it what it is wearing.
// Sharing this function is what keeps "what I see on myself" and "what
// everyone else sees on me" from being two independent derivations.
export function appearanceFromItems(items: ItemInstance[]): Appearance {
  const equipped = items.filter((i) => i.equipped);
  const weapon = equipped.find((i) => i.slot === "weapon");
  const layers: Appearance["layers"] = {};
  for (const slot of VISIBLE_GEAR_SLOTS) {
    const item = equipped.find((i) => i.slot === slot);
    if (item?.style) layers[slot] = { style: item.style, rarity: item.rarity };
  }
  return { weaponType: weapon?.weaponType, weaponRarity: weapon?.rarity, layers };
}

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  appearance: Appearance;
}

export type ResourceNodeStatus = "available" | "depleted";
export type ResourceNodeKind = "tree" | "rock" | "bush";

export function resourceForNodeKind(kind: ResourceNodeKind): GatherableResource {
  if (kind === "tree") return "wood";
  if (kind === "rock") return "ore";
  return "herb";
}

export interface ResourceNodeState {
  id: string;
  kind: ResourceNodeKind;
  x: number;
  y: number;
  status: ResourceNodeStatus;
}

export type MonsterStatus = "alive" | "dead";

export interface MonsterState {
  id: string;
  kind: MonsterKind;
  x: number;
  y: number;
  status: MonsterStatus;
  hp: number;
  maxHp: number;
  // Broadcast so the client can tint a chilled monster; also what tells the
  // player their Frost Nova is still doing something.
  slowed: boolean;
  // True while a telegraphed attack is charging. Carried on the snapshot
  // rather than as its own message: the client only needs to know that a
  // wind-up is in progress to draw the danger zone, and the radius is a
  // static per-kind stat it can already look up.
  windingUp: boolean;
}

export interface StateSnapshotMessage {
  type: "STATE_SNAPSHOT";
  payload: {
    serverTime: number;
    players: PlayerState[];
    nodes: ResourceNodeState[];
    monsters: MonsterState[];
    stations: CraftingStationState[];
  };
}

export interface MoveMessage {
  type: "MOVE";
  payload: { x: number; y: number };
}

// Gathering needs no message at all — it is decided from proximity. Combat
// takes one: which enemy you have selected. Without a target the server
// still auto-attacks whatever is nearest, so walking into a camp fights
// back; picking a target is how you override that and focus something.
// One selection covers both enemies and allies: the server looks the id up
// in each and stores it as whichever it turns out to be. Clicking a monster
// gives you something to attack, clicking a player gives you someone to
// heal or buff, and neither needs its own message or its own click.
export interface SetTargetMessage {
  type: "SET_TARGET";
  payload: { targetId: string | null };
}

export interface UseSkillMessage {
  type: "USE_SKILL";
  payload: { skillId: SkillId };
}

// Sent back for every USE_SKILL, successful or not, so the client can start
// its cooldown sweep from the server's clock rather than guessing — the
// server is the authority on whether the skill actually fired.
export interface SkillResultMessage {
  type: "SKILL_RESULT";
  payload: {
    skillId: SkillId;
    ok: boolean;
    reason?: string;
    cooldownRemainingMs: number;
    // Shared cooldown started by this cast, so the client can grey the
    // whole bar rather than tracking a GCD of its own.
    globalCooldownMs: number;
    // Skills roll to hit and to crit exactly like an auto-attack, so a miss
    // is possible and Agility matters just as much when using the hotbar.
    hits: { monsterId: string; hit: boolean; damage: number; crit: boolean }[];
    healed?: number;
    buffMs?: number;
    slowMs?: number;
  };
}

export interface ManaUpdateMessage {
  type: "MANA_UPDATE";
  payload: { mana: number; maxMana: number };
}

export interface UpgradeGatherSpeedMessage {
  type: "UPGRADE_GATHER_SPEED";
}

export interface UpgradeBattlePowerMessage {
  type: "UPGRADE_BATTLE_POWER";
}

export interface AllocateStatMessage {
  type: "ALLOCATE_STAT";
  payload: { stat: AttributeName };
}

export interface RequestLeaderboardMessage {
  type: "REQUEST_LEADERBOARD";
}

export interface LeaderboardEntry {
  name: string;
  level: number;
  xp: number;
}

export interface LeaderboardUpdateMessage {
  type: "LEADERBOARD_UPDATE";
  payload: { entries: LeaderboardEntry[] };
}

export interface WelcomeMessage {
  type: "WELCOME";
  payload: {
    id: string;
    x: number;
    y: number;
    wood: number;
    ore: number;
    gatherLevel: number;
    battlePowerLevel: number;
    xp: number;
    level: number;
    hp: number;
    maxHp: number;
    strength: number;
    agility: number;
    vitality: number;
    intelligence: number;
    statPoints: number;
    appearance: Appearance;
    mana: number;
    maxMana: number;
    weaponRarity: ItemRarity | null;
    armorRarity: ItemRarity | null;
    bootsRarity: ItemRarity | null;
    items: ItemInstance[];
    potions: number;
    herb: number;
    tonics: number;
  };
}

export interface StatsUpdateMessage {
  type: "STATS_UPDATE";
  payload: {
    strength: number;
    agility: number;
    vitality: number;
    intelligence: number;
    statPoints: number;
    maxMana: number;
    maxHp: number;
  };
}

export interface InventoryUpdateMessage {
  type: "INVENTORY_UPDATE";
  payload: { wood: number; gatherLevel: number };
}

export interface HerbUpdateMessage {
  type: "HERB_UPDATE";
  payload: { herb: number };
}

export interface EquipItemMessage {
  type: "EQUIP_ITEM";
  payload: { itemId: string };
}

export interface SellItemMessage {
  type: "SELL_ITEM";
  payload: { itemId: string };
}

// Sent after any inventory mutation (new drop, or an equip swap) — always the
// full item list plus the currently-equipped rarity per slot (the latter is
// what gather/battle duration & move-speed formulas actually consume, so it's
// kept as a flat trio rather than making every call site scan `items`).
export interface ItemsUpdateMessage {
  type: "ITEMS_UPDATE";
  payload: {
    items: ItemInstance[];
    weaponRarity: ItemRarity | null;
    armorRarity: ItemRarity | null;
    bootsRarity: ItemRarity | null;
  };
}

export interface OreUpdateMessage {
  type: "ORE_UPDATE";
  payload: { wood: number; ore: number; battlePowerLevel: number };
}

export interface XpUpdateMessage {
  type: "XP_UPDATE";
  payload: { xp: number; level: number; leveledUp: boolean };
}

export interface LootUpdateMessage {
  type: "LOOT_UPDATE";
  payload: { item: ItemInstance };
}

// Sent whenever a monster's counter-hit lands during battle. `x`/`y` are only
// present when `defeated` is true — the player was teleported back to spawn
// at half HP and the client needs to snap its local sprite to match, since
// the client is otherwise authoritative over its own on-screen position.
export interface HpUpdateMessage {
  type: "HP_UPDATE";
  payload: { hp: number; maxHp: number; defeated: boolean; x?: number; y?: number };
}

// Sent once per player attack cycle during battle — the combat-log entry for
// the player's own swing (hit/miss/crit/damage). Monster HP itself is
// authoritative via STATE_SNAPSHOT (MonsterState.hp); this message is purely
// for combat-log/floating-text feedback. The monster's own counter-attack no
// longer rides along on this message — see MonsterAttackMessage below, which
// fires on the monster's independent attack cadence.
export interface BattleResultMessage {
  type: "BATTLE_RESULT";
  payload: {
    monsterId: string;
    playerHit: boolean;
    playerCrit: boolean;
    playerDamage: number;
    monsterDefeated: boolean;
  };
}

// Fired whenever a monster gets its own attack in, on its own
// `MonsterStats.attackIntervalMs` cadence — independent of how often the
// player attacks. Player HP changes still arrive via the dedicated
// HpUpdateMessage; this is purely the combat-log/floating-text entry for
// that swing.
export interface MonsterAttackMessage {
  type: "MONSTER_ATTACK";
  payload: {
    monsterId: string;
    hit: boolean;
    crit: boolean;
    damage: number;
  };
}

export type ClientToServerMessage =
  | HelloMessage
  | MoveMessage
  | UpgradeGatherSpeedMessage
  | UpgradeBattlePowerMessage
  | EquipItemMessage
  | SellItemMessage
  | AllocateStatMessage
  | CraftItemMessage
  | CraftPotionMessage
  | UsePotionMessage
  | CraftTonicMessage
  | UseTonicMessage
  | RequestLeaderboardMessage
  | SetTargetMessage
  | UseSkillMessage;
export type ServerToClientMessage =
  | StateSnapshotMessage
  | WelcomeMessage
  | InventoryUpdateMessage
  | HerbUpdateMessage
  | OreUpdateMessage
  | XpUpdateMessage
  | LootUpdateMessage
  | HpUpdateMessage
  | ItemsUpdateMessage
  | StatsUpdateMessage
  | BattleResultMessage
  | MonsterAttackMessage
  | PotionsUpdateMessage
  | TonicsUpdateMessage
  | LeaderboardUpdateMessage
  | DailyBonusMessage
  | InfoMessage
  | ManaUpdateMessage
  | SkillResultMessage;
