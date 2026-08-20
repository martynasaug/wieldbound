// Ground cover: the thousands of small things that turn a field into a place.
//
// **Everything here is instanced.** A tuft of grass is perhaps forty triangles,
// so the triangles were never the problem — the draw calls were. Two thousand
// separate Object3Ds is two thousand draw calls a frame and it does not matter
// how small each one is. One `InstancedMesh` per species collapses that to one
// call apiece, which is what makes it affordable to place enough of them to
// read as ground cover rather than as decoration someone remembered.
//
// **Nothing here is interactive, and nothing here may look like it is.** The
// harvestable nodes are a tree, a rock and a bush, so this list deliberately
// contains no tree, no boulder and no bush: it is grass, clover, ferns,
// flowers, mushrooms and pebbles, all of them ankle-height. That rule is the
// one that kept the Phase 47 treeline outside the play bounds, applied now to
// the inside — decor that can be mistaken for a resource node is worse than no
// decor, because the player learns to click on scenery.

import * as THREE from "three";
import { loadModel } from "./assets";
import { terrainHeight } from "./World";

export interface Species {
  /** Model file, relative to /models. */
  model: string;
  /** How many to place across the play area. */
  count: number;
  /**
   * World-unit size, min and max — the model's LARGEST dimension, not its
   * height. Normalising by height is the obvious choice and it is wrong here:
   * a clump of flowers and a pebble are both far wider than they are tall, so
   * pinning their height to 0.2 gave them a metre of spread. Largest-dimension
   * makes the number mean the same thing for a grass blade and a pebble.
   */
  size: [number, number];
  /**
   * Casting shadows is off for most of this. A grass tuft's shadow is a few
   * pixels of noise, and every caster is paid for again in the shadow pass — so
   * only things big enough for their shadow to be legible cast one.
   */
  castShadow?: boolean;
  /** Instances tilt up to this many radians off vertical, to break the grid. */
  tilt?: number;
}

/**
 * What grows here. Counts are for the whole 120x90 play area, tuned so the
 * field reads as covered without the far distance turning into soup.
 */
export const GROUND_COVER: Species[] = [
  { model: "nature/Grass_Common_Short.gltf", count: 900, size: [0.28, 0.5], tilt: 0.09 },
  { model: "nature/Grass_Common_Tall.gltf", count: 520, size: [0.45, 0.75], tilt: 0.1 },
  { model: "nature/Grass_Wispy_Short.gltf", count: 620, size: [0.3, 0.52], tilt: 0.1 },
  { model: "nature/Grass_Wispy_Tall.gltf", count: 360, size: [0.5, 0.8], tilt: 0.12 },
  { model: "nature/Clover_1.gltf", count: 300, size: [0.16, 0.26] },
  { model: "nature/Clover_2.gltf", count: 260, size: [0.16, 0.26] },
  { model: "nature/Fern_1.gltf", count: 180, size: [0.5, 0.85], tilt: 0.1, castShadow: true },
  { model: "nature/Plant_1.gltf", count: 150, size: [0.4, 0.7], castShadow: true },
  { model: "nature/Plant_7.gltf", count: 130, size: [0.4, 0.7], castShadow: true },
  { model: "nature/Flower_3_Single.gltf", count: 190, size: [0.22, 0.36] },
  { model: "nature/Flower_3_Group.gltf", count: 110, size: [0.3, 0.46] },
  { model: "nature/Flower_4_Single.gltf", count: 190, size: [0.22, 0.36] },
  { model: "nature/Flower_4_Group.gltf", count: 70, size: [0.3, 0.46] },
  { model: "nature/Mushroom_Common.gltf", count: 120, size: [0.18, 0.3] },
  // 3216 triangles for a mushroom the size of a fist — by far the worst
  // triangles-per-pixel in the kit, so it stays a rare find rather than ground
  // cover. Kept because it is the only bracket fungus here and it reads well
  // at the base of a tree.
  { model: "nature/Mushroom_Laetiporus.gltf", count: 26, size: [0.2, 0.34] },
  { model: "nature/Pebble_Round_1.gltf", count: 170, size: [0.1, 0.22], tilt: 0.5 },
  { model: "nature/Pebble_Round_2.gltf", count: 150, size: [0.1, 0.22], tilt: 0.5 },
  { model: "nature/Pebble_Round_3.gltf", count: 130, size: [0.1, 0.22], tilt: 0.5 },
  { model: "nature/Pebble_Square_1.gltf", count: 130, size: [0.1, 0.24], tilt: 0.5 },
  { model: "nature/Pebble_Square_2.gltf", count: 110, size: [0.1, 0.24], tilt: 0.5 },
];

