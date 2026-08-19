// What a skill LOOKS like when it goes off.
//
// Before this, every one of the twenty-seven skills drew the same thing: one
// camera-facing quad from `fx.png`, differing only in which row of the atlas it
// picked and what colour it was tinted. That is enough to say "something
// happened" and not enough to say WHAT — a nova that bursts around you, a bolt
// that flies, and a chain that jumps between three enemies all read as a
// coloured flash on the spot.
//
// So this is the same move M3.7 made for weapon attacks, one layer up: **one
// table says how each skill is delivered**, and the shapes are real geometry
// rather than atlas frames, because the things a flat quad cannot express are
// exactly the ones that distinguish these skills. A ring expanding outward
// along the ground is a shockwave; a quad that scales up is a flash.
//
// The atlas is still used, and still carries the school's colour and texture —
// this adds shape on top of it rather than replacing it.

import * as THREE from "three";
import type { SkillId } from "../../../shared/protocol-types";

/** How a skill's effect is delivered, beyond the atlas flash it already plays. */
export type FxShape =
  /** A ring racing outward along the ground. Shockwaves, novas, roars. */
  | "nova"
  /** A filled disc that lingers where it landed. Ground-targeted areas. */
  | "ground"
  /** Light stabbing up from the feet. Buffs and heals, which happen TO someone. */
  | "pillar"
  /** Streaks falling out of the sky over an area. */
  | "rain"
  /** Straight segments hopping target to target. */
  | "chain"
  /** A wedge sweeping the facing. Cleaves and sweeps. */
  | "cone"
  /** Nothing extra — the atlas flash alone is right for it. */
  | "none";

export interface FxSpec {
  shape: FxShape;
  /** Signature colour. Deliberately per skill, not per school: fire and frost
   *  share the `arcane` row but must never be the same colour on screen. */
  color: number;
  /** Adds a brief point light. Reserved for skills that should look hot. */
  light?: boolean;
}

/**
 * Every skill's signature. Grouped by weapon tree, in the order the trees list
 * them, so this reads alongside `WEAPON_TREES` rather than against it.
 */
export const SKILL_FX: Record<SkillId, FxSpec> = {
  // fists — close, blunt, unarmed
  haymaker: { shape: "cone", color: 0xffd9a0 },
  roar: { shape: "nova", color: 0xffc46a },
  gutpunch: { shape: "none", color: 0xffe0b0 },

  // sword / axe / mace
  cleave: { shape: "cone", color: 0xffe9b0 },
  charge: { shape: "none", color: 0xcfe8ff },
  warcry: { shape: "nova", color: 0xffd873 },
  shieldwall: { shape: "pillar", color: 0x9fd8ff },
  earthshatter: { shape: "nova", color: 0xc98a4a, light: true },
  riposte: { shape: "pillar", color: 0xffeec0 },
  rend: { shape: "cone", color: 0xd8484a },
  reckless: { shape: "pillar", color: 0xff9a5c },
  shockwave: { shape: "nova", color: 0xd8c89a },
  concuss: { shape: "none", color: 0xffe27a },

  // dagger / bow
  powershot: { shape: "none", color: 0xd8e8a0 },
  multishot: { shape: "cone", color: 0xc8e88a },
  poisonarrow: { shape: "ground", color: 0x7ec44a },
  disengage: { shape: "none", color: 0xcfe8ff },
  rainofarrows: { shape: "rain", color: 0xd8e0a8 },
  backstab: { shape: "none", color: 0xb07ad8 },
  flurry: { shape: "cone", color: 0xdfe8f5 },

  // staff / wand
  arcanebolt: { shape: "none", color: 0x9a7aff },
  firebolt: { shape: "none", color: 0xff7a3a, light: true },
  frostnova: { shape: "nova", color: 0x7ad8ff },
  mend: { shape: "pillar", color: 0x7ed957 },
  chainlightning: { shape: "chain", color: 0xaee0ff, light: true },
  frostbolt: { shape: "none", color: 0x8ad0ff },
  arcanemissiles: { shape: "chain", color: 0xc79aff },
};

