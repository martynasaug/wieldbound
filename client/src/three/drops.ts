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

interface DropVisual {
  root: THREE.Group;
  /** Carries the model, so the spin does not fight the bob. */
  pivot: THREE.Group;
  disc: THREE.Mesh;
  beam: THREE.Mesh | null;
  /** Seeded from the id, so two drops side by side are not in lockstep — the
   *  same argument the monster idles make. */
  phase: number;
  expiresAt: number;
}

export class Drops {
  private readonly visuals = new Map<string, DropVisual>();
  private readonly seen = new Set<string>();

  constructor(private readonly scene: THREE.Scene) {}

  /**
   * Reconciles against the snapshot: adds what is new, removes what is gone.
   *
   * `toWorld` converts server pixels to world units — passed in rather than
   * imported so this file, like the rest of the renderer's parts, does not need
   * to know the world's scale.
   */
  sync(
    drops: DroppedItemState[],
    toWorld: (x: number, y: number) => { x: number; z: number },
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
      vis.root.position.set(p.x, 0, p.z);
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
    // model itself is small and the grass is not.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    root.add(disc);

    // A beam for the top two qualities only. One that everything has is one
    // that says nothing — the same rule the nameplates and the mesh tint keep.
    let beam: THREE.Mesh | null = null;
    if (glows(drop.item.rarity)) {
      beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.3, 3.2, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      beam.position.y = 1.6;
      root.add(beam);
    }

    this.scene.add(root);

    // The model, asynchronously. Weapons and off-hands have one; everything
    // else drops as a pouch.
    const wants = base.slot === "weapon" || base.slot === "offhand";
    if (wants) {
      void buildHeldItem(base.id, drop.item.rarity).then((held) => {
        if (!held || !root.parent) return;
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
      void instantiate("props/Pouch_Large.gltf", 0.5).then((inst) => {
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
      (vis.disc.material as THREE.MeshBasicMaterial).opacity = 0.34 * fade;
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
      // Geometry is shared with the cached prototype for anything instantiated,
      // so only the materials this file created are freed — the same rule
      // `Actor.dispose` keeps, and for the same reason.
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    });
    vis.disc.geometry.dispose();
    vis.beam?.geometry.dispose();
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
