// The height field: where the ground is, everywhere, as a pure function.
//
// SPLIT OUT OF `World.ts` BECAUSE IT WAS UNTESTABLE THERE, and it had by then
// produced three defects reported from play — a bridge you walked through
// (M54.1a), feet inside the floor (M55.3), and a trench at each abutment
// (M57.3). Every one of them is a disagreement between two answers to "where is
// the ground", every one was found by a person walking into it, and not one
// could have been caught by anything in `tools/test/`, because the functions
// lived in a module that pulls in a renderer.
//
// Nothing in here touches three.js, the DOM or a texture. It is arithmetic over
// the tables in `shared/` — the river's course, the road's, the town's, the
// waystones' — so it can be imported and walked by a plain Node script, which
// is what `tools/test/crossing.mjs` does.
//
// The shared imports carry explicit `.ts` extensions, unlike the rest of the
// client. Vite does not care either way; Node does, and being loadable by Node
// without a resolver hook is the entire point of this file existing.
//
// It stays in `client/` rather than moving to `shared/`, because the decision
// that height is free — "every distance in this game is XZ and no formula
// anywhere reads a Y" — is what keeps it out of the simulation. Making it
// testable must not make it authoritative.

import { WORLD_WIDTH, WORLD_HEIGHT } from "../../../shared/protocol-types.ts";
import { seededRandom } from "../../../shared/rng.ts";
import { ROAD_HALF_WIDTH_PX, distanceToRoad } from "../../../shared/road.ts";
import {
  BRIDGE_HALF_SPAN_PX,
  BRIDGE_RAMP_PX,
  BRIDGE_WALK_HALF_PX,
  RIVER_HALF_WIDTH_PX,
  bridgeAt,
  bridgeFrame,
  riverAt,
  riverPath,
} from "../../../shared/river.ts";
import { FORESTS, forestStrengthAt } from "../../../shared/forests.ts";
import {
  TOWN_BUILDINGS,
  TOWN_CENTER,
  TOWN_PAVED_RADIUS_PX,
  TOWN_RADIUS_PX,
} from "../../../shared/town.ts";
import { LANDMARKS, landmarkPosition } from "../../../shared/landmarks.ts";

// Server positions are in pixels from the 2D game; the simulation still runs in
// that space and every formula in shared/ is written against it. Rendering
// divides by this and re-centres on the origin, so nothing in the protocol had
// to change to move to 3D.
/**
 * Where the distance fog starts and where it is total.
 *
 * Exported because two other things have to agree with it. Anything drawn with
 * a ShaderMaterial gets three's fog DEFINE and not its uniforms, so it applies
 * the falloff by hand — and a hand-applied falloff reading its own copy of
 * these numbers is a fog line in a different place from the fog.
 */
export const FOG_NEAR = 55;
export const FOG_FAR = 165;

export const PX_PER_UNIT = 40;

export const WORLD_UNITS_W = WORLD_WIDTH / PX_PER_UNIT;
export const WORLD_UNITS_H = WORLD_HEIGHT / PX_PER_UNIT;

export function toWorldX(serverX: number): number {
  return (serverX - WORLD_WIDTH / 2) / PX_PER_UNIT;
}
export function toWorldZ(serverY: number): number {
  return (serverY - WORLD_HEIGHT / 2) / PX_PER_UNIT;
}
export function toServerX(worldX: number): number {
  return worldX * PX_PER_UNIT + WORLD_WIDTH / 2;
}
export function toServerY(worldZ: number): number {
  return worldZ * PX_PER_UNIT + WORLD_HEIGHT / 2;
}

export const PLAY_HALF_W = WORLD_UNITS_W / 2;
export const PLAY_HALF_H = WORLD_UNITS_H / 2;

/**
 * A place the ground is levelled, in world units.
 *
 * `radius` is flat, and it eases back to the natural land over `blend`. This is
 * the mechanism that lets there be hills at all: everything in this game that
 * was BUILT — a paved square, a monument's plinth, a cairn — is a flat disc of
 * geometry, and a flat disc on a slope is a disc with one edge in the air.
 * Levelling the ground under it is what a builder would have done anyway.
 */
interface FlatSpot {
  x: number;
  z: number;
  radius: number;
  blend: number;
}

