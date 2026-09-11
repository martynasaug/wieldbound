// WHO A CHARACTER IS, AS THEY CHOSE IT.
//
// Asked for: "make our player character highly customizable. A player gets to
// customize their character on the first login." Until this file a look was a
// hash of the name, computed separately on every client and stored nowhere.
//
// TWO FIELDS, AND THAT IS A DECISION RATHER THAN A START. The first version of
// this table offered fourteen — hairstyles, eyes, brows, noses, ears, beards,
// moustaches, face paint, accessories — built from boxes, spheres and cones
// stuck onto the Monk's head. Reviewed on screen they were not acceptable: a
// flat block with rectangles for brows, beads for eyes, hair shells that left
// the top of a boxy skull bare, beards that read as black bibs. They were
// removed in the same milestone, and the character wears the Monk's own face.
// A face option comes back when there is modelled art for it, not before.
//
// EVERY FIELD IS AN ID FROM A TABLE BELOW. That is what makes the wire safe to
// accept: the server checks each field against its own copy of these lists, so
// a client cannot send a scale or a tone the game does not have. It is also
// what lets the creator build itself from `LOOK_OPTIONS`.
//
// No imports, so the server, the client and a node test can all load it as is.

export const SKIN_TONE_IDS = ["porcelain", "fair", "light", "olive", "tan", "bronze", "umber", "ebony"] as const;
export const BUILD_IDS = ["slight", "lean", "average", "sturdy", "broad"] as const;

export type SkinToneId = (typeof SKIN_TONE_IDS)[number];
export type BuildId = (typeof BUILD_IDS)[number];

export interface CharacterLook {
  skin: SkinToneId;
  build: BuildId;
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
];

/** How the creator groups the options, and whether each group wants the face or the whole figure. */
export const LOOK_CATEGORIES: readonly { id: string; label: string; focus: "face" | "body"; keys: readonly LookKey[] }[] = [
  { id: "body", label: "Body", focus: "body", keys: ["skin", "build"] },
];

export function lookOption(key: LookKey): LookOption {
  const option = LOOK_OPTIONS.find((o) => o.key === key);
  if (!option) throw new Error(`look: no option for ${key}`);
  return option;
}

/**
 * A look from untrusted input, or null.
 *
 * ALL OR NOTHING. A look with one bad field is rejected whole rather than
 * patched, because a patched look is one the player did not choose. Fields the
 * table does not know are dropped, which is also what lets a look stored by the
 * fourteen-field version still load.
 */
export function sanitizeLook(raw: unknown): CharacterLook | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const option of LOOK_OPTIONS) {
    const value = input[option.key];
    if (typeof value !== "string" || !option.choices.some((c) => c.id === value)) return null;
    out[option.key] = value;
  }
  return out as unknown as CharacterLook;
}

/** A stored look, which may be absent or unreadable. */
export function parseStoredLook(json: string | null | undefined): CharacterLook | null {
  if (!json) return null;
  try {
    return sanitizeLook(JSON.parse(json));
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

/**
 * The look a name produces before its owner has chosen one: the skin byte the
 * hash has always used, so nobody's colouring changed on the day this landed.
 */
export function defaultLookFor(name: string): CharacterLook {
  const h = hashName(name);
  return {
    skin: SKIN_TONE_IDS[((h >>> 16) & 0xff) % SKIN_TONE_IDS.length],
    build: BUILD_IDS[Math.min(BUILD_IDS.length - 1, Math.floor((((h >>> 24) & 0xff) / 256) * BUILD_IDS.length))],
  };
}

/** A whole random look, for the creator's dice. */
export function randomLook(random: () => number = Math.random): CharacterLook {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length) % list.length];
  return { skin: pick(SKIN_TONE_IDS), build: pick(BUILD_IDS) };
}
