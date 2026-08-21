// The Coldwater — the river the North Road crosses, and the second thing in
// this world that is not laid out from spawn.
//
// The road was the first, and its comment says why: bands, camps, node rings,
// waystones and the town are all polar because distance from spawn IS
// difficulty, and a road crosses every ring rather than sitting on one. A river
// is the same shape of object and one step further along — the road's waypoints
// are still written in polar terms because that is how the route was checked
// against the camps, but a river has nothing to do with the camps at all. It is
// a feature of the LAND. So it is authored in plain world pixels, west edge to
// east edge, and that is the honest coordinate system for it.
//
// IT HAS ONE GAMEPLAY PROPERTY, and it is the counterpart to the road's:
//
//   THE ROAD IS THE SAFE WAY THROUGH. THE BRIDGE IS THE ONLY WAY ACROSS.
//
// Until now the road was worth following and not worth staying on: cutting the
// corner cost you a fight, and a player who could take the fight had no reason
// to walk the curve. The river answers that. The whole frontier north of it —
// the far half of the map, the last stretch of the road, and the site where
// Coldharrow will stand — is reachable at exactly one point, and that point is
// on the road. That is a river doing what a river does to a map.
//
// It is the first solid thing outside the palisade, and the exception is
// deliberate rather than a change of policy. Phase 52 wrote down that nothing
// out here is solid — not a tree, not a boulder, not a waystone — because a
// second collision system for four props in a field is a mechanism to keep
// honest forever in exchange for nothing. A river is the opposite trade: it is
// ONE shape, it is the reason the bridge exists, and a river you can stroll
// across is not a river, it is a blue stripe painted on the grass.

import { PLAYER_SPAWN, WORLD_WIDTH } from "./protocol-types.ts";
import { ROAD_HALF_WIDTH_PX, roadPath } from "./road.ts";

export const RIVER_NAME = "The Coldwater";

/**
 * Half the width of the water, in server pixels.
 *
 * Bank to bank is three hundred pixels — seven and a half world units, which at
 * this camera is about four times a character's shoulders. Wide enough that the
 * far bank is obviously the far bank, narrow enough that a single-span timber
 * bridge is a believable thing for a frontier road to have.
 */
export const RIVER_HALF_WIDTH_PX = 150;

/**
 * The course, in absolute world pixels, west to east.
 *
 * It starts and ends OUTSIDE the map on both sides. A river that stopped at the
 * boundary would be a canal with two ends in a field, and — more practically —
 * a player who walked to the west edge would find the water simply cease and
 * could stroll round it, which would quietly undo the one property the river
 * has.
 *
 * The y values put it roughly 3,400px north of spawn, which is past every camp
 * (the furthest is at 2,750) and past every resource ring (2,680). That is not
 * an accident of drawing: the river is the boundary of Emberhold's district, so
 * it has to sit outside the district rather than through the middle of it.
 */
export const RIVER_WAYPOINTS: readonly (readonly [number, number])[] = [
  [-900, 3060],
  [1600, 2720],
  [3400, 3090],
  [5200, 2740],
  [6800, 2520],
  [8000, 2600],
  [9400, 2980],
  [11200, 2660],
  [13000, 3040],
  [14800, 2660],
  [16900, 2900],
];

/** How far from the water a monster camp or a resource node must stay. */
export const RIVER_CLEARANCE_PX = 240;

/**
 * How far along the road, either side of the water, the bridge deck runs.
 *
 * IT NO LONGER HAS TO REACH PAST THE BANKS, and that is what let it come down
 * from four hundred. It used to: the ground is cut into a channel around the
 * river, so a deck that stopped at the waterline would have ended in mid-air
 * over a slope — and a deck long enough to clear the whole cut is two and a
 * half times the width of the water it crosses, which reads as a pier rather
 * than a bridge. Now that the approach is part of the HEIGHT FIELD, the
 * causeway climbs the bank and the deck only has to span the water and land on
 * the slope either side.
 */
export const BRIDGE_HALF_SPAN_PX = 320;

/**
 * Half the width you can actually WALK on — the clear span between the rails.
 *
 * WIDER THAN THE ROAD, and the twelve pixels are measured rather than chosen.
 * The obvious value is the road's own half width, so that the bridge is the
 * road continuing rather than a separate object you step onto. That is wrong,
 * and the way it is wrong is worth keeping: the bridge's frame is a STRAIGHT
 * line — the road's tangent at the single point where the two curves meet —
 * while the road itself goes on bending across eight hundred pixels of span. By
 * the far abutment its verge has wandered 104px off that axis, nine past the
 * road's own 95, so a clear span of exactly the road's width put the outside
 * wheel rut through the parapet.
 *
 * `tools/test/river.mjs` measures the real curve and fails if this is ever
 * short of it again, which is the only way a number like this stays true when
 * somebody moves a waypoint.
 */
