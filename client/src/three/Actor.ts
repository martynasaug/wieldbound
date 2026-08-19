// One animated character in the world — the local player, a remote player, or
// a monster. Wraps a loaded model with an animation state machine, smoothed
// movement, a weapon socket and a set of gear attachments.
//
// Players differ from monsters in one way: their model is not fixed. Class is
// whatever weapon is in hand and the body follows the class, so `setAppearance`
// may swap the entire rig mid-fight. Everything an actor owns that is *not* the
// model — world position, facing, animation state, chill — survives that swap,
// because from the game's point of view nothing happened except a change of
// clothes.

import * as THREE from "three";
import {
  appearanceClass,
  type Appearance,
  type GearStyle,
  type ItemRarity,
  type ItemSlot,
} from "../../../shared/protocol-types";
import { instantiate, findNode, findClip, type Instance } from "./assets";
import { BUILTIN_WEAPON_MESHES, CLASS_BODIES, buildArmour, buildWeapon } from "./gear";

export type ActorAnim = "idle" | "run" | "attack" | "hit" | "die";

// Which clips satisfy each state, best first. Different packs name things
// differently, so this is a preference list rather than an exact mapping —
// `findClip` falls back to a loose match before giving up.
const CLIP_PREFERENCES: Record<ActorAnim, string[]> = {
  idle: ["Idle_Weapon", "Idle", "Idle2", "Flying_Idle", "Flying"],
  run: ["Run_Weapon", "Run", "Walk", "Fly", "Flying"],
  // The class bodies each name their attack after their weapon, and the
  // generic entries below them are a trap: a loose match for "Attack" finds
  // `Idle_Attacking` on the Wizard and `Attacking_Idle` on the Rogue, so a mage
  // would cast by standing still. `findClip` tries every exact name before any
  // loose one, which is what makes listing them here enough.
  attack: [
    "Sword_Attack", "Staff_Attack", "Bow_Attack_Shoot", "Dagger_Attack", "Attack",
    "Punch", "Bite", "Headbutt", "Sword_AttackFast",
  ],
  hit: ["RecieveHit", "HitReact", "ReceiveHit", "Hit", "Damage"],
  die: ["Death", "Die"],
};

const FADE_MS = 180;

export interface ActorOptions {
  model: string;
  height: number;
  /** Radians to add so the model faces +Z when facing is 0. */
  facingOffset?: number;
  /**
   * Ease toward the target position instead of tracking it exactly.
   *
   * Right for anything driven by snapshots — they arrive every ~100ms and
   * without smoothing every remote actor visibly steps rather than moves.
   * Wrong for the local player, whose position is recomputed exactly every
   * frame: there the easing is pure lag, so the model trails its own true
   * position and keeps gliding after the key is released, while the animation
   * has already gone back to idle. That is ice-skating, and it is not a
   * cosmetic problem — the model stops agreeing with the position everything
   * else in the game is measured from.
   */
  interpolate?: boolean;
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
  private readonly interpolate: boolean;

  /** Where the server says this actor is. Rendered position eases toward it. */
  private readonly target = new THREE.Vector3();
  private snapped = false;

  weaponSocket: THREE.Object3D | null = null;
  ready = false;

  /** Every bone on the current rig, by name — gear rides these. */
  private readonly bones = new Map<string, THREE.Object3D>();
  /** Per-bone groups whose world transform equals the model's rest frame, so
   *  gear can be authored in rig coordinates. Rebuilt with the body. */
  private readonly holders = new Map<string, THREE.Object3D>();
  /** The model's world matrix in its rest pose, which the holders undo. */
  private restFrame = new THREE.Matrix4();
  /** Each bone's world matrix in the rest pose, captured while the rig is
   *  still unanimated. Holders are built lazily — the first time a style
   *  needs a given bone — and by then the skeleton is mid-stride, so reading
   *  `bone.matrixWorld` at that moment would peg the gear to whatever pose the
   *  character happened to be in when the item was equipped. */
  private readonly restBoneMatrices = new Map<string, THREE.Matrix4>();