/**
 * A seeded generator, so the field is identical on every reload and for every
 * player. An unseeded one would reshuffle the world each time somebody logged
 * in — the same reasoning the 2D scatter was built on, and the same one that
 * keeps the treeline fixed.
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** The mesh's transform inside its own model, which instancing must preserve. */
  local: THREE.Matrix4;
}

/**
 * Pulls a model apart into instanceable pieces.
 *
 * The local matrix is the part that is easy to miss: a glTF's mesh usually sits
 * under one or more transformed nodes, so instancing the geometry alone drops
 * that transform and the model arrives rotated onto its side or sunk into the
 * ground. Carrying `matrixWorld` into each instance matrix keeps it exact
 * without having to rewrite the geometry.
 */
function partsOf(proto: THREE.Group, normalizeTo: number): { parts: Part[]; scale: number } {
  proto.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(proto);
  const size = new THREE.Vector3();
  box.getSize(size);
  const largest = Math.max(size.x, size.y, size.z);
  const scale = largest > 0 ? normalizeTo / largest : 1;

  const parts: Part[] = [];
  proto.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    parts.push({ geometry: mesh.geometry, material: materials[0], local: mesh.matrixWorld.clone() });
  });
  return { parts, scale };
}

/**
 * Ground cover is split into square chunks, and this is why.
 *
 * One InstancedMesh per species is the fewest draw calls possible, but it is a
 * single object spanning the whole field, so the frustum test can never reject
 * it — every plant in the world is submitted every frame regardless of where
 * the camera is looking. Chunking trades draw calls for real culling.
 *
 * Measured, the trade is smaller than it looks, and the reason is worth
 * recording: the play area is only 120x90 units and the camera looks across it
 * at a shallow angle, so most of the field is genuinely inside the frustum most
 * of the time. Across chunk sizes of 22, 32 and 44 units the totals moved
 * between 289 calls / 718k triangles and 195 calls / 1.06M triangles — a real
 * difference, but not the order of magnitude that culling usually buys, because
 * there is very little off-screen to reject. 26 sits in the middle of that
 * range. If the world ever grows, this is the number to revisit first.
 */
const CHUNK_UNITS = 26;

export interface ScatterArea {
  halfWidth: number;
  halfHeight: number;
  /**
   * Circles the cover stays out of, in world units.
   *
   * Emberhold. The ground cover is wild growth — tufts, ferns, wildflowers —
   * and it was scattered over the whole play area from before there was
   * anything built on it, so the town arrived with grass and flowers growing
   * out of its paving. Excluded here rather than hidden by the paving, because
   * the plants stand a few centimetres proud of the ground and a decal cannot
   * cover something taller than itself.
   *
   * A LIST, not one circle, and that is a correction. One circle meant one
   * radius, and the only radius that kept plants out of the paving AND out of
   * six buildings was the whole town — which stripped the ring of grass between
   * the houses and the palisade down to bare green baize. The belt is the part
   * of Emberhold that is supposed to look like ground. Several circles let the
   * paving and each building be excluded on their own, and the grass between
   * them keeps growing.
   */
  exclude?: { x: number; z: number; radius: number }[];
}

/**
 * Builds every species into `group`. Returns the instance and draw-call totals;
 * the second is the number worth watching, since it should stay a couple of
 * dozen no matter how many thousand plants get placed.
 */
