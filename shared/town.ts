// Emberhold — the beginner town.
//
// The world had exactly one built thing in it: a smithy at the centre, which
// doubled as spawn, as the origin of the difficulty bands and as the only place
// a player could tell they were somewhere rather than nowhere. This file makes
// that centre a PLACE — seven buildings, a lantern-lit square, a herb garden
// and five people standing in it.
//
// Everything here is in SERVER PIXELS, like nodes, stations and monsters, so
// the town speaks the same coordinate language as everything else the protocol
// carries. The client divides by PX_PER_UNIT the same way it does for a wolf.
//
// The layout is expressed as (radius, angle) from spawn for the same reason the
// monster camps are: the one rule the world is laid out by is that distance
// from the smithy is difficulty, and a polar coordinate is that rule written
// down. It also means the town follows the world if the world is ever resized.

import { PLAYER_SPAWN } from "./protocol-types.ts";

export const TOWN_NAME = "Emberhold";

/** The square's centre — the smithy, and where every player arrives. */
export const TOWN_CENTER = PLAYER_SPAWN;

/**
 * Where the town stops.
 *
 * The palisade sits here, the light the town adds falls off across it, and the
 * nearest monster stands 130px beyond it — so the boundary is real ground
 * rather than a number: you can see where you stop being safe.
 *
 * 800, up from 560. The first build was measured against how much room the
 * BUILDINGS needed and it was too tight the moment anybody stood in it: this
 * is the one place in the game where several players are in the same twenty
 * metres at once, doing nothing in particular, and a square sized to its
 * architecture is a square you shuffle through rather than one you stand
 * around in. It is also exactly the first resource band now, so "the town" and
 * "the safe ring" are one fact.
 */
export const TOWN_RADIUS_PX = 800;

/**
 * How far the paved square reaches.
 *
 * Two thirds of the way to the wall, which is what leaves the belt of grass the
 * gardens, the woodpile and the back doors live in. It lives HERE rather than
 * as `radius * 0.66` inside the client's ground builder, because it is not only
 * the client that needs it: the ground-cover scatter has to know exactly where
 * the cobbles start so it can grow right up to them and no further. When those
 * two numbers were separate, the scatter kept out of the whole town to be safe
 * and the belt lost every blade of grass in it.
 */
export const TOWN_PAVED_RADIUS_PX = Math.round(TOWN_RADIUS_PX * 0.66);

/**
 * Gate bearings, in degrees. The wall opens where the road runs through.
 *
 * ONE road, east to west, straight through the square — not four spokes. Four
 * gates cut the ring into four 66-degree arcs, and the layout test showed that
 * six buildings do not fit in four arcs that size without pairs of them
 * overlapping at their front corners, which are the widest part of a footprint
 * seen from the centre. Two gates give two 156-degree arcs, three buildings
 * each, and comfortable gaps everywhere. It is also simply what a village on a
 * road looks like.
 */
/**
 * The gates, each with its own opening.
 *
 * A TABLE now rather than two bearings and one shared half-width, because the
 * third one is not the same kind of thing as the first two. East and west are
 * the highway: one road straight through the square, twelve degrees of arc
 * either side, wide enough for carts to pass. North is a POSTERN onto a country
 * track, and it has to be narrower — the gap between the inn at 225 and the shop
 * at 285 is sixty degrees wide, and a twelve-degree opening centred in it runs
 * the near corner of the shop straight through the road.
 *
 * 256 is the middle of the clear run, measured against the real footprints at
 * every radius from the square to the wall rather than picked by eye — the same
 * method `clearRingAngles` uses, and for the same reason: the last thing placed
 * on this ring by guessing ended up inside a building.
 */
export interface TownGate {
  angleDeg: number;
  halfDeg: number;
  /** What the signpost by it says. */
  name: string;
}

export const TOWN_GATES: readonly TownGate[] = [
  { angleDeg: 0, halfDeg: 12, name: "East Gate" },
  { angleDeg: 180, halfDeg: 12, name: "West Gate" },
  { angleDeg: 256, halfDeg: 8, name: "North Postern" },
];

/** Just the bearings. Derived, so a gate cannot exist in one list and not the other. */
export const TOWN_GATE_ANGLES: readonly number[] = TOWN_GATES.map((g) => g.angleDeg);

/** The highway's half-width. Still the default anything unnamed assumes. */
export const TOWN_GATE_HALF_DEG = 12;

/** How wide the opening is at a given gate bearing. */
export function gateHalfDeg(angleDeg: number): number {
  let best = TOWN_GATE_HALF_DEG;
  let closest = Infinity;
  for (const g of TOWN_GATES) {
    const delta = Math.abs(((g.angleDeg - angleDeg + 540) % 360) - 180);
    const off = 180 - delta;
    if (off < closest) {
      closest = off;
      best = g.halfDeg;
    }
  }
  return best;
}

function at(radiusPx: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(TOWN_CENTER.x + Math.cos(a) * radiusPx),
    y: Math.round(TOWN_CENTER.y + Math.sin(a) * radiusPx),
  };
}

// --- Buildings --------------------------------------------------------------

/**
 * What a building IS, which decides how it is drawn.
 *
 * A kind rather than a pile of measurements: the client owns proportions, roof
 * pitch and palette, and this file owns where things stand and what they are
 * called. Otherwise every tweak to a roof line would be a change to a file the
 * server imports.
 */
export type BuildingKind = "inn" | "shop" | "watchpost" | "chapel" | "cottage" | "stable";

export interface TownBuilding {
  id: string;
  kind: BuildingKind;
  /** Shown on the hanging sign. Cottages have none, because people live there. */
  name?: string;
  x: number;
  y: number;
  /** Footprint across the front, in server pixels. */
  widthPx: number;
  /** Footprint front to back. */
  depthPx: number;
  /**
   * Which way the front door faces, in degrees (0 = +x). Every building on the
   * ring looks at the square, because a town whose houses face outward reads as
   * a row of sheds.
   */
  facingDeg: number;
  /** Storeys. Two means a jettied upper floor, which is most of the silhouette. */
  storeys: 1 | 2;
}

