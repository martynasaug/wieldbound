// What gathering LOOKS like.
//
// Gathering is the loop this game opens with — the Herald's first instruction
// sends you to it — and until now the whole of it was a number going up. You
// walked to a tree, stood there, and about three seconds later "+2 wood"
// appeared over your head. Nothing in between: the character did not move, the
// tree did not react, and there was no way to tell a gather in progress from
// standing next to a tree doing nothing, which are genuinely different states
// and one of them pays.
//
// Worse, the three seconds are silently thrown away in two cases — you step out
// of range, or something walks into reach and the tick becomes a swing instead
// — and with no feedback at all a player has no way to learn that either
// happened. They just see a number not arrive.
//
// So this draws the act:
//
//   * a PROGRESS ARC on the ground around the node, filling as the gather runs.
//     It is the only honest answer to "is anything happening", and it is driven
//     off `GATHER_STATE` from the server rather than off a local guess, so when
//     the server abandons the gather the arc vanishes instead of filling to a
//     reward that never comes.
//   * BEATS: the character swings, and debris comes off the node, several times
//     across the gather rather than once at the end. A single effect on
//     completion would say "that finished" and this needs to say "this is
//     happening", which is a different sentence and needs repetition.
//   * a per-kind palette, because chopping, mining and picking are three
//     different acts and the game already draws three different nodes.
//
// THE ARC IS BUILT ONCE AND ANIMATED WITH `setDrawRange`.
//
// `GroundRing` in indicators.ts rebuilds its 128 vertices whenever it moves,
// and throttles that to 30Hz because sampling the terrain is expensive enough
// to have shown up as 6.3% of a combat frame. A progress arc changes every
// single frame by definition, so rebuilding on change would be the worst case
// of that same cost, every frame, for as long as a player gathers.
//
// It does not have to. A node does not move, and the ground under it does not
// change, so the ring's vertices are correct for the whole gather the moment
// they are built. Only how MUCH of it is drawn changes — which is the index
// draw range, and costs nothing. Vertices are built once per node.

import * as THREE from "three";
import type { ResourceNodeKind } from "../../../shared/protocol-types";
import { surfaceHeight } from "./World";
import type { SkillFx } from "./skillfx";

/** How the three kinds differ on screen. Chopping a tree, breaking a rock and
 *  stripping a bush are three acts, and the debris is the cheapest place to say
 *  so. Colours are the material coming off, not the node's own tint. */
// `recoil` is the peak lean in radians. A tree is tall and light enough to sway
// visibly; a boulder must barely move or it reads as unmoored; a bush is soft
// and rustles more than either.
const KIND_LOOK: Record<
  ResourceNodeKind,
  { debris: number; arc: number; count: number; speed: number; recoil: number }
> = {
  // Pale splintered wood, thrown hard — an axe bites and the chip leaves fast.
  tree: { debris: 0xb98a4e, arc: 0xd8a55f, count: 8, speed: 3.0, recoil: 0.055 },
  // Stone dust and grit: more pieces, slower, and duller than the wood.
  rock: { debris: 0x9d9a92, arc: 0xb8b2a4, count: 10, speed: 2.4, recoil: 0.018 },
  // Leaves. Few, slow, and they drift rather than fly, because picking is not
  // an impact — the beat here is a hand closing, not a tool landing.
  bush: { debris: 0x74ad4c, arc: 0x8fc45f, count: 5, speed: 1.5, recoil: 0.075 },
};

const SEGMENTS = 72;
/** How long one flinch takes to play out and settle. */
const RECOIL_MS = 340;
/** Where the arc sits relative to the node's footprint. Wide enough to read as
 *  belonging to the node rather than to the player standing at it. */
const ARC_RADIUS = 1.15;
const ARC_INNER = 0.86;
/** Off the ground by the same margin the other ground marks use. */
const LIFT = 0.05;

/**
 * The ring the progress is drawn on: a flat annulus conformed to the terrain,
 * drawn from the top clockwise, revealed by draw range.
 */
