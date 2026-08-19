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
  /** Beams hold still and fade; arrows travel. */
  kind: "arrow" | "beam";
  materials: THREE.Material[];
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
      const trail = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, ARROW_LENGTH_UNITS * 1.5),
        new THREE.MeshBasicMaterial({
          color: 0xffe6a8,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      trail.position.z = -ARROW_LENGTH_UNITS * 0.85;

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
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, length),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.16, length),
    new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
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
        for (const m of p.materials) m.dispose();
        this.live.splice(i, 1);
        continue;
      }
      if (p.kind === "arrow") {
        p.object.position.lerpVectors(p.from, p.to, t);
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
      for (const m of p.materials) m.dispose();
    }
    this.live.length = 0;
  }
}
