// Forests, planted.
//
// `shared/forests.ts` says where the woods are and how thick; this file turns
// that into trunks. The interesting decisions are all about COST, because a
// tree is two orders of magnitude more geometry than a tuft of grass and there
// are about a thousand of them.
//
//   * INSTANCED, like the ground cover, and for the same reason: the triangles
//     were never the problem, the draw calls were. The old treeline clones a
//     tree per instance and pays a draw call for each — affordable at 700
//     around a perimeter nobody stands in, and not affordable at all for woods
//     you walk through.
//   * CHUNKED on the same grid, so the frustum can reject the wood behind you.
//     This matters far more here than it did for the ground cover, where the
//     measurement showed very little was ever off screen: a wood is sixty units
//     across and the fog closes at a hundred and sixty-five, so most of the
//     world's trees are behind the camera at any moment.
//   * SHADOWS ON, which is the one place the budget is spent rather than saved.
//     A forest with no shadows on its own floor is a field with poles in it,
//     and the shadow frustum only covers thirty-odd units around the player —
//     so the cost is a few dozen trunks, not a thousand.
//
// WHAT IS NOT HERE IS THE POINT. Not one CommonTree — the round-crowned
// broadleaf is the harvestable wood node's silhouette and nothing else in the
// world may wear it. See the header of `shared/forests.ts`: that split is what
// lets there be trees inside the play area at all.

import * as THREE from "three";
import { loadModel } from "./assets";
import { CHUNK_UNITS, partsOf, seededRandom } from "./scatter";
import { PX_PER_UNIT, terrainHeight, toWorldX, toWorldZ } from "./World";
import { windyGeometry } from "./wind";
import {
  FORESTS,
  FOREST_LANDMARK_CLEARANCE_PX,
  FOREST_RIVER_CLEARANCE_PX,
  FOREST_ROAD_CLEARANCE_PX,
  type Forest,
  type ForestSpecies,
  forestStrengthAt,
} from "../../../shared/forests";
import { distanceToRoad } from "../../../shared/road";
import { riverAt } from "../../../shared/river";
import { LANDMARKS, landmarkPosition } from "../../../shared/landmarks";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../../../shared/protocol-types";

/**
 * The trees each kind of wood is made of, and how tall they stand.
 *
 * The height ranges start at six units and a resource node tops out at 4.6,
 * which is the second of the three channels keeping scenery and harvestable
 * apart (the first is the model list, the third is the node's nameplate). It is
 * also just true of woods: a tree in a stand grows for the light and comes out
 * taller and narrower than one in a field.
 */
const SPECIES_MODELS: Record<ForestSpecies, { model: string; height: [number, number] }[]> = {
  pine: [
    { model: "nature/Pine_1.gltf", height: [7.5, 12.5] },
    { model: "nature/Pine_3.gltf", height: [7.0, 11.5] },
    { model: "nature/Pine_5.gltf", height: [6.5, 11.0] },
    // The two pines the resource node used to borrow are back in general
    // circulation now that it does not: see NODE_MODELS in Game.
    { model: "nature/Pine_2.gltf", height: [7.0, 12.0] },
    { model: "nature/Pine_4.gltf", height: [6.5, 11.0] },
  ],
  twisted: [
    { model: "nature/TwistedTree_1.gltf", height: [6.0, 9.5] },
    { model: "nature/TwistedTree_2.gltf", height: [6.0, 9.0] },
    { model: "nature/TwistedTree_3.gltf", height: [6.5, 10.0] },
  ],
  dead: [
    { model: "nature/DeadTree_1.gltf", height: [6.0, 10.0] },
    { model: "nature/DeadTree_2.gltf", height: [6.0, 9.5] },
    { model: "nature/DeadTree_3.gltf", height: [6.5, 10.5] },
  ],
  mixed: [
    { model: "nature/Pine_1.gltf", height: [7.5, 12.0] },
    { model: "nature/Pine_3.gltf", height: [7.0, 11.0] },
    { model: "nature/TwistedTree_1.gltf", height: [6.0, 9.5] },
    { model: "nature/TwistedTree_3.gltf", height: [6.5, 10.0] },
    { model: "nature/DeadTree_2.gltf", height: [6.0, 9.5] },
  ],
};