/**
 * Where the ground is levelled. Emberhold, and each waystone.
 *
 * The town's number is not its wall radius but a little past it: the belt of
 * grass, the back lane and the palisade itself all sit inside 20 units, and a
 * palisade running up a hill would need every post cut to a different length.
 */
// DERIVED AND STATIC, not registered at build time — and that is a correction
// rather than a preference. The first version had an `addFlatSpot` the
// waystones called as they were created, which is a footgun with a very quiet
// failure: the terrain MESH is generated in this class's constructor, and the
// waystones are built several awaits later in `Game.start`. Every flat spot
// registered afterwards would have levelled the height function and not the
// ground, so the monuments would have sat in perfectly flat dishes cut out of a
// hillside that was still drawn as a hillside.
//
// Reading the landmark table directly removes the ordering entirely: there is
// no moment at which `terrainHeight` gives a different answer.
const FLAT_SPOTS: FlatSpot[] = [
  {
    x: toWorldX(TOWN_CENTER.x),
    z: toWorldZ(TOWN_CENTER.y),
    radius: (TOWN_RADIUS_PX / PX_PER_UNIT) * 1.2,
    // A long shoulder, not a cliff. The land can be eleven units below the
    // town's level now, and easing that out over twenty-two units would put
    // Emberhold on a mesa; over forty it reads as a town built on the flattest
    // rise in the district, which is where a town would be.
    blend: 40,
  },
  // A levelled apron under each waystone. Somebody who raised a five-metre
  // monolith levelled the ground for it, and the alternative is a three-metre
  // disc of trodden earth with one edge in the air.
  ...LANDMARKS.map((l) => {
    const at = landmarkPosition(l);
    return { x: toWorldX(at.x), z: toWorldZ(at.y), radius: 4.2, blend: 7 };
  }),
];

/**
 * THE GROUND HAS RELIEF NOW, AND THE SIMULATION STILL DOES NOT KNOW.
 *
 * That sentence used to be the argument for keeping the play area dead flat:
 * the server's range checks, monster chase and body separation all run in 2D,
 * so elevation inside the bounds would be "a lie the simulation does not know
 * about". It turns out the lie is free, and worth stating exactly why —
 *
 * every distance in this game is measured in the XZ plane and nothing anywhere
 * reads a Y. Two things a metre apart horizontally are a metre apart whether
 * one of them is standing on a rise or not. So height is PURELY a rendering
 * property: it changes where a body is drawn and nothing else, which means it
 * cannot desync, cannot be exploited, and does not have to be shared. The only
 * thing it would break is a game where you could shoot over a hill, and nothing
 * here has ever had line of sight.
 *
 * What that buys is the difference between a field and a landscape. A perfectly
 * flat plane to the horizon is the single thing no amount of surface texture
 * can fix, because the light never changes across it — a slope catching the sun
 * on one side and falling into shade on the other is most of what makes ground
 * read as ground.
 *
 * Four octaves, chosen for SLOPE rather than for height. The tallest term has
 * the longest wavelength, so the biggest features are also the gentlest, and
 * the shortest is a metre of roughness that only breaks the silhouette.
 *
 * THE FIRST SET OF NUMBERS WAS FAR TOO TIMID, and the measurement is why:
 * ±3 units over a seventy-five unit wavelength is a four per cent grade, and
 * at a forty-degree camera a four per cent grade is invisible. Not subtle —
 * invisible. Nothing tilts far enough to catch the light differently, which is
 * the ONLY channel through which relief reads on ground this far away. The
 * amplitudes are roughly tripled and the wavelengths stretched with them, which
 * puts typical grades near one in six and the worst case (all four terms
 * aligned, which is rare) near one in two.
 *
 * That upper bound is the real constraint, and it is about animation rather
 * than about hills: a body slides along XZ at a constant speed and takes its
 * height from here, so on a steep enough face it climbs faster than its legs
 * are moving and reads as skating.
 */