export function fxFor(id: SkillId): FxSpec {
  return SKILL_FX[id] ?? { shape: "none", color: 0xc9b8ff };
}

interface Live {
  object: THREE.Mesh | THREE.Line;
  material: THREE.Material & { opacity: number };
  startedAt: number;
  durationMs: number;
  /** Ring and disc growth, in world units, start to end. */
  fromRadius: number;
  toRadius: number;
  /** Vertical travel, for falling streaks. */
  fallFrom?: number;
  fallTo?: number;
  spin: number;
  /**
   * The opacity this shape is meant to peak at.
   *
   * Needed because the fade in `update` writes `material.opacity` every frame,
   * and the first version wrote a flat 1 during the hold — which silently threw
   * away the value every shape had just chosen and drove all of them to full.
   * Additive blending at full opacity saturates, so a frost nova and a cleave
   * both came out white instead of blue and gold.
   */
  peakOpacity: number;
}

interface LiveLight {
  light: THREE.PointLight;
  startedAt: number;
  durationMs: number;
  peak: number;
}

/**
 * Owns the geometry-based skill effects and their lifetimes.
 *
 * Separate from `Effects` for the same reason `Projectiles` is: everything in
 * that class is a camera-facing quad positioned at a point, and a ring lying
 * flat on the ground growing outward is not that. Bending the atlas system to
 * cover it would cost more than a sibling that does exactly these shapes.
 */
export class SkillFx {
  private readonly live: Live[] = [];
  private readonly lights: LiveLight[] = [];

  // One geometry per shape, shared by every instance — the per-effect state is
  // all in the transform and the material.
  private readonly ring = new THREE.RingGeometry(0.86, 1, 48);
  private readonly disc = new THREE.CircleGeometry(1, 40);
  private readonly streak = new THREE.PlaneGeometry(0.07, 1.7);
  private readonly wedge: THREE.BufferGeometry;

  constructor(private readonly scene: THREE.Scene) {
    // A 90-degree wedge lying flat, pointing down +Z, so it can be dropped in
    // front of a caster by setting its Y rotation to their facing.
    const shape = new THREE.Shape();
    const half = Math.PI / 4;
    shape.moveTo(0, 0);
    for (let i = 0; i <= 18; i++) {
      const a = -half + (i / 18) * half * 2;
      shape.lineTo(Math.sin(a), Math.cos(a));
    }
    shape.lineTo(0, 0);
    this.wedge = new THREE.ShapeGeometry(shape);
    this.wedge.rotateX(-Math.PI / 2);
  }

