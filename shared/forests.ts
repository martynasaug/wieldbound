// Forests — six of them, with names, and the end of the uniform treeline.
//
// What was here before was a PERIMETER: a ring of trees standing just outside
// the play bounds, framing the field from every side at the same density with
// the same species mix. It did its job, which was to stop the world ending in a
// straight edge, and it is the reason there was never a forest — a treeline is
// a wall made of trees, and a wall is the opposite of somewhere to go.
//
// A forest is a REGION. It has a middle and an edge, the edge is ragged, it is
// made of one kind of tree rather than all of them, and it is somewhere you can
// be inside. That last one is the whole point: the frontier this phase opened
// up is four kilometres of ground with a road down the middle of it, and until
// there is somewhere out there that looks different from everywhere else out
// there, the journey north is a long walk across one field.
//
// TWO RULES, and both are older than this file.
//
// **Nothing scattered may resemble a resource node.** That rule kept every tree
// outside the play bounds for six phases, because the harvestable wood node IS
// a tree — so scenery trees inside the world were scenery you would learn to
// click on. A forest cannot exist under it as written, so the rule is sharpened
// rather than broken: the woodcutter's tree is the ROUND-CROWNED broadleaf, and
// scenery is conifer, twisted and dead. Two disjoint model sets, a scale gap
// (a node is 3.4–4.6 units, a forest tree is 6–11), and the node's own
// nameplate pill on top. Three separating channels, none of them colour.
//
// **Emberhold's district stays open ground.** Every forest edge is past the
// furthest monster camp, and that is a gameplay statement rather than a
// convenience: the five bands are where the game is PLAYED — telegraphs to step
// out of, camps to judge the size of from a distance, nodes to spot — and
// filling them with trunks would cost all three. So the district is open, and
// the land takes over past it. Walking out of Emberhold now looks like leaving
// somewhere.

import { PLAYER_SPAWN, WORLD_WIDTH, WORLD_HEIGHT } from "./protocol-types.ts";

/**
 * How far out the frontier starts, in server pixels from spawn.
 *
 * The furthest camp centre is at 2,750 and a pack reaches 70px out from its own
 * middle, so the last thing in the district is at 2,820. This is that, plus
 * enough room that a wood is not the backdrop to a dragon fight.
 */
export const FOREST_MIN_EDGE_PX = 2900;

/** How far a trunk keeps from the road's centreline. */
export const FOREST_ROAD_CLEARANCE_PX = 118;

/** And from the river's, so a wood comes down to the bank and stops. */
export const FOREST_RIVER_CLEARANCE_PX = 210;

/** And from a waystone, which is a monument standing in the open by design. */
export const FOREST_LANDMARK_CLEARANCE_PX = 260;

/**
 * Which trees a wood is made of.
 *
 * NONE of these overlap the harvestable node's model list, and that is the
 * whole of the "scenery must not look interactive" rule as it now stands. The
 * node keeps every CommonTree — the round-crowned broadleaf, which is what
 * anybody draws when they draw "a tree you could chop down" — and gives up the
 * two pines it used to borrow. Everything here is a conifer, a twisted trunk or
 * a dead one, and none of it is a silhouette a player will ever have walked up
 * to and harvested.
 */
export type ForestSpecies = "pine" | "twisted" | "dead" | "mixed";

export interface Forest {
  id: string;
  name: string;
  /**
   * Absolute world pixels, NOT polar.
   *
   * The road's comment calls itself the first thing here that is not laid out
   * from spawn, and says why: polar is the right language for a world where
   * distance from the centre IS difficulty. A forest is one step further out
   * than the road even so — the road at least still has a bearing out of a gate
   * — and a wood four kilometres away has no relationship to spawn worth
   * writing down. It is somewhere on the map. So it has a coordinate.
   */
  x: number;
  y: number;
  /** Nominal radius. The real edge is this warped by noise, ±20%. */
  radiusPx: number;
  species: ForestSpecies;
  /**
   * Trees per one million square pixels at full canopy — that is, per 25x25
   * world units. A density rather than a headcount, the same call the ground
   * cover made, so a wood that is made bigger gets thicker rather than thinner.
   */
  perBlock: number;
  /** One line. Woods are places, and a place with no description is a texture. */
  blurb: string;
}