/**
 * The ring.
 *
 * Radius 560 puts the near wall of every building about twelve units out from
 * the anvil, which leaves a plaza roughly twenty-four units across — big enough
 * that a dozen players can stand in it without anybody having to walk round
 * anybody, and still enclosed enough to read as one room rather than as a field
 * with sheds around it.
 *
 * It was 370 first, sized to the buildings. That is the wrong thing to size a
 * square to.
 *
 * Six buildings, not seven. The first attempt put seven on a tighter ring and
 * the layout test refused it: three pairs overlapped and three roads ran
 * straight into a wall, because a building's ANGULAR width grows as the ring
 * shrinks and 340px could not carry the frontage. Three more attempts followed
 * before the road went from four spokes to one through-road — which is the
 * change that actually made the arithmetic work, and is also the better town.
 *
 * Three buildings north of the road, three south, spaced so that even the front
 * corners — the widest part of a footprint seen from the square — clear their
 * neighbours and both gateways.
 */
const RING = 560;

export const TOWN_BUILDINGS: TownBuilding[] = [
  // --- South of the road ----------------------------------------------------
  // The biggest thing in town. Its frontage is why the arc it sits on carries
  // only two neighbours rather than three of equal size.
  {
    id: "inn",
    kind: "inn",
    name: "The Bent Nail",
    ...at(RING, 225),
    widthPx: 250,
    depthPx: 190,
    facingDeg: 45,
    storeys: 2,
  },
  {
    id: "shop",
    kind: "shop",
    name: "The Ledger & Lamp",
    ...at(RING, 285),
    widthPx: 205,
    depthPx: 175,
    facingDeg: 105,
    storeys: 2,
  },
  {
    id: "cottage-east",
    kind: "cottage",
    ...at(RING, 330),
    widthPx: 160,
    depthPx: 145,
    facingDeg: 150,
    storeys: 1,
  },
  // --- North of the road ----------------------------------------------------
  // The watch stands where it can see the east gate, which is the one the first
  // monster camp is nearest to.
  {
    id: "watchpost",
    kind: "watchpost",
    name: "Warden's Post",
    ...at(RING, 45),
    widthPx: 165,
    depthPx: 165,
    facingDeg: 225,
    storeys: 2,
  },
  {
    id: "chapel",
    kind: "chapel",
    name: "The Quiet Lamp",
    ...at(RING, 90),
    widthPx: 170,
    depthPx: 195,
    facingDeg: 270,
    storeys: 1,
  },
  {
    id: "cottage-west",
    kind: "cottage",
    ...at(RING, 135),
    widthPx: 160,
    depthPx: 145,
    facingDeg: 315,
    storeys: 1,
  },
];

// --- Walking into walls -----------------------------------------------------
// Until now the world had no static obstacle in it at all: bodies collided,
// scenery did not, and there was nothing solid enough for that to be
// noticeable. A town is nothing but walls, so it is noticeable immediately —
// walking through the inn is the fastest way to stop believing in a place.
//
// Movement is client-authoritative, so this runs there. It lives in shared/
// anyway, because the moment the server wants to know where a player can stand
// it must agree exactly, and a second copy of a footprint list is a second copy
// that goes stale.

/** A little slack, so a body slides along plaster rather than through it. */
const WALL_PADDING_PX = 12;

function toLocal(dx: number, dy: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

function toWorld(lx: number, ly: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: lx * cos - ly * sin, y: lx * sin + ly * cos };
}

/**
 * Slides a point out of any building it has ended up inside.
 *
 * Pushes along the SHALLOWEST axis of penetration, which is what makes a wall
 * feel like a wall rather than like a magnet: walk into a long face and you are
 * moved a few pixels straight back out, walk into a corner and you come out
 * round it. Resolving along the deepest axis instead teleports anyone who clips
 * a corner clean across the building.
 *
 * The local frame has +x running front-to-back (the depth axis, along the
 * facing) and +y across the front, which is why the halves are paired the way
 * they are — getting that round the wrong way makes wide buildings collide as
 * though they were deep ones, and the symptom is invisible until you walk into
 * exactly the wrong wall.
 */
export function pushOutOfBuildings(x: number, y: number, radiusPx = 16): { x: number; y: number } {
  for (const b of TOWN_BUILDINGS) {
    const local = toLocal(x - b.x, y - b.y, b.facingDeg);
    const halfDepth = b.depthPx / 2 + radiusPx + WALL_PADDING_PX;
    const halfWidth = b.widthPx / 2 + radiusPx + WALL_PADDING_PX;
    const overX = halfDepth - Math.abs(local.x);
    const overY = halfWidth - Math.abs(local.y);
    if (overX <= 0 || overY <= 0) continue;

    if (overX < overY) local.x += (local.x < 0 ? -1 : 1) * overX;
    else local.y += (local.y < 0 ? -1 : 1) * overY;

    const world = toWorld(local.x, local.y, b.facingDeg);
    x = b.x + world.x;
    y = b.y + world.y;
  }
  return { x, y };
}

/** True while the point is inside a building's footprint. For the tests. */
export function insideAnyBuilding(x: number, y: number, radiusPx = 0): boolean {
  for (const b of TOWN_BUILDINGS) {
    const local = toLocal(x - b.x, y - b.y, b.facingDeg);
    if (
      Math.abs(local.x) < b.depthPx / 2 + radiusPx &&
      Math.abs(local.y) < b.widthPx / 2 + radiusPx
    ) {
      return true;
    }
  }
  return false;
}

// --- Everything else standing in the square ---------------------------------
// The buildings were the only solid things in town for one build, and the
// result was a player walking straight through the well, the market stall and
// the palisade. Anything with a footprint is here, as a circle: a circle is a
// poor fit for a bench and an excellent fit for the question actually being
// asked, which is "how far must a body stay from the middle of this".
//
// The POSITIONS live here rather than in the client's builder, and that is the
// point of the file: the client draws the monument from this entry, the
// collision keeps you out of it from this entry, and there is no second copy to
// go stale the next time the square is rearranged.

export interface TownProp {
  id: string;
  /** Placement from the town centre, in the same polar terms as everything else. */
  radiusPx: number;
  angleDeg: number;
  /** How far a body must stay from its centre. */
  blockRadiusPx: number;
  /**
   * The building whose back yard this belongs to, for anything in the back lane.
   *
   * Set by `behind()`, which DERIVES the bearing from it, so the two cannot
   * disagree. Absent for everything in the square and for the handful of things
   * that deliberately stand in the GAPS between buildings — a woodpile, a
   * trough, the hives beside the herb garden — which belong to the town rather
   * than to any one house.
   */
  behind?: string;
}

/** Where the smithy stands. The server seeds the station from this too. */
export const SMITHY_RADIUS_PX = 330;
export const SMITHY_ANGLE_DEG = 140;