export const BRIDGE_WALK_HALF_PX = ROAD_HALF_WIDTH_PX + 12;

/**
 * Half the deck's width. Wider than the clear span, because the parapets stand
 * in the difference.
 */
export const BRIDGE_HALF_WIDTH_PX = BRIDGE_WALK_HALF_PX + 26;

/**
 * How long the earth approach is at each end, in server pixels.
 *
 * The deck is flat and about two units above the water; the land at the
 * abutment is a riverbank. Something has to get you from one to the other, and
 * it is a ramp of packed earth — so it lives in the HEIGHT FIELD rather than
 * being boxes laid on top of it. That is the whole fix for the seam: the
 * ground, the road ribbon, the player's feet and the torch posts all read the
 * same function, so there is no version of the transition where two of them
 * disagree.
 */
export const BRIDGE_RAMP_PX = 420;

function catmull(pts: { x: number; y: number }[], stepsPerLeg: number): { x: number; y: number }[] {
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
          (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

let cachedPath: { x: number; y: number }[] | null = null;

/** The river as a dense polyline, in server pixels. Same smoothing as the road. */
export function riverPath(): { x: number; y: number }[] {
  if (cachedPath) return cachedPath;
  cachedPath = catmull(
    RIVER_WAYPOINTS.map(([x, y]) => ({ x, y })),
    22,
  );
  return cachedPath;
}

// --- Answering "how far from the water am I" fast ----------------------------
//
// This one query is asked far more often than anything else in this file, and
// by the two most expensive loops in the client's load: every vertex of the
// terrain mesh (90,601 of them) and every ground-cover placement attempt
// (about twenty thousand). Walking a 221-point polyline for each would be
// twenty million segment tests, which is several seconds of load time to answer
// a question about a curve that never changes.
//
// The river is monotone in x by construction, so a bucket index over x reduces
// it to a handful of segments. The buckets are deliberately generous — each
// carries every segment within a wide x window rather than only those
// overlapping it — because the cost of testing a few extra segments is nothing
// and the cost of missing the nearest one is a wrong answer that would show up
// as a notch in the riverbank.
const BUCKET_PX = 200;
const BUCKET_MARGIN_PX = 900;
const BUCKET_ORIGIN = -1200;
let buckets: number[][] | null = null;

function buildIndex(): number[][] {
  const path = riverPath();
  const count = Math.ceil((WORLD_WIDTH + 2400 - BUCKET_ORIGIN) / BUCKET_PX) + 1;
  const out: number[][] = Array.from({ length: count }, () => []);
  for (let i = 1; i < path.length; i++) {
    const lo = Math.min(path[i - 1].x, path[i].x) - BUCKET_MARGIN_PX;
    const hi = Math.max(path[i - 1].x, path[i].x) + BUCKET_MARGIN_PX;
    const from = Math.max(0, Math.floor((lo - BUCKET_ORIGIN) / BUCKET_PX));
    const to = Math.min(count - 1, Math.floor((hi - BUCKET_ORIGIN) / BUCKET_PX));
    for (let b = from; b <= to; b++) out[b].push(i);
  }
  return out;
}

/**
 * Distance from the river's centreline, in server pixels, and how far along it
 * the nearest point lies as a 0..1 fraction from the west end.
 *
 * The fraction is what the client's water surface is graded by — a river has to
 * run downhill, and "downhill" is a property of position along the course
 * rather than of position in the world.
 */
export function riverAt(x: number, y: number): { distancePx: number; along: number } {
  const path = riverPath();
  if (!buckets) buckets = buildIndex();
  const b = Math.max(
    0,
    Math.min(buckets.length - 1, Math.floor((x - BUCKET_ORIGIN) / BUCKET_PX)),
  );
  const candidates = buckets[b];
  let best = Infinity;
  let bestIdx = 1;
  let bestT = 0;
  for (const i of candidates) {
    const a = path[i - 1];
    const c = path[i];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq)) : 0;
    const d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
    if (d < best) {
      best = d;
      bestIdx = i;
      bestT = t;
    }
  }
  if (best === Infinity) return { distancePx: Infinity, along: 0 };
  return { distancePx: best, along: (bestIdx - 1 + bestT) / (path.length - 1) };
}

