// Ground indicators: the flat rings that tell you what you have selected, how
// far you can reach, and where a boss is about to land its slam.
//
// The telegraph one matters most. `MonsterState.windingUp` and the per-kind
// `slamRadiusPx` have been on the wire since Phase 42, but the 3D client was
// not drawing them at all â€” so the troll's whole design (an attack you answer
// by walking out of it, rather than by out-healing it) was invisible and the
// fight just looked like it hit unfairly hard.

import * as THREE from "three";
import { surfaceHeight } from "./World";

// --- A ring that is actually ON the ground -----------------------------------
//
// Every mark in this file used to be a flat quad, placed at `terrainHeight` and
// lifted three centimetres. Both halves of that are wrong, and they are the two
// halves this project has now corrected three times over — for the feet
// (M55.3), for the contact shade and the pool of light (M56.1), and here.
//
// **The datum was the wrong one.** `terrainHeight` is the smooth analytic field;
// what you can SEE is that field sampled on a 1.63-unit grid and joined with
// flat triangles, which rides above it across a quarter of the world. A mark
// placed on the field and lifted 0.03 is inside the ground you are looking at.
//
// **And a flat disc on ground that is not flat is a chord**, most of which is
// under the hill. Measured, as the worst point on the circle, over the five
// bands where the game is actually played:
//
//     ring radius     flat quad          tilted to the slope    on the ground
//     0.6u  (target)  med 0.034 p95 0.19  med 0.001 p95 0.013    0
//     2.5u  (a slam)  med 0.146 p95 0.80  med 0.007 p95 0.15     0
//     5.0u  (reach)   med 0.284 p95 1.59  med 0.040 p95 0.55     0
//     8.0u            med 0.436 p95 2.49  med 0.123 p95 1.23     0
//
// **Which is why these follow the ground per vertex rather than being tilted to
// it.** A single tilt is the right answer for the contact shade, because that is
// 1.3 units across and a plane fits it to within 3mm. It is NOT the right answer
// here: a reach ring is ten units across and a slam telegraph five, and at those
// sizes a plane is still a third of a character out at the ninety-fifth
// percentile. A telegraph you are supposed to step out of is the worst thing in
// the game to have half-buried in a rise.
//
// It costs one height sample per vertex per move. Sixty-four segments is finer
// than the terrain mesh's own quads at every radius these reach, so what is left
// between samples is smaller than the thing being sampled.

/** Enough that a segment is shorter than a terrain quad even on a wide ring. */
const SEGMENTS = 64;

/**
 * A ring or disc whose vertices sit on the drawn ground.
 *
 * Built in WORLD space and left at the origin with no rotation and no scale,
 * because there is no one transform that puts a flat shape onto a curved
 * surface — that is the whole point. `set` rewrites the positions.
 *
 * `innerFrac` of 0 makes it a disc, which is how the slam's fill and its edge
 * are one class rather than two.
 */
class GroundRing {
  readonly mesh: THREE.Mesh;
  private readonly position: THREE.BufferAttribute;
  /** What it was last built for, so standing still costs nothing. */
  private atX = NaN;
  private atZ = NaN;
  private atRadius = NaN;

  constructor(
    private readonly innerFrac: number,
    private readonly outerFrac: number,
    color: number,
    opacity: number,
    private readonly lift: number,
    renderOrder: number,
  ) {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(SEGMENTS * 2 * 3);
    this.position = new THREE.BufferAttribute(verts, 3);
    this.position.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.position);

