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
import { particleTexture } from "./attacks";
import type { LightPool } from "./lightPool";

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
  /**
   * A ring snapping INWARD onto a body. Anything that puts a condition on
   * something.
   *
   * The converging direction is the whole idea, and it is the exact opposite of
   * `nova`: a nova radiates OUT of a point because something happened there, and
   * a mark closes IN on a body because something is being done TO it. Four
   * control skills — Gut Punch, Concuss, Stagger and Expose — drew nothing of
   * their own and were indistinguishable from an ordinary swing, which is a
   * problem when what they actually did was set up a 140% multiplier.
   */
  | "mark"
  /**
   * One heavy blow landing on a body, rather than a sweep or a ring.
   *
   * For the single-target strikes: Backstab and Exploit. Camera-facing at the
   * target's own middle rather than flat on the ground, because the event being
   * described happened to a CREATURE and not to a patch of floor.
   */
  | "strike"
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
  gutpunch: { shape: "mark", color: 0xffe0b0 },

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
  concuss: { shape: "mark", color: 0xffe27a },

  // dagger / bow
  powershot: { shape: "none", color: 0xd8e8a0 },
  multishot: { shape: "cone", color: 0xc8e88a },
  poisonarrow: { shape: "ground", color: 0x7ec44a },
  disengage: { shape: "none", color: 0xcfe8ff },
  rainofarrows: { shape: "rain", color: 0xd8e0a8 },
  backstab: { shape: "strike", color: 0xb07ad8 },
  flurry: { shape: "cone", color: 0xdfe8f5 },

  // staff / wand
  arcanebolt: { shape: "none", color: 0x9a7aff },
  firebolt: { shape: "none", color: 0xff7a3a, light: true },
  frostnova: { shape: "nova", color: 0x7ad8ff },
  mend: { shape: "pillar", color: 0x7ed957 },
  chainlightning: { shape: "chain", color: 0xaee0ff, light: true },
  frostbolt: { shape: "none", color: 0x8ad0ff },
  arcanemissiles: { shape: "chain", color: 0xc79aff },

  // Added with the status system. The shape follows what the skill DOES
  // rather than which tree it sits in: the three self-buffs bloom around the
  // caster, the three debuffs land on the target with nothing thrown, and the
  // two that are spells travel like the spells beside them.
  focus: { shape: "nova", color: 0xffe08a },
  rally: { shape: "pillar", color: 0xffd873 },
  bloodlust: { shape: "nova", color: 0xff6a4a, light: true },
  // The four debuff-appliers share the inward ring on purpose, for the same
  // reason the eight readers share an amber cast: the thing a player has to
  // learn is "a condition just landed on that", and four unrelated signatures
  // would teach them nothing. Hunter's Mark is thrown rather than swung, so it
  // keeps its projectile and takes the ring on arrival.
  stagger: { shape: "mark", color: 0xd8c7a0 },
  expose: { shape: "mark", color: 0xffab6a },
  huntersmark: { shape: "mark", color: 0x8fd15a },
  immolate: { shape: "none", color: 0xff7a3a, light: true },
  stormbolt: { shape: "chain", color: 0xffe066, light: true },

  // The readers. They all share one visual idea on purpose — a hot amber cast
  // to say "the condition paid" — because that is the thing the player has to
  // learn to look for, and eight unrelated signatures would teach them nothing.
  // The two cleanses are the exception and are green, since lifting something
  // off is the opposite act.
  secondbreath: { shape: "pillar", color: 0x7ed957 },
  wardoff: { shape: "pillar", color: 0x8fe0b0 },
  onslaught: { shape: "cone", color: 0xffa63d, light: true },
  execute: { shape: "cone", color: 0xff8a3d },
  followthrough: { shape: "nova", color: 0xffb05c },
  exploit: { shape: "strike", color: 0xffa63d },
  killshot: { shape: "none", color: 0xffc46a },
  combust: { shape: "ground", color: 0xff7a3a, light: true },
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
  /** Which of `SkillFx`'s pools `material` was borrowed from, so `update()`
   *  can return it to the right one instead of disposing it. */
  pool: "additive" | "normal" | "mark";
}

interface LiveLight {
  light: THREE.PointLight;
  startedAt: number;
  durationMs: number;
  peak: number;
}

