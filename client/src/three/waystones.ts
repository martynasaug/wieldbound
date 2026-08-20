// The four standing stones, drawn.
//
// Everything past the palisade is trees, rocks, monsters and grass — ground
// with a difficulty rating and no features. These are the first built things
// out there, and they exist so that "walk to the third ring" can be said as
// "walk to the Hollow Stone", which is a destination rather than a coordinate.
//
// Built the way Emberhold is: boxes and prisms in the game's own palette,
// surfaced with the same procedural masonry, merged into one static mesh each.
// They share the town's `Builder` rather than owning a second copy of nine
// canvas textures, because a landmark cut in a different grey from the town
// wall is the same mistake a downloaded building pack would have been.
//
// ONE MESH PER STONE rather than one for all four. Four draw calls is nothing,
// and the reason is the camera fade: Game raycasts `world.decor` and dims
// whatever stands between the lens and the player, per material. Merged into a
// single mesh, walking behind one stone would fade all four — three of which
// are two thousand pixels away and, on a bad day, not fogged out yet.
//
// They are NOT solid. Nothing outside the walls is: not a tree, not a boulder,
// not a camp. Static collision lives in `shared/town.ts` and is about a town;
// adding a second system for four props in a field would be a rule the player
// meets four times and a whole mechanism to keep honest. Walking through a
// waystone is the same concession every trunk in the world already has.

import * as THREE from "three";
import { LANDMARKS, landmarkPosition, type Landmark } from "../../../shared/landmarks";
import { Builder, ringedDisc, roadTexture } from "./town";
import { toWorldX, toWorldZ } from "./World";

/**
 * How each stone is shaped.
 *
 * Keyed by landmark id and NOT interchangeable: every one of them has a blurb
 * saying what it looks like, and a player who walks two thousand pixels on the
 * strength of "split top to bottom, and the gap is wide enough to walk through"
 * should find a stone with a gap in it. Four silhouettes is four functions and
 * about sixty lines; four copies of one slab would make the walk pointless the
 * second time.
 */
type StoneShape = (b: Builder, group: THREE.Group, x: number, z: number) => void;

/** A rough boulder, for the cairns. Low-poly on purpose — it is a rock. */
function boulder(b: Builder, x: number, y: number, z: number, r: number, seed: number): void {
  const geo = new THREE.IcosahedronGeometry(r, 0);
  b.add("rockDark", geo, x, y + r * 0.55, z, seed, 0.3);
}

/**
 * The ring of trodden earth every stone stands in.
 *
 * It is what makes one readable from a long way off, before the slab itself
 * resolves out of the grass — and it says somebody has been here, which is half
 * of what a landmark is for.
 *
 * A FADED disc, not a circle, and that is not a nicety: the first version was
 * flat `CircleGeometry` and it read as a hole cut in the field. This is the
 * same lesson the road learned across the square in Phase 51 — a hard alpha
 * edge on the ground is the most visible artefact this camera produces, and
 * `ringedDisc` already exists to avoid it. It is also not part of the merged
 * stone mesh: it needs vertex alpha, transparency and no depth write, which are
 * exactly the three things the opaque masonry material must not have.
 */
