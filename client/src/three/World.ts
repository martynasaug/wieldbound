// The scene itself: renderer, camera rig, lighting, terrain and static decor.
// Everything that is "the place", as opposed to the things moving around in it.

import * as THREE from "three";
import { instantiate } from "./assets";
import { createTerrainMaterial } from "./terrain";
import { buildGroundCover } from "./scatter";
import { buildForests } from "./forest";
import { windyGeometry } from "./wind";
import { seededRandom } from "../../../shared/rng";
import { DayNight } from "./daynight";
import { ROAD_HALF_WIDTH_PX, distanceToRoad } from "../../../shared/road";
import { RIVER_HALF_WIDTH_PX, riverAt } from "../../../shared/river";
import { FORESTS, forestStrengthAt } from "../../../shared/forests";
import { TOWN_BUILDINGS, TOWN_CENTER, TOWN_PAVED_RADIUS_PX } from "../../../shared/town";
// The height field moved to `heightfield.ts` so that a Node test could walk it —
// see the note at the top of that file. Re-exported here rather than repointed
// at every call site, because "where is the ground" is asked from a dozen
// modules and every one of them was right to ask this one.
export {
  FOG_NEAR,
  FOG_FAR,
  PX_PER_UNIT,
  WORLD_UNITS_W,
  WORLD_UNITS_H,
  BRIDGE_CLEARANCE_UNITS,
  TERRAIN_SPAN,
  TERRAIN_SEGMENTS,
  toWorldX,
  toWorldZ,
  toServerX,
  toServerY,
  riverSurfaceHeight,
  bridgeDeckHeight,
  terrainHeight,
  drawnHeight,
  surfaceHeight,
} from "./heightfield.ts";
import {
  PX_PER_UNIT,
  WORLD_UNITS_W,
  WORLD_UNITS_H,
  TERRAIN_SPAN,
  TERRAIN_SEGMENTS,
  PLAY_HALF_W,
  PLAY_HALF_H,
  RIVER_BANK_UNITS,
  FOG_NEAR,
  FOG_FAR,
  toWorldX,
  toWorldZ,
  toServerX,
  toServerY,
  riverSurfaceHeight,
  bridgeDeckHeight,
  terrainHeight,
  drawnHeight,
  surfaceHeight,
} from "./heightfield.ts";

/**
 * How steep a quad laid on the ground may get. About 56 degrees.
 *
 * Only a riverbank reaches it, and there the honest answer — a near-vertical
 * sheet — is worse than a slightly wrong one, because the quads that use this
 * are soft round marks and a vertical soft round mark is a floating disc.
 */
const MAX_GROUND_SLOPE = 1.5;

/**
 * Seats a flat unit quad on the ground AS DRAWN, tilted to the local slope.
 *
 * THIS IS M55.3's LESSON A THIRD TIME, and it is worth stating in those terms:
 * a flat thing laid on ground that is not flat is a CHORD, and a chord and the
 * curve it spans do not agree. There the mistake was the terrain mesh riding
 * above the smooth field it was sampled from, and the cost was a foot in the
 * floor. Here it is a horizontal decal riding through ground that rises
 * underneath it, and the cost is a mark that is mostly not drawn.
 *
 * Measured over nine hundred positions, for a quad 1.32 units across:
 *
 *     the ground rises above a FLAT quad seated at its centre   median 0.086
 *     the ground rises above a quad TILTED to the local slope    median 0.003
 *
 * The slope is where essentially all of it lives, and a slope costs four
 * samples and no shader. What is left after the tilt is curvature, and a lift
 * of a few centimetres covers the ninety-fifth percentile of that.
 *
 * The two tangents are taken UNNORMALISED on purpose, so the quad stretches
 * along a slope exactly as a shape projected onto that slope would.
 */
export function layOnGround(
  out: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  width: number,
): void {
  const half = width * 0.5;
  const gx = Math.max(
    -MAX_GROUND_SLOPE,
    Math.min(MAX_GROUND_SLOPE, (surfaceHeight(x + half, z) - surfaceHeight(x - half, z)) / width),
  );
  const gz = Math.max(
    -MAX_GROUND_SLOPE,
    Math.min(MAX_GROUND_SLOPE, (surfaceHeight(x, z + half) - surfaceHeight(x, z - half)) / width),
  );
  // Row-major, so the columns are (width, width*gx, 0), (0, 1, 0) and
  // (0, width*gz, width): local (u, 0, v) lands on the plane through (x, y, z)
  // with that gradient.
  out.set(
    width, 0, 0, x,
    width * gx, 1, width * gz, y,
    0, 0, width, z,
    0, 0, 0, 1,
  );
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
    this.scene.fog = new THREE.Fog(0x9fb8cf, FOG_NEAR, FOG_FAR);

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