  /**
   * @param additive light rather than paint. Right for anything that flashes —
   * a nova, a bolt, a pillar — and wrong for anything that LINGERS: additive
   * cannot darken, so a pool sitting on the ground for a second only ever
   * brightens what is under it, and at night it blows out into a solid slab of
   * colour with the grass showing through it. Those use normal blending and
   * tint the ground instead.
   */
  private material(color: number, opacity: number, additive = true): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      // depthWrite off either way, so two overlapping effects do not clip.
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      // Fog would grey out a spell cast at the far edge of the view, and a
      // spell is exactly the thing that should stay legible at range.
      fog: false,
    });
  }

  /** A ring racing outward along the ground. */
  nova(x: number, y: number, z: number, radius: number, color: number, durationMs = 520): void {
    const mat = this.material(color, 0.95);
    const mesh = new THREE.Mesh(this.ring, mat);
    mesh.rotation.x = -Math.PI / 2;
    // Just clear of the ground: at exactly y=0 it z-fights with the terrain.
    mesh.position.set(x, y + 0.06, z);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      durationMs, fromRadius: radius * 0.15, toRadius: radius, spin: 0, peakOpacity: 0.7,
    });
  }

  /** A disc that lands and lingers, for ground-targeted areas. */
  ground(x: number, y: number, z: number, radius: number, color: number, durationMs = 900): void {
    const mat = this.material(color, 0.4, false);
    const mesh = new THREE.Mesh(this.disc, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.04, z);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      durationMs, fromRadius: radius * 0.7, toRadius: radius, spin: 0.4, peakOpacity: 0.4,
    });
  }

  /** A wedge sweeping the caster's facing. */
  cone(
    x: number, y: number, z: number,
    facing: number, reach: number, color: number,
    durationMs = 340,
  ): void {
    const mat = this.material(color, 0.7);
    const mesh = new THREE.Mesh(this.wedge, mat);
    mesh.position.set(x, y + 0.07, z);
    mesh.rotation.y = facing;
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      durationMs, fromRadius: reach * 0.35, toRadius: reach, spin: 0, peakOpacity: 0.42,
    });
  }

  /** Light stabbing up from someone's feet. */
  pillar(x: number, y: number, z: number, color: number, durationMs = 620): void {
    const mat = this.material(color, 0.8);
    const mesh = new THREE.Mesh(this.ring, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.05, z);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      durationMs, fromRadius: 1.4, toRadius: 0.35, spin: 1.6, peakOpacity: 0.7,
    });
  }

  /** Streaks falling out of the sky across an area. */
  rain(x: number, y: number, z: number, radius: number, color: number, count = 16): void {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      const r = Math.sqrt(Math.random()) * radius;
      const mat = this.material(color, 0.85);
      const mesh = new THREE.Mesh(this.streak, mat);
      mesh.position.set(x + Math.cos(a) * r, y + 7, z + Math.sin(a) * r);
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.live.push({
        object: mesh, material: mat,
        // Staggered, so it falls as a volley rather than as one curtain.
        startedAt: now + i * 26,
        durationMs: 420, fromRadius: 1, toRadius: 1, spin: 0, peakOpacity: 0.85,
        fallFrom: y + 7, fallTo: y + 0.2,
      });
    }
  }

  /**
   * A brief point light. Cheap, and it is what makes a firebolt read as hot
   * rather than as an orange picture — especially now that the world has a
   * night to cast it in.
   */
  flash(x: number, y: number, z: number, color: number, peak = 9, durationMs = 260): void {
    const light = new THREE.PointLight(color, 0, 14, 2);
    light.position.set(x, y + 1, z);
    this.scene.add(light);
    this.lights.push({ light, startedAt: performance.now(), durationMs, peak });
  }

  /** Advances every live effect and reaps the finished ones. */
  update(): void {
    const now = performance.now();

    for (let i = this.live.length - 1; i >= 0; i--) {
      const fx = this.live[i];
      const age = now - fx.startedAt;
      if (age < 0) continue; // staggered, not started yet
      const k = age / fx.durationMs;
      if (k >= 1) {
        this.scene.remove(fx.object);
        fx.material.dispose();
        this.live.splice(i, 1);
        continue;
      }

      // Ease out: fast at the start, settling at the end. Linear growth reads
      // as mechanical, and these are impacts.
      const eased = 1 - Math.pow(1 - k, 2.2);
      const radius = fx.fromRadius + (fx.toRadius - fx.fromRadius) * eased;
      fx.object.scale.set(radius, radius, radius);
      if (fx.fallFrom !== undefined && fx.fallTo !== undefined) {
        fx.object.position.y = fx.fallFrom + (fx.fallTo - fx.fallFrom) * k;
        fx.object.scale.set(1, 1, 1);
      }
      if (fx.spin) fx.object.rotation.z += fx.spin * 0.016;
      // Hold at the shape's own peak, then fade. Fading from the first frame
      // makes everything look weak; ignoring the peak makes everything white.
      const held = k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55;
      fx.material.opacity = fx.peakOpacity * held;
    }

    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      const k = (now - l.startedAt) / l.durationMs;
      if (k >= 1) {
        this.scene.remove(l.light);
        l.light.dispose();
        this.lights.splice(i, 1);
        continue;
      }
      // Snap on, fall away — the shape of a real flash.
      l.light.intensity = l.peak * Math.pow(1 - k, 2);
    }
  }

  dispose(): void {
    for (const fx of this.live) {
      this.scene.remove(fx.object);
      fx.material.dispose();
    }
    for (const l of this.lights) {
      this.scene.remove(l.light);
      l.light.dispose();
    }
    this.live.length = 0;
    this.lights.length = 0;
    this.ring.dispose();
    this.disc.dispose();
    this.streak.dispose();
    this.wedge.dispose();
  }
}