  /** Which body model is currently built, so a re-equip that does not change
   *  class does not needlessly rebuild the rig. */
  private bodyModel: string;
  private held: THREE.Object3D | null = null;
  private worn: THREE.Object3D[] = [];
  private appearance: Appearance | null = null;
  /** Bumped on every appearance change, so a slower earlier load cannot land
   *  after a faster later one and dress the character in the wrong gear. */
  private dressGeneration = 0;
  /** The same guard one level up. Swapping from a staff to a sword and back
   *  faster than an FBX parses would otherwise leave whichever rig happened
   *  to finish last on screen, regardless of what is actually held. */
  private bodyRequest = 0;

  // Emissive is used for two signals that must not fight each other: a brief
  // white/gold flash when something lands a hit, and a persistent blue while
  // chilled. Flash wins while it runs, then the chill (or nothing) resumes.
  private litMaterials: { mat: THREE.MeshStandardMaterial; base: number }[] = [];
  private flashUntil = 0;
  private flashColor = 0xffffff;
  private chilled = false;
  private emissiveApplied = -1;
  /** Every material this actor owns and must free. All of them are owned: see
   *  the clone in `buildBody`. */
  private ownedMaterials = new Set<THREE.Material>();

  constructor(private readonly options: ActorOptions) {
    this.facingOffset = options.facingOffset ?? 0;
    this.interpolate = options.interpolate ?? true;
    this.bodyModel = options.model;
    this.root.add(this.pivot);
  }

  async load(): Promise<void> {
    await this.buildBody(this.bodyModel);
    this.ready = true;
    this.play("idle", true);
  }