/**
 * How far to either side of the monument's axis counts as "standing behind it".
 *
 * The camera in this game has exactly one bearing — it looks along -z and its
 * distance is the only thing a player may change — so how far apart two things
 * appear ACROSS the screen is their difference in world x and nothing else.
 * Anything up-screen of the statue with a small enough x offset is therefore
 * permanently hidden by it, from every position a player can stand in.
 *
 * What that cost, the first time: the Herald stood at bearing 272, four fifths
 * of a metre off the axis, and every actor in the game carried a through-walls
 * silhouette — so the monument the whole square is built around had a blue
 * ghost of a mage painted down it, all day, at every zoom.
 *
 * THE SILHOUETTE IS NOT WHAT THIS RULE FIXES ANY MORE, and that is worth
 * stating because the two got conflated once already. Townspeople no longer
 * draw one at all (see the `silhouette` option on `Actor`), which kills the
 * ghost everywhere rather than only here — behind the inn, behind the well,
 * behind anything. Trying to fix it by placement instead meant being right
 * about how far back somebody has to stand before perspective lifts them clear
 * of the crown, and the arithmetic that answered that was wrong when it was
 * checked against a real raycast.
 *
 * What is left is the smaller and more durable complaint: somebody parked on
 * this bearing is a person you can neither see nor click, permanently, because
 * the camera cannot be walked round. So the rule stays, deliberately
 * CONSERVATIVE — 70px is the statue's own half-width plus a body's, plus room
 * to read the gap, and leaving a narrow wedge of a twenty-seven unit square
 * empty costs nothing. Only NPCs are checked: a player passing behind the
 * statue for a second is just occlusion doing its job.
 */
export const STATUE_SIGHT_HALF_PX = 70;

/** A planter either side of every bench. Colour at eye level, and solid. */
export const PLANTER_OFFSET_DEG = 4.5;
export const BENCH_RING_PX = 540;
export const LANTERN_RING_PX = 620;
export const GARDEN_RING_PX = 735;

/**
 * Where the square's ring furniture stands — benches, lamp posts, planters.
 *
 * DERIVED, not typed. These were eight hand-picked bearings meant to sit in the
 * gaps between the buildings, and two of them did not: the bench, the lamp post
 * and a planter at 292 stood inside the shop, and the same three at 338 stood
 * inside the east cottage. Nothing said so, because a lamp post inside a
 * building is invisible from every angle except the back of that building.
 *
 * So the gaps are worked out instead of guessed. Every whole bearing is tested
 * against the real footprints at BOTH ring radii — a bench ring and a lamp ring
 * are different distances out and a building is a rectangle, so clearing one
 * does not clear the other — and against the planter offsets either side, and
 * against the gateways, since furniture in the road is furniture a cart takes
 * out. The widest clear run in each window gets the piece.
 *
 * It comes out at SEVEN rather than eight, and that is the finding: between the
 * east cottage and the east gate there is no room at all, and there never was.
 * The eighth bench had been standing in a shop since the day the square was
 * widened.
 */
function clearRingAngles(): number[] {
  const clearAt = (deg: number, radiusPx: number) => {
    const a = (deg * Math.PI) / 180;
    const x = TOWN_CENTER.x + Math.cos(a) * radiusPx;
    const y = TOWN_CENTER.y + Math.sin(a) * radiusPx;
    return !insideAnyBuilding(x, y, RING_FURNITURE_CLEARANCE_PX) && !inGateway(deg);
  };
  const usable = (deg: number) =>
    clearAt(deg, BENCH_RING_PX) &&
    clearAt(deg, LANTERN_RING_PX) &&
    clearAt(deg - PLANTER_OFFSET_DEG, BENCH_RING_PX) &&
    clearAt(deg + PLANTER_OFFSET_DEG, BENCH_RING_PX);

  // Collect the runs of consecutive clear bearings, then take the middle of
  // each: the middle of a gap is the furthest a bench can be from both walls.
  const runs: number[][] = [];
  for (let deg = 0; deg < 360; deg++) {
    if (!usable(deg)) continue;
    const last = runs[runs.length - 1];
    if (last && deg === last[1] + 1) last[1] = deg;
    else runs.push([deg, deg]);
  }
  // A run that wraps past 360 is one window, not two.
  if (runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === 359) {
    const first = runs.shift()!;
    runs[runs.length - 1][1] += first[1] + 1;
  }
  // Anything narrower than a bench is not a gap, it is a crack.
  return runs
    .filter(([a, b]) => b - a >= 6)
    .map(([a, b]) => Math.round((a + b) / 2) % 360);
}

/** How much daylight ring furniture keeps between itself and a wall. */
const RING_FURNITURE_CLEARANCE_PX = 16;

// --- The back lane, placed from the building it belongs to -------------------
//
// The back-lane props were typed as bearings, and the same thing went wrong
// that went wrong with the bench ring: a number that looks reasonable sits
// behind the wrong thing and nothing says so. The washing line at 84/96 is
// commented in this file as "the two cottages' between them" and the cottages
// are at 135 and 330 — it was hung six degrees off the CHAPEL, which has no
// beds in it, for two milestones.
//
// So a back-yard prop names its building and says where across it stands, and
// the bearing is worked out. Being behind the wrong building is not a number
// you can get wrong any more; it is a spelling mistake in a building id.
//
// `across` is a fraction of the building's OWN half-width as seen from the
// centre: 0 is dead behind it, ±1 is level with its corners, and a little past
// ±1 is the yard spilling round the side, which is where a real washing line
// goes. The half-width is measured at the building's own radius, because that
// is the angular wedge it occupies from the middle of the square — the lane is
// further out, so the same wedge is more ground, which is exactly why there is
// room out there for anything at all.

/** How far out the belt of worked ground between the houses and the wall sits. */
export const BACK_LANE_PX = 690;

/** The bearing a building occupies from the centre, and how wide that wedge is. */
export function buildingWedge(buildingId: string): { angleDeg: number; halfDeg: number } {
  const b = TOWN_BUILDINGS.find((x) => x.id === buildingId);
  if (!b) throw new Error(`no building "${buildingId}"`);
  const dx = b.x - TOWN_CENTER.x;
  const dy = b.y - TOWN_CENTER.y;
  const radius = Math.hypot(dx, dy) || 1;
  return {
    angleDeg: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360,
    halfDeg: (Math.atan2(b.widthPx / 2, radius) * 180) / Math.PI,
  };
}

