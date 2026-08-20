// THE ITEM CATALOGUE.
//
// Items used to be anonymous. A drop was a slot and a rarity — "a rare weapon
// (sword)" — generated from nothing, identical to every other rare sword, with
// two numbers rolled off a table keyed by nothing but the slot it landed in.
// That is defensible while a game has three rarities and no art budget, and it
// stops being defensible the moment the thing in your hand is drawn in 3D and
// the whole premise of the game is that what you are holding is who you are.
//
// So there is a catalogue now, and it is the centre of the system:
//
//   A BASE ITEM is a named thing in the world. "Bloodclaim Claymore" has a
//   model, a palette, a difficulty band, a silhouette in your hand, and numbers
//   that belong to it. Adding one is a row here.
//
//   AN INSTANCE is a base item plus what happened to it — its quality on the
//   seven-step ladder, the numbers that rolled, and its affixes. That is what
//   the bag and the database hold.
//
// Three axes are kept deliberately independent, which is the same argument the
// paperdoll has always made one level down:
//
//   MESH says what shape it is.        (Claymore vs Falchion)
//   PALETTE says what it is made of.   (steel vs obsidian vs bone)
//   RARITY only tints and multiplies.  (Broken through Enchanted)
//
// Multiplying them is what turns two dozen models into a catalogue: the same
// greatsword mesh is Steel, Frost and Dread, and none of them needed an artist.
// Baking any two together would collapse that — and would put us back where the
// 2D game was, needing styles x rarities of everything.
//
// The numbers are DERIVED, not authored. A base declares its band and, where it
// is unusual, a multiplier; `basePower` and `baseGuard` compute the rest. A
// hundred and fifty hand-typed numbers across seventy-eight items is a hundred
// and fifty numbers that drift, and no reviewer can tell whether band 3 is
// stronger than band 2 by reading them.
//
// This file imports from protocol-types and protocol-types never imports it, so
// there is no cycle: that file owns the wire format and the formulas combat is
// resolved with, this one owns the content.

import {
  EMPTY_PASSIVES,
  ITEM_SLOTS,
  RARITIES,
  RARITY_ORDER,
  addPassives,
  applyAttackSpeed,
  applyDamagePercent,
  attackRangeFor,
  playerAttackIntervalMs,
  playerMaxHit,
  playerMinHit,
  weaponDef,
  type EquippedGear,
  type GearStyle,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
  type MonsterKind,
  type PassiveBonus,
  type WeaponType,
  // Extension included on purpose: the tools/test suites run this file under
  // plain Node ESM, which will not resolve an extensionless specifier. Both
  // workspaces already build with allowImportingTsExtensions.
} from "./protocol-types.ts";

// --- Bands -----------------------------------------------------------------
// The same 1-5 the monsters use, and that is the point: the world is laid out
// as difficulty radiating from the smithy, so an item's band says where in the
// world it comes from as well as how strong it is. A band-4 sword is the sword
// the things in the fourth ring drop.
export type ItemBand = 1 | 2 | 3 | 4 | 5;

/**
 * Primary stat an item of this band is worth, before slot and item tuning.
 *
 * Band 1 is 4 rather than 3 for a reason worth recording: at 3, the lightest
 * slots multiplied down to a primary of 1 — and a stat of 1 cannot get any
 * worse, which makes Broken indistinguishable from Honed on those items and the
 * bottom of the ladder meaningless for them. The floor of the whole system has
 * to leave room for the system to move. `tools/test/items.mjs` checks it.
 */
const BAND_POWER: Record<ItemBand, number> = { 1: 4, 2: 6, 3: 10, 4: 15, 5: 22 };

/**
 * How much of a band's power each slot carries.
 *
 * Weapon and chest stay the decisions; the rest top you up. Without this every
 * slot is worth the same and filling six of them is six times the chest, which
 * makes the chest — the piece with the biggest silhouette and the most art —
 * the least interesting thing you own.
 */
const SLOT_WEIGHT: Record<ItemSlot, number> = {
  weapon: 1.0,
  armor: 1.0,
  offhand: 0.7,
  boots: 0.6,
  helm: 0.55,
  cape: 0.45,
  ring: 0.5,
};

// --- Palettes --------------------------------------------------------------
// The weapons pack paints every mesh with a small shared vocabulary of named
// flat materials — Steel, DarkSteel, LightSteel, Wood, DarkWood, Gold, Black,
// and a few accents — and no textures at all. That is what makes a palette a
// real axis rather than a hue slider: the client can repaint by ROLE, so
// "obsidian" darkens the blade and leaves the grip leather-coloured, instead of
// staining the whole object one colour.
export type PaletteId =
  | "iron" | "steel" | "bronze" | "silver" | "gold"
  | "obsidian" | "bone" | "verdant" | "crimson" | "frost" | "arcane" | "wood";

export interface PaletteDef {
  id: PaletteId;
  name: string;
  /** Blades, heads, plates, bindings. */
  metal: number;
  /** Hafts, grips, staves, bow limbs. */
  wood: number;
  /** Pommels, inlay, gems, fletching — the small bright part. */
  accent: number;
}

export const PALETTES: Record<PaletteId, PaletteDef> = {
  iron:     { id: "iron",     name: "Iron",     metal: 0x6d7278, wood: 0x4a3520, accent: 0x8a8f96 },
  steel:    { id: "steel",    name: "Steel",    metal: 0xb4bcc6, wood: 0x5c3d24, accent: 0xd8dee6 },
  bronze:   { id: "bronze",   name: "Bronze",   metal: 0xb07a3c, wood: 0x4e3520, accent: 0xe0a860 },
  silver:   { id: "silver",   name: "Silver",   metal: 0xd6dde4, wood: 0x6b5138, accent: 0xf2f6fa },
  gold:     { id: "gold",     name: "Gold",     metal: 0xe0b44a, wood: 0x6b4a26, accent: 0xffe08a },
  obsidian: { id: "obsidian", name: "Obsidian", metal: 0x2e2c34, wood: 0x241d1a, accent: 0x7a4fa8 },
  bone:     { id: "bone",     name: "Bone",     metal: 0xd8d2be, wood: 0x8b7d63, accent: 0xf0ead6 },
  verdant:  { id: "verdant",  name: "Verdant",  metal: 0x6fae63, wood: 0x46351f, accent: 0xbde36a },
  crimson:  { id: "crimson",  name: "Crimson",  metal: 0x9b2b28, wood: 0x33201b, accent: 0xff6a4a },
  frost:    { id: "frost",    name: "Frost",    metal: 0x9fd0e6, wood: 0x4d5f6b, accent: 0xdff4ff },
  arcane:   { id: "arcane",   name: "Arcane",   metal: 0x7d6bd6, wood: 0x3b3350, accent: 0xc0a6ff },
  wood:     { id: "wood",     name: "Wood",     metal: 0x8a6c46, wood: 0x6b4a28, accent: 0xc8a878 },
};

// --- What a base item is ----------------------------------------------------

/**
 * How the client draws a held item.
 *
 * `model` is a path under /models with no extension for FBX, exactly as
 * `loadModel` takes it. `build` names a procedural shape instead, for the two
 * silhouettes no pack in the project ships. Everything else is optional tuning,
 * and the grip itself is NOT here on purpose: it comes from the character rig
 * that authored the weapon socket, and every model is fitted into that space by
 * its own bounding box (see `gear.ts`). A per-item grip offset would be a
 * constant that drifts the first time a model is swapped.
 */
export interface ItemArt {
  model?: string;
  build?: "crystalstave" | "quiver";
  palette: PaletteId;
  /** Multiplies the fitted length. A wand is a staff cut down. */
  scale?: number;
  /**
   * Which of the model's own axes runs down the grip.
   *
   * "along" (the default) points the model's longest axis away from the hand,
   * which is what a sword, an axe and a staff all want. "flat" points its
   * SHORTEST axis down the grip instead, turning the face outward — which is
   * what a shield wants, and the one thing a bounding box cannot work out on
   * its own.
   */
  lay?: "along" | "flat";
}

/**
 * Per-item tuning on top of the weapon FAMILY's numbers.
 *
 * This is what stops nine swords being one sword with different pictures. The
 * family still decides the archetype — a sword makes you a warrior whatever its
 * name — and these decide how THIS sword plays inside it: a claymore is slow
 * and heavy, a falchion quick and light, a spear reaches.
 *
 * Multiplied into `WEAPONS[type]`'s own multipliers rather than replacing them,
 * so a rebalance of the family still moves every weapon in it.
 */
export interface WeaponMods {
  range?: number;
  /** Above 1 is slower. */
  speed?: number;
  damage?: number;
}

export interface ItemBase {
  id: string;
  name: string;
  slot: ItemSlot;
  band: ItemBand;
  icon: string;
  art: ItemArt;
  /** Weapons only. The family is what decides the wielder's class. */
  weaponType?: WeaponType;
  /** Armour only. Which shape `gear.ts` builds onto the body. */
  style?: GearStyle;
  /**
   * Empties the off-hand when equipped, and cannot be worn beside one.
   * Bows and staves are two-handed for the same reason greatswords are.
   */
  twoHanded?: boolean;
  mods?: WeaponMods;
  /** Multiplies the derived primary and secondary numbers. Use sparingly —
   *  the band and the slot should do almost all of the work. */
  power?: number;
  guard?: number;
  flavour: string;
}

/** The primary number an item of this base rolls at Honed quality. */
export function basePower(base: ItemBase): number {
  return Math.max(1, Math.round(BAND_POWER[base.band] * SLOT_WEIGHT[base.slot] * (base.power ?? 1)));
}

/**
 * The secondary number. Deliberately a smaller share of the same budget rather
 * than its own table: two numbers rolled from one budget means a base cannot
 * quietly be the best at both, and a reader can see the whole of an item's
 * strength in one place.
 */
export function baseGuard(base: ItemBase): number {
  const share = base.slot === "boots" || base.slot === "cape" ? 0.9 : 0.35;
  return Math.max(1, Math.round(BAND_POWER[base.band] * SLOT_WEIGHT[base.slot] * share * (base.guard ?? 1)));
}

// Shorthand, so a row reads as the item it describes rather than as a wall of
// field names. Every catalogue row below is one call.
function w(
  id: string, name: string, band: ItemBand, weaponType: WeaponType,
  art: ItemArt, flavour: string,
  extra: Partial<ItemBase> = {},
): ItemBase {
  return { id, name, slot: "weapon", band, weaponType, icon: weaponType, art, flavour, ...extra };
}

// `style` is null for the two slots with nothing to draw on the body: a ring is
// invisible and an off-hand is held rather than worn.
function g(
  id: string, name: string, slot: ItemSlot, band: ItemBand, style: GearStyle | null,
  icon: string, palette: PaletteId, flavour: string,
  extra: Partial<ItemBase> = {},
): ItemBase {
  return {
    id, name, slot, band, icon, flavour,
    ...(style ? { style } : {}),
    art: { palette },
    ...extra,
  };
}