export const FORESTS: Forest[] = [
  {
    id: "pinereach",
    name: "Pinereach",
    x: 8000,
    y: 1500,
    radiusPx: 1400,
    species: "pine",
    perBlock: 34,
    blurb:
      "The pinewood the North Road runs straight through, and the last thing between the " +
      "Coldwater and the site where Coldharrow is to stand. It closes over the track for " +
      "half a mile and the torches are the only reason it is passable at night.",
  },
  {
    id: "blackstand",
    name: "Blackstand",
    x: 4300,
    y: 1900,
    radiusPx: 1500,
    species: "dead",
    perBlock: 22,
    blurb:
      "Standing dead, every one of them, and nobody agrees on what did it. Thin enough to " +
      "see a long way through and dark enough that seeing a long way is no comfort.",
  },
  {
    id: "mirefen",
    name: "The Mirefen",
    x: 11700,
    y: 1800,
    radiusPx: 1400,
    species: "twisted",
    perBlock: 26,
    blurb:
      "Where the Coldwater's north bank goes soft. The trees lean downhill towards the " +
      "water and have been leaning that way long enough to have grown into the lean.",
  },
  {
    id: "thornwood",
    name: "The Thornwood",
    x: 13200,
    y: 6400,
    radiusPx: 1900,
    species: "mixed",
    perBlock: 30,
    blurb:
      "The nearest wood to Emberhold that anyone has bothered to name, out past the eastern " +
      "rings. Close enough that the watch can see the top of it on a clear morning.",
  },
  {
    id: "sorrowwood",
    name: "Sorrowwood",
    x: 3000,
    y: 6600,
    radiusPx: 1800,
    species: "twisted",
    perBlock: 28,
    blurb:
      "Named by somebody who came back out of it. The trees are old and turned, and there " +
      "is no track through it in any direction.",
  },
  {
    id: "weepingwood",
    name: "The Weeping Wood",
    x: 8800,
    y: 10600,
    radiusPx: 1600,
    species: "mixed",
    perBlock: 32,
    blurb:
      "The southern wood, wetter than the rest and quieter than it has any business being. " +
      "The ground gives underfoot a long way before you reach anything you could call water.",
  },
];

export const FOREST_IDS: string[] = FORESTS.map((f) => f.id);

export function forestById(id: string): Forest | null {
  return FORESTS.find((f) => f.id === id) ?? null;
}

// Value noise, deterministic and integer-free at the seams. The same shape the
// terrain shader uses, written once more in TypeScript because this one has to
// give the SAME answer in three places that cannot share a GLSL function: the
// client that plants the trees, the terrain mesh that darkens the ground under
// them, and the test that checks where they are.
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function noise2(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How thick the canopy is at a point: 0 outside, 1 in the heart of a wood.
 *
 * THE EDGE IS THE WHOLE PROBLEM. A circle with a soft falloff reads as a
 * gradient of trees, which is not what the edge of a wood looks like from any
 * angle — a wood has bays and spurs and it ends, and it ends at a different
 * distance depending on which way you walked in. So the radius itself is warped
 * by a noise field at roughly a third of the wood's own size, and the falloff
 * across the warped edge is short. What you get is a ragged outline with the
 * density holding almost to it, which is a treeline you can stand at.
 *
 * Two fields, not one: a coarse one that shapes the outline and a finer one
 * that punches thin patches and small clearings into the interior, so the
 * middle of a wood is not a uniform stipple either.
 */
export function forestStrengthAt(x: number, y: number): number {
  let best = 0;
  for (const f of FORESTS) {
    const d = Math.hypot(x - f.x, y - f.y);
    // Cheap reject before any noise: outside the widest the warp can push the
    // edge, the answer is zero and no sampling is needed. This matters — the
    // query runs per terrain vertex and per placement attempt.
    if (d > f.radiusPx * 1.3) continue;
    const scale = 3 / f.radiusPx;
    const warp = (noise2(x * scale + f.x * 0.001, y * scale + f.y * 0.001) - 0.5) * 0.44;
    const edge = f.radiusPx * (1 + warp);
    let s = smoothstep(edge, edge * 0.82, d);
    if (s <= 0) continue;
    // Clearings. Never enough to open a hole you could lose the wood in, but
    // enough that walking through one is not walking through a grid.
    const holes = noise2(x * scale * 3.7 + 41.2, y * scale * 3.7 - 17.9);
    s *= 0.42 + 0.58 * smoothstep(0.24, 0.62, holes);
    if (s > best) best = s;
  }
  return best;
}

/** Which wood a point is in, or null. Used for the nameplate and the tests. */
export function forestAt(x: number, y: number): Forest | null {
  let best: Forest | null = null;
  let bestD = Infinity;
  for (const f of FORESTS) {
    const d = Math.hypot(x - f.x, y - f.y) / f.radiusPx;
    if (d < 1 && d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/** Distance from spawn to a wood's nearest nominal edge. The frontier rule. */
export function forestEdgeFromSpawn(f: Forest): number {
  return Math.hypot(f.x - PLAYER_SPAWN.x, f.y - PLAYER_SPAWN.y) - f.radiusPx;
}

/** True when the wood's nominal disc falls inside the map. */
export function forestInWorld(f: Forest, marginPx = 0): boolean {
  return (
    f.x - f.radiusPx > -marginPx &&
    f.x + f.radiusPx < WORLD_WIDTH + marginPx &&
    f.y - f.radiusPx > -marginPx &&
    f.y + f.radiusPx < WORLD_HEIGHT + marginPx
  );
}