/** A prop standing in the back lane behind a named building. */
function behind(
  id: string,
  buildingId: string,
  across: number,
  blockRadiusPx: number,
  radiusPx: number = BACK_LANE_PX,
): TownProp {
  const wedge = buildingWedge(buildingId);
  return {
    id,
    radiusPx,
    angleDeg: (wedge.angleDeg + across * wedge.halfDeg + 360) % 360,
    blockRadiusPx,
    behind: buildingId,
  };
}

export const BENCH_ANGLES: readonly number[] = clearRingAngles();
export const LANTERN_ANGLES: readonly number[] = BENCH_ANGLES;
export const GARDEN_ANGLES = [20, 65, 110, 160, 200, 250, 295, 340] as const;

export const TOWN_PROPS: TownProp[] = [
  // THE STATUE, and it stands in the middle.
  //
  // M49.1 cleared the centre on the grounds that it is where every player
  // materialises and anything standing there is something they arrive inside.
  // That was the right diagnosis and the wrong cure: it left the one spot every
  // eye lands on empty, and a square with a hole in the middle is a car park.
  // The centre is occupied now and ARRIVAL moved instead — see `PLAYER_ARRIVAL`
  // below, which is the thing that actually needed fixing.
  //
  // Its keep-out is small for its size on purpose. The road runs gate to gate
  // straight through here, so the island has to be narrow enough that the
  // corridor either side of it is comfortably walkable; `tools/test/town.mjs`
  // checks exactly that rather than trusting it.
  { id: "statue", radiusPx: 0, angleDeg: 0, blockRadiusPx: 66 },
  { id: "well", radiusPx: 400, angleDeg: 25, blockRadiusPx: 54 },
  { id: "stall", radiusPx: 400, angleDeg: 205, blockRadiusPx: 68 },
  // The smithy blocks NOTHING, and that is deliberate rather than an omission.
  // Its six props are arranged AROUND an empty origin — that empty spot is
  // where a player stands to craft, and `atStation` wants them within 40px of
  // it. A keep-out circle of any useful size for an anvil would put the forge
  // permanently out of reach of the person standing at it, which is a bug that
  // would have shipped looking like the bench had simply stopped working.
  { id: "smithy", radiusPx: SMITHY_RADIUS_PX, angleDeg: SMITHY_ANGLE_DEG, blockRadiusPx: 0 },
  // Odds and ends against the buildings.
  { id: "woodpile", radiusPx: 660, angleDeg: 165, blockRadiusPx: 44 },
  { id: "trough", radiusPx: 660, angleDeg: 105, blockRadiusPx: 42 },
  ...BENCH_ANGLES.map((a) => ({
    id: `bench-${a}`,
    radiusPx: BENCH_RING_PX,
    angleDeg: a,
    blockRadiusPx: 40,
  })),
  ...GARDEN_ANGLES.map((a) => ({
    id: `garden-${a}`,
    radiusPx: GARDEN_RING_PX,
    angleDeg: a,
    blockRadiusPx: 62,
  })),
  // Lamp posts are thin and there are a lot of them; blocked, but only just.
  ...LANTERN_ANGLES.map((a) => ({
    id: `lantern-${a}`,
    radiusPx: LANTERN_RING_PX,
    angleDeg: a,
    blockRadiusPx: 18,
  })),

  // --- The dressing --------------------------------------------------------
  // Added when the square was furnished. They live here rather than in the
  // client's builder for the reason the well and the monument already did: the
  // client draws each one from this entry and the collision keeps a body out of
  // this entry, so there is no second copy to go stale — and the failure being
  // avoided is a handcart you walk straight through, which is exactly what the
  // palisade and the well used to do.
  // Behind the inn rather than out on the paving. It was at 505/128 and that
  // put it inside the west cottage — which nothing noticed, because a handcart
  // indoors is invisible from every angle but one.
  { id: "noticeboard", radiusPx: 470, angleDeg: 168, blockRadiusPx: 38 },
  { id: "brazier-a", radiusPx: 430, angleDeg: 312, blockRadiusPx: 26 },
  { id: "brazier-b", radiusPx: 430, angleDeg: 88, blockRadiusPx: 26 },
  // --- The back lane -------------------------------------------------------
  // The belt of grass between the houses and the palisade. A village's back
  // land is the most WORKED ground it has — firewood, laundry, hens, hay — and
  // this was mown lawn with a fence round it for two milestones.
  //
  // A BACK YARD SAYS WHAT THE BUILDING IS. That is the rule these are chosen
  // by, and it is why the chapel and the shop were the two that read as empty
  // however many objects were standing in them: the watch has a pell and a
  // spear rack, a cottage has hay, the inn has sheets and a handcart, and those
  // four yards are legible from the far side of the square. The chapel had a
  // washing line — hung there by a typed bearing, six degrees off a building
  // with no beds in it — and the shop had nothing at all inside its own width.
  //
  // Everything here is placed by `behind()` now, from the building it belongs
  // to. Only the gap pieces below keep a typed bearing, because they belong to
  // the town rather than to a house.
  ...[
    // The watch: a pell to hit and somewhere to stand the spears.
    behind("trainingpost", "watchpost", -0.85, 34),
    behind("spearrack", "watchpost", 0.85, 32, 686),
    // A cottage: hay, and a water butt at the corner.
    behind("hayrick", "cottage-west", -0.3, 48, 700),
    behind("rainbarrel-c", "cottage-west", 0.85, 18, 660),
    // A cottage chops its own firewood, and this yard needed something of its
    // OWN: a water butt and half a washing line are both things two other
    // buildings also have.
    behind("choppingblock", "cottage-east", -0.85, 40, 692),
    behind("rainbarrel-d", "cottage-east", -0.15, 18, 664),
    // The inn: sheets from the beds upstairs, a barrel, and the handcart —
    // which is the inn's OWN, and was sitting two degrees outside its wedge as
    // a typed bearing.
    behind("rainbarrel-b", "inn", 0.55, 18, 664),
    behind("laundry-a1", "inn", -1.05, 14, 700),
    behind("laundry-a2", "inn", 0.1, 14, 700),
    behind("cart", "inn", 1.15, 52, 690),
    // THE CHAPEL. "The Quiet Lamp" — stone, slate, and the only building in
    // town that is not somebody's trade or somebody's bed. Its back land is a
    // small burial ground: three markers leaning at their own angles and a low
    // offering stone with a lamp on it, which is the thing the place is named
    // for and had nowhere to stand.
    behind("grave-a", "chapel", -0.92, 16, 706),
    behind("grave-b", "chapel", -0.5, 16, 700),
    behind("grave-c", "chapel", -0.06, 16, 708),
    behind("offeringstone", "chapel", 0.5, 30, 668),
    behind("rainbarrel-a", "chapel", 0.95, 18, 662),
    // THE SHOP. "The Ledger & Lamp" — a counting house, so its back land is
    // where the goods wait: crates stacked against the wall and sacks beside
    // them. It had nothing inside its own width at all.
    behind("cratestack", "shop", -0.62, 34, 690),
    behind("sackpile", "shop", -0.02, 28, 684),
    behind("rainbarrel-e", "shop", 0.8, 18, 660),
    // A cottage has beds too, which is where the second washing line was
    // always meant to go — the comment that put it "between the two cottages"
    // has been in this file since it was written, and 84/96 is between neither
    // of them. A line legitimately runs past the corner of a house, which is
    // what the fractions past 1 are for.
    behind("laundry-b1", "cottage-east", 0.05, 14, 700),
    behind("laundry-b2", "cottage-east", 1.55, 14, 700),
  ],
  // Hives beside the herb garden, and one more round the back. These stand in
  // the GAPS rather than behind anything: bees belong to the town.
  { id: "beehive-a", radiusPx: 672, angleDeg: 74, blockRadiusPx: 20 },
  { id: "beehive-b", radiusPx: 672, angleDeg: 79, blockRadiusPx: 20 },
  { id: "beehive-c", radiusPx: 690, angleDeg: 258, blockRadiusPx: 20 },

  // Two per bench. Small, but a tub of earth is a thing you walk round.
  ...BENCH_ANGLES.flatMap((a) =>
    [-PLANTER_OFFSET_DEG, PLANTER_OFFSET_DEG].map((offset) => ({
      id: `planter-${a}-${offset > 0 ? "r" : "l"}`,
      radiusPx: BENCH_RING_PX,
      angleDeg: a + offset,
      blockRadiusPx: 22,
    })),
  ),
];

