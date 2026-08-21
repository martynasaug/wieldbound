// The scene itself: renderer, camera rig, lighting, terrain and static decor.
// Everything that is "the place", as opposed to the things moving around in it.

import * as THREE from "three";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../../../shared/protocol-types";
import { instantiate } from "./assets";
import { createTerrainMaterial } from "./terrain";
import { buildGroundCover } from "./scatter";
import { buildForests } from "./forest";
import { windyGeometry } from "./wind";
import { seededRandom } from "../../../shared/rng";
import { DayNight } from "./daynight";
import { ROAD_HALF_WIDTH_PX, distanceToRoad } from "../../../shared/road";
import {
  BRIDGE_HALF_SPAN_PX,
  BRIDGE_RAMP_PX,
  BRIDGE_WALK_HALF_PX,
  RIVER_HALF_WIDTH_PX,
  bridgeAt,
  bridgeFrame,
  riverAt,
  riverPath,
} from "../../../shared/river";
import { FORESTS, forestStrengthAt } from "../../../shared/forests";
import {
  TOWN_BUILDINGS,
  TOWN_CENTER,
  TOWN_PAVED_RADIUS_PX,
  TOWN_RADIUS_PX,
} from "../../../shared/town";
import { LANDMARKS, landmarkPosition } from "../../../shared/landmarks";

// Server positions are in pixels from the 2D game; the simulation still runs in
// that space and every formula in shared/ is written against it. Rendering
// divides by this and re-centres on the origin, so nothing in the protocol had
// to change to move to 3D.
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

const PLAY_HALF_W = WORLD_UNITS_W / 2;
const PLAY_HALF_H = WORLD_UNITS_H / 2;

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
const RIVER_BANK_UNITS = 7.0;
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

/**
 * Raises the ground into an approach ramp at each end of the bridge.
 *
 * ONLY EVER FILLS, NEVER CUTS. An approach that dug a trench through a rise to
 * reach the deck would be worse than one that simply stops early — and on a
 * bank that already stands above the deck there is nothing to build.
 */