// --- The catalogue ----------------------------------------------------------
// Seventy-eight base items. Read it as five rings radiating out from the
// smithy: band 1 is what you find in sight of the anvil, band 5 is the far
// corners. Within a band the choice is what you want to BE, not which number is
// bigger — a falchion and a warhammer of the same band are the same strength
// and nothing like each other to swing.
//
// `rig:Body/Mesh` means the model is harvested off a character rig that already
// carries it, which is how the four original weapons were always drawn. Plain
// paths are files under /models.

const WEAPON_BASES: ItemBase[] = [
  // ---------------------------------------------------------------- daggers
  // Ranger by family, and the shortest reach in the game. Fast enough that the
  // per-item speed tuning matters more here than anywhere else.
  w("dirk", "Notched Dirk", 1, "dagger",
    { model: "weapons/Dagger", palette: "iron" },
    "Someone's first knife, and someone else's last."),
  w("thiefknife", "Thief's Knife", 2, "dagger",
    { model: "weapons/Dagger_2", palette: "steel", scale: 0.92 },
    "Balanced for the throw it will never be used for.",
    { mods: { speed: 0.9 } }),
  w("fangtooth", "Fangtooth", 3, "dagger",
    { model: "weapons/Dagger_2", palette: "bone" },
    "Ground down from something that bit first."),
  w("nightedge", "Nightedge", 4, "dagger",
    { model: "weapons/Dagger", palette: "obsidian" },
    "The edge is hard to see. That is most of the point.",
    { mods: { damage: 1.12 } }),
  w("venomkiss", "Venomkiss", 5, "dagger",
    { model: "weapons/Dagger_2", palette: "verdant" },
    "The groove down the blade is not decorative.",
    { mods: { speed: 0.88, damage: 1.1 } }),

  // ----------------------------------------------------------------- swords
  w("recruitblade", "Recruit's Blade", 1, "sword",
    { model: "rig:Warrior/Warrior_Sword", palette: "iron" },
    "Issued, not chosen. It still counts."),
  w("armingsword", "Arming Sword", 1, "sword",
    { model: "weapons/Sword", palette: "iron" },
    "One hand, one edge, no opinions."),
  w("falchion", "Falchion", 2, "sword",
    { model: "weapons/Sword_2", palette: "steel" },
    "Heavier at the tip than it looks, and quicker than it has any right to be.",
    { mods: { speed: 0.88, damage: 0.95 } }),
  w("boarspear", "Boar Spear", 2, "sword",
    { model: "weapons/Spear", palette: "iron", scale: 1.15 },
    "Made for something that charges. It does not much care what.",
    { mods: { range: 1.55, speed: 1.15, damage: 1.05 }, twoHanded: true }),
  w("longsword", "Longsword", 3, "sword",
    { model: "weapons/Sword", palette: "steel", scale: 1.12 },
    "The measure every other blade in the yard gets compared against."),
  w("greatsword", "Greatsword", 3, "sword",
    { model: "weapons/Sword_Big", palette: "steel" },
    "Two hands, and a stance you have to commit to.",
    { mods: { range: 1.2, speed: 1.4, damage: 1.5 }, twoHanded: true }),
  w("gildedblade", "Gilded Blade", 4, "sword",
    { model: "weapons/Sword_Golden", palette: "gold" },
    "Ceremonial, allegedly. The edge disagrees."),
  w("frostbrand", "Frostbrand", 5, "sword",
    { model: "weapons/Sword_Big", palette: "frost" },
    "Cold before you draw it, and colder after.",
    { mods: { range: 1.2, speed: 1.35, damage: 1.45 }, twoHanded: true }),
  w("claymore", "Bloodclaim Claymore", 5, "sword",
    { model: "weapons/Claymore", palette: "crimson" },
    "It has a name because it earned one.",
    { mods: { range: 1.25, speed: 1.45, damage: 1.6 }, twoHanded: true }),

  // ------------------------------------------------------------------- axes
  w("handaxe", "Hand Axe", 1, "axe",
    { model: "weapons/Axe_Small", palette: "iron" },
    "Cuts firewood on the way to the fight.",
    { mods: { speed: 0.85, damage: 0.85 } }),
  w("woodcutter", "Woodcutter's Axe", 2, "axe",
    { model: "weapons/Axe", palette: "steel" },
    "Honest work, redirected."),
  w("beardedaxe", "Bearded Axe", 3, "axe",
    { model: "weapons/Axe", palette: "bronze", scale: 1.1 },
    "The hook below the blade is for pulling shields aside.",
    { mods: { damage: 1.1 } }),
  w("twinbite", "Twinbite", 4, "axe",
    { model: "weapons/Axe_Double", palette: "steel" },
    "Two heads, so the swing back is still a swing.",
    { mods: { speed: 1.15, damage: 1.25 }, twoHanded: true }),
  w("reaperscythe", "Reaper's Scythe", 5, "axe",
    { model: "weapons/Scythe", palette: "obsidian" },
    "A farm tool that stopped pretending.",
    { mods: { range: 1.3, speed: 1.3, damage: 1.35 }, twoHanded: true }),

  // ------------------------------------------------------------------ maces
  w("smithhammer", "Smith's Hammer", 1, "mace",
    { model: "weapons/Hammer_Small", palette: "iron" },
    "Off the bench at the world's centre, where everything starts."),
  w("warhammer", "Warhammer", 3, "mace",
    { model: "weapons/Hammer_Small", palette: "steel", scale: 1.15 },
    "Armour does not have to be cut to stop working."),
  w("deepsledge", "Deepsledge", 4, "mace",
    { model: "weapons/Hammer_Double", palette: "steel" },
    "Slow enough to see coming. It does not help.",
    { mods: { speed: 1.3, damage: 1.45 }, twoHanded: true }),
  w("dawnbreaker", "Dawnbreaker", 5, "mace",
    { model: "weapons/Hammer_Double", palette: "gold" },
    "Struck at the right angle it rings for a long time.",
    { mods: { speed: 1.25, damage: 1.5 }, twoHanded: true }),

  // ------------------------------------------------------------------- bows
  // All two-handed, which is a rule about hands rather than about balance.
  w("hunterbow", "Hunter's Bow", 1, "bow",
    { model: "rig:Ranger/Ranger_Bow", palette: "wood" },
    "Drawn more often at deer than at anything that draws back.",
    { twoHanded: true }),
  w("shortbow", "Shortbow", 1, "bow",
    { model: "weapons/Bow_Wooden", palette: "wood" },
    "Quick to raise, short to reach.",
    { mods: { range: 0.85, speed: 0.85 }, twoHanded: true }),
  w("recurve", "Recurve Bow", 2, "bow",
    { model: "weapons/Bow_Wooden2", palette: "wood" },
    "The curve stores what your arm cannot.",
    { twoHanded: true }),
  w("yewlongbow", "Yew Longbow", 3, "bow",
    { model: "weapons/Bow_Wooden", palette: "bone", scale: 1.15 },
    "A slow draw and a long argument.",
    { mods: { range: 1.3, speed: 1.25, damage: 1.3 }, twoHanded: true }),
  w("gildedbow", "Gilded Bow", 4, "bow",
    { model: "weapons/Bow_Golden", palette: "gold" },
    "A gift to someone who would have preferred a plainer one.",
    { twoHanded: true }),
  w("ruinstring", "Ruinstring", 5, "bow",
    { model: "weapons/Bow_Evil", palette: "crimson" },
    "The string hums a half-tone flat and never goes slack.",
    { mods: { range: 1.15, damage: 1.2 }, twoHanded: true }),

  // ----------------------------------------------------------------- staves
  w("apprenticestaff", "Apprentice's Staff", 1, "staff",
    { model: "rig:Wizard/Wizard_Staff", palette: "wood" },
    "Mostly for leaning on. Mostly.",
    { twoHanded: true }),
  w("oakenstave", "Oaken Stave", 2, "staff",
    { model: "rig:Wizard/Wizard_Staff", palette: "bronze" },
    "Cut from something already struck by lightning once.",
    { twoHanded: true }),
  w("pilgrimstaff", "Pilgrim's Staff", 2, "staff",
    { model: "Cleric_Staff", palette: "bone" },
    "Carried a long way before it was ever pointed at anything.",
    { twoHanded: true }),
  w("runewood", "Runewood Staff", 4, "staff",
    { build: "crystalstave", palette: "arcane" },
    "The grain runs in shapes the tree did not grow.",
    { mods: { damage: 1.15 }, twoHanded: true }),
  w("starcaller", "Starcaller", 5, "staff",
    { build: "crystalstave", palette: "frost", scale: 1.1 },
    "Cold light, and it answers before you finish asking.",
    { mods: { range: 1.15, damage: 1.25 }, twoHanded: true }),

  // ------------------------------------------------------------------ wands
  w("birchrod", "Birch Rod", 1, "wand",
    { model: "rig:Wizard/Wizard_Staff", palette: "wood", scale: 0.5 },
    "Short, light, and honest about what it is."),
  w("emberwand", "Ember Wand", 3, "wand",
    { model: "Cleric_Staff", palette: "crimson", scale: 0.52 },
    "Warm at the tip whether or not you are casting.",
    { mods: { speed: 0.9 } }),
  w("arcwand", "Arcwand", 4, "wand",
    { build: "crystalstave", palette: "arcane", scale: 0.55 },
    "The crystal is not attached. It simply stays.",
    { mods: { speed: 0.85, damage: 1.1 } }),
];

// --- Off-hand ---------------------------------------------------------------
// New with the catalogue. The weapons pack ships five shields, and a shield is
// the one piece of gear whose value is obvious without reading a number — so
// the slot exists because there was art for it and a reason to want it, which
// is the right order for those two.
//
// Its primary rolls ARMOUR and its secondary EVASION, which makes it the only
// piece that defends twice. That is deliberately strong, and two-handed weapons
// are what pays for it: a greatsword, a bow and a staff all empty this slot.
const OFFHAND_BASES: ItemBase[] = [
  g("plankshield", "Plank Shield", "offhand", 1, null, "offhand-shield", "wood",
    "Boards, a strap, and optimism.",
    { art: { model: "weapons/Shield_Round", palette: "wood", scale: 0.55, lay: "flat" } }),
  g("roundshield", "Round Shield", "offhand", 2, null, "offhand-shield", "steel",
    "Rimmed in iron, which is the half that matters.",
    { art: { model: "weapons/Shield_Round_2", palette: "steel", scale: 0.55, lay: "flat" } }),
  g("kiteshield", "Kite Shield", "offhand", 3, null, "offhand-shield", "steel",
    "Long enough to cover the leg you keep forgetting about.",
    { art: { model: "weapons/Shield_Heater", palette: "steel", scale: 0.55, lay: "flat" } }),
  g("wardingfocus", "Warding Focus", "offhand", 3, null, "offhand-focus", "arcane",
    "Not a shield. It simply occupies the same argument.",
    { art: { model: "weapons/Shield_Round_2", palette: "arcane", scale: 0.42, lay: "flat" }, guard: 1.4 }),
  g("hunterquiver", "Hunter's Quiver", "offhand", 2, null, "offhand-quiver", "wood",
    "Twenty arrows and room for the ones you get back.",
    { art: { build: "quiver", palette: "wood" }, power: 0.6, guard: 1.6 }),
  g("bulwark", "Bulwark", "offhand", 4, null, "offhand-shield", "iron",
    "Heavy enough that standing still becomes a tactic.",
    { art: { model: "weapons/Shield_Heater_2", palette: "iron", scale: 0.55, lay: "flat" }, power: 1.25, guard: 0.7 }),
  g("verdantaegis", "Verdant Aegis", "offhand", 5, null, "offhand-shield", "gold",
    "The green stone in the boss is warm, and nobody will say why.",
    { art: { model: "weapons/Shield_Celtic_Golden", palette: "gold", scale: 0.55, lay: "flat" } }),
];