/** World position of a prop, from its polar placement. */
export function propPosition(prop: TownProp): { x: number; y: number } {
  return at(prop.radiusPx, prop.angleDeg);
}

export function propById(id: string): TownProp | null {
  return TOWN_PROPS.find((p) => p.id === id) ?? null;
}

/** How thick the palisade is, for the purposes of not walking through it. */
const WALL_THICKNESS_PX = 22;

/**
 * True when a bearing falls inside one of the gateways.
 *
 * THIS ASKED THE OPPOSITE QUESTION FOR FOUR PHASES. It was
 * `180 - delta < HALF` over a correctly-computed shortest angular difference,
 * which is "is this bearing nearly OPPOSITE a gate" — and with exactly two
 * gates a hundred and eighty degrees apart, that is accidentally the right
 * answer every time. `inGateway(0)` came out true because of the gate at 180,
 * and `inGateway(180)` because of the gate at 0. Two wrongs, one for each gate,
 * cancelling perfectly.
 *
 * The third gate is what broke the coincidence: at 256 it made a hole in the
 * palisade at 76 degrees — open ground behind the chapel — and left its own
 * bearing walled shut. Nothing else in the game would have found this, because
 * nothing else ever asked the question anywhere but on a gate bearing.
 */
export function inGateway(angleDeg: number): boolean {
  return TOWN_GATES.some((g) => {
    // Shortest signed difference between two bearings, folded to a magnitude.
    const delta = Math.abs(((angleDeg - g.angleDeg + 540) % 360) - 180);
    return delta < g.halfDeg;
  });
}

/**
 * Everything solid in Emberhold, resolved in one call.
 *
 * Order matters and is not arbitrary: buildings first because they are the
 * biggest and a body pushed off a bench into a wall should end up outside the
 * wall, then the props, then the palisade last so that nothing can shove
 * somebody through it on the way out.
 */
export function resolveTownCollision(
  x: number,
  y: number,
  radiusPx = 16,
): { x: number; y: number } {
  const out = pushOutOfBuildings(x, y, radiusPx);
  x = out.x;
  y = out.y;

  for (const prop of TOWN_PROPS) {
    // Zero means "drawn here, walk through it" — see the smithy.
    if (prop.blockRadiusPx <= 0) continue;
    const p = propPosition(prop);
    const dx = x - p.x;
    const dy = y - p.y;
    const keepOut = prop.blockRadiusPx + radiusPx;
    const distance = Math.hypot(dx, dy);
    if (distance >= keepOut) continue;
    // Dead centre is the one case with no direction to push in. Any direction
    // will do and a fixed one is reproducible, which matters more.
    if (distance < 0.001) {
      x = p.x + keepOut;
      continue;
    }
    x = p.x + (dx / distance) * keepOut;
    y = p.y + (dy / distance) * keepOut;
  }

  // The palisade. A ring you cross only at a gateway, pushed to whichever side
  // you are already nearer — so being caught in it never teleports you into or
  // out of town, only clear of the timber.
  const dx = x - TOWN_CENTER.x;
  const dy = y - TOWN_CENTER.y;
  const r = Math.hypot(dx, dy);
  const inner = TOWN_RADIUS_PX - WALL_THICKNESS_PX - radiusPx;
  const outer = TOWN_RADIUS_PX + WALL_THICKNESS_PX + radiusPx;
  if (r > inner && r < outer && r > 0.001) {
    const bearing = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (!inGateway(bearing)) {
      const target = r < TOWN_RADIUS_PX ? inner : outer;
      x = TOWN_CENTER.x + (dx / r) * target;
      y = TOWN_CENTER.y + (dy / r) * target;
    }
  }

  return { x, y };
}

// --- The people -------------------------------------------------------------

/**
 * What an NPC is FOR.
 *
 * Four roles, and each does something the game could not do before: `vendor`
 * trades, `quest` hands out work, `guide` explains rules the game has never
 * said out loud, and `flavour` is someone who lives here. A fifth role that
 * only talks would be scenery with a nameplate, so there isn't one.
 */
export type NpcRole = "vendor" | "quest" | "guide" | "flavour";

/**
 * Which body to build them from.
 *
 * Deliberately the abstract archetype rather than a model filename: `shared/`
 * knows nothing about FBX files, and the client already owns the class-to-body
 * table that puts a robe on a mage.
 */
export type NpcBody = "warrior" | "ranger" | "mage" | "rogue" | "adventurer";

export interface NpcTopic {
  /** What the player clicks. */
  q: string;
  /** What they say back. One paragraph; the panel wraps it. */
  a: string;
}

