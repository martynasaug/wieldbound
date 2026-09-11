// WHO A CHARACTER IS, AS THEY CHOSE IT.
//
// Asked for: "make our player character highly customizable. A player gets to
// customize their character on the first login." Until this file a look was a
// hash of the name, computed separately on every client and stored nowhere.
//
// FACES ARE NOT HERE, AND THAT IS A DECISION. The first version offered
// fourteen fields built from boxes, spheres and cones stuck onto the Monk's
// head, and reviewed on screen they were not acceptable. They were removed; a
// face option comes back when there is modelled art for it.
//
// HAIR IS HERE BECAUSE THERE IS NOW ART FOR IT. `tools/art/hair.py` models each
// style in Blender on the Monk's actual skull and exports it beside the beard;
// every id in `HAIR_STYLE_IDS` other than "none" is a file in
// `client/public/models/hair/`.
//
// EVERY FIELD IS AN ID FROM A TABLE BELOW, colours included. That is what makes
// the wire safe to accept: the server checks each field against its own copy
// of these lists, so a client cannot send a scale, a tone or a colour the game
// does not have. It is also what lets the creator build itself.
//
// No imports, so the server, the client and a node test can all load it as is.

export const SKIN_TONE_IDS = ["porcelain", "fair", "light", "olive", "tan", "bronze", "umber", "ebony"] as const;
export const BUILD_IDS = ["slight", "lean", "average", "sturdy", "broad"] as const;
export const HAIR_STYLE_IDS = ["none", "short", "long", "ponytail", "bun", "mohawk", "spiky"] as const;
// Four are the Monk's own authored clumps, recombined; two are modelled on top of
// them. See `tools/art/facial_hair.py`. "monk" is the beard every character
// already wore, which is why it is the default.
export const BEARD_STYLE_IDS = ["none", "moustache", "goatee", "chops", "monk", "long", "braided"] as const;

export const HAIR_COLORS = [
  { id: "black", label: "Black", hex: 0x141013 },
  { id: "espresso", label: "Espresso", hex: 0x2b1f18 },
  { id: "chestnut", label: "Chestnut", hex: 0x4a3222 },
  { id: "brown", label: "Brown", hex: 0x6f4a2a },
  { id: "auburn", label: "Auburn", hex: 0x8c3b1e },
  { id: "ginger", label: "Ginger", hex: 0xc4622a },
  { id: "honey", label: "Honey", hex: 0xa87a3c },
  { id: "blonde", label: "Blonde", hex: 0xc9a758 },
  { id: "flaxen", label: "Flaxen", hex: 0xe6dcc4 },
  { id: "grey", label: "Grey", hex: 0xb9b2a4 },
  { id: "white", label: "White", hex: 0xe8e6e0 },
  { id: "ash", label: "Ash blue", hex: 0x5d6a78 },
  { id: "crimson", label: "Crimson", hex: 0x7e1f2a },
  { id: "moss", label: "Moss", hex: 0x4f5f2f },
] as const;

export type SkinToneId = (typeof SKIN_TONE_IDS)[number];
export type BuildId = (typeof BUILD_IDS)[number];
export type HairStyleId = (typeof HAIR_STYLE_IDS)[number];
export type HairColorId = (typeof HAIR_COLORS)[number]["id"];
export type BeardStyleId = (typeof BEARD_STYLE_IDS)[number];

export interface CharacterLook {
  skin: SkinToneId;
  build: BuildId;
  hair: HairStyleId;
  beard: BeardStyleId;
  /** Hair, beard and brows together, so a character's hair matches itself. */
  hairColor: HairColorId;
}

export type LookKey = keyof CharacterLook;

/**
 * Height and build as a multiplier on the whole body.
 *
 * Kept NARROW on purpose — 0.93 to 1.07, the range the hash used. Silhouette is
 * the strongest signal there is and so the easiest to ruin: a range wide enough
 * to be obvious one character at a time makes a crowd look like a scale error,
 * and fights every number in the game that assumes a 1.8-unit body.
 */
export const BUILD_SCALE: Record<BuildId, number> = {
  slight: 0.93,
  lean: 0.965,
  average: 1,
  sturdy: 1.035,
  broad: 1.07,
};

/** How light each tone renders, mirroring the targets in `client/src/three/skin.ts`. */
const SKIN_LIGHTNESS: Record<SkinToneId, number> = {
  porcelain: 0.72, fair: 0.64, light: 0.56, olive: 0.44, tan: 0.39, bronze: 0.33, umber: 0.27, ebony: 0.24,
};

export interface LookChoice {
  readonly id: string;
  readonly label: string;
  readonly hex?: number;
}

export interface LookOption {
  readonly key: LookKey;
  readonly label: string;
  readonly kind: "style" | "color";
  readonly choices: readonly LookChoice[];
}