// --- Head -------------------------------------------------------------------
const HELM_BASES: ItemBase[] = [
  g("paddedcap", "Padded Cap", "helm", 1, "cap", "helm-cap", "wood",
    "Linen and wadding. Better than a bare head, barely."),
  g("leatherhood", "Leather Hood", "helm", 1, "hood", "helm-hood", "wood",
    "Keeps the rain off, and your face out of the story.",
    { power: 0.8, guard: 1.4 }),
  g("ironcap", "Iron Cap", "helm", 2, "cap", "helm-cap", "iron",
    "A bowl with a strap. Unglamorous, and it works."),
  g("rangerhood", "Ranger's Hood", "helm", 3, "hood", "helm-hood", "verdant",
    "Dyed for a forest that has since burned down.",
    { power: 0.8, guard: 1.5 }),
  g("greathelm", "Great Helm", "helm", 3, "full", "helm-full", "steel",
    "You will hear less and mind it less than you expect.",
    { power: 1.25, guard: 0.7 }),
  g("hornedhelm", "Horned Helm", "helm", 4, "horned", "helm-horned", "bronze",
    "Impractical, intimidating, and those are not unrelated."),
  g("silvercirclet", "Silver Circlet", "helm", 4, "circlet", "helm-circlet", "silver",
    "No protection to speak of. It is not for protection.",
    { power: 0.5, guard: 1.9 }),
  g("dreadhelm", "Dread Helm", "helm", 5, "full", "helm-full", "obsidian",
    "The visor slit is narrower than it needs to be.",
    { power: 1.3, guard: 0.7 }),
];

// --- Chest ------------------------------------------------------------------
const ARMOR_BASES: ItemBase[] = [
  g("travellerrags", "Traveller's Rags", "armor", 1, "robe", "armor-robe", "wood",
    "Cloth, and the memory of cloth.",
    { power: 0.7, guard: 1.5 }),
  g("leatherjerkin", "Leather Jerkin", "armor", 1, "leather", "armor-leather", "bronze",
    "Boiled hard. Smells like it, too."),
  g("scalemail", "Scale Mail", "armor", 2, "scale", "armor-scale", "bronze",
    "Overlapping plates on a backing that will outlast them."),
  g("chainmail", "Chain Mail", "armor", 3, "chain", "armor-chain", "iron",
    "Four thousand rings, and every one of them somebody's afternoon."),
  g("brigandine", "Brigandine", "armor", 3, "brigandine", "armor-brigandine", "steel",
    "Plates riveted inside the cloth, where they cannot be counted.",
    { power: 1.1, guard: 0.9 }),
  g("adeptrobe", "Adept's Robe", "armor", 3, "robe", "armor-robe", "arcane",
    "Weighs nothing and stops nothing. That is the trade.",
    { power: 0.6, guard: 1.8 }),
  g("platemail", "Plate Mail", "armor", 4, "plate", "armor-plate", "steel",
    "Fitted to somebody. Possibly not to you.",
    { power: 1.3, guard: 0.6 }),
  g("dragonscale", "Dragonscale Plate", "armor", 5, "scale", "armor-scale", "crimson",
    "Still warm in the middle, on cold days.",
    { power: 1.25, guard: 0.8 }),
  g("archmagerobe", "Archmage's Robe", "armor", 5, "robe", "armor-robe", "arcane",
    "The hem does not quite touch the ground.",
    { power: 0.6, guard: 1.9 }),
];

// --- Feet -------------------------------------------------------------------
const BOOTS_BASES: ItemBase[] = [
  g("wornsandals", "Worn Sandals", "boots", 1, "low", "boots-low", "wood",
    "Two straps and a plank of luck.",
    { power: 0.7, guard: 1.3 }),
  g("leatherboots", "Leather Boots", "boots", 1, "low", "boots-low", "bronze",
    "Broken in by somebody with slightly different feet."),
  g("travelboots", "Traveller's Boots", "boots", 2, "tall", "boots-tall", "wood",
    "Tall enough for the mud, which is most of the road.",
    { guard: 1.3 }),
  g("wrappedsabatons", "Wrapped Sabatons", "boots", 3, "wrapped", "boots-wrapped", "iron",
    "Cloth over steel, so they only sound like one man."),
  g("platedgreaves", "Plated Greaves", "boots", 4, "plated", "boots-plated", "steel",
    "You will be heard. You will also be standing.",
    { power: 1.4, guard: 0.6 }),
  g("striderboots", "Strider's Boots", "boots", 5, "tall", "boots-tall", "verdant",
    "The ground is a little further behind you than it was.",
    { power: 0.8, guard: 1.7 }),
];

// --- Back -------------------------------------------------------------------
const CAPE_BASES: ItemBase[] = [
  g("torncloak", "Torn Cloak", "cape", 1, "cape", "cape-cape", "wood",
    "It was somebody's, and then it was weather's."),
  g("woolcloak", "Wool Cloak", "cape", 2, "cloak", "cape-cloak", "bronze",
    "Heavy, warm, and it holds the rain for hours."),
  g("guardtabard", "Guard's Tabard", "cape", 3, "tabard", "cape-tabard", "crimson",
    "The colours of a garrison that stopped mustering.",
    { power: 1.3, guard: 0.7 }),
  g("wardenmantle", "Warden's Mantle", "cape", 4, "mantle", "cape-mantle", "verdant",
    "Shoulders reinforced, because that is where things land."),
  g("shadowveil", "Shadowveil", "cape", 5, "cloak", "cape-cloak", "obsidian",
    "It settles a moment after you stop moving.",
    { power: 0.7, guard: 1.8 }),
];

// --- Rings ------------------------------------------------------------------
// The one slot with nothing to draw. They are still named things with their own
// numbers, because "a rare ring" was exactly the anonymity this catalogue exists
// to remove — and because a ring is the purest version of the choice: no
// silhouette, no style, only what it does.
const RING_BASES: ItemBase[] = [
  g("copperband", "Copper Band", "ring", 1, null, "ring-band", "bronze",
    "Green where it touches you. Harmless, probably."),
  g("boneRing", "Bone Ring", "ring", 1, null, "ring-bone", "bone",
    "Carved from something that had a name once."),
  g("ironsignet", "Iron Signet", "ring", 2, null, "ring-signet", "iron",
    "The seal is worn flat. Whatever it authorised is over."),
  g("hawkeye", "Hawkeye Ring", "ring", 3, null, "ring-gem", "gold",
    "A yellow stone, and things stay in focus further out.",
    { power: 0.7, guard: 1.7 }),
  g("bloodstone", "Bloodstone Ring", "ring", 4, null, "ring-gem", "crimson",
    "Warm on the strike, cold the rest of the time.",
    { power: 1.4, guard: 0.6 }),
  g("runedloop", "Runed Loop", "ring", 5, null, "ring-rune", "arcane",
    "No join, no seam, and nobody will explain how it was made."),
];

// --- Filling out the materials ----------------------------------------------
// Added when matched gear arrived and the test refused eight of the twelve
// sets: a five-piece bonus is not a bonus if the catalogue only has that
// material in two slots. So every palette a set is written for now exists in at
// least five, which is a rule `tools/test/items.mjs` checks rather than trusts.
//
// They are not filler. Each one is the piece its kit was missing — a silver
// circlet with nothing silver to wear under it was a promise the catalogue did
// not keep.
const KIT_BASES: ItemBase[] = [
  // ---------------------------------------------------------------- silver
  g("silvermail", "Silvered Mail", "armor", 4, "chain", "armor-chain", "silver",
    "Rings washed bright. It does not tarnish and nobody knows why."),
  g("silvergreaves", "Silvered Greaves", "boots", 4, "plated", "boots-plated", "silver",
    "You can see the road in them, upside down."),
  g("silvermantle", "Silvered Mantle", "cape", 4, "mantle", "cape-mantle", "silver",
    "Thread-of-silver at the hem, worn thin at the shoulder."),
  g("silverring", "Silver Band", "ring", 3, null, "ring-band", "silver",
    "Plain, cold, and slightly too large for whoever it was made for."),
  g("silverbuckler", "Silvered Buckler", "offhand", 4, null, "offhand-shield", "silver",
    "Small enough to be quick, bright enough to be seen.",
    { art: { model: "weapons/Shield_Round_2", palette: "silver", scale: 0.5, lay: "flat" } }),

  // ------------------------------------------------------------------ gold
  g("gildedcrown", "Gilded Crown", "helm", 5, "circlet", "helm-circlet", "gold",
    "Somebody was crowned in this. It did not help them.",
    { power: 0.5, guard: 1.9 }),
  g("gildedplate", "Gilded Plate", "armor", 5, "plate", "armor-plate", "gold",
    "Parade armour that has clearly been in a fight.",
    { power: 1.25, guard: 0.7 }),
  g("gildedsandals", "Gilded Sandals", "boots", 4, "low", "boots-low", "gold",
    "Impractical, and the straps are real gold thread."),

  // -------------------------------------------------------------- obsidian
  g("blackglassmail", "Blackglass Mail", "armor", 5, "scale", "armor-scale", "obsidian",
    "Scales that drink the light. Cold even in the sun.",
    { power: 1.2, guard: 0.85 }),
  g("blackglassboots", "Blackglass Treads", "boots", 5, "wrapped", "boots-wrapped", "obsidian",
    "They make no sound at all, which takes some getting used to.",
    { power: 0.8, guard: 1.6 }),
  g("blackglassring", "Blackglass Ring", "ring", 5, null, "ring-rune", "obsidian",
    "A band of something that is not stone and is not metal."),

  // ------------------------------------------------------------------ bone
  g("bonehelm", "Bone Helm", "helm", 3, "horned", "helm-horned", "bone",
    "It still has the horns. That was not an accident."),
  g("bonecuirass", "Bone Cuirass", "armor", 3, "brigandine", "armor-brigandine", "bone",
    "Plates of something's ribs, laced into leather.",
    { power: 1.05, guard: 0.95 }),
  g("bonecloak", "Charnel Cloak", "cape", 4, "cloak", "cape-cloak", "bone",
    "Weighted at the hem with small pale things."),

  // ----------------------------------------------------------------- frost
  g("rimehelm", "Rimeward Helm", "helm", 5, "full", "helm-full", "frost",
    "The visor has frost on the inside.",
    { power: 1.2, guard: 0.75 }),
  g("rimerobe", "Rimeward Robe", "armor", 5, "robe", "armor-robe", "frost",
    "It never quite dries, and it is never quite wet.",
    { power: 0.6, guard: 1.85 }),
  g("rimeboots", "Rimeward Boots", "boots", 5, "tall", "boots-tall", "frost",
    "Where you stood is still cold an hour later.",
    { power: 0.8, guard: 1.65 }),
  g("rimering", "Rimewrought Ring", "ring", 4, null, "ring-gem", "frost",
    "A pale stone that will not warm to the touch."),

  // --------------------------------------------------------------- verdant
  g("wardenjerkin", "Warden's Jerkin", "armor", 4, "leather", "armor-leather", "verdant",
    "Dyed in something that grew, and it still smells faintly of it."),

  // --------------------------------------------------------------- crimson
  g("bloodwroughthelm", "Bloodwrought Helm", "helm", 5, "full", "helm-full", "crimson",
    "The red is not paint and does not wash out.",
    { power: 1.25, guard: 0.7 }),

  // ---------------------------------------------------------------- arcane
  g("weavewornboots", "Weaveworn Slippers", "boots", 4, "low", "boots-low", "arcane",
    "They leave no prints, which is either useful or unsettling.",
    { power: 0.7, guard: 1.7 }),

  // ------------------------------------------------------------------ iron
  g("ironcloak", "Ironweave Cloak", "cape", 3, "cape", "cape-cape", "iron",
    "Rings sewn between the layers. Heavy, and it has stopped things."),

  // ----------------------------------------------------------------- steel
  g("steelring", "Steel Signet", "ring", 4, null, "ring-signet", "steel",
    "The seal of a garrison that no longer musters."),

  // ---------------------------------------------------------------- bronze
  g("bronzehelm", "Bronze Cap", "helm", 2, "cap", "helm-cap", "bronze",
    "Older than the iron beside it, and it has outlasted three owners."),
  g("bronzeboots", "Bronze-shod Boots", "boots", 3, "plated", "boots-plated", "bronze",
    "Plated at the toe, which is where things land."),
  g("bronzering", "Bronze Torc", "ring", 2, null, "ring-band", "bronze",
    "Not really a ring. It is worn on the arm and nobody has objected."),

  // ------------------------------------------------------------------ wood
  g("woodcap", "Woodsman's Cap", "helm", 2, "hood", "helm-hood", "wood",
    "Waxed canvas, and one repair too many.",
    { power: 0.8, guard: 1.4 }),
  g("woodring", "Carved Ring", "ring", 1, null, "ring-bone", "wood",
    "Whittled over one long winter."),
  g("woodoffhand", "Bundled Kindling", "offhand", 1, null, "offhand-quiver", "wood",
    "Strapped at the hip. Better than an empty hand, marginally.",
    // Not 0.5: a band-1 off-hand at half power rounds to 1, and a stat of 1 is
    // a stat that cannot get worse — which makes Broken indistinguishable from
    // Honed on it, and the bottom of the ladder meaningless for that one item.
    { art: { build: "quiver", palette: "wood" }, power: 0.9, guard: 1.4 }),
];

