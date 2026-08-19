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
  type EquippedGear,
  type GearStyle,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
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

/** Primary stat an item of this band is worth, before slot and item tuning. */
const BAND_POWER: Record<ItemBand, number> = { 1: 3, 2: 6, 3: 10, 4: 15, 5: 22 };

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

/** How an affix reads in a tooltip, e.g. "+3 armour, +15 health". */
export function affixSummary(affix: AffixDef, band: ItemBand): string {
  const bonus = affixBonus(affix, band);
  const parts: string[] = [];
  for (const key of Object.keys(bonus) as (keyof PassiveBonus)[]) {
    const v = bonus[key] ?? 0;
    if (!v) continue;
    parts.push(`${v > 0 ? "+" : ""}${v}${PASSIVE_UNIT[key]} ${PASSIVE_LABEL[key]}`);
  }
  return parts.join(", ");
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

/**
 * Which base item a kill in this band drops.
 *
 * Weighted around the band rather than restricted to it, so the world is not
 * five sealed loot tables: most of what a band-3 camp drops is band 3, but band
 * 2 and band 4 both turn up, and the band-4 piece is the thing that makes
 * walking one ring further out feel like it paid.
 */
export function rollBase(band: ItemBand, random: () => number = Math.random): ItemBase {
  const pool: ItemBase[] = [];
  for (const base of Object.values(ITEM_BASES)) {
    const distance = Math.abs(base.band - band);
    if (distance > 1) continue;
    // Three entries for the band itself, one for each neighbour.
    const weight = distance === 0 ? 3 : 1;
    for (let i = 0; i < weight; i++) pool.push(base);
  }
  if (pool.length === 0) return UNKNOWN_BASE;
  return pool[Math.floor(random() * pool.length)];
}

/** The affixes an item of this base and quality rolls. */
export function rollAffixes(
  base: ItemBase,
  rarity: ItemRarity,
  random: () => number = Math.random,
): string[] {
  const count = RARITIES[rarity]?.affixes ?? 0;
  if (count <= 0) return [];
  const eligible = AFFIXES.filter(
    (a) => a.minBand <= base.band && (!a.slots || a.slots.includes(base.slot)),
  );
  const picked: string[] = [];
  const pool = [...eligible];
  for (let i = 0; i < count && pool.length > 0; i++) {
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
    affixes: rollAffixes(base, rarity, random),
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
 * The forge only makes what you have earned the right to make.
 *
 * Band 1 is open from the start; every band after it wants character level, so
 * the forge tracks the world rather than skipping it. Deliberately character
 * level and not weapon level: weapon level is a commitment to one family, and
 * gating the forge behind it would punish exactly the weapon-swapping the game
 * is named for.
 */
export const FORGE_LEVEL_FOR_BAND: Record<ItemBand, number> = { 1: 1, 2: 4, 3: 8, 4: 13, 5: 19 };

export function canForge(base: ItemBase, level: number): { ok: boolean; reason?: string } {
  const need = FORGE_LEVEL_FOR_BAND[base.band];
  if (level < need) return { ok: false, reason: `needs level ${need}` };
  return { ok: true };
}

/** Everything the forge will make at this level, best first within each slot. */
export function forgeableBases(level: number): ItemBase[] {
  return Object.values(ITEM_BASES)
    .filter((b) => canForge(b, level).ok)
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
): ItemInstance | null {
  const to = nextRarity(item.rarity);
  if (!to) return null;
  const base = itemBase(item.baseId);
  const rolled = rollItem(base, to, random);
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