  /**
   * Builds (or rebuilds) the rig. Animation state is deliberately not reset
   * here: a body swap should look like a change of clothes, not a respawn.
   */
  private async buildBody(model: string): Promise<void> {
    const request = ++this.bodyRequest;
    const instance = await instantiate(model, this.options.height);
    if (request !== this.bodyRequest) return; // a later swap overtook this one

    if (this.instance) {
      this.clearGear();
      this.pivot.remove(this.instance.object);
      this.mixer?.stopAllAction();
      for (const m of this.ownedMaterials) m.dispose();
    }
    this.instance = instance;
    this.bodyModel = model;
    this.pivot.add(instance.object);

    this.bones.clear();
    this.holders.clear();
    this.actions.clear();
    this.litMaterials = [];
    this.ownedMaterials = new Set();

    // Every body ships its own weapon parented into the rig. Left in place, a
    // ranger with a sword would carry both — so the baked-in one always goes,
    // and the socket is filled explicitly from `Appearance` instead.
    const builtIn: THREE.Object3D[] = [];
    instance.object.traverse((o) => {
      if (BUILTIN_WEAPON_MESHES.has(o.name)) builtIn.push(o);
    });
    for (const o of builtIn) o.removeFromParent();

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

    // The rig ships a dedicated weapon socket; the weapon that was parented to
    // it is what makes "class is what you hold" a mesh swap on one bone.
    this.weaponSocket =
      findNode(instance.object, "^weaponr$") ??
      findNode(instance.object, "^weapon\\.r$") ??
      findNode(instance.object, "^weapon");

    instance.object.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // `SkeletonUtils.clone` shares materials with the cached prototype, so
      // without this every actor built from one model would share one emissive
      // channel: hitting a single wolf would flash the whole pack, and chilling
      // one would tint them all. Textures are still shared, being by reference.
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
      this.trackMesh(mesh);
    });

    // Holders are measured against the rest pose, which is why this runs here:
    // the model has just been loaded, no clip has played, and nothing has
    // awaited since `instantiate` returned, so the skeleton is still exactly as
    // the artist bound it.
    //
    // Do NOT reach for `Skeleton.pose()` to make that guarantee explicit. It
    // writes each root bone's *bind-space world* matrix into its *local*
    // matrix, and on this rig the root bone's parent is `CharacterArmature`,
    // a plain Group already carrying a scale of 100 — so the scale gets applied
    // twice and every bone comes out a hundred times too big. The gear rides
    // the bones, so it grows with them, which is how this was found.
    instance.object.updateMatrixWorld(true);
    this.restFrame.copy(instance.object.matrixWorld);
    this.restBoneMatrices.clear();
    for (const [name, bone] of this.bones) {
      this.restBoneMatrices.set(name, bone.matrixWorld.clone());
    }

    // The new rig has its own action map, so whatever was playing has to be
    // started again on it. Without this a body swap leaves the character
    // frozen in the bind pose — arms out sideways, weapon aimed at the
    // horizon — which reads as the weapon being attached wrong.
    this.currentAnim = "idle";
    this.oneShotUntil = 0;
    this.play(this.baseAnim, true);

    // Re-dress: the gear was hanging off the rig that just went away. The body
    // check inside will pass, because `bodyModel` is already the new one.
    if (this.appearance) this.applyAppearance(this.appearance);
  }

  /**
   * A group parented to `bone` whose world transform matches the model's own
   * rest frame. Gear added to it can therefore be authored in plain rig
   * coordinates — feet at y=0, top of the skull at y~290 — and still ride the
   * bone through every animation.
   */
  private holderFor(boneName: string): THREE.Object3D | null {
    const existing = this.holders.get(boneName);
    if (existing) return existing;
    const bone = this.bones.get(boneName);
    if (!bone) return null;

    const holder = new THREE.Group();
    holder.name = `rest_${boneName}`;
    bone.add(holder);
    // holder.matrixWorld == bone.matrixWorld * holder.matrix, and we want it to
    // equal the model's rest frame — so the local matrix is simply the bone's
    // rest transform undone. Whatever transform sits above the model cancels,
    // being present on both sides.
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(this.restBoneMatrices.get(boneName) ?? bone.matrixWorld)
      .invert()
      .multiply(this.restFrame);
    this.holders.set(boneName, holder);
    return holder;
  }

  /**
   * Dresses the character: body from the class, weapon in the socket, one gear
   * mesh set per equipped visible slot. Safe to call on every items update — an
   * unchanged appearance is dropped before any loading happens.
   */
  setAppearance(appearance: Appearance): void {
    if (this.appearance && sameAppearance(this.appearance, appearance)) return;
    this.appearance = appearance;
    if (!this.instance) return; // load() is in flight and will pick it up
    this.applyAppearance(appearance);
  }

  private applyAppearance(appearance: Appearance): void {
    const wantBody = CLASS_BODIES[appearanceClass(appearance)];
    if (wantBody !== this.bodyModel) {
      // Rebuilding re-enters this method once the new rig exists, at which
      // point `bodyModel` matches and the rest of the dressing runs.
      void this.buildBody(wantBody);
      return;
    }

    const generation = ++this.dressGeneration;
    this.clearGear();

    const weaponType = appearance.weaponType;
    if (weaponType) {
      void buildWeapon(weaponType, appearance.weaponRarity ?? "common").then((weapon) => {
        if (!weapon || generation !== this.dressGeneration) return;
        const socket = this.bones.get(weapon.bone) ?? this.weaponSocket;
        if (!socket) return;
        socket.add(weapon.object);
        this.held = weapon.object;
        this.trackMaterials(weapon.object);
      });
    }

    const layers = Object.entries(appearance.layers) as [
      ItemSlot,
      { style: GearStyle; rarity: ItemRarity } | undefined,
    ][];
    for (const [slot, layer] of layers) {
      if (!layer) continue;
      for (const piece of buildArmour(slot, layer.style, layer.rarity)) {
        const holder = this.holderFor(piece.bone);
        if (!holder) continue;
        holder.add(piece.object);
        this.worn.push(piece.object);
        this.trackMaterials(piece.object);
      }
    }
  }

  /** Registers an object's materials as this actor's own — they carry its
   *  rarity tint and its emissive state. Geometry is never registered: it is
   *  shared with every other character wearing the same look. */
  private trackMaterials(object: THREE.Object3D): void {
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.trackMesh(o as THREE.Mesh);
    });
  }

  private trackMesh(mesh: THREE.Mesh): void {
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      this.ownedMaterials.add(m);
      const std = m as THREE.MeshStandardMaterial;
      if (std.emissive) this.litMaterials.push({ mat: std, base: std.emissive.getHex() });
    }
    this.emissiveApplied = -1;
  }

  private clearGear(): void {
    for (const object of [this.held, ...this.worn]) {
      if (!object) continue;
      const mats = new Set<THREE.Material>();
      object.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mats.add(m);
      });
      object.removeFromParent();
      for (const m of mats) {
        m.dispose();
        this.ownedMaterials.delete(m);
      }
      this.litMaterials = this.litMaterials.filter((l) => !mats.has(l.mat));
    }
    this.held = null;
    this.worn = [];
  }

  /** Brief emissive pop when a hit lands. Gold for crits, white otherwise. */
  flash(color = 0xffffff, ms = 130): void {
    this.flashColor = color;
    this.flashUntil = performance.now() + ms;
  }

  /** Frost Nova and Poison Arrow both slow; the blue is what says it worked. */
  setChilled(chilled: boolean): void {
    this.chilled = chilled;
  }

  private applyEmissive(): void {
    const flashing = performance.now() < this.flashUntil;
    const want = flashing ? this.flashColor : this.chilled ? 0x2f6fa8 : -1;
    if (want === this.emissiveApplied) return;
    this.emissiveApplied = want;
    for (const { mat, base } of this.litMaterials) {
      mat.emissive.setHex(want === -1 ? base : want);
    }
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
    if (!this.snapped || !this.interpolate) {
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

  /**
   * Where a shot leaves this actor, in world space: the weapon socket if the
   * rig has one, otherwise chest height at the actor's feet.
   *
   * Reading the bone rather than assuming an offset is what puts an arrow on
   * the bow instead of in the archer's sternum — and it keeps tracking through
   * the draw animation, since the socket moves with the hand.
   */
  muzzlePosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.weaponSocket) {
      this.weaponSocket.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(this.weaponSocket.matrixWorld);
    }
    return out.set(this.root.position.x, this.root.position.y + 1.1, this.root.position.z);
  }

  /** Unit vector the actor is currently facing, in world XZ. Lets skills and
   *  dashes aim somewhere sensible when there is no target and no input. */
  facingVector(): { x: number; z: number } {
    return { x: Math.sin(this.facing), z: Math.cos(this.facing) };
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
      // A swing that is still playing normally owns the pose — letting idle
      // cut it short would mean most attacks were never seen through.
      //
      // Running is the exception, and it is the single biggest source of
      // sliding during combat: auto-attacks fire while you are moving, the
      // attack clip is around a second long, and for that whole second the
      // model held a planted swing pose while the character kept travelling.
      // Moving cancels the swing, which is also what it should mean.
      const busy = performance.now() < this.oneShotUntil;
      if (busy && anim === "idle") return;
      if (busy && this.currentAnim === "die") return;
      if (busy) this.oneShotUntil = 0;
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
    this.applyEmissive();

    // Ease toward the server position. Snapshots arrive every ~100ms, so without
    // this every actor visibly steps rather than moves. Skipped entirely for the
    // local player — see `interpolate`.
    if (this.interpolate) {
      const p = this.root.position;
      const lerp = Math.min(1, dtSeconds * 12);
      p.x += (this.target.x - p.x) * lerp;
      p.y += (this.target.y - p.y) * lerp;
      p.z += (this.target.z - p.z) * lerp;
    } else {
      this.root.position.copy(this.target);
    }

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
    this.clearGear();
    this.root.removeFromParent();
    for (const m of this.ownedMaterials) m.dispose();
    this.ownedMaterials.clear();
    // Geometry is deliberately NOT disposed: `SkeletonUtils.clone` shares it
    // with the cached prototype, so freeing it here would force every future
    // actor of the same model to re-upload its buffers — and monsters are torn
    // down and rebuilt constantly as the player walks past their camps.
  }
}

/** Cheap structural compare, so an ITEMS_UPDATE that only changed a ring does
 *  not rebuild a rig. */
function sameAppearance(a: Appearance, b: Appearance): boolean {
  if (a.weaponType !== b.weaponType || a.weaponRarity !== b.weaponRarity) return false;
  const slots = new Set<string>([...Object.keys(a.layers), ...Object.keys(b.layers)]);
  for (const slot of slots) {
    const x = a.layers[slot as ItemSlot];
    const y = b.layers[slot as ItemSlot];
    if (!x || !y) return false;
    if (x.style !== y.style || x.rarity !== y.rarity) return false;
  }
  return true;
}