/** Every base item in the game, by id. */
export const ITEM_BASES: Record<string, ItemBase> = Object.fromEntries(
  [
    ...WEAPON_BASES,
    ...OFFHAND_BASES,
    ...HELM_BASES,
    ...ARMOR_BASES,
    ...BOOTS_BASES,
    ...CAPE_BASES,
    ...RING_BASES,
    ...KIT_BASES,
  ].map((b) => [b.id, b]),
);

export const ITEM_BASE_IDS: string[] = Object.keys(ITEM_BASES);

/** Grouped by slot, and by band inside that, so the loot roller and the forge
 *  can both ask "what is there for this slot at this depth" without filtering
 *  the whole catalogue on every roll. */
export const BASES_BY_SLOT: Record<ItemSlot, ItemBase[]> = Object.fromEntries(
  ITEM_SLOTS.map((slot) => [slot, Object.values(ITEM_BASES).filter((b) => b.slot === slot)]),
) as Record<ItemSlot, ItemBase[]>;

/**
 * The fallback, for an instance whose base has been removed from the
 * catalogue since it was saved. It resolves rather than throwing because the
 * alternative is a character who cannot log in, and a bag full of "Lost Relic"
 * is a recoverable state.
 */
export const UNKNOWN_BASE: ItemBase = {
  id: "unknown",
  name: "Lost Relic",
  slot: "ring",
  band: 1,
  icon: "ring-band",
  art: { palette: "iron" },
  flavour: "Nobody remembers what this was for.",
};

export function itemBase(baseId: string | undefined | null): ItemBase {
  return (baseId && ITEM_BASES[baseId]) || UNKNOWN_BASE;
}

// --- Affixes ----------------------------------------------------------------
// What an item rolled ON TOP of being what it is.
//
// The whole vocabulary is `PassiveBonus` — the same bag of modifiers the talent
// trees already total. That is not tidiness: it means an affix needs no new
// plumbing anywhere. Combat resolution already reads `passives.critChance`, the
// character sheet already displays it, and `applyDamagePercent` already knows
// what to do with a percentage. A separate affix vocabulary would have meant
// teaching every one of those about a second source, which is exactly how helm
// and cape once came to roll stats that nothing ever read.
//
// A prefix goes in front of the base name and a suffix after it, so an item
// reads as a thing rather than as a list: "Forged Keen Greatsword of the Bear".

export interface AffixDef {
  id: string;
  /** As it appears in the name. Suffixes carry their own "of the". */
  label: string;
  kind: "prefix" | "suffix";
  /** Which slots may roll it. Absent means any. */
  slots?: ItemSlot[];
  /** Lowest band that may roll it, so band-1 gear cannot land an archmage's
   *  affix and make the first hour the best one. */
  minBand: ItemBand;
  /** Magnitude per band. Multiplied by the item's band, so one row scales
   *  across the whole game rather than needing five copies of itself. */
  per: PassiveBonus;
}

export const AFFIXES: AffixDef[] = [
  // --- prefixes: how it is made -------------------------------------------
  { id: "keen", label: "Keen", kind: "prefix", minBand: 1, per: { critChance: 1.2 } },
  { id: "cruel", label: "Cruel", kind: "prefix", minBand: 2, per: { critDamagePercent: 4 } },
  { id: "swift", label: "Swift", kind: "prefix", minBand: 1, per: { attackSpeedPercent: 1.4 } },
  { id: "heavy", label: "Heavy", kind: "prefix", minBand: 1, per: { damagePercent: 1.8 } },
  { id: "warded", label: "Warded", kind: "prefix", minBand: 1, per: { armor: 0.9 } },
  { id: "supple", label: "Supple", kind: "prefix", minBand: 1, per: { evasion: 1.1 } },
  { id: "stout", label: "Stout", kind: "prefix", minBand: 1, per: { maxHpBonus: 4 } },
  { id: "true", label: "True", kind: "prefix", minBand: 1, per: { accuracyBonus: 1.6 } },
  { id: "reaching", label: "Reaching", kind: "prefix", slots: ["weapon"], minBand: 3, per: { rangePercent: 1.5 } },
  { id: "attuned", label: "Attuned", kind: "prefix", minBand: 3, per: { skillPowerPercent: 1.6 } },
  { id: "rapid", label: "Rapid", kind: "prefix", minBand: 3, per: { cooldownPercent: 1.1 } },
  { id: "thrifty", label: "Thrifty", kind: "prefix", minBand: 2, per: { manaCostPercent: 1.4 } },
  { id: "fleet", label: "Fleet", kind: "prefix", slots: ["boots", "cape"], minBand: 1, per: { moveSpeedBonus: 5 } },

  // --- suffixes: what is in it ---------------------------------------------
  { id: "bear", label: "of the Bear", kind: "suffix", minBand: 1, per: { maxHpBonus: 5, armor: 0.4 } },
  { id: "fox", label: "of the Fox", kind: "suffix", minBand: 1, per: { evasion: 1.3 } },
  { id: "hawk", label: "of the Hawk", kind: "suffix", minBand: 1, per: { accuracyBonus: 2 } },
  { id: "boar", label: "of the Boar", kind: "suffix", minBand: 2, per: { damagePercent: 1.5, maxHpBonus: 3 } },
  { id: "adder", label: "of the Adder", kind: "suffix", minBand: 2, per: { critChance: 0.9, critDamagePercent: 3 } },
  { id: "stag", label: "of the Stag", kind: "suffix", minBand: 2, per: { moveSpeedBonus: 4, evasion: 0.6 } },
  { id: "wellspring", label: "of the Wellspring", kind: "suffix", minBand: 2, per: { maxManaBonus: 7 } },
  { id: "current", label: "of Flowing", kind: "suffix", minBand: 3, per: { manaRegenBonus: 0.7 } },
  { id: "leech", label: "of the Leech", kind: "suffix", minBand: 3, per: { healOnKill: 1.4 } },
  { id: "mountain", label: "of the Mountain", kind: "suffix", minBand: 3, per: { armor: 1.1, maxHpBonus: 3 } },
  { id: "tempest", label: "of the Tempest", kind: "suffix", minBand: 4, per: { attackSpeedPercent: 1.2, damagePercent: 1.2 } },
  { id: "archive", label: "of the Archive", kind: "suffix", minBand: 4, per: { skillPowerPercent: 1.4, maxManaBonus: 5 } },
];

export const AFFIXES_BY_ID: Record<string, AffixDef> = Object.fromEntries(
  AFFIXES.map((a) => [a.id, a]),
);

/** What one affix contributes on an item of a given band. */
export function affixBonus(affix: AffixDef, band: ItemBand): PassiveBonus {
  const out: PassiveBonus = {};
  for (const key of Object.keys(affix.per) as (keyof PassiveBonus)[]) {
    const raw = (affix.per[key] ?? 0) * band;
    // Rounded to a tenth rather than to an integer: several of these are small
    // per-band values that would round to zero on band 1 and make the affix a
    // lie on exactly the items a new player is reading most carefully.
    out[key] = Math.round(raw * 10) / 10;
  }
  return out;
}

/**
 * How a bag of modifiers reads, e.g. "+3 armour, +15 maximum health".
 *
 * One vocabulary for what a modifier DOES, shared by affixes, set bonuses and
 * anything else that ever grants a `PassiveBonus` — so two sources that both
 * give armour say "armour" the same way, in the same order, everywhere.
 */
export function passiveSummary(bonus: PassiveBonus): string {
  const parts: string[] = [];
  for (const key of Object.keys(bonus) as (keyof PassiveBonus)[]) {
    const v = bonus[key] ?? 0;
    if (!v) continue;
    parts.push(`${v > 0 ? "+" : ""}${v}${PASSIVE_UNIT[key]} ${PASSIVE_LABEL[key]}`);
  }
  return parts.join(", ");
}

/** How an affix reads in a tooltip, at the band of the item carrying it. */
export function affixSummary(affix: AffixDef, band: ItemBand): string {
  return passiveSummary(affixBonus(affix, band));
}

