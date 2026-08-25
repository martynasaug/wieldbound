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
   * Kept alive for the life of this object — same reasoning as
   * `SkillFx.warmed`/`Projectiles.warmed`, and the most important instance
   * of it: `play()` is the hit-impact flash, which fires on every landed
   * swing in the game, far more often than any single skill. Every one of
   * its materials is disposed the moment its ~460ms lifetime ends
   * (`update()`), and three.js deletes a compiled program the instant the
   * last material referencing its cache key is disposed — so a fight with
   * any gap between hits cycles this program compiled/destroyed/compiled
   * again, which is exactly the oscillation the F3 diagnostic caught live.
   */
  private warmed: THREE.Mesh | null = null;

  /** Uploads and compiles the one material shape `play()` ever builds — see
   *  `warmed`'s own comment for why keeping the material referenced matters
   *  as much as compiling it once. Called once, off-screen, alongside
   *  `SkillFx.prewarm`/`Projectiles.prewarm`. */
  prewarm(world: { warmUp(o: THREE.Object3D): Promise<void>; warmBuffers(o: THREE.Object3D, label?: string): void }): void {
    const material = new THREE.MeshBasicMaterial({
      map: this.base,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(this.geometry, material);
    this.warmed = mesh;
    void world.warmUp(mesh).then(() => world.warmBuffers(mesh, "effects"));
  }

  play(name: EffectName, x: number, y: number, z: number, opts: EffectOptions = {}): void {
    const row = FX_ROW[name];
    const texture = this.base.clone();
    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1 / FX_COLS, 1 / FX_ROWS);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      color: opts.tint ?? 0xffffff,
      // Every sibling combat/skill effect (attacks.ts, skillfx.ts) disables
      // fog for the same stated reason — "a spell is exactly the thing that
      // should stay legible at range" — and this is the same kind of thing,
      // just missed when this file was written first. Left on, this also
      // meant every hit-impact flash (the single most frequent effect in
      // the game — one per swing, not per cast) compiled a DIFFERENT
      // program from every other combat effect for no visual reason.
      fog: false,
    });

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
        fx.material.dispose();
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
      fx.material.dispose();
      fx.texture.dispose();
    }
    this.live.length = 0;
    this.geometry.dispose();
    this.base.dispose();
  }
}
