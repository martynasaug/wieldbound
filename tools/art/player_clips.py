# THE ANIMATION SET THE GAME ACTUALLY NEEDS.
#
# The borrowed rig's vocabulary is twenty-five clips harvested off five
# Quaternius character rigs — attacks, casts, a roll, a pickup, locomotion, a
# death — and it contains no chop, no mine and no pick, because nobody in that
# pack ever swung an axe at a tree. Three milestones went into working around
# that: first playing the equipped weapon's attack (a ranger shot arrows at
# trunks), then one borrowed sword swing for all three, then hand-posed bone
# arcs computed at runtime in `gatherpose.ts`.
#
# These are the clips the game asks for rather than the clips a pack happened to
# ship. Split into its own module because it is data, and because a five-hundred
# line file that builds a body AND animates it is two files.
#
# WRITTEN AS TABLES: bone, axis, and a list of (frame, radians). A keyframe
# format would be more code than the poses it describes, and the shape of a walk
# genuinely is eight numbers per joint.
#
# EVERY CYCLIC CLIP ENDS WHERE IT BEGAN. A walk whose last frame differs from
# its first pops once per stride, which reads as a limp and is the commonest way
# a hand-authored loop goes wrong. `cycle` closes by construction.

import math

import bpy
from mathutils import Euler, Vector

FPS = 24


def action_fcurves(act):
    """The F-curves of an action, across the old and new Action APIs.

    Actions grew layers and slots in 4.4 and `Action.fcurves` is gone in 5.x,
    which is the kind of break that turns a script into a one-version artefact.
    """
    if hasattr(act, "fcurves"):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in getattr(layer, "strips", []):
            for bag in getattr(strip, "channelbags", []):
                out.extend(bag.fcurves)
    return out


def sample(curve, frame):
    """Linear read of a (frame, value) table.

    So one axis can key at another's frames without every axis having to list
    every frame — a quaternion is written whole, and inserting one axis at a
    time would leave only the last axis written.
    """
    if frame <= curve[0][0]:
        return curve[0][1]
    if frame >= curve[-1][0]:
        return curve[-1][1]
    for i in range(1, len(curve)):
        f0, v0 = curve[i - 1]
        f1, v1 = curve[i]
        if frame <= f1:
            k = (frame - f0) / max(1e-6, f1 - f0)
            return v0 + (v1 - v0) * k
    return curve[-1][1]


def cycle(a, b, length, phase=0.0):
    """A joint swinging between two extremes over a loop, starting at `phase`.

    Most of a walk is this: a hip forward while the other is back, an arm
    opposite the leg on its own side. Written once so a stride is four calls
    rather than forty numbers, and so the loop closes by construction — the
    value at `length` is the value at frame 1.
    """
    out = []
    for i in range(5):
        f = round(1 + i * length / 4)
        t = (i * 0.25 + phase) % 1.0
        out.append((f, a + (b - a) * (0.5 - 0.5 * math.cos(t * 2 * math.pi))))
    return out


def build_action(arm, name, length, keys, root_keys=None):
    """One clip, from a table of per-bone curves."""
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for b in arm.pose.bones:
        b.rotation_mode = "QUATERNION"
    for bone_name, axes in keys.items():
        pb = arm.pose.bones.get(bone_name)
        if not pb:
            continue
        # Every axis's frames together, so one keyframe carries all three.
        frames = sorted({f for curve in axes.values() for f, _ in curve})
        for frame in frames:
            # BUILT FROM AN EULER, and that is a correction rather than a
            # preference. The first version set the quaternion's x, y and z to
            # the angles and w to 1, then normalised — which is a rotation of
            # 2*atan(v), not v. Every angle in every clip came out very nearly
            # DOUBLE what it said: a hip written as 0.42 radians swung 0.84, and
            # the walk rendered as a character doing the splits.
            #
            # It is a plausible-looking mistake because it produces something
            # that moves correctly in shape and only wrongly in degree, so the
            # gait reads as "too much" rather than as broken, and the instinct
            # is to turn the numbers down.
            e = Euler((
                sample(axes["x"], frame) if "x" in axes else 0.0,
                sample(axes["y"], frame) if "y" in axes else 0.0,
                sample(axes["z"], frame) if "z" in axes else 0.0,
            ), "XYZ")
            pb.rotation_quaternion = e.to_quaternion()
            pb.keyframe_insert("rotation_quaternion", frame=frame)
    if root_keys:
        # ALONG THE BONE, NOT ALONG THE WORLD. A pose bone's location is in its
        # own space, and the Root bone points straight up — so its local Y is
        # the world's vertical and its local Z is forward. Written as (0, 0, dz)
        # the "bob" displaced the character HORIZONTALLY, which rendered as a
        # figure leaning thirty degrees backwards and sinking through the floor
        # while it walked. The offsets below are (side, up, forward).
        root = arm.pose.bones["Root"]
        for frame, offset in root_keys:
            root.location = Vector(offset)
            root.keyframe_insert("location", frame=frame)
    for fc in action_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = length
    return act


