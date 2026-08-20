// The North Road — Emberhold's way out, and the first thing in this world that
// leads somewhere rather than radiating from a centre.
//
// Everything else here is polar: bands, camps, node rings, waystones, the town
// itself. That is the right shape for a world with one place in it, because
// distance from spawn IS difficulty and a radius says so. A road is the first
// object that does not fit — it is not AT a distance, it CROSSES all of them,
// and its whole point is to end somewhere that is not the middle.
//
// So it is a polyline, and the waypoints are still polar because that is the
// language every other position in this project speaks and because it is how
// the route was checked: each leg was measured against the real camp and node
// tables until nothing on the road sits inside anything's aggro. That is the
// road's one gameplay property and it is worth stating plainly —
//
//   THE ROAD IS THE SAFE WAY THROUGH.
//
// It passes near four camps and inside none of them. A player who follows it
// gets from the palisade to the frontier without a fight; a player who cuts the
// corner meets a mushnub camp, then wolves, then orc brutes. That is not
// decoration, it is the reason to build a road rather than draw one.

import { PLAYER_SPAWN, AGGRO_RANGE_PX } from "./protocol-types.ts";
import { TOWN_RADIUS_PX } from "./town.ts";

/** What is being built up there. Nothing stands at the site yet. */
export const NORTH_TOWN_NAME = "Coldharrow";

/**
 * How wide the track is, either side of its centreline.
 *
 * NARROWER than Emberhold's highway (120), and the number is not a style
 * choice: the north postern had to go in the sixty-degree gap between the inn
 * and the shop, and at a hundred and twenty the road's rim clips the shop's
 * near corner on every bearing that gap allows. Ninety-five clears it, and a
 * cart track between two towns being narrower than a town high street is what
 * it would be anyway.
 */
export const ROAD_HALF_WIDTH_PX = 95;

/**
 * The route, as (radius, bearing) from spawn.
 *
 * It leaves at 256 because that is where the postern is, bends west to pass
 * outside the mushnub camp at 270, then swings back through 266 to clear the
 * orc brutes at 250 before straightening onto true north for the long run out.
 * Every one of those numbers was measured rather than drawn: `tools/test/
 * road.mjs` walks the smoothed path and fails if any point comes inside a
 * pack's aggro or sits on top of a resource node.
 */
export const NORTH_ROAD_WAYPOINTS: readonly (readonly [number, number])[] = [
  [TOWN_RADIUS_PX, 256],
  [1300, 252],
  [1900, 258],
  [2500, 266],
  [3200, 269],
  [4100, 270],
  [5000, 270],
];

/** Where the road ends, and where the next town will stand. */
export const NORTH_TOWN_SITE: { x: number; y: number } = polar(5000, 270);

/**
 * How much room the road keeps from a monster camp's centre.
 *
 * Aggro plus the distance a pack reaches out from its own middle. Below this
 * the road stops being the safe way through and becomes a corridor of ambushes,
 * which is a different — and worse — thing to have built.
 */
export const ROAD_CAMP_CLEARANCE_PX = AGGRO_RANGE_PX + 70;

/**
 * And from a resource node.
 *
 * Deliberately small: a tree on the verge is scenery and a good reason to stop,
 * and only a node standing in the wheel ruts is wrong.
 */
export const ROAD_NODE_CLEARANCE_PX = 70;

/** How far apart the torches stand along it. */
export const ROAD_TORCH_SPACING_PX = 300;

/** How far off the centreline a torch stands, alternating side to side. */
export const ROAD_TORCH_OFFSET_PX = 82;

function polar(radiusPx: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: PLAYER_SPAWN.x + Math.cos(a) * radiusPx,
    y: PLAYER_SPAWN.y + Math.sin(a) * radiusPx,
  };
}