class ProgressArc {
  readonly mesh: THREE.Mesh;
  private readonly indexCount: number;

  constructor(color: number) {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array((SEGMENTS + 1) * 2 * 3);
    const attr = new THREE.BufferAttribute(verts, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", attr);

    // An OPEN strip, unlike `GroundRing`, which closes its loop with a modulo.
    // A closing quad on a partial arc joins the leading edge back to the start
    // across the middle of the circle, which draws a chord over the node.
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geo.setIndex(index);
    this.indexCount = index.length;

    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    geo.setDrawRange(0, 0);
  }

  get material(): THREE.MeshBasicMaterial {
    return this.mesh.material as THREE.MeshBasicMaterial;
  }

  /** Lay the ring around a node. Costs a terrain sample per segment, and is
   *  called once per gather rather than once per frame — see the header. */
  place(x: number, z: number): void {
    const attr = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i <= SEGMENTS; i++) {
      // From straight up (-Z) and clockwise, so a filling arc reads like a
      // clock face rather than starting from an arbitrary side.
      const a = -Math.PI / 2 + (i / SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const ix = x + cos * ARC_INNER;
      const iz = z + sin * ARC_INNER;
      const ox = x + cos * ARC_RADIUS;
      const oz = z + sin * ARC_RADIUS;
      // One sample for both edges: the band is 0.29 units against a terrain
      // quad of ~1.33, so both ends sit inside one quad and the second sample
      // would ask the same question twice. The same reasoning `GroundRing`
      // records for its own thin bands.
      const y = surfaceHeight(ix, iz) + LIFT;
      const o = i * 6;
      arr[o] = ix; arr[o + 1] = y; arr[o + 2] = iz;
      arr[o + 3] = ox; arr[o + 4] = y; arr[o + 5] = oz;
    }
    attr.needsUpdate = true;
  }

  /** The same ring on flat ground at a given height, for the warm-up: it must
   *  not call `surfaceHeight` at a point 400 units under the world, where the
   *  terrain field has nothing meaningful to say. */
  placeFlat(x: number, y: number, z: number): void {
    const attr = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = -Math.PI / 2 + (i / SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const o = i * 6;
      arr[o] = x + cos * ARC_INNER; arr[o + 1] = y; arr[o + 2] = z + sin * ARC_INNER;
      arr[o + 3] = x + cos * ARC_RADIUS; arr[o + 4] = y; arr[o + 5] = z + sin * ARC_RADIUS;
    }
    attr.needsUpdate = true;
  }

  /** How much of the ring is drawn, 0 to 1. Free — it moves an index range. */
  setProgress(k: number): void {
    const clamped = Math.max(0, Math.min(1, k));
    // Rounded to whole quads, because half a quad draws as a torn triangle.
    const quads = Math.floor(clamped * SEGMENTS);
    this.mesh.geometry.setDrawRange(0, quads * 6);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * Owns everything the player sees while gathering.
 *
 * Driven entirely by `GATHER_STATE`: `begin` when the server says a gather
 * started, `update` every frame, `end` when the server says it stopped. It
 * never infers a gather from proximity, which is the whole point — see the
 * header on `GatherStateMessage`.
 */
export class GatherFx {
  private readonly arcs = new Map<ResourceNodeKind, ProgressArc>();
  private current: {
    kind: ResourceNodeKind;
    x: number;
    y: number;
    z: number;
    /** Where the player stood when it began, so debris flies away from them. */
    awayX: number;
    awayZ: number;
    endsAt: number;
    durationMs: number;
    /** Beats already played, so each fires exactly once. */
    beatsDone: number;
    /**
     * The node's own object, so it can flinch when it is struck.
     *
     * Only the host group is touched, and only its rotation and scale. Its
     * POSITION is written every snapshot by `syncNodes` and animating that
     * would be a tug of war; the variant turn each node is given for variety
     * lives on the child mesh inside, so the group's own rotation is free.
     */
    obj: THREE.Object3D | null;
    /** When the last blow landed, for the recoil. */
    struckAt: number;
  } | null = null;

  /** How many times the character strikes across one gather. Three reads as
   *  work being done; one reads as a delay, and five at a three-second gather
   *  is a flurry rather than a chop. */
  private static readonly BEATS = 3;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly fx: SkillFx,
    /** Called on each beat, so the caller can swing the character and make a
     *  noise — this module owns the ground and the debris, not the actor. */
    private readonly onBeat: (kind: ResourceNodeKind, index: number) => void,
  ) {}

  /**
   * Build all three arcs and their materials under the loading screen.
   *
   * Otherwise the first tree, the first rock and the first bush each create a
   * material and compile its program the moment the player starts gathering —
   * three separate hitches, each landing exactly when the player is standing
   * still watching a thing they just started. This project has fixed that same
   * shape of fault repeatedly (`SkillFx.prewarm`, the monster keep-alive rigs),
   * and the cost of not repeating it here is one call.
   *
   * The geometry is placed far below the world rather than left unplaced: a
   * `warmUp` of vertices that are all zero is a degenerate mesh, and a
   * degenerate mesh is exactly the thing a driver is entitled to skip.
   */
  prewarm(world: {
    warmUp(o: THREE.Object3D): Promise<void>;
    warmBuffers(o: THREE.Object3D, label?: string): void;
  }): void {
    const group = new THREE.Group();
    for (const kind of Object.keys(KIND_LOOK) as ResourceNodeKind[]) {
      const arc = this.arcFor(kind);
      arc.placeFlat(0, -400, 0);
      arc.setProgress(1);
      group.add(new THREE.Mesh(arc.mesh.geometry, arc.material));
    }
    void world.warmUp(group).then(() => world.warmBuffers(group, "gatherfx"));
    // Left with a full draw range and hidden; `begin` re-places and re-reveals.
    this.hideAll();
  }

  private arcFor(kind: ResourceNodeKind): ProgressArc {
    let arc = this.arcs.get(kind);
    if (!arc) {
      arc = new ProgressArc(KIND_LOOK[kind].arc);
      this.scene.add(arc.mesh);
      this.arcs.set(kind, arc);
    }
    return arc;
  }

  /**
   * A gather has started (or its clock was refreshed) on this node.
   *
   * `readyInMs` is what the server says is left, not the full interval, so a
   * client that joins mid-gather — or one whose message was delayed — draws the
   * arc where it actually is rather than restarting it.
   */
  begin(
    kind: ResourceNodeKind,
    nodeX: number,
    nodeY: number,
    nodeZ: number,
    playerX: number,
    playerZ: number,
    readyInMs: number,
    intervalMs: number,
    obj: THREE.Object3D | null = null,
  ): void {
    const arc = this.arcFor(kind);
    const restart =
      !this.current || this.current.kind !== kind || this.current.x !== nodeX || this.current.z !== nodeZ;
    if (restart) {
      // The PREVIOUS node has to be put back before this one takes over, or
      // walking from one tree straight to the next leaves the first leaning for
      // the rest of the session. `end` covers the ordinary case; this covers
      // the one where a gather is replaced rather than finished.
      this.restore();
      this.hideAll();
      arc.place(nodeX, nodeZ);
    }
    arc.mesh.visible = true;
    this.current = {
      kind,
      x: nodeX,
      y: nodeY,
      z: nodeZ,
      awayX: nodeX - playerX,
      awayZ: nodeZ - playerZ,
      endsAt: performance.now() + readyInMs,
      durationMs: Math.max(1, intervalMs),
      // A refreshed clock on the same node is the NEXT gather, so its beats
      // start over. Keyed off the remaining time rather than assumed: a message
      // that arrives late must not replay beats already struck.
      beatsDone: restart ? 0 : this.beatsAt(readyInMs, intervalMs),
      obj,
      // Far enough back that no recoil is in flight on the first frame.
      struckAt: -1e9,
    };
  }

  /** How many beats should already have been struck with this much left. */
  private beatsAt(readyInMs: number, intervalMs: number): number {
    const done = 1 - readyInMs / Math.max(1, intervalMs);
    return Math.max(0, Math.min(GatherFx.BEATS, Math.floor(done * GatherFx.BEATS)));
  }

  /** The server says this player is not gathering. */
  end(): void {
    // PUT THE NODE BACK. A gather can end on any frame, including one where the
    // tree is mid-lean, and a node left tilted five degrees stays tilted for
    // the rest of the session — the group is only written by `syncNodes`, which
    // sets position and nothing else. Nobody would ever connect a subtly
    // crooked tree back to gathering.
    this.restore();
    this.current = null;
    this.hideAll();
  }

  private restore(): void {
    const obj = this.current?.obj;
    if (!obj) return;
    obj.rotation.x = 0;
    obj.rotation.z = 0;
    obj.scale.set(1, 1, 1);
  }

  private hideAll(): void {
    for (const arc of this.arcs.values()) {
      arc.mesh.visible = false;
      arc.setProgress(0);
    }
  }

  /** One flourish when the gather actually pays, so completion is distinct from
   *  the beats that led to it. Called by the caller on the wallet change, since
   *  that is the only place the game knows a gather SUCCEEDED. */
  celebrate(kind: ResourceNodeKind, x: number, y: number, z: number): void {
    const look = KIND_LOOK[kind];
    this.fx.debris(x, y + 0.7, z, look.debris, 0, 0, look.count + 4, look.speed * 1.25);
  }

  update(): void {
    const cur = this.current;
    if (!cur) return;
    const now = performance.now();
    const left = cur.endsAt - now;
    const k = 1 - left / cur.durationMs;
    this.arcFor(cur.kind).setProgress(k);

    // Beats are struck on the way through, evenly spaced. The last one lands
    // just before the reward rather than exactly on it, so the swing reads as
    // the cause of the "+N" and not as a reaction to it.
    const due = this.beatsAt(Math.max(0, left), cur.durationMs);
    while (cur.beatsDone < due && cur.beatsDone < GatherFx.BEATS) {
      const look = KIND_LOOK[cur.kind];
      this.fx.debris(cur.x, cur.y + 0.7, cur.z, look.debris, cur.awayX, cur.awayZ, look.count, look.speed);
      this.onBeat(cur.kind, cur.beatsDone);
      cur.struckAt = now;
      cur.beatsDone++;
    }

    // THE NODE FLINCHES. Debris coming off a tree that does not move reads as
    // an effect played NEAR a tree; the thing that makes a blow land is the
    // struck object acknowledging it.
    //
    // A damped spring rather than a fade back to zero: a tree leans away, comes
    // back past upright, and settles. A one-way decay is a lean followed by a
    // slow creep, which looks like the tree is on a hinge.
    if (cur.obj) {
      const t = (now - cur.struckAt) / RECOIL_MS;
      if (t >= 0 && t < 1) {
        const look = KIND_LOOK[cur.kind];
        const swing = Math.sin(t * Math.PI * 2.2) * Math.pow(1 - t, 2.4) * look.recoil;
        const len = Math.hypot(cur.awayX, cur.awayZ) || 1;
        // Tilt about the axis perpendicular to the blow, so it leans directly
        // away from whoever struck it rather than in some fixed direction.
        cur.obj.rotation.x = swing * (cur.awayZ / len);
        cur.obj.rotation.z = -swing * (cur.awayX / len);
        // And a slight squash, which is what sells a rock: a boulder cannot
        // lean much without looking like it is about to roll away.
        const squash = 1 - Math.abs(swing) * 0.35;
        cur.obj.scale.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5);
      } else if (t >= 1 && t < 1.2) {
        this.restore();
      }
    }
  }

  dispose(): void {
    for (const arc of this.arcs.values()) {
      this.scene.remove(arc.mesh);
      arc.dispose();
    }
    this.arcs.clear();
    this.current = null;
  }
}
