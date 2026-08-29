// How each weapon family delivers an ordinary attack.
//
// Every weapon used to present identically: the same whoosh, the same fixed
// 170ms beat, and the damage number simply appearing on the target. That is
// tolerable for a sword and incoherent for everything else — a ranger at 300px
// was hitting things five metres away with an invisible melee swing, and a mage
// was doing the same with a stick.
//
// The rule here is that the *delivery* is what differs, and that one table
// drives both what you see and when the blow lands. Flight time is derived from
// the projectile's speed and the actual gap, so an arrow's impact is not a
// constant that happens to look right at one range — it lands when the arrow
// arrives, at every range. Melee keeps a fixed beat because a swing's timing is
// a property of the swing, not of the distance.
//
// Class is worn, so this is keyed by weapon rather than by class: a ranger's
// bow and dagger are as different from each other as either is from a sword,
// which is the whole reason weapon families exist.

import * as THREE from "three";
import type { WeaponType } from "../../../shared/protocol-types";
import { loadModel } from "./assets";
import type { EffectName } from "./effects";
import type { LightPool } from "./lightPool";
import type { SfxName } from "./sfx";

// --- Particle textures -------------------------------------------------------
// The bolt, the arrow's trail and the beam were pure procedural geometry with
// a flat additive fill — a sphere, a cone, a cylinder. That solved a real
// problem (see the note below on size) but traded it for a different one: a
// lit sphere is a faceted ball of colour, not a glow, and nothing about a flat
// cylinder says "magic" rather than "polygon." These textures are billboarded
// or mapped ONTO that same geometry rather than replacing it — the motion, the
// light and the positioning system stay exactly as they were.
//
// Downscaled from Kenney's CC0 "Particle Pack" (see ASSET_CREDITS.txt); four
// frames out of eighty, at a fraction of their native resolution.
const PARTICLE_TEX_LOADER = new THREE.TextureLoader();
const particleTextures = new Map<string, THREE.Texture>();
// Exported so `skillfx.ts` can share this cache rather than opening its own
// second `TextureLoader` for the one frame (`ring`) it actually uses.
export function particleTexture(name: "glow" | "spark" | "trail" | "ring"): THREE.Texture {
  let tex = particleTextures.get(name);
  if (!tex) {
    tex = PARTICLE_TEX_LOADER.load(`/assets/particles/${name}.png`);
    tex.colorSpace = THREE.SRGBColorSpace;
    particleTextures.set(name, tex);
  }
  return tex;
}

export type Delivery = "melee" | "arrow" | "bolt" | "beam";

export interface AttackStyle {
  delivery: Delivery;
  /** Played the instant the attack starts, not when it lands. */
  releaseSfx: SfxName;
  /** Which fx school paints the target on impact. */
  impact: EffectName;
  tint: number;
  /** Melee only: the beat between the swing starting and the blow landing. */
  swingMs: number;
  /** Projectiles only: flight speed, which also decides when the hit lands. */
  speedPxPerSec: number;
  /** Weight of the impact burst — an axe should land heavier than a dagger. */
  impactScale: number;
}

