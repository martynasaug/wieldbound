// Visual effects.
//
// The art is `fx.png`, the 14-school x 6-frame atlas built for the 2D client
// (tools/art/build_fx2.ps1). Reusing it rather than authoring new 3D VFX is
// deliberate: the schools already line up one-for-one with `SkillDef.effect`,
// so adding a spell still means picking a row and a tint rather than producing
// art — the promise Phase 39 made when the library was built.
//
// In 3D they are camera-facing quads. Additive blending and depthWrite off, so
// they read as light rather than as cardboard standing in the world.

import * as THREE from "three";

const FX_URL = "/assets/fx.png";
const FX_COLS = 6;
const FX_ROWS = 14;

// Row order is fixed by the build script; the names are what SkillDef.effect
// uses, which is why no mapping table is needed between them.
export const FX_ROW = {
  slash: 0,
  impact: 1,
  arcane: 2,
  heal: 3,
  fire: 4,
  frost: 5,
  lightning: 6,
  buff: 7,
  arrow: 8,
  poison: 9,
  shadow: 10,
  holy: 11,
  shield: 12,
  quake: 13,
} as const;

export type EffectName = keyof typeof FX_ROW;

export function isEffectName(s: string): s is EffectName {
  return s in FX_ROW;
}

interface Live {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.Texture;
  row: number;
  startedAt: number;
  durationMs: number;
  /** Optional travel, for projectile-style casts. */
  from?: THREE.Vector3;
  to?: THREE.Vector3;
  spin: number;
}

export interface EffectOptions {
  scale?: number;
  tint?: number;
  durationMs?: number;
  /** Travels from the caster to the impact point over its lifetime. */
  from?: THREE.Vector3;
  spin?: number;
}

export class Effects {
  private readonly base: THREE.Texture;
  private readonly live: Live[] = [];
  private readonly geometry = new THREE.PlaneGeometry(1, 1);

