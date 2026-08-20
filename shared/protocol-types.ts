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

// --- The clock ------------------------------------------------------------
// The world has a time of day, and it is DERIVED rather than sent.
//
// Nothing about the cycle needs to be authoritative — it drives light and
// colour, not damage — so a message carrying it would be a message that can be
// missed, arrive late, or drift between two clients watching the same field.
// Computing it from wall-clock time instead means every client agrees by
// construction, exactly as every combat formula in this file does, and the
// protocol did not have to grow a field. It lives here rather than in the
// client because the server will want it the moment anything is nocturnal.
//
// Twenty-four real minutes to the day, so one game hour is one real minute:
// long enough that noon is a state you play in rather than a moment you catch,
// short enough to see a sunset without arranging your evening around it.
export const DAY_LENGTH_MS = 24 * 60 * 1000;

/** 0 at midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. Always in [0, 1). */
export function timeOfDay(nowMs: number = Date.now()): number {
  const t = (nowMs % DAY_LENGTH_MS) / DAY_LENGTH_MS;
  return t < 0 ? t + 1 : t;
}

/** The same clock as a 0..24 hour, for anything that wants to say the time. */
export function gameHour(nowMs: number = Date.now()): number {
  return timeOfDay(nowMs) * 24;
}

/** Formatted as HH:MM, for the interface. */
export function gameClock(nowMs: number = Date.now()): string {
  const hour = gameHour(nowMs);
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * How high the sun stands, -1 (midnight) to 1 (noon). Zero is the horizon, so
 * the sign of this is exactly "is it daytime" and both the lighting and any
 * future night-time rule can read the same number.
 */
export function sunElevation(nowMs: number = Date.now()): number {
  return Math.sin((timeOfDay(nowMs) - 0.25) * Math.PI * 2);
}

/** True while the sun is above the horizon. */
export function isDaytime(nowMs: number = Date.now()): boolean {
  return sunElevation(nowMs) > 0;
}

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
    icon: "class-adventurer",
    blurb: "Bare hands. Pick up a weapon and you become something.",
    primaryStat: "strength",
    attackRangePx: 54,
    baseHpBonus: 0,
    baseManaBonus: 0,
  },
  warrior: {
    id: "warrior",
    name: "Warrior",
    icon: "class-warrior",
    blurb: "Swords, axes and maces. Highest health, has to be in the thick of it.",
    primaryStat: "strength",
    attackRangePx: 62,
    baseHpBonus: 30,
    baseManaBonus: 0,
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    icon: "class-ranger",
    blurb: "Bows and daggers. Strikes from far outside anything's reach.",
    primaryStat: "agility",
    attackRangePx: 300,
    baseHpBonus: 10,
    baseManaBonus: 20,
  },
  mage: {
    id: "mage",
    name: "Mage",
    icon: "class-mage",
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
  fist: { type: "fist", name: "Fists", icon: "fist", classId: "adventurer", rangeMultiplier: 1, speedMultiplier: 0.8, damageMultiplier: 0.6 },
  sword: { type: "sword", name: "Sword", icon: "sword", classId: "warrior", rangeMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
  axe: { type: "axe", name: "Axe", icon: "axe", classId: "warrior", rangeMultiplier: 1.05, speedMultiplier: 1.35, damageMultiplier: 1.45 },
  mace: { type: "mace", name: "Mace", icon: "mace", classId: "warrior", rangeMultiplier: 0.95, speedMultiplier: 1.2, damageMultiplier: 1.25 },
  dagger: { type: "dagger", name: "Dagger", icon: "dagger", classId: "ranger", rangeMultiplier: 0.2, speedMultiplier: 0.6, damageMultiplier: 0.7 },
  bow: { type: "bow", name: "Bow", icon: "bow", classId: "ranger", rangeMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
  staff: { type: "staff", name: "Staff", icon: "staff", classId: "mage", rangeMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
  wand: { type: "wand", name: "Wand", icon: "wand", classId: "mage", rangeMultiplier: 0.8, speedMultiplier: 0.7, damageMultiplier: 0.75 },
};

export const WEAPON_TYPES: WeaponType[] = ["sword", "axe", "mace", "dagger", "bow", "staff", "wand"];

// --- The default attack -----------------------------------------------------
// Every weapon has one, and it is a real entry on the bar rather than an
// invisible thing the server does on your behalf. Two reasons it belongs here
// and not in the skill tables: it is keyed by WEAPON, not by class — a bow and
// a dagger are both a ranger's and have nothing in common — and it has no
// cooldown, no mana and no unlock level, so most of SkillDef would be dead
// fields describing it.
//
// Its timing is the weapon's swing interval, which until now was invisible:
// an axe swings at 1.35x the base interval and a dagger at 0.6x, and no
// player could perceive the difference because nothing on screen counted it.
export interface DefaultAttackDef {
  name: string;
  icon: string;
  description: string;
}

export const DEFAULT_ATTACKS: Record<WeaponType, DefaultAttackDef> = {
  fist: { name: "Jab", icon: "attack-jab", description: "A bare-knuckle jab. Fast, and worth very little." },
  sword: { name: "Slash", icon: "attack-slash", description: "A balanced cut. The measure every other weapon is tuned against." },
  axe: { name: "Hew", icon: "attack-hew", description: "One heavy chop. Slow to land, and it hurts." },
  mace: { name: "Crush", icon: "attack-crush", description: "A blunt swing that lands with weight behind it." },
  dagger: { name: "Stab", icon: "attack-stab", description: "A quick thrust. Little reach, but you get several in." },
  bow: { name: "Shoot", icon: "attack-shoot", description: "Looses an arrow. It takes time to arrive." },
  staff: { name: "Arcane Blast", icon: "attack-arcaneblast", description: "Hurls a bolt of raw force at your target." },
  wand: { name: "Zap", icon: "attack-zap", description: "A thin beam, there and gone. Quick and light." },
};

export function defaultAttackFor(weaponType: WeaponType | undefined | null): DefaultAttackDef {
  return DEFAULT_ATTACKS[weaponType ?? "fist"] ?? DEFAULT_ATTACKS.fist;
}

// --- The action bar ---------------------------------------------------------
// The bar is the player's, not the game's. It used to be generated — every
// unlocked skill in tree order, keys assigned by position — which meant there
// was no such thing as *your* layout: learning a talent could shuffle
// everything one slot to the right and retrain your hands for you.
//
// A layout is therefore stored, per weapon, and only ever changed by the
// player. Per weapon because the skills are: a bar that survived a weapon swap
// would be full of things you cannot cast.
export const HOTBAR_SLOTS = 10;

/** What sits in a slot: the weapon's default attack, a skill, or nothing. */
export type HotbarEntry = "attack" | SkillId | null;

export interface HotbarLayout {
  slots: HotbarEntry[];
  /** Lower-case key name per slot, as `KeyboardEvent.key` reports it. */
  keys: string[];
}

export const DEFAULT_HOTBAR_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function emptyHotbar(): HotbarLayout {
  return {
    slots: Array.from({ length: HOTBAR_SLOTS }, () => null),
    keys: [...DEFAULT_HOTBAR_KEYS],
  };
}

/**
 * Repairs anything that arrives: wrong length, unknown skill ids, duplicate
 * keys, a skill placed twice. Runs on both sides — the client to survive a
 * stored layout from an older build, the server because a message can say
 * anything at all.
 */
export function normalizeHotbar(raw: Partial<HotbarLayout> | null | undefined): HotbarLayout {
  const out = emptyHotbar();
  const seen = new Set<string>();
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    const entry = raw?.slots?.[i] ?? null;
    if (entry === "attack" || (entry && SKILLS[entry as SkillId])) {
      // One slot per action: two copies of the same skill share one cooldown
      // and just take up room.
      if (!seen.has(entry)) {
        seen.add(entry);
        out.slots[i] = entry as HotbarEntry;
      }
    }
    const key = String(raw?.keys?.[i] ?? "").toLowerCase();
    // A key is one character or a named key; anything else is not bindable.
    if (key && key.length <= 12 && !out.keys.slice(0, i).includes(key)) out.keys[i] = key;
  }
  // Deduplicate whatever the loop above could not, so no key ever fires two
  // slots.
  const used = new Set<string>();
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    if (used.has(out.keys[i])) out.keys[i] = "";
    else used.add(out.keys[i]);
  }
  return out;
}

/**
 * A sensible starting bar: the default attack first, then whatever has been
 * learned, in tree order. Used only when a weapon has no stored layout, so it
 * is a starting point rather than a thing that keeps reasserting itself.
 */
export function suggestedHotbar(
  weapon: WeaponType | undefined,
  ranks: TalentRanks,
): HotbarLayout {
  const layout = emptyHotbar();
  layout.slots[0] = "attack";
  unlockedActives(weapon, ranks).forEach((skill, i) => {
    if (i + 1 < HOTBAR_SLOTS) layout.slots[i + 1] = skill.id;
  });
  return layout;
}

/** Drops anything the player can no longer use, so a refunded talent does not
 *  leave a dead button behind. Keeps positions: the gap is the point. */
export function pruneHotbar(
  layout: HotbarLayout,
  weapon: WeaponType | undefined,
  ranks: TalentRanks,
): HotbarLayout {
  const usable = new Set(unlockedActives(weapon, ranks).map((s) => s.id as string));
  return {
    keys: [...layout.keys],
    slots: layout.slots.map((e) => (e === "attack" || (e && usable.has(e)) ? e : null)),
  };
}

// --- Attack orders ----------------------------------------------------------
// You do not attack something because you happened to walk near it. Standing
// next to a monster is not an instruction, and treating it as one meant a
// player crossing the map picked fights they never chose — the last of the
// idle-era "the server decides what you are doing from where you stand"
// reasoning (Phase 40), which the rest of the game has since grown out of.
//
// Instead an attack order is something you give: press the default attack, or
// any offensive skill. It then stands on its own, so a fight does not need a
// keypress per swing or per corpse — and it lapses once nothing has been
// within reach for a while, which is what walking away from a fight means.
//
// Two seconds, and the number is load-bearing. It has to outlast the gaps
// INSIDE a fight — a target dying while you pick the next, chasing something
// that fled, stepping between two pack members — without outlasting the walk
// BETWEEN fights. Camps sit a few hundred pixels apart and a player crosses
// that in a second or two, so a longer window would quietly re-engage you on
// arrival at the next camp, which is the very thing an attack order exists to
// prevent.
export const ATTACK_ORDER_LAPSE_MS = 2000;

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
export function attackRangeFor(
  weaponType: WeaponType | undefined | null,
  rangePercent = 0,
): number {
  const w = weaponDef(weaponType);
  const base = CLASSES[w.classId].attackRangePx * w.rangeMultiplier;
  return Math.round(base * (1 + rangePercent / 100));
}

// --- Where talent percentages land -----------------------------------------
// Each of these takes the totals `talentPassives` produced. They exist so the
// server's combat resolution and the client's stat sheet apply a bonus the same
// way rather than each doing its own arithmetic — the same reason every other
// formula in this file is shared.

export function applyDamagePercent(damage: number, damagePercent: number): number {
  return Math.max(1, Math.round(damage * (1 + damagePercent / 100)));
}

/** Faster attack speed means a SHORTER interval, so the percentage divides. */
export function applyAttackSpeed(intervalMs: number, attackSpeedPercent: number): number {
  return Math.max(200, Math.round(intervalMs / (1 + attackSpeedPercent / 100)));
}

export function applyCooldown(cooldownMs: number, cooldownPercent: number): number {
  return Math.max(500, Math.round(cooldownMs * (1 - Math.min(60, cooldownPercent) / 100)));
}

export function applyManaCost(manaCost: number, manaCostPercent: number): number {
  return Math.max(0, Math.round(manaCost * (1 - Math.min(70, manaCostPercent) / 100)));
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

/**
 * How much each attribute is worth to the weapon currently in hand, so stat
 * points can be spent on evidence rather than on guesswork.
 *
 * The rankings are not opinions: the primary attribute is the one
 * `primaryStatValue` actually multiplies damage by, and the rest fall out of
 * what the weapon does with them. A bow lives or dies on Agility because that
 * is both its damage stat and its accuracy; a mace wants Vitality second
 * because it is the warrior weapon that expects to be hit.
 */
export interface StatAdvice {
  /** Best first, and always four entries. */
  order: AttributeName[];
  why: string;
}

export const WEAPON_STAT_ADVICE: Record<WeaponType, StatAdvice> = {
  fist: { order: ["agility", "vitality", "strength", "intelligence"], why: "Fists scale off Strength but hit for very little either way — Agility keeps you alive and moving until you find a real weapon." },
  sword: { order: ["strength", "agility", "vitality", "intelligence"], why: "Strength is your damage. Agility adds accuracy, crits and the odd double swing." },
  axe: { order: ["strength", "vitality", "agility", "intelligence"], why: "Every swing is slow and heavy, so Strength counts double and Vitality keeps you standing between them." },
  mace: { order: ["strength", "vitality", "agility", "intelligence"], why: "The warrior weapon that expects to be hit back. Strength for the blow, Vitality to trade." },
  dagger: { order: ["agility", "strength", "vitality", "intelligence"], why: "Agility is damage, accuracy, crit chance and double swings all at once — nothing else comes close." },
  bow: { order: ["agility", "vitality", "strength", "intelligence"], why: "Agility is your damage stat and your accuracy. Vitality covers what closes the distance." },
  staff: { order: ["intelligence", "vitality", "agility", "strength"], why: "Intelligence is spell damage and the mana to cast again. Vitality, because a mage is frail." },
  wand: { order: ["intelligence", "agility", "vitality", "strength"], why: "Intelligence for the damage, Agility for the crits a fast weapon gets more of." },
};

export function statAdviceFor(weaponType: WeaponType | undefined | null): StatAdvice {
  return WEAPON_STAT_ADVICE[weaponType ?? "fist"] ?? WEAPON_STAT_ADVICE.fist;
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

export function playerAccuracy(agility: number, accuracyBonus = 0): number {
  return Math.min(95, 50 + agility * 2 + accuracyBonus);
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

// --- Damage has a school ----------------------------------------------------
// Every blow in the game was one undifferentiated number. A firebolt and a
// hammer both came out as "14", the only difference was which sprite played,
// and so the answer to every monster was the same weapon swung harder. The
// premise of this game is that WHAT YOU ARE HOLDING IS WHO YOU ARE, and that
// premise was only half true: the thing in your hand decided how you fought and
// never what you were good against.
//
// SIX SCHOOLS, and physical is one of them rather than the absence of one.
// Making "no element" a real school is what lets a golem resist it, which is
// the whole point — an untyped default would have to be the one thing nothing
// in the world could have an opinion about.
//
// Five elements and no more. Every one of them has a monster that resists it, a
// monster that folds to it, a way for a player to deal it and a way to defend
// against it; a sixth would be a word in a tooltip. `lightning` in particular
// existed as an effect row and a spell and had no meaning at all until now.
export const DAMAGE_SCHOOLS = [
  "physical",
  "fire",
  "frost",
  "nature",
  "arcane",
  "lightning",
] as const;
export type DamageSchool = (typeof DAMAGE_SCHOOLS)[number];

/** The elements, i.e. everything a resistance can be carried against. Armour is
 *  the physical answer and always has been, so there is deliberately no such
 *  thing as physical resistance — two numbers doing one job is how a stat
 *  becomes impossible to tune. */
export const ELEMENTAL_SCHOOLS = DAMAGE_SCHOOLS.filter((s) => s !== "physical") as Exclude<
  DamageSchool,
  "physical"
>[];
export type ElementalSchool = (typeof ELEMENTAL_SCHOOLS)[number];

export interface SchoolDef {
  id: DamageSchool;
  name: string;
  /** Interface colour: floating damage, the target frame's lines, the sheet. */
  color: string;
  /** How a hit of this school reads in a log line, lower case. */
  verb: string;
}

export const SCHOOLS: Record<DamageSchool, SchoolDef> = {
  physical: { id: "physical", name: "Physical", color: "#e8e2d4", verb: "struck" },
  fire:     { id: "fire",     name: "Fire",     color: "#ff8a3d", verb: "burned" },
  frost:    { id: "frost",    name: "Frost",    color: "#7fd4f5", verb: "chilled" },
  nature:   { id: "nature",   name: "Nature",   color: "#8fd15a", verb: "poisoned" },
  arcane:   { id: "arcane",   name: "Arcane",   color: "#c08aff", verb: "seared" },
  lightning:{ id: "lightning",name: "Lightning",color: "#ffe066", verb: "shocked" },
};

export function schoolDef(school: DamageSchool | undefined | null): SchoolDef {
  return SCHOOLS[school ?? "physical"] ?? SCHOOLS.physical;
}

/**
 * How far a resistance may go, in either direction.
 *
 * NEVER IMMUNITY, and never anything close to it. The one rule this whole
 * system has to obey is the game's own premise: you may pick up any weapon and
 * go anywhere, so a resistance profile has to make a choice better or worse and
 * must never make one unplayable. Fifty per cent is enough to be felt across a
 * fight and not enough to be a wall — a wrong-school build kills a golem slowly
 * rather than not at all.
 */
export const MAX_RESIST = 50;

/** A resistance profile: percent taken OFF incoming damage of that school.
 *  Negative is a vulnerability, which is the more interesting half. */
export type ResistProfile = Partial<Record<DamageSchool, number>>;

/** Clamped on every read rather than trusted from the table, so no hand-typed
 *  row can quietly author an immunity. */
export function resistOf(profile: ResistProfile | undefined, school: DamageSchool): number {
  const raw = profile?.[school] ?? 0;
  return Math.max(-MAX_RESIST, Math.min(MAX_RESIST, raw));
}

/** What a resistance does to a number. One function, so the damage the server
 *  deals and the figure the character sheet quotes cannot disagree. */
export function applyResist(damage: number, resistPercent: number): number {
  const clamped = Math.max(-MAX_RESIST, Math.min(MAX_RESIST, resistPercent));
  return Math.max(1, Math.round(damage * (1 - clamped / 100)));
}

export interface HitResult {
  hit: boolean;
  crit: boolean;
  damage: number;
  /** Which school landed, so the client can tint the number without being told
   *  separately. Absent means it did not land at all. */
  school?: DamageSchool;
  /** The defender's resistance to it, so "that did nothing" and "that hurt"
   *  are legible rather than inferred from a number the player cannot compare
   *  against anything. */
  resisted?: number;
}

/**
 * The one place a blow turns into a number.
 *
 * Order is load-bearing and worth stating: roll to hit, roll to crit, roll the
 * band, multiply by the crit, apply the school RESISTANCE, then subtract
 * armour. Resistance before armour because they answer different questions —
 * resistance is what the target is MADE of and scales with the size of the
 * blow, armour is a barrier in front of it and does not. Subtracting armour
 * first would make a resistance worth less against a heavily armoured thing
 * than a lightly armoured one, which is exactly backwards.
 *
 * Armour applies to every school rather than to physical alone. The tempting
 * alternative — armour stops physical, resistance stops the rest — gives
 * elemental damage a free pass through the one stat the whole game already
 * balances against, and would have made a dragon's breath unanswerable by
 * anything a player could wear.
 */
export function resolveHit(
  params: {
    attackerAccuracy: number;
    attackerMinHit: number;
    attackerMaxHit: number;
    attackerCritChance: number;
    attackerCritMultiplier: number;
    defenderEvasion: number;
    defenderArmor: number;
    /** What is landing. Defaulted rather than required, so a caller that has no
     *  opinion gets the school nothing in the world has an opinion about. */
    school?: DamageSchool;
    /** The defender's resistance to that school, as a percent. Passed in rather
     *  than looked up here: this function is a formula and knows no tables, so
     *  the same one resolves a player hitting a monster and a monster hitting a
     *  player without either direction being a special case. */
    defenderResist?: number;
  },
  random: () => number = Math.random,
): HitResult {
  const school = params.school ?? "physical";
  const hitChance = Math.max(5, Math.min(95, params.attackerAccuracy - params.defenderEvasion));
  if (random() * 100 > hitChance) return { hit: false, crit: false, damage: 0 };

  const crit = random() * 100 < params.attackerCritChance;
  let damage = params.attackerMinHit + random() * (params.attackerMaxHit - params.attackerMinHit);
  damage = Math.round(damage);
  if (crit) damage = Math.round(damage * params.attackerCritMultiplier);
  const resisted = Math.max(-MAX_RESIST, Math.min(MAX_RESIST, params.defenderResist ?? 0));
  damage = applyResist(damage, resisted);
  damage = Math.max(1, damage - params.defenderArmor);

  return { hit: true, crit, damage, school, resisted };
}

export function gatherDurationForLevel(level: number, agility = 0): number {
  return Math.max(
    GATHER_DURATION_FLOOR_MS,
    GATHER_DURATION_MS - level * GATHER_LEVEL_STEP_MS - agility * AGILITY_GATHER_STEP_MS,
  );
}

/**
 * What the next gather-speed level costs.
 *
 * Quadratic, not linear. It was `5 + level * 5` back when a node paid one, and
 * the moment the ground started paying two to twelve that curve fell behind the
 * thing it was meant to pace: level ten cost fifty-five wood, which is five
 * gathers at the outer rings. A cost that grows more slowly than the income it
 * is priced against is not a cost.
 */
export function gatherUpgradeCost(level: number): number {
  return 12 + level * level * 9;
}

// --- Richer ground further out ---------------------------------------------
// Every node gave exactly one, wherever it stood — so the one rule the world is
// laid out by, that walking further from the smithy IS the progression, was
// true of monsters and loot and not of the ground. A tree beside the anvil paid
// the same as a tree at the treeline.
//
// The rings are the monsters' own, so a player learns one geography rather than
// two: the ground gets richer exactly where it gets dangerous, and the reason a
// band-4 node is worth walking to is standing next to it.
export const RESOURCE_BAND_RADII = [800, 1200, 1600, 2100] as const;

/** Which of the five rings a point falls in, 1 (at the smithy) to 5. */
export function bandAt(x: number, y: number): 1 | 2 | 3 | 4 | 5 {
  const distance = Math.hypot(x - PLAYER_SPAWN.x, y - PLAYER_SPAWN.y);
  for (let i = 0; i < RESOURCE_BAND_RADII.length; i++) {
    if (distance < RESOURCE_BAND_RADII[i]) return (i + 1) as 1 | 2 | 3 | 4 | 5;
  }
  return 5;
}

/**
 * How much one gather yields.
 *
 * Superlinear in the band and linear in the upgrade, so the ground rewards
 * going somewhere and the upgrade rewards staying alive there — two different
 * axes rather than one number twice. The upgrade's contribution scales with the
 * band too, or it would be worth most in exactly the place it is easiest to
 * use.
 */
export function gatherYieldFor(band: 1 | 2 | 3 | 4 | 5, gatherLevel = 0): number {
  const base = [2, 3, 5, 8, 12][band - 1];
  return base + Math.floor((gatherLevel * band) / 2);
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
// bodies rather than one stacked silhouette. Bodies that are physically
// larger than this push apart by their own size instead (see `separationFor`).
export const MONSTER_SEPARATION_PX = 34;

// --- Bodies occupy space -------------------------------------------------
// Every creature is a circle on the ground. Until this existed you could walk
// into the middle of a troll and stand there, which made positioning — the
// thing reach and chase speed are supposed to be *about* — meaningless at
// contact range.
//
// The radii are the footprint of the model the client draws, not a separate
// gameplay number, so what you can see is what you collide with. They are
// deliberately smaller than every attack range in the game: a body you cannot
// reach past would make melee unplayable, so contact distance always leaves
// the shorter weapon room to land.
export const PLAYER_BODY_RADIUS_PX = 14;

/** How far apart two bodies must stay, centre to centre. */
export function separationFor(a: number, b: number): number {
  return a + b;
}

export interface BodyCircle {
  x: number;
  y: number;
  radiusPx: number;
}

/**
 * Pushes a point out of every body it is overlapping and returns where it
 * actually ends up. Resolution is by depenetration along the contact normal,
 * which means walking into a monster slides you around it rather than sticking
 * you to it — the same result real collision gives, without needing a solver.
 *
 * A few passes, because pushing out of one body can push you into another; the
 * loop settles in one or two iterations for any realistic pack and is capped so
 * a pathological pile-up cannot spin.
 *
 * Shared deliberately. The client runs it while you move, so collision feels
 * immediate, and the server runs it on the position the client reports, so a
 * client that skipped it gains nothing. Both sides using the same function is
 * the only reason those two answers agree.
 */
export function resolveBodyCollision(
  x: number,
  y: number,
  radiusPx: number,
  bodies: readonly BodyCircle[],
  passes = 3,
): { x: number; y: number } {
  let px = x;
  let py = y;
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (const body of bodies) {
      const minDistance = separationFor(radiusPx, body.radiusPx);
      let dx = px - body.x;
      let dy = py - body.y;
      let d = Math.hypot(dx, dy);
      if (d >= minDistance) continue;
      if (d < 0.0001) {
        // Dead centre: there is no contact normal to push along, so pick one.
        // Any fixed direction will do as long as it is not random — a random
        // one makes a stuck actor vibrate instead of stepping clear.
        dx = 1;
        dy = 0;
        d = 1;
      }
      px = body.x + (dx / d) * minDistance;
      py = body.y + (dy / d) * minDistance;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, y: py };
}

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
  /**
   * Which difficulty ring this kind belongs to, 1 (clearable at level 1) to 5
   * (the far corners).
   *
   * This was only ever a comment above the `MonsterKind` union, which meant the
   * one fact that decides where a monster is placed and how dangerous it is
   * could not be read by anything. Nameplates colour by it, so a player can see
   * what they are walking into before it is on top of them.
   */
  band: 1 | 2 | 3 | 4 | 5;
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
  // Ground footprint. Nothing may stand inside this, player or monster, so
  // it is what stops a fight collapsing to everyone occupying one pixel.
  // Sized to the model the client draws (see MONSTER_MODELS) so the hitbox
  // matches the silhouette, and always small enough that the shortest
  // weapon in the game still reaches past it — a body you cannot hit over
  // is not a body, it is a wall.
  bodyRadiusPx: number;
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
  /**
   * What hurts it, and what it shrugs off.
   *
   * At most one resistance and one vulnerability per kind, and both follow from
   * what the thing obviously IS — a cactoro is a plant, a troll regenerates
   * unless you burn it, a golem is a rock with lightning as its one seam. A
   * player who guesses from the name should be right, which is the same rule
   * the matched sets are written under.
   *
   * BAND 1 HAS NONE. The first ring is where a player learns that swinging
   * works at all, and a lesson about schools there would be a lesson nobody has
   * the vocabulary for yet.
   *
   * Never immunity — see `MAX_RESIST`. A wrong-school build kills a golem
   * slowly, never not at all, because the premise of this game is that you may
   * pick up anything and go anywhere.
   */
  resist?: ResistProfile;
  /**
   * What its own blows are made of. Physical unless the creature plainly is
   * not — which is what gives the player's elemental resistance something to
   * be for, and stops the whole system being a one-way conversation about
   * offence.
   */
  attackSchool?: DamageSchool;
}

export const MONSTER_STATS: Record<MonsterKind, MonsterStats> = {
  slime: {
    band: 1,
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
    bodyRadiusPx: 16,
    // Bursts on death: the weakest enemy still punishes standing in the
    // middle of a swarm and cleaving blindly.
    deathBurstRadiusPx: 70,
    deathBurstDamage: 6,
  },
  goblin: {
    band: 2,
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
    bodyRadiusPx: 16,
    // Shouts for help, so a careless pull brings the whole camp.
    alertRadiusPx: 210,
    // The first thing in the world with an opinion about schools, and it is a
    // small one: scrap armour turns a blade a little, and nothing else.
    resist: { physical: 15 },
  },
  // Fast and evasive rather than tanky — low HP and light hits, but its
  // own attack cadence is the quickest of any monster, and its evasion is
  // high for its tier. A "death by a thousand cuts" pack fight instead of
  // a slow tank-and-spank, contrasting with the troll's opposite profile.
  wolf: {
    band: 3,
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
    bodyRadiusPx: 18,
    // An animal. It has a thick coat and it is afraid of fire, and both of
    // those are older than any game.
    resist: { frost: 30, fire: -30 },
    // Closes the gap in one bound rather than grinding you down over a long
    // chase, which is what makes it the enemy you need an escape tool for.
    leapRangePx: 230,
    leapSpeedMultiplier: 3.4,
    leapDurationMs: 420,
    leapCooldownMs: 7000,
  },
  troll: {
    band: 4,
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
    bodyRadiusPx: 26,
    // Slow enough to outrun, hits a wide area for far more than its normal
    // swing, and gives you 900ms to get out — so the fight is about reading it,
    // not out-healing it.
    windupMs: 900,
    slamRadiusPx: 120,
    slamDamageMultiplier: 1.7,
    // Hide like bark and it knits itself back together — unless you burn it,
    // which is the one thing everyone has always known about trolls.
    resist: { physical: 25, nature: 25, fire: -45 },
  },

  // ---------------------------------------------------------------- band 1
  // Slower and meatier than a slime but with no trick at all — the kind you
  // learn the attack rhythm on.
  mushnub: {
    band: 1,
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
    bodyRadiusPx: 16,
  },

  // ---------------------------------------------------------------- band 2
  // The slime's lesson taken seriously: a much bigger death burst, so clearing
  // a cluster with AoE while standing in it genuinely hurts.
  spikyblob: {
    band: 2,
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
    bodyRadiusPx: 18,
    deathBurstRadiusPx: 110,
    deathBurstDamage: 13,
    // Spines. They break off in you and they do not burn well.
    resist: { physical: 20, fire: -25 },
  },
  // Faster than the player and it leaps, but folds immediately once caught.
  // The answer is Frost Nova or a wall, not out-running it.
  armabee: {
    band: 2,
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
    bodyRadiusPx: 16,
    leapRangePx: 250,
    leapSpeedMultiplier: 3.2,
    leapDurationMs: 380,
    leapCooldownMs: 6000,
    // It lives on the wing, so cold is what takes the wing away — and it never
    // touches the ground, which is the one thing a bolt of lightning needs.
    // Thin chitin under all of it: landing a blow is the hard part, not making
    // one count.
    resist: { nature: 25, lightning: 30, frost: -30, physical: -20 },
  },

  // ---------------------------------------------------------------- band 3
  // Armoured enough that low hit-bands scrape off it, and it bursts on death.
  cactoro: {
    band: 3,
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
    bodyRadiusPx: 20,
    deathBurstRadiusPx: 90,
    deathBurstDamage: 10,
    // A plant, which is the whole of it: poison is water to it, fire ends it,
    // and a blade is the thing you have always used on a plant.
    resist: { nature: 45, fire: -45, physical: -25 },
    attackSchool: "nature",
  },
  // The goblin's shout, with a much wider radius and a body behind it. Pulling
  // one carelessly brings a camp that can actually kill you.
  orcbrute: {
    band: 3,
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
    bodyRadiusPx: 22,
    alertRadiusPx: 300,
    // Real armour this time. And a body that size is a great deal of blood for
    // something to travel, which is what a coated blade is for.
    resist: { physical: 25, nature: -30 },
  },

  // ---------------------------------------------------------------- band 4
  // Answers accuracy rather than damage: 38 evasion means a low-Agility build
  // simply cannot land on it, whatever its gear says.
  ghost: {
    band: 4,
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
    bodyRadiusPx: 16,
    // Barely there, so a blade passes through most of it — the oldest rule in
    // the genre, and the reason a caster has a job. Kept to 30 rather than the
    // cap because it already answers accuracy with 38 evasion, and a kind that
    // punishes two builds at once is a kind two builds walk around.
    resist: { physical: 30, arcane: -40 },
    attackSchool: "arcane",
  },
  // The troll's damage without the tell — fast, hard-hitting and it crits.
  demon: {
    band: 4,
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
    bodyRadiusPx: 26,
    // It is made of the fire it throws, and cold is the opposite of it. Spells
    // slide off a thing that is itself a spell.
    resist: { fire: 50, arcane: 30, frost: -35 },
    attackSchool: "fire",
  },

  // ---------------------------------------------------------------- band 5
  // Armour 14 is the point: it subtracts from every hit, so chip damage does
  // nothing and you need a real weapon rather than a fast one.
  golem: {
    band: 5,
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
    bodyRadiusPx: 28,
    windupMs: 1100,
    slamRadiusPx: 140,
    slamDamageMultiplier: 1.8,
    // Stone: it does not care about blades and it does not care about heat.
    // Lightning is the seam, and it is the only creature in the world that
    // gives Chain Lightning a reason to exist.
    resist: { physical: 30, fire: 30, lightning: -45 },
  },
  // The apex: it telegraphs AND closes the gap, so neither standing still nor
  // running is a whole answer on its own.
  dragon: {
    band: 5,
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
    bodyRadiusPx: 32,
    windupMs: 950,
    slamRadiusPx: 165,
    slamDamageMultiplier: 1.9,
    leapRangePx: 320,
    leapSpeedMultiplier: 2.8,
    leapDurationMs: 500,
    leapCooldownMs: 9000,
    // The apex resists what it breathes and folds to the opposite of it, so the
    // hardest thing in the world still has an answer you can go and find.
    resist: { fire: 50, physical: 15, frost: -30 },
    attackSchool: "fire",
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
  // Unarmed
  | "haymaker" | "roar" | "gutpunch"
  // Sword / axe / mace
  | "cleave" | "charge" | "warcry" | "shieldwall" | "earthshatter"
  | "riposte" | "rend" | "reckless" | "shockwave" | "concuss"
  // Dagger / bow
  | "powershot" | "multishot" | "poisonarrow" | "disengage" | "rainofarrows"
  | "backstab" | "flurry"
  // Staff / wand
  | "arcanebolt" | "firebolt" | "frostnova" | "mend" | "chainlightning"
  | "frostbolt" | "arcanemissiles";

// A skill is something you press. Passive bonuses live in the talent trees
// now, which is why "passive" is no longer one of these.
export type SkillKind = "damage" | "heal" | "control" | "buff" | "mobility";

// What a passive contributes once unlocked. Kept as a flat bag of optional
// modifiers so the server can total them in one pass without knowing which
// skill supplied what.
/**
 * Every knob a talent is allowed to turn.
 *
 * Deliberately a fixed vocabulary rather than arbitrary code per node. Ninety
 * nodes across eight trees is only maintainable if a node is *data* — a name,
 * a rank and a bag of these — so the trees can be rebalanced by editing
 * numbers instead of by editing behaviour. Everything here is summed across
 * unlocked nodes by `talentPassives` and threaded into the shared formulas, so
 * the client's stat sheet and the server's combat resolution read the same
 * totals from the same place.
 */
export interface PassiveBonus {
  armor?: number;
  critChance?: number;
  maxManaBonus?: number;
  manaRegenBonus?: number;
  moveSpeedBonus?: number;
  healOnKill?: number;
  evasion?: number;
  // Added with the talent trees. Percentages are whole numbers: 10 means +10%.
  maxHpBonus?: number;
  accuracyBonus?: number;
  damagePercent?: number;
  attackSpeedPercent?: number;
  critDamagePercent?: number;
  rangePercent?: number;
  skillPowerPercent?: number;
  /** Reduces mana costs. */
  manaCostPercent?: number;
  /** Reduces skill cooldowns. */
  cooldownPercent?: number;
  // --- Elemental resistance, one key per element.
  //
  // Five keys rather than a nested bag, because THIS vocabulary is the reason
  // affixes, matched sets and talents all reach combat without any of them
  // knowing the others exist — `addPassives` sums a flat record and every
  // consumer reads a flat record. A nested `resist: {...}` would be the one
  // member of this interface that needed its own adder, its own label rule and
  // its own line in every place that totals one of these.
  //
  // No physical key on purpose: armour is the physical answer and has been
  // since Phase 14. Two stats doing one job is how a number becomes impossible
  // to tune.
  resistFire?: number;
  resistFrost?: number;
  resistNature?: number;
  resistArcane?: number;
  resistLightning?: number;
}

/**
 * Which `PassiveBonus` key carries each element's resistance.
 *
 * Written once here so nothing else ever spells one of those key names out. A
 * hand-written `"resist" + capitalise(school)` in four panels is four places a
 * sixth element has to be remembered in, and the failure is silent: a missing
 * case reads as zero resistance rather than as an error.
 */
export const RESIST_KEY: Record<ElementalSchool, keyof PassiveBonus> = {
  fire: "resistFire",
  frost: "resistFrost",
  nature: "resistNature",
  arcane: "resistArcane",
  lightning: "resistLightning",
};

/** What a player's totalled passives resist a given school by. Physical is
 *  always zero — see the note on `RESIST_KEY`'s neighbours above. */
export function passiveResist(passives: PassiveBonus, school: DamageSchool): number {
  if (school === "physical") return 0;
  const key = RESIST_KEY[school as ElementalSchool];
  return Math.max(-MAX_RESIST, Math.min(MAX_RESIST, passives[key] ?? 0));
}

export const EMPTY_PASSIVES: Required<PassiveBonus> = {
  armor: 0, critChance: 0, maxManaBonus: 0, manaRegenBonus: 0, moveSpeedBonus: 0,
  healOnKill: 0, evasion: 0, maxHpBonus: 0, accuracyBonus: 0, damagePercent: 0,
  attackSpeedPercent: 0, critDamagePercent: 0, rangePercent: 0, skillPowerPercent: 0,
  manaCostPercent: 0, cooldownPercent: 0,
  resistFire: 0, resistFrost: 0, resistNature: 0, resistArcane: 0, resistLightning: 0,
};

export function addPassives(
  into: Required<PassiveBonus>,
  from: PassiveBonus,
  times = 1,
): Required<PassiveBonus> {
  for (const key of Object.keys(into) as (keyof PassiveBonus)[]) {
    into[key] += (from[key] ?? 0) * times;
  }
  return into;
}

export interface SkillDef {
  id: SkillId;
  name: string;
  icon: string;
  kind: SkillKind;
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
  /**
   * What this skill's damage is made of. Absent means physical.
   *
   * Declared rather than derived from `effect`, even though the two agree for
   * most of the table. `effect` names a ROW OF THE SPRITE ATLAS — it is how the
   * skill looks — and quietly making it decide damage would mean a school could
   * never be changed without changing the art, and choosing art could change
   * the balance. Two of these disagree on purpose: Rend and Backstab draw blood
   * with a `slash` sprite and are physical, and Earthshatter uses `quake` and is
   * physical too.
   */
  school?: DamageSchool;
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
    id: "haymaker", name: "Haymaker", icon: "haymaker", kind: "damage",
    manaCost: 0, cooldownMs: 6000, rangePx: 58, radiusPx: 0, power: 5,
    effect: "impact", sfx: "hit",
    description: "A wild swing. Free, because you have nothing better.",
  },
  // ---------------------------------------------------------------- warrior
  cleave: {
    id: "cleave", name: "Cleave", icon: "cleave", kind: "damage",
    manaCost: 8, cooldownMs: 5000, rangePx: 0, radiusPx: 95, power: 7,
    effect: "slash", sfx: "crit", description: "Sweep every enemy around you.",
  },
  charge: {
    id: "charge", name: "Charge", icon: "charge", kind: "mobility",
    manaCost: 10, cooldownMs: 6000, rangePx: 0, radiusPx: 0, power: 180,
    effect: "quake", sfx: "swing", description: "Barrel forward, closing the gap.",
  },
  warcry: {
    id: "warcry", name: "War Cry", icon: "warcry", kind: "buff",
    manaCost: 14, cooldownMs: 18000, rangePx: 260, radiusPx: 0, power: 0,
    effect: "buff", sfx: "levelup", description: "Strike harder for a while. Targets an ally if you have one selected.",
  },
  shieldwall: {
    id: "shieldwall", name: "Shield Wall", icon: "shieldwall", kind: "buff",
    manaCost: 16, cooldownMs: 22000, rangePx: 0, radiusPx: 0, power: 0,
    effect: "shield", sfx: "hit", description: "Brace. Halves incoming damage briefly.",
    selfShieldMs: true,
  },
  earthshatter: {
    id: "earthshatter", name: "Earthshatter", icon: "earthshatter", kind: "damage",
    manaCost: 26, cooldownMs: 14000, rangePx: 0, radiusPx: 150, power: 20,
    effect: "quake", sfx: "die", description: "Split the ground. Heavy damage all around you.",
  },

  // ----------------------------------------------------------------- ranger
  powershot: {
    id: "powershot", name: "Power Shot", icon: "powershot", kind: "damage",
    manaCost: 8, cooldownMs: 4000, rangePx: 340, radiusPx: 0, power: 12,
    effect: "arrow", sfx: "swing", description: "A single heavy arrow at long range.",
  },
  multishot: {
    id: "multishot", name: "Multishot", icon: "multishot", kind: "damage",
    manaCost: 14, cooldownMs: 7000, rangePx: 300, radiusPx: 0, power: 9,
    effect: "arrow", sfx: "swing", description: "Loose at three enemies at once.",
    chainTargets: 3,
  },
  poisonarrow: {
    id: "poisonarrow", name: "Poison Arrow", icon: "poisonarrow", kind: "control",
    manaCost: 12, cooldownMs: 9000, rangePx: 320, radiusPx: 0, power: 8,
    effect: "poison", sfx: "cast", school: "nature",
    description: "A venomous shot that slows what it hits.",
    appliesSlow: true,
  },
  disengage: {
    id: "disengage", name: "Disengage", icon: "disengage", kind: "mobility",
    manaCost: 10, cooldownMs: 5000, rangePx: 0, radiusPx: 0, power: 200,
    effect: "buff", sfx: "swing", description: "Leap clear, away from whatever is closest.",
  },
  rainofarrows: {
    id: "rainofarrows", name: "Rain of Arrows", icon: "rainofarrows", kind: "damage",
    manaCost: 28, cooldownMs: 15000, rangePx: 320, radiusPx: 130, power: 16,
    effect: "arrow", sfx: "crit", description: "Blanket the ground around your target.",
  },

  // ------------------------------------------------------------------- mage
  arcanebolt: {
    id: "arcanebolt", name: "Arcane Bolt", icon: "arcanebolt", kind: "damage",
    manaCost: 6, cooldownMs: 2500, rangePx: 300, radiusPx: 0, power: 10,
    effect: "arcane", sfx: "cast", school: "arcane",
    description: "A quick bolt of raw magic.",
  },
  firebolt: {
    id: "firebolt", name: "Firebolt", icon: "firebolt", kind: "damage",
    manaCost: 14, cooldownMs: 5000, rangePx: 320, radiusPx: 70, power: 15,
    effect: "fire", sfx: "cast", school: "fire",
    description: "Hurl fire that bursts on impact.",
  },
  frostnova: {
    id: "frostnova", name: "Frost Nova", icon: "frostnova", kind: "control",
    manaCost: 18, cooldownMs: 11000, rangePx: 0, radiusPx: 150, power: 6,
    effect: "frost", sfx: "cast", school: "frost",
    description: "Chill everything nearby, slowing it so you can break away.",
    appliesSlow: true,
  },
  mend: {
    id: "mend", name: "Mend", icon: "mend", kind: "heal",
    manaCost: 20, cooldownMs: 12000, rangePx: 260, radiusPx: 0, power: 30,
    effect: "heal", sfx: "heal", description: "Close wounds. Targets an ally if you have one selected.",
  },
  chainlightning: {
    id: "chainlightning", name: "Chain Lightning", icon: "chainlightning", kind: "damage",
    manaCost: 30, cooldownMs: 13000, rangePx: 320, radiusPx: 0, power: 18,
    effect: "lightning", sfx: "crit", school: "lightning",
    description: "Arcs from target to target, up to four.",
    chainTargets: 4,
  },
  // --- Added with the talent trees, so two weapons of one archetype play
  // --- differently instead of sharing a single spell list.
  roar: {
    id: "roar", name: "Roar", icon: "roar", kind: "buff",
    manaCost: 0, cooldownMs: 16000, rangePx: 0, radiusPx: 0, power: 0,
    effect: "buff", sfx: "levelup", description: "Nothing but nerve. Hit harder for a while.",
  },
  gutpunch: {
    id: "gutpunch", name: "Gut Punch", icon: "gutpunch", kind: "control",
    manaCost: 4, cooldownMs: 8000, rangePx: 58, radiusPx: 0, power: 6,
    effect: "impact", sfx: "hit", description: "Wind it. Whatever you hit moves slower.",
    appliesSlow: true,
  },
  riposte: {
    id: "riposte", name: "Riposte", icon: "riposte", kind: "buff",
    manaCost: 10, cooldownMs: 15000, rangePx: 0, radiusPx: 0, power: 0,
    effect: "slash", sfx: "crit", description: "Read the swing and answer it. Strike harder briefly.",
  },
  rend: {
    id: "rend", name: "Rend", icon: "rend", kind: "control",
    manaCost: 12, cooldownMs: 9000, rangePx: 64, radiusPx: 0, power: 16,
    effect: "slash", sfx: "crit", description: "A deep cut. It labours afterwards.",
    appliesSlow: true,
  },
  reckless: {
    id: "reckless", name: "Reckless Swing", icon: "reckless", kind: "buff",
    manaCost: 12, cooldownMs: 20000, rangePx: 0, radiusPx: 0, power: 0,
    effect: "quake", sfx: "levelup", description: "Abandon the guard. Everything lands harder for a while.",
  },
  shockwave: {
    id: "shockwave", name: "Shockwave", icon: "shockwave", kind: "damage",
    manaCost: 14, cooldownMs: 8000, rangePx: 0, radiusPx: 120, power: 11,
    effect: "quake", sfx: "crit", description: "Slam the ground. Everything close feels it.",
  },
  concuss: {
    id: "concuss", name: "Concuss", icon: "concuss", kind: "control",
    manaCost: 10, cooldownMs: 10000, rangePx: 62, radiusPx: 0, power: 9,
    effect: "impact", sfx: "hit", description: "A blow to the head. It staggers away slowed.",
    appliesSlow: true,
  },
  backstab: {
    id: "backstab", name: "Backstab", icon: "backstab", kind: "damage",
    manaCost: 10, cooldownMs: 6000, rangePx: 62, radiusPx: 0, power: 20,
    effect: "slash", sfx: "crit", description: "One precise thrust where it counts.",
  },
  flurry: {
    id: "flurry", name: "Flurry", icon: "flurry", kind: "damage",
    manaCost: 12, cooldownMs: 7000, rangePx: 66, radiusPx: 0, power: 7,
    effect: "slash", sfx: "swing", description: "A blur of short strikes across three enemies.",
    chainTargets: 3,
  },
  frostbolt: {
    id: "frostbolt", name: "Frostbolt", icon: "frostbolt", kind: "control",
    manaCost: 10, cooldownMs: 4500, rangePx: 260, radiusPx: 0, power: 11,
    effect: "frost", sfx: "cast", school: "frost",
    description: "A shard of cold. What it hits slows.",
    appliesSlow: true,
  },
  arcanemissiles: {
    id: "arcanemissiles", name: "Arcane Missiles", icon: "arcanemissiles", kind: "damage",
    manaCost: 16, cooldownMs: 8000, rangePx: 240, radiusPx: 0, power: 9,
    effect: "arcane", sfx: "cast", school: "arcane",
    description: "Three darts, each seeking its own target.",
    chainTargets: 3,
  },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

// --- Talent trees -----------------------------------------------------------
// One tree per weapon family, and the tree is what decides which skills you
// have. Nothing unlocks itself: weapon levels hand you points, and you spend
// them where you want.
//
// Why per weapon and not per class: three warrior weapons sharing one spell
// list made an axe a sword with different numbers. A tree each is what lets an
// axe be about heavy single blows and a mace about control and armour, while
// both remain "a warrior" because the weapon still decides the archetype.
//
// A node is DATA — a name, a rank cap, and a bag of `PassiveBonus` or a single
// `SkillId`. Roughly eighty nodes only stays maintainable if rebalancing means
// editing numbers rather than editing behaviour, which is also why actives are
// one rank: "do I have this skill" is a clean question, and making every skill
// separately rankable would put a scaling rule in eighty places.
export type TalentId = string;

/** Weapon level required to reach each tier of a tree. */
export const TALENT_TIER_LEVELS = [1, 3, 6, 10, 15];

export interface TalentNode {
  id: TalentId;
  weapon: WeaponType;
  name: string;
  icon: string;
  description: string;
  /** Row in the tree; gated by TALENT_TIER_LEVELS[tier]. */
  tier: number;
  maxRank: number;
  /** Another node in the same tree that needs at least one rank first. */
  requires?: TalentId;
  /** Granted at rank 1. Actives are always maxRank 1. */
  active?: SkillId;
  /** Applied once per rank. */
  passive?: PassiveBonus;
}

/** Node id to rank, for one weapon. */
export type TalentRanks = Record<TalentId, number>;

function t(
  weapon: WeaponType,
  key: string,
  tier: number,
  name: string,
  icon: string,
  maxRank: number,
  description: string,
  extra: { active?: SkillId; passive?: PassiveBonus; requires?: string } = {},
): TalentNode {
  return {
    id: `${weapon}.${key}`,
    weapon,
    tier,
    name,
    icon,
    maxRank,
    description,
    active: extra.active,
    passive: extra.passive,
    requires: extra.requires ? `${weapon}.${extra.requires}` : undefined,
  };
}

export const WEAPON_TREES: Record<WeaponType, TalentNode[]> = {
  // Bare hands: no damage to speak of, so the tree is about staying alive and
  // getting somewhere better.
  fist: [
    t("fist", "grit", 0, "Grit", "grit", 5, "+8 maximum health per rank.", { passive: { maxHpBonus: 8 } }),
    t("fist", "haymaker", 0, "Haymaker", "haymaker", 1, "Unlocks Haymaker.", { active: "haymaker" }),
    t("fist", "footwork", 1, "Footwork", "footwork", 5, "+3 evasion and +10 movement per rank.", { passive: { evasion: 3, moveSpeedBonus: 10 } }),
    t("fist", "roar", 1, "Roar", "roar", 1, "Unlocks Roar.", { active: "roar" }),
    t("fist", "calloused", 2, "Calloused", "calloused", 5, "+5% damage per rank.", { passive: { damagePercent: 5 } }),
    t("fist", "gutpunch", 2, "Gut Punch", "gutpunch", 1, "Unlocks Gut Punch.", { active: "gutpunch", requires: "haymaker" }),
    t("fist", "quickhands", 3, "Quick Hands", "quickhands", 5, "+6% attack speed per rank.", { passive: { attackSpeedPercent: 6 } }),
    t("fist", "secondwind", 3, "Second Wind", "secondwind", 4, "Recover 4 health per rank on a killing blow.", { passive: { healOnKill: 4 } }),
    t("fist", "unbowed", 4, "Unbowed", "unbowed", 4, "+3 armour and +3 evasion per rank.", { passive: { armor: 3, evasion: 3 } }),
  ],

  // Sword: the baseline every other weapon is tuned against - accurate, even,
  // and the only warrior tree with no glaring weakness.
  sword: [
    t("sword", "edge", 0, "Keen Edge", "edge", 6, "+4% damage per rank.", { passive: { damagePercent: 4 } }),
    t("sword", "cleave", 0, "Cleave", "cleave", 1, "Unlocks Cleave.", { active: "cleave" }),
    t("sword", "temper", 1, "Tempered", "temper", 5, "+2 armour and +6 health per rank.", { passive: { armor: 2, maxHpBonus: 6 } }),
    t("sword", "precision", 1, "Precision", "precision", 5, "+3% critical chance and +3 accuracy per rank.", { passive: { critChance: 3, accuracyBonus: 3 } }),
    t("sword", "charge", 2, "Charge", "charge", 1, "Unlocks Charge.", { active: "charge" }),
    t("sword", "riposte", 2, "Riposte", "riposte", 1, "Unlocks Riposte.", { active: "riposte", requires: "precision" }),
    t("sword", "momentum", 3, "Momentum", "momentum", 5, "+5% attack speed per rank.", { passive: { attackSpeedPercent: 5 } }),
    t("sword", "warcry", 3, "War Cry", "warcry", 1, "Unlocks War Cry.", { active: "warcry" }),
    t("sword", "mastery", 4, "Swordmaster", "mastery", 4, "+6% damage and +10% critical damage per rank.", { passive: { damagePercent: 6, critDamagePercent: 10 } }),
  ],

  // Axe: the heavy hitter. Slow swings, so everything here is about making the
  // ones that land count.
  axe: [
    t("axe", "heft", 0, "Heft", "heft", 6, "+6% damage per rank.", { passive: { damagePercent: 6 } }),
    t("axe", "rend", 0, "Rend", "rend", 1, "Unlocks Rend.", { active: "rend" }),
    t("axe", "brutality", 1, "Brutality", "brutality", 5, "+12% critical damage per rank.", { passive: { critDamagePercent: 12 } }),
    t("axe", "thickskin", 1, "Thick Skin", "thickskin", 5, "+3 armour per rank.", { passive: { armor: 3 } }),
    t("axe", "charge", 2, "Charge", "charge", 1, "Unlocks Charge.", { active: "charge" }),
    t("axe", "reckless", 2, "Reckless Swing", "reckless", 1, "Unlocks Reckless Swing.", { active: "reckless", requires: "brutality" }),
    t("axe", "sweeping", 3, "Sweeping Arc", "sweeping", 4, "+5% reach and +4% damage per rank.", { passive: { rangePercent: 5, damagePercent: 4 } }),
    t("axe", "bloodthirst", 3, "Bloodthirst", "bloodthirst", 5, "Recover 5 health per rank on a killing blow.", { passive: { healOnKill: 5 } }),
    t("axe", "earthshatter", 4, "Earthshatter", "earthshatter", 1, "Unlocks Earthshatter.", { active: "earthshatter", requires: "heft" }),
  ],

  // Mace: control and staying power. The warrior tree that wants the fight to
  // last, rather than to end early.
  mace: [
    t("mace", "weight", 0, "Dead Weight", "weight", 6, "+5% damage per rank.", { passive: { damagePercent: 5 } }),
    t("mace", "concuss", 0, "Concuss", "concuss", 1, "Unlocks Concuss.", { active: "concuss" }),
    t("mace", "bulwark", 1, "Bulwark", "bulwark", 5, "+4 armour per rank.", { passive: { armor: 4 } }),
    t("mace", "stoneskin", 1, "Stoneskin", "stoneskin", 5, "+10 maximum health per rank.", { passive: { maxHpBonus: 10 } }),
    t("mace", "shockwave", 2, "Shockwave", "shockwave", 1, "Unlocks Shockwave.", { active: "shockwave" }),
    t("mace", "shieldwall", 2, "Shield Wall", "shieldwall", 1, "Unlocks Shield Wall.", { active: "shieldwall", requires: "bulwark" }),
    t("mace", "relentless", 3, "Relentless", "relentless", 5, "+4% attack speed and +3 accuracy per rank.", { passive: { attackSpeedPercent: 4, accuracyBonus: 3 } }),
    t("mace", "warcry", 3, "War Cry", "warcry", 1, "Unlocks War Cry.", { active: "warcry" }),
    t("mace", "crusher", 4, "Crusher", "crusher", 4, "+8% damage and +10% critical damage per rank.", { passive: { damagePercent: 8, critDamagePercent: 10 } }),
  ],

  // Dagger: the ranger's close-quarters half. Fast, fragile, and entirely about
  // critical hits.
  dagger: [
    t("dagger", "quick", 0, "Quickened", "quick", 6, "+6% attack speed per rank.", { passive: { attackSpeedPercent: 6 } }),
    t("dagger", "backstab", 0, "Backstab", "backstab", 1, "Unlocks Backstab.", { active: "backstab" }),
    t("dagger", "deadly", 1, "Deadly Aim", "deadly", 6, "+4% critical chance per rank.", { passive: { critChance: 4 } }),
    t("dagger", "slippery", 1, "Slippery", "slippery", 5, "+4 evasion and +12 movement per rank.", { passive: { evasion: 4, moveSpeedBonus: 12 } }),
    t("dagger", "flurry", 2, "Flurry", "flurry", 1, "Unlocks Flurry.", { active: "flurry" }),
    t("dagger", "venom", 2, "Envenom", "venom", 1, "Unlocks Poison Arrow - a coated blade works as well.", { active: "poisonarrow", requires: "deadly" }),
    t("dagger", "opportunist", 3, "Opportunist", "opportunist", 5, "+12% critical damage per rank.", { passive: { critDamagePercent: 12 } }),
    t("dagger", "disengage", 3, "Disengage", "disengage", 1, "Unlocks Disengage.", { active: "disengage" }),
    t("dagger", "assassin", 4, "Assassin", "assassin", 4, "+7% damage and +4% critical chance per rank.", { passive: { damagePercent: 7, critChance: 4 } }),
  ],

  // Bow: reach. Everything here is about landing the shot before the gap closes.
  bow: [
    t("bow", "draw", 0, "Strong Draw", "draw", 6, "+5% damage per rank.", { passive: { damagePercent: 5 } }),
    t("bow", "powershot", 0, "Power Shot", "powershot", 1, "Unlocks Power Shot.", { active: "powershot" }),
    t("bow", "eagleeye", 1, "Eagle Eye", "eagleeye", 5, "+4% critical chance and +4 accuracy per rank.", { passive: { critChance: 4, accuracyBonus: 4 } }),
    t("bow", "longbow", 1, "Longbow", "longbow", 5, "+8% reach per rank.", { passive: { rangePercent: 8 } }),
    t("bow", "multishot", 2, "Multishot", "multishot", 1, "Unlocks Multishot.", { active: "multishot" }),
    t("bow", "venomtip", 2, "Venom Tip", "venomtip", 1, "Unlocks Poison Arrow.", { active: "poisonarrow" }),
    t("bow", "fleet", 3, "Fleet Footed", "fleet", 5, "+14 movement and +3 evasion per rank.", { passive: { moveSpeedBonus: 14, evasion: 3 } }),
    t("bow", "disengage", 3, "Disengage", "disengage", 1, "Unlocks Disengage.", { active: "disengage" }),
    t("bow", "marksman", 4, "Marksman", "marksman", 4, "+14% critical damage per rank.", { passive: { critDamagePercent: 14 } }),
    t("bow", "rainofarrows", 4, "Rain of Arrows", "rainofarrows", 1, "Unlocks Rain of Arrows.", { active: "rainofarrows", requires: "multishot" }),
  ],

  // Staff: the mage's two-handed option - the biggest numbers and the deepest
  // mana pool, at the cost of everything else.
  staff: [
    t("staff", "focus", 0, "Focus", "focus", 6, "+6% skill power per rank.", { passive: { skillPowerPercent: 6 } }),
    t("staff", "arcanebolt", 0, "Arcane Bolt", "arcanebolt", 1, "Unlocks Arcane Bolt.", { active: "arcanebolt" }),
    t("staff", "wellspring", 1, "Wellspring", "wellspring", 5, "+25 maximum mana and +2 mana regeneration per rank.", { passive: { maxManaBonus: 25, manaRegenBonus: 2 } }),
    t("staff", "conduit", 1, "Conduit", "conduit", 5, "+5% damage per rank.", { passive: { damagePercent: 5 } }),
    t("staff", "firebolt", 2, "Firebolt", "firebolt", 1, "Unlocks Firebolt.", { active: "firebolt" }),
    t("staff", "mend", 2, "Mend", "mend", 1, "Unlocks Mend.", { active: "mend" }),
    t("staff", "efficiency", 3, "Efficiency", "efficiency", 5, "Spells cost 10% less mana per rank.", { passive: { manaCostPercent: 10 } }),
    t("staff", "chainlightning", 3, "Chain Lightning", "chainlightning", 1, "Unlocks Chain Lightning.", { active: "chainlightning", requires: "firebolt" }),
    t("staff", "archmage", 4, "Archmage", "archmage", 4, "+10% skill power and +4% critical chance per rank.", { passive: { skillPowerPercent: 10, critChance: 4 } }),
  ],

  // Wand: the mage's sidearm. Smaller numbers, far shorter cooldowns, and the
  // only caster tree that expects to be moving.
  wand: [
    t("wand", "quickcast", 0, "Quickcast", "quickcast", 6, "Cooldowns 6% shorter per rank.", { passive: { cooldownPercent: 6 } }),
    t("wand", "frostbolt", 0, "Frostbolt", "frostbolt", 1, "Unlocks Frostbolt.", { active: "frostbolt" }),
    t("wand", "attunement", 1, "Attunement", "attunement", 5, "+18 maximum mana and +4% skill power per rank.", { passive: { maxManaBonus: 18, skillPowerPercent: 4 } }),
    t("wand", "warding", 1, "Warding", "warding", 5, "+2 armour and +3 evasion per rank.", { passive: { armor: 2, evasion: 3 } }),
    t("wand", "missiles", 2, "Arcane Missiles", "arcanemissiles", 1, "Unlocks Arcane Missiles.", { active: "arcanemissiles" }),
    t("wand", "frostnova", 2, "Frost Nova", "frostnova", 1, "Unlocks Frost Nova.", { active: "frostnova", requires: "frostbolt" }),
    t("wand", "rapid", 3, "Rapid Channel", "rapid", 5, "+7% attack speed per rank.", { passive: { attackSpeedPercent: 7 } }),
    t("wand", "mend", 3, "Mend", "mend", 1, "Unlocks Mend.", { active: "mend" }),
    t("wand", "spellblade", 4, "Spellblade", "spellblade", 4, "+6% damage and +8% skill power per rank.", { passive: { damagePercent: 6, skillPowerPercent: 8 } }),
  ],
};

const TALENTS_BY_ID = new Map<TalentId, TalentNode>();
for (const nodes of Object.values(WEAPON_TREES)) {
  for (const node of nodes) TALENTS_BY_ID.set(node.id, node);
}

export function talentNode(id: TalentId): TalentNode | undefined {
  return TALENTS_BY_ID.get(id);
}

export function talentTree(weapon: WeaponType | undefined | null): TalentNode[] {
  return WEAPON_TREES[weapon ?? "fist"] ?? WEAPON_TREES.fist;
}

/** Points already committed in one weapon's tree. */
export function spentTalentPoints(weapon: WeaponType | undefined, ranks: TalentRanks): number {
  let spent = 0;
  for (const node of talentTree(weapon)) spent += Math.min(node.maxRank, ranks[node.id] ?? 0);
  return spent;
}

/**
 * Whether one more rank may be bought right now, and if not, why.
 *
 * Shared so the button the client greys out and the check the server enforces
 * are the same rule: the client cannot offer a purchase the server will refuse,
 * and a hand-written message cannot buy one the client would have hidden.
 */
export function canLearnTalent(
  weapon: WeaponType | undefined,
  ranks: TalentRanks,
  nodeId: TalentId,
  weaponLevel: number,
): { ok: boolean; reason?: string } {
  const node = talentNode(nodeId);
  if (!node || node.weapon !== (weapon ?? "fist")) {
    return { ok: false, reason: "not a talent of that weapon" };
  }
  const rank = ranks[nodeId] ?? 0;
  if (rank >= node.maxRank) return { ok: false, reason: "already at full rank" };

  const tierLevel = TALENT_TIER_LEVELS[node.tier] ?? 1;
  if (weaponLevel < tierLevel) return { ok: false, reason: `needs weapon level ${tierLevel}` };

  if (node.requires && (ranks[node.requires] ?? 0) < 1) {
    const prereq = talentNode(node.requires);
    return { ok: false, reason: `needs ${prereq?.name ?? "an earlier talent"} first` };
  }

  const available = talentPointsAtLevel(weaponLevel) - spentTalentPoints(weapon, ranks);
  if (available < 1) return { ok: false, reason: "no talent points" };
  return { ok: true };
}

/** Every passive bonus the learned talents add up to, for this weapon only. */
export function talentPassives(
  weapon: WeaponType | undefined,
  ranks: TalentRanks,
): Required<PassiveBonus> {
  const total = { ...EMPTY_PASSIVES };
  for (const node of talentTree(weapon)) {
    const rank = Math.min(node.maxRank, ranks[node.id] ?? 0);
    if (rank < 1 || !node.passive) continue;
    addPassives(total, node.passive, rank);
  }
  return total;
}

/** The skills this weapon's learned talents have granted, in tree order. */
export function unlockedActives(weapon: WeaponType | undefined, ranks: TalentRanks): SkillDef[] {
  const out: SkillDef[] = [];
  for (const node of talentTree(weapon)) {
    if (!node.active || (ranks[node.id] ?? 0) < 1) continue;
    const skill = SKILLS[node.active];
    if (skill && !out.includes(skill)) out.push(skill);
  }
  return out;
}

/** Whether a skill is currently available. The server's authority on "may you
 *  cast this", replacing the old class-and-level check. */
export function hasActive(
  weapon: WeaponType | undefined,
  ranks: TalentRanks,
  skillId: SkillId,
): boolean {
  return unlockedActives(weapon, ranks).some((s) => s.id === skillId);
}

// Skills scale off the class's primary attribute, so gear and stat choices
// carry over rather than being a separate power curve, and level is in there
// too — without it the hotbar quietly falls behind as auto-attacks keep
// scaling through gear.
export function skillPower(
  skill: SkillDef,
  power: number,
  vitality: number,
  level = 1,
  skillPowerPercent = 0,
): number {
  const levelBonus = (level - 1) * 1.5;
  const scale = 1 + skillPowerPercent / 100;
  // Mobility distance is not "power" in any sense a percentage should touch:
  // scaling a dash by spell power would make an archmage teleport.
  if (skill.kind === "mobility" || skill.kind === "buff") return skill.power;
  if (skill.kind === "heal") {
    return Math.round((skill.power + vitality * 2 + power + levelBonus * 2) * scale);
  }
  return Math.round((skill.power + power * 1.6 + levelBonus) * scale);
}

// Shield Wall's duration and how much it cuts.
export const SHIELD_WALL_MS = 6000;
export const SHIELD_WALL_REDUCTION = 0.5;

// --- Weapon proficiency ------------------------------------------------------
// Character level and weapon level answer different questions and are earned
// separately on purpose.
//
//   Character level is WHO YOU ARE: hit points, and stat points you spend
//   however you like. It follows you across every weapon, so switching does
//   not throw away the character.
//
//   Weapon level is WHAT YOU CAN DO WITH THIS THING: talent points in that
//   weapon's own tree, and nothing else's. Picking up a staff for the first
//   time really does mean starting that tree at zero, which is what makes
//   "you are whatever you're holding" a commitment rather than a costume
//   change.
//
// Proficiency is earned only while the weapon is in hand, so it accumulates
// exactly where the playing happened.
export const MAX_WEAPON_LEVEL = 20;

/** XP needed to go from `level` to `level + 1`. */
export function weaponXpToNext(level: number): number {
  return 30 + (level - 1) * 22;
}

/** Turns a total XP figure into a level plus progress within it. */
export function weaponProgress(totalXp: number): {
  level: number;
  intoLevel: number;
  needed: number;
} {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < MAX_WEAPON_LEVEL && remaining >= weaponXpToNext(level)) {
    remaining -= weaponXpToNext(level);
    level++;
  }
  return { level, intoLevel: remaining, needed: weaponXpToNext(level) };
}

/**
 * Talent points a weapon has granted by the time it reaches `level`. One per
 * level including the first, so drawing a new weapon is immediately a choice
 * rather than a wait.
 *
 * Twenty points at the cap against roughly thirty ranks per tree, which is the
 * ratio that makes it a tree rather than a checklist: you finish a weapon with
 * about two thirds of it, and which two thirds is the build. `tools/test/
 * talents.mjs` asserts the gap, because the first draft of the trees fit
 * entirely inside the budget and nobody would ever have had to choose.
 */
export function talentPointsAtLevel(level: number): number {
  return Math.max(0, Math.min(MAX_WEAPON_LEVEL, level));
}

export function xpToNextLevel(level: number): number {
  return 20 + (level - 1) * 10;
}

export const PLAYER_SPAWN = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };

export function maxHpForLevel(level: number, vitality = 0, maxHpBonus = 0): number {
  return 50 + (level - 1) * 10 + vitality * VITALITY_HP_STEP + maxHpBonus;
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

/** Same shape, and for the same reason — see `gatherUpgradeCost`. */
export function battlePowerUpgradeCost(level: number): BattlePowerCost {
  return { wood: 10 + level * level * 7, ore: 8 + level * level * 6 };
}

// --- Equipment / rarity ----------------------------------------------------
// SEVEN TIERS, AND THEY ARE CONDITIONS RATHER THAN COLOURS.
//
// common/rare/epic was a colour ladder borrowed from every other game, and it
// said nothing about this one. The world's single fixed landmark is a smithy,
// the progression is measured in what you are holding, and the crafting verbs
// are forge, reforge and salvage — so the ladder is the state a made object is
// in, from a thing that is falling apart to a thing with power bound into it:
//
//   Broken - Worn - Honed - Tempered - Forged - Runed - Enchanted
//
// Two consequences worth stating, because both are deliberate:
//
//   BROKEN IS BELOW BASELINE, not merely the worst thing you can find. It
//   multiplies an item's numbers DOWN. That makes the bottom of the ladder a
//   real state with a real answer (salvage it, or reforge it upward) rather
//   than a synonym for "common".
//
//   HONED IS THE BASELINE, at exactly 1.0. Every base item in the catalogue is
//   authored at the numbers it has when honed, so a designer reading
//   `ITEM_BASES` is reading true values rather than values that only mean
//   something after a multiplier.
export const RARITY_ORDER = [
  "broken",
  "worn",
  "honed",
  "tempered",
  "forged",
  "runed",
  "enchanted",
] as const;
export type ItemRarity = (typeof RARITY_ORDER)[number];

export interface RarityDef {
  id: ItemRarity;
  name: string;
  /** Multiplies every number the base item declares. Honed is 1.0. */
  power: number;
  /** How many affixes an item of this quality carries. */
  affixes: number;
  /** Relative chance of rolling this from a drop, before any band floor. */
  weight: number;
  /** Interface and nameplate colour. Also tints the 3D mesh. */
  color: string;
  /** Whether the mesh gets an emissive lift — reserved for the top two, or it
   *  stops meaning anything. */
  glow: boolean;
  blurb: string;
}

export const RARITIES: Record<ItemRarity, RarityDef> = {
  broken:    { id: "broken",    name: "Broken",    power: 0.55, affixes: 0, weight: 14, color: "#6f6a62", glow: false, blurb: "Held together by habit. Worth more as parts." },
  worn:      { id: "worn",      name: "Worn",      power: 0.8,  affixes: 0, weight: 30, color: "#a09079", glow: false, blurb: "Used, and used honestly." },
  honed:     { id: "honed",     name: "Honed",     power: 1.0,  affixes: 1, weight: 26, color: "#dfe6e4", glow: false, blurb: "Kept sharp. What the smith intended." },
  tempered:  { id: "tempered",  name: "Tempered",  power: 1.25, affixes: 1, weight: 16, color: "#6fb6ff", glow: false, blurb: "Worked hot and quenched right." },
  forged:    { id: "forged",    name: "Forged",    power: 1.55, affixes: 2, weight: 9,  color: "#ffb545", glow: false, blurb: "Made for someone in particular." },
  runed:     { id: "runed",     name: "Runed",     power: 1.9,  affixes: 2, weight: 4,  color: "#c07cff", glow: true,  blurb: "Cut with marks that hold." },
  enchanted: { id: "enchanted", name: "Enchanted", power: 2.3,  affixes: 3, weight: 1,  color: "#6ff0e0", glow: true,  blurb: "Something answers when you draw it." },
};

export function rarityDef(rarity: ItemRarity): RarityDef {
  return RARITIES[rarity] ?? RARITIES.honed;
}

/** The baseline. Anything the game hands out without an opinion is this. */
export const BASE_RARITY: ItemRarity = "honed";

// The three old tier bonuses, re-tabled across seven steps. They stay because
// the formulas that read them are load-bearing — swing interval, xp rate and
// move speed — and because a ladder whose only effect is a multiplier on rolled
// stats gives the player nothing to feel between one step and the next.
const RARITY_SPEED_BONUS_MS: Record<ItemRarity, number> = {
  broken: -120, worn: 60, honed: 200, tempered: 380, forged: 560, runed: 760, enchanted: 980,
};
const RARITY_XP_BONUS: Record<ItemRarity, number> = {
  broken: -0.05, worn: 0.04, honed: 0.1, tempered: 0.18, forged: 0.28, runed: 0.4, enchanted: 0.55,
};
const RARITY_MOVE_SPEED_BONUS: Record<ItemRarity, number> = {
  broken: -14, worn: 8, honed: 22, tempered: 40, forged: 60, runed: 82, enchanted: 105,
};

// `offhand` joined the six on the day the item catalogue arrived: the weapons
// pack ships five shields, and a shield is the one piece of gear whose value is
// obvious without reading a number. Two-handed weapons empty it (see
// `ItemBase.twoHanded`), which is what stops "claymore and buckler".
export const ITEM_SLOTS = ["weapon", "offhand", "helm", "armor", "cape", "boots", "ring"] as const;
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: "Weapon",
  offhand: "Off-hand",
  helm: "Head",
  armor: "Chest",
  cape: "Back",
  boots: "Feet",
  ring: "Ring",
};

// --- Gear appearance
// The body is drawn naked and one layer is added per equipped visible slot. A
// STYLE names which shape gets built; rarity only tints it. Keeping those two
// independent is the whole reason for a paperdoll — baking them together would
// need styles x rarities meshes and could never tint plate without also
// staining skin.
//
// Styles are no longer ROLLED. They are declared by the base item, because
// there is a catalogue now: "Ranger's Hood" is a hood because that is what it
// is, not because a random number came up hood. Rolling a look was the right
// answer while items were anonymous slot-and-rarity pairs and is the wrong one
// the moment they have names.
export const GEAR_STYLES = [
  // chest
  "leather", "chain", "plate", "robe", "scale", "brigandine",
  // head
  "cap", "hood", "full", "horned", "circlet",
  // feet
  "low", "tall", "plated", "wrapped",
  // back
  "cape", "cloak", "mantle", "tabard",
] as const;
export type GearStyle = (typeof GEAR_STYLES)[number];

// Slots that put a layer on the character. `ring` is invisible, and `weapon`
// and `offhand` are held rather than worn — they hang off a hand bone and have
// to move independently of the body.
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

const RARITY_CRIT_DAMAGE_BONUS: Record<ItemRarity, number> = {
  broken: -0.05, worn: 0.04, honed: 0.1, tempered: 0.2, forged: 0.32, runed: 0.45, enchanted: 0.62,
};
export const BASE_CRIT_MULTIPLIER = 1.5;

export function critDamageMultiplier(
  weaponRarity: ItemRarity | null,
  critDamagePercent = 0,
): number {
  const base = BASE_CRIT_MULTIPLIER + (weaponRarity ? RARITY_CRIT_DAMAGE_BONUS[weaponRarity] : 0);
  return base + critDamagePercent / 100;
}

export function xpRewardFor(monsterKind: MonsterKind, armorRarity: ItemRarity | null): number {
  const base = MONSTER_STATS[monsterKind].xpReward;
  const bonus = armorRarity ? RARITY_XP_BONUS[armorRarity] : 0;
  return Math.round(base * (1 + bonus));
}

export function xpBonusPercent(armorRarity: ItemRarity | null): number {
  return armorRarity ? Math.round(RARITY_XP_BONUS[armorRarity] * 100) : 0;
}

// Boss kills (see MonsterStats.guaranteedDrop) never drop below this.
export const BOSS_MIN_RARITY: ItemRarity = "tempered";

// Everything about WHICH item drops, what it is called, what it rolls and what
// it costs to make now lives in `shared/items.ts`. This file keeps the wire
// format and the formulas the server resolves combat with; that one keeps the
// catalogue. The dependency runs one way — items.ts imports from here and never
// the reverse — so there is no cycle to reason about.

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
  offhand: { wood: 18, ore: 8 },
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
  broken: 0.4,
  worn: 0.7,
  honed: 1,
  tempered: 2.4,
  forged: 5,
  runed: 10,
  enchanted: 20,
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

// --- The smithy's three verbs ----------------------------------------------
// Crafting used to be one message that took a slot and a rarity and returned an
// anonymous item: a way of buying loot rolls. There are three now, and they are
// three different questions.
//
// FORGE asks WHAT. The player names a base item from the catalogue; the output
// is always Honed, because the forge decides what a thing is and the ladder
// decides how good it is. Blurring those makes reforging pointless.
export interface ForgeItemMessage {
  type: "FORGE_ITEM";
  payload: { stationId: string; baseId: string };
}

// REFORGE asks HOW GOOD. One step up the ladder on an item already owned. The
// server re-rolls it from its base at the new quality rather than adding to
// what it had, so an Enchanted item's affixes are not decided by what a Worn
// one happened to roll six steps earlier.
export interface ReforgeItemMessage {
  type: "REFORGE_ITEM";
  payload: {
    stationId: string;
    itemId: string;
    /**
     * One affix the player has asked for.
     *
     * Honoured only at the top two steps and only if it could have rolled on
     * that item anyway — the choice is which of its own affixes it gets, never
     * a way past the eligibility rules. Validated server-side for exactly that
     * reason: the client greys the impossible options, and a hand-written
     * message can still name one.
     */
    affix?: string;
  };
}

// SALVAGE asks WHAT IS IT WORTH IN PARTS. Replaces selling for wood, which
// was a sink with no decision in it.
export interface SalvageItemMessage {
  type: "SALVAGE_ITEM";
  payload: { itemId: string };
}

/**
 * Several at once.
 *
 * The bag holds thirty and loot is frequent, so clearing out the bottom of the
 * ladder one confirmation at a time is a chore the game invented for itself.
 * The CLIENT decides which — it is the side that knows what the player was
 * looking at — and the server validates every one, so a list naming an equipped
 * item or somebody else's simply loses those entries rather than the request.
 */
export interface SalvageManyMessage {
  type: "SALVAGE_MANY";
  payload: { itemIds: string[] };
}

/**
 * Every material, in one message. Wood, ore and herb each had their own update;
 * essence made that four, and four messages to say one thing is three chances
 * for the client's idea of the wallet to drift from the server's.
 *
 * The keys are `MATERIALS` from `shared/items.ts` and are deliberately NOT
 * enumerated here: this file owns the wire format and that one owns the
 * content, so a sixth material is a row there and nothing at all here. Same
 * shape and same reason as `CONSUMABLES_UPDATE`.
 */
export interface MaterialsUpdateMessage {
  type: "MATERIALS_UPDATE";
  payload: Record<string, number>;
}

/**
 * DRAW asks WHAT IS THE ONE THING WORTH KEEPING. The item is destroyed and one
 * of its affixes comes out as a rune — instead of its materials, and instead of
 * its recipe, so a good drop is a three-way decision rather than something you
 * do to it on the way past.
 */
export interface DrawRuneMessage {
  type: "DRAW_RUNE";
  payload: { stationId: string; itemId: string; affix: string };
}

/**
 * ETCH asks WHAT DO I WANT THIS TO BE. A rune replaces one affix on something
 * already owned — never adds one, since quality decides how many an item has.
 *
 * `replacing` is named by the client because it is the side that knows which
 * one the player was looking at, and re-validated on the server for the same
 * reason the chosen reforge affix is: the button greys the impossible options
 * and a hand-written message can still name one.
 */
export interface EtchAffixMessage {
  type: "ETCH_AFFIX";
  payload: { stationId: string; itemId: string; affix: string; replacing: string };
}

/** Every rune the character holds, by affix id. Whole rather than as a delta,
 *  like the recipe list and the consumable stacks and for the same reason. */
export interface RunesUpdateMessage {
  type: "RUNES_UPDATE";
  payload: { counts: Record<string, number> };
}

/**
 * REFINE asks WHAT IS THIS WORTH AS STOCK. The fourth verb, and the only one
 * whose output is not something you wear: raw materials in, refined out.
 *
 * `count` because refining one at a time is a chore the bench would be
 * inventing for itself — the same argument SALVAGE_MANY makes. The server
 * clamps it and pays for what it can actually afford rather than refusing the
 * whole request, since a stale wallet is the normal case when a gather lands
 * mid-click.
 */
export interface RefineMaterialMessage {
  type: "REFINE_MATERIAL";
  payload: { stationId: string; id: string; count?: number };
}

/**
 * Craft one consumable. Which one is a string from the shared table, so adding
 * a consumable never adds a message — the thing four bespoke message pairs got
 * wrong.
 */
export interface CraftConsumableMessage {
  type: "CRAFT_CONSUMABLE";
  payload: { stationId: string; id: string };
}

export interface UseConsumableMessage {
  type: "USE_CONSUMABLE";
  payload: { id: string };
}

/** Every consumable stack, by id. Whole, like the recipe list and for the same
 *  reason: the set is tiny and a missed increment is silently wrong. */
export interface ConsumablesUpdateMessage {
  type: "CONSUMABLES_UPDATE";
  payload: { counts: Record<string, number> };
}

/**
 * Everything the character has learned to make.
 *
 * Sent whole rather than as a delta, for the same reason the item list is: the
 * set is small, it changes rarely, and a client that missed one increment would
 * be quietly unable to forge something it had earned.
 */
export interface RecipesUpdateMessage {
  type: "RECIPES_UPDATE";
  payload: { known: string[] };
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

// Superseded by CRAFT_CONSUMABLE / USE_CONSUMABLE, which read the shared
// CONSUMABLES table. Kept as types for one release so an older client cannot
// crash a newer server on an unknown message — nothing sends them.
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
  /**
   * Which entry in the catalogue this is an instance OF — the single biggest
   * change to the item model. Items used to be anonymous: a bag held "a rare
   * weapon (sword)", generated from nothing, identical to every other rare
   * sword. Now every item is a named thing with its own model, its own numbers
   * and its own place in the world, and the instance carries only what varies:
   * its quality and what it rolled.
   *
   * See `ITEM_BASES` in shared/items.ts. Unknown ids resolve to a fallback
   * rather than crashing, because a catalogue entry can be removed while a
   * saved character is still wearing it.
   */
  baseId: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  equipped: boolean;
  /** Primary number, base value x rarity power, rolled once and stored. */
  statValue: number;
  /** Secondary number, same treatment. What it means is per slot — see
   *  `SECONDARY_STAT_LABEL`. */
  bonusStatValue: number;
  /**
   * Affix ids, as many as the rarity allows. They contribute a `PassiveBonus`,
   * which is the same vocabulary the talent trees already total — so an affix
   * needs no new plumbing in combat resolution or on the stat sheet, and the
   * server and the character window read one set of numbers.
   */
  affixes: string[];
  /**
   * Which of those affixes were CUT IN rather than rolled — a subset of
   * `affixes`, and the only provenance this system keeps.
   *
   * It exists for exactly one rule: a reforge re-rolls what the dice gave and
   * keeps what the player paid for. Without it, etching decided which affixes
   * an item had only until the next step up the ladder, which meant it did not
   * decide anything at all for a thing you intended to keep improving — the
   * verb was endgame-only by accident rather than by design.
   *
   * It is NOT a combat distinction. Two Tempests do the same thing to a
   * monster whichever way they arrived; the mark changes what the FIRE does to
   * them, and it is shown wherever that matters, so it is never a difference a
   * player can feel and cannot see.
   */
  etched?: string[];
  // Only meaningful on weapons. Nothing gates equipping it — the family IS
  // the class, so picking up an unfamiliar weapon is an invitation to play
  // differently rather than a restriction.
  weaponType?: WeaponType;
  // Which armour shape to layer on the paperdoll. Declared by the base item
  // rather than rolled; carried on the instance so the client never has to
  // reach into the catalogue to draw a body.
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
  return (eq?.armor?.statValue ?? 0) + (eq?.helm?.statValue ?? 0) + (eq?.offhand?.statValue ?? 0);
}

export function gearEvasion(eq: EquippedGear | undefined): number {
  return (
    (eq?.boots?.statValue ?? 0) +
    (eq?.cape?.statValue ?? 0) +
    (eq?.armor?.bonusStatValue ?? 0) +
    (eq?.offhand?.bonusStatValue ?? 0)
  );
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
  offhand: "Evasion",
  armor: "Evasion",
  helm: "Crit chance",
  cape: "Move speed",
  boots: "Move speed",
  ring: "Accuracy",
};

/** What the PRIMARY roll means, per slot. Was only ever written in a comment
 *  over the roll table, which meant the tooltip could not say it. */
export const PRIMARY_STAT_LABEL: Record<ItemSlot, string> = {
  weapon: "Bonus damage",
  offhand: "Armour",
  armor: "Armour",
  helm: "Armour",
  cape: "Evasion",
  boots: "Evasion",
  ring: "Bonus damage",
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
  /** Which catalogue entry is in the hand, so the client knows which MODEL to
   *  put there. The family alone was enough while there was one sword; there
   *  are nine now and they do not look alike. */
  weaponBaseId?: string;
  offhandBaseId?: string;
  offhandRarity?: ItemRarity;
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
  const offhand = equipped.find((i) => i.slot === "offhand");
  const layers: Appearance["layers"] = {};
  for (const slot of VISIBLE_GEAR_SLOTS) {
    const item = equipped.find((i) => i.slot === slot);
    if (item?.style) layers[slot] = { style: item.style, rarity: item.rarity };
  }
  return {
    weaponType: weapon?.weaponType,
    weaponRarity: weapon?.rarity,
    weaponBaseId: weapon?.baseId,
    offhandBaseId: offhand?.baseId,
    offhandRarity: offhand?.rarity,
    layers,
  };
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

// --- Loot on the ground -----------------------------------------------------
// A drop used to teleport into the bag with a line in the combat log, which is
// the one moment an item system has the player's whole attention and it was
// spending it on text. A kill leaves something ON THE GROUND now: the item's own
// model where the monster fell, turning, lit by its quality.
//
// It is reserved for whoever earned it — the threat table already decided that,
// and it is the same answer the experience split uses — and then goes free, so a
// drop nobody wanted is not litter that only one person can clear.
export const LOOT_PICKUP_RANGE_PX = 46;
export const LOOT_RESERVED_MS = 25000;
export const LOOT_LIFETIME_MS = 150000;

export interface DroppedItemState {
  id: string;
  x: number;
  y: number;
  item: ItemInstance;
  /** Who it belongs to until `freeAt`. */
  ownerId: string;
  /** After this, anyone may take it. */
  freeAt: number;
  /** When it disappears, so the client can fade it rather than popping it. */
  expiresAt: number;
}

export interface StateSnapshotMessage {
  type: "STATE_SNAPSHOT";
  payload: {
    serverTime: number;
    players: PlayerState[];
    nodes: ResourceNodeState[];
    monsters: MonsterState[];
    stations: CraftingStationState[];
    /** Everything lying on the ground within sight. */
    drops: DroppedItemState[];
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
    hits: {
      monsterId: string;
      hit: boolean;
      damage: number;
      crit: boolean;
      /** What landed, so the floating number can be tinted and the log can say
       *  "burned" rather than "hit". */
      school?: DamageSchool;
      /** The target's resistance to it. Carried rather than looked up on the
       *  client so the number on screen and the number the server subtracted
       *  are the same fact — the client CAN look it up, and a client that
       *  computes its own version of a server number is a client that will one
       *  day disagree with it. */
      resisted?: number;
    }[];
    healed?: number;
    buffMs?: number;
    slowMs?: number;
  };
}

export interface ManaUpdateMessage {
  type: "MANA_UPDATE";
  payload: { mana: number; maxMana: number };
}

/** Spend one talent point. The server re-checks `canLearnTalent` before it
 *  takes, so this is a request rather than an instruction. */
export interface LearnTalentMessage {
  type: "LEARN_TALENT";
  payload: { nodeId: TalentId };
}

/** Save the player's bar for one weapon. Sent on every edit; the server
 *  normalises and stores it. */
export interface SetHotbarMessage {
  type: "SET_HOTBAR";
  payload: { weaponType: WeaponType; layout: HotbarLayout };
}

/** Refund every point in one weapon's tree. Free and unlimited on purpose —
 *  a tree you cannot experiment with is a tree you read a guide for. */
export interface ResetTalentsMessage {
  type: "RESET_TALENTS";
  payload: { weaponType: WeaponType };
}

/**
 * Everything about the weapon currently in hand: how far along its own
 * proficiency you are, and what you have spent in its tree.
 *
 * Sent whenever any of it moves — a kill, a purchase, a weapon swap. Carries
 * the whole tree state rather than a delta because it is a few dozen small
 * numbers and reconciling deltas for something a player edits by hand is a
 * bug factory for no saving worth having.
 */
export interface WeaponProgressMessage {
  type: "WEAPON_PROGRESS";
  payload: {
    weaponType: WeaponType;
    xp: number;
    level: number;
    intoLevel: number;
    needed: number;
    pointsSpent: number;
    pointsAvailable: number;
    ranks: TalentRanks;
    /** The player's bar for this weapon, already pruned of anything they can
     *  no longer cast. */
    hotbar: HotbarLayout;
    /** Set when a purchase was refused, in the player's words. */
    reason?: string;
  };
}

/** "Swing at my target now." Also gives the standing attack order that keeps
 *  the swings coming afterwards. */
export interface UseAttackMessage {
  type: "USE_ATTACK";
  payload: Record<string, never>;
}

/**
 * The state of the player's own weapon: whether an attack order stands, and
 * how long until the next swing lands.
 *
 * Sent by the server rather than derived on the client even though every
 * ingredient is in `shared`, because the swing clock is a running timer the
 * server owns: it starts when you first come into reach, resets on each swing,
 * and is thrown away when you disengage. A client re-deriving that would be
 * re-implementing the state machine, and any drift shows up as a bar that
 * disagrees with when you actually hit.
 */
export interface AttackStateMessage {
  type: "ATTACK_STATE";
  payload: {
    attacking: boolean;
    readyInMs: number;
    intervalMs: number;
    /** Present when a manual swing was refused, in the player's words. */
    reason?: string;
  };
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
    /** What the swing was made of — the weapon's school. */
    school?: DamageSchool;
    /** How much the target shrugged off, so "that did nothing" is legible
     *  rather than inferred from a small number. */
    resisted?: number;
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
    /** What it hit you with. Physical for most of the bestiary; a dragon and a
     *  demon breathe fire, a ghost is arcane, a cactoro is nature. */
    school?: DamageSchool;
  };
}

export type ClientToServerMessage =
  | HelloMessage
  | MoveMessage
  | UpgradeGatherSpeedMessage
  | UpgradeBattlePowerMessage
  | EquipItemMessage
  | SalvageItemMessage
  | SalvageManyMessage
  | RefineMaterialMessage
  | DrawRuneMessage
  | EtchAffixMessage
  | AllocateStatMessage
  | ForgeItemMessage
  | ReforgeItemMessage
  | CraftConsumableMessage
  | UseConsumableMessage
  | CraftPotionMessage
  | UsePotionMessage
  | CraftTonicMessage
  | UseTonicMessage
  | RequestLeaderboardMessage
  | SetTargetMessage
  | UseSkillMessage
  | UseAttackMessage
  | LearnTalentMessage
  | ResetTalentsMessage
  | SetHotbarMessage;
export type ServerToClientMessage =
  | StateSnapshotMessage
  | WelcomeMessage
  | InventoryUpdateMessage
  | MaterialsUpdateMessage
  | RecipesUpdateMessage
  | RunesUpdateMessage
  | ConsumablesUpdateMessage
  | HerbUpdateMessage
  | OreUpdateMessage
  | XpUpdateMessage
  | LootUpdateMessage
  | HpUpdateMessage
  | ItemsUpdateMessage
  | StatsUpdateMessage
  | BattleResultMessage
  | AttackStateMessage
  | WeaponProgressMessage
  | MonsterAttackMessage
  | PotionsUpdateMessage
  | TonicsUpdateMessage
  | LeaderboardUpdateMessage
  | DailyBonusMessage
  | InfoMessage
  | ManaUpdateMessage
  | SkillResultMessage;