// SLOWED ACROSS THE BOARD, on request — reported as "all attacks in general"
// reading too fast to land as weighty. Every number below is VISUAL PACING
// ONLY: `swingMs`/`speedPxPerSec` decide when the impact FX and damage number
// appear relative to the swing or shot starting, never how often a swing can
// actually happen — that cadence is `swingIntervalFor` in the shared combat
// formulas, tuned against the Phase 68 balance sweep, and untouched here. A
// fast weapon can still be interrupted into its next swing by a new one
// before this beat finishes; it just reads with more follow-through when it
// is not.
export const ATTACK_STYLES: Record<WeaponType, AttackStyle> = {
  // Bare hands: quick, small, and unmistakably not a weapon.
  fist: { delivery: "melee", releaseSfx: "swing", impact: "impact", tint: 0xffe6cc, swingMs: 165, speedPxPerSec: 0, impactScale: 0.75 },
  sword: { delivery: "melee", releaseSfx: "swing", impact: "slash", tint: 0xffffff, swingMs: 215, speedPxPerSec: 0, impactScale: 1.0 },
  // Slow and heavy — the beat is longer because the swing is.
  axe: { delivery: "melee", releaseSfx: "swing", impact: "slash", tint: 0xffd2a6, swingMs: 295, speedPxPerSec: 0, impactScale: 1.4 },
  mace: { delivery: "melee", releaseSfx: "swing", impact: "quake", tint: 0xffdfa0, swingMs: 270, speedPxPerSec: 0, impactScale: 1.25 },
  // Fast and light, and the shortest reach in the ranger's kit.
  dagger: { delivery: "melee", releaseSfx: "swing", impact: "slash", tint: 0xd8f0ff, swingMs: 135, speedPxPerSec: 0, impactScale: 0.7 },
  // A real arrow, drawn from the pack's own model and flown to the target.
  bow: { delivery: "arrow", releaseSfx: "bow", impact: "arrow", tint: 0xfff0d0, swingMs: 0, speedPxPerSec: 1150, impactScale: 0.95 },
  // A travelling bolt of force: the mage's main-hand missile.
  staff: { delivery: "bolt", releaseSfx: "cast", impact: "arcane", tint: 0x9ad4ff, swingMs: 0, speedPxPerSec: 800, impactScale: 1.0 },
  // A beam rather than a missile — instant, thin and bright, the way a wand
  // reads in every game that has one. It is what makes the wand feel like a
  // sidearm next to the staff instead of a shorter copy of it.
  wand: { delivery: "beam", releaseSfx: "beam", impact: "arcane", tint: 0xc9a4ff, swingMs: 120, speedPxPerSec: 0, impactScale: 0.7 },
};

export function attackStyle(weapon: WeaponType | undefined): AttackStyle {
  return ATTACK_STYLES[weapon ?? "fist"] ?? ATTACK_STYLES.fist;
}

/**
 * How long after the attack begins the blow lands, in ms.
 *
 * For anything that flies this is the actual flight time, so the number on the
 * monster appears exactly when the projectile reaches it. Clamped at both ends:
 * a point-blank shot still needs a readable beat, and a very long one must not
 * leave the player waiting on their own damage.
 */
export function impactDelayMs(style: AttackStyle, gapPx: number): number {
  if (style.delivery === "melee" || style.delivery === "beam") return style.swingMs;
  const flight = (gapPx / style.speedPxPerSec) * 1000;
  // Ceiling raised alongside the slower base speeds, so a long shot still
  // reads as travelling further than a short one instead of both landing on
  // the same clamped cap.
  return Math.round(Math.max(90, Math.min(760, flight)));
}

// --- Projectiles ----------------------------------------------------------

interface LiveProjectile {
  object: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  startedAt: number;
  durationMs: number;
  /** Beams and wisps hold still and fade; arrows and bolts travel. */
  kind: "arrow" | "beam" | "bolt" | "wisp";
  materials: THREE.Material[];
  /** Bolts and arrows carry their own light, which has to be taken away too.
   *  `null` when the pool was exhausted and this one drew no light at all. */
  light?: THREE.PointLight | null;
  /** The bolt's spark and glow sprites, spun in-plane each frame so the core
   *  is not a static ball even though a sprite always faces the camera. */
  spinMats?: THREE.SpriteMaterial[];
}

// --- How big a projectile has to be to be seen -------------------------------
//
// Reported from play: *"you can barely see them"*. Measured rather than argued:
// the camera sits back far enough that a 1.8-unit character is about
// twenty-eight pixels tall, so one world unit is roughly fifteen pixels. At
// that scale the projectiles were:
//
//     an arrow      1.0 units long, 0.07 thick   ~15px long and ONE pixel wide
//     a bolt        a 1.5-unit atlas quad        a soft smudge, moving fast
//     a beam        0.16 units across            ~2px
//
// A one-pixel streak crossing three hundred pixels in a fifth of a second is
// not a thing anybody sees; it is a suggestion. These are the same trade the
// arrow's own comment already made and did not make far enough — readability
// beats proportion at this camera, and every game with this camera makes it.
//
// The other half is LIGHT. Low-poly geometry at this distance catches almost
// nothing, so a bolt that is only a mesh reads as a coloured pebble. Each one
// carries a real point light travelling with it, which is what makes it look
// like it is glowing rather than painted — and at night it lights the ground it
// passes over, which is most of what sells it.