function baseHeight(x: number, z: number): number {
  // The land itself.
  let h =
    Math.sin(x * 0.030 - 2.1) * Math.cos(z * 0.027 + 0.4) * 7.0 +
    Math.sin(x * 0.062 + 0.7) * Math.cos(z * 0.057 - 1.2) * 3.2 +
    Math.sin(x * 0.13 - 0.9) * Math.cos(z * 0.121 + 2.4) * 1.05 +
    Math.sin((x + z * 0.6) * 0.31) * 0.3;

  // Beyond the play area it swells into real hills, which is the horizon this
  // world is framed by. Same field, more of it — so the ridge outside the
  // boundary is the continuation of the rise inside it rather than a separate
  // range that starts at a rectangle.
  const outX = Math.max(0, Math.abs(x) - PLAY_HALF_W);
  const outZ = Math.max(0, Math.abs(z) - PLAY_HALF_H);
  const out = Math.hypot(outX, outZ);
  if (out > 0) {
    const t = Math.min(1, out / 30);
    const ease = t * t * (3 - 2 * t);
    h +=
      ease *
      (Math.sin(x * 0.026 + 1.7) * Math.cos(z * 0.031 - 0.6) * 7.0 +
        Math.sin(x * 0.011 - 0.3) * Math.cos(z * 0.013 + 2.2) * 9.0);
  }

  return h;
}

// --- The valley the Coldwater runs in ---------------------------------------
//
// A river drawn ON a height field is a blue ribbon lying across a hillside, and
// it reads as exactly that from the first frame: water is the one surface
// everybody in the world has an intuition about, and the intuition says it
// finds the bottom. So the land has to be cut for it, and cutting it turns out
// to be the whole of what makes the river convincing — the water plane is a
// translucent quad and does almost none of the work.
//
// TWO PROPERTIES THE CUT MUST HAVE, and they are the reason this is thirty
// lines rather than a subtraction:
//
//   * The surface must not run uphill. The natural field wanders ±10 units, so
//     a river at a constant height would be a canal on stilts at one end and
//     underground at the other, and a river that simply followed the land would
//     flow both ways at once. The answer is to read the land ALONG the course,
//     low-pass it hard, and then force it monotone from the source down — which
//     is what a river does to a landscape given ten thousand years.
//   * The banks must contain it. Levelling to a target height is not enough:
//     where the land sits below the water the ground has to be RAISED to a
//     crest, or the river floods sideways into the field and the water plane
//     ends halfway up a hill with grass showing through it.
//
// So the profile is absolute near the water — bed, then bank, then crest — and
// only blends back to the natural field well outside it.

/** Half the water's width, in world units. */
const RIVER_CHANNEL_UNITS = RIVER_HALF_WIDTH_PX / PX_PER_UNIT;
/** How far below the surface the middle of the bed sits. */
const RIVER_DEPTH_UNITS = 2.4;
/** How far out from the waterline the bank climbs to its crest. */
export const RIVER_BANK_UNITS = 7.0;
/**
 * And how high that crest stands above the water.
 *
 * MEASURED UP FROM 1.15, and the measurement is the point. A cross-section of
 * the finished ground read -5.3 in the middle of the bed and -1.9 on the bank —
 * a channel three and a half units deep, of which two and a half were under
 * water. What showed was a one-unit lip, and at a forty-degree camera a
 * one-unit lip over seven units of bank is a four-degree slope: the same
 * invisible grade the first pass at the hills was rejected for. The water read
 * as a stripe painted on a flat field, which is exactly what the carve exists
 * to prevent.
 */
const RIVER_CREST_UNITS = 2.4;
/** How far past the crest the valley eases back into whatever the land does. */
const RIVER_BLEND_UNITS = 26;

/** Past this in server pixels the river cannot affect the height at all. */
const RIVER_REACH_PX =
  (RIVER_CHANNEL_UNITS + RIVER_BANK_UNITS + RIVER_BLEND_UNITS) * PX_PER_UNIT;

let surfaceProfile: Float64Array | null = null;
let riverBoundsZ: { min: number; max: number } | null = null;

