// Loot on the ground.
//
// A kill used to put an item straight into the bag and a line in the combat log.
// That is the one moment an item system has the player's whole attention, and it
// was spending it on text — while the item's model, the thing the whole
// catalogue exists to show, went unseen until the bag was opened.
//
// So a drop is a real object in the world now: the item's own mesh where the
// monster fell, turning slowly, on a disc of its quality's colour, with a beam
// for the two qualities that earn one. Walk over it and it is yours.
//
// Three things are worth stating about how it is drawn:
//
//   IT REUSES THE HELD MESH. `buildHeldItem` already fits every weapon in the
//   catalogue into a grip; the same call gives a drop its model, so a Bloodclaim
//   Claymore on the ground is the same object you will be holding a second
//   later. Nothing here knows how to build a weapon.
//
//   THINGS WITH NO MODEL GET A POUCH. A ring is invisible and armour is a
//   procedural shape authored against a body, so neither can lie on grass.
//   Rather than inventing a second art path for them, they drop as a pouch —
//   which is also honest about what picking one up is like.
//
//   THE LABEL IS THE ITEM'S NAME, IN ITS COLOUR. Drops are the one place a
//   player reads a quality at a distance, so the plate carries the same colour
//   the bag slot will.

import * as THREE from "three";
import {
  RARITIES,
  type DroppedItemState,
  type ItemRarity,
} from "../../../shared/protocol-types";
import { itemBase } from "../../../shared/items";
import { buildHeldItem } from "./gear";
import { instantiate } from "./assets";

/** Turn rate, in radians per second. Slow enough to read the silhouette. */
const SPIN = 0.9;
/** How far off the ground the item floats, and how far it bobs. */
const HOVER = 0.55;
const BOB = 0.09;

/** Shared across every disc/beam a drop ever gets — one buffer upload each,
 *  ever, the same reasoning `BOLT_TRAIL_GEO` already applies one file over. */
const DISC_GEO = new THREE.CircleGeometry(0.42, 20);
const BEAM_GEO = new THREE.CylinderGeometry(0.16, 0.3, 3.2, 8, 1, true);

interface DropVisual {
  root: THREE.Group;
  /** Carries the model, so the spin does not fight the bob. */
  pivot: THREE.Group;
  /** `null` only when the disc pool was exhausted — the drop still exists
   *  and is still pickable, just without its ground marker for as long as
   *  every slot stays busy. */
  disc: THREE.Mesh | null;
  beam: THREE.Mesh | null;
  /** Seeded from the id, so two drops side by side are not in lockstep — the
   *  same argument the monster idles make. */
  phase: number;
  expiresAt: number;
}

