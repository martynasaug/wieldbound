// WHO A CHARACTER LOOKS LIKE.
//
// Three things the eye uses to tell one person from another at the distance
// this camera sits, in the order they actually work:
//
//   1. VALUE — how light or dark. It survives fog, dusk, shadow and ninety
//      pixels, and it is the only one that still works when a character is a
//      silhouette against a fire.
//   2. SILHOUETTE — the outline. Hair is the cheapest thing that changes it.
//   3. HUE — the least of the three, and the one everybody reaches for first.
//
// WHY THIS IS A LIST AND NOT A FORMULA. The body tint used to be computed from
// a hash — a hue in a narrow band, a saturation, a value — and the note that
// replaced it recorded two failed attempts: four characters within ten values
// of each other on every channel, and then four clipped to the same near-white.
// A third failure was still in it and is the one being fixed here: every
// character came out BROWN, because a warm hue over a brown texture is brown
// however the numbers are arranged, and "skin tone" was never actually one of
// the axes.
//
// Authored palettes instead. A skin tone is a thing people recognise, not a
// point in a cube, and eight of them chosen to be distinguishable beats any
// amount of arithmetic over a hue wheel — which, left to itself, produces green
// and purple heads at the same rate as brown ones.
//
// THE BODY IS ONE MESH WITH ONE TEXTURE. Skin and clothing share it, so a tint
// moves both together and a character cannot have dark skin and a pale shirt.
// That is a real limit of this model and it is worth stating rather than
// working around badly: the palettes below are chosen so that what the tint
// does to the CLOTH still looks deliberate.

import * as THREE from "three";

import { BEARD_STYLES, HAIR_STYLES, type BeardStyle, type HairStyle } from "./gear";
import { SKIN_TONES, toneLightness, type SkinTone } from "./skin";

export interface CharacterLook {
  hair: HairStyle;
  beard: BeardStyle;
  hairColor: THREE.Color;
  /**
   * How the body texture is RECOLOURED — see `skin.ts`.
   *
   * Not a multiplier over the material, which is what this was and which is
   * exactly why every character came out looking like the standard Monk: a
   * multiply can only darken, so the pale half of the palette was unreachable
   * and the rest was the same model with the lights turned down.
   */
  skin: SkinTone;
  /**
   * Height and build, as a multiplier on the whole body.
   *
   * Kept NARROW on purpose — 0.93 to 1.07. Silhouette is the most powerful
   * signal available and therefore the easiest to ruin: a range wide enough to
   * be obvious one character at a time makes a crowd look like a scale error,
   * and it fights every number in the game that assumes a 1.8-unit body, from
   * camera framing to where a nameplate floats.
   */
  build: number;
}

function hash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Hair colours, absolute rather than multiplied: hair is its own geometry with
 * its own material, so it can simply BE a colour.
 *
 * Chosen to separate by value as much as by hue — near-black, mid browns, then
 * two that are much lighter than any skin tone (blonde, white). Naturals appear
 * more than once so a crowd looks like a crowd rather than a paint chart.
 */
const HAIR_COLORS = [
  0x141013, // black
  0x2b1f18, // near-black
  0x4a3222, // dark brown
  0x4a3222,
  0x6f4a2a, // brown
  0x6f4a2a,
  0x8c3b1e, // auburn
  0xc4622a, // ginger
  0xc9a758, // blonde
  0xe6dcc4, // flaxen
  0xb9b2a4, // grey
  0xe8e6e0, // white
];

/**
 * Rough perceived lightness of a hair colour, for keeping it off the skin.
 *
 * TAKES THE HEX, NOT THE `THREE.Color`, and that is not a convenience. three's
 * colour management converts a hex into the linear working space on
 * construction, so `c.r` on a mid-brown is about 0.065 where the sRGB byte is
 * 0.29 — and the skin side of this comparison is a lightness in the ordinary
 * sRGB sense. Reading `c.r` made every hair colour look far darker than it is,
 * so the check passed for pairings that are invisible on screen: dark brown
 * hair on the darkest skin, which is exactly what it exists to prevent.
 */
function value(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** The look a name always produces. Same name, same person, on every client. */
export function lookFor(identity: string): CharacterLook {
  const h = hash(identity);
  // A SEPARATE BYTE FOR EACH CHOICE. Drawing two from the same one correlates
  // them — every long-haired character would also be bearded — and the whole
  // value of four axes is that they vary independently.
  const hair = HAIR_STYLES[(h & 0xff) % HAIR_STYLES.length];
  const beard = BEARD_STYLES[((h >>> 8) & 0xff) % BEARD_STYLES.length];
  const skin = SKIN_TONES[((h >>> 16) & 0xff) % SKIN_TONES.length];
  const build = 0.93 + (((h >>> 24) & 0xff) / 255) * 0.14;

  // HAIR HAS TO READ AGAINST THE HEAD IT IS ON. Picked from the palette, then
  // walked along it until it is far enough from the skin in value — black hair
  // on the darkest skin and flaxen hair on the palest are both invisible at
  // this distance, and "invisible" is the one thing a hairstyle must not be.
  // Walking rather than re-rolling keeps it deterministic and keeps the
  // distribution honest: every colour is still reachable by some name.
  const skinValue = toneLightness(skin);
  let index = ((h >>> 4) & 0xff) % HAIR_COLORS.length;
  for (let tries = 0; Math.abs(value(HAIR_COLORS[index]) - skinValue) < 0.16 && tries < HAIR_COLORS.length; tries++) {
    index = (index + 1) % HAIR_COLORS.length;
  }
  const hairColor = new THREE.Color(HAIR_COLORS[index]);

  return { hair, beard, hairColor, skin, build };
}