def all_actions(arm):
    """Every clip the game asks a player body for."""
    arm.animation_data_create()
    made = []

    # IDLE — telling the player the game has not frozen. It is the animation
    # they will look at for more of the session than any other, and the failure
    # is not ugliness but a statue, or a character swaying as if on a boat.
    made.append(build_action(arm, "Idle", 96, {
        "Abdomen": {"x": [(1, 0.0), (24, 0.022), (48, 0.0), (72, -0.012), (96, 0.0)]},
        "Torso": {"x": [(1, 0.0), (24, -0.030), (48, 0.0), (72, 0.016), (96, 0.0)]},
        "Neck": {"x": [(1, 0.0), (24, 0.020), (48, 0.0), (72, -0.010), (96, 0.0)]},
        # The head drifts rather than nodding in time with the chest, which is
        # what stops the whole figure pulsing as one object.
        "Head": {"y": [(1, 0.0), (32, 0.045), (64, -0.035), (96, 0.0)]},
        "UpperArmL": {"x": [(1, 0.0), (30, 0.035), (66, -0.020), (96, 0.0)]},
        "UpperArmR": {"x": [(1, 0.0), (36, -0.030), (72, 0.030), (96, 0.0)]},
        "LowerArmL": {"x": [(1, 0.0), (48, 0.040), (96, 0.0)]},
        "LowerArmR": {"x": [(1, 0.0), (52, 0.035), (96, 0.0)]},
    }, root_keys=[(1, (0, 0, 0)), (24, (0, 0.012, 0)), (48, (0, 0, 0)),
                  (72, (0, -0.006, 0)), (96, (0, 0, 0))]))

    # WALK — 32 frames, two steps. The arms swing opposite the leg on their own
    # side; arms in phase with their own legs is the thing that reads instantly
    # as wrong without anybody being able to say why.
    made.append(build_action(arm, "Walk", 32, {
        "UpperLegL": {"x": cycle(-0.42, 0.38, 32, 0.0)},
        "UpperLegR": {"x": cycle(-0.42, 0.38, 32, 0.5)},
        # A knee bends one way only, so the shin swings between straight and
        # folded rather than around a centre.
        "LowerLegL": {"x": cycle(0.05, 0.62, 32, 0.30)},
        "LowerLegR": {"x": cycle(0.05, 0.62, 32, 0.80)},
        "UpperArmL": {"x": cycle(0.32, -0.30, 32, 0.5)},
        "UpperArmR": {"x": cycle(0.32, -0.30, 32, 0.0)},
        "LowerArmL": {"x": cycle(-0.12, -0.34, 32, 0.5)},
        "LowerArmR": {"x": cycle(-0.12, -0.34, 32, 0.0)},
        # Hips counter-rotating against the shoulders is what turns a pair of
        # swinging legs into a body walking.
        "Hips": {"z": cycle(-0.06, 0.06, 32, 0.0)},
        "Torso": {"z": cycle(0.05, -0.05, 32, 0.0), "x": [(1, 0.04), (32, 0.04)]},
        "Neck": {"x": [(1, -0.02), (32, -0.02)]},
    }, root_keys=[(1, (0, 0, 0)), (8, (0, 0.022, 0)), (16, (0, 0, 0)),
                  (24, (0, 0.022, 0)), (32, (0, 0, 0))]))

    # RUN — the same shape, further and faster, leaning into it. 20 frames
    # rather than 32: cadence is most of what separates the two gaits, and a run
    # played at walking speed is a man wading.
    made.append(build_action(arm, "Run", 20, {
        "UpperLegL": {"x": cycle(-0.82, 0.68, 20, 0.0)},
        "UpperLegR": {"x": cycle(-0.82, 0.68, 20, 0.5)},
        "LowerLegL": {"x": cycle(0.10, 1.15, 20, 0.30)},
        "LowerLegR": {"x": cycle(0.10, 1.15, 20, 0.80)},
        "UpperArmL": {"x": cycle(0.75, -0.55, 20, 0.5)},
        "UpperArmR": {"x": cycle(0.75, -0.55, 20, 0.0)},
        # Elbows stay bent throughout, which is most of the difference in the
        # upper body between a run and a walk.
        "LowerArmL": {"x": cycle(-0.85, -1.15, 20, 0.5)},
        "LowerArmR": {"x": cycle(-0.85, -1.15, 20, 0.0)},
        "Hips": {"z": cycle(-0.10, 0.10, 20, 0.0)},
        "Torso": {"z": cycle(0.09, -0.09, 20, 0.0), "x": [(1, 0.16), (20, 0.16)]},
        "Neck": {"x": [(1, -0.12), (20, -0.12)]},
    }, root_keys=[(1, (0, 0, 0)), (5, (0, 0.05, 0)), (10, (0, -0.01, 0)),
                  (15, (0, 0.05, 0)), (20, (0, 0, 0))]))

    # ATTACK — a committed overhead-to-across cut.
    made.append(build_action(arm, "Attack", 18, {
        "UpperArmR": {"x": [(1, 0.0), (5, -1.35), (10, 0.45), (18, 0.0)],
                      "z": [(1, 0.0), (5, -0.35), (10, 0.30), (18, 0.0)]},
        "LowerArmR": {"x": [(1, -0.2), (5, -0.95), (10, -0.15), (18, -0.2)]},
        "Torso": {"y": [(1, 0.0), (5, -0.34), (10, 0.30), (18, 0.0)]},
        "Abdomen": {"y": [(1, 0.0), (5, -0.18), (10, 0.16), (18, 0.0)]},
        # The head stays on the target rather than following the shoulders
        # round, which is the difference between swinging at something and
        # swinging at air.
        "Neck": {"y": [(1, 0.0), (5, 0.20), (10, -0.16), (18, 0.0)]},
        "UpperArmL": {"x": [(1, 0.0), (5, 0.30), (10, -0.20), (18, 0.0)]},
    }))

    # CHOP, MINE and PICK — the three the borrowed pack had no answer for, and
    # the reason this rig exists. The shapes are the ones worked out in
    # `gatherpose.ts`, which had to do all of it by posing bones at runtime.
    # THE WIND-UP GOES OVERHEAD. At 1.55 radians the arms reached about
    # forty-five degrees above horizontal and the pose read as "hands up"
    # rather than as an axe about to fall. A swing is sold by how far back it
    # gathers, and half a swing looks like a shrug.
    made.append(build_action(arm, "Chop", 22, {
        # Diagonally across the body: a blade meets a trunk side-on.
        "UpperArmR": {"x": [(1, 0.0), (9, -2.35), (14, 0.60), (22, 0.0)],
                      "z": [(1, 0.0), (9, -0.45), (14, 0.40), (22, 0.0)]},
        "LowerArmR": {"x": [(1, -0.25), (9, -1.00), (14, -0.20), (22, -0.25)]},
        "UpperArmL": {"x": [(1, -0.2), (9, -2.10), (14, 0.45), (22, -0.2)],
                      "z": [(1, 0.35), (9, 0.55), (14, 0.30), (22, 0.35)]},
        "LowerArmL": {"x": [(1, -0.5), (9, -0.95), (14, -0.35), (22, -0.5)]},
        "Torso": {"x": [(1, 0.05), (9, -0.18), (14, 0.34), (22, 0.05)],
                  "y": [(1, 0.0), (9, -0.30), (14, 0.26), (22, 0.0)]},
        "Abdomen": {"x": [(1, 0.0), (9, -0.10), (14, 0.24), (22, 0.0)]},
        "Neck": {"x": [(1, 0.0), (9, 0.12), (14, -0.22), (22, 0.0)]},
    }))
    made.append(build_action(arm, "Mine", 20, {
        # Higher and straighter than the chop — almost no sideways travel — and
        # it rebounds off the stone instead of biting into it.
        "UpperArmR": {"x": [(1, 0.0), (8, -2.60), (12, 0.55), (14, 0.12), (20, 0.0)],
                      "z": [(1, 0.0), (8, -0.12), (12, 0.10), (20, 0.0)]},
        "LowerArmR": {"x": [(1, -0.25), (8, -1.05), (12, -0.10), (14, -0.35), (20, -0.25)]},
        "UpperArmL": {"x": [(1, -0.2), (8, -2.40), (12, 0.48), (14, 0.06), (20, -0.2)],
                      "z": [(1, 0.30), (8, 0.42), (12, 0.26), (20, 0.30)]},
        "LowerArmL": {"x": [(1, -0.5), (8, -1.00), (12, -0.25), (20, -0.5)]},
        "Torso": {"x": [(1, 0.06), (8, -0.12), (12, 0.40), (14, 0.28), (20, 0.06)]},
        "Abdomen": {"x": [(1, 0.0), (8, -0.06), (12, 0.26), (20, 0.0)]},
        # The knees take the impact, which is where the force of a pick goes.
        "UpperLegL": {"x": [(1, 0.0), (12, 0.30), (15, 0.12), (20, 0.0)]},
        "UpperLegR": {"x": [(1, 0.0), (12, 0.30), (15, 0.12), (20, 0.0)]},
        "LowerLegL": {"x": [(1, 0.0), (12, -0.46), (15, -0.18), (20, 0.0)]},
        "LowerLegR": {"x": [(1, 0.0), (12, -0.46), (15, -0.18), (20, 0.0)]},
        "Neck": {"x": [(1, 0.0), (8, 0.10), (12, -0.24), (20, 0.0)]},
    }))
    made.append(build_action(arm, "Pick", 28, {
        # No swing at all. The body folds down over the bush, the near hand goes
        # in, closes, and comes back to the chest with what it took.
        "Torso": {"x": [(1, 0.0), (8, 0.30), (20, 0.30), (28, 0.0)],
                  "y": [(1, 0.0), (14, -0.16), (28, 0.0)]},
        "Abdomen": {"x": [(1, 0.0), (8, 0.18), (20, 0.18), (28, 0.0)]},
        "Neck": {"x": [(1, 0.0), (8, 0.22), (20, 0.22), (28, 0.0)]},
        "UpperArmR": {"x": [(1, 0.0), (10, -1.05), (16, -1.15), (22, -0.35), (28, 0.0)],
                      "y": [(1, 0.0), (13, -0.30), (28, 0.0)],
                      "z": [(1, 0.0), (13, 0.22), (28, 0.0)]},
        "LowerArmR": {"x": [(1, -0.2), (10, -0.70), (14, -1.35), (18, -1.45), (28, -0.2)]},
        # The other hand steadies the branch, which is what a picker's does.
        "UpperArmL": {"x": [(1, 0.0), (10, -0.45), (20, -0.45), (28, 0.0)]},
        "LowerArmL": {"x": [(1, -0.2), (10, -0.85), (20, -0.85), (28, -0.2)]},
        "UpperLegL": {"x": [(1, 0.0), (8, 0.34), (20, 0.34), (28, 0.0)]},
        "UpperLegR": {"x": [(1, 0.0), (8, 0.34), (20, 0.34), (28, 0.0)]},
        "LowerLegL": {"x": [(1, 0.0), (8, -0.52), (20, -0.52), (28, 0.0)]},
        "LowerLegR": {"x": [(1, 0.0), (8, -0.52), (20, -0.52), (28, 0.0)]},
    }))

    # HIT — a flinch. Short, or it eats the time the player needs to react.
    made.append(build_action(arm, "Hit", 12, {
        "Torso": {"x": [(1, 0.0), (3, -0.30), (7, 0.08), (12, 0.0)]},
        "Abdomen": {"x": [(1, 0.0), (3, -0.18), (12, 0.0)]},
        "Neck": {"x": [(1, 0.0), (3, -0.28), (7, 0.10), (12, 0.0)]},
        "UpperArmL": {"x": [(1, 0.0), (3, 0.35), (12, 0.0)],
                      "z": [(1, 0.0), (3, 0.25), (12, 0.0)]},
        "UpperArmR": {"x": [(1, 0.0), (3, 0.35), (12, 0.0)],
                      "z": [(1, 0.0), (3, -0.25), (12, 0.0)]},
    }))

    # DEATH — a collapse, held at the end. The one clip that must NOT return to
    # its first frame: it is clamped, and getting up is a separate event.
    made.append(build_action(arm, "Death", 30, {
        "Torso": {"x": [(1, 0.0), (10, -0.25), (30, 0.95)]},
        "Abdomen": {"x": [(1, 0.0), (10, -0.15), (30, 0.55)]},
        "Neck": {"x": [(1, 0.0), (8, -0.30), (30, 0.60)]},
        "UpperArmL": {"x": [(1, 0.0), (12, 0.40), (30, 1.05)], "z": [(1, 0.0), (30, 0.35)]},
        "UpperArmR": {"x": [(1, 0.0), (12, 0.40), (30, 1.05)], "z": [(1, 0.0), (30, -0.35)]},
        "UpperLegL": {"x": [(1, 0.0), (14, 0.25), (30, 1.10)]},
        "UpperLegR": {"x": [(1, 0.0), (16, 0.20), (30, 1.00)]},
        "LowerLegL": {"x": [(1, 0.0), (30, -1.20)]},
        "LowerLegR": {"x": [(1, 0.0), (30, -1.05)]},
    }, root_keys=[(1, (0, 0, 0)), (14, (0, -0.10, 0)), (30, (0, -0.62, 0))]))

    return made