export class Drops {
  private readonly visuals = new Map<string, DropVisual>();
  private readonly seen = new Set<string>();
  /**
   * Fixed pools, never disposed — the same fix `effects.ts`/`attacks.ts`/
   * `skillfx.ts` were given after their own "keep one warm decoy
   * referenced" attempt (this file's own former `warmed` array, the exact
   * pattern all three of them started with too) was confirmed live not to
   * survive contact with a real session — `[dispose-trace]` stack traces
   * landed here, at `Drops.dispose` (`drops.ts:245`), after every other
   * known file had already been converted to a real pool. `disc` is sized
   * well past `beam`: every drop gets a disc, only the top two qualities
   * glow.
   */
  private static readonly DISC_POOL_SIZE = 32;
  private static readonly BEAM_POOL_SIZE = 12;
  private readonly discPool: THREE.MeshBasicMaterial[] = [];
  private readonly beamPool: THREE.MeshBasicMaterial[] = [];
  private readonly freeDiscs: THREE.MeshBasicMaterial[] = [];
  private readonly freeBeams: THREE.MeshBasicMaterial[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Kept from `prewarm` so `create` can warm a DROPPED MODEL before it is
   * parented — see the note there. Optional only because `prewarm` is a
   * separate call from the constructor: a Drops that was never prewarmed
   * still works, it just pays the compile inline the way it always did.
   */
  private warmer: {
    warmUp(o: THREE.Object3D): Promise<void>;
    warmBuffers(o: THREE.Object3D, label?: string): void;
  } | null = null;

  /** Fills both pools and uploads/compiles what they hold. Called once,
   *  off-screen, alongside `SkillFx.prewarm` and its siblings. */
  prewarm(world: { warmUp(o: THREE.Object3D): Promise<void>; warmBuffers(o: THREE.Object3D, label?: string): void }): void {
    this.warmer = world;
    const group = new THREE.Group();
    for (let i = 0; i < Drops.DISC_POOL_SIZE; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, depthWrite: false });
      this.discPool.push(m);
      this.freeDiscs.push(m);
      group.add(new THREE.Mesh(DISC_GEO, m));
    }
    for (let i = 0; i < Drops.BEAM_POOL_SIZE; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.beamPool.push(m);
      this.freeBeams.push(m);
      group.add(new THREE.Mesh(BEAM_GEO, m));
    }
    void world.warmUp(group).then(() => world.warmBuffers(group, "drops"));
  }

  /**
   * Reconciles against the snapshot: adds what is new, removes what is gone.
   *
   * `toWorld` converts server pixels to world units — passed in rather than
   * imported so this file, like the rest of the renderer's parts, does not need
   * to know the world's scale.
   */
  sync(
    drops: DroppedItemState[],
    // Carries the ground height now, because loot lands on hills. The whole
    // visual — the disc under it, the bob, the beam — is anchored off `root`,
    // so putting the root on the ground moves all three.
    toWorld: (x: number, y: number) => { x: number; y: number; z: number },
  ): void {
    this.seen.clear();
    for (const drop of drops) {
      this.seen.add(drop.id);
      let vis = this.visuals.get(drop.id);
      if (!vis) {
        vis = this.create(drop);
        this.visuals.set(drop.id, vis);
      }
      const p = toWorld(drop.x, drop.y);
      vis.root.position.set(p.x, p.y, p.z);
      vis.expiresAt = drop.expiresAt;
    }
    for (const [id, vis] of this.visuals) {
      if (this.seen.has(id)) continue;
      this.dispose(vis);
      this.visuals.delete(id);
    }
  }

  private create(drop: DroppedItemState): DropVisual {
    const base = itemBase(drop.item.baseId);
    const colour = new THREE.Color(qualityColour(drop.item.rarity));

    const root = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.position.y = HOVER;
    root.add(pivot);

    // The disc on the ground is what makes a drop findable in long grass — the
    // model itself is small and the grass is not. Borrowed from the pool
    // rather than built fresh — see `discPool`'s own comment — with colour
    // and opacity reset, since a pooled material carries whatever its last
    // use faded it to.
    let disc: THREE.Mesh | null = null;
    const discMat = this.freeDiscs.pop();
    if (discMat) {
      discMat.color.copy(colour);
      discMat.opacity = 0.34;
      disc = new THREE.Mesh(DISC_GEO, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.02;
      root.add(disc);
    }

    // A beam for the top two qualities only. One that everything has is one
    // that says nothing — the same rule the nameplates and the mesh tint keep.
    let beam: THREE.Mesh | null = null;
    if (glows(drop.item.rarity)) {
      const beamMat = this.freeBeams.pop();
      if (beamMat) {
        beamMat.color.copy(colour);
        beamMat.opacity = 0.16;
        beam = new THREE.Mesh(BEAM_GEO, beamMat);
        beam.position.y = 1.6;
        root.add(beam);
      }
    }

    this.scene.add(root);

    // The model, asynchronously. Weapons and off-hands have one; everything
    // else drops as a pouch.
    const wants = base.slot === "weapon" || base.slot === "offhand";
    if (wants) {
      void buildHeldItem(base.id, drop.item.rarity).then(async (held) => {
        if (!held || !root.parent) return;
        // COMPILED BEFORE IT IS PARENTED, never after. A weapon model is a
        // `MeshStandardMaterial` — the `physical` program, which is the
        // biggest shader in the game and takes roughly half a second to
        // translate and link on ANGLE/D3D11. Parenting it first and letting
        // the next frame compile it inline is exactly what the F3
        // `[programs]` diagnostic caught red-handed: two `physical` programs
        // appearing in the same millisecond as a 1058ms frame whose whole
        // cost was `render`, during a fight, with loot on the ground. Actors
        // and their gear were given this treatment in M70.40/M70.70; drops
        // are the same shape of bug and were simply missed.
        await this.warmer?.warmUp(held.object);
        if (!root.parent) return; // picked up or expired while compiling
        // The grip transform places it in a hand; on the ground it wants to be
        // centred on its own middle instead, so it turns about itself rather
        // than swinging around a point off to one side.
        const box = new THREE.Box3().setFromObject(held.object);
        const centre = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        held.object.position.sub(centre);
        const wrap = new THREE.Group();
        wrap.add(held.object);
        // Laid over rather than stood upright: a two-metre claymore standing on
        // the grass reads as scenery, not as loot.
        wrap.rotation.z = Math.PI / 2.4;
        const longest = Math.max(size.x, size.y, size.z) || 1;
        wrap.scale.setScalar(Math.min(1, 1.1 / longest));
        pivot.add(wrap);
      });
    } else {
      // The extension is load-bearing: `loadModel` picks the parser from it, and
      // an extensionless name falls through to the FBX loader.
      void instantiate("props/Pouch_Large.gltf", 0.5).then(async (inst) => {
        if (!root.parent) return;
        inst.object.position.y = -0.25;
        // Materials are CLONED, because `instantiate` shares them with the
        // cached prototype and `dispose` below frees everything this object
        // owns. Without the clone the first pouch to be picked up disposes the
        // material every later pouch is still pointing at. `buildHeldItem`
        // already clones for the same reason; this is the path that did not.
        inst.object.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map((m) => m.clone())
            : mesh.material.clone();
        });
        // Warmed AFTER the clone, not before: a clone is a different material
        // object, and three.js keys its program cache on the material's own
        // parameters — so warming the prototype and then swapping in a fresh
        // clone would compile the right shader for the wrong object and still
        // stall on the first real frame. See the held-item path above.
        await this.warmer?.warmUp(inst.object);
        if (!root.parent) return; // picked up or expired while compiling
        pivot.add(inst.object);
      });
    }

    return { root, pivot, disc, beam, phase: hash(drop.id) % 1000 / 1000, expiresAt: drop.expiresAt };
  }

  /** Turns and bobs everything, and fades what is about to vanish. */
  update(nowMs: number): void {
    const t = nowMs / 1000;
    for (const vis of this.visuals.values()) {
      const phase = vis.phase * Math.PI * 2;
      vis.pivot.rotation.y = t * SPIN + phase;
      vis.pivot.position.y = HOVER + Math.sin(t * 1.6 + phase) * BOB;

      // A drop that popped out of existence would look like a bug; one that
      // fades has visibly run out of time.
      const left = vis.expiresAt - nowMs;
      const fade = left < 6000 ? Math.max(0, left / 6000) : 1;
      if (vis.disc) (vis.disc.material as THREE.MeshBasicMaterial).opacity = 0.34 * fade;
      if (vis.beam) (vis.beam.material as THREE.MeshBasicMaterial).opacity = 0.16 * fade;
      vis.pivot.visible = fade > 0.05 || Math.floor(t * 8) % 2 === 0;
    }
  }

  clear(): void {
    for (const vis of this.visuals.values()) this.dispose(vis);
    this.visuals.clear();
  }

  private dispose(vis: DropVisual): void {
    vis.root.removeFromParent();
    vis.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The disc/beam materials are POOLED, not owned by this drop — see
      // `discPool`'s own comment — and are returned below instead of
      // disposed here. Everything else (the held-item/pouch clone) is
      // still this drop's own, same as before. Geometry is shared with the
      // cached prototype for anything instantiated, so only materials are
      // ever freed here — the same rule `Actor.dispose` keeps.
      if (mesh === vis.disc || mesh === vis.beam) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    });
    if (vis.disc) this.freeDiscs.push(vis.disc.material as THREE.MeshBasicMaterial);
    if (vis.beam) this.freeBeams.push(vis.beam.material as THREE.MeshBasicMaterial);
  }

  /** Disposes the pools themselves — everything `dispose(vis)` above hands
   *  back stays claimed by this object until this runs, same as every
   *  sibling pool's own teardown. */
  disposeAll(): void {
    for (const pool of [this.discPool, this.beamPool]) {
      for (const m of pool) m.dispose();
      pool.length = 0;
    }
    this.freeDiscs.length = 0;
    this.freeBeams.length = 0;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function qualityColour(rarity: ItemRarity): string {
  return RARITIES[rarity]?.color ?? RARITIES.honed.color;
}
function glows(rarity: ItemRarity): boolean {
  return !!RARITIES[rarity]?.glow;
}