const PASSIVE_LABEL: Record<keyof PassiveBonus, string> = {
  armor: "armour",
  critChance: "crit chance",
  maxManaBonus: "maximum mana",
  manaRegenBonus: "mana regen",
  moveSpeedBonus: "movement",
  healOnKill: "health on kill",
  evasion: "evasion",
  maxHpBonus: "maximum health",
  accuracyBonus: "accuracy",
  damagePercent: "damage",
  attackSpeedPercent: "attack speed",
  critDamagePercent: "crit damage",
  rangePercent: "reach",
  skillPowerPercent: "skill power",
  manaCostPercent: "mana cost",
  cooldownPercent: "cooldown",
};

const PASSIVE_UNIT: Record<keyof PassiveBonus, string> = {
  armor: "", critChance: "%", maxManaBonus: "", manaRegenBonus: "", moveSpeedBonus: "",
  healOnKill: "", evasion: "", maxHpBonus: "", accuracyBonus: "",
  damagePercent: "%", attackSpeedPercent: "%", critDamagePercent: "%", rangePercent: "%",
  skillPowerPercent: "%", manaCostPercent: "%", cooldownPercent: "%",
};

// --- Rolling ----------------------------------------------------------------

/**
 * Which quality a drop comes out at.
 *
 * Weighted toward the bottom of the ladder on purpose: Enchanted is one in
 * eighty-odd, and the ladder only means anything if its top is somewhere you
 * mostly arrive by reforging rather than by luck.
 */
export function rollRarity(random: () => number = Math.random): ItemRarity {
  const total = RARITY_ORDER.reduce((sum, r) => sum + RARITIES[r].weight, 0);
  let roll = random() * total;
  for (const rarity of RARITY_ORDER) {
    roll -= RARITIES[rarity].weight;
    if (roll <= 0) return rarity;
  }
  return "worn";
}

export function rarityIndex(rarity: ItemRarity): number {
  const i = RARITY_ORDER.indexOf(rarity);
  return i < 0 ? RARITY_ORDER.indexOf("honed") : i;
}

/** Never below the floor. Bosses use this so a guaranteed drop is worth the fight. */
export function rollRarityWithFloor(
  floor: ItemRarity,
  random: () => number = Math.random,
): ItemRarity {
  const rolled = rollRarity(random);
  return rarityIndex(rolled) >= rarityIndex(floor) ? rolled : floor;
}

// --- What a thing is carrying -----------------------------------------------
// Loot was rolled from the band alone, which meant a dragon could hand you a
// plank shield and a slime could hand you dragonscale. The band is the right
// measure of HOW GOOD a drop is and it says nothing at all about WHAT — so the
// catalogue felt like a table the world drew from rather than like things the
// world was made of.
//
// Two additions, and neither changes how strong loot is:
//
//   AFFINITY biases which material drops. A golem is iron and steel, a ghost is
//   bone and blackglass, a dragon is crimson. Bias rather than restriction:
//   anything in the band can still drop, so a camp never becomes a vending
//   machine for one palette, and the matched-gear sets stay assemblable by
//   playing rather than by farming one spot.
//
//   A SIGNATURE is the one item a kind is known for, and only bosses have one.
//   It is the oldest hook in the genre — "I want that, so I am going to go and
//   kill that" — and the game had nothing like it: every drop was equally
//   likely to come from anywhere. Weighted rather than guaranteed, because a
//   certainty is a shopping trip.

export interface MonsterLoot {
  /** Materials this kind tends to carry. Weighted, never exclusive. */
  palettes: PaletteId[];
  /** The one thing it is known for. Bosses only — see `guaranteedDrop`. */
  signature?: string;
}

export const MONSTER_LOOT: Record<MonsterKind, MonsterLoot> = {
  // band 1 — whatever was lying around
  slime: { palettes: ["wood", "bronze"] },
  mushnub: { palettes: ["wood", "verdant"] },

  // band 2
  spikyblob: { palettes: ["bone", "verdant"] },
  goblin: { palettes: ["iron", "bronze"] },
  armabee: { palettes: ["verdant", "wood"] },

  // band 3
  wolf: { palettes: ["bone", "wood"] },
  cactoro: { palettes: ["verdant", "bronze"] },
  orcbrute: { palettes: ["iron", "steel"] },

  // band 4
  ghost: { palettes: ["bone", "obsidian"] },
  troll: { palettes: ["iron", "bone"], signature: "bulwark" },
  demon: { palettes: ["crimson", "obsidian"] },

  // band 5 — the far corners, and the three things worth going for
  golem: { palettes: ["iron", "steel"], signature: "deepsledge" },
  dragon: { palettes: ["crimson", "gold"], signature: "dragonscale" },
};

/**
 * How much more likely a kind's own materials are than anything else.
 *
 * Three is enough to be felt across an evening and not enough to make a camp
 * predictable — which is the line this whole system is trying to walk. Worth
 * tuning by playing rather than by reasoning.
 */
const AFFINITY_WEIGHT = 3;

/** How much of a boss's drop is its signature. A third: often enough to be a
 *  reason to go, rare enough that going is still a decision. */
const SIGNATURE_CHANCE = 0.34;

/**
 * Which base item a kill drops.
 *
 * Two independent weightings, and keeping them independent is the point:
 *
 *   THE BAND decides how good. Weighted around the monster's own band rather
 *   than restricted to it, so the world is not five sealed loot tables — most
 *   of what a band-3 camp drops is band 3, but band 2 and band 4 both turn up,
 *   and the band-4 piece is what makes walking one ring further out feel like
 *   it paid.
 *
 *   THE KIND decides what it is made of. A golem carries iron and steel, a
 *   ghost bone and blackglass. Bias, never restriction: anything in the band
 *   can still drop, so a camp is not a vending machine for one palette and the
 *   matched-gear sets stay assemblable by playing rather than by farming one
 *   spot.
 *
 * `kind` is optional because the forge and the tests roll without one, and a
 * roll with no monster behind it should be the plain band roll rather than an
 * arbitrary default.
 */
export function rollBase(
  band: ItemBand,
  kind?: MonsterKind,
  random: () => number = Math.random,
): ItemBase {
  const loot = kind ? MONSTER_LOOT[kind] : undefined;

  // A boss's signature, before anything else. Weighted rather than guaranteed:
  // a certainty turns the fight into a shopping trip.
  if (loot?.signature && random() < SIGNATURE_CHANCE) {
    const signature = ITEM_BASES[loot.signature];
    if (signature) return signature;
  }

  const affinity = new Set(loot?.palettes ?? []);
  const pool: ItemBase[] = [];
  for (const base of Object.values(ITEM_BASES)) {
    const distance = Math.abs(base.band - band);
    if (distance > 1) continue;
    // Three entries for the band itself, one for each neighbour, times three
    // again for anything made of what this creature is made of.
    let weight = distance === 0 ? 3 : 1;
    if (affinity.has(base.art.palette)) weight *= AFFINITY_WEIGHT;
    for (let i = 0; i < weight; i++) pool.push(base);
  }
  if (pool.length === 0) return UNKNOWN_BASE;
  return pool[Math.floor(random() * pool.length)];
}

/** The affixes an item of this base and quality rolls. */
/** Which affixes may appear on this base at all. */
export function eligibleAffixes(base: ItemBase): AffixDef[] {
  return AFFIXES.filter(
    (a) => a.minBand <= base.band && (!a.slots || a.slots.includes(base.slot)),
  );
}

/**
 * Whether the player gets to name one of the affixes at this quality.
 *
 * The top two steps only, and that is what makes the ladder's names mean
 * something: a Runed item is one somebody cut the marks into deliberately. Below
 * that a reforge is still a re-roll, so the climb is a gamble that becomes a
 * decision — which is a far better shape than either being true the whole way
 * up. A ladder that is all gamble is a slot machine; one that is all choice is
 * a shopping list.
 */
export function canChooseAffix(rarity: ItemRarity): boolean {
  return rarity === "runed" || rarity === "enchanted";
}

export function rollAffixes(
  base: ItemBase,
  rarity: ItemRarity,
  random: () => number = Math.random,
  /** One the player has asked for. Ignored unless the quality allows it and
   *  the affix could have rolled on this item anyway — the choice is which of
   *  its own affixes it gets, never a way past the eligibility rules. */
  chosen?: string,
): string[] {
  const count = RARITIES[rarity]?.affixes ?? 0;
  if (count <= 0) return [];
  const eligible = eligibleAffixes(base);
  const picked: string[] = [];
  const pool = [...eligible];

  if (chosen && canChooseAffix(rarity)) {
    const idx = pool.findIndex((a) => a.id === chosen);
    if (idx >= 0) {
      picked.push(pool[idx].id);
      pool.splice(idx, 1);
    }
  }

  while (picked.length < count && pool.length > 0) {
    const idx = Math.floor(random() * pool.length);
    picked.push(pool[idx].id);
    // Removed rather than re-rolled: two copies of "Keen" on one item is a
    // number that should have been one number.
    pool.splice(idx, 1);
  }
  return picked;
}

/**
 * Everything about a new item, given what dropped it. The one place an item
 * comes into existence, so the forge and the loot roller cannot disagree about
 * what a Tempered Falchion is.
 */
export function rollItem(
  base: ItemBase,
  rarity: ItemRarity,
  random: () => number = Math.random,
  chosenAffix?: string,
): Omit<ItemInstance, "id" | "equipped"> {
  const power = RARITIES[rarity]?.power ?? 1;
  // A tenth either way, so two of the same item are not literally identical
  // while the difference stays too small to farm for.
  const jitter = () => 0.92 + random() * 0.16;
  return {
    baseId: base.id,
    slot: base.slot,
    rarity,
    statValue: Math.max(0, Math.round(basePower(base) * power * jitter())),
    bonusStatValue: Math.max(0, Math.round(baseGuard(base) * power * jitter())),
    affixes: rollAffixes(base, rarity, random, chosenAffix),
    weaponType: base.weaponType,
    style: base.style,
  };
}

// --- Reading an item --------------------------------------------------------

/**
 * The full name: quality, prefix, base, suffix.
 *
 * Built rather than stored, so renaming a base item or rebalancing an affix
 * renames every instance already in every bag — the alternative is a database
 * full of strings that used to be true.
 */
export function itemName(item: Pick<ItemInstance, "baseId" | "rarity" | "affixes">): string {
  const base = itemBase(item.baseId);
  const affixes = (item.affixes ?? []).map((id) => AFFIXES_BY_ID[id]).filter(Boolean);
  const prefix = affixes.find((a) => a.kind === "prefix");
  const suffix = affixes.find((a) => a.kind === "suffix");
  const quality = RARITIES[item.rarity]?.name ?? "";
  return [quality, prefix?.label, base.name, suffix?.label].filter(Boolean).join(" ");
}

