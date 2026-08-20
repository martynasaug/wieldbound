/**
 * The world, running behind the login card.
 *
 * The title screen was a card on a brown gradient — which is a menu, not a
 * front door. This is the actual game rendering behind it: the same terrain
 * shader, the same ground cover, the same trees and the same forge that sits at
 * the centre of the map, held at dusk and turning slowly.
 *
 * WHY THE REAL SCENE AND NOT A PICTURE. There is no artist on this project and
 * never has been; every surface in the game is procedural or CC0, and a painted
 * splash would be the one asset nothing else could produce or keep current. The
 * renderer already knows how to draw this place, so the honest title screen is
 * the place itself — and it can never go stale, because retuning the terrain or
 * swapping the tree kit changes the front door in the same commit.
 *
 * THREE RULES IT HAS TO OBEY, and they are what most of the code below is:
 *
 *   IT MUST NOT DELAY THE LOGIN. The card is interactive from the first frame.
 *   The scene builds in layers — ground and sky immediately, then cover, trees
 *   and the smithy as they arrive — and each fades in on its own. Nothing here
 *   is awaited before the player can type.
 *
 *   IT MUST NOT COMPETE WITH THE CARD. Dusk, a heavy vignette and a darkening
 *   scrim, because a title screen that is hard to read is a worse title screen
 *   than a brown gradient.
 *
 *   IT MUST GIVE ITS MEMORY BACK. The game builds its own `World` with its own
 *   WebGL context, so leaving this one alive would mean two renderers, two
 *   copies of the terrain and two shadow maps for as long as the session lasts.
 */
import * as THREE from "three";
import { findClip, instantiate } from "./assets";
import { buildGroundCover } from "./scatter";
import { createTerrainMaterial } from "./terrain";
import { DayNight } from "./daynight";
import { terrainHeight } from "./World";

/**
 * The hour the shot is held at.
 *
 * Dusk, and not the live clock. The game's day is twenty-four real minutes, so
 * a title screen following it would be pitch dark for a third of all visits —
 * and the one thing a front door cannot be is a coin flip.
 *
 * 0.81 lands exactly on the `dusk` keyframe: a violet sky, stars at seven
 * tenths, and a low cold fill. That is chosen for CONTRAST rather than for
 * prettiness — it makes the forge the only warm light in the frame, which is
 * the whole subject of the shot, and it puts a blue field behind a gold card.
 * Halfway to sunset (0.78) was the first attempt and the interpolation runs
 * through a dusty rose that washes the entire scene pink.
 */
const DUSK = 0.81;

/**
 * How the camera moves, and it SWAYS rather than orbits.
 *
 * A full turn was the first version and it is the wrong shape for a title
 * screen. The composition is hand-made — the card on the left third, the forge
 * on the right, the smith lit from the front — and all three of those are true
 * of exactly one arc. Turning all the way round means five sixths of every
 * visit is a framing nobody chose: the forge behind the card, the smith a black
 * silhouette, the treeline gapping open behind the text.
 *
 * So it drifts twenty degrees either side of the angle the shot is built for,
 * over about a minute and a half. Enough to be alive, never enough to leave.
 */
const CAMERA_RADIUS = 8.6;
const CAMERA_BASE_ANGLE = 0.62;
const CAMERA_SWAY = 0.35;
const SWAY_SECONDS = 95;