  // Camera shake, applied by the caller as an offset. Kept here because it is
  // part of "how a hit feels" and always fires alongside an effect.
  private shakeUntil = 0;
  private shakeAmount = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.base = new THREE.TextureLoader().load(FX_URL);
    this.base.colorSpace = THREE.SRGBColorSpace;
    // The atlas is 48px cells of deliberately soft, glowing art; smoothing it
    // is right here, unlike the 16px pixel art the 2D client had to keep sharp.
    this.base.minFilter = THREE.LinearFilter;
    this.base.magFilter = THREE.LinearFilter;
  }

  /**
   * A fixed pool of materials, never disposed, for the exact reason
   * `lightPool.ts` gives for pooling `THREE.PointLight`s rather than
   * `new`-ing one per effect: adding or removing a GPU resource changes
   * what the renderer has to keep compiled for it, and `play()` is the
   * hit-impact flash — one per landed swing, far more frequent than any
   * skill — so a fresh `.dispose()`d material every ~460ms meant three.js
   * was deleting and recompiling this shader on a cycle tied to combat's
   * own tempo. M70.54-58 tried keeping ONE extra warm instance alive
   * alongside the real, disposable ones; that did not survive contact with
   * a real fight (confirmed live, twice), which is the same lesson
   * `lightPool.ts` already learned the first time: the fix is to never
   * create or destroy the resource at all, not to keep a decoy breathing
   * next to the ones that still churn.
   *
   * Sized generously rather than exactly — a missed flash on the rare
   * overflow frame is a cosmetic nothing; the alternative (falling back to
   * `new THREE.MeshBasicMaterial()`) would reintroduce the exact bug this
   * pool exists to remove, for whichever hit happened to be the 25th.
   */
  private readonly materialPool: THREE.MeshBasicMaterial[] = [];
  private readonly freeMaterials: THREE.MeshBasicMaterial[] = [];
  private static readonly POOL_SIZE = 32;

  /** Fills the pool and uploads/compiles it — called once, off-screen,
   *  alongside `SkillFx.prewarm`/`Projectiles.prewarm`. */
  prewarm(world: { warmUp(o: THREE.Object3D): Promise<void>; warmBuffers(o: THREE.Object3D, label?: string): void }): void {
    const group = new THREE.Group();
    for (let i = 0; i < Effects.POOL_SIZE; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: this.base,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      });
      this.materialPool.push(material);
      this.freeMaterials.push(material);
      group.add(new THREE.Mesh(this.geometry, material));
    }
    void world.warmUp(group).then(() => world.warmBuffers(group, "effects"));
  }

  /**
   * Play one of every effect, off in the dark, so the FIRST one a player sees
   * is not the one that compiles it.
   *
   * The pool above warms the materials this file BUILDS, and that turned out
   * not to be the same set as the ones it USES: measured, pressing the attack
   * key for the first time in a session still created new programs on a
   * 1,999ms frame, and their cache keys differed from every warmed one in the
   * boolean block — `opaque` and `flipSided`, which is to say transparency and
   * winding that `play` sets and `prewarm` did not.
   * Rather than chase which flag it is a fourth time, this exercises the real
   * path. It is the same lesson M70.70 wrote down about warming a bare model
   * instead of a real `Actor`: "the set of programs a spawned monster actually
   * uses is not the set a bare model uses, and warming the bare one left the
   * real ones to compile at first sight anyway."
   * Played far below the world and reaped on the normal schedule, under the
   * loading screen where nothing is on screen to see them.
   */
  warmByPlaying(): void {
    for (const name of Object.keys(FX_ROW) as EffectName[]) {
      this.play(name, 0, -400, 0, { scale: 0.01 });
    }
  }

  play(name: EffectName, x: number, y: number, z: number, opts: EffectOptions = {}): void {
    const row = FX_ROW[name];
    const texture = this.base.clone();
    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1 / FX_COLS, 1 / FX_ROWS);

    // Borrowed rather than built: see `materialPool`'s own comment. A pool
    // this size running dry means over thirty hits are mid-flash at once,
    // which is a busier fight than this game's own aggro caps allow —
    // dropping the flash silently is the right failure, the same call
    // `lightPool.ts` makes when its own pool is exhausted.
    const material = this.freeMaterials.pop();
    if (!material) return;
    material.map = texture;
    material.color.set(opts.tint ?? 0xffffff);
    material.opacity = 1;

    const mesh = new THREE.Mesh(this.geometry, material);
    const scale = opts.scale ?? 1.6;
    mesh.scale.setScalar(scale);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 10;
    this.scene.add(mesh);

    this.live.push({
      mesh,
      material,
      texture,
      row,
      startedAt: performance.now(),
      durationMs: opts.durationMs ?? 460,
      from: opts.from?.clone(),
      to: opts.from ? new THREE.Vector3(x, y, z) : undefined,
      spin: opts.spin ?? 0,
    });
  }

  /** A short, sharp camera kick. Crits and heavy landings use it. */
  shake(amount = 0.12, durationMs = 180): void {
    this.shakeUntil = Math.max(this.shakeUntil, performance.now() + durationMs);
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Current shake offset; add to the camera position after positioning it. */
  shakeOffset(out: THREE.Vector3): THREE.Vector3 {
    const now = performance.now();
    if (now >= this.shakeUntil) {
      this.shakeAmount = 0;
      return out.set(0, 0, 0);
    }
    const a = this.shakeAmount;
    return out.set((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a);
  }

  update(camera: THREE.Camera): void {
    const now = performance.now();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const fx = this.live[i];
      const t = (now - fx.startedAt) / fx.durationMs;

      if (t >= 1) {
        this.scene.remove(fx.mesh);
        // Handed back to the pool rather than disposed — see
        // `materialPool`'s own comment. The texture is still disposed:
        // it is a fresh clone every `play()`, cheap, and swapping which
        // one a pooled material's `.map` points to costs nothing to the
        // compiled program either way (`map` presence is the define, not
        // the texture's identity).
        this.freeMaterials.push(fx.material);
        fx.texture.dispose();
        this.live.splice(i, 1);
        continue;
      }

      // Step the atlas cell. Frames advance across the row.
      const frame = Math.min(FX_COLS - 1, Math.floor(t * FX_COLS));
      fx.texture.offset.set(frame / FX_COLS, 1 - (fx.row + 1) / FX_ROWS);

      // Projectiles travel; everything else stays put.
      if (fx.from && fx.to) fx.mesh.position.lerpVectors(fx.from, fx.to, t);

      // Fade out over the back half so effects do not simply vanish.
      fx.material.opacity = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;

      if (fx.spin) fx.mesh.rotation.z += fx.spin;
      else fx.mesh.quaternion.copy(camera.quaternion); // billboard
      if (fx.spin) {
        // Still face the camera, but keep the roll the spin is producing.
        const roll = fx.mesh.rotation.z;
        fx.mesh.quaternion.copy(camera.quaternion);
        fx.mesh.rotateZ(roll);
      }
    }
  }

  dispose(): void {
    for (const fx of this.live) {
      this.scene.remove(fx.mesh);
      fx.texture.dispose();
    }
    this.live.length = 0;
    // The whole pool, not just what was active — `freeMaterials` holds the
    // rest, and skipping them here would leak exactly what pooling was
    // supposed to stop leaking.
    for (const m of this.materialPool) m.dispose();
    this.materialPool.length = 0;
    this.freeMaterials.length = 0;
    this.geometry.dispose();
    this.base.dispose();
  }
}