/** Shared, because a handful of these are in the air at once and the trail's
 *  shape never changes — only the core and glow did, and both are billboarded
 *  sprites now rather than geometry, so there is nothing to share for them. */
const BOLT_TRAIL_GEO = new THREE.ConeGeometry(0.3, 2.2, 10, 1, true);
/** Unit-length beam parts, scaled per cast — see `beamMesh`. One geometry
 *  each for the whole game rather than two per beam fired. */
const BEAM_CORE_GEO = new THREE.CylinderGeometry(0.075, 0.075, 1, 6);
const BEAM_GLOW_GEO = new THREE.CylinderGeometry(0.26, 0.26, 1, 8);

/**
 * A travelling bolt: a hot core, a glow around it, a tapered trail behind, and
 * a light that goes with the whole thing.
 *
 * The core and glow are SPRITES now, not spheres. A radial-gradient texture
 * wrapped onto a sphere's UVs tiles around it rather than reading as a single
 * glow — a flat gradient only ever looks like a glow on something flat facing
 * the viewer, which is exactly what a sprite is. The trail stays a real mesh:
 * a CONE opening backwards rather than a box, because a box is a stick and
 * what a fast thing leaves behind is wider where it has been. Built pointing
 * down -Z so the group can simply `lookAt` its destination, which is the same
 * convention the beam uses.
 */
/**
 * Builds the disposable wrapper (group, sprites, mesh) around three ALREADY
 * POOLED materials — see `Projectiles`'s pools for why the materials
 * themselves are never created here and never disposed by the caller.
 * Retinting/resetting is the caller's job at acquire time, not this
 * function's, since a pooled material carries whatever state its last use
 * left it in.
 */
function boltMesh(
  pool: LightPool,
  tint: number,
  sparkMat: THREE.SpriteMaterial,
  glowMat: THREE.SpriteMaterial,
  trailMat: THREE.MeshBasicMaterial,
): {
  object: THREE.Object3D;
  materials: THREE.Material[];
  light: THREE.PointLight | null;
  spinMats: THREE.SpriteMaterial[];
} {
  // A sprite always faces the camera by construction, which is what makes it
  // read as a glow rather than a decal at any viewing angle — but it also
  // means the old trick of spinning the geometry to vary the silhouette does
  // nothing to it. `SpriteMaterial.rotation` is the equivalent for a sprite:
  // an in-plane spin that keeps it facing the camera while still visibly
  // turning as it flies.
  const spark = new THREE.Sprite(sparkMat);
  spark.scale.setScalar(0.5);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(1.25);

  // The cone's point is +Y by default; tip it to lie along the path with the
  // wide end trailing.
  const trail = new THREE.Mesh(BOLT_TRAIL_GEO, trailMat);
  trail.rotation.x = Math.PI / 2;
  trail.position.z = -1.1;

  // Pulled from a fixed pool rather than `new THREE.PointLight()` — see
  // lightPool.ts for why creating one per bolt caused stutters.
  const light = pool.acquire(tint, 7, 10, 2);

  const group = new THREE.Group();
  group.add(glow, spark, trail);
  // THE LIGHT STAYS ON THE SCENE ROOT, and this is where the first shot of a
  // session used to freeze for two seconds.
  //
  // three.js counts the lights it finds while walking the scene, and that
  // COUNT is part of every program's cache key - a scene with 45 point lights
  // and the same scene with 44 need two different builds of every material
  // that draws. `projectObject` skips anything not in the graph, so moving a
  // pooled light into a per-bolt group takes it out of the count for as long
  // as the group is unparented, and adding the group puts the count back up.
  // Every visible material is then rebuilt, inline, on the next draw.
  // Measured: one press of the attack key created THREE new programs on a
  // 1,999ms frame, and their cache keys differed from the warmed ones in
  // exactly one field - the light count, "44" against "45".
  // `lightPool` was built precisely to hold that count still ("added to the
  // scene ONCE ... 'off' is intensity 0 rather than removed") and this one
  // call site quietly defeated it. The light is moved in world space by the
  // update loop instead, alongside the bolt's own position.
  group.renderOrder = 10;
  return {
    object: group,
    materials: [sparkMat, glowMat, trailMat],
    light,
    spinMats: [sparkMat, glowMat],
  };
}

