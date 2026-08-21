// The kit's own cosmetic pieces, lifted off the characters that were wearing
// them and made available to the one body.
//
// M55.1 pooled the five rigs' ANIMATIONS. This is the same move on their
// COSTUME, and it is available for the same reason: every one of these pieces
// is a mesh parented to a named bone, and all five rigs have the same bones.
// The Ranger's cloak hangs off `Head`, the Warrior's pauldrons off `UpperArmL`
// and `UpperArmR`, the Rogue's belt off `Abdomen`. Those bones exist on the
// Monk, so the pieces fit the Monk.
//
// WHY THIS IS EASIER THAN IT LOOKED. The expectation going in was that these
// would be SKINNED meshes, which would have meant remapping every vertex's
// `skinIndex` from the donor's bone order into the target's — the indices are
// positions in `skeleton.bones`, not names, so a mismatch renders confetti.
// Measured instead of assumed, and two things came back:
//
//   * Bone order is IDENTICAL across all five rigs — 32 skinning bones in the
//     same sequence — so even a genuine skinned rebind would need no remap.
//   * And almost nothing here is skinned anyway. A pauldron does not need to
//     deform; it needs to sit on a shoulder and turn with it, which is a rigid
//     mesh on a bone. Only the bodies themselves are skinned.
//
// So this file is a harvester and a cache, and the attaching is done by the
// same `holderFor` path the procedural armour already uses. That matters more
// than it sounds: it means a modelled pauldron and a generated one are the same
// kind of thing to everything downstream — the same rarity tint, the same
// bone, the same disposal.
//
// WHAT IT IS AND IS NOT FOR. These are pieces the kit happens to own, not a
// wardrobe designed for this game. Where one beats what `gear.ts` generates —
// a real cloak against a procedural sheet, a sculpted pauldron against a dome
// and a shell — it is used. Where it does not, the generated version stays,
// because a downloaded part that is worse than the thing it replaces is a
// downgrade with provenance.

import * as THREE from "three";
import { loadModel } from "./assets";

/** A harvested piece: geometry, where it sits, and which bone carries it. */
export interface DonorPart {
  geometry: THREE.BufferGeometry;
  bone: string;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

/**
 * Every piece worth taking, as `file:meshName`.
 *
 * Named individually rather than swept up by pattern, because three of the five
 * rigs ship a `Pouch` and a `Face` and they are not the same object — the
 * Wizard's pauldrons are little folded caps and the Warrior's are slabs, and
 * which one a style wants is a decision this table exists to record.
 */
const CATALOGUE = {
  // THE KIT CALLS THIS A CLOAK AND IT IS A HOOD.
  //
  // Its mesh name is `Cloak` and its parent bone is `Head`, which is already
  // the tell — a cloak hangs off the shoulders. Attaching it to the Monk and
  // looking settled it in one frame: a cowl over the skull with the fabric
  // trailing at the back, sitting exactly where a hood sits, at exactly the
  // right size. It is named for what it is here, because carrying the kit's
  // name for it would have put it in the cape slot and left somebody wondering
  // for a phase why the cape was on the character's head.
  "hood": ["Ranger", "Cloak"],
  "pauldron-heavy-l": ["Warrior", "ShoulderPadL"],
  "pauldron-heavy-r": ["Warrior", "ShoulderPadR"],
  "pauldron-soft-l": ["Wizard", "ShoulderPadL"],
  "pauldron-soft-r": ["Wizard", "ShoulderPadR"],
  "armguard-l": ["Ranger", "ArmGuardL"],
  "armguard-r": ["Ranger", "ArmGuardR"],
  "bracer": ["Rogue", "Guard"],
  "belt": ["Rogue", "Belt"],
  "pouch": ["Rogue", "Pouch"],
} as const;

export type DonorPartId = keyof typeof CATALOGUE;

const cache = new Map<DonorPartId, DonorPart | null>();
let ready: Promise<void> | null = null;

/**
 * Loads every donor file and harvests the catalogue.
 *
 * Three files, all of which `loadClipLibrary` has already fetched by the time
 * anybody wears anything, so in practice this is a cache read and a traversal.
 * It is still awaited rather than assumed, because "the animation library
 * happens to load first" is an ordering nobody wrote down and nothing enforces.
 */
export function loadWardrobe(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const files = new Set(Object.values(CATALOGUE).map(([f]) => f));
    const loaded = new Map<string, THREE.Group>();
    for (const f of files) {
      try {
        loaded.set(f, await loadModel(f));
      } catch {
        // A missing donor costs its pieces and nothing else; `gear.ts` falls
        // back to the generated version for anything that does not arrive.
      }
    }
    for (const [id, [file, meshName]] of Object.entries(CATALOGUE) as [
      DonorPartId,
      readonly [string, string],
    ][]) {
      const root = loaded.get(file);
      if (!root) {
        cache.set(id, null);
        continue;
      }
      let found: THREE.Mesh | null = null;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!found && m.isMesh && m.name === meshName) found = m;
      });
      if (!found) {
        console.warn(`wardrobe: ${file} has no mesh named ${meshName}`);
        cache.set(id, null);
        continue;
      }
      const mesh: THREE.Mesh = found;
      cache.set(id, {
        // Shared, never mutated. Geometry is style-only in this project — the
        // rarity lives in the material — so one copy serves every player
        // wearing the piece, exactly as the generated parts already do.
        geometry: mesh.geometry,
        // The bone it was authored against. Taken from the donor rather than
        // typed here for the same reason `gear.ts` harvests the grip instead of
        // authoring it: a transform tuned by eye is wrong on the next
        // animation and wrong again on the next body.
        bone: mesh.parent?.name ?? "Torso",
        position: mesh.position.clone(),
        quaternion: mesh.quaternion.clone(),
        scale: mesh.scale.clone(),
      });
    }
  })();
  return ready;
}

/** One harvested piece, or null if its donor never arrived. */
export function donorPart(id: DonorPartId): DonorPart | null {
  return cache.get(id) ?? null;
}
