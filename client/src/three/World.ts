// The scene itself: renderer, camera rig, lighting, terrain and static decor.
// Everything that is "the place", as opposed to the things moving around in it.

import * as THREE from "three";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../../../shared/protocol-types";
import { instantiate } from "./assets";
import { createTerrainMaterial } from "./terrain";
import { buildGroundCover } from "./scatter";
import { DayNight } from "./daynight";
import { TOWN_CENTER, TOWN_RADIUS_PX } from "../../../shared/town";

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

// The playable area is dead flat: the server's range checks, monster chase and
// separation all run in 2D, so any elevation inside the bounds would be a lie
// the simulation does not know about. Hills live strictly outside, where they
// are scenery.
const PLAY_HALF_W = WORLD_UNITS_W / 2;
const PLAY_HALF_H = WORLD_UNITS_H / 2;

export function terrainHeight(x: number, z: number): number {
  const outX = Math.max(0, Math.abs(x) - PLAY_HALF_W);
  const outZ = Math.max(0, Math.abs(z) - PLAY_HALF_H);
  const out = Math.hypot(outX, outZ);
  if (out <= 0) return 0;
  const t = Math.min(1, out / 22);
  const ease = t * t * (3 - 2 * t);
  const h =
    Math.sin(x * 0.09) * Math.cos(z * 0.075) * 3.0 +
    Math.sin(x * 0.026 + 1.7) * Math.cos(z * 0.031 - 0.6) * 5.0;
  return h * ease;
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
    this.scene.fog = new THREE.Fog(0x9fb8cf, 40, 110);

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
    const span = Math.max(WORLD_UNITS_W, WORLD_UNITS_H) + 90;
    const geo = new THREE.PlaneGeometry(span, span, 170, 170);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Authored in XY then rotated into XZ, so local y is world z.
      pos.setZ(i, terrainHeight(pos.getX(i), -pos.getY(i)));
    }
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
    const treeModels = [
      "nature/CommonTree_1.gltf", "nature/CommonTree_2.gltf", "nature/CommonTree_3.gltf",
      "nature/CommonTree_4.gltf", "nature/CommonTree_5.gltf",
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

    // Fixed seed: the treeline is identical on every reload and for every
    // player, the same reasoning as the 2D scatter it replaces.
    let seed = 20260818;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

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
      exclude: {
        x: toWorldX(TOWN_CENTER.x),
        z: toWorldZ(TOWN_CENTER.y),
        radius: (TOWN_RADIUS_PX / PX_PER_UNIT) * 0.92,
      },
    });
    this.scene.add(this.groundCover);
    console.info(
      `[world] ground cover: ${cover.instances} plants, ${cover.drawCalls} instanced meshes ` +
        `across ${cover.chunks} chunks (only the chunks in view are drawn)`,
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
    this.desiredLook.set(x, 1.0, z);
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