export interface TownNpc {
  id: string;
  name: string;
  /** Under the name, on the plate and in the dialogue header. */
  title: string;
  role: NpcRole;
  body: NpcBody;
  /** Icon key drawn on the plate and beside the name in the panel. */
  icon: string;
  x: number;
  y: number;
  /** Which way they stand, in degrees (0 = +x). Everyone faces the square. */
  facingDeg: number;
  /**
   * Their round: the handful of places they stand over and over.
   *
   * Optional, and the fallback is the post — somebody with no beat stands where
   * `x`/`y` put them forever, which is what everyone did before this existed.
   * The first stop is conventionally the post itself, so a person's beat starts
   * where their nameplate has always been.
   */
  beat?: readonly NpcStop[];
  /** The first thing they say, before any topic is picked. */
  greeting: string;
  topics: NpcTopic[];
}

/** How close you have to stand before someone will talk to you. */
export const NPC_TALK_RANGE_PX = 150;

/**
 * One place on somebody's round, and how long they stand in it.
 *
 * Polar from the town centre, like every other position in this file, so a stop
 * can be checked against the real building footprints with the same helpers a
 * bench is — which is the whole reason the back lane's props are placed this
 * way. A path is only placement with a time axis on it, and it goes wrong in
 * exactly the same silent ways.
 */
export interface NpcStop {
  radiusPx: number;
  angleDeg: number;
  /** Which way they face while standing here. Defaults to their post's. */
  facingDeg?: number;
  /** How long they stand still before setting off for the next one. */
  dwellMs: number;
}

/**
 * How far anybody is allowed to stray from their post.
 *
 * This is not a tidiness rule, it is what keeps a conversation from ending
 * because the other person walked off — see `NPC_TETHER_PX`, which is derived
 * from it. It is also a design bound: an NPC you have to chase is worse than
 * one that never moves, and the game already has a name for a thing that walks
 * away from you while you are trying to reach it.
 *
 * 120px is three world units, so a round is six units of walking across a
 * square twenty-seven wide. That is legible at this camera and nowhere near far
 * enough to lose somebody.
 */
export const NPC_BEAT_RADIUS_PX = 120;

/**
 * How far a conversation reaches, measured to somebody's POST.
 *
 * Two different distances, and separating them is the whole of what makes a
 * moving NPC safe to talk to:
 *
 *   * `NPC_TALK_RANGE_PX` is measured to where they are STANDING, and it is
 *     what decides whether you may start. You walk up to a person, not to a
 *     spot they are sometimes at.
 *   * `NPC_TETHER_PX` is measured to their POST, and it is what decides whether
 *     you are still talking. A post does not move, so a conversation cannot be
 *     ended by the other party taking three steps.
 *
 * The sum is not a fudge factor, it is the exact bound: if you opened the box
 * at no more than the talk range from where they were standing, and they are
 * never more than the beat radius from their post, then you are never more than
 * the two added together from that post. Anything the client lets you open, the
 * server honours for as long as you stand still.
 */
export const NPC_TETHER_PX = NPC_TALK_RANGE_PX + NPC_BEAT_RADIUS_PX;

/**
 * An amble. Deliberately well under a player's 220px/s: a townsperson who moves
 * at adventuring pace reads as somebody late for something, and the point of
 * this is that the town is at rest and inhabited rather than busy.
 */
export const NPC_WALK_PX_PER_SEC = 58;

/** Where somebody is, which way they are pointing, and whether they are walking. */
export interface NpcPose {
  x: number;
  y: number;
  facingDeg: number;
  walking: boolean;
}

/** Unrounded polar, for a path — `at` rounds, and a walk sampled off a rounded
 *  curve judders by a pixel a frame. */
function atExact(radiusPx: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: TOWN_CENTER.x + Math.cos(a) * radiusPx,
    y: TOWN_CENTER.y + Math.sin(a) * radiusPx,
  };
}

/** 0..1 from a string. The same id gives the same number on every machine,
 *  which is the only property that matters here. */
function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * WHERE SOMEBODY IS RIGHT NOW, AS A FUNCTION OF THE CLOCK.
 *
 * Nothing is sent over the wire for this and no tick advances it. The argument
 * is the one the day/night cycle already won: the hour is derived from
 * wall-clock time in `shared/` rather than broadcast, so every client sees the
 * same sky without the server saying a word. A townsperson's round is the same
 * shape of fact — it depends on nothing any player does, so making it a message
 * would be paying a per-frame bandwidth cost for a value both ends can compute.
 *
 * It also settles the thing that would otherwise be genuinely hard. The server
 * decides whether you are close enough to buy something and the client decides
 * whether to draw the shop keeper next to you, and if those two disagree the
 * failure is "the button does nothing" — the worst kind. Here they cannot
 * disagree, because they are literally the same function of the same clock.
 *
 * The phase is seeded from the id, so five people do not step off together.
 */
export function npcPoseAt(npc: TownNpc, nowMs: number = Date.now()): NpcPose {
  const beat = npc.beat;
  if (!beat || beat.length < 2) {
    return { x: npc.x, y: npc.y, facingDeg: npc.facingDeg, walking: false };
  }

  // Each leg of the round is a dwell followed by a walk to the next stop.
  const points = beat.map((s) => atExact(s.radiusPx, s.angleDeg));
  const walkMs = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    return (Math.hypot(q.x - p.x, q.y - p.y) / NPC_WALK_PX_PER_SEC) * 1000;
  });
  let cycle = 0;
  for (let i = 0; i < beat.length; i++) cycle += beat[i].dwellMs + walkMs[i];
  if (cycle <= 0) {
    return { x: npc.x, y: npc.y, facingDeg: npc.facingDeg, walking: false };
  }

  let t = (nowMs + hashUnit(npc.id) * cycle) % cycle;
  for (let i = 0; i < beat.length; i++) {
    if (t < beat[i].dwellMs) {
      const p = points[i];
      return { x: p.x, y: p.y, facingDeg: beat[i].facingDeg ?? npc.facingDeg, walking: false };
    }
    t -= beat[i].dwellMs;
    if (t < walkMs[i]) {
      const p = points[i];
      const q = points[(i + 1) % points.length];
      const k = walkMs[i] > 0 ? t / walkMs[i] : 1;
      const x = p.x + (q.x - p.x) * k;
      const y = p.y + (q.y - p.y) * k;
      // Facing follows the walk. Anything else is a moonwalk, and this rig has
      // a Walk clip that very much assumes it is going forwards.
      const facingDeg = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
      return { x, y, facingDeg, walking: true };
    }
    t -= walkMs[i];
  }
  // Only reachable on a floating-point edge at the very end of the cycle.
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, facingDeg: npc.facingDeg, walking: false };
}