/** Distance from the river's centreline alone. */
export function distanceToRiver(x: number, y: number): number {
  return riverAt(x, y).distancePx;
}

// --- The crossing ------------------------------------------------------------
//
// DERIVED, not typed. The bridge stands where the road meets the water, and the
// only way to keep that true when somebody moves a waypoint in either file is
// to work it out from both curves. A typed coordinate agrees on the day it is
// written; this one cannot disagree, and `tools/test/river.mjs` additionally
// pins that the two cross EXACTLY ONCE — a road that forded the same river
// twice would need two bridges and would have one.

export interface RiverCrossing {
  x: number;
  y: number;
  /** The road's bearing where it crosses, in degrees. The bridge's own axis. */
  angleDeg: number;
}

let cachedCrossing: RiverCrossing | null = null;

/** Every point where the road's centreline meets the river's, in road order. */
export function roadRiverCrossings(): RiverCrossing[] {
  const road = roadPath();
  const river = riverPath();
  const out: RiverCrossing[] = [];
  for (let i = 1; i < road.length; i++) {
    const a = road[i - 1];
    const b = road[i];
    for (let j = 1; j < river.length; j++) {
      const c = river[j - 1];
      const d = river[j];
      const r1x = b.x - a.x;
      const r1y = b.y - a.y;
      const r2x = d.x - c.x;
      const r2y = d.y - c.y;
      const denom = r1x * r2y - r1y * r2x;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((c.x - a.x) * r2y - (c.y - a.y) * r2x) / denom;
      const u = ((c.x - a.x) * r1y - (c.y - a.y) * r1x) / denom;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      out.push({
        x: a.x + r1x * t,
        y: a.y + r1y * t,
        angleDeg: (Math.atan2(r1y, r1x) * 180) / Math.PI,
      });
    }
  }
  return out;
}

/** Where the bridge stands. */
export function bridgeAt(): RiverCrossing {
  if (cachedCrossing) return cachedCrossing;
  const found = roadRiverCrossings();
  // A fallback rather than a throw: this is imported by the client's renderer,
  // and a route that had drifted off the water should cost a bridge in the
  // wrong place — which a test catches — rather than a black screen.
  cachedCrossing = found[0] ?? {
    x: PLAYER_SPAWN.x,
    y: RIVER_WAYPOINTS[5][1],
    angleDeg: -90,
  };
  return cachedCrossing;
}

/**
 * A point in the bridge's own frame: how far along the deck, and how far across
 * it.
 *
 * Exported because four separate things need it and every one of them getting
 * it slightly differently is how a bridge ends up with its torches in the road
 * and its deck under the player. The client's height field ramps the ground
 * with it, the road ribbon rides it, the torches mount to the parapet by it,
 * and the collision below keeps you between the rails with it.
 */
export function bridgeFrame(x: number, y: number): { along: number; across: number } {
  const at = bridgeAt();
  const a = (at.angleDeg * Math.PI) / 180;
  const dx = x - at.x;
  const dy = y - at.y;
  return {
    along: dx * Math.cos(a) + dy * Math.sin(a),
    across: -dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** And back again. */
export function bridgePoint(along: number, across: number): { x: number; y: number } {
  const at = bridgeAt();
  const a = (at.angleDeg * Math.PI) / 180;
  return {
    x: at.x + Math.cos(a) * along - Math.sin(a) * across,
    y: at.y + Math.sin(a) * along + Math.cos(a) * across,
  };
}

/**
 * Is this point on the walkable deck?
 *
 * The deck is a rectangle in the bridge's own frame — along the road, and
 * across it. A circle would have been simpler and wrong in the way that
 * matters: the deck is four times longer than it is wide, and a circle big
 * enough to cover its length would let somebody walk onto the water beside it.
 *
 * The WALKABLE width, not the deck's full width. The strip outside it is where
 * the parapets stand, and a body there is a body leaning over the rail — which
 * is over the water, and the water is the thing this answer exists to exclude.
 */
export function onBridge(x: number, y: number): boolean {
  const f = bridgeFrame(x, y);
  return Math.abs(f.along) <= BRIDGE_HALF_SPAN_PX && Math.abs(f.across) <= BRIDGE_WALK_HALF_PX;
}

/**
 * Slides a body out of the water.
 *
 * Perpendicular to the course, to whichever bank it is already nearer — the
 * same rule the palisade uses, and for the same reason: being caught in the
 * shape must never teleport you to the other side of it. Somebody wading in
 * from the south bank comes back out on the south bank.
 *
 * The bridge is the hole in it, exactly as the gateways are the holes in the
 * palisade. `onBridge` is checked FIRST rather than as part of the push,
 * because a body standing on the deck is by definition standing over the water
 * and every other branch here would move it.
 */
/** The closest point on the centreline to (x, y). */
function nearestOnCourse(x: number, y: number): { x: number; y: number } {
  const path = riverPath();
  if (!buckets) buckets = buildIndex();
  const b = Math.max(
    0,
    Math.min(buckets.length - 1, Math.floor((x - BUCKET_ORIGIN) / BUCKET_PX)),
  );
  let best = Infinity;
  let nx = x;
  let ny = y;
  for (const i of buckets[b]) {
    const a = path[i - 1];
    const c = path[i];
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq)) : 0;
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) {
      best = d;
      nx = px;
      ny = py;
    }
  }
  return { x: nx, y: ny };
}

