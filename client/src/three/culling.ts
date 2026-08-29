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
  /**
   * Whether this tier's shadow casting is limited to the shadow window.
   *
   * Only ground cover opts in, and the reason is a size argument rather than a
   * taste one - see `setShadowWindow`. A wood does not: a tree is tall enough
   * that its shadow reaches a long way from its trunk, so a tree standing
   * outside the window can legitimately darken ground inside it.
   */
  shadowLimited?: boolean;
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
  /** Half-width of the sun's shadow box, or 0 before the world reports one. */
  private shadowWindow = 0;
  private lastZ = Infinity;
  /** Chunks left visible at the last evaluation, for the profiler. */
  visibleChunks = 0;
  totalChunks = 0;
  /** Per tier, so a reading says whether the cost is grass or trees — they are
   *  cut at very different distances and only the split can say which one is
   *  still worth attacking. */
  readonly perTier = new Map<string, number>();

  add(group: THREE.Object3D, radius: number, label: string, shadowLimited = false): void {
    this.tiers.push({ group, radius, label, shadowLimited });
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
  /**
   * The half-extent of the sun's orthographic shadow box, in world units.
   *
   * THE SHADOW MAP ONLY COVERS A WINDOW AROUND THE PLAYER - 11 to 34 units
   * depending on camera distance (see `World.follow`) - while ground cover is
   * DRAWN out to 78. Every grass chunk between those two numbers was being
   * submitted to the depth pass to cast a shadow that has nowhere to land: its
   * own shadow is a few centimetres long, and it stands tens of units outside
   * the only region the shadow map records. Measured on a settled frame with
   * the sun held still, cover casting from everywhere cost 762 draw calls
   * against 693 limited to the window - about a tenth of the whole frame's
   * submissions, spent on pixels that provably cannot exist.
   *
   * This is NOT the same trade as turning grass shadows off. Cover near the
   * player still casts exactly as it did; what stops is cover that could never
   * have contributed. The radius comes from the shadow camera rather than a
   * constant so it stays correct when zoom resizes the window, and the diagonal
   * is used because a chunk can sit off the corner of a square box and still be
   * inside it.
   */
  setShadowWindow(halfExtent: number): void {
    const next = halfExtent * Math.SQRT2 + SHADOW_WINDOW_MARGIN;
    if (Math.abs(next - this.shadowWindow) < 0.5) return;
    this.shadowWindow = next;
    this.lastX = Infinity; // the cut changed, so it has to be re-decided now
  }

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
      let tierVisible = 0;
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
          tierVisible++;
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
        if (on) {
          visible++;
          tierVisible++;
          // Thin what survived, by distance. Only ground cover opts in (it is
          // the only thing that records a `fullCount`); a wood drawn with a
          // third of its trees missing would be a different wood.
          // AND WHETHER IT IS WORTH CASTING A SHADOW AT ALL. Cheap: one
          // boolean per surviving chunk, decided from the distance already
          // computed above, and only re-run when the viewer has actually moved.
          if (tier.shadowLimited && this.shadowWindow > 0) {
            const cast = this.shadowWindow + bound.radius;
            child.castShadow = cx * cx + cz * cz <= cast * cast;
          }
          const full = child.userData.fullCount as number | undefined;
          if (full !== undefined) {
            const d = Math.sqrt(cx * cx + cz * cz);
            const want = Math.max(1, Math.round(full * coverDensityAt(d, own * this.scale)));
            (child as THREE.InstancedMesh).count = Math.min(full, want);
          }
        }
      }
      this.perTier.set(tier.label, tierVisible);
    }
    this.visibleChunks = visible;
    this.totalChunks = total;
  }
}

/** How far the viewer must move before the cut is reconsidered. Small enough
 *  that a chunk can never pop in late — the radii above have far more slack
 *  than this — and large enough that standing still costs nothing. */
const RE_EVALUATE_UNITS = 2;

/** Slack on the shadow window, so a chunk can never stop casting while any
 *  part of its shadow could still reach inside it. Generous on purpose: what
 *  is saved is a draw call and what is risked is a visible hole. */
const SHADOW_WINDOW_MARGIN = 6;

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

/**
 * How much of a chunk's cover to actually draw, by how far away it is.
 *
 * Culling answers "is this worth drawing at all"; this answers "how much of it"
 * for everything that survived. The reading that prompted it had `render` at
 * 10.81ms of a 15.04ms frame with 3.16 million triangles — and ground cover is
 * essentially all of that, eighty-odd thousand plants of a few dozen triangles
 * each. Draw calls were already down to 996 by then, so the remaining cost is
 * vertex and fill work, and the only thing that moves it is drawing fewer
 * blades.
 *
 * Thinning by distance is nearly invisible for the same reason culling by
 * distance is: a patch of grass forty units away is a texture of green, and a
 * texture of green with a third fewer blades in it is the same texture of
 * green. Up close, where a player can pick out individual plants, nothing is
 * removed at all.
 *
 * Banded rather than continuous on purpose — a smooth ramp would re-write
 * `count` on every chunk every time the player took a step, and the bands mean
 * a chunk's count changes a handful of times as it recedes and then stops.
 */
export function coverDensityAt(distance: number, radius: number): number {
  // AN ABSOLUTE FLOOR FIRST, before any proportion of the radius.
  //
  // The bands alone are a fraction of each species own cull radius, and those
  // radii differ by a factor of two — so a pebble, retired at 39 units, would
  // reach its first thinning band at about 18, which is close enough that the
  // chunk the player is STANDING IN could be drawn thinned. Nothing within
  // reach of the camera (22 units at full zoom) may be touched, or walking
  // forward would visibly pop plants into existence around the player.
  if (distance < FULL_DENSITY_UNITS) return 1;
  const fraction = distance / Math.max(1, radius);
  if (fraction < 0.45) return 1;
  if (fraction < 0.72) return 0.62;
  return 0.36;
}

/** Everything this close is drawn in full, whatever its species radius. Past
 *  the camera own 22-unit leash, so no thinning can happen where a player is
 *  able to look closely at individual plants. */
const FULL_DENSITY_UNITS = 30;