/**
 * Undergrowth, planted only where the canopy is.
 *
 * Two species, both already in the ground cover, at a size that reads as a
 * forest-floor plant rather than as a lawn weed. This is what stops the space
 * between the trunks being the same mown green as the field outside — the
 * terrain shader darkens it and lays litter over it, but a wood you can see the
 * FLOOR of needs something standing on the floor.
 */
const UNDERGROWTH: { model: string; height: [number, number]; per: number }[] = [
  { model: "nature/Fern_1.gltf", height: [0.9, 1.7], per: 40 },
  { model: "nature/Plant_1.gltf", height: [0.7, 1.3], per: 26 },
];

/**
 * How many attempts are made per unit of density.
 *
 * Placement is rejection sampling against the canopy strength, so a wood that
 * averages sixty per cent canopy keeps about sixty per cent of its attempts.
 * Over-sampling by this much and accepting on strength is what makes the
 * density follow the SHAPE of the wood — thick in the middle, thinning to the
 * edge — rather than being uniform inside a ragged outline, which would read as
 * a stencil cut out of an orchard.
 */
const OVERSAMPLE = 1.9;

interface Placement {
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
  lean: number;
}

/** True where no trunk may stand, in server pixels. */
function blocked(sx: number, sy: number): boolean {
  if (sx < 30 || sx > WORLD_WIDTH - 30 || sy < 30 || sy > WORLD_HEIGHT - 30) return true;
  // The wheel ruts, and a margin either side so the road is a corridor with
  // trees beside it rather than a tunnel with trees in it.
  if (distanceToRoad(sx, sy) < FOREST_ROAD_CLEARANCE_PX) return true;
  // The water and its bank. A wood comes down to the river and stops, which is
  // the one place in this world where two features meet and have to agree.
  if (riverAt(sx, sy).distancePx < FOREST_RIVER_CLEARANCE_PX) return true;
  for (const l of LANDMARKS) {
    const at = landmarkPosition(l);
    // A waystone is a monument raised in the open on purpose, and the quest
    // that sends you to it describes a silhouette. A silhouette inside a wood
    // is not a silhouette.
    if (Math.hypot(sx - at.x, sy - at.y) < FOREST_LANDMARK_CLEARANCE_PX) return true;
  }
  return false;
}

function plantOne(
  f: Forest,
  rand: () => number,
  heightRange: [number, number],
): Placement | null {
  const a = rand() * Math.PI * 2;
  // Square-rooted, so the samples are uniform over the DISC rather than piling
  // up in the middle. Without it every wood would be a dense core with a halo,
  // which is what the canopy field is for and would then be applied twice.
  const r = Math.sqrt(rand()) * f.radiusPx * 1.24;
  const sx = f.x + Math.cos(a) * r;
  const sy = f.y + Math.sin(a) * r;
  if (rand() > forestStrengthAt(sx, sy)) return null;
  if (blocked(sx, sy)) return null;
  const x = toWorldX(sx);
  const z = toWorldZ(sy);
  return {
    x,
    z,
    y: terrainHeight(x, z),
    yaw: rand() * Math.PI * 2,
    scale: heightRange[0] + rand() * (heightRange[1] - heightRange[0]),
    // A few degrees off vertical. Trees are not fence posts, and a stand of
    // perfectly upright trunks is the single tell that a wood was placed by a
    // loop.
    lean: (rand() * 2 - 1) * 0.055,
  };
}

/**
 * Builds every wood into `group`.
 *
 * Returns the counts, because they are the numbers to watch when a wood is made
 * thicker: instances are cheap and draw calls are not.
 */