export class LoginBackdrop {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly fill: THREE.HemisphereLight;
  private readonly dayNight = new DayNight();
  /** The forge itself, as light. The CSS glow the card used to sit on is a real
   *  fire now, and it is what makes the smithy the brightest thing in frame. */
  private readonly forge: THREE.PointLight;
  private readonly clock = new THREE.Clock();
  private readonly lookAt = new THREE.Vector3(0, 1.0, 0);
  private readonly onResize = () => this.resize();
  /** Drives the smith's idle. Null until the rig arrives, and only ever one. */
  private mixer: THREE.AnimationMixer | null = null;
  private raf = 0;
  private disposed = false;
  /** Phase of the sway, not a heading. See CAMERA_BASE_ANGLE. */
  private angle = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Capped harder than the game's renderer. This runs while somebody is
    // reading two lines of text, so a retina display should not be asked for
    // four times the pixels to draw a backdrop.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.id = "login-canvas";
    // Lifted once here rather than every frame: `DayNight.update` sets the
    // exposure from the hour, so this is the one place a title-screen stop can
    // survive the next line that runs.
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 300);

    this.scene.background = new THREE.Color(0x1a1410);
    // Tighter than the game's fog: the point here is depth in a single still
    // frame rather than seeing a monster coming.
    this.scene.fog = new THREE.Fog(0x1a1410, 18, 78);

    this.fill = new THREE.HemisphereLight(0xbcd7ff, 0x4a5233, 0.8);
    this.scene.add(this.fill);
    this.scene.add(this.dayNight.stars);

    this.sun = new THREE.DirectionalLight(0xffe9c4, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    for (const [k, v] of [["left", -18], ["right", 18], ["top", 18], ["bottom", -18]] as const) {
      (this.sun.shadow.camera as unknown as Record<string, number>)[k] = v;
    }
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Bright, close and steeply falling off. It is not lighting the scene — the
    // sky does that — it is making one corner of it hot, which is what a forge
    // at dusk looks like and what puts a rim on anyone standing at it.
    this.forge = new THREE.PointLight(0xff8a2c, 0, 13, 1.7);
    this.forge.position.set(0.75, 1.05, -0.55);
    this.scene.add(this.forge);

    this.dayNight.freeze(DUSK);
    this.buildGround();

    window.addEventListener("resize", this.onResize);
    this.loop();
    // Everything below arrives when it arrives. None of it is awaited, and a
    // failure in any one leaves a thinner scene rather than no scene: a login
    // screen that cannot render is a login screen nobody can get past.
    void this.buildCover();
    void this.buildTreeline();
    void this.buildForge();
    void this.buildSmith();
  }

  /** Ground first, because it is the only piece that is synchronous — the mesh
   *  exists on frame one and the PBR maps drop in behind it. */
  private buildGround(): void {
    const span = 200;
    const geo = new THREE.PlaneGeometry(span, span, 120, 120);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // The same heightfield the game uses, so the hills on the title screen
      // are the hills you walk toward. Offset far from the play area, where the
      // field is flat, would have given a dead-level horizon.
      pos.setZ(i, terrainHeight(pos.getX(i) + 400, -pos.getY(i) + 260) * 0.55);
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, createTerrainMaterial(span));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private async buildCover(): Promise<void> {
    const group = new THREE.Group();
    // A quarter of the game's area. Everything past the fog is invisible, so
    // scattering the whole map would be several thousand plants nobody sees.
    await buildGroundCover(group, { halfWidth: 26, halfHeight: 26 }, 4242);
    if (this.disposed) return;
    this.scene.add(group);
    this.fadeIn(group);
  }

  /**
   * A ring of trees at middle distance.
   *
   * A ring rather than a scatter, and it is a composition decision: the camera
   * orbits, so anything that leaves a gap will eventually put the horizon
   * behind the card. A closed treeline means every angle of the turn has
   * something in the background.
   */
  private async buildTreeline(): Promise<void> {
    const models = [
      "nature/CommonTree_1.gltf", "nature/CommonTree_3.gltf", "nature/CommonTree_5.gltf",
      "nature/Pine_1.gltf", "nature/Pine_3.gltf", "nature/Pine_5.gltf",
      "nature/TwistedTree_2.gltf", "nature/DeadTree_1.gltf",
    ];
    const protos = await Promise.all(models.map((m) => instantiate(m, 1).catch(() => null)));
    const usable = protos.filter((p): p is NonNullable<typeof p> => p !== null);
    if (this.disposed || usable.length === 0) return;

    // Fixed seed, so the treeline is the same on every visit. A title screen
    // that rearranges itself between reloads reads as noise.
    let seed = 20260821;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

    const group = new THREE.Group();
    for (let i = 0; i < 150; i++) {
      const proto = usable[Math.floor(rand() * usable.length)];
      const tree = proto.object.clone(true);
      const a = rand() * Math.PI * 2;
      const r = 19 + rand() * 30;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const height = 4.5 + rand() * 5.5;
      tree.scale.setScalar(proto.scale * height);
      tree.position.set(x, terrainHeight(x + 400, z + 260) * 0.55, z);
      tree.rotation.y = rand() * Math.PI * 2;
      tree.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      group.add(tree);
    }
    this.scene.add(group);
    this.fadeIn(group);
  }

  /**
   * The smithy, which is the one fixed landmark in the world and therefore the
   * only thing this screen could sensibly be looking at.
   */
  private async buildForge(): Promise<void> {
    const pieces: [string, number, [number, number, number], number][] = [
      ["props/Anvil_Log.gltf", 0.85, [0.75, 0, -0.55], 0.5],
      ["props/Workbench.gltf", 0.72, [-1.25, 0, -0.35], 1.15],
      ["props/WeaponStand.gltf", 1.0, [0.35, 0, -1.75], -0.35],
      ["props/Barrel.gltf", 0.8, [1.5, 0, 0.85], 0.3],
      ["props/Crate_Wooden.gltf", 0.5, [-1.15, 0, 1.15], -0.7],
      ["props/Whetstone.gltf", 0.3, [0.15, 0, 1.15], 1.9],
    ];
    const loaded = await Promise.all(
      pieces.map(([m, h]) => instantiate(m, h).catch(() => null)),
    );
    if (this.disposed) return;

    const group = new THREE.Group();
    for (let i = 0; i < pieces.length; i++) {
      const inst = loaded[i];
      if (!inst) continue;
      const [, , [x, y, z], rotY] = pieces[i];
      inst.object.position.set(x, y, z);
      inst.object.rotation.y = rotY;
      inst.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      group.add(inst.object);
    }
    this.scene.add(group);
    this.fadeIn(group);
    // The fire comes up with the smithy rather than before it, or there is a
    // glowing patch of empty grass for however long the props take.
    this.forge.intensity = 0;
  }


  /**
   * Somebody standing at the anvil.
   *
   * The one thing that turns a lit field into a place where something happens,
   * and it is the game's premise made literal: the Warrior rig carries its own
   * sword, so the figure on the title screen IS a warrior only because of what
   * is in its hand. The four tiles on the card say that in words; this says it
   * without any.
   *
   * Its built-in weapon is deliberately LEFT ON, which is the opposite of what
   * `gear.ts` does in play — there the mesh has to go, or a ranger who picks up
   * a sword carries both. Here there is nothing to equip and nothing to
   * contradict, so the rig is exactly right as it ships.
   */
  private async buildSmith(): Promise<void> {
    const smith = await instantiate("Warrior", 1.7).catch(() => null);
    if (this.disposed || !smith) return;

    // At the anvil and facing it, rather than at the origin. The origin is
    // where a player spawns and is kept clear on purpose — a figure standing
    // there would be standing inside the spot the camera orbits.
    // BEYOND the anvil from the camera, which is the whole trick: with the fire
    // between the two, the side of the figure facing the player is the side the
    // fire is on. Standing it on the near side put a black cut-out in the middle
    // of the frame — correctly lit, and lit entirely on the face nobody sees.
    smith.object.position.set(-0.9, 0, -1.25);
    smith.object.rotation.y = Math.atan2(0.75 - -0.9, -0.55 - -1.25);
    smith.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.scene.add(smith.object);
    this.fadeIn(smith.object);

    // Idle, and only idle. Anything with travel in it would walk the figure out
    // of frame, since nothing here is driving a position.
    const clip = findClip(smith.animations, "idle", "breathing", "stand");
    if (!clip) return;
    this.mixer = new THREE.AnimationMixer(smith.object);
    this.mixer.clipAction(clip).play();
  }

  /**
   * Brings a group in over half a second.
   *
   * Without this each layer POPS into a scene the player is already looking at
   * — the trees in particular, which arrive as a wall. Materials are cloned
   * first because they are shared between instances by the loader, and fading
   * the original would fade the same tree everywhere it appears.
   */
  private fadeIn(group: THREE.Object3D): void {
    const mats: THREE.Material[] = [];
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = Array.isArray(mesh.material)
        ? list.map((m) => m.clone())
        : list[0].clone();
      const cloned = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of cloned) {
        m.transparent = true;
        m.opacity = 0;
        mats.push(m);
      }
    });
    const started = performance.now();
    const step = () => {
      if (this.disposed) return;
      const t = Math.min(1, (performance.now() - started) / 500);
      for (const m of mats) m.opacity = t;
      if (t < 1) requestAnimationFrame(step);
      else for (const m of mats) m.transparent = false;
    };
    requestAnimationFrame(step);
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.clock.getDelta();

    this.angle += (dt / SWAY_SECONDS) * Math.PI * 2;
    const swing = CAMERA_BASE_ANGLE + Math.sin(this.angle) * CAMERA_SWAY;
    this.camera.position.set(
      Math.cos(swing) * CAMERA_RADIUS,
      // A gentle rise and fall over the turn, so the shot is never quite the
      // same twice and never leaves the ground. Low, because a forge is a thing
      // you stand at rather than look down on.
      2.7 + Math.sin(this.angle * 0.5) * 0.35,
      Math.sin(swing) * CAMERA_RADIUS,
    );
    this.camera.lookAt(this.lookAt);

    this.mixer?.update(dt);

    const phase = this.dayNight.update(this.scene, this.renderer, this.sun, this.fill);
    // The light rig follows the frozen hour exactly as it does in play, so the
    // shadows on the title screen are the shadows of that time of day.
    this.sun.position.copy(this.dayNight.lightDirection).multiplyScalar(40);
    this.sun.target.position.set(0, 0, 0);
    // A little brighter than the hour strictly calls for, because at the
    // table's own exposure the foreground grass goes to near-black. Modest on
    // purpose: the first attempt lifted the ambient half again and washed the
    // FIRE out with it — the forge stopped being the brightest thing in frame,
    // which is the only reason the shot is composed around it. Raising the
    // floor costs contrast, and contrast is the picture.

    // The forge breathes. Two sines of different periods, so it flickers like
    // a fire rather than pulsing like a status light.
    const t = performance.now() / 1000;
    const flicker = 0.82 + Math.sin(t * 2.7) * 0.12 + Math.sin(t * 7.3) * 0.08;
    this.forge.intensity = THREE.MathUtils.lerp(this.forge.intensity, 26 * flicker, 0.05);

    this.renderer.render(this.scene, this.camera);
  };

  private resize(): void {
    if (this.disposed) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Gives everything back.
   *
   * The game constructs its own `World` with its own WebGL context, so a
   * backdrop left running would mean two renderers, two terrains and two shadow
   * maps for the rest of the session — on a machine that has just been asked to
   * load every model in the game.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.mixer?.stopAllAction();
    this.mixer = null;
    window.removeEventListener("resize", this.onResize);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.container.classList.remove("has-backdrop");
  }

  /** Signals that the first real frame is up, so the page can fade the canvas
   *  in rather than snapping from flat colour to a lit field. */
  markReady(): void {
    this.container.classList.add("has-backdrop");
  }
}
