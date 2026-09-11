// CHOPPING, MINING AND PICKING, AS THREE DIFFERENT THINGS A BODY DOES.
//
// Gathering has never had an animation of its own. It played `attack`, which
// resolves to the equipped weapon's clip, so a ranger harvested wood by
// shooting an arrow at the trunk; M70.255 gave it a `gather` state that always
// picked `Sword_Attack`, which fixed the arrow and left chopping and mining
// playing the identical one-handed duelling cut. Reported, correctly, as "tree
// cutting and rock mining animations are pretty much the same and bush
// gathering is barely visible".
//
// THERE ARE NO CLIPS FOR THIS AND THERE WILL NOT BE. The pooled library is
// twenty-five clips harvested off five character rigs — attacks, casts, a roll,
// a pickup, locomotion, a death. Nobody in that pack ever swung an axe at a
// tree. Waiting for an asset that does not exist is not a plan, and neither is
// picking the least-wrong sword swing for the third time.
//
// So these are POSED, not played: an arc through the rig's own bones, driven by
// a phase, layered on top of whatever the mixer is doing. The project already
// builds weapon geometry this way rather than shipping models for it, and the
// argument is the same — the thing needed is specific, small, and nobody is
// going to hand it to us.
//
// WHAT MAKES THEM DIFFERENT, which is the whole point:
//
//   * CHOPPING is two hands, high over the shoulder, and travels DIAGONALLY
//     across the body — the blade meets the trunk side-on, which is how you
//     fell a tree. The torso twists into the wind-up and unwinds through the
//     strike; that twist is most of what sells the weight.
//   * MINING is two hands, higher still, and comes almost straight DOWN, with
//     the knees dipping as it lands and a distinct rebound off the stone. A
//     pick bounces; an axe bites.
//   * PICKING is neither. The body folds down over the bush, one hand reaches
//     in, closes, and draws back to the chest. No swing at all.

import * as THREE from "three";

export type GatherPoseKind = "tree" | "rock" | "bush";

/** Euler offsets in radians, applied on top of the clip's own pose. */
export type BoneOffsets = Record<string, [number, number, number]>;

/**
 * Smoothstep, for phases that have to start and end at rest.
 *
 * Every joint here returns to zero at t=0 and t=1, because the offsets are
 * layered ON the mixer's output: a pose that does not close leaves the body
 * bent when the stroke ends, and the next stroke starts from somewhere wrong.
 */
const ease = (t: number): number => {
  // CLAMPED, and that clamp is not defensive tidiness — it is a bug fix.
  //
  // Smoothstep EXTRAPOLATES: feed it 1.69 and it returns -1.07, not 1. The mine
  // divides its strike phase by 0.32, so from t=0.78 onward the input runs past
  // 1 and the curve turns over and dives. The shoulder offset reached 7.8
  // radians — an arm rotating through more than a full turn — in the last fifth
  // of every mining stroke. Nothing in the screenshots showed it because the
  // frames that caught it are a tenth of a second long; the arithmetic test
  // found it on the first run.
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};

/**
 * Fades a stroke in and out, so a pose never starts or ends part-way bent.
 *
 * These offsets are layered on the clip, and the clip is still playing its idle
 * underneath. A pose with a non-zero value at t=0 therefore SNAPS the body into
 * a half-raised axe on the frame the stroke begins, and drops it on the frame it
 * ends — a flicker at both ends of every swing, twice a second while gathering.
 *
 * It lives here rather than in the caller because it is part of the MOTION: the
 * body gathers itself before a swing and settles after one, and describing that
 * as a weight the animation system happens to apply would leave the stroke's own
 * definition incomplete.
 */
const envelope = (t: number): number =>
  t < 0.12 ? ease(t / 0.12) : t > 0.88 ? ease((1 - t) / 0.12) : 1;

/** 0 at the ends, 1 in the middle — a wind-up-and-release envelope. */
const arc = (t: number): number => Math.sin(Math.PI * Math.max(0, Math.min(1, t)));

