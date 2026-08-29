// Ground indicators: the flat rings that tell you what you have selected, how
// far you can reach, and where a boss is about to land its slam.
//
// The telegraph one matters most. `MonsterState.windingUp` and the per-kind
// `slamRadiusPx` have been on the wire since Phase 42, but the 3D client was
// not drawing them at all â€” so the troll's whole design (an attack you answer
// by walking out of it, rather than by out-healing it) was invisible and the
// fight just looked like it hit unfairly hard.

import * as THREE from "three";
import { TERRAIN_STEP } from "./heightfield";
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
/**
 * Ground rings follow something that is usually MOVING — the reach ring
 * follows the player, the target/danger rings follow whatever they are
 * marking — so the exact-position guard in `set()` almost never fires
 * during actual play: real movement changes x/z by more than a float's
 * worth of nothing every single frame. Recorded live, in Chrome's own
 * Performance panel, with graphics quality (F4) already at Performance and
 * making no difference — the bottleneck this throttle exists for is CPU
 * terrain sampling, not GPU fill-rate: `surfaceHeight` chases three or four
 * calls into `terrainHeight`, which calls `carveRiver` (`riverAt`, a
 * bucket-search) and walks every `FLAT_SPOTS` entry, ALL per vertex, 128
 * vertices per ring, for however many rings are active — every frame,
 * regardless of Performance mode, because none of that is drawing.
 * `riverAt` alone showed as 5.7% of a whole 21-second recording's total
 * time — the single largest non-render cost in it.
 *
 * A ring's own visual job tolerates real staleness: it is a large, softly
 * moving overlay, not a precision gameplay element, and remote ACTORS
 * already interpolate through a coarser update than this without
 * complaint. Sampling terrain at 30Hz instead of every frame halves this
 * cost outright and is not something a player can see.
 */
const SAMPLE_INTERVAL_MS = 33;

class GroundRing {
  readonly mesh: THREE.Mesh;
  private readonly position: THREE.BufferAttribute;
  /** What it was last built for, so standing still costs nothing. */
  private atX = NaN;
  private atZ = NaN;
  private atRadius = NaN;
  /** See `SAMPLE_INTERVAL_MS`'s own comment. */
  private nextSampleAt = 0;

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
    // The common case the moment anything IS moving — see `SAMPLE_INTERVAL_MS`.
    // `atX`/`atZ`/`atRadius` are deliberately left stale here rather than
    // updated: the next call that clears the throttle picks up whatever the
    // caller is asking for AT THAT POINT, not a value frozen from the frame
    // that got skipped.
    const now = performance.now();
    if (now < this.nextSampleAt) return;
    this.nextSampleAt = now + SAMPLE_INTERVAL_MS;
    this.atX = x;
    this.atZ = z;
    this.atRadius = radius;

    const inner = radius * this.innerFrac;
    const outer = radius * this.outerFrac;
    const arr = this.position.array as Float32Array;
    // ONE SAMPLE PER ANGLE WHEN THE BAND IS THINNER THAN A TERRAIN QUAD.
    //
    // Every ring here is a thin annulus: the reach ring spans 0.97 to 1.00 of
    // its radius, the lock and hover rings 0.08 of it, a danger edge 0.06. At
    // the radii these are drawn at that is 0.05 to 0.36 world units, against a
    // terrain quad of `TERRAIN_STEP` - about 1.33. Both ends of the band sit
    // inside ONE quad, where the mesh has no detail to find, so sampling them
    // separately asked the same question twice.
    // It is not a free question: `surfaceHeight` chases through
    // `terrainHeight` into `carveRiver` (a `riverAt` bucket search) and walks
    // every `FLAT_SPOTS` entry, which is why M70.66 had to throttle this to
    // 30Hz at all. Profiled in combat, terrain sampling was still 6.3% of the
    // frame, with the reach ring rebuilding on 62% of frames.
    // The DISC is the exception and keeps both: `disc()` builds it with
    // innerFrac 0, so its band is the whole radius and the ground genuinely
    // does change across it.
    const shareSample = outer - inner < TERRAIN_STEP;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const ix = x + cos * inner;
      const iz = z + sin * inner;
      const ox = x + cos * outer;
      const oz = z + sin * outer;
      const o = i * 6;
      const iy = surfaceHeight(ix, iz) + this.lift;
      arr[o] = ix;
      arr[o + 1] = iy;
      arr[o + 2] = iz;
      arr[o + 3] = ox;
      arr[o + 4] = shareSample ? iy : surfaceHeight(ox, oz) + this.lift;
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

/** A borrowed or built danger-zone pair — either it came from `Indicators`'
 *  fixed pool (kept, returned on `endDanger`) or, on overflow, a genuine
 *  one-off pair disposed for real. See `Indicators.dangerPool`'s own
 *  comment for why both cases exist. */
interface DangerZone {
  fill: GroundRing;
  edge: GroundRing;
  pooled: boolean;
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
  private readonly dangerZones = new Map<string, DangerZone>();
  private seen = new Set<string>();