const ARROW_MODEL = "Ranger_Arrow";
// Deliberately larger than a real arrow would be relative to the character.
// The camera sits far enough back that a player is about fifty pixels tall, and
// a correctly-scaled arrow is a two-pixel splinter nobody can see — which
// defeats the point of firing one. Readability wins over proportion here, the
// same trade every game with this camera makes.
const ARROW_LENGTH_UNITS = 1.0;
/** The arrow trail, built once rather than per arrow fired — see `beamMesh`
 *  for the measurement that found this class of leak. */
const ARROW_TRAIL_GEO = new THREE.ConeGeometry(0.17, ARROW_LENGTH_UNITS * 2.2, 8, 1, true);

let arrowProto: Promise<THREE.Object3D> | null = null;

/**
 * The pack's arrow, wrapped so it points down +Z at a known length.
 *
 * The source model's long axis is not declared anywhere, and the weapon FBXs in
 * this pack disagree about it — the bow lies along Z while the built-in staff
 * runs along Y. Rather than hard-code an assumption that a re-export could
 * silently break, the longest side of the bounding box is measured and rotated
 * into place. Orientation then cannot be wrong, only the model can.
 */
function arrowPrototype(): Promise<THREE.Object3D> {
  if (!arrowProto) {
    arrowProto = loadModel(ARROW_MODEL).then((model) => {
      const source = model.clone(true);
      source.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(source);
      const size = new THREE.Vector3();
      box.getSize(size);
      const centre = new THREE.Vector3();
      box.getCenter(centre);

      const longest = Math.max(size.x, size.y, size.z) || 1;
      source.position.sub(centre);

      const aligned = new THREE.Group();
      aligned.add(source);
      if (size.x >= size.y && size.x >= size.z) aligned.rotation.y = Math.PI / 2;
      else if (size.y >= size.z) aligned.rotation.x = -Math.PI / 2;

      const scaled = new THREE.Group();
      scaled.add(aligned);
      scaled.scale.setScalar(ARROW_LENGTH_UNITS / longest);

      // A warm streak trailing the shaft. Low-poly geometry catches almost no
      // light at this distance, so without it the arrow reads as a dark fleck
      // against grass rather than as something moving fast.
      // WIDENED, because 0.07 units is one pixel at this camera and a
      // one-pixel streak crossing the screen in a fifth of a second is not
      // something anybody sees. A cone rather than a box, for the same reason
      // the bolt's is: what a fast thing leaves behind is wider where it has
      // been.
      const trail = new THREE.Mesh(
        ARROW_TRAIL_GEO,
        new THREE.MeshBasicMaterial({
          map: particleTexture("trail"),
          color: 0xffe6a8,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: false,
        }),
      );
      trail.rotation.x = Math.PI / 2;
      trail.position.z = -ARROW_LENGTH_UNITS * 1.0;

      const wrapper = new THREE.Group();
      wrapper.add(scaled, trail);
      return wrapper;
    });
  }
  return arrowProto;
}

/** Same split as `boltMesh`: the two materials are pooled and passed in,
 *  never created or disposed here. Only the geometry is still built fresh
 *  per beam — it is sized to the beam's own length, cheap to upload (a
 *  handful of cylinder verts), and not what this pool exists to fix. */