/**
 * A hair further out than the water actually reaches.
 *
 * The same job `WALL_PADDING_PX` does in town, and it is not cosmetic: landing
 * a body EXACTLY on the keep-out radius leaves whether it is still in the water
 * to the last bit of a float, so half the pushes came out reading as failures.
 */
const BANK_PADDING_PX = 1.5;

export function resolveRiverCollision(
  x: number,
  y: number,
  radiusPx = 14,
): { x: number; y: number } {
  // --- The parapets ---------------------------------------------------------
  //
  // THE BRIDGE IS NOT A HOLE IN THE COLLISION, IT IS A CORRIDOR. The first
  // version treated the deck as a rectangle where the river simply did not
  // apply, which is most of a bridge and not the important part: it left the
  // sides open, so the only thing between a traveller and the water was the
  // fact that the deck happened to be drawn there. Walking off the edge put you
  // in the channel with a bridge overhead.
  //
  // A rail either side is also the one piece of collision out here that a
  // player will meet by accident rather than by trying, so it is a clamp rather
  // than a push: you slide along the parapet instead of being bounced off it,
  // exactly as the town's walls resolve on their shallowest axis.
  const f = bridgeFrame(x, y);
  // The catch is the DECK's full width, not the walkable strip's. Anything
  // within the footprint of a solid deck is on the bridge by definition — and
  // catching only the walkable strip left a band the width of a parapet where a
  // body fell through to the water rule and got pushed out sideways, which is a
  // few pixels wide and therefore exactly the sort of thing somebody finds once
  // and cannot reproduce.
  if (Math.abs(f.along) <= BRIDGE_HALF_SPAN_PX && Math.abs(f.across) <= BRIDGE_HALF_WIDTH_PX + radiusPx) {
    const limit = Math.max(0, BRIDGE_WALK_HALF_PX - radiusPx);
    if (Math.abs(f.across) <= limit) return { x, y };
    return bridgePoint(f.along, Math.sign(f.across) * limit);
  }

  const keepOut = RIVER_HALF_WIDTH_PX + radiusPx + BANK_PADDING_PX;

  // UP TO THREE PASSES, and the reason is the bends. One push moves the body
  // perpendicular to its NEAREST segment, which on the inside of a curve can
  // land it inside the keep-out of the next segment along — so a single pass
  // leaves somebody standing in the water on precisely the corners a river is
  // made of. Each pass strictly increases the distance from the centreline, so
  // this terminates; the cap is there because a cap on a loop in a movement
  // path is worth more than the last tenth of a pixel.
  for (let pass = 0; pass < 3; pass++) {
    const { distancePx } = riverAt(x, y);
    if (distancePx >= keepOut) break;
    const near = nearestOnCourse(x, y);
    let ox = x - near.x;
    let oy = y - near.y;
    const len = Math.hypot(ox, oy);
    if (len < 0.001) {
      // Dead on the centreline: no side to prefer, so pick a fixed one. Any
      // answer will do and a reproducible answer matters more.
      ox = 0;
      oy = 1;
    } else {
      ox /= len;
      oy /= len;
    }
    x = near.x + ox * keepOut;
    y = near.y + oy * keepOut;
  }
  return { x, y };
}

/** True while a body is in the water. For the tests and the wet-feet check. */
export function inRiver(x: number, y: number, radiusPx = 0): boolean {
  if (onBridge(x, y)) return false;
  return riverAt(x, y).distancePx < RIVER_HALF_WIDTH_PX + radiusPx;
}