/** The name without the quality word, for places that show quality separately. */
export function itemShortName(item: Pick<ItemInstance, "baseId" | "affixes">): string {
  const base = itemBase(item.baseId);
  const affixes = (item.affixes ?? []).map((id) => AFFIXES_BY_ID[id]).filter(Boolean);
  const prefix = affixes.find((a) => a.kind === "prefix");
  const suffix = affixes.find((a) => a.kind === "suffix");
  return [prefix?.label, base.name, suffix?.label].filter(Boolean).join(" ");
}

/** What one item's affixes add up to. */
export function itemPassives(item: Pick<ItemInstance, "baseId" | "affixes">): Required<PassiveBonus> {
  const base = itemBase(item.baseId);
  const total = { ...EMPTY_PASSIVES };
  for (const id of item.affixes ?? []) {
    const affix = AFFIXES_BY_ID[id];
    if (affix) addPassives(total, affixBonus(affix, base.band));
  }
  return total;
}

/**
 * What everything you are WEARING adds up to.
 *
 * Threaded into the server's `passivesOf` beside the talent totals, which is
 * the single funnel every combat number already flows through — so an affix
 * reaches damage, accuracy, armour, mana and cooldowns without any of those
 * learning that gear exists.
 */
export function gearPassives(eq: EquippedGear | undefined): Required<PassiveBonus> {
  const total = { ...EMPTY_PASSIVES };
  if (!eq) return total;
  for (const slot of ITEM_SLOTS) {
    const item = eq[slot];
    if (item) addPassives(total, itemPassives(item));
  }
  // Matched gear totals in here rather than anywhere else, so a set bonus is
  // the same kind of thing as an affix all the way down and reaches combat
  // through the funnel talents already use.
  addPassives(total, setPassives(eq));
  return total;
}

/** Weapon tuning from the held item, on top of its family's. One place, so the
 *  client's stat sheet and the server's swing timer agree. */
export function weaponModsOf(item: ItemInstance | null | undefined): Required<WeaponMods> {
  const mods = item ? itemBase(item.baseId).mods : undefined;
  return { range: mods?.range ?? 1, speed: mods?.speed ?? 1, damage: mods?.damage ?? 1 };
}

/** Whether this item empties the off-hand. */
export function isTwoHanded(item: ItemInstance | null | undefined): boolean {
  return !!item && !!itemBase(item.baseId).twoHanded;
}

/**
 * A single number for "how good is this", for sorting a bag and for the Gear
 * figure on the character sheet. Deliberately crude: it exists to order a list,
 * not to be optimised against.
 */
export function itemScore(item: ItemInstance): number {
  const base = itemBase(item.baseId);
  const affixWeight = (item.affixes?.length ?? 0) * 4;
  return item.statValue * 2 + item.bonusStatValue + affixWeight + base.band * 3;
}

// --- The bag stacks ---------------------------------------------------------
// Thirty flat cells was the right shape while the catalogue was three rarities
// of five slots. At a hundred and seven bases with a seven-step ladder on top,
// a farm at one camp fills the bag with six copies of the same Worn dirk, and
// each of them takes a cell of its own — so the bag reports itself full while
// showing the player six pictures of one thing.
//
// A BAG SLOT HOLDS A KIND, NOT AN INSTANCE.
//
// The kind is what the player actually reads off the item: its base, its
// quality, and its affixes — which is precisely its NAME. Two things with the
// same name are interchangeable to the person carrying them, and the tenth of a
// point of jitter between their rolls is not a reason to spend a second cell on
// one of them. Anything that differs in a way the name shows — a Keen one, a
// Tempered one — is a different thing and stacks apart, which is the honest
// line and needs no separate rule.
//
// The cap moves with it, onto slots. Grouping the display while leaving the cap
// counting instances would be worse than not grouping at all: the grid would
// show empty cells and the game would still refuse the drop. And equipped
// items stop counting, which they always should have — the bag's own readout
// has excluded them since it was written, so the panel and the rule disagreed
// by seven whenever a character was dressed.

/** How many of one kind share a cell. One digit, so the badge stays a badge —
 *  and finite, so a bag is still something that fills up. */
export const STACK_LIMIT = 9;

/**
 * What decides whether two items share a cell.
 *
 * Base, quality and affixes — the three things `itemName` is built from, in a
 * form that sorts. Affixes are sorted before joining because the roll order is
 * an accident of the dice and two items with the same two affixes in the other
 * order are the same item.
 */
export function stackKeyOf(item: Pick<ItemInstance, "baseId" | "rarity" | "affixes">): string {
  const affixes = [...(item.affixes ?? [])].sort().join(",");
  return `${item.baseId}|${item.rarity}|${affixes}`;
}

export interface BagStack {
  key: string;
  /** Every instance in this cell, best first. Never longer than `STACK_LIMIT`. */
  items: ItemInstance[];
  /** The one a click acts on: the best-rolled of the pile. */
  best: ItemInstance;
  count: number;
}

/**
 * The bag as cells rather than as rows.
 *
 * Equipped items are not in it: they are worn, not carried. A kind with more
 * than `STACK_LIMIT` copies spills into a second cell rather than showing a
 * count the cell cannot hold, which keeps "a cell is a slot" true — the whole
 * point of moving the cap here.
 */
export function bagStacks(items: ItemInstance[]): BagStack[] {
  const groups = new Map<string, ItemInstance[]>();
  const order: string[] = [];
  for (const item of items) {
    if (item.equipped) continue;
    const key = stackKeyOf(item);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
      order.push(key);
    }
    group.push(item);
  }

  const stacks: BagStack[] = [];
  for (const key of order) {
    // Best first, so the instance a click equips is the one the cell's numbers
    // describe. Ties break on id purely so the order is stable across renders.
    const group = groups.get(key)!.sort((a, b) => itemScore(b) - itemScore(a) || a.id.localeCompare(b.id));
    for (let i = 0; i < group.length; i += STACK_LIMIT) {
      const slice = group.slice(i, i + STACK_LIMIT);
      stacks.push({ key, items: slice, best: slice[0], count: slice.length });
    }
  }
  return stacks;
}

/** How many of the thirty cells are taken. */
export function bagSlotsUsed(items: ItemInstance[]): number {
  return bagStacks(items).length;
}

/**
 * Whether one more thing fits.
 *
 * Asked with the incoming item rather than as a bare count, because the answer
 * depends on WHAT is arriving: a seventh Worn dirk fits into a bag of thirty
 * full cells and a Frostbrand does not. Computed by counting the slots the bag
 * would use with it in, which is exact by construction rather than by a second
 * copy of the spill rule.
 */
export function bagRoomFor(
  items: ItemInstance[],
  incoming: Pick<ItemInstance, "baseId" | "rarity" | "affixes">,
  cap: number,
): boolean {
  const probe: ItemInstance = {
    ...(incoming as ItemInstance),
    id: "__probe__",
    equipped: false,
  };
  return bagSlotsUsed([...items, probe]) <= cap;
}

// --- How a particular weapon feels ------------------------------------------
// Three numbers decide what swinging a thing is like — how far it reaches, how
// often, and how hard — and each of them is a FAMILY multiplier times an ITEM
// multiplier.
//
// The family part has always existed: an axe swings at 1.35x the base interval
// and hits for 1.45x, which is what makes an axe an axe rather than a sword
// with a different picture. The item part is what stops nine swords being one
// sword: a claymore is slower and heavier than an arming sword, a falchion
// quicker and lighter, a spear reaches past both.
//
// THEY RESOLVE HERE AND NOWHERE ELSE. The family multipliers used to be read
// inline at six call sites — `weaponDef(x).speedMultiplier` on the server, the
// same again on the client's stat sheet, `attackRangeFor` reaching into the
// table itself — and adding a second factor to each of those would have been
// six edits nobody was reminded about. That is precisely how helm and cape once
// came to roll stats no combat formula ever read. One resolver per number, and
// the server's swing timer and the character sheet cannot disagree about what a
// Bloodclaim Claymore does.

/** The family's multipliers times the item's own. */
export function weaponFeel(item: ItemInstance | null | undefined): Required<WeaponMods> {
  const family = weaponDef(item?.weaponType);
  const mods = item ? itemBase(item.baseId).mods : undefined;
  return {
    range: family.rangeMultiplier * (mods?.range ?? 1),
    speed: family.speedMultiplier * (mods?.speed ?? 1),
    damage: family.damageMultiplier * (mods?.damage ?? 1),
  };
}

/**
 * How far this particular weapon reaches, in world pixels.
 *
 * `attackRangeFor` already folds in the family; this multiplies the item on top
 * and then divides the family back out, because applying `feel.range` to a
 * number that already contains `rangeMultiplier` would square it. Written as a
 * ratio rather than by reaching past `attackRangeFor` into the class table, so
 * there is still exactly one place that knows a class's base reach.
 */
export function reachOf(
  item: ItemInstance | null | undefined,
  rangePercent = 0,
): number {
  const base = attackRangeFor(item?.weaponType, rangePercent);
  const mods = item ? itemBase(item.baseId).mods : undefined;
  return Math.round(base * (mods?.range ?? 1));
}

/** How often it swings, in milliseconds, after everything that touches that. */
export function swingIntervalOf(
  item: ItemInstance | null | undefined,
  weaponRarity: ItemRarity | null,
  battlePowerLevel: number,
  agility: number,
  attackSpeedPercent = 0,
): number {
  const base = playerAttackIntervalMs(weaponRarity, battlePowerLevel, agility);
  return applyAttackSpeed(Math.round(base * weaponFeel(item).speed), attackSpeedPercent);
}

/**
 * The hit band this weapon swings for.
 *
 * The damage multiplier is roughly the inverse of the speed one, so a slow
 * weapon hits proportionally harder and total damage per second stays in the
 * same neighbourhood — the choice is burst against steady rather than one
 * weapon simply winning.
 */
export function hitBandOf(
  item: ItemInstance | null | undefined,
  power: number,
  bonusDamage = 0,
  damagePercent = 0,
): { min: number; max: number } {
  const feel = weaponFeel(item);
  return {
    min: applyDamagePercent(Math.round(playerMinHit(power) * feel.damage), damagePercent),
    max: applyDamagePercent(
      Math.round(playerMaxHit(power, bonusDamage) * feel.damage),
      damagePercent,
    ),
  };
}

/**
 * How this weapon differs from the plain member of its family, for a tooltip.
 *
 * Reads off the same numbers the game resolves with rather than off the flavour
 * text, so a rebalance cannot leave an item describing itself wrongly. Only
 * differences worth a player's attention are reported: a five per cent nudge is
 * noise, and listing it would bury the claymore's fifty.
 */
export function feelNotes(item: ItemInstance | null | undefined): string[] {
  const mods = item ? itemBase(item.baseId).mods : undefined;
  if (!mods) return [];
  const notes: string[] = [];
  const pct = (v: number) => `${Math.round(Math.abs(v - 1) * 100)}%`;
  if (mods.range && Math.abs(mods.range - 1) >= 0.1) {
    notes.push(mods.range > 1 ? `${pct(mods.range)} more reach` : `${pct(mods.range)} less reach`);
  }
  if (mods.speed && Math.abs(mods.speed - 1) >= 0.1) {
    notes.push(mods.speed > 1 ? `${pct(mods.speed)} slower` : `${pct(mods.speed)} faster`);
  }
  if (mods.damage && Math.abs(mods.damage - 1) >= 0.1) {
    notes.push(
      mods.damage > 1 ? `${pct(mods.damage)} harder hitting` : `${pct(mods.damage)} lighter`,
    );
  }
  return notes;
}

