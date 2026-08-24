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

export const ATTACK_STYLES: Record<WeaponType, AttackStyle> = {
  // Bare hands: quick, small, and unmistakably not a weapon.
  fist: { delivery: "melee", releaseSfx: "swing", impact: "impact", tint: 0xffe6cc, swingMs: 130, speedPxPerSec: 0, impactScale: 0.75 },
  sword: { delivery: "melee", releaseSfx: "swing", impact: "slash", tint: 0xffffff, swingMs: 170, speedPxPerSec: 0, impactScale: 1.0 },
  // Slow and heavy — the beat is longer because the swing is.
  axe: { delivery: "melee", releaseSfx: "swing", impact: "slash", tint: 0xffd2a6, swingMs: 235, speedPxPerSec: 0, impactScale: 1.4 },
  mace: { delivery: "melee", releaseSfx: "swing", impact: "quake", tint: 0xffdfa0, swingMs: 215, speedPxPerSec: 0, impactScale: 1.25 },
  // Fast and light, and the shortest reach in the ranger's kit.
  dagger: { delivery: "melee", releaseSfx: "swing", impact: "slash", tint: 0xd8f0ff, swingMs: 105, speedPxPerSec: 0, impactScale: 0.7 },
  // A real arrow, drawn from the pack's own model and flown to the target.
  bow: { delivery: "arrow", releaseSfx: "bow", impact: "arrow", tint: 0xfff0d0, swingMs: 0, speedPxPerSec: 1500, impactScale: 0.95 },
  // A travelling bolt of force: the mage's main-hand missile.
  staff: { delivery: "bolt", releaseSfx: "cast", impact: "arcane", tint: 0x9ad4ff, swingMs: 0, speedPxPerSec: 1050, impactScale: 1.0 },
  // A beam rather than a missile — instant, thin and bright, the way a wand
  // reads in every game that has one. It is what makes the wand feel like a
  // sidearm next to the staff instead of a shorter copy of it.
  wand: { delivery: "beam", releaseSfx: "beam", impact: "arcane", tint: 0xc9a4ff, swingMs: 95, speedPxPerSec: 0, impactScale: 0.7 },
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
  return Math.round(Math.max(90, Math.min(650, flight)));
}

// --- Projectiles ----------------------------------------------------------

interface LiveProjectile {
  object: THREE.Object3D;
  from: THREE.Vector3;
  to: THREE.Vector3;
  startedAt: number;
  durationMs: number;
  /** Beams hold still and fade; arrows and bolts travel. */
  kind: "arrow" | "beam" | "bolt";
  materials: THREE.Material[];
  /** Bolts and arrows carry their own light, which has to be taken away too. */
  light?: THREE.PointLight;
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
function boltMesh(tint: number): {
  object: THREE.Object3D;
  materials: THREE.Material[];
  light: THREE.PointLight;
  spinMats: THREE.SpriteMaterial[];
} {
  const sparkMat = new THREE.SpriteMaterial({
    map: particleTexture("spark"),
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const glowMat = new THREE.SpriteMaterial({
    map: particleTexture("glow"),
    color: tint,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const trailMat = new THREE.MeshBasicMaterial({
    map: particleTexture("trail"),
    color: tint,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });

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

  const light = new THREE.PointLight(tint, 7, 10, 2);

  const group = new THREE.Group();
  group.add(glow, spark, trail, light);
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
        new THREE.ConeGeometry(0.17, ARROW_LENGTH_UNITS * 2.2, 8, 1, true),
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

function beamMesh(length: number, tint: number): { object: THREE.Object3D; materials: THREE.Material[] } {
  // Two nested boxes: a hot white core inside a wider tinted glow. One box on
  // its own reads as a coloured stick rather than as light.
  // Both widened by about three times: at 0.05 and 0.16 units these were a
  // one-pixel core inside a two-pixel glow, which is a hairline rather than a
  // zap. Cylinders rather than boxes so the glow has no flat sides to catch
  // the light wrong as the camera turns with the beam.
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, length, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  core.rotation.x = Math.PI / 2;
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, length, 8),
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  glow.rotation.x = Math.PI / 2;
  const group = new THREE.Group();
  group.add(glow, core);
  group.renderOrder = 10;
  return { object: group, materials: [core.material as THREE.Material, glow.material as THREE.Material] };
}

/**
 * Arrows in flight and beams mid-flash. Kept apart from `Effects` because those
 * are camera-facing quads from an atlas, and neither of these is: an arrow is a
 * real mesh that has to point where it is going, and a beam is a shape defined
 * by two endpoints rather than by a position.
 */
export class Projectiles {
  private readonly live: LiveProjectile[] = [];

  constructor(private readonly scene: THREE.Scene) {}

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
    const { object, materials, light, spinMats } = boltMesh(tint);
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

  /** A wand's zap: drawn once between the two points, then faded out. */
  beam(from: THREE.Vector3, to: THREE.Vector3, tint: number, durationMs = 150): void {
    const length = from.distanceTo(to);
    if (length < 0.05) return;
    const { object, materials } = beamMesh(length, tint);
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
        // A light left in the scene graph is a light three still evaluates for
        // every fragment of every lit surface, for ever.
        p.light?.dispose();
        for (const m of p.materials) m.dispose();
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
        if (p.light) p.light.intensity = 3 + swell * 6;
        const glow = p.materials[1] as THREE.SpriteMaterial;
        if (glow) glow.opacity = 0.4 + swell * 0.35;
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

  dispose(): void {
    for (const p of this.live) {
      this.scene.remove(p.object);
      p.light?.dispose();
      for (const m of p.materials) m.dispose();
    }
    this.live.length = 0;
  }
}