export const LOOK_OPTIONS: readonly LookOption[] = [
  {
    key: "skin",
    label: "Skin",
    kind: "color",
    choices: [
      { id: "porcelain", label: "Porcelain" },
      { id: "fair", label: "Fair" },
      { id: "light", label: "Light" },
      { id: "olive", label: "Olive" },
      { id: "tan", label: "Tan" },
      { id: "bronze", label: "Bronze" },
      { id: "umber", label: "Umber" },
      { id: "ebony", label: "Ebony" },
    ],
  },
  {
    key: "build",
    label: "Build",
    kind: "style",
    choices: [
      { id: "slight", label: "Slight" },
      { id: "lean", label: "Lean" },
      { id: "average", label: "Average" },
      { id: "sturdy", label: "Sturdy" },
      { id: "broad", label: "Broad" },
    ],
  },
  {
    key: "hair",
    label: "Hairstyle",
    kind: "style",
    choices: [
      { id: "none", label: "Shaved" },
      { id: "short", label: "Short" },
      { id: "long", label: "Long" },
      { id: "ponytail", label: "Ponytail" },
      { id: "bun", label: "Topknot" },
      { id: "mohawk", label: "Mohawk" },
      { id: "spiky", label: "Spiky" },
    ],
  },
  {
    key: "beard",
    label: "Facial hair",
    kind: "style",
    choices: [
      { id: "none", label: "Clean-shaven" },
      { id: "moustache", label: "Moustache" },
      { id: "goatee", label: "Goatee" },
      { id: "chops", label: "Mutton chops" },
      { id: "monk", label: "Full beard" },
      { id: "long", label: "Long beard" },
      { id: "braided", label: "Braided beard" },
    ],
  },
  { key: "hairColor", label: "Hair colour", kind: "color", choices: HAIR_COLORS },
];

/** How the creator groups the options, and whether each group wants the face or the whole figure. */
export const LOOK_CATEGORIES: readonly { id: string; label: string; focus: "face" | "body"; keys: readonly LookKey[] }[] = [
  { id: "body", label: "Body", focus: "body", keys: ["skin", "build"] },
  { id: "hair", label: "Hair", focus: "face", keys: ["hair", "beard", "hairColor"] },
];

export function lookOption(key: LookKey): LookOption {
  const option = LOOK_OPTIONS.find((o) => o.key === key);
  if (!option) throw new Error(`look: no option for ${key}`);
  return option;
}

/** The colour a colour field names. Unknown ids fall back to the first entry rather than throwing. */
export function lookColorHex(key: "hairColor", id: string): number {
  const choices = lookOption(key).choices;
  return (choices.find((c) => c.id === id) ?? choices[0]).hex ?? 0xffffff;
}

/**
 * A look from untrusted input, or null.
 *
 * A field that is PRESENT and wrong rejects the whole look, because a patched
 * look is one the player did not choose. A field that is ABSENT is filled from
 * `fill` when one is given — which is how a look stored before hair existed
 * still loads, rather than sending every player who had already chosen back
 * through the creator. Without `fill`, absent is wrong too: the wire gets no
 * such allowance. Fields the table does not know are dropped.
 */
export function sanitizeLook(raw: unknown, fill?: CharacterLook): CharacterLook | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const option of LOOK_OPTIONS) {
    const value = input[option.key];
    if (value === undefined && fill) {
      out[option.key] = fill[option.key];
      continue;
    }
    if (typeof value !== "string" || !option.choices.some((c) => c.id === value)) return null;
    out[option.key] = value;
  }
  return out as unknown as CharacterLook;
}

/** A stored look, which may be absent, unreadable, or from before a field existed. */
export function parseStoredLook(json: string | null | undefined, name: string): CharacterLook | null {
  if (!json) return null;
  try {
    return sanitizeLook(JSON.parse(json), defaultLookFor(name));
  } catch {
    return null;
  }
}

function hashName(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Perceived lightness of an sRGB hex, on the same scale as `SKIN_LIGHTNESS`. */
function value(hex: number): number {
  return (0.299 * ((hex >> 16) & 0xff) + 0.587 * ((hex >> 8) & 0xff) + 0.114 * (hex & 0xff)) / 255;
}

/**
 * Hair that reads against the head it is on: from `index`, walked along the
 * palette until it is far enough from the skin in value. Black hair on the
 * darkest skin and flaxen on the palest are both invisible at play distance.
 */
function readableHair(index: number, skin: SkinToneId): HairColorId {
  const skinValue = SKIN_LIGHTNESS[skin];
  let i = index % HAIR_COLORS.length;
  for (let tries = 0; tries < HAIR_COLORS.length; tries++) {
    if (Math.abs(value(HAIR_COLORS[i].hex) - skinValue) >= 0.16) break;
    i = (i + 1) % HAIR_COLORS.length;
  }
  return HAIR_COLORS[i].id;
}

/**
 * The look a name produces before its owner has chosen one: the skin byte the
 * hash has always used, so nobody's colouring changed on the day this landed.
 */
export function defaultLookFor(name: string): CharacterLook {
  const h = hashName(name);
  const skin = SKIN_TONE_IDS[((h >>> 16) & 0xff) % SKIN_TONE_IDS.length];
  return {
    skin,
    build: BUILD_IDS[Math.min(BUILD_IDS.length - 1, Math.floor((((h >>> 24) & 0xff) / 256) * BUILD_IDS.length))],
    hair: HAIR_STYLE_IDS[(h & 0xff) % HAIR_STYLE_IDS.length],
    // The beard every character wore before there was a choice.
    beard: "monk",
    hairColor: readableHair((h >>> 4) & 0xff, skin),
  };
}

/** A whole random look, for the creator's dice. */
export function randomLook(random: () => number = Math.random): CharacterLook {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length) % list.length];
  const skin = pick(SKIN_TONE_IDS);
  return {
    skin,
    build: pick(BUILD_IDS),
    hair: pick(HAIR_STYLE_IDS),
    beard: pick(BEARD_STYLE_IDS),
    hairColor: readableHair(Math.floor(random() * HAIR_COLORS.length), skin),
  };
}