// --- Matched gear -----------------------------------------------------------
// The catalogue keeps three independent axes — mesh, palette, quality — and two
// of them already mean something mechanically. Palette did not: it decided what
// an item was made of and nothing else, which made it the one axis a player
// could see and had no reason to care about.
//
// So dressing in one material is worth something. Three pieces of Obsidian is a
// choice against three pieces of whatever happened to roll highest, and it is a
// choice the player can SEE on their own character rather than one they have to
// read off a sheet. That visibility is the whole reason this hangs off palette
// rather than off a hidden "set id": you can tell at a glance across a field
// whether someone is wearing a matched kit.
//
// Deliberately weak per piece and never a substitute for numbers — a matched
// set of Worn gear should lose to a mixed set of Forged. It is a tiebreaker
// with a look, not a second progression.

export interface SetTier {
  /** How many equipped pieces of the palette this tier needs. */
  need: number;
  bonus: PassiveBonus;
}

export interface PaletteSet {
  name: string;
  /** What wearing it is FOR, in one line, for the character sheet. */
  blurb: string;
  tiers: SetTier[];
}

/**
 * What each material rewards.
 *
 * Chosen to match what the material reads as rather than to balance a spread:
 * iron and steel protect, obsidian and crimson are about hurting things, bone
 * and bronze are about lasting, arcane and frost are about casting. A player
 * who guesses from the name should be right.
 */
export const PALETTE_SETS: Partial<Record<PaletteId, PaletteSet>> = {
  iron: {
    name: "Ironclad",
    blurb: "Plain metal, honestly worked. It stops things.",
    tiers: [
      { need: 3, bonus: { armor: 3, maxHpBonus: 12 } },
      { need: 5, bonus: { armor: 5, maxHpBonus: 20 } },
    ],
  },
  steel: {
    name: "Tempered Guard",
    blurb: "A soldier's kit: something to hide behind and something to hit with.",
    tiers: [
      { need: 3, bonus: { armor: 4, damagePercent: 3 } },
      { need: 5, bonus: { armor: 6, damagePercent: 6, accuracyBonus: 4 } },
    ],
  },
  bronze: {
    name: "Old Campaign",
    blurb: "Softer than steel and it has lasted longer than most of it.",
    tiers: [
      { need: 3, bonus: { maxHpBonus: 18, healOnKill: 3 } },
      { need: 5, bonus: { maxHpBonus: 30, healOnKill: 6 } },
    ],
  },
  silver: {
    name: "Silvered",
    blurb: "Bright enough to be seen coming, and it lands anyway.",
    tiers: [
      { need: 3, bonus: { accuracyBonus: 6, critChance: 3 } },
      { need: 5, bonus: { accuracyBonus: 10, critChance: 6 } },
    ],
  },
  gold: {
    name: "Regalia",
    blurb: "Worth more than it protects, which is rather the point.",
    tiers: [
      { need: 3, bonus: { critDamagePercent: 12, maxManaBonus: 10 } },
      { need: 5, bonus: { critDamagePercent: 22, maxManaBonus: 18 } },
    ],
  },
  obsidian: {
    name: "Blackglass",
    blurb: "Nothing about it reflects. Things that hunt at night wore this.",
    tiers: [
      { need: 3, bonus: { critChance: 4, evasion: 4 } },
      { need: 5, bonus: { critChance: 7, evasion: 7, critDamagePercent: 12 } },
    ],
  },
  bone: {
    name: "Ossuary",
    blurb: "Taken from things that did not need it any more.",
    tiers: [
      { need: 3, bonus: { maxHpBonus: 14, healOnKill: 4 } },
      { need: 5, bonus: { maxHpBonus: 24, healOnKill: 8, armor: 3 } },
    ],
  },
  verdant: {
    name: "Green Wardens",
    blurb: "Cut for moving through country nobody has a map of.",
    tiers: [
      { need: 3, bonus: { moveSpeedBonus: 14, evasion: 4 } },
      { need: 5, bonus: { moveSpeedBonus: 24, evasion: 7, attackSpeedPercent: 4 } },
    ],
  },
  crimson: {
    name: "Bloodwrought",
    blurb: "It wants the fight to be short.",
    tiers: [
      { need: 3, bonus: { damagePercent: 6, healOnKill: 3 } },
      { need: 5, bonus: { damagePercent: 11, healOnKill: 6, critDamagePercent: 10 } },
    ],
  },
  frost: {
    name: "Rimeward",
    blurb: "Cold to hold. Whatever it is doing, it is doing it slowly.",
    tiers: [
      { need: 3, bonus: { skillPowerPercent: 6, manaRegenBonus: 1 } },
      { need: 5, bonus: { skillPowerPercent: 11, manaRegenBonus: 2, cooldownPercent: 6 } },
    ],
  },
  arcane: {
    name: "Weaveworn",
    blurb: "The stitching is not thread and does not come loose.",
    tiers: [
      { need: 3, bonus: { maxManaBonus: 16, manaCostPercent: 8 } },
      { need: 5, bonus: { maxManaBonus: 28, manaCostPercent: 14, skillPowerPercent: 8 } },
    ],
  },
  wood: {
    name: "Woodsfolk",
    blurb: "Whatever was to hand. It gets you to the next thing.",
    tiers: [
      { need: 3, bonus: { moveSpeedBonus: 10, maxHpBonus: 8 } },
      { need: 5, bonus: { moveSpeedBonus: 18, maxHpBonus: 14 } },
    ],
  },
};

export interface ActiveSet {
  palette: PaletteId;
  name: string;
  blurb: string;
  /** Equipped pieces of this palette. */
  count: number;
  /** Tiers, with whether each is reached — the sheet shows both, so a player\n   *  can see what one more piece would buy. */
  tiers: { need: number; bonus: PassiveBonus; active: boolean }[];
}

/**
 * Which materials the player is wearing enough of, best first.
 *
 * Counts EVERY equipped slot, including the two that are held. A shield and a
 * sword of the same material are as much a matched kit as two boots are, and
 * excluding them would have made the off-hand the one slot that could not
 * contribute to the thing it most obviously looks like it should.
 */
