// WHO A CHARACTER LOOKS LIKE.
//
// The game already tints each body from its owner's name, and the note on
// `Actor.tintBody` is worth reading: it took two attempts to make four
// characters look like four people rather than four shades of one. But a tint
// is a cast over an identical silhouette, and at the distance this camera sits
// the outline is what the eye sorts people by. Two players with different skin
// tones and the same outline are the same figure in different lighting.
//
// So a LOOK is the parts that change the outline — hair, and a beard on a face
// that has no features to change — plus the colours that go with them.
//
// DERIVED FROM THE NAME FOR NOW, deliberately. There is no character creator
// yet, and a system that needs one before it shows anything is a system nobody
// can judge. Deriving from the name means every character in the world is
// already visibly a different person today, the wiring is exercised by ordinary
// play rather than by a screen that does not exist, and the day a creator
// arrives it sets these same fields explicitly and everything downstream is
// unchanged.
//
// One property matters more than any of the others and it is the reason the
// bits are pulled apart the way they are: TWO PEOPLE STANDING TOGETHER MUST NOT
// MATCH. Hair style and beard style come from separate bytes of the hash, so
// sharing one does not imply sharing the other.

import * as THREE from "three";

import { BEARD_STYLES, HAIR_STYLES, type BeardStyle, type HairStyle } from "./gear";

export interface CharacterLook {
  hair: HairStyle;
  beard: BeardStyle;
  /** Hair and beard colour. The same for both: mismatched ones read as a wig. */
  hairColor: THREE.Color;
  /**
   * Height and build, as a multiplier on the whole body.
   *
   * Kept NARROW on purpose — 0.94 to 1.06. Silhouette is the most powerful
   * signal available and therefore the easiest to ruin: a range wide enough to
   * be obvious one character at a time makes a crowd look like a scale error,
   * and it fights every number in the game that assumes a 1.8-unit body, from
   * the camera framing to where a nameplate floats.
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
 * Hair colours, as a short authored list rather than a hue wheel.
 *
 * Real hair is not evenly distributed around a colour wheel, and a random hue
 * gives green and purple heads at the same rate as brown ones. Eight colours
 * chosen to be distinguishable from each other at ninety pixels — which is the
 * only test that matters — with the naturals weighted by appearing more than
 * once, so a crowd looks like a crowd and not like a paint chart.
 */
const HAIR_COLORS = [
  0x2b1f18, // near-black
  0x4a3222, // dark brown
  0x4a3222,
  0x6f4a2a, // brown
  0x6f4a2a,
  0x9a6b34, // light brown
  0xb99152, // fair
  0x8c3b1e, // red
  0xb9b2a4, // grey
];

/** The look a name always produces. Same name, same person, on every client. */
export function lookFor(identity: string): CharacterLook {
  const h = hash(identity);
  // Separate bytes for separate choices — see the note at the top. Drawing two
  // of these from the same byte would make every long-haired character bearded.
  const hair = HAIR_STYLES[(h & 0xff) % HAIR_STYLES.length];
  const beard = BEARD_STYLES[((h >>> 8) & 0xff) % BEARD_STYLES.length];
  const color = HAIR_COLORS[((h >>> 16) & 0xff) % HAIR_COLORS.length];
  const build = 0.94 + (((h >>> 24) & 0xff) / 255) * 0.12;
  return {
    hair,
    beard,
    hairColor: new THREE.Color(color),
    build,
  };
}
