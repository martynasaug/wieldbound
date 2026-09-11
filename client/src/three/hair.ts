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

/** The node every piece hangs beside, in the frame it was modelled against. */
export const HAIR_ANCHOR_MESH = "Monk001";

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