export function activeSets(eq: EquippedGear | undefined): ActiveSet[] {
  if (!eq) return [];
  const counts = new Map<PaletteId, number>();
  for (const slot of ITEM_SLOTS) {
    const item = eq[slot];
    if (!item) continue;
    const palette = itemBase(item.baseId).art.palette;
    counts.set(palette, (counts.get(palette) ?? 0) + 1);
  }

  const out: ActiveSet[] = [];
  for (const [palette, count] of counts) {
    const set = PALETTE_SETS[palette];
    if (!set) continue;
    const tiers = set.tiers.map((t) => ({ ...t, active: count >= t.need }));
    // Reported even when nothing is reached yet, but only once the player is
    // one piece away — a list of twelve materials they own one of each of is
    // not information.
    if (count < set.tiers[0].need - 1) continue;
    out.push({ palette, name: set.name, blurb: set.blurb, count, tiers });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** What matched gear adds up to. Totalled into the same bag as talents and
 *  affixes, so it reaches combat through the one funnel they already use. */
export function setPassives(eq: EquippedGear | undefined): Required<PassiveBonus> {
  const total = { ...EMPTY_PASSIVES };
  for (const set of activeSets(eq)) {
    for (const tier of set.tiers) {
      if (tier.active) addPassives(total, tier.bonus);
    }
  }
  return total;
}

// --- The smithy -------------------------------------------------------------
// Crafting used to be one verb: pick a slot, pick a rarity, pay wood and ore
// scaled by a multiplier, receive an anonymous item. It was a way of buying
// loot rolls, and the only decision in it was how much to spend.
//
// There are three verbs now, and they are the three things a smith actually
// does — which is not a theme, it is where the design came from. The world's
// one fixed landmark is a forge, the rarity ladder is named for states of a
// made object, and those two facts imply each other:
//
//   FORGE    make a named item from the catalogue. You choose WHAT, not how
//            good — output is always Honed, the baseline the catalogue is
//            authored at. Gated by the band, so the forge cannot outrun the
//            world you have actually walked into.
//
//   REFORGE  push an item you own one step up the ladder. This is the whole
//            reason the ladder has seven named steps instead of three colours:
//            a Worn sword is not a dead end, it is two steps and some ore away
//            from a Tempered one. Costs rise steeply, and the top two steps
//            need something you cannot gather.
//
//   SALVAGE  break an item down into materials. Replaces selling for wood,
//            which was a sink with no decision in it. It is also what Broken
//            items are FOR — the bottom of the ladder has an answer now.
//
// The loop those three make is the point: everything you find is either worn,
// reforged, or fed back into the next thing.

// --- Materials --------------------------------------------------------------
// Wood, ore and herb are gathered from the world. Essence is not: it comes off
// kills, and only the top of the ladder needs it. That is deliberate — without
// it, reforging is a pure function of time spent standing at trees, and the
// most powerful gear in the game would be made by the player who fought least.
export const MATERIALS = ["wood", "ore", "herb", "essence"] as const;
export type Material = (typeof MATERIALS)[number];

export type MaterialCost = Partial<Record<Material, number>>;

export const MATERIAL_LABEL: Record<Material, string> = {
  wood: "Wood",
  ore: "Ore",
  herb: "Herb",
  essence: "Essence",
};

export const MATERIAL_ICON: Record<Material, string> = {
  wood: "wood",
  ore: "ore",
  herb: "herb",
  essence: "essence",
};

/** Chance a kill yields essence, and how much. Bosses always drop some. */
export const ESSENCE_DROP_CHANCE = 0.22;
export function essenceFor(band: ItemBand, guaranteed: boolean): number {
  if (!guaranteed && Math.random() > ESSENCE_DROP_CHANCE) return 0;
  return guaranteed ? band + 1 : Math.max(1, Math.round(band * 0.6));
}

// --- Consumables ------------------------------------------------------------
// Two hardcoded constants and four bespoke messages, beside a catalogue of a
// hundred and seven named things with a forge, a ladder and a salvage loop. The
// potion and the tonic were the last part of the item system that could not be
// extended by adding a row.
//
// They are still COUNTERS rather than instances, and deliberately so: there is
// nothing to equip, nothing to roll, and nothing to compare — a potion is a
// quantity, and giving it an id, a quality and two stat rolls would be
// ceremony. What they gain is a table: a name, a cost, an effect, and the
// wiring reads all of it.
//
// Every effect below is something the game already knows how to do. That is the
// constraint that kept this bounded — a consumable that needed a new mechanic
// would be a new mechanic wearing a potion bottle.

export type ConsumableId = "potion" | "tonic" | "draught" | "philtre";

export interface ConsumableEffect {
  /** Health restored. */
  heal?: number;
  /** Experience granted. */
  xp?: number;
  /** Mana restored. */
  mana?: number;
  /** Milliseconds of the same damage buff War Cry grants. */
  buffMs?: number;
}

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  icon: string;
  cost: MaterialCost;
  effect: ConsumableEffect;
  /** One line, for the bench and the bag. */
  blurb: string;
  /** Shared cooldown group. Anything that heals is gated together, or a stack
   *  of two different healing items is the immunity button the potion cooldown
   *  exists to prevent. */
  gated: boolean;
}

export const CONSUMABLES: Record<ConsumableId, ConsumableDef> = {
  potion: {
    id: "potion",
    name: "Health Potion",
    icon: "potion",
    cost: { wood: 2, herb: 8 },
    effect: { heal: 30 },
    blurb: "Closes wounds. Not quickly enough to drink mid-swing.",
    gated: true,
  },
  tonic: {
    id: "tonic",
    name: "XP Tonic",
    icon: "tonic",
    cost: { ore: 4, herb: 12 },
    effect: { xp: 25 },
    blurb: "Tastes of ash. You will remember the fight more clearly.",
    gated: false,
  },
  draught: {
    id: "draught",
    name: "Blue Draught",
    icon: "mana",
    cost: { herb: 14, ore: 6 },
    effect: { mana: 45 },
    blurb: "Cold going down, and the next spell comes easier.",
    gated: false,
  },
  philtre: {
    id: "philtre",
    name: "Wrathful Philtre",
    icon: "warcry",
    // The one that wants essence: a buff is closer to gear than to groceries,
    // and essence is the material you can only get by fighting.
    cost: { herb: 10, ore: 8, essence: 2 },
    effect: { buffMs: 12000 },
    blurb: "Twelve seconds of not minding what happens to you.",
    gated: false,
  },
};

export const CONSUMABLE_IDS: ConsumableId[] = Object.keys(CONSUMABLES) as ConsumableId[];

export function consumableDef(id: string): ConsumableDef | null {
  return CONSUMABLES[id as ConsumableId] ?? null;
}

/** How a consumable reads in a list, e.g. "restores 30 health". */
export function consumableSummary(def: ConsumableDef): string {
  const parts: string[] = [];
  if (def.effect.heal) parts.push(`restores ${def.effect.heal} health`);
  if (def.effect.mana) parts.push(`restores ${def.effect.mana} mana`);
  if (def.effect.xp) parts.push(`grants ${def.effect.xp} experience`);
  if (def.effect.buffMs) parts.push(`${Math.round(def.effect.buffMs / 1000)}s of heavier blows`);
  return parts.join(", ");
}

// --- Forge ------------------------------------------------------------------

/**
 * What one base item costs to make.
 *
 * Derived from its band and slot rather than authored per item, for the same
 * reason its stats are: seventy-eight hand-written cost lines is seventy-eight
 * numbers nobody can compare. Weapons lean on ore, capes and staves on wood,
 * and everything above band 2 wants herb — which is what stops the third
 * material being a decoration on the potion recipe.
 */
export function forgeCost(base: ItemBase): MaterialCost {
  const scale = base.band * base.band; // 1, 4, 9, 16, 25
  const metalish = base.slot === "weapon" || base.slot === "armor" || base.slot === "helm" ||
    base.slot === "offhand" || base.slot === "boots";
  const cost: MaterialCost = {
    wood: Math.round((metalish ? 4 : 9) * scale * 0.9),
    ore: Math.round((metalish ? 9 : 3) * scale * 0.9),
  };
  if (base.band >= 3) cost.herb = Math.round(2 * scale * 0.6);
  if (base.band >= 5) cost.essence = 4;
  return cost;
}

/**
 * A SMITH KNOWS WHAT THEY HAVE TAKEN APART.
 *
 * The forge used to be gated by character level, which made it a shop: reach
 * level 8 and a list of things you had never seen unlocks itself. That is a
 * gate, not a craft, and it left the three verbs as three unrelated buttons.
 *
 * A recipe is LEARNED BY SALVAGING one, so the loop closes: find a Frostbrand,
 * break it down, and now you can make Frostbrands. Every verb feeds the next —
 * exploration feeds salvage, salvage feeds the forge, the forge feeds the
 * ladder — and "what do I do with a duplicate?" finally has an answer better
 * than "delete it".
 *
 * Materials remain the real cost. A level-1 character who somehow salvages a
 * band-5 sword has learned something they cannot afford for a long time, which
 * is a much more interesting position to be in than a locked list.
 */
export const STARTING_RECIPES: string[] = Object.values(ITEM_BASES)
  .filter((b) => b.band === 1)
  .map((b) => b.id);

/** Whether a base is known without having to be learned. */
export function isBasicRecipe(baseId: string): boolean {
  return itemBase(baseId).band === 1;
}

export function canForge(
  base: ItemBase,
  known: ReadonlySet<string> | string[],
): { ok: boolean; reason?: string } {
  if (isBasicRecipe(base.id)) return { ok: true };
  const has = Array.isArray(known) ? known.includes(base.id) : known.has(base.id);
  if (!has) return { ok: false, reason: "salvage one to learn it" };
  return { ok: true };
}

/** Everything the forge will make, grouped by slot then band then name. */
export function forgeableBases(known: ReadonlySet<string> | string[]): ItemBase[] {
  return Object.values(ITEM_BASES)
    .filter((b) => canForge(b, known).ok)
    .sort((a, b) => a.slot.localeCompare(b.slot) || a.band - b.band || a.name.localeCompare(b.name));
}

/** What the forge hands you. Always Honed: the forge decides WHAT, the ladder
 *  decides how good, and blurring those makes reforging pointless. */
export const FORGE_OUTPUT_RARITY: ItemRarity = "honed";

// --- Reforge ----------------------------------------------------------------

/**
 * The cost of one step up the ladder.
 *
 * Steeply superlinear, because the interesting question is which ONE item you
 * take to the top rather than whether you take all six. Scaled by the item's
 * band too: pushing a band-5 claymore to Enchanted should be an undertaking,
 * and pushing a band-1 dirk there should be a thing a player can do once for
 * fun and then look at.
 */
export function reforgeCost(base: ItemBase, from: ItemRarity): MaterialCost | null {
  const i = rarityIndex(from);
  if (i >= RARITY_ORDER.length - 1) return null; // already Enchanted
  const step = i + 1; // 1..6
  const scale = base.band * step * step;
  const cost: MaterialCost = {
    ore: Math.round(6 * scale),
    wood: Math.round(4 * scale),
  };
  if (step >= 3) cost.herb = Math.round(3 * scale * 0.5);
  // The top two steps need what only killing produces. This is the sink that
  // keeps the ladder from being a gathering exercise.
  if (step >= 5) cost.essence = Math.round(base.band * (step - 3) * 1.5);
  return cost;
}

/**
 * What one step up the ladder would produce, near enough to decide by.
 *
 * The primary and secondary are exact — they are the base's numbers times the
 * new quality, and the jitter is a tenth either way. The affixes are NOT
 * previewable, because reforging re-rolls them, so this reports how MANY there
 * will be rather than pretending to know which. Saying "2 affixes, re-rolled"
 * is honest; showing the ones it happens to have now is not.
 */
export interface ReforgePreview {
  to: ItemRarity;
  statValue: number;
  bonusStatValue: number;
  affixCount: number;
  /** Affixes it has now, which are about to be thrown away. */
  losingAffixes: number;
}

/**
 * What the forge would hand you, for a row on the bench.
 *
 * Always Honed, because that is what the forge outputs — so this is simply the
 * base's authored numbers, which is the whole reason the catalogue is authored
 * at Honed rather than at some arbitrary tier.
 */
export function forgePreview(base: ItemBase): { statValue: number; bonusStatValue: number } {
  return { statValue: basePower(base), bonusStatValue: baseGuard(base) };
}

export function reforgePreview(item: ItemInstance): ReforgePreview | null {
  const to = nextRarity(item.rarity);
  if (!to) return null;
  const base = itemBase(item.baseId);
  const power = RARITIES[to]?.power ?? 1;
  return {
    to,
    statValue: Math.round(basePower(base) * power),
    bonusStatValue: Math.round(baseGuard(base) * power),
    affixCount: RARITIES[to]?.affixes ?? 0,
    losingAffixes: item.affixes?.length ?? 0,
  };
}

export function nextRarity(from: ItemRarity): ItemRarity | null {
  const i = rarityIndex(from);
  return i >= RARITY_ORDER.length - 1 ? null : RARITY_ORDER[i + 1];
}

/**
 * What an item becomes when reforged.
 *
 * The numbers are recomputed from the base at the new quality, and the affixes
 * are RE-ROLLED to the new count rather than added to. Keeping the old ones and
 * appending would make a reforged item strictly a superset of itself, which
 * turns every decision about which item to invest in into "the first one you
 * happened to find" — and it would mean an Enchanted item's three affixes were
 * chosen by what a Worn one rolled six steps earlier.
 */
export function reforgeItem(
  item: ItemInstance,
  random: () => number = Math.random,
  chosenAffix?: string,
): ItemInstance | null {
  const to = nextRarity(item.rarity);
  if (!to) return null;
  const base = itemBase(item.baseId);
  const rolled = rollItem(base, to, random, chosenAffix);
  return { ...item, ...rolled, id: item.id, equipped: item.equipped };
}

// --- Salvage ----------------------------------------------------------------

/**
 * What breaking an item down returns.
 *
 * Roughly a third of what it would cost to forge, plus a share of what has been
 * poured into its quality — so salvaging a Runed piece you have outgrown is a
 * real decision rather than a formality, and a Broken drop is worth picking up.
 * Never returns essence: essence comes from fighting, and a laundering loop
 * through the forge would make that untrue.
 */
export function salvageYield(item: ItemInstance): MaterialCost {
  const base = itemBase(item.baseId);
  const quality = RARITIES[item.rarity]?.power ?? 1;
  const forge = forgeCost(base);
  const out: MaterialCost = {};
  for (const m of ["wood", "ore", "herb"] as const) {
    const v = Math.floor((forge[m] ?? 0) * 0.35 * quality);
    if (v > 0) out[m] = v;
  }
  // A floor, so salvaging the cheapest thing in the game is not literally
  // nothing — the bag has a cap, and "delete for zero" is a worse answer.
  if (!out.wood && !out.ore && !out.herb) out.wood = 1;
  return out;
}

/** Whether the player can pay a cost, and what they are short of. */
export function canAfford(
  cost: MaterialCost,
  have: Record<Material, number>,
): { ok: boolean; missing: Material[] } {
  const missing = MATERIALS.filter((m) => (have[m] ?? 0) < (cost[m] ?? 0));
  return { ok: missing.length === 0, missing };
}

export function describeCost(cost: MaterialCost): string {
  return MATERIALS.filter((m) => (cost[m] ?? 0) > 0)
    .map((m) => `${cost[m]} ${MATERIAL_LABEL[m].toLowerCase()}`)
    .join(", ");
}
