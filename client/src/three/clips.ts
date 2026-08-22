// Every animation a person in this world can perform, in one library.
//
// THE PROBLEM THIS SOLVES, AND WHY IT WAS INVISIBLE UNTIL NOW.
//
// The kit ships five characters, and each one is a mesh AND an animation set,
// and the two are welded together in one file. The Warrior file is the only
// place a sword swing exists; the Ranger file is the only place a bow draw
// exists; `Spell1` and `Spell2` are inside the Wizard and nowhere else. So
// "class is your weapon" was implemented the only way it could be while the
// body and its clips were the same object: pick up a staff and the entire rig
// is replaced, because the staff animation is inside the staff character.
//
// That is a rendering constraint that had been reading as a design decision for
// eight phases. It is not one. **All five rigs share the same 44 bones**, named
// identically, and every clip in every file addresses the same 33 of them.
// Measured, because the whole of this file rests on it and "they look like the
// same skeleton" is not a fact.
//
// So the clips can be lifted out of the characters they arrived in and played
// on any of them. One body, every animation — which is what lets the model stop
// changing when you swap weapons while the game keeps every swing, draw and
// cast it already owned.
//
// WHAT IS AND IS NOT SHARED.
//
// Only PEOPLE draw from this. A monster is a different skeleton entirely — a
// dragon has wings and a blob has nothing — so monsters keep reading their own
// `instance.animations`, and the library is asked for nothing on their behalf.
// The gate is the caller's, not a guess made here.
//
// AND IT IS LOADED ONCE, EAGERLY, WITH THE REST.
//
// Five FBX files behind `loadModel`'s cache, warmed at startup alongside the
// bodies. A clip fetched on demand would arrive after the swing it was fetched
// for: you would press attack, stand still, and see the animation on the second
// blow — which is exactly the kind of fault that gets diagnosed as input lag.

import * as THREE from "three";
import { loadModel, clipName, trackLoad } from "./assets";

/**
 * The files clips are harvested from.
 *
 * All five, including the one that is also the body, because a rig's own clips
 * are simply the ones it happened to ship with and there is no reason the
 * Monk's `Attack` should be privileged over the Warrior's `Sword_Attack` now
 * that both live in the same place.
 *
 * Order matters exactly once: where two files define the same clean name, the
 * first wins. `Idle`, `Walk`, `Run`, `Death`, `RecieveHit`, `Roll` and `PickUp`
 * exist in all five and are not identical — they carry each character's own
 * posture. Monk leads because Monk is the body, so the shared locomotion is the
 * body's own and only the weapon-specific clips are borrowed.
 */
const SOURCES = ["Monk", "Warrior", "Ranger", "Wizard", "Rogue"] as const;

/**
 * Bones that exist on the source rigs and are not to be driven.
 *
 * `CharacterArmature` is the armature Group, not a bone, and it carries a scale
 * of 100 on this kit — a track that writes it would multiply the character's
 * size by a hundred, which is the same trap `Skeleton.pose()` sets in
 * `Actor.buildBody` and is worth blocking in both places rather than
 * remembering in neither.
 */
const NOT_A_BONE = new Set(["CharacterArmature"]);

let library: Map<string, THREE.AnimationClip> | null = null;
let loading: Promise<Map<string, THREE.AnimationClip>> | null = null;

/**
 * Loads every source and harvests its clips.
 *
 * Idempotent and shared: forty actors asking at once get one set of five
 * fetches, because `loadModel` caches by name and this caches the promise.
 */
export function loadClipLibrary(): Promise<Map<string, THREE.AnimationClip>> {
  if (library) return Promise.resolve(library);
  if (loading) return loading;
  const done = trackLoad("animations");
  loading = (async () => {
    const out = new Map<string, THREE.AnimationClip>();
    for (const name of SOURCES) {
      let model: THREE.Group;
      try {
        model = await loadModel(name);
      } catch {
        // A missing source costs its clips and nothing else. The library is a
        // preference list all the way down, so the body still animates.
        continue;
      }
      for (const clip of model.animations ?? []) {
        const key = clipName(clip.name);
        if (out.has(key)) continue;
        const tracks = clip.tracks.filter((t) => !NOT_A_BONE.has(t.name.split(".")[0]));
        // Cloned, because an AnimationClip handed to a mixer is not modified but
        // the ARRAY of tracks is now a different array from the prototype's, and
        // leaving the prototype's own clips half-shared is the kind of thing
        // that works until somebody plays a monster and a player from one file.
        const copy = new THREE.AnimationClip(key, clip.duration, tracks);
        out.set(key, copy);
      }
    }
    library = out;
    done();
    return out;
  })();
  return loading;
}

/** What the library holds, or an empty map before it has loaded. */
export function clipLibrary(): Map<string, THREE.AnimationClip> {
  return library ?? EMPTY;
}

// A debug handle, alongside `__wieldbound`, `__wieldboundRules`,
// `__wieldboundLoad` and `__wieldboundAudio`.
//
// It exists because the last three milestones were all the same shape — a
// capability that already existed, wired to nothing. `Roll` and `PickUp` were
// harvested and never played, `Spell1` was reachable only as a wand's ordinary
// attack, and each was found by accident rather than by looking. What the
// library HOLDS is the one half of that question no static read can answer:
// the clips come out of five binary FBXs at runtime, so the only way to know
// what is in there is to ask something that has loaded them.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__wieldboundClips = {
    names: () => [...clipLibrary().keys()].sort(),
    durations: () =>
      Object.fromEntries([...clipLibrary()].map(([k, c]) => [k, +c.duration.toFixed(2)])),
  };
}

const EMPTY = new Map<string, THREE.AnimationClip>();

/**
 * The first of `names` the library holds.
 *
 * Exact matches only, in the order given. The loose fallback `findClip` offers
 * is deliberately not repeated here: a loose match for "Attack" finds
 * `Idle_Attacking` and `Attacking_Idle`, and with five files pooled the odds of
 * a loose match landing on the wrong character's idle go up rather than down.
 */
export function pickClip(...names: string[]): THREE.AnimationClip | null {
  const lib = clipLibrary();
  for (const n of names) {
    const clip = lib.get(n);
    if (clip) return clip;
  }
  return null;
}
