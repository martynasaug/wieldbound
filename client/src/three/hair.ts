// MODELLED HAIR, BEARDS AND BROWS, LOADED ONCE AND SHARED.
//
// Each piece is a GLB written by `tools/art/hair.py` or `tools/art/facial_hair.py`,
// modelled in Blender on the Monk's actual head. Its vertices are in the LOCAL
// space of the Monk's rigid head piece (`Monk001`), so the mesh is hung beside
// that piece with that piece's own transform and lands exactly where it was
// modelled, with no fitting done here.
//
// One geometry per file for the whole session, shared by every character who
// wears it; each wearer gets its own material, because hair colour is theirs.

import * as THREE from "three";

import type { BeardStyleId, HairStyleId } from "../../../shared/look";
import { loadModel } from "./assets";

const geometries = new Map<string, Promise<THREE.BufferGeometry | null>>();

/** A piece's geometry by file, or null if the file failed to load. */
function pieceGeometry(file: string): Promise<THREE.BufferGeometry | null> {
  let pending = geometries.get(file);
  if (!pending) {
    pending = loadModel(`hair/${file}.glb`)
      .then((group) => {
        let found: THREE.BufferGeometry | null = null;
        group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!found && mesh.isMesh) found = mesh.geometry;
        });
        if (!found) console.warn(`[look] ${file}: no mesh in the file`);
        return found;
      })
      .catch((err) => {
        console.warn(`[look] ${file}:`, err);
        return null;
      });
    geometries.set(file, pending);
  }
  return pending;
}

/** The file behind each head piece a look can wear, or null for none. */
export function lookPieceFile(slot: "hair" | "beard" | "brows", style?: HairStyleId | BeardStyleId): string | null {
  if (slot === "brows") return "Face_brows";
  if (!style || style === "none") return null;
  return slot === "hair" ? `Hair_${style}` : `Beard_${style}`;
}

export function lookPieceGeometry(file: string | null): Promise<THREE.BufferGeometry | null> {
  return file ? pieceGeometry(file) : Promise.resolve(null);
}

/**
 * The bone every piece hangs from, and the offset that puts it in the frame it
 * was modelled in.
 *
 * A BONE RATHER THAN A MESH, because a mesh name is a property of one body and
 * the hair has now outlived two. Every piece here was modelled in the local
 * space of `Monk001` — the Monk's rigid head piece, parented to `Head` — and
 * hung beside it carrying that piece's own transform, so it landed exactly
 * where it was authored with nothing fitted at runtime. That worked precisely
 * while the player was the Monk.
 *
 * The player body is the stripped Rogue now, and its `PlayerBody` mesh is
 * SKINNED, parented to the armature rather than to a bone, carrying the whole
 * body's transform. Pointing the old mesh-name anchor at it made every piece
 * appear in the wrong place at the wrong offset — hair the size of the skull.
 *
 * Measured, the two heads are near enough the same size (Monk 0.751 x 0.815 x
 * 0.934, Rogue 0.670 x 0.814 x 0.890), so no rescaling is wanted. What differs
 * is where the frame sits: the Monk's head piece centred at world z 2.100 and
 * this skull centres at 2.501, against a `Head` bone running 2.127 to 2.756.
 * The offset below is that difference, in the bone's own axes.
 */
export const HAIR_ANCHOR_BONE = "Head";
/**
 * DERIVED FROM THE SKULL, NOT TUNED AGAINST THE BONE.
 *
 * Two guesses at this bought six millimetres between them, because both were
 * wrong in two ways at once: wrong scale AND wrong sign. The bone's world matrix
 * says why. Its axes read x [0.61, 0, 0], y [0, 0.607, 0.064], z [0, -0.064,
 * 0.607] — the instance scale of 0.6105 is baked in, with a slight forward pitch
 * in the cross terms. So a local offset reaches the world multiplied by 0.607,
 * and -0.156 local moved the hair 0.095 down when it needed to go UP.
 *
 * And the target was never the bone origin. Measured in the running game, the
 * hair sat at world y 1.182 while the skull it is meant to cap centres at 1.403
 * and crowns at 1.802. Hair belongs on the skull, so the offset is the gap to
 * the skull's own centre, converted into the bone's frame:
 *
 *     (1.403 - 1.182) / 0.607 = +0.364 local, from a starting -0.156
 *
 * which is the number below. Anything further is a fit against the crown rather
 * than the centre, and should be measured the same way rather than nudged.
 */
export const HAIR_ANCHOR_OFFSET: [number, number, number] = [0, 0.208, 0];

export function hairMaterial(color: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    // Flat, like every other piece of the Monk: the export carries one normal
    // per face already, and smoothing would melt the clumps together.
    flatShading: true,
    // A lock seen from inside — under a fringe, inside a tail — must not be a hole.
    side: THREE.DoubleSide,
  });
}