    // Two concentric loops stitched into a strip. The winding does not matter:
    // every material here is DoubleSide, because a ring lying on a slope is seen
    // from underneath the moment the slope tips away from the camera.
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      const b = ((i + 1) % SEGMENTS) * 2;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
    geo.setIndex(index);

    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  get material(): THREE.MeshBasicMaterial {
    return this.mesh.material as THREE.MeshBasicMaterial;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  /** Lay it round (x, z) at this radius, on whatever the ground does there. */
  set(x: number, z: number, radius: number): void {
    // Guard against not having moved. `update` runs from the render loop and a
    // target you are standing still next to is the common case; rebuilding a
    // hundred and twenty-eight vertices a frame for a ring that has not changed
    // is the same waste the soundscape's ramps were guarded against.
    if (x === this.atX && z === this.atZ && radius === this.atRadius) return;
    this.atX = x;
    this.atZ = z;
    this.atRadius = radius;

    const inner = radius * this.innerFrac;
    const outer = radius * this.outerFrac;
    const arr = this.position.array as Float32Array;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const ix = x + cos * inner;
      const iz = z + sin * inner;
      const ox = x + cos * outer;
      const oz = z + sin * outer;
      const o = i * 6;
      arr[o] = ix;
      arr[o + 1] = surfaceHeight(ix, iz) + this.lift;
      arr[o + 2] = iz;
      arr[o + 3] = ox;
      arr[o + 4] = surfaceHeight(ox, oz) + this.lift;
      arr[o + 5] = oz;
    }
    this.position.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function ring(inner: number, outer: number, color: number, opacity: number): GroundRing {
  // Lifted a little clear of the ground, which is now the only job the lift has:
  // the vertices are ON the surface, so this is z-fight clearance and nothing
  // else. It used to be carrying the chord error as well, and it was an order of
  // magnitude too small for that.
  return new GroundRing(inner, outer, color, opacity, 0.03, 2);
}

function disc(radius: number, color: number, opacity: number): GroundRing {
  void radius;
  return new GroundRing(0, 1, color, opacity, 0.02, 1);
}

export class Indicators {
  private readonly targetRing: GroundRing;
  /** Drawn around a target you picked by hand, so a deliberate choice stays
   *  visibly yours even when auto-attack is busy with something nearer. */
  private readonly lockRing: GroundRing;
  /** Follows the cursor's candidate, so you can see which of two overlapping
   *  bodies a click would actually take. */
  private readonly hoverRing: GroundRing;
  private readonly reachRing: GroundRing;
  private readonly dangerZones = new Map<string, { fill: GroundRing; edge: GroundRing }>();
  private seen = new Set<string>();

  constructor(private readonly scene: THREE.Scene) {
    this.targetRing = ring(0.42, 0.55, 0xffd873, 0.9);
    this.lockRing = ring(0.66, 0.74, 0xffd873, 0.8);
    this.hoverRing = ring(0.44, 0.52, 0xf2e2bd, 0.4);
    this.reachRing = ring(0.97, 1.0, 0xffe9c4, 0.22);
    scene.add(this.targetRing.mesh);
    scene.add(this.lockRing.mesh);
    scene.add(this.hoverRing.mesh);
    scene.add(this.reachRing.mesh);
  }

  /** Gold in reach, grey out of it â€” the ring doubles as a range readout. */
  showTarget(x: number, z: number, inReach: boolean, radius: number): void {
    this.targetRing.visible = true;
    this.targetRing.set(x, z, Math.max(0.6, radius));
    const mat = this.targetRing.material;
    mat.color.setHex(inReach ? 0xffd873 : 0x9a8d76);
    mat.opacity = inReach ? 0.95 : 0.55;
  }

  /**
   * The outer ring marking a hand-picked target. Usually it sits directly
   * around the engaged ring and the two read as one thicker marker; they only
   * separate when auto-attack is hitting something closer than the thing you
   * chose, which is exactly the moment worth telling the player about.
   */
  showLock(x: number, z: number, radius: number): void {
    this.lockRing.visible = true;
    this.lockRing.set(x, z, Math.max(0.6, radius));
  }

  hideLock(): void {
    this.lockRing.visible = false;
  }

  showHover(x: number, z: number, radius: number): void {
    this.hoverRing.visible = true;
    this.hoverRing.set(x, z, Math.max(0.6, radius));
  }

  hideHover(): void {
    this.hoverRing.visible = false;
  }

  hideTarget(): void {
    this.targetRing.visible = false;
  }

  /** The player's own melee/spell reach, shown only while actually fighting. */
  showReach(x: number, z: number, radiusUnits: number): void {
    this.reachRing.visible = true;
    this.reachRing.set(x, z, radiusUnits);
  }

  hideReach(): void {
    this.reachRing.visible = false;
  }

  beginDanger(): void {
    this.seen.clear();
  }

  /**
   * A filled circle under a monster that is winding up, covering exactly the
   * area its slam will hit. Pulses so it reads as a countdown rather than
   * decoration.
   */
  danger(id: string, x: number, z: number, radiusUnits: number): void {
    this.seen.add(id);
    let d = this.dangerZones.get(id);
    if (!d) {
      d = { fill: disc(1, 0xff5a3c, 0.22), edge: ring(0.94, 1.0, 0xff7a4a, 0.8) };
      d.fill.visible = true;
      d.edge.visible = true;
      this.scene.add(d.fill.mesh);
      this.scene.add(d.edge.mesh);
      this.dangerZones.set(id, d);
    }
    const pulse = 0.78 + Math.sin(performance.now() / 90) * 0.22;
    d.fill.set(x, z, radiusUnits);
    d.fill.material.opacity = 0.14 + pulse * 0.16;
    d.edge.set(x, z, radiusUnits);
    d.edge.material.opacity = 0.45 + pulse * 0.45;
  }

  endDanger(): void {
    for (const [id, d] of this.dangerZones) {
      if (this.seen.has(id)) continue;
      this.scene.remove(d.fill.mesh);
      this.scene.remove(d.edge.mesh);
      d.fill.dispose();
      d.edge.dispose();
      this.dangerZones.delete(id);
    }
  }
}