/**
 * One stroke, as a set of bone rotations.
 *
 * `t` runs 0..1 across a single swing. The shape of each joint's curve is
 * written out rather than interpolated between keyframes because there are
 * three of them and each is a dozen numbers — a keyframe format would be more
 * code than the poses it describes.
 */
export function strokePose(kind: GatherPoseKind, t: number): BoneOffsets {
  const k = Math.max(0, Math.min(1, t));
  const pose = kind === "bush" ? pickPose(k) : kind === "rock" ? minePose(k) : chopPose(k);
  const weight = envelope(k);
  if (weight >= 1) return pose;
  for (const name in pose) {
    const v = pose[name];
    pose[name] = [v[0] * weight, v[1] * weight, v[2] * weight];
  }
  return pose;
}

/**
 * AN AXE, DIAGONALLY, WITH THE TORSO BEHIND IT.
 *
 * Wind-up to 0.42 — slow, because weight is communicated by how long it takes
 * to gather — then a strike over the next fifth of the stroke and a long
 * recovery. The right arm lifts and goes back past the shoulder; the left stays
 * with it, which is what reads as two hands on one haft even though nothing
 * binds them.
 */
function chopPose(t: number): BoneOffsets {
  // -1 at full wind-up, +1 at the end of the strike.
  const swing = t < 0.42 ? -ease(t / 0.42) : ease((t - 0.42) / 0.58) * 2 - 1;
  // The body follows the arms, at about a third of the travel.
  const lean = swing * 0.34;
  const twist = -swing * 0.40;
  return {
    // Raising the arm is negative X on this rig; the diagonal comes from the Z
    // component, which swings the elbow across the chest on the way down.
    UpperArmR: [-0.95 + swing * 1.55, -0.20, -0.55 - swing * 0.45],
    LowerArmR: [-0.55 - (1 - Math.abs(swing)) * 0.45, 0, 0],
    // The left hand joins the haft: brought across and held near the right.
    UpperArmL: [-0.78 + swing * 1.35, 0.24, 0.62 + swing * 0.30],
    LowerArmL: [-0.70 - (1 - Math.abs(swing)) * 0.35, 0, 0],
    Torso: [lean * 0.55, twist, 0],
    Abdomen: [lean * 0.45, twist * 0.5, 0],
    // The head stays on the work rather than following the shoulders round,
    // which is the difference between swinging at a tree and swinging at air.
    Neck: [-lean * 0.5, -twist * 0.7, 0],
  };
}

/**
 * A PICK, ALMOST VERTICAL, WITH A BOUNCE.
 *
 * The differences from the chop are deliberate and all of them are visible at
 * gameplay distance: it goes higher, it comes down straighter (barely any Z),
 * the strike is FASTER — a fifth of the stroke against the axe's — and it
 * rebounds. The knees dip as it lands, which is where the force goes.
 */
function minePose(t: number): BoneOffsets {
  const swing = t < 0.46 ? -ease(t / 0.46) : ease((t - 0.46) / 0.32) * 2 - 1;
  // The rebound: a short kick back up just after the strike lands, decaying.
  const impact = t > 0.74 ? Math.max(0, 1 - (t - 0.74) / 0.22) : 0;
  const bounce = impact * Math.sin((t - 0.74) / 0.22 * Math.PI * 2) * 0.30;
  const drive = swing + bounce;
  const dip = t > 0.70 ? impact * 0.22 : 0;
  return {
    UpperArmR: [-1.20 + drive * 1.75, -0.10, -0.30 - drive * 0.12],
    LowerArmR: [-0.45 - (1 - Math.abs(drive)) * 0.55, 0, 0],
    UpperArmL: [-1.02 + drive * 1.58, 0.14, 0.40 + drive * 0.10],
    LowerArmL: [-0.60 - (1 - Math.abs(drive)) * 0.45, 0, 0],
    Torso: [drive * 0.30 + dip * 0.35, -drive * 0.10, 0],
    Abdomen: [drive * 0.24 + dip * 0.30, 0, 0],
    Neck: [-drive * 0.26, 0, 0],
    // Knees absorb it. Small numbers: this is a dip, not a squat.
    UpperLegL: [dip * 0.34, 0, 0],
    UpperLegR: [dip * 0.34, 0, 0],
    LowerLegL: [-dip * 0.52, 0, 0],
    LowerLegR: [-dip * 0.52, 0, 0],
  };
}