export async function buildForests(
  group: THREE.Group,
): Promise<{ trees: number; undergrowth: number; drawCalls: number }> {
  // Fixed seed. Every player's Thornwood is the same Thornwood, the same rule
  // the treeline and the ground cover have kept since Phase 47 — a wood that
  // reshuffled on reload would be a place you could not learn.
  const rand = seededRandom(70415);

  // Every model wanted by any wood, requested once and in parallel. Six woods
  // asking for their own species in turn would serialise a dozen round trips
  // and load the same pine five times.
  const wanted = new Set<string>();
  for (const f of FORESTS) for (const s of SPECIES_MODELS[f.species]) wanted.add(s.model);
  for (const u of UNDERGROWTH) wanted.add(u.model);
  const names = [...wanted];
  const loaded = await Promise.all(names.map((n) => loadModel(n).catch(() => null)));
  const protos = new Map<string, THREE.Group>();
  names.forEach((n, i) => {
    if (loaded[i]) protos.set(n, loaded[i]!);
  });

  // model -> chunk -> placements. Bucketed before anything is built, so the
  // draw is a pure consequence of where things ended up.
  const byModel = new Map<string, Map<number, Placement[]>>();
  const cols = Math.max(1, Math.ceil(WORLD_WIDTH / PX_PER_UNIT / CHUNK_UNITS));
  const cellOf = (x: number, z: number) => {
    const cx = Math.floor((x + WORLD_WIDTH / PX_PER_UNIT / 2) / CHUNK_UNITS);
    const cz = Math.floor((z + WORLD_HEIGHT / PX_PER_UNIT / 2) / CHUNK_UNITS);
    return cz * cols + cx;
  };
  const record = (model: string, p: Placement) => {
    let chunks = byModel.get(model);
    if (!chunks) byModel.set(model, (chunks = new Map()));
    const cell = cellOf(p.x, p.z);
    let list = chunks.get(cell);
    if (!list) chunks.set(cell, (list = []));
    list.push(p);
  };

  let trees = 0;
  let undergrowth = 0;

  for (const f of FORESTS) {
    const kinds = SPECIES_MODELS[f.species].filter((s) => protos.has(s.model));
    if (kinds.length === 0) continue;
    // Area in "blocks" of a million square pixels — the unit `perBlock` is
    // written in, so making a wood bigger makes it a bigger wood rather than a
    // thinner one.
    const blocks = (Math.PI * f.radiusPx * f.radiusPx) / 1e6;
    const attempts = Math.round(blocks * f.perBlock * OVERSAMPLE);
    for (let i = 0; i < attempts; i++) {
      const kind = kinds[Math.floor(rand() * kinds.length)];
      const p = plantOne(f, rand, kind.height);
      if (!p) continue;
      record(kind.model, p);
      trees++;
    }

    for (const u of UNDERGROWTH) {
      if (!protos.has(u.model)) continue;
      const n = Math.round(blocks * u.per * OVERSAMPLE);
      for (let i = 0; i < n; i++) {
        const p = plantOne(f, rand, u.height);
        if (!p) continue;
        record(u.model, p);
        undergrowth++;
      }
    }
  }

  const undergrowthModels = new Set(UNDERGROWTH.map((u) => u.model));
  const m = new THREE.Matrix4();
  const place = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  let drawCalls = 0;

  for (const [model, chunks] of byModel) {
    const proto = protos.get(model)!;
    const { parts, scale } = partsOf(proto, 1);
    if (parts.length === 0) continue;
    const casts = !undergrowthModels.has(model);
    // A TREE IS A MAST, NOT A BLADE OF GRASS. Six per cent of its height at the
    // tip and slowly, against thirty-odd per cent and quickly for grass — the
    // mass is what the eye is reading, and a pine that whipped like a fern
    // would make the whole wood read as scrub. The undergrowth on the forest
    // floor gets the softer, faster figure, because it IS scrub.
    const soft = undergrowthModels.has(model);
    const swayed = parts.map((p) =>
      windyGeometry(p.geometry, p.material, soft ? 0.22 : 0.09, soft ? 1.2 : 0.6),
    );
    for (const placements of chunks.values()) {
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        const im = new THREE.InstancedMesh(part.geometry, swayed[pi], placements.length);
        im.castShadow = casts;
        im.receiveShadow = true;
        for (let i = 0; i < placements.length; i++) {
          const p = placements[i];
          e.set(p.lean, p.yaw, p.lean * 0.6);
          q.setFromEuler(e);
          v.set(p.x, p.y, p.z);
          s.setScalar(scale * p.scale);
          place.compose(v, q, s);
          m.multiplyMatrices(place, part.local);
          im.setMatrixAt(i, m);
        }
        im.instanceMatrix.needsUpdate = true;
        // From the instance matrices, not the prototype's own box — otherwise
        // the frustum test rejects a whole chunk the moment its origin leaves
        // the view, and a wood pops out of existence while you are inside it.
        im.computeBoundingSphere();
        group.add(im);
        drawCalls++;
      }
    }
  }

  return { trees, undergrowth, drawCalls };
}