function beamMesh(
  length: number,
  coreMat: THREE.MeshBasicMaterial,
  glowMat: THREE.MeshBasicMaterial,
): { object: THREE.Object3D; materials: THREE.Material[] } {
  // Two nested boxes: a hot white core inside a wider tinted glow. One box on
  // its own reads as a coloured stick rather than as light.
  // Both widened by about three times: at 0.05 and 0.16 units these were a
  // one-pixel core inside a two-pixel glow, which is a hairline rather than a
  // zap. Cylinders rather than boxes so the glow has no flat sides to catch
  // the light wrong as the camera turns with the beam.
  // UNIT-LENGTH GEOMETRY, SCALED — not a fresh cylinder per beam.
  //
  // These were built at the beam's actual length, which meant a new
  // `BufferGeometry` for every single cast. M70.62 pooled the MATERIALS here
  // and left the geometry alone, and nothing disposes it, so each beam leaked
  // two geometries for the life of the session. Measured over a driven run:
  // `renderer.info.memory.geometries` climbed from 332 to 811 in four and a
  // half minutes and kept going, in a straight line, while the actor count sat
  // flat — the sort of slope that costs nothing for ten minutes and then
  // starts to matter. A unit cylinder scaled on Z is the same picture with one
  // geometry for the whole game.
  const core = new THREE.Mesh(BEAM_CORE_GEO, coreMat);
  core.rotation.x = Math.PI / 2;
  core.scale.set(1, length, 1);
  const glow = new THREE.Mesh(BEAM_GLOW_GEO, glowMat);
  glow.rotation.x = Math.PI / 2;
  glow.scale.set(1, length, 1);
  const group = new THREE.Group();
  group.add(glow, core);
  group.renderOrder = 10;
  return { object: group, materials: [coreMat, glowMat] };
}

/**
 * Arrows in flight and beams mid-flash. Kept apart from `Effects` because those
 * are camera-facing quads from an atlas, and neither of these is: an arrow is a
 * real mesh that has to point where it is going, and a beam is a shape defined
 * by two endpoints rather than by a position.
 */
export class Projectiles {
  private readonly live: LiveProjectile[] = [];

  /**
   * Fixed pools, never disposed — same fix `effects.ts`'s `Effects` was
   * given, for the same confirmed reason: a warm-up material kept alive
   * ALONGSIDE the real, per-cast disposable ones did not stop three.js
   * from deleting the compiled program the moment the last REAL one was
   * disposed (confirmed live, via `[dispose-trace]` stack traces landing
   * here — `attacks.ts:543` — after that approach had already been tried).
   * The only fix that cannot fail this way is to never create or destroy
   * the material at all. Sized to `POOL_SIZE` concurrent casts of each
   * shape; `bolt`/`beam`/`wisp` drop the effect silently on exhaustion
   * rather than fall back to `new Material()`, which would reintroduce
   * the exact bug for the overflow case.
   */
  private static readonly POOL_SIZE = 16;
  private readonly sparkPool: THREE.SpriteMaterial[] = [];
  private readonly glowPool: THREE.SpriteMaterial[] = [];
  private readonly trailPool: THREE.MeshBasicMaterial[] = [];
  private readonly beamCorePool: THREE.MeshBasicMaterial[] = [];
  private readonly beamGlowPool: THREE.MeshBasicMaterial[] = [];
  private readonly wispPool: THREE.SpriteMaterial[] = [];
  private readonly freeSparks: THREE.SpriteMaterial[] = [];
  private readonly freeGlows: THREE.SpriteMaterial[] = [];
  private readonly freeTrails: THREE.MeshBasicMaterial[] = [];
  private readonly freeBeamCores: THREE.MeshBasicMaterial[] = [];
  private readonly freeBeamGlows: THREE.MeshBasicMaterial[] = [];
  private readonly freeWisps: THREE.SpriteMaterial[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly lightPool: LightPool,
  ) {}