/** How long one person's whole round takes. Read by the test, which has to walk
 *  every position anybody ever occupies rather than sampling and hoping. */
export function npcBeatCycleMs(npc: TownNpc): number {
  const beat = npc.beat;
  if (!beat || beat.length < 2) return 0;
  const points = beat.map((s) => atExact(s.radiusPx, s.angleDeg));
  let cycle = 0;
  for (let i = 0; i < beat.length; i++) {
    const q = points[(i + 1) % points.length];
    cycle +=
      beat[i].dwellMs +
      (Math.hypot(q.x - points[i].x, q.y - points[i].y) / NPC_WALK_PX_PER_SEC) * 1000;
  }
  return cycle;
}

/**
 * Everyone in Emberhold.
 *
 * Five, which is as many as a square this size holds without the player having
 * to pick their way between them. Each stands a little in front of the building
 * they belong to, facing the anvil.
 */
export const TOWN_NPCS: TownNpc[] = [
  {
    id: "herald",
    name: "Elsbet Vane",
    title: "Herald of Emberhold",
    role: "guide",
    body: "mage",
    icon: "class-mage",
    // OFF THE MONUMENT'S SIGHT LINE, and that is the whole reason for this
    // bearing. She stood at 272 — 0.2 units off the centre's own axis, which
    // put her directly behind the statue from the one camera angle this game
    // has. The result was a herald permanently painted across the monument in
    // silhouette blue: M49.2's through-walls outline doing exactly what it is
    // for, on the one piece of scenery in town nobody wants to see through.
    // See `STATUE_SIGHT_HALF_PX` for the rule, and `tools/test/town.mjs` for
    // the check that stops it happening again.
    ...at(255, 243),
    facingDeg: 63,
    // A herald works the square. Out toward the middle, back to her post, then
    // round to face the east gate — which is where anybody new comes in from.
    beat: [
      { radiusPx: 255, angleDeg: 243, facingDeg: 63, dwellMs: 9000 },
      // 254 rather than 262, and the eleven degrees are the sight-line rule:
      // 262 put her behind the monument again, which is the exact defect she
      // was moved off the post to fix. A round is placement with a time axis,
      // and it goes wrong in every way a position does.
      { radiusPx: 296, angleDeg: 254, facingDeg: 90, dwellMs: 6000 },
      { radiusPx: 210, angleDeg: 224, facingDeg: 30, dwellMs: 5000 },
    ],
    greeting:
      "New in Emberhold? Then let me save you a few deaths. This place has one rule, " +
      "and almost everything else follows from it.",
    topics: [
      {
        q: "What is the one rule?",
        a:
          "You are whatever you're holding. There is no class to choose — pick up a sword and " +
          "you fight as a warrior, drop it for a staff and you are a mage before the sword " +
          "hits the ground. Your skills, your reach, your mana and your body all come from " +
          "the thing in your hand. Bare-handed you are an adventurer, which is weak but is " +
          "not broken.",
      },
      {
        q: "Where is it safe?",
        a:
          "Here. Nothing spawns inside the walls. Walk out of any gate and the ground gets " +
          "worse the further you go — slimes and mushnubs within shouting distance, goblins " +
          "and blobs past that, then wolves and orcs, then trolls and demons, and at the far " +
          "edge a golem and a dragon. Distance from the anvil IS the difficulty. Nobody will " +
          "stop you walking straight to the dragon.",
      },
      {
        q: "How do I fight?",
        a:
          "You start fights; they do not start themselves. Press your weapon's own attack — " +
          "the first slot, and it is different for every weapon family — and the swings keep " +
          "coming until you walk away. The curtain on that slot is your swing timer, so a " +
          "dagger lands three blows in the time an axe lands one.",
      },
      {
        q: "What is damage made of?",
        a:
          "Six schools: physical, fire, frost, nature, arcane and lightning. Your weapon's " +
          "family sets the floor and its material overrides it, so a Frostbrand really does " +
          "deal frost. Every creature folds to something and shrugs off something else — a " +
          "troll knits itself back together unless you burn it, a golem has lightning for a " +
          "seam. Never immunity, though. A wrong build kills a golem slowly, not never.",
      },
      {
        q: "What should I do first?",
        a:
          "Take work from Cabel at the Warden's Post and from Marda at the inn — both pay in " +
          "materials, which is what the anvil eats. Gather from the bushes here in the square " +
          "and the trees outside the wall. Then stand at the anvil and forge something. " +
          "Salvaging a thing teaches you to make it, so break open anything you will not wear.",
      },
      {
        q: "Why is the town lit at night?",
        a:
          "Because the watch pays for lamp oil, and because a player who cannot see their own " +
          "feet stops playing. Step outside the wall after dark and you will notice the " +
          "difference immediately. That is deliberate too.",
      },
    ],
  },
  {
    id: "oswyn",
    name: "Oswyn Thale",
    title: "Provisioner",
    role: "vendor",
    body: "adventurer",
    icon: "dock-bag",
    ...at(415, 285),
    facingDeg: 105,
    // A shopkeeper's round is short and it is all his own doorstep: out to the
    // crates stacked by the shop front, and back to where he can see the square.
    beat: [
      { radiusPx: 415, angleDeg: 285, facingDeg: 105, dwellMs: 11000 },
      { radiusPx: 458, angleDeg: 297, facingDeg: 140, dwellMs: 6000 },
      // Also kept out of the monument's sight line. He is far enough back that
      // he is measurably NOT drawn through it — the rule is conservative on
      // purpose, because the derivation that says who clears the crown turned
      // out to be wrong and the cheap answer is to leave the wedge empty.
      { radiusPx: 378, angleDeg: 292, facingDeg: 96, dwellMs: 5000 },
    ],
    greeting:
      "Wood, ore, herb, essence — I take all four, and I part with rather less than I take. " +
      "Have a look.",
    topics: [
      {
        q: "Why don't you take coin?",
        a:
          "Coin is a promise somebody else has to keep. Ore is ore. Bring me what came out of " +
          "the ground and I will hand you something that came out of a workshop, and neither " +
          "of us has to trust a mint.",
      },
      {
        q: "Anything you won't sell?",
        a:
          "Anything past the second ring. I stock what keeps a beginner alive long enough to " +
          "learn the anvil — potions, a serviceable blade, boots that do not fall apart. If " +
          "you want a Frostbrand you will have to take one off something.",
      },
    ],
  },
  {
    id: "cabel",
    name: "Warden Cabel",
    title: "Watch Captain",
    role: "quest",
    body: "warrior",
    icon: "class-warrior",
    ...at(415, 45),
    facingDeg: 225,
    // The watch looks OUT. His far stop turns him toward the east gate, which is
    // the one the first monster camp stands nearest to — the same reason the
    // Warden's Post was put on this arc in the first place.
    beat: [
      { radiusPx: 415, angleDeg: 45, facingDeg: 225, dwellMs: 10000 },
      { radiusPx: 466, angleDeg: 36, facingDeg: 200, dwellMs: 7000 },
      { radiusPx: 452, angleDeg: 60, facingDeg: 250, dwellMs: 5000 },
    ],
    greeting:
      "You are armed and you are standing still. I can fix the second of those. The watch has " +
      "work, and the watch pays.",
    topics: [
      {
        q: "What is the watch for?",
        a:
          "Keeping the first ring thin. We do not clear it — you cannot clear it, it comes " +
          "back — we keep it from thickening until it leans on the wall. That is the whole job " +
          "and it never ends, which is why I am always hiring.",
      },
      {
        q: "What is out there worth knowing?",
        a:
          "Everything in the first ring dies to anything. Past that they start having opinions. " +
          "A blob bursts when you kill it, so do not be standing on it. A wolf is faster than " +
          "you are. And do not go looking at the golem until you have something with lightning " +
          "in it.",
      },
    ],
  },
  {
    id: "marda",
    name: "Marda Quill",
    title: "Innkeeper",
    role: "quest",
    body: "rogue",
    icon: "dock-craft",
    ...at(420, 225),
    facingDeg: 45,
    // Between her own door and the market stall, which is the errand an
    // innkeeper actually runs.
    beat: [
      { radiusPx: 420, angleDeg: 225, facingDeg: 45, dwellMs: 9000 },
      { radiusPx: 430, angleDeg: 240, facingDeg: 70, dwellMs: 6000 },
      { radiusPx: 372, angleDeg: 220, facingDeg: 25, dwellMs: 7000 },
    ],
    greeting:
      "The Bent Nail. Beds upstairs, stew if you can pay, and a list of things I need fetched " +
      "that is longer every week.",
    topics: [
      {
        q: "Why the name?",
        a:
          "The first one went in crooked and the smith who drove it said leaving it was cheaper " +
          "than an apology. It is still there, third beam from the door. People touch it on " +
          "their way out, which I have never discouraged.",
      },
      {
        q: "What does an inn need from me?",
        a:
          "Wood for the fire, herb for the pot, ore for the smith who fixes what my guests " +
          "break. None of it is heroic and all of it is short. Bring it and I will pay you in " +
          "things you can use at the anvil.",
      },
    ],
  },
  {
    id: "tobin",
    name: "Tobin Ash",
    title: "Smith's Apprentice",
    role: "flavour",
    body: "ranger",
    icon: "dock-craft",
    ...at(245, 152),
    facingDeg: 332,
    // He has the longest dwell in town and it is at the anvil, because he is the
    // only person here with a job that keeps him in one spot. The other two
    // stops are him stepping away from it, not the other way round.
    beat: [
      { radiusPx: 245, angleDeg: 152, facingDeg: 332, dwellMs: 8000 },
      { radiusPx: 322, angleDeg: 142, facingDeg: 320, dwellMs: 12000 },
      { radiusPx: 258, angleDeg: 172, facingDeg: 350, dwellMs: 5000 },
    ],
    greeting:
      "Mind the coals. Master's away and I am not allowed to sell you anything, but I am " +
      "allowed to talk.",
    topics: [
      {
        q: "What can the anvil do?",
        a:
          "Five things. Forge makes a named thing you have learned. Refine turns raw wood and " +
          "ore into ingots and wardweave, which the good recipes are priced in. Reforge walks " +
          "an item up the quality ladder. Etch cuts a rune you have drawn onto something you " +
          "are keeping. Salvage takes a thing apart — and teaches you to make it.",
      },
      {
        q: "So how do I learn a recipe?",
        a:
          "By destroying one. That is the loop and it is not a joke: find a Frostbrand, salvage " +
          "it, and now you can forge Frostbrands. Everything in the first ring you know already.",
      },
      {
        q: "Is reforging safe?",
        a:
          "It re-rolls what the dice gave you, so no. But it leaves etched runes standing, so " +
          "anything you paid a rune for survives the fire. Cut every slot and you have bought " +
          "your way out of the gamble entirely.",
      },
    ],
  },
];

