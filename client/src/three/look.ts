// WHO A CHARACTER LOOKS LIKE.
//
// WHAT A LOOK IS lives in `shared/look.ts`: the ids a player chose in the
// creator, stored on the server and sent with every snapshot. This file only
// turns those ids into things a renderer can use — a skin transform, a scale,
// a hairstyle file and its colour.
//
// The face is the Monk's own. Procedural facial features were built for the
// creator and removed after review (see the note in `shared/look.ts`); hair
// came back as modelled art from `tools/art/hair.py`.
//
// THE BODY IS ONE MESH WITH ONE TEXTURE. Skin and clothing share it, which is
// why a skin tone recolours only the texels `skinWeight` calls skin.

import * as THREE from "three";

import {
  BUILD_SCALE,
  defaultLookFor,
  lookColorHex,
  type BeardStyleId,
  type CharacterLook,
  type HairStyleId,
} from "../../../shared/look";
import { toneById, type SkinTone } from "./skin";

export interface ResolvedLook {
  /** The ids this was resolved from. */
  look: CharacterLook;
  /**
   * How the body texture is RECOLOURED — see `skin.ts`.
   *
   * Not a multiplier over the material, which is what this was and which is
   * exactly why every character came out looking like the standard Monk: a
   * multiply can only darken.
   */
  skin: SkinTone;
  /** Height and build, as a multiplier on the whole body. */
  build: number;
  /** Which modelled hairstyle, or "none". */
  hair: HairStyleId;
  /** Which facial hair, or "none". */
  beard: BeardStyleId;
  /** Hair, beard and brows. */
  hairColor: THREE.Color;
}

export function resolveLook(look: CharacterLook): ResolvedLook {
  return {
    look,
    skin: toneById(look.skin),
    build: BUILD_SCALE[look.build],
    hair: look.hair,
    beard: look.beard,
    hairColor: new THREE.Color(lookColorHex("hairColor", look.hairColor)),
  };
}

/** The look a name produces before its owner has chosen one. Same name, same person, on every client. */
export function lookFor(identity: string): ResolvedLook {
  return resolveLook(defaultLookFor(identity));
}
