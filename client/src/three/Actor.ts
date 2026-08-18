// One animated character in the world — the local player, a remote player, or
// a monster. Wraps a loaded model with an animation state machine, smoothed
// movement and a weapon socket.

import * as THREE from "three";
import { instantiate, findNode, findClip, type Instance } from "./assets";

export type ActorAnim = "idle" | "run" | "attack" | "hit" | "die";

// Which clips satisfy each state, best first. Different packs name things
// differently, so this is a preference list rather than an exact mapping —
// `findClip` falls back to a loose match before giving up.
const CLIP_PREFERENCES: Record<ActorAnim, string[]> = {
  idle: ["Idle_Weapon", "Idle", "Idle2", "Flying"],
  run: ["Run_Weapon", "Run", "Walk", "Flying"],
  attack: ["Sword_Attack", "Attack", "Punch", "Bite", "Sword_AttackFast"],
  hit: ["RecieveHit", "ReceiveHit", "Hit", "Damage"],
  die: ["Death", "Die"],
};

const FADE_MS = 180;

export interface ActorOptions {
  model: string;
  height: number;
  /** Radians to add so the model faces +Z when facing is 0. */
  facingOffset?: number;
}

export class Actor {
  /** Positioned at the actor's world location; add this to the scene. */
  readonly root = new THREE.Group();
  /** Carries rotation so the model's own orientation offset stays separate. */
  private readonly pivot = new THREE.Group();

  private instance: Instance | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ActorAnim, THREE.AnimationAction>();
  private currentAnim: ActorAnim = "idle";
  /** While set, a one-shot (attack/hit) owns the pose and update() will not override it. */
  private oneShotUntil = 0;
  private baseAnim: ActorAnim = "idle";

  private facing = 0;
  private targetFacing = 0;
  private readonly facingOffset: number;

  /** Where the server says this actor is. Rendered position eases toward it. */
  private readonly target = new THREE.Vector3();
  private snapped = false;

  weaponSocket: THREE.Object3D | null = null;
  ready = false;

  constructor(private readonly options: ActorOptions) {
    this.facingOffset = options.facingOffset ?? 0;
    this.root.add(this.pivot);
  }

  async load(): Promise<void> {
    const instance = await instantiate(this.options.model, this.options.height);
    this.instance = instance;
    this.pivot.add(instance.object);

    this.mixer = new THREE.AnimationMixer(instance.object);
    for (const [anim, preferences] of Object.entries(CLIP_PREFERENCES) as [ActorAnim, string[]][]) {
      const clip = findClip(instance.animations, ...preferences);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (anim === "attack" || anim === "hit" || anim === "die") {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(anim, action);
    }

    // The rig ships a dedicated weapon socket; the weapon is already parented
    // to it. That makes "class is what you hold" a mesh swap on one bone.
    this.weaponSocket =
      findNode(instance.object, "^weaponr$") ??
      findNode(instance.object, "^weapon\\.r$") ??
      findNode(instance.object, "^weapon");

    this.ready = true;
    this.play("idle", true);
  }

  /** True once the model has loaded and can be posed. */
  get loaded(): boolean {
    return this.ready;
  }

  get scale(): number {
    return this.instance?.scale ?? 1;
  }

  setTargetPosition(x: number, y: number, z: number): void {
    this.target.set(x, y, z);
    if (!this.snapped) {
      this.root.position.copy(this.target);
      this.snapped = true;
    }
  }

  /** Teleport with no easing — for respawns, where easing would read as a glide. */
  snapTo(x: number, y: number, z: number): void {
    this.target.set(x, y, z);
    this.root.position.copy(this.target);
    this.snapped = true;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  faceToward(x: number, z: number): void {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.targetFacing = Math.atan2(dx, dz);
  }

  faceDirection(dx: number, dz: number): void {
    if (dx * dx + dz * dz < 1e-6) return;
    this.targetFacing = Math.atan2(dx, dz);
  }

  /**
   * Switches animation state. One-shots (attack/hit/die) hold the pose for their
   * clip duration and then hand control back to whatever the base state is.
   */
  play(anim: ActorAnim, immediate = false): void {
    if (!this.mixer) return;
    if (anim === "idle" || anim === "run") {
      this.baseAnim = anim;
      // Do not interrupt a swing that is still playing.
      if (performance.now() < this.oneShotUntil) return;
    }
    if (this.currentAnim === anim && !immediate) return;

    const next = this.actions.get(anim);
    if (!next) return;
    const prev = this.actions.get(this.currentAnim);

    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, FADE_MS / 1000, false);
    } else if (!immediate) {
      next.fadeIn(FADE_MS / 1000);
    }

    this.currentAnim = anim;
    if (anim === "attack" || anim === "hit") {
      const clip = next.getClip();
      this.oneShotUntil = performance.now() + clip.duration * 1000;
    } else if (anim === "die") {
      this.oneShotUntil = Number.MAX_SAFE_INTEGER;
    } else {
      this.oneShotUntil = 0;
    }
  }

  /** Cancels a death pose so a respawned monster animates again. */
  revive(): void {
    this.oneShotUntil = 0;
    this.actions.get("die")?.stop();
    this.play("idle", true);
  }

  update(dtSeconds: number): void {
    this.mixer?.update(dtSeconds);

    // Ease toward the server position. Snapshots arrive every ~100ms, so without
    // this every actor visibly steps rather than moves.
    const p = this.root.position;
    const lerp = Math.min(1, dtSeconds * 12);
    p.x += (this.target.x - p.x) * lerp;
    p.y += (this.target.y - p.y) * lerp;
    p.z += (this.target.z - p.z) * lerp;

    // Shortest-path turn, so facing never spins the long way round.
    let delta = this.targetFacing - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.facing += delta * Math.min(1, dtSeconds * 14);
    this.pivot.rotation.y = this.facing + this.facingOffset;

    // Hand control back to idle/run once a one-shot has finished.
    if (this.oneShotUntil !== Number.MAX_SAFE_INTEGER && performance.now() >= this.oneShotUntil) {
      if (this.currentAnim === "attack" || this.currentAnim === "hit") {
        this.oneShotUntil = 0;
        this.play(this.baseAnim, false);
      }
    }
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
    this.instance?.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
    });
  }
}