function buildSurfaceProfile(): Float64Array {
  const path = riverPath();
  const n = path.length;
  const raw = new Float64Array(n);
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const wx = toWorldX(path[i].x);
    const wz = toWorldZ(path[i].y);
    raw[i] = baseHeight(wx, wz);
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }
  riverBoundsZ = { min: minZ, max: maxZ };

  // A wide box filter — wide enough that a single ridge the course happens to
  // cross does not become a step in the water.
  const smooth = new Float64Array(n);
  const R = 16;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -R; k <= R; k++) {
      const j = Math.max(0, Math.min(n - 1, i + k));
      sum += raw[j];
      count++;
    }
    smooth[i] = sum / count;
  }

  // Downhill, west. Index 0 is the west end, so walking back from the east
  // source and taking a running minimum is what makes every step a descent.
  for (let i = n - 2; i >= 0; i--) {
    if (smooth[i] > smooth[i + 1]) smooth[i] = smooth[i + 1];
  }
  // And the water sits a little below the land it was averaged from, so the
  // banks have somewhere to be.
  for (let i = 0; i < n; i++) smooth[i] -= 1.0;
  return smooth;
}

/**
 * How high the water is, as a fraction along the course from the west end.
 *
 * Exported because three separate things have to agree about it: the ground is
 * cut to it, the water plane is drawn at it, and the bridge deck is measured
 * from it. Two of the three getting it from a different place is how a bridge
 * ends up with its feet in the air.
 */
