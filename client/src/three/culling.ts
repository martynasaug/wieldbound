import * as THREE from "three";

// DISTANCE CULLING, which this world had none of.
//
// The frame this was written for: 47fps, 17.8ms a frame, of which `render` was
// 14.6ms and ALL the JavaScript together was 2.4ms. 1143 draw calls and 4.26
// million triangles. That is not a code problem — the loop is already cheap —
// it is a submission problem, and the two numbers say where it comes from.
//
// The world is 400x300 units and there are about eighty-two thousand plants in
// it. Ground cover was already chunked into per-species `InstancedMesh`es
// precisely so the frustum test could reject what is off screen, and that part
// works. What nothing did was reject what is ON screen and far away: a camera
// that sits at most 22 units out, looking toward a horizon 400 units deep,
// keeps most of the map inside its frustum, and every blade of grass in it was
// being transformed and rasterised at full detail while covering a fraction of
// a pixel.
//
// So the rule is the honest one: cull a thing where it stops contributing
// pixels, and pick that distance from what the thing IS. A 0.3-unit clover and
// a 12-unit pine do not stop mattering at the same range, and giving them one
// radius would either keep the grass too long or pop the trees.
//
// Why `.visible` rather than removing from the scene: three.js skips an
// invisible object and its whole subtree before any per-object work, the flag
// costs nothing to flip back, and the instance buffers stay resident on the GPU
// — so walking back toward a wood does not re-upload it.

/** Ground cover — grass, clover, pebbles, mushrooms. Nothing here is over a
 *  metre and most of it is a third of one, so past this it is sub-pixel. Sits
 *  well outside the camera's own 22-unit leash and inside the fog's 55-unit
 *  near plane, which is where things start visibly fading anyway. */
export const COVER_CULL_UNITS = 78;

/** Trees, which are masts and read as silhouettes long after their detail is
 *  gone. Pinned to the fog's FAR plane rather than to a number of its own: past
 *  that the fog has already replaced them with flat sky colour, so drawing them
 *  cannot change a single pixel. */
export const TREE_CULL_UNITS = 165;

interface Tier {
  group: THREE.Object3D;
  radius: number;
  label: string;
}

/**
 * Toggles whole instanced chunks by distance from the viewer.
 *
 * Works off each child's own `boundingSphere`, which both `buildGroundCover`
 * and `buildForests` already compute from their instance matrices (they had to
 * — the prototype's own tiny box made the frustum test reject a chunk the
 * moment its ORIGIN left the view). So the sphere is a real bound on where that
 * chunk's plants actually are, and subtracting its radius means a chunk stays
 * drawn while any part of it is inside the cut.
 */
export class DistanceCuller {
  private tiers: Tier[] = [];
  private lastX = Infinity;
  private scale = 1;
  private lastZ = Infinity;
  /** Chunks left visible at the last evaluation, for the profiler. */
  visibleChunks = 0;
  totalChunks = 0;

  add(group: THREE.Object3D, radius: number, label: string): void {
    this.tiers.push({ group, radius, label });
    this.lastX = Infinity; // force the next update to do the work
  }

  /**
   * Scales every radius, for the graphics quality setting.
   *
   * A multiplier rather than a second set of distances, so the reasoning behind
   * each radius — sub-pixel for cover, the fog's far plane for trees, and the
   * per-species heights on top of both — stays in one place and keeps its
   * proportions at every level. `Performance` closes the world in around the
   * player; it does not re-decide which things matter to it.
   */
  setScale(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    this.lastX = Infinity; // the cut changed, so it has to be re-decided now
  }

  /**
   * Horizontal distance only. The camera is always above the ground looking
   * down at a fixed pitch, so height would add a constant to every comparison
   * and change nothing except making the radius mean something less obvious.
   *
   * Re-evaluated only after the viewer has actually moved. A player standing
   * still — reading a panel, mid-fight, at a vendor — is the common case, and
   * re-deciding the same thousand booleans sixty times a second for a camera
   * that has not moved is exactly the kind of waste this file exists to remove.
   */
  update(camX: number, camZ: number): void {
    const dx = camX - this.lastX;
    const dz = camZ - this.lastZ;
    if (dx * dx + dz * dz < RE_EVALUATE_UNITS * RE_EVALUATE_UNITS) return;
    this.lastX = camX;
    this.lastZ = camZ;

    let visible = 0;
    let total = 0;
    for (const tier of this.tiers) {
      for (const child of tier.group.children) {
        total++;
        // The INSTANCE sphere, not the geometry's. `computeBoundingSphere` on
        // an InstancedMesh bounds where its placements actually are; the
        // geometry's own sphere bounds one prototype plant sitting at the
        // origin, and culling against that would hide the entire world at once.
        // Both builders call the instance version for exactly this reason.
        const bound = (child as THREE.InstancedMesh).boundingSphere;
        if (!bound) {
          // No bound to judge it by. Leaving it visible is the safe failure:
          // a chunk drawn too often costs frames, a chunk hidden wrongly is a
          // hole in the world.
          child.visible = true;
          visible++;
          continue;
        }
        const cx = bound.center.x - camX;
        const cz = bound.center.z - camZ;
        // A chunk may name its own distance. Ground cover does, scaled by how
        // tall the species is (see `coverCullRadius`) — a pebble and a grass
        // tuft sharing one radius was most of what the first cut left on the
        // table. The tier's radius is the default for anything that does not
        // care to say.
        const own = (child.userData.cullRadius as number | undefined) ?? tier.radius;
        const reach = own * this.scale + bound.radius;
        const on = cx * cx + cz * cz <= reach * reach;
        child.visible = on;
        if (on) visible++;
      }
    }
    this.visibleChunks = visible;
    this.totalChunks = total;
  }
}

/** How far the viewer must move before the cut is reconsidered. Small enough
 *  that a chunk can never pop in late — the radii above have far more slack
 *  than this — and large enough that standing still costs nothing. */
const RE_EVALUATE_UNITS = 2;

/**
 * The distance a ground-cover species stops being worth drawing, from how tall
 * it is.
 *
 * Lives here rather than beside the species table because that file reaches
 * into the asset loader and the terrain, and this rule is arithmetic — keeping
 * it dependency-free is what lets `tools/test/culling.mjs` exercise it under
 * plain Node against the real numbers.
 *
 * Proportional to height rather than banded, so adding a species needs no
 * decision: it gets a radius the moment it declares a size. The tallest cover
 * in the table (0.98 units) keeps the full `COVER_CULL_UNITS`, and everything
 * shorter is retired in proportion.
 *
 * FLOORED AT HALF, and that floor is doing real work: a 0.22-unit pebble scaled
 * honestly would be culled around seventeen units, INSIDE the camera's own
 * 22-unit leash — it would wink out while the player could still walk over and
 * look down at it. Half of 78 is 39, comfortably past anything the camera can
 * reach and still less than half the distance the tall grass survives to.
 */
export function coverCullRadius(maxHeightUnits: number): number {
  const tallest = 0.98;
  const scale = Math.max(0.5, Math.min(1, maxHeightUnits / tallest));
  return COVER_CULL_UNITS * scale;
}