  /**
   * Fills every pool and uploads/compiles what they hold, before a real
   * cast is the first thing to pay for it — see `SkillFx.prewarm` for the
   * fuller reasoning; this is the same gap in the sibling file that draws
   * a weapon's own attacks rather than a skill's. The arrow prototype is a
   * loaded model, same as any monster, and reaches the same un-warmed gap
   * despite going through `loadModel` — parsing it is not the same as
   * compiling its material or uploading its geometry, and nothing else in
   * the game ever adds it to a scene before the first arrow actually
   * fired does.
   */
  prewarm(world: { warmUp(o: THREE.Object3D): Promise<void>; warmBuffers(o: THREE.Object3D, label?: string): void }): void {
    const group = new THREE.Group();
    const spriteBase = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false } as const;
    const meshBase = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false } as const;
    for (let i = 0; i < Projectiles.POOL_SIZE; i++) {
      const spark = new THREE.SpriteMaterial({ ...spriteBase, map: particleTexture("spark") });
      const glow = new THREE.SpriteMaterial({ ...spriteBase, map: particleTexture("glow") });
      const trail = new THREE.MeshBasicMaterial({ ...meshBase, map: particleTexture("trail"), side: THREE.DoubleSide });
      const beamCore = new THREE.MeshBasicMaterial({ ...meshBase });
      const beamGlow = new THREE.MeshBasicMaterial({ ...meshBase });
      const wisp = new THREE.SpriteMaterial({ ...spriteBase, map: particleTexture("spark") });
      for (const [pool, free, mat] of [
        [this.sparkPool, this.freeSparks, spark],
        [this.glowPool, this.freeGlows, glow],
        [this.trailPool, this.freeTrails, trail],
        [this.beamCorePool, this.freeBeamCores, beamCore],
        [this.beamGlowPool, this.freeBeamGlows, beamGlow],
        [this.wispPool, this.freeWisps, wisp],
      ] as const) {
        (pool as THREE.Material[]).push(mat);
        (free as THREE.Material[]).push(mat);
      }
      group.add(new THREE.Sprite(spark), new THREE.Sprite(glow), new THREE.Mesh(BOLT_TRAIL_GEO, trail));
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1, 6), beamCore));
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1, 8), beamGlow));
      group.add(new THREE.Sprite(wisp));
    }
    void world.warmUp(group).then(() => world.warmBuffers(group, "attacks"));

    void arrowPrototype().then((proto) => {
      const arrow = proto.clone(true);
      void world.warmUp(arrow).then(() => world.warmBuffers(arrow, "arrow"));
    });
  }

  /** An arrow that reaches `to` in `flightMs`, nocked pointing along its path. */
  arrow(from: THREE.Vector3, to: THREE.Vector3, flightMs: number): void {
    void arrowPrototype().then((proto) => {
      const object = proto.clone(true);
      object.position.copy(from);
      object.lookAt(to);
      this.scene.add(object);
      this.live.push({
        object,
        from: from.clone(),
        to: to.clone(),
        startedAt: performance.now(),
        durationMs: Math.max(60, flightMs),
        kind: "arrow",
        materials: [],
      });
    });
  }

  /**
   * A staff's missile: a lit core that flies and lands when it arrives.
   *
   * This replaces a 1.5-unit camera-facing atlas quad, which was the mage's
   * MAIN ATTACK and the least visible thing in the game — a soft smudge at
   * twenty-odd pixels, travelling fast, over grass. It is real geometry with
   * its own light now.
   */
  bolt(from: THREE.Vector3, to: THREE.Vector3, flightMs: number, tint: number): void {
    const sparkMat = this.freeSparks.pop();
    const glowMat = this.freeGlows.pop();
    const trailMat = this.freeTrails.pop();
    if (!sparkMat || !glowMat || !trailMat) {
      // Pool exhausted — dropped rather than falling back to `new
      // Material()`, which would reintroduce the exact bug this pool
      // exists to remove, just for whichever cast happened to be the
      // overflow. Whatever WAS acquired goes straight back.
      if (sparkMat) this.freeSparks.push(sparkMat);
      if (glowMat) this.freeGlows.push(glowMat);
      if (trailMat) this.freeTrails.push(trailMat);
      return;
    }
    // A pooled material carries whatever state its LAST use left it in —
    // spark's own colour never varies (always white), but rotation
    // (spun every frame in flight) and glow/trail's colour and opacity
    // (animated toward zero as the previous cast faded) all need resetting
    // before this cast can rely on them.
    sparkMat.rotation = 0;
    glowMat.rotation = 0;
    glowMat.color.set(tint);
    glowMat.opacity = 0.55;
    trailMat.color.set(tint);
    trailMat.opacity = 0.6;
    const { object, materials, light, spinMats } = boltMesh(this.lightPool, tint, sparkMat, glowMat, trailMat);
    object.position.copy(from);
    object.lookAt(to);
    this.scene.add(object);
    this.live.push({
      object,
      from: from.clone(),
      to: to.clone(),
      startedAt: performance.now(),
      durationMs: Math.max(70, flightMs),
      kind: "bolt",
      materials,
      light,
      spinMats,
    });
  }

  /**
   * A small drifting spark with no light and no trail — the ambient version
   * of `bolt`'s core, for anything meant to fire every few hundred
   * milliseconds rather than once per swing. A real point light on that
   * cadence would be a strobe, not a glow, and a full bolt's trail cone
   * would read as a volley rather than a wisp.
   */
  wisp(at: THREE.Vector3, tint: number, durationMs = 650): void {
    const mat = this.freeWisps.pop();
    if (!mat) return; // pool exhausted — see `bolt`'s own comment on why dropped rather than fresh
    mat.color.set(tint);
    // Faded to (near) zero by the previous use's `update()` — reset before
    // this one can rely on it starting visible.
    mat.opacity = 1;
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.22 + Math.random() * 0.1);
    sprite.position.copy(at);
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.live.push({
      object: sprite,
      from: at.clone(),
      // Drifts gently upward rather than sitting still — the difference
      // between a mote of light and a decal.
      to: at.clone().add(new THREE.Vector3(0, 0.35 + Math.random() * 0.25, 0)),
      startedAt: performance.now(),
      durationMs,
      kind: "wisp",
      materials: [mat],
    });
  }

  /** A wand's zap: drawn once between the two points, then faded out. */
  beam(from: THREE.Vector3, to: THREE.Vector3, tint: number, durationMs = 150): void {
    const length = from.distanceTo(to);
    if (length < 0.05) return;
    // A muzzle flash at the source. The beam itself reads as the shot in
    // flight, but nothing marked where it LEFT FROM — reusing `bolt`'s own
    // spark/glow/light rather than a near-invisible sliver of travel is what
    // gives the wand a real point of origin instead of a zap materialising
    // out of thin air at the caster's hand.
    const dir = to.clone().sub(from).normalize();
    this.bolt(from, from.clone().add(dir.multiplyScalar(0.06)), 160, tint);
    const coreMat = this.freeBeamCores.pop();
    const glowMat = this.freeBeamGlows.pop();
    if (!coreMat || !glowMat) {
      // See `bolt`'s own comment — dropped rather than falling back to a
      // fresh material.
      if (coreMat) this.freeBeamCores.push(coreMat);
      if (glowMat) this.freeBeamGlows.push(glowMat);
      return;
    }
    // Core stays white always; glow's colour and both materials' opacity
    // were faded toward zero by the previous use's `update()`.
    glowMat.color.set(tint);
    coreMat.opacity = 1;
    glowMat.opacity = 0.5;
    const { object, materials } = beamMesh(length, coreMat, glowMat);
    // Boxes are built centred on the origin and extend along their own +Z, so
    // the group sits at the midpoint and looks at the far end.
    object.position.copy(from).lerp(to, 0.5);
    object.lookAt(to);
    this.scene.add(object);
    this.live.push({
      object,
      from: from.clone(),
      to: to.clone(),
      startedAt: performance.now(),
      durationMs,
      kind: "beam",
      materials,
    });
  }

  update(): void {
    const now = performance.now();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      const t = (now - p.startedAt) / p.durationMs;
      if (t >= 1) {
        this.scene.remove(p.object);
        // Handed back to their pools rather than disposed — see this
        // class's own pool fields for why, and `lightPool.ts` for the
        // identical reasoning applied to the light one tick earlier.
        if (p.light) this.lightPool.release(p.light);
        this.releaseMaterials(p);
        this.live.splice(i, 1);
        continue;
      }
      if (p.kind === "arrow") {
        p.object.position.lerpVectors(p.from, p.to, t);
      } else if (p.kind === "bolt") {
        p.object.position.lerpVectors(p.from, p.to, t);
        // Turning, so the silhouette moves — a still sprite reads as a decal
        // riding along rather than as something spinning through the air.
        if (p.spinMats) {
          for (const mat of p.spinMats) mat.rotation += 0.05;
        }
        // Brightest in the middle of the flight: it winds up out of the hand
        // and is spent by the time it lands, where the impact burst takes over.
        const swell = Math.sin(Math.min(1, t) * Math.PI);
        if (p.light) {
          // The light follows in WORLD SPACE rather than by being parented to
          // the bolt - see the note in the bolt builder about the light count.
          p.light.position.copy(p.object.position);
          p.light.intensity = 3 + swell * 6;
        }
        const glow = p.materials[1] as THREE.SpriteMaterial;
        if (glow) glow.opacity = 0.4 + swell * 0.35;
      } else if (p.kind === "wisp") {
        p.object.position.lerpVectors(p.from, p.to, t);
        // A slow rise then a fade, rather than a flash — this is meant to
        // read as ambient, so it must never compete with an actual hit.
        (p.materials[0] as THREE.SpriteMaterial).opacity = 1 - t;
      } else {
        // Beams flash and go: bright for the first third, then fade.
        const fade = t < 0.34 ? 1 : 1 - (t - 0.34) / 0.66;
        for (const m of p.materials) {
          const mat = m as THREE.MeshBasicMaterial;
          mat.opacity = (mat === p.materials[1] ? 0.55 : 1) * fade;
        }
      }
    }
  }

  /** Returns a finished cast's materials to whichever pool they came from —
   *  dispatched by `kind` since `materials`' own order differs per shape
   *  (`bolt`: spark/glow/trail; `beam`: core/glow; `wisp`: one sprite) and
   *  is otherwise untyped once it is sitting in a `LiveProjectile`. Arrows
   *  push nothing here — their own materials come from a cloned model
   *  prototype, not a pool, unchanged by this round of fixes. */
  private releaseMaterials(p: LiveProjectile): void {
    if (p.kind === "bolt") {
      const [spark, glow, trail] = p.materials as [THREE.SpriteMaterial, THREE.SpriteMaterial, THREE.MeshBasicMaterial];
      this.freeSparks.push(spark);
      this.freeGlows.push(glow);
      this.freeTrails.push(trail);
    } else if (p.kind === "beam") {
      const [core, glow] = p.materials as [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
      this.freeBeamCores.push(core);
      this.freeBeamGlows.push(glow);
    } else if (p.kind === "wisp") {
      this.freeWisps.push(p.materials[0] as THREE.SpriteMaterial);
    }
  }

  dispose(): void {
    for (const p of this.live) {
      this.scene.remove(p.object);
      if (p.light) this.lightPool.release(p.light);
    }
    this.live.length = 0;
    // The whole pools, not just what was live — the free lists hold the
    // rest, and skipping them here would leak exactly what pooling was
    // supposed to stop leaking.
    for (const pool of [this.sparkPool, this.glowPool, this.trailPool, this.beamCorePool, this.beamGlowPool, this.wispPool]) {
      for (const m of pool) m.dispose();
      pool.length = 0;
    }
    for (const free of [this.freeSparks, this.freeGlows, this.freeTrails, this.freeBeamCores, this.freeBeamGlows, this.freeWisps]) {
      free.length = 0;
    }
  }
}