interface PendingFlash {
  x: number;
  y: number;
  z: number;
  color: number;
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
  // A flash that couldn't get a light this frame (pool exhausted) waits here
  // rather than being dropped, so a very busy fight loses light priority to
  // whichever flashes started first instead of randomly to whichever call
  // happened to lose the race.
  private readonly pendingFlashes: PendingFlash[] = [];

  // One geometry per shape, shared by every instance — the per-effect state is
  // all in the transform and the material.
  private readonly ring = new THREE.RingGeometry(0.86, 1, 48);
  private readonly disc = new THREE.CircleGeometry(1, 40);
  private readonly streak = new THREE.PlaneGeometry(0.07, 1.7);
  private readonly wedge: THREE.BufferGeometry;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly lightPool: LightPool,
  ) {
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
  private material(
    color: number,
    opacity: number,
    additive = true,
    map?: THREE.Texture,
  ): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      // Only included when set. Three.js's constructor warns
      // ("THREE.Material: parameter 'map' has value of undefined") when a
      // texture-map key is present in the params at all, even set to
      // undefined — passing the key only conditionally is what most calls to
      // this helper need, since most effects have no map and call this with
      // two arguments.
      ...(map ? { map } : {}),
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

  /**
   * Three fixed pools, never disposed — the same fix `effects.ts` and
   * `attacks.ts` were given, after their own "keep one extra warm
   * material referenced" attempt (this file's own former `warmed` array)
   * was confirmed live, via `[dispose-trace]` stack traces landing here —
   * `skillfx.ts:480` — to not actually stop three.js deleting the
   * compiled program the moment the last REAL material was disposed. The
   * only fix that cannot fail that way is to never create or destroy the
   * material at all.
   *
   * Three pools rather than one, matching the three program variants
   * `material()` can produce: `additive` (no map, additive blending —
   * `nova`/`cone`/`strike`/`pillar`/`rain`, the overwhelming majority),
   * `normal` (no map, normal blending — `ground` only), `mark` (textured,
   * additive — `mark` only). Geometry is independent of which pool a
   * material comes from — `additive` materials get handed to whichever of
   * `ring`/`wedge`/`streak` the calling shape actually uses.
   *
   * `additive` is sized well past the others: `rain` alone can have up to
   * sixteen streaks live from one cast, and several players can be
   * casting at once. A missed effect on overflow is silently dropped —
   * see each acquire site — the same call `lightPool.ts` makes for
   * exactly this reason.
   */
  private static readonly ADDITIVE_POOL_SIZE = 48;
  private static readonly NORMAL_POOL_SIZE = 16;
  private static readonly MARK_POOL_SIZE = 16;
  private readonly additivePool: THREE.MeshBasicMaterial[] = [];
  private readonly normalPool: THREE.MeshBasicMaterial[] = [];
  private readonly markPool: THREE.MeshBasicMaterial[] = [];
  private readonly freeAdditive: THREE.MeshBasicMaterial[] = [];
  private readonly freeNormal: THREE.MeshBasicMaterial[] = [];
  private readonly freeMark: THREE.MeshBasicMaterial[] = [];

  /**
   * Fills all three pools and uploads/compiles what they hold, before any
   * of the twenty-seven skills gets to be the first one cast in a
   * session. No model-warming path (`World.warmUp`/`warmBuffers`) ever
   * reached this file on its own, because none of this is a loaded model.
   *
   * Called once, off-screen, from wherever the background gear-warming
   * queue already runs (see `warmer.ts`) — the same "nobody is looking"
   * moment M70.40 used for the whole static world, one system over.
   */
  prewarm(world: { warmUp(o: THREE.Object3D): Promise<void>; warmBuffers(o: THREE.Object3D, label?: string): void }): void {
    const group = new THREE.Group();
    const geos = [this.ring, this.disc, this.streak, this.wedge];
    for (let i = 0; i < SkillFx.ADDITIVE_POOL_SIZE; i++) {
      const m = this.material(0xffffff, 1, true);
      this.additivePool.push(m);
      this.freeAdditive.push(m);
      group.add(new THREE.Mesh(geos[i % geos.length], m));
    }
    for (let i = 0; i < SkillFx.NORMAL_POOL_SIZE; i++) {
      const m = this.material(0xffffff, 1, false);
      this.normalPool.push(m);
      this.freeNormal.push(m);
      group.add(new THREE.Mesh(this.disc, m));
    }
    for (let i = 0; i < SkillFx.MARK_POOL_SIZE; i++) {
      const m = this.material(0xffffff, 1, true, particleTexture("ring"));
      this.markPool.push(m);
      this.freeMark.push(m);
      group.add(new THREE.Mesh(this.ring, m));
    }
    void world.warmUp(group).then(() => world.warmBuffers(group, "skillfx"));
  }

  /** Borrows an additive material for the caller's own shape/geometry, or
   *  `null` on exhaustion — see `additivePool`'s own comment. Resets colour
   *  and opacity, since a pooled material carries whatever its last use
   *  faded it to. */
  private acquireAdditive(color: number): THREE.MeshBasicMaterial | null {
    const mat = this.freeAdditive.pop();
    if (!mat) return null;
    mat.color.set(color);
    mat.opacity = 1;
    return mat;
  }

  /** A ring racing outward along the ground. */
  nova(x: number, y: number, z: number, radius: number, color: number, durationMs = 520): void {
    const mat = this.acquireAdditive(color);
    if (!mat) return;
    const mesh = new THREE.Mesh(this.ring, mat);
    mesh.rotation.x = -Math.PI / 2;
    // Just clear of the ground: at exactly y=0 it z-fights with the terrain.
    mesh.position.set(x, y + 0.06, z);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      durationMs, fromRadius: radius * 0.15, toRadius: radius, spin: 0, peakOpacity: 0.7, pool: "additive",
    });
  }

  /** A disc that lands and lingers, for ground-targeted areas. */
  ground(x: number, y: number, z: number, radius: number, color: number, durationMs = 900): void {
    const mat = this.freeNormal.pop();
    if (!mat) return;
    mat.color.set(color);
    mat.opacity = 1;
    const mesh = new THREE.Mesh(this.disc, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.04, z);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      durationMs, fromRadius: radius * 0.7, toRadius: radius, spin: 0.4, peakOpacity: 0.4, pool: "normal",
    });
  }

  /** A wedge sweeping the caster's facing. */
  cone(
    x: number, y: number, z: number,
    facing: number, reach: number, color: number,
    durationMs = 340,
  ): void {
    const mat = this.acquireAdditive(color);
    if (!mat) return;
    const mesh = new THREE.Mesh(this.wedge, mat);
    mesh.position.set(x, y + 0.07, z);
    mesh.rotation.y = facing;
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      durationMs, fromRadius: reach * 0.35, toRadius: reach, spin: 0, peakOpacity: 0.42, pool: "additive",
    });
  }

  /**
   * A ring closing onto a body — something has been put ON this creature.
   *
   * Camera-facing rather than flat, which matters more than it sounds: a flat
   * ring at the feet says "this patch of ground", and every one of these skills
   * is about the body standing on it. This game has exactly one camera bearing,
   * so an unrotated ring faces the viewer by construction.
   */
  mark(x: number, y: number, z: number, color: number, durationMs = 380): void {
    // A rune circle rather than a flat ring — this is the one shape in the
    // library that is actually ABOUT a condition landing on a body, which is
    // exactly what the texture is a picture of. `RingGeometry`'s own UVs are a
    // plain square projection (`u = x/outerRadius/2 + 0.5`), the same
    // convention the texture was authored for, so this needed no new UVs —
    // only `nova` and the rest keep the flat fill, since a rune circle on a
    // physical shockwave like Earthshatter would be describing a school the
    // skill does not have.
    const mat = this.freeMark.pop();
    if (!mat) return;
    mat.color.set(color);
    mat.opacity = 1;
    const mesh = new THREE.Mesh(this.ring, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      // Inward, and fast. A condition lands; it does not bloom.
      durationMs, fromRadius: 2.0, toRadius: 0.75, spin: -0.9, peakOpacity: 0.85, pool: "mark",
    });
  }

  /** One heavy blow landing on a body. */
  strike(x: number, y: number, z: number, color: number, durationMs = 260): void {
    // Two rings on the same beat, one lagging: a single ring reads as a bubble,
    // and the offset is what makes it read as an impact travelling outward.
    for (const [from, to, width, peak] of [
      [0.25, 1.5, 0.95, 0.9],
      [0.1, 0.9, 0.55, 0.7],
    ] as const) {
      const mat = this.acquireAdditive(color);
      if (!mat) continue;
      const mesh = new THREE.Mesh(this.ring, mat);
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(width);
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.live.push({
        object: mesh, material: mat, startedAt: performance.now(),
        durationMs, fromRadius: from, toRadius: to, spin: 2.4, peakOpacity: peak, pool: "additive",
      });
    }
  }

  /** Light stabbing up from someone's feet. */
  pillar(x: number, y: number, z: number, color: number, durationMs = 620): void {
    const mat = this.acquireAdditive(color);
    if (!mat) return;
    const mesh = new THREE.Mesh(this.ring, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y + 0.05, z);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.live.push({
      object: mesh, material: mat, startedAt: performance.now(),
      durationMs, fromRadius: 1.4, toRadius: 0.35, spin: 1.6, peakOpacity: 0.7, pool: "additive",
    });
  }

  /** Streaks falling out of the sky across an area. */
  rain(x: number, y: number, z: number, radius: number, color: number, count = 16): void {
    const now = performance.now();
    for (let i = 0; i < count; i++) {
      const mat = this.acquireAdditive(color);
      if (!mat) continue;
      const a = (i / count) * Math.PI * 2 + Math.random();
      const r = Math.sqrt(Math.random()) * radius;
      const mesh = new THREE.Mesh(this.streak, mat);
      mesh.position.set(x + Math.cos(a) * r, y + 7, z + Math.sin(a) * r);
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.live.push({
        object: mesh, material: mat,
        // Staggered, so it falls as a volley rather than as one curtain.
        startedAt: now + i * 26,
        durationMs: 420, fromRadius: 1, toRadius: 1, spin: 0, peakOpacity: 0.85, pool: "additive",
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
    // Pulled from a fixed pool rather than `new THREE.PointLight()` — see
    // lightPool.ts for why creating one per flash caused stutters.
    const light = this.lightPool.acquire(color, 0, 14, 2);
    if (!light) {
      this.pendingFlashes.push({ x, y, z, color, startedAt: performance.now(), durationMs, peak });
      return;
    }
    light.position.set(x, y + 1, z);
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
        this.releaseMaterial(fx);
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
        this.lightPool.release(l.light);
        this.lights.splice(i, 1);
        continue;
      }
      // Snap on, fall away — the shape of a real flash.
      l.light.intensity = l.peak * Math.pow(1 - k, 2);
    }

    for (let i = this.pendingFlashes.length - 1; i >= 0; i--) {
      const p = this.pendingFlashes[i];
      const light = this.lightPool.acquire(p.color, 0, 14, 2);
      if (!light) continue;
      light.position.set(p.x, p.y + 1, p.z);
      this.lights.push({ light, startedAt: p.startedAt, durationMs: p.durationMs, peak: p.peak });
      this.pendingFlashes.splice(i, 1);
    }
  }

  /** Returns a finished effect's material to whichever pool it was
   *  borrowed from — dispatched by `Live.pool` since a bare
   *  `THREE.Material` reference carries no record of that on its own. */
  private releaseMaterial(fx: Live): void {
    if (fx.pool === "additive") this.freeAdditive.push(fx.material as THREE.MeshBasicMaterial);
    else if (fx.pool === "normal") this.freeNormal.push(fx.material as THREE.MeshBasicMaterial);
    else this.freeMark.push(fx.material as THREE.MeshBasicMaterial);
  }

  dispose(): void {
    for (const fx of this.live) {
      this.scene.remove(fx.object);
    }
    for (const l of this.lights) {
      this.lightPool.release(l.light);
    }
    this.live.length = 0;
    this.lights.length = 0;
    // The whole pools, not just what was live — the free lists hold the
    // rest, and skipping them here would leak exactly what pooling was
    // supposed to stop leaking.
    for (const pool of [this.additivePool, this.normalPool, this.markPool]) {
      for (const m of pool) m.dispose();
      pool.length = 0;
    }
    this.freeAdditive.length = 0;
    this.freeNormal.length = 0;
    this.freeMark.length = 0;
    this.ring.dispose();
    this.disc.dispose();
    this.streak.dispose();
    this.wedge.dispose();
  }
}
