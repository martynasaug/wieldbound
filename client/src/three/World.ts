// The scene itself: renderer, camera rig, lighting, terrain and static decor.
// Everything that is "the place", as opposed to the things moving around in it.

import * as THREE from "three";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../../../shared/protocol-types";
import { instantiate } from "./assets";

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

export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  /** Scenery outside the play area. Held separately so it can be faded when it hides the player. */
  readonly decor = new THREE.Group();

  private readonly sun: THREE.DirectionalLight;
  private readonly cameraOffset = new THREE.Vector3(0, 9.5, 11);
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
    this.camera.position.copy(this.cameraOffset);

    this.scene.background = new THREE.Color(0x9fb8cf);
    this.scene.fog = new THREE.Fog(0x9fb8cf, 40, 110);

    this.scene.add(new THREE.HemisphereLight(0xbcd7ff, 0x4a5233, 0.8));

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

    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0x6f9440, roughness: 0.97, metalness: 0 }),
    );
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
    const treeModels = ["Tree_1", "Tree_2", "Tree_3", "Pine_1", "Pine_2", "Pine_3", "Birch_1", "Birch_2", "DeadTree_1"];
    const protos = await Promise.all(
      treeModels.map((m) => instantiate(m, 1).catch(() => null)),
    );
    const usable = protos.filter((p): p is NonNullable<typeof p> => p !== null);
    if (usable.length === 0) return;

    // Fixed seed: the treeline is identical on every reload and for every
    // player, the same reasoning as the 2D scatter it replaces.
    let seed = 20260818;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    const border = this.decor;
    for (let i = 0; i < 260; i++) {
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
  }

  /** Keeps the camera and the shadow frustum trailing the player. */
  follow(x: number, z: number, dtSeconds: number): void {
    this.desiredLook.set(x, 1.0, z);
    const ease = Math.min(1, dtSeconds * 8);
    this.lookTarget.lerp(this.desiredLook, ease);

    this.camera.position.set(
      this.lookTarget.x + this.cameraOffset.x,
      this.lookTarget.y + this.cameraOffset.y,
      this.lookTarget.z + this.cameraOffset.z,
    );
    this.camera.lookAt(this.lookTarget);

    // A world-sized shadow map would be uselessly coarse, so the sun rides
    // along and only ever covers what is on screen.
    this.sun.position.set(this.lookTarget.x + 14, 24, this.lookTarget.z + 10);
    this.sun.target.position.set(this.lookTarget.x, 0, this.lookTarget.z);
    this.sun.target.updateMatrixWorld();
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
