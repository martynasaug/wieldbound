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

/**
 * The pack's four outfits, cut into wearable garments.
 *
 * A DIFFERENT KIND OF PART, and that is why it has its own table rather than
 * being squeezed into the one above. Everything in `CATALOGUE` is a rigid prop
 * parented to a bone, carrying the local transform that put it there — a
 * pauldron, a belt, a pouch. These are SKINNED: the clothes of a pack body, with
 * the skin thirds cut away (`tools/art/base_body.py` records the split), bound
 * to the wearer's own skeleton and deforming with it. `DonorPart`'s bone,
 * position, quaternion and scale mean nothing for one of these.
 *
 * Cut by dominant bone weight, dropping every face that follows a hand, head or
 * foot bone, because the player's own body supplies those and an item must never
 * replace them:
 *
 *     robe     444 faces   from Wizard.001
 *     plate    563 faces   from Warrior_Body
 *     leather  600 faces   from Ranger
 *     light    350 faces   from Rogue
 *
 * Binding is safe for the reason harvesting rigid props was: bone order is
 * identical across all five rigs — 32 skinning bones in the same sequence — so
 * no `skinIndex` remap is needed. Proven rather than assumed: the Warrior's body
 * mesh was bound to the Wizard's skeleton in the running game and photographed
 * deforming correctly.
 */
const GARMENTS = {
  robe: "garments/robe.glb",
  plate: "garments/plate.glb",
  leather: "garments/leather.glb",
  light: "garments/light.glb",
} as const;

export type GarmentId = keyof typeof GARMENTS;

/** A harvested garment: geometry and the material it was painted with. */
export interface Garment {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /**
   * The rigid pieces that hang off bones beside the skinned cloth.
   *
   * A costume in this pack is two things: a skinned body, and armour parented to
   * bones next to it — the Warrior's pauldrons, the Ranger's cloak and bracers.
   * `garments.py` used to cut only the first, so the plate a player wore was the
   * padded suit with its pauldrons left in the source file. Empty for a garment
   * whose donor had none.
   */
  fittings: GarmentFitting[];
}

export interface GarmentFitting {
  /** The bone it hangs from, in the runtime's spelling: `UpperArmL`, not `UpperArm.L`. */
  bone: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const cache = new Map<DonorPartId, DonorPart | null>();
const garments = new Map<GarmentId, Garment | null>();
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

/**
 * Loads the four cut garments.
 *
 * SEPARATE FROM `loadWardrobe` BECAUSE THE FAILURE IS SEPARATE: a missing prop
 * costs a pauldron, and a missing garment costs a character their armour. Both
 * are survivable and neither should take the other down, so a garment that will
 * not load caches as null and the styles that wanted it fall back the way they
 * did before any of this existed.
 */
let garmentsReady: Promise<void> | null = null;

export function loadGarments(): Promise<void> {
  if (garmentsReady) return garmentsReady;
  garmentsReady = (async () => {
    for (const [id, file] of Object.entries(GARMENTS) as [GarmentId, string][]) {
      try {
        const root = await loadModel(file);
        let found: THREE.SkinnedMesh | null = null;
        root.traverse((o) => {
          const mesh = o as THREE.SkinnedMesh;
          if (!found && mesh.isSkinnedMesh) found = mesh;
        });
        if (!found) {
          // Loud: a garment file that parses but holds no skinned mesh is a
          // cutting mistake upstream, and silence would show as a character
          // wearing nothing at all.
          console.warn(`wardrobe: ${file} has no skinned mesh`);
          garments.set(id, null);
          continue;
        }
        const mesh: THREE.SkinnedMesh = found;
        const source = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
          THREE.MeshStandardMaterial;
        // DRESSED, BECAUSE NOTHING ELSE DRESSES A GLB. `dressFbx` rebuilds every
        // FBX material as a standard one at roughness 0.86 and metalness 0, with
        // the texture bound and the colour forced white; the glTF branch of
        // `assets.ts` does none of that and keeps whatever the file carries.
        //
        // Worn straight from the file, a garment is a `MeshPhysicalMaterial` on
        // glTF defaults, whose clearcoat and specular terms render it as a black
        // silhouette in this scene's lighting — all four photographed that way.
        // The atlases themselves are simply dark paintings (Rogue means 0.197,
        // Warrior 0.233), which is fine: they read correctly under the same
        // treatment the FBX bodies get, and wrong under any other.
        //
        // This is the third time the same gap has bitten — the body's black
        // chrome, the missing atlas, and now this — so it is worth stating
        // plainly: a GLB carries geometry, and the engine supplies the surface.
        const dressed = new THREE.MeshStandardMaterial({
          map: source?.map ?? null,
          color: source?.map ? new THREE.Color(0xffffff) : (source?.color?.clone() ?? new THREE.Color(0xffffff)),
          roughness: 0.86,
          metalness: 0,
        });
        dressed.name = source?.name ?? id;

        // THE FITTINGS, named `fit_<Bone>` by the cutter. Blender appends `.001`
        // when two pieces hang off one bone — the Rogue has two on `Abdomen` —
        // so the suffix is stripped rather than looked up and missed.
        const fittings: GarmentFitting[] = [];
        root.traverse((o) => {
          const piece = o as THREE.Mesh;
          if (!piece.isMesh || !piece.name.startsWith("fit_")) return;
          const bone = piece.name.slice(4).split(".")[0];
          if (!bone) return;
          const src = (Array.isArray(piece.material) ? piece.material[0] : piece.material) as
            THREE.MeshStandardMaterial;
          // Dressed the same way the cloth is, and for the same reason: a GLB
          // carries geometry, and the engine supplies the surface.
          const mat = new THREE.MeshStandardMaterial({
            map: src?.map ?? null,
            color: src?.map ? new THREE.Color(0xffffff) : (src?.color?.clone() ?? new THREE.Color(0xffffff)),
            roughness: 0.86,
            metalness: 0,
          });
          mat.name = `${id}_${bone}`;
          fittings.push({ bone, geometry: piece.geometry, material: mat });
        });

        garments.set(id, {
          // Shared and never mutated, exactly as the rigid parts are: geometry
          // is style, and the wearer owns only its material.
          geometry: mesh.geometry,
          material: dressed,
          fittings,
        });
      } catch (err) {
        // SAY WHY. A bare `catch` here cost a debugging round: all four garments
        // came back null with no warning at all, which is indistinguishable from
        // "the files hold no skinned mesh" and sent me looking at the cut rather
        // than at the fetch. Silent failure is the same fault as a rule nothing
        // consults — see `STRIP`, `removeGloves`, and the material step that
        // lived in a shell command instead of in the script.
        console.warn(`wardrobe: ${file} did not load —`, err);
        garments.set(id, null);
      }
    }
  })();
  return garmentsReady;
}

/** One cut garment, or null if its file never arrived. */
export function garment(id: GarmentId): Garment | null {
  return garments.get(id) ?? null;
}