export function riverSurfaceHeight(along: number): number {
  if (!surfaceProfile) surfaceProfile = buildSurfaceProfile();
  const p = surfaceProfile;
  const t = Math.max(0, Math.min(1, along)) * (p.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = p[i];
  const b = p[Math.min(p.length - 1, i + 1)];
  return a + (b - a) * f;
}

function carveRiver(x: number, z: number, h: number): number {
  if (!surfaceProfile) surfaceProfile = buildSurfaceProfile();
  const bounds = riverBoundsZ!;
  // Cheap reject on z alone. The course is within a few units of one latitude
  // for its whole length, so this rejects most of the map before the polyline
  // query — which matters at ninety thousand terrain vertices.
  const reachZ = RIVER_REACH_PX / PX_PER_UNIT;
  if (z < bounds.min - reachZ || z > bounds.max + reachZ) return h;

  const q = riverAt(toServerX(x), toServerY(z));
  if (q.distancePx > RIVER_REACH_PX) return h;

  const d = q.distancePx / PX_PER_UNIT;
  const surface = riverSurfaceHeight(q.along);
  const bed = surface - RIVER_DEPTH_UNITS;
  const crest = surface + RIVER_CREST_UNITS;

  let shaped: number;
  if (d <= RIVER_CHANNEL_UNITS) {
    // A dished bed rather than a flat trough, so the water is deepest in the
    // middle and the shallows read as shallows.
    const t = d / RIVER_CHANNEL_UNITS;
    shaped = bed + (surface - 0.15 - bed) * t * t;
  } else if (d <= RIVER_CHANNEL_UNITS + RIVER_BANK_UNITS) {
    const t = (d - RIVER_CHANNEL_UNITS) / RIVER_BANK_UNITS;
    shaped = surface - 0.15 + (crest - (surface - 0.15)) * (t * t * (3 - 2 * t));
  } else {
    shaped = crest;
  }

  const outer = RIVER_CHANNEL_UNITS + RIVER_BANK_UNITS;
  if (d <= outer) return shaped;
  const t = Math.min(1, (d - outer) / RIVER_BLEND_UNITS);
  const ease = t * t * (3 - 2 * t);
  return shaped + (h - shaped) * ease;
}

// --- The crossing ------------------------------------------------------------
//
// THE DECK IS PART OF THE GROUND, and that is the correction. It used to be
// three separate opinions about the same place: the terrain said riverbed, the
// road ribbon said deck, and the player's feet said terrain — so you crossed
// the Coldwater by walking through the bridge, under the planks, in the
// channel. The approaches were boxes of earth laid on top, which left a seam
// wherever the box and the land disagreed.
//
// One function now. The height field ramps up to meet the deck at each
// abutment, `surfaceHeight` returns the deck over the span, and the ground, the
// ribbon, the torch posts and the player's feet all read one of the two.

/** How high the deck sits above the water it crosses. */
export const BRIDGE_CLEARANCE_UNITS = 2.9;

/** How wide the earth causeway is, half-width in server pixels, before it fades. */
const RAMP_HALF_PX = BRIDGE_WALK_HALF_PX + 55;
const RAMP_FADE_PX = 55;

/**
 * How far out from the waterline the abutment reaches full deck height.
 *
 * The bridge is 640px long and the water is 300px wide, so the deck overhangs
 * the bank by about 170px at each end. THAT is the landing, and it has to be
 * solid ground at deck height — see `rampToBridge` for what happened when it
 * was not.
 *
 * 130 leaves the earth reaching the deck about fifty pixels before the
 * abutment, which is what makes the ramp's own easing start from a value it
 * already has rather than from a step.
 */
const BRIDGE_LANDING_PX = 130;

let cachedDeck: number | null = null;

/**
 * The height of the bridge deck, in world units.
 *
 * Measured from the WATER, not from the ground plus a constant: a deck at
 * ground level plus a constant puts one end of a bridge in the river on any
 * bank that is not level with the other, which is every bank.
 */
export function bridgeDeckHeight(): number {
  if (cachedDeck === null) {
    const at = bridgeAt();
    cachedDeck = riverSurfaceHeight(riverAt(at.x, at.y).along) + BRIDGE_CLEARANCE_UNITS;
  }
  return cachedDeck;
}

/** Smoothstep, clamped. */
function ease01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Raises the ground into an approach ramp and a landing at each end of the
 * bridge.
 *
 * ONLY EVER FILLS, NEVER CUTS. An approach that dug a trench through a rise to
 * reach the deck would be worse than one that simply stops early — and on a
 * bank that already stands above the deck there is nothing to build.
 *
 * THE LANDING IS THE PART THIS ORIGINALLY GOT WRONG, and it produced a defect
 * reported from play twice. The first version raised the ground only OUTSIDE
 * the deck — `if (along <= BRIDGE_HALF_SPAN_PX) return h` — and left everything
 * under the deck as whatever `carveRiver` had cut, which is riverbed. So the
 * height field STEPPED at the abutment, from the bottom of the channel to the
 * top of the ramp, in one pixel.
 *
 * A height field may not step, because the thing you see is a MESH sampled off
 * it on a 1.63-unit grid, and a mesh cannot draw a step: it draws a wedge
 * across whichever quad the step falls in. Measured along the road, with the
 * deck at 0.426:
 *
 *     along  -325     0.050    <- a 0.38 notch at the south abutment
 *     along  -300..300 0.426   <- the deck
 *     along  +325    -0.849    <- a 1.27 TRENCH at the north abutment
 *     along  +400     0.366
 *
 * Seventy per cent of a character's height, immediately off the end of the
 * planks, and asymmetric only because of where the grid vertices happen to fall
 * on each side. The road ribbon samples the same heights per vertex, so the
 * dirt dived into the trench with you — which is what read as the track
 * stopping short of the bridge and picking up again further on.
 *
 * The bridge is 640px long and the water is 300px wide. The deck overhangs the
 * bank by about 170px at each end, and that overhang is an ABUTMENT: solid
 * ground at deck height, which is what a bridge lands on. The deck only ever
 * had to span the channel — this file already said so — and now the ground says
 * it too. There is no branch at the abutment any more and therefore nothing to
 * be discontinuous: one expression covers the channel, the landing, the ramp
 * and the open field.
 *
 * Same shape as M55.3 and M56.1: the thing you stand on and the thing you see
 * have to be one answer, and a mesh will not draw anything the field does not
 * make continuous.
 */
function rampToBridge(x: number, z: number, h: number): number {
  const sx = toServerX(x);
  const sy = toServerY(z);
  const f = bridgeFrame(sx, sy);
  const along = Math.abs(f.along);
  const across = Math.abs(f.across);
  if (along > BRIDGE_HALF_SPAN_PX + BRIDGE_RAMP_PX) return h;
  if (across > RAMP_HALF_PX + RAMP_FADE_PX) return h;

  // Nothing over the water, everything once clear of the bank. This is what
  // keeps the channel open under the deck without a branch that could step.
  const landing = ease01(
    (riverAt(sx, sy).distancePx - RIVER_HALF_WIDTH_PX) / BRIDGE_LANDING_PX,
  );
  // Full at the abutment and gone by the foot of the ramp.
  const climb = 1 - ease01((along - BRIDGE_HALF_SPAN_PX) / BRIDGE_RAMP_PX);
  // Across the ramp it tapers back to the land, so the causeway has shoulders
  // rather than being a wall with a road on top.
  const shoulder = 1 - ease01((across - RAMP_HALF_PX) / RAMP_FADE_PX);

  const deck = bridgeDeckHeight();
  const raised = h + (deck - h) * Math.min(landing, climb) * shoulder;
  return Math.max(h, raised);
}

/**
 * The size of the ground mesh, and the one place those two numbers live.
 *
 * `buildTerrain` reads them and so does `drawnHeight`, which has to reproduce
 * that mesh's triangulation exactly. Two copies of a grid resolution is a bug
 * with a delay on it: the day somebody changes the segment count, the feet stop
 * agreeing with the floor and nothing says why.
 */
export const TERRAIN_SPAN = Math.max(WORLD_UNITS_W, WORLD_UNITS_H) + 90;
export const TERRAIN_SEGMENTS = 300;
const TERRAIN_STEP = TERRAIN_SPAN / TERRAIN_SEGMENTS;
const TERRAIN_HALF = TERRAIN_SPAN / 2;

/**
 * The height of the ground THAT IS DRAWN, as opposed to the field it was
 * sampled from.
 *
 * `terrainHeight` is a smooth analytic function. The mesh is that function
 * sampled on a 1.63-unit grid and joined up with flat triangles, and a chord is
 * not the curve it spans: across a hollow the triangle rides ABOVE the true
 * height. Stand a character at the true height there and its feet are inside
 * the ground you can see.
 *
 * Measured over forty thousand points: the drawn ground is above the field
 * across 24% of the world, by up to 0.14 units — eight per cent of a
 * character's height. The median is zero, which is why it reads as "sometimes
 * the feet are slightly sunk" rather than as a constant offset, and why it
 * survived being looked at.
 *
 * This is the same lesson as M54.1a's `surfaceHeight`, one level down. That
 * fixed three opinions about where the ROAD is; this is two opinions about
 * where the GROUND is, and the fix is the same shape — the thing you stand on
 * and the thing you see have to be one answer.
 *
 * The triangulation is `PlaneGeometry`'s own: each quad is split (a,b,d)(b,c,d),
 * so the diagonal runs from the near-far corner to the far-near one. Getting
 * that backwards is invisible on a flat quad and wrong by the full sagitta on a
 * steep one.
 */
export function drawnHeight(x: number, z: number): number {
  const gx = (x + TERRAIN_HALF) / TERRAIN_STEP;
  const gz = (z + TERRAIN_HALF) / TERRAIN_STEP;
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const at = (cx: number, cz: number) =>
    terrainHeight(-TERRAIN_HALF + cx * TERRAIN_STEP, -TERRAIN_HALF + cz * TERRAIN_STEP);
  const h00 = at(ix, iz);
  const h10 = at(ix + 1, iz);
  const h01 = at(ix, iz + 1);
  if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  const h11 = at(ix + 1, iz + 1);
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

/**
 * What you actually stand on: the ground, except over the water.
 *
 * The one height the player's feet, the camera's look target and the road's
 * ribbon all take. Over the span it is the deck; everywhere else — including
 * both approaches, which the height field has already ramped — it is the
 * ground AS DRAWN. See `drawnHeight`.
 */
export function surfaceHeight(x: number, z: number): number {
  const f = bridgeFrame(toServerX(x), toServerY(z));
  if (
    Math.abs(f.along) <= BRIDGE_HALF_SPAN_PX &&
    Math.abs(f.across) <= BRIDGE_WALK_HALF_PX + 30
  ) {
    return bridgeDeckHeight();
  }
  return drawnHeight(x, z);
}

export function terrainHeight(x: number, z: number): number {
  let h = rampToBridge(x, z, carveRiver(x, z, baseHeight(x, z)));

  // And then it is levelled wherever something was built.
  let level = 1;
  for (const s of FLAT_SPOTS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d >= s.radius + s.blend) continue;
    if (d <= s.radius) return 0;
    const t = (d - s.radius) / s.blend;
    level = Math.min(level, t * t * (3 - 2 * t));
  }
  return h * level;
}
