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
export const TOWN_GATE_ANGLES = [0, 180] as const;

/** Half-width of a gateway, in degrees of arc. */
export const TOWN_GATE_HALF_DEG = 12;

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
}

/** Where the smithy stands. The server seeds the station from this too. */
export const SMITHY_RADIUS_PX = 330;
export const SMITHY_ANGLE_DEG = 140;

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
  { id: "cart", radiusPx: 690, angleDeg: 240, blockRadiusPx: 52 },
  { id: "noticeboard", radiusPx: 470, angleDeg: 168, blockRadiusPx: 38 },
  { id: "brazier-a", radiusPx: 430, angleDeg: 312, blockRadiusPx: 26 },
  { id: "brazier-b", radiusPx: 430, angleDeg: 88, blockRadiusPx: 26 },
  // --- The back lane -------------------------------------------------------
  // The belt of grass between the houses and the palisade. A village's back
  // land is the most WORKED ground it has — firewood, laundry, hens, hay — and
  // this was mown lawn with a fence round it for two milestones. Each of these
  // sits behind the building it belongs to: the pell and the spears behind the
  // watch, hay and hens behind a cottage, hives beside the herb garden.
  { id: "trainingpost", radiusPx: 690, angleDeg: 36, blockRadiusPx: 34 },
  { id: "spearrack", radiusPx: 686, angleDeg: 54, blockRadiusPx: 32 },
  { id: "hayrick", radiusPx: 700, angleDeg: 133, blockRadiusPx: 48 },
  { id: "beehive-a", radiusPx: 672, angleDeg: 74, blockRadiusPx: 20 },
  { id: "beehive-b", radiusPx: 672, angleDeg: 79, blockRadiusPx: 20 },
  { id: "beehive-c", radiusPx: 690, angleDeg: 258, blockRadiusPx: 20 },
  { id: "rainbarrel-a", radiusPx: 662, angleDeg: 98, blockRadiusPx: 18 },
  { id: "rainbarrel-b", radiusPx: 664, angleDeg: 232, blockRadiusPx: 18 },
  { id: "rainbarrel-c", radiusPx: 660, angleDeg: 300, blockRadiusPx: 18 },
  { id: "rainbarrel-d", radiusPx: 664, angleDeg: 324, blockRadiusPx: 18 },
  // Washing lines, as a post at each end. The inn has beds upstairs, so the inn
  // has sheets; the second is the two cottages' between them. Bearings picked
  // out of the clear runs behind those buildings rather than guessed — see the
  // note on `clearRingAngles` for what guessing cost last time.
  { id: "laundry-a1", radiusPx: 700, angleDeg: 212, blockRadiusPx: 14 },
  { id: "laundry-a2", radiusPx: 700, angleDeg: 226, blockRadiusPx: 14 },
  { id: "laundry-b1", radiusPx: 700, angleDeg: 84, blockRadiusPx: 14 },
  { id: "laundry-b2", radiusPx: 700, angleDeg: 96, blockRadiusPx: 14 },

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

/** True when a bearing falls inside one of the gateways. */
export function inGateway(angleDeg: number): boolean {
  return TOWN_GATE_ANGLES.some((gate) => {
    const delta = Math.abs(((angleDeg - gate + 540) % 360) - 180);
    return 180 - delta < TOWN_GATE_HALF_DEG;
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
  /** The first thing they say, before any topic is picked. */
  greeting: string;
  topics: NpcTopic[];
}

/** How close you have to stand before someone will talk to you. */
export const NPC_TALK_RANGE_PX = 150;

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
    ...at(215, 272),
    facingDeg: 92,
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