/**
 * REACH IN, CLOSE, DRAW BACK.
 *
 * "Barely visible" was the report on the old one, and the cause was that it was
 * the rig's `PickUp` clip — a crouch to floor level for something lying on the
 * ground, played on a character standing at a waist-high bush, so the motion
 * happened below the frame and behind the shrub.
 *
 * This folds the whole body down over the bush and reaches with the near arm,
 * so the movement is in the upper half of the figure where the camera can see
 * it. The hand goes out, closes at the far point, and comes back to the chest
 * with what it took — which is the one gesture that says "picking" rather than
 * "bending down".
 */
function pickPose(t: number): BoneOffsets {
  // Out on the first half, back on the second, and the fold holds throughout.
  const reach = arc(t);
  const fold = ease(Math.min(1, t * 2.4)) * (t > 0.82 ? (1 - t) / 0.18 : 1);
  // The grab: a quick close at the far end of the reach.
  const close = t > 0.42 && t < 0.62 ? 1 : 0;
  return {
    // A CROUCH, NOT A BOW. The first version folded the torso, abdomen and neck
    // by 0.62, 0.48 and 0.30 radians, which sum to about eighty degrees — and
    // photographed as a character lying face-down across the shrub. Reaching is
    // what should read here, and the reach lives in the ARM; the spine only has
    // to get the shoulder low enough to make it plausible. Twenty-five degrees
    // total does that and still looks like a person working.
    Torso: [fold * 0.26, -reach * 0.14, 0],
    Abdomen: [fold * 0.16, 0, 0],
    Neck: [fold * 0.20, 0, 0],
    // The arm does the work: down, forward and in, then back to the chest.
    UpperArmR: [-0.25 - reach * 1.25, -0.34 - reach * 0.30, -0.55 + reach * 0.30],
    LowerArmR: [-0.30 - close * 0.95 - (1 - reach) * 0.60, 0, 0],
    // The other hand steadies the branch, which is what a picker's does.
    UpperArmL: [-0.50 - fold * 0.30, 0.22, 0.58],
    LowerArmL: [-0.90, 0, 0],
    // Knees take most of the height, the way they do when you pick something:
    // you sink toward it rather than hinge at the waist.
    UpperLegL: [fold * 0.34, 0, 0],
    UpperLegR: [fold * 0.34, 0, 0],
    LowerLegL: [-fold * 0.52, 0, 0],
    LowerLegR: [-fold * 0.52, 0, 0],
  };
}

/**
 * Applies a pose on top of whatever the mixer left on the bones.
 *
 * MULTIPLIED, NOT ASSIGNED. The clip is still playing underneath — the body
 * keeps whatever idle sway or run cycle it had — and these are a rotation
 * layered on that, so nothing has to be authored twice.
 *
 * THE CALLER MUST UNDO THE PREVIOUS FRAME FIRST. This note used to end "the
 * mixer rewrites every bone each frame, so the offsets cannot accumulate",
 * which is wrong in the one way that matters: the mixer rewrites the bones the
 * CLIP KEYS. An idle keys the arms and the spine's sway and does not key the
 * knees, so every unkeyed bone kept last frame's rotation and had this frame's
 * multiplied onto it sixty times a second. Reported from play as the whole
 * upper body spinning the moment gathering began — which is what a quaternion
 * compounded sixty times a second looks like.
 *
 * `Actor.clearStrokePose` restores the saved rotations before the mixer runs.
 * Any other caller of this function owes the same thing.
 */
const scratch = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
export function applyPose(
  bones: Map<string, THREE.Object3D>,
  offsets: BoneOffsets,
  weight = 1,
): void {
  for (const name in offsets) {
    const bone = bones.get(name);
    if (!bone) continue;
    const [x, y, z] = offsets[name];
    scratchEuler.set(x * weight, y * weight, z * weight);
    scratch.setFromEuler(scratchEuler);
    bone.quaternion.multiply(scratch);
  }
}