/**
 * The road as a dense polyline, in server pixels.
 *
 * Catmull-Rom through the waypoints, because a road built out of straight
 * segments has visible kinks at every joint and this camera looks along it. The
 * spline is evaluated HERE rather than in the client for the usual reason: the
 * client draws the ribbon from it, the torches are placed from it, and the test
 * walks it — three readers, one curve, and no chance of the drawn road and the
 * checked road being different roads.
 */
let cachedPath: { x: number; y: number }[] | null = null;

export function roadPath(stepsPerLeg = 24): { x: number; y: number }[] {
  // Memoised at the default resolution, and only there. The route is a
  // compile-time constant, so recomputing it is pure waste — but it matters
  // more than that reads: the ground-cover scatter asks `distanceToRoad`
  // roughly twenty thousand times during load, and each of those walked the
  // whole spline from its waypoints first. Twenty thousand Catmull-Rom
  // evaluations of a hundred and forty-five points is several seconds of load
  // time to answer a question about a curve that never changes.
  if (stepsPerLeg === 24 && cachedPath) return cachedPath;
  const built = buildPath(stepsPerLeg);
  if (stepsPerLeg === 24) cachedPath = built;
  return built;
}

function buildPath(stepsPerLeg: number): { x: number; y: number }[] {
  const pts = NORTH_ROAD_WAYPOINTS.map(([r, a]) => polar(r, a));
  const clampIdx = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = clampIdx(i - 1);
    const p1 = clampIdx(i);
    const p2 = clampIdx(i + 1);
    const p3 = clampIdx(i + 2);
    for (let s = 0; s < stepsPerLeg; s++) {
      const t = s / stepsPerLeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** How long the road is, end to end, in server pixels. */
export function roadLengthPx(): number {
  const path = roadPath();
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return total;
}

export interface RoadTorch {
  x: number;
  y: number;
  /** Which side of the road it stands on, so the two rows read as a pair. */
  side: -1 | 1;
  /** Distance along the road, for a stable per-torch flicker phase. */
  alongPx: number;
}

/**
 * Where the torches stand.
 *
 * DERIVED from the path rather than listed, so the lights follow the road the
 * moment a waypoint moves — the same rule the town's bench ring learned the
 * hard way, where eight typed bearings put three lamp posts inside a shop.
 *
 * Alternating sides, at a fixed spacing measured ALONG the curve rather than by
 * sampling every nth point: the spline's points are not evenly spaced (a tight
 * bend packs them together), so an index-based stride would bunch the torches
 * up on the corners and stretch them out on the straights — which is precisely
 * backwards, since a bend is where you most want to see where the road goes.
 */
export function roadTorches(): RoadTorch[] {
  const path = roadPath();
  const out: RoadTorch[] = [];
  let along = 0;
  let next = ROAD_TORCH_SPACING_PX * 0.5;
  let side: -1 | 1 = 1;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg = Math.hypot(dx, dy);
    if (seg <= 0) continue;
    while (along + seg >= next) {
      const t = (next - along) / seg;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      // Perpendicular to the direction of travel, so a torch on a bend still
      // stands beside the road rather than in it.
      const nx = -dy / seg;
      const ny = dx / seg;
      out.push({
        x: px + nx * ROAD_TORCH_OFFSET_PX * side,
        y: py + ny * ROAD_TORCH_OFFSET_PX * side,
        side,
        alongPx: next,
      });
      side = side === 1 ? -1 : 1;
      next += ROAD_TORCH_SPACING_PX;
    }
    along += seg;
  }
  return out;
}

/**
 * How far a point is from the road's centreline, in server pixels.
 *
 * Used by the test and by the ground-cover scatter, which has to stop growing
 * where the wheel ruts are for the same reason it stops at the town's paving:
 * wildflowers coming up through a road read as the road having been painted on
 * afterwards.
 */
export function distanceToRoad(x: number, y: number): number {
  const path = roadPath();
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq)) : 0;
    const d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
    if (d < best) best = d;
  }
  return best;
}