export async function buildGroundCover(
  group: THREE.Group,
  area: ScatterArea,
  seed = 91117,
): Promise<{ instances: number; drawCalls: number; chunks: number }> {
  const rand = seededRandom(seed);
  let instances = 0;
  let drawCalls = 0;

  const cols = Math.max(1, Math.ceil((area.halfWidth * 2) / CHUNK_UNITS));
  const rows = Math.max(1, Math.ceil((area.halfHeight * 2) / CHUNK_UNITS));
  const cellOf = (x: number, z: number) => {
    const cx = Math.min(cols - 1, Math.floor(((x + area.halfWidth) / (area.halfWidth * 2)) * cols));
    const cz = Math.min(rows - 1, Math.floor(((z + area.halfHeight) / (area.halfHeight * 2)) * rows));
    return cz * cols + cx;
  };

  const m = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const scaleV = new THREE.Vector3();

  // Every model is requested up front rather than one per iteration. The
  // placement below is pure arithmetic and needs no network, so awaiting each
  // species in turn serialised twenty round trips for no reason — and left the
  // field visibly assembling itself species by species while other systems
  // waited behind it for the same loader.
  const protos = await Promise.all(
    GROUND_COVER.map((species) =>
      loadModel(species.model).catch(() => {
        // A missing species is a thinner field, not a broken game.
        return null;
      }),
    ),
  );

  for (let index = 0; index < GROUND_COVER.length; index++) {
    const species = GROUND_COVER[index];
    const proto = protos[index];
    if (!proto) continue;

    // Sizes are per instance, so the prototype normalises to 1 unit across its
    // largest dimension and the instance matrix carries the real size.
    const { parts, scale } = partsOf(proto, 1);
    if (parts.length === 0) continue;

    // Every placement is drawn from the generator FIRST, in one pass, so the
    // field is identical no matter how the chunk grid happens to divide it —
    // bucketing afterwards keeps chunking a rendering decision rather than
    // something that can change where a plant grows.
    const buckets = new Map<number, THREE.Matrix4[]>();
    // Density, not a headcount. `species.count` is authored against the world
    // the scatter was written for; expressed as a fraction of that area, a
    // bigger map gets proportionally more cover instead of the same plants
    // spread thinner. Chunked culling means the cost follows what is on screen
    // rather than what exists.
    const AUTHORED_AREA = (4800 / 40) * (3600 / 40);
    const density = (area.halfWidth * 2 * area.halfHeight * 2) / AUTHORED_AREA;
    const total = Math.round(species.count * density);
    // Rejection sampling against the exclusion circles. Attempts are counted
    // rather than retried forever: at the town's share of the map this rejects
    // roughly one placement in eighty, and an unbounded retry loop is how a
    // future exclusion covering most of the world would hang the load.
    const zones = area.exclude ?? [];
    const excluded = (x: number, z: number) => {
      for (const c of zones) {
        if (Math.hypot(x - c.x, z - c.z) < c.radius) return true;
      }
      return false;
    };

    for (let i = 0; i < total; i++) {
      let x = (rand() * 2 - 1) * area.halfWidth;
      let z = (rand() * 2 - 1) * area.halfHeight;
      // A handful of retries, then give the placement up. Bounded on purpose:
      // an unbounded loop is how a future exclusion covering most of the map
      // would hang the load rather than merely thinning the cover.
      for (let tries = 0; tries < 8 && excluded(x, z); tries++) {
        x = (rand() * 2 - 1) * area.halfWidth;
        z = (rand() * 2 - 1) * area.halfHeight;
      }
      if (excluded(x, z)) continue;
      const h = species.size[0] + rand() * (species.size[1] - species.size[0]);
      const tilt = species.tilt ?? 0;

      e.set((rand() * 2 - 1) * tilt, rand() * Math.PI * 2, (rand() * 2 - 1) * tilt);
      q.setFromEuler(e);
      v.set(x, terrainHeight(x, z), z);
      scaleV.setScalar(scale * h);
      place.compose(v, q, scaleV);

      const cell = cellOf(x, z);
      let list = buckets.get(cell);
      if (!list) buckets.set(cell, (list = []));
      list.push(place.clone());
      instances++;
    }

    for (const placements of buckets.values()) {
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
        im.castShadow = species.castShadow ?? false;
        im.receiveShadow = true;
        for (let i = 0; i < placements.length; i++) {
          m.multiplyMatrices(placements[i], part.local);
          im.setMatrixAt(i, m);
        }
        im.instanceMatrix.needsUpdate = true;
        // The bounding sphere has to be computed from the instance matrices,
        // not inherited from the prototype's own tiny box, or the frustum test
        // rejects a chunk the moment its origin leaves the view.
        im.computeBoundingSphere();
        group.add(im);
        drawCalls++;
      }
    }
  }

  return { instances, drawCalls, chunks: cols * rows };
}