function rampToBridge(x: number, z: number, h: number): number {
  const f = bridgeFrame(toServerX(x), toServerY(z));
  const along = Math.abs(f.along);
  const across = Math.abs(f.across);
  if (along <= BRIDGE_HALF_SPAN_PX) return h;
  if (along > BRIDGE_HALF_SPAN_PX + BRIDGE_RAMP_PX) return h;
  if (across > RAMP_HALF_PX + RAMP_FADE_PX) return h;

  const deck = bridgeDeckHeight();
  const t = (along - BRIDGE_HALF_SPAN_PX) / BRIDGE_RAMP_PX;
  const ease = t * t * (3 - 2 * t);
  // Deck at the abutment, natural land by the far end of the ramp.
  let raised = deck + (h - deck) * ease;
  // Across the ramp it tapers back to the land, so the causeway has shoulders
  // rather than being a wall with a road on top.
  const wide = 1 - Math.min(1, Math.max(0, (across - RAMP_HALF_PX) / RAMP_FADE_PX));
  const shoulder = wide * wide * (3 - 2 * wide);
  raised = h + (raised - h) * shoulder;
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
const TERRAIN_SPAN = Math.max(WORLD_UNITS_W, WORLD_UNITS_H) + 90;
const TERRAIN_SEGMENTS = 300;
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

// How close and how far the camera may sit from the player.
//
// The default came down from 14.5: at that distance a player stands about fifty
// pixels tall, which is why the armour and weapon work of M3 was barely legible
// in play even though the models carry the detail. Close enough now to read
// gear, far enough to still see a telegraph land beside you — and the wheel
// covers the rest.
export const CAMERA_MIN_DISTANCE = 5;
/**
 * How close a wall may push the camera, past the zoom's own floor.
 *
 * Deliberately tighter than CAMERA_MIN_DISTANCE: that number is a preference —
 * how close someone likes to play — and this one is a physical constraint. In a
 * narrow gap between two buildings the choice is between a very close camera
 * and no character at all, and a very close camera is the better of the two.
 */
export const CAMERA_WALL_MIN_DISTANCE = 1.2;
export const CAMERA_MAX_DISTANCE = 22;
export const CAMERA_DEFAULT_DISTANCE = 9;

const CAMERA_STORAGE_KEY = "wieldbound.cameraDistance";

function loadCameraDistance(): number {
  try {
    const raw = Number(localStorage.getItem(CAMERA_STORAGE_KEY));
    if (Number.isFinite(raw) && raw > 0) {
      return Math.max(CAMERA_MIN_DISTANCE, Math.min(CAMERA_MAX_DISTANCE, raw));
    }
  } catch {
    // Private-browsing modes throw on storage access; the default is fine.
  }
  return CAMERA_DEFAULT_DISTANCE;
}

function saveCameraDistance(distance: number): void {
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, String(distance));
  } catch {
    // Failing to remember the zoom is not worth breaking a frame over.
  }
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** Scenery outside the play area. Held separately so it can be faded when it hides the player. */
  readonly decor = new THREE.Group();
  /** Instanced ground cover inside the play area. Never faded, never interactive. */
  readonly groundCover = new THREE.Group();
  /** The six woods. Instanced and chunked; see forest.ts. */
  readonly forests = new THREE.Group();

  private readonly sun: THREE.DirectionalLight;
  private readonly fill: THREE.HemisphereLight;
  /** The hour, and everything it changes: sun angle, colour, sky, fog, stars. */
  readonly dayNight = new DayNight();
  // The camera looks along a fixed direction and only its DISTANCE changes, so
  // zooming never alters the pitch the game is composed for — a view that
  // flattened toward top-down as it pulled back would change what a telegraph
  // circle and a body's footprint look like, and those are things the player
  // reads positionally.
  private readonly cameraDir = new THREE.Vector3(0, 9.5, 11).normalize();
  /** Eased toward targetDistance, so a wheel notch glides rather than jumps. */
  private distance = loadCameraDistance();
  private targetDistance = this.distance;
  /**
   * Solid things the camera may not sit behind. Buildings, not trees.
   *
   * The distinction matters: a wall is something you must never be able to see
   * your character through, and a treeline is something you would hate the
   * camera to lurch forward for every time you brushed a trunk. Walls are
   * handled here by moving the camera; trunks are handled in Game by fading
   * them, and each is the right answer for its own kind of obstacle.
   */
  private cameraColliders: THREE.Object3D[] = [];
  /** Where the wall is holding the camera this frame, or Infinity. */
  private blockedDistance = Infinity;
  private readonly camRay = new THREE.Raycaster();
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDir = new THREE.Vector3();
  private readonly raySide = new THREE.Vector3();
  private readonly rayUp = new THREE.Vector3(0, 1, 0);
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Filmic tone mapping is most of why this reads as lit rather than coloured.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.copy(this.cameraDir).multiplyScalar(this.distance);

    this.scene.background = new THREE.Color(0x9fb8cf);
    // Opened up, because there is now a landscape to see into. At 40–110 the
    // far ridge was fogged out before it resolved, which meant the hills only
    // existed within one screen of the player and the horizon was a flat wash —
    // the exact impression the hills were added to fix.
    this.scene.fog = new THREE.Fog(0x9fb8cf, 55, 165);

    this.fill = new THREE.HemisphereLight(0xbcd7ff, 0x4a5233, 0.8);
    this.scene.add(this.fill);
    this.scene.add(this.dayNight.stars);

    this.sun = new THREE.DirectionalLight(0xffe9c4, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 90;
    const s = 26;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.buildTerrain();

    window.addEventListener("resize", () => this.onResize());
  }

  private buildTerrain(): void {
    const span = TERRAIN_SPAN;
    // 170 segments was two units a quad on the old world and nine on this one,
    // which is coarser than the hills it now has to describe: the shortest term
    // in `terrainHeight` has a thirty-three unit wavelength and would have been
    // sampled three times across a full cycle. 300 puts it back to about a
    // metre and a half a quad — 90k vertices in one static mesh, built once,
    // never touched again, and the only thing on screen that is allowed to be
    // this dense because it is the only thing that is always on screen.
    const geo = new THREE.PlaneGeometry(span, span, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
    const pos = geo.attributes.position;
    // TWO THINGS THE SHADER CANNOT WORK OUT FOR ITSELF, baked per vertex.
    //
    // Everything the ground shader does is noise of world position, which is
    // exactly right for wear and region — they are patterns, and a pattern is
    // cheapest where it is evaluated. A forest and a river are not patterns:
    // they are a table of six discs and a two-hundred-point polyline, and
    // neither is something to re-derive per fragment. Baking them onto the mesh
    // costs two floats a vertex, is computed once, and interpolates for free.
    //
    // A metre and a half a quad is finer than either feature's edge, so nothing
    // is lost to the resolution: a wood's outline wanders over tens of metres
    // and the riverbank is six across.
    const canopy = new Float32Array(pos.count);
    const wet = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      // Authored in XY then rotated into XZ, so local y is world z.
      const x = pos.getX(i);
      const z = -pos.getY(i);
      pos.setZ(i, terrainHeight(x, z));
      canopy[i] = forestStrengthAt(toServerX(x), toServerY(z));
      const bank = riverAt(toServerX(x), toServerY(z)).distancePx / PX_PER_UNIT;
      // Shingle at the waterline, fading out across the bank. Not the channel
      // itself — the bed is under water and nobody sees it — but the strip
      // either side, which is the part that says the river has been there
      // longer than you have.
      wet[i] =
        1 -
        Math.min(1, Math.max(0, (bank - RIVER_HALF_WIDTH_PX / PX_PER_UNIT) / RIVER_BANK_UNITS));
    }
    geo.setAttribute("aCanopy", new THREE.BufferAttribute(canopy, 1));
    geo.setAttribute("aWet", new THREE.BufferAttribute(wet, 1));
    geo.computeVertexNormals();

    const ground = new THREE.Mesh(geo, createTerrainMaterial(span));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /**
   * Scatters trees and boulders outside the playable rectangle. Decor only —
   * nothing here is interactable, so it deliberately never lands inside the
   * bounds where it could be confused with a resource node.
   */
  async buildDecor(): Promise<void> {
    // All from the same kit as the ground cover. Mixing these with the older
    // tree pack put two different stylisations of "tree" in one frame, which
    // reads as a mistake even when neither is bad on its own.
    // NO COMMON TREE. The round-crowned broadleaf is the harvestable wood
    // node's silhouette now and nothing else in the world wears it — see the
    // header of shared/forests.ts. The treeline used to carry all five of them,
    // which was defensible while it stood outside the bounds and there was
    // nothing to confuse it with; it is not defensible now that there are woods
    // inside the world made of the other species, because the perimeter and the
    // forests have to be made of the same vocabulary or the boundary reads as a
    // different country.
    const treeModels = [
      "nature/Pine_1.gltf", "nature/Pine_2.gltf", "nature/Pine_3.gltf",
      "nature/Pine_4.gltf", "nature/Pine_5.gltf",
      "nature/TwistedTree_1.gltf", "nature/TwistedTree_2.gltf", "nature/TwistedTree_3.gltf",
      "nature/DeadTree_1.gltf", "nature/DeadTree_2.gltf", "nature/DeadTree_3.gltf",
      // The red-leaved bush, which is too autumnal to pass as a herb bush but
      // breaks up the treeline nicely.
      "nature/Bush_Common.gltf",
    ];
    const protos = await Promise.all(
      treeModels.map((m) => instantiate(m, 1).catch(() => null)),
    );
    const usable = protos.filter((p): p is NonNullable<typeof p> => p !== null);
    if (usable.length === 0) return;

    // The treeline moves too, and it has to — it is the horizon in every frame
    // that looks out of the map, so a swaying field of woods in front of a
    // perfectly rigid border would say plainly which of the two was cheap.
    //
    // Patched on the PROTOTYPE, once each. `Object3D.clone` shares material
    // references, so every one of the seven hundred clones taken below inherits
    // this without a second thought and without a second material.
    for (const proto of usable) {
      proto.object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const swayed = mats.map((mat) => windyGeometry(mesh.geometry, mat, 0.08, 0.55));
        mesh.material = Array.isArray(mesh.material) ? swayed : swayed[0];
      });
    }

    // Fixed seed: the treeline is identical on every reload and for every
    // player, the same reasoning as the 2D scatter it replaces.
    const rand = seededRandom(20260818);

    // Scaled to the perimeter rather than fixed: the world grew by half in each
    // direction when Emberhold was built, and 260 trees that ringed the old map
    // convincingly left visible gaps in the new one.
    const perimeter = 4 * (PLAY_HALF_W + PLAY_HALF_H);
    const treeCount = Math.round(perimeter * 1.05);
    const border = this.decor;
    for (let i = 0; i < treeCount; i++) {
      const proto = usable[Math.floor(rand() * usable.length)];
      const tree = proto.object.clone(true);

      // Ring the play area rather than filling a disc, so the far side of the
      // map is framed too instead of only the spawn.
      const edge = rand();
      let x: number;
      let z: number;
      const outset = 2 + rand() * 34;
      if (edge < 0.5) {
        x = (rand() * 2 - 1) * (PLAY_HALF_W + 34);
        z = (rand() < 0.5 ? -1 : 1) * (PLAY_HALF_H + outset);
      } else {
        x = (rand() < 0.5 ? -1 : 1) * (PLAY_HALF_W + outset);
        z = (rand() * 2 - 1) * (PLAY_HALF_H + 34);
      }

      const height = 3.6 + rand() * 5.2;
      tree.scale.setScalar(proto.scale * height);
      tree.position.set(x, terrainHeight(x, z), z);
      tree.rotation.y = rand() * Math.PI * 2;
      border.add(tree);
    }
    this.scene.add(border);

    // Ground cover fills the INSIDE, where the treeline deliberately never
    // goes. Added to its own group rather than to `decor`, because decor is
    // faded when it stands between the camera and the player and ankle-height
    // plants never can.
    const cover = await buildGroundCover(this.groundCover, {
      halfWidth: PLAY_HALF_W,
      halfHeight: PLAY_HALF_H,
      // Emberhold keeps its own ground. Wildflowers coming up through a paved
      // square read as the town having been dropped on top of the field rather
      // than built in it — and the plants stand proud of the paving, so the
      // cobbles cannot hide them.
      //
      // THE PAVING AND THE BUILDINGS, not the town. One circle over the whole
      // enclosure was the safe-looking version and it was wrong: it also swept
      // the ring of grass between the houses and the palisade, which is the one
      // part of Emberhold that is meant to read as ground rather than as floor.
      // The belt came out as flat green baize with a fence round it.
      exclude: [
        {
          x: toWorldX(TOWN_CENTER.x),
          z: toWorldZ(TOWN_CENTER.y),
          // A little past the cobbles, so nothing sprouts through the rim where
          // the paving is already fading out.
          radius: (TOWN_PAVED_RADIUS_PX / PX_PER_UNIT) * 1.06,
        },
        // One per building, sized to the corner of its footprint — a plant
        // coming up through a wall is worse than a bare patch.
        ...TOWN_BUILDINGS.map((b) => ({
          x: toWorldX(b.x),
          z: toWorldZ(b.y),
          radius: (Math.hypot(b.widthPx, b.depthPx) / 2 + 20) / PX_PER_UNIT,
        })),
      ],
      // And nothing grows in the wheel ruts. A circle cannot describe a four
      // kilometre curve, which is why the scatter takes a predicate as well as
      // a list — a hundred circles laid along the road would still leave grass
      // on every bend, and the bends are where a track most needs to read as a
      // track.
      reject: (x, z) => {
        const sx = toServerX(x);
        const sy = toServerY(z);
        if (distanceToRoad(sx, sy) < ROAD_HALF_WIDTH_PX * 0.82) return true;
        // Nor in the Coldwater, nor on its shingle. Wildflowers standing in a
        // river is the same class of mistake as wildflowers in the wheel ruts,
        // and rather more obvious.
        if (riverAt(sx, sy).distancePx < RIVER_HALF_WIDTH_PX + 40) return true;
        // THINNED UNDER A CANOPY, not removed. A wood plants its own floor —
        // ferns and broad-leaved plants, in forest.ts — and leaving the open
        // field's clover and wildflowers underneath it at full density would
        // put a meadow inside a forest. Thinned by a hash of the POSITION
        // rather than by the scatter's own generator, because this predicate is
        // called several times per placement while it retries, and a draw from
        // the sequence would make where a plant grows depend on how many times
        // the loop happened to bounce.
        const canopy = forestStrengthAt(sx, sy);
        if (canopy > 0.04) {
          const h = Math.sin(sx * 0.0173 + sy * 0.0291) * 43758.5453;
          if (h - Math.floor(h) < canopy * 0.82) return true;
        }
        return false;
      },
    });
    this.scene.add(this.groundCover);
    console.info(
      `[world] ground cover: ${cover.instances} plants, ${cover.drawCalls} instanced meshes ` +
        `across ${cover.chunks} chunks (only the chunks in view are drawn)`,
    );

    // And the woods. Into `groundCover` rather than `decor`, and the name is
    // the only thing wrong with that: `decor` is the group the camera FADES
    // when it stands between you and your character, and it fades per material
    // — which for six instanced woods sharing one bark texture would mean
    // walking behind a pine and watching every tree in the world go
    // translucent. Trees are answered by the silhouette pass instead, the same
    // way they were when they were only a perimeter.
    const woods = await buildForests(this.forests);
    this.scene.add(this.forests);
    console.info(
      `[world] forests: ${woods.trees} trees and ${woods.undergrowth} undergrowth ` +
        `across ${FORESTS.length} woods, ${woods.drawCalls} instanced meshes`,
    );
  }

  /**
   * One wheel notch in or out.
   *
   * Clamped rather than free: past the near end the camera ends up inside the
   * character, and past the far end the fog the scene is lit with starts eating
   * the world. The choice is remembered, because how close someone likes to
   * play is a preference rather than a per-session accident.
   */
  zoomBy(notches: number): void {
    // Multiplicative, so a notch feels the same size at every distance. A fixed
    // step is imperceptible when far out and violent when close in.
    const next = this.targetDistance * Math.pow(1.12, notches);
    this.targetDistance = Math.max(CAMERA_MIN_DISTANCE, Math.min(CAMERA_MAX_DISTANCE, next));
    saveCameraDistance(this.targetDistance);
  }

  /** How far the camera sits from the player right now. Read by the tests. */
  get cameraDistance(): number {
    return this.distance;
  }

  /**
   * Registers the geometry the camera must stay in front of.
   *
   * Called once, with the town. Nothing else in the world is solid enough to
   * warrant it: a boulder is knee-high, a tree is a pole, and the terrain is
   * flat inside the play area by construction.
   */
  setCameraColliders(objects: THREE.Object3D[]): void {
    this.cameraColliders = objects;
  }

  /** True while a wall is holding the camera closer than the player asked for. */
  get cameraBlocked(): boolean {
    return this.blockedDistance < Infinity;
  }

  /**
   * How far the camera may sit from the player without a wall in between.
   *
   * Five rays, cast from points spread over the CHARACTER rather than from one
   * point on it. That is the whole correction over the first version: a
   * character is about 1.7 units tall and half a unit wide, and a camera with
   * clear sight of their chest can still have a wall across their legs. That
   * is exactly what shipped first — it protected `lookTarget` alone, the look
   * point sits at chest height, and the watchpost and the chapel both still ate
   * the bottom half of the character while the ray reported clear.
   *
   * So: head, chest, knees, and a shoulder either side. Whichever sees a wall
   * first decides, because any one of them being blocked is a visible piece of
   * missing character.
   *
   * Returns Infinity when nothing is in the way, which is the common case and
   * costs five short raycasts against six merged building meshes.
   */
  private clearDistance(want: number): number {
    if (this.cameraColliders.length === 0) return Infinity;

    this.rayDir.copy(this.cameraDir);
    this.raySide.crossVectors(this.rayDir, this.rayUp).normalize();

    // Offsets from the look point, which already sits at y = 1.0 — so these run
    // from a little over head height down to the ankles.
    const samples: [number, number][] = [
      [0, 0.45],
      [0, -0.1],
      [0, -0.62],
      [0.5, -0.1],
      [-0.5, -0.1],
    ];

    let nearest = Infinity;
    for (const [lateral, lift] of samples) {
      this.rayOrigin
        .set(this.lookTarget.x, this.lookTarget.y + lift, this.lookTarget.z)
        .addScaledVector(this.raySide, lateral);
      this.camRay.set(this.rayOrigin, this.rayDir);
      this.camRay.far = want + 1.5;
      const hits = this.camRay.intersectObjects(this.cameraColliders, true);
      this.camRay.far = Infinity;
      if (hits.length > 0 && hits[0].distance < nearest) nearest = hits[0].distance;
    }
    return nearest;
  }

  /** Keeps the camera and the shadow frustum trailing the player. */
  follow(x: number, z: number, dtSeconds: number): void {
    // Chest height above the SURFACE, not above zero and not above the terrain.
    // On a rise the character would otherwise drift down the frame as they
    // climbed, which reads as the camera sagging rather than as a hill — and on
    // the bridge the look target would sit in the riverbed while the player
    // stood two units above it on the deck.
    this.desiredLook.set(x, surfaceHeight(x, z) + 1.0, z);
    const ease = Math.min(1, dtSeconds * 8);
    this.lookTarget.lerp(this.desiredLook, ease);

    // Zoom eases on the same clock as the follow, which is why it is applied
    // here rather than in the wheel handler.
    this.distance += (this.targetDistance - this.distance) * Math.min(1, dtSeconds * 9);

    // --- Keep a wall out from between the camera and the character ----------
    // The permanent answer to "I cannot see myself when I stand next to a
    // building". Fading the wall was the other candidate and it is the wrong
    // one here: the town shares one material per surface across all six
    // buildings, so fading what blocks you would fade the whole town, and a
    // player standing behind an inn would watch the chapel go translucent.
    //
    // Snapping IN and easing OUT, deliberately. A wall arriving between you and
    // the camera has to be answered on the same frame or you spend that frame
    // looking at plaster; a wall leaving can be given half a second, and eased
    // it reads as the camera drifting back rather than as a jolt.
    const clear = this.clearDistance(this.distance);
    this.blockedDistance = clear;
    if (clear < Infinity) {
      // A margin, so the camera sits in front of the surface rather than in it —
      // without this the near plane clips through and you see the inside of the
      // wall, which looks far worse than the problem being solved.
      const allowed = Math.max(CAMERA_WALL_MIN_DISTANCE, clear - 0.6);
      if (allowed < this.distance) this.distance = allowed;
    }

    this.camera.position.set(
      this.lookTarget.x + this.cameraDir.x * this.distance,
      this.lookTarget.y + this.cameraDir.y * this.distance,
      this.lookTarget.z + this.cameraDir.z * this.distance,
    );
    this.camera.lookAt(this.lookTarget);

    // A world-sized shadow map would be uselessly coarse, so the sun rides
    // along and only ever covers what is on screen.
    // The shadow map covers what the camera can see and no more. Pinned to the
    // old wide framing it spent most of its resolution on ground that was off
    // screen, which is a large part of why armour read as a soft blob up close.
    const extent = Math.max(11, Math.min(34, this.distance * 1.85));
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.camera.updateProjectionMatrix();
    // The light's DIRECTION is the hour's; only its distance is ours. It has to
    // stay far enough out that the shadow frustum's near plane clears anything
    // tall standing beside the player.
    const dir = this.dayNight.lightDirection;
    this.sun.position.set(
      this.lookTarget.x + dir.x * 42,
      dir.y * 42,
      this.lookTarget.z + dir.z * 42,
    );
    this.sun.target.position.set(this.lookTarget.x, 0, this.lookTarget.z);
    this.sun.target.updateMatrixWorld();

    // The star dome is centred on the viewer, which is what makes it read as
    // sky: a fixed dome would visibly slide as the player crossed the field.
    this.dayNight.stars.position.set(this.lookTarget.x, 0, this.lookTarget.z);
  }

  /**
   * Screen-space position of a world point, for DOM nameplates. Null when the
   * point is behind the camera or off screen.
   *
   * Vector3.project() alone is not enough: for anything behind the camera the
   * perspective divide flips the sign and the point lands back inside the
   * viewport, mirrored — which is why labels for objects behind the player were
   * appearing pinned to the screen edges. Testing in camera space first is the
   * only reliable way to reject them.
   */
  private readonly projectScratch = new THREE.Vector3();

  project(x: number, y: number, z: number, maxDistance = 70): { x: number; y: number } | null {
    const v = this.projectScratch.set(x, y, z).applyMatrix4(this.camera.matrixWorldInverse);
    if (v.z > -this.camera.near) return null; // behind the camera
    if (-v.z > maxDistance) return null; // too far to be worth a label

    v.applyMatrix4(this.camera.projectionMatrix);
    // A little slack past the edge so labels ease out rather than pop.
    if (v.x < -1.15 || v.x > 1.15 || v.y < -1.15 || v.y > 1.15) return null;

    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** Applies the hour to the scene. Called once a frame, before render. */
  updateDayNight(): { name: string; clock: number } {
    const phase = this.dayNight.update(this.scene, this.renderer, this.sun, this.fill);
    return { name: phase.name, clock: this.dayNight.clock };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