function apron(group: THREE.Group, x: number, z: number, radius: number): void {
  const tex = roadTexture();
  tex.repeat.set(1, 1);
  const mesh = new THREE.Mesh(
    ringedDisc(radius, 28, [0, 1]),
    new THREE.MeshStandardMaterial({
      map: tex,
      // The back lane's own worn earth, and deliberately the same number: a
      // path behind the inn and the ground round a waystone are the same thing
      // — ground people have walked on — and two browns half a shade apart is
      // how a world stops looking like one place.
      color: 0x6f6047,
      transparent: true,
      vertexColors: true,
      roughness: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.03, z);
  mesh.receiveShadow = true;
  group.add(mesh);
}

/** Upright, squared off, a cairn round its foot. The one the watch can see. */
function gatestone(b: Builder, group: THREE.Group, x: number, z: number): void {
  apron(group, x, z, 2.4);
  b.box("rock", 1.15, 4.6, 0.6, x, 0.25, z, 0.08);
  // The taper: a second, narrower block over the first so the top is not a
  // perfect rectangle. Cheaper than a real frustum and reads the same at range.
  b.box("rock", 0.85, 0.7, 0.5, x, 4.85, z, 0.08);
  // The tally. Four scratches and a fifth across them, cut shallow into the
  // face — the detail the blurb promises, at the height somebody stood to make
  // it rather than wherever it happened to fit.
  for (let i = 0; i < 4; i++) {
    b.box("rockDark", 0.045, 0.42, 0.03, x - 0.28 + i * 0.16, 1.35, z + 0.31, 0.08);
  }
  b.add(
    "rockDark",
    new THREE.BoxGeometry(0.7, 0.045, 0.03),
    x - 0.05,
    1.56,
    z + 0.31,
    0.08,
    0.5,
  );
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    boulder(b, x + Math.cos(a) * 1.05, 0, z + Math.sin(a) * 1.05, 0.3 + (i % 3) * 0.06, a);
  }
}

/** Leaning south, half its height in the ground. */
function sunkenstone(b: Builder, group: THREE.Group, x: number, z: number): void {
  apron(group, x, z, 2.6);
  // Sunk by starting it BELOW the ground rather than by shortening it: the lean
  // then buries a corner and lifts the opposite one, which is what a stone
  // going over actually does and is not something a shorter slab can fake.
  b.box("rock", 1.3, 5.2, 0.7, x, -1.5, z, 0.9, 0.3);
  // The earth it has pushed up on the low side — earth, not rock, which is what
  // the comment said and what the first version did not draw.
  b.add("dirt", new THREE.IcosahedronGeometry(1.15, 0), x + 0.55, 0.1, z + 0.35, 1.1, 0.2);
  b.add("dirt", new THREE.IcosahedronGeometry(0.8, 0), x - 0.7, 0.05, z - 0.5, 0.3, 0.1);
}

/** Split top to bottom, and the gap is wide enough to walk through. */
function hollowstone(b: Builder, group: THREE.Group, x: number, z: number): void {
  apron(group, x, z, 2.8);
  // Two halves, leaning very slightly apart, so the gap widens toward the top
  // the way a split does. Both are the same stone: it was one block.
  b.box("rock", 0.8, 5.0, 0.75, x - 0.62, 0.2, z, 0.15, -0.035);
  b.box("rock", 0.8, 5.0, 0.75, x + 0.62, 0.2, z, 0.15, 0.035);
  // A wedge of it that came off and is still lying there.
  b.add("rock", new THREE.IcosahedronGeometry(0.62, 0), x + 1.9, 0.1, z - 1.1, 0.8, 0.4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 1.1;
    boulder(b, x + Math.cos(a) * 1.9, 0, z + Math.sin(a) * 1.9, 0.26, a);
  }
}

/** The colour of a cold hearth, and nothing grows round it. */
function ashenstone(b: Builder, group: THREE.Group, x: number, z: number): void {
  // A wider, darker apron — this is the one whose ground is the point.
  apron(group, x, z, 3.4);
  b.box("rockDark", 1.5, 4.2, 0.85, x, 0.15, z, -0.12);
  // Blunt rather than tapered: it reads as worn down instead of shaped.
  b.box("rockDark", 1.2, 0.5, 0.7, x, 4.35, z, -0.12);
  // Two smaller stones set out from it, which is the only one of the four that
  // looks arranged rather than placed.
  b.box("rockDark", 0.55, 1.5, 0.45, x - 2.0, 0, z + 0.9, 0.5);
  b.box("rockDark", 0.55, 1.2, 0.45, x + 1.9, 0, z - 1.0, -0.4);
}

const SHAPES: Record<string, StoneShape> = {
  gatestone,
  sunkenstone,
  hollowstone,
  ashenstone,
};

export interface WaystoneVisual {
  def: Landmark;
  group: THREE.Group;
  /** World-space position, for the nameplate. Nothing out here moves. */
  x: number;
  z: number;
}

/**
 * How high above the ground a waystone's nameplate floats.
 *
 * Above the tallest of them, so the label never sits over the stone it names.
 */
export const WAYSTONE_PLATE_HEIGHT = 5.6;

/**
 * Builds all four and adds them to `decor`.
 *
 * `decor` rather than the scene directly, because that is the group the camera
 * fades when something gets between it and the player — a five-unit slab is
 * exactly the sort of thing you can end up standing behind, and the treeline is
 * already in there for the same reason.
 */
export function buildWaystones(decor: THREE.Group): WaystoneVisual[] {
  const out: WaystoneVisual[] = [];
  for (const def of LANDMARKS) {
    const shape = SHAPES[def.id];
    if (!shape) {
      // Loud, because a missing waystone is a quest that cannot be finished and
      // an empty patch of grass with a nameplate over it.
      console.error(`[waystones] no shape for "${def.id}" — the stone will not be drawn`);
      continue;
    }
    const at = landmarkPosition(def);
    const x = toWorldX(at.x);
    const z = toWorldZ(at.y);
    const group = new THREE.Group();
    const b = new Builder();
    shape(b, group, x, z);
    // Own materials, so fading the stone you are standing behind does not fade
    // the other three.
    b.finish(group, true);
    decor.add(group);
    out.push({ def, group, x, z });
  }
  return out;
}
