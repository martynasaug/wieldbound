// WHO A CHARACTER LOOKS LIKE.
//
// WHAT A LOOK IS lives in `shared/look.ts`: the ids a player chose in the
// creator, stored on the server and sent with every snapshot. This file only
// turns those ids into things a renderer can use — a skin transform and a scale.
//
// The face is the Monk's own. Procedural hair and facial features were built
// for the creator and removed after review (see the note in `shared/look.ts`).
//
// THE BODY IS ONE MESH WITH ONE TEXTURE. Skin and clothing share it, so a skin
// tone recolours the robe too. That is a real limit of this model and worth
// stating rather than working around badly.

import { BUILD_SCALE, defaultLookFor, type CharacterLook } from "../../../shared/look";
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
}

export function resolveLook(look: CharacterLook): ResolvedLook {
  return { look, skin: toneById(look.skin), build: BUILD_SCALE[look.build] };
}

/** The look a name produces before its owner has chosen one. Same name, same person, on every client. */
export function lookFor(identity: string): ResolvedLook {
  return resolveLook(defaultLookFor(identity));
}