export function npcById(id: string): TownNpc | null {
  return TOWN_NPCS.find((n) => n.id === id) ?? null;
}

/** True inside the walls. Used for the town's own light and for "am I safe". */
export function inTown(x: number, y: number): boolean {
  return Math.hypot(x - TOWN_CENTER.x, y - TOWN_CENTER.y) <= TOWN_RADIUS_PX;
}

// --- Where you actually arrive ----------------------------------------------

/**
 * Where a player materialises — on login, and again every time they die.
 *
 * NOT the same point as `PLAYER_SPAWN`, and the difference is the whole reason
 * this exists. `PLAYER_SPAWN` is the ORIGIN: every difficulty band, every
 * monster camp, every resource ring and the town itself are measured from it,
 * so it cannot move without moving the entire world. Arrival is a PLACE, and a
 * place can be a few strides off the origin.
 *
 * Conflating the two is what kept the middle of the square empty for two
 * milestones: anything put on the centre was something players spawned inside,
 * so the centre stayed bare and the statue that belongs there could not be
 * built. Splitting them costs one constant and gives the square its focal point
 * back.
 *
 * A hundred and fifty pixels out on bearing 60 — clear of the statue's island
 * with room to spare, on open paving, and facing back across the square so the
 * first thing a new character sees is the monument and the town behind it.
 */
export const PLAYER_ARRIVAL: { x: number; y: number } = at(150, 60);

/**
 * How wide the road's walkable corridor is, either side of the gate bearing.
 *
 * The road used to be a line through the exact centre and the test walked that
 * line. With a statue on the centre it is a corridor that passes either side of
 * the island instead, which is what a square with a monument in it has always
 * looked like. The number is the DRAWN road's half-width, so the thing the test
 * checks and the thing the player can see are one fact.
 *
 * It has to stay comfortably clear of the statue's keep-out — 66px plus a
 * body's 14 — or the corridor closes and the road really is blocked. 120 leaves
 * forty pixels of walkable track either side of the island at its tightest,
 * which is three body widths.
 */
export const ROAD_HALF_WIDTH_PX = 120;
