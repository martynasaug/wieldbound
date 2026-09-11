// MODELLED HAIRSTYLES, LOADED ONCE AND SHARED.
//
// Each style is a GLB written by `tools/art/hair.py`, modelled in Blender on the
// Monk's actual skull. Its vertices are in the LOCAL space of the Monk's rigid
// head piece (`Monk001` — the one carrying the beard), so the mesh is hung
// beside that piece with that piece's own transform and lands exactly where it
// was modelled, with no fitting done here.
//
// One geometry per style for the whole session, shared by every character who
// wears it; each wearer gets its own material, because hair colour is theirs.

import * as THREE from "three";

import type { HairStyleId } from "../../../shared/look";
import { loadModel } from "./assets";

const geometries = new Map<HairStyleId, Promise<THREE.BufferGeometry | null>>();

/** The geometry for a style, or null for "none" or a file that failed to load. */
export function hairGeometry(style: HairStyleId): Promise<THREE.BufferGeometry | null> {
  if (style === "none") return Promise.resolve(null);
  let pending = geometries.get(style);
  if (!pending) {
    pending = loadModel(`hair/Hair_${style}.glb`)
      .then((group) => {
        let found: THREE.BufferGeometry | null = null;
        group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!found && mesh.isMesh) found = mesh.geometry;
        });
        if (!found) console.warn(`[hair] ${style}: no mesh in the file`);
        return found;
      })
      .catch((err) => {
        console.warn(`[hair] ${style}:`, err);
        return null;
      });
    geometries.set(style, pending);
  }
  return pending;
}

/** The node every hairstyle hangs beside, in the frame it was modelled against. */
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