  /**
   * Fixed pool for telegraph danger zones, never disposed — the same fix
   * `effects.ts`/`attacks.ts`/`skillfx.ts`/`drops.ts` were given.
   * `danger()`/`endDanger()` used to build a fresh `{fill, edge}` pair of
   * `GroundRing`s (two `MeshBasicMaterial`s each) per monster id and
   * dispose them the instant a wind-up ended — on a boss whose own
   * `attackIntervalMs` cycle is a few seconds, that is a compile/destroy/
   * compile tied directly to the fight's own tempo, confirmed live via a
   * `[dispose-trace]` stack trace landing at `GroundRing.dispose`
   * (`indicators.ts:151`) after every other known file had already been
   * converted. Sized for "more than one telegraphing boss near the same
   * player at once," which is rare but not impossible with packs; genuine
   * overflow still works, it just pays the old per-use cost rather than
   * being silently dropped — a monster winding up with no telegraph ring
   * at all would be a real safety regression, unlike a skipped hit-flash.
   */
  private static readonly DANGER_POOL_SIZE = 6;
  private readonly dangerPool: DangerZone[] = [];
  private readonly freeDanger: DangerZone[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.targetRing = ring(0.42, 0.55, 0xffd873, 0.9);
    this.lockRing = ring(0.66, 0.74, 0xffd873, 0.8);
    this.hoverRing = ring(0.44, 0.52, 0xf2e2bd, 0.4);
    this.reachRing = ring(0.97, 1.0, 0xffe9c4, 0.22);
    scene.add(this.targetRing.mesh);
    scene.add(this.lockRing.mesh);
    scene.add(this.hoverRing.mesh);
    scene.add(this.reachRing.mesh);

    for (let i = 0; i < Indicators.DANGER_POOL_SIZE; i++) {
      const zone: DangerZone = { fill: disc(1, 0xff5a3c, 0.22), edge: ring(0.94, 1.0, 0xff7a4a, 0.8), pooled: true };
      scene.add(zone.fill.mesh, zone.edge.mesh);
      this.dangerPool.push(zone);
      this.freeDanger.push(zone);
    }
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
      const pooled = this.freeDanger.pop();
      if (pooled) {
        d = pooled;
      } else {
        // Overflow: more telegraphing bosses near this player at once than
        // the pool was sized for. A real pair rather than a dropped ring —
        // see `dangerPool`'s own comment on why this one case still pays
        // the old cost instead of silently doing nothing.
        d = { fill: disc(1, 0xff5a3c, 0.22), edge: ring(0.94, 1.0, 0xff7a4a, 0.8), pooled: false };
        this.scene.add(d.fill.mesh, d.edge.mesh);
      }
      d.fill.visible = true;
      d.edge.visible = true;
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
      if (d.pooled) {
        // Handed back rather than disposed — see `dangerPool`'s own
        // comment. Hidden and reset rather than removed from the scene:
        // it stays resident, ready for whichever monster winds up next.
        d.fill.visible = false;
        d.edge.visible = false;
        this.freeDanger.push(d);
      } else {
        this.scene.remove(d.fill.mesh);
        this.scene.remove(d.edge.mesh);
        d.fill.dispose();
        d.edge.dispose();
      }
      this.dangerZones.delete(id);
    }
  }
}
