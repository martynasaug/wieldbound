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
# WRITTEN AS TABLES: bone, axis, and a list of (frame, radians). A keyframe
# format would be more code than the poses it describes.
#
# WHAT THE FIRST PASS GOT WRONG, and it is worth saying plainly because the
# clips "worked" and still looked like a mannequin being posed:
#
#   * EVERY CURVE HAD THE SAME EASING. Blender's default Bezier eases into and
#     out of every key, so a swing decelerated into its own impact — the one
#     moment that must arrive at full speed. An axe that slows down as it
#     reaches the trunk has no weight at all. `sharp` marks the frames that are
#     impacts and makes the approach linear.
#   * NOTHING LAGGED. Every joint hit its extreme on the same frame, which is
#     what makes animation read as a diagram: a body arrives in pieces, and the
#     head and hands finish after the chest does.
#   * THE FEET WERE WELDED TO THE SHINS. `Foot` bones existed and no clip
#     touched them, so the soles stayed parallel to the ground through an
#     entire stride. A walk without a heel strike and a toe-off is a character
#     sliding on skates, and it is the single biggest tell in the old set.
#   * A WALK IS NOT A SINE WAVE. The first version swung every joint on the
#     same cosine, which produces even, floaty motion with no weight in it. A
#     real stride has four distinct poses — contact, down, passing, up — and
#     they are not evenly spaced.

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

    Still here for the joints that genuinely are sinusoidal — a shoulder swinging
    through a walk, a hip counter-rotating — but the LEGS no longer use it. See
    the note at the top: a stride is four poses, not a wave.
    """
    out = []
    for i in range(5):
        f = round(1 + i * length / 4)
        t = (i * 0.25 + phase) % 1.0
        out.append((f, a + (b - a) * (0.5 - 0.5 * math.cos(t * 2 * math.pi))))
    return out


def build_action(arm, name, length, keys, root_keys=None, sharp=()):
    """One clip, from a table of per-bone curves.

    `sharp` is the list of frames that are IMPACTS — the blade meeting the
    trunk, the foot meeting the ground, the body meeting the floor. The segment
    arriving at one of those is made linear so the motion is still travelling at
    full speed when it lands, and the segment leaving it keeps its ease so the
    recoil settles. Bezier on both sides is what makes a hand-authored swing
    feel like it is being lowered rather than swung.
    """
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    for b in arm.pose.bones:
        b.rotation_mode = "QUATERNION"
    for bone_name, axes in keys.items():
        pb = arm.pose.bones.get(bone_name)
        if not pb:
            continue
        frames = sorted({f for curve in axes.values() for f, _ in curve})
        for frame in frames:
            # BUILT FROM AN EULER, and that is a correction rather than a
            # preference. Setting the quaternion's x/y/z to the angles and w to
            # 1 is a rotation of 2*atan(v), not v: every angle came out nearly
            # double, and the walk was a character doing the splits.
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

    sharp_set = set(sharp)
    for fc in action_fcurves(act):
        points = sorted(fc.keyframe_points, key=lambda k: k.co[0])
        for i, kp in enumerate(points):
            kp.interpolation = "BEZIER"
            kp.handle_left_type = "AUTO_CLAMPED"
            kp.handle_right_type = "AUTO_CLAMPED"
        for i, kp in enumerate(points):
            if round(kp.co[0]) not in sharp_set:
                continue
            # Arrive at speed: the key itself takes a linear approach, and so
            # does the one before it, which is what makes the pair a straight
            # line rather than an S.
            kp.handle_left_type = "VECTOR"
            if i > 0:
                points[i - 1].handle_right_type = "VECTOR"
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
    #
    # The weight shifts from one foot to the other on a slower cycle than the
    # breath, so the two never line up and the loop does not read as a loop.
    made.append(build_action(arm, "Idle", 120, {
        "Abdomen": {"x": [(1, 0.0), (30, 0.026), (60, 0.0), (90, -0.014), (120, 0.0)],
                    "z": [(1, 0.0), (40, 0.030), (80, -0.030), (120, 0.0)]},
        "Torso": {"x": [(1, 0.0), (30, -0.034), (60, 0.0), (90, 0.018), (120, 0.0)],
                  "z": [(1, 0.0), (40, -0.022), (80, 0.022), (120, 0.0)]},
        "Neck": {"x": [(1, 0.0), (34, 0.024), (64, 0.0), (94, -0.012), (120, 0.0)]},
        # The head drifts on its own schedule — 120 does not divide by 45 — so
        # the whole figure never pulses as one object.
        "Head": {"y": [(1, 0.0), (45, 0.055), (90, -0.040), (120, 0.0)],
                 "x": [(1, 0.0), (60, 0.020), (120, 0.0)]},
        "Hips": {"z": [(1, 0.0), (40, 0.040), (80, -0.040), (120, 0.0)]},
        # Arms hang and swing a few degrees, each on its own phase.
        "UpperArmL": {"x": [(1, 0.0), (36, 0.040), (78, -0.024), (120, 0.0)],
                      "z": [(1, 0.06), (60, 0.085), (120, 0.06)]},
        "UpperArmR": {"x": [(1, 0.0), (42, -0.034), (84, 0.034), (120, 0.0)],
                      "z": [(1, -0.06), (60, -0.085), (120, -0.06)]},
        "LowerArmL": {"x": [(1, -0.06), (56, 0.030), (120, -0.06)]},
        "LowerArmR": {"x": [(1, -0.06), (62, 0.026), (120, -0.06)]},
        # A standing body is never quite straight-legged.
        "UpperLegL": {"x": [(1, 0.0), (40, 0.030), (80, 0.0), (120, 0.0)]},
        "UpperLegR": {"x": [(1, 0.0), (40, 0.0), (80, 0.030), (120, 0.0)]},
        "LowerLegL": {"x": [(1, -0.04), (40, -0.055), (80, -0.04), (120, -0.04)]},
        "LowerLegR": {"x": [(1, -0.04), (40, -0.04), (80, -0.055), (120, -0.04)]},
    }, root_keys=[(1, (0, 0, 0)), (30, (0, 0.012, 0)), (60, (0, 0, 0)),
                  (90, (0, -0.007, 0)), (120, (0, 0, 0))]))

    # WALK — 32 frames, two steps, built from the four poses a stride actually
    # has rather than from a wave:
    #
    #   1  CONTACT  heel down, leg reaching forward, body at its lowest
    #   5  DOWN     weight over the foot, knee absorbing, body lower still
    #   9  PASSING  legs together, body at its highest, back foot rolling off
    #  13  UP       pushing off the toe, body falling forward into the next
    #
    # and the same again from 17. The legs are a half-cycle apart, the arms
    # oppose the leg on their own side, and the FEET roll — heel strike, flat,
    # toe-off — which is the difference between walking and skating.
    made.append(build_action(arm, "Walk", 32, {
        # A WALKING STRIDE IS ABOUT TWENTY-FIVE DEGREES OF HIP, TOTAL. The first
        # pass used 0.40 forward against 0.42 back — forty-seven degrees — and
        # the contact pose photographed as a fencing lunge. Stride length is the
        # easiest thing to overdo, because each number looks small on its own.
        "UpperLegL": {"x": [(1, 0.23), (5, 0.15), (9, -0.02), (13, -0.17),
                            (17, -0.24), (21, -0.14), (25, 0.06), (29, 0.18), (32, 0.23)]},
        "UpperLegR": {"x": [(1, -0.24), (5, -0.14), (9, 0.06), (13, 0.18),
                            (17, 0.23), (21, 0.15), (25, -0.02), (29, -0.17), (32, -0.24)]},
        # A knee bends one way only. It is nearly straight at contact, folds to
        # absorb the weight, straightens over the stance, and folds hard to
        # clear the ground on the way through.
        "LowerLegL": {"x": [(1, -0.05), (5, -0.26), (9, -0.10), (13, -0.24),
                            (17, -0.46), (21, -0.55), (25, -0.34), (29, -0.08), (32, -0.05)]},
        "LowerLegR": {"x": [(1, -0.46), (5, -0.55), (9, -0.34), (13, -0.08),
                            (17, -0.05), (21, -0.26), (25, -0.10), (29, -0.24), (32, -0.46)]},
        # Heel strike, flat, toe-off. Small numbers — a foot only has about
        # twenty-five degrees in it — and they carry a surprising amount.
        # SIGNS REVERSED WITH THE BONE. Turning the foot bone round to point
        # -Y — which is where the toes actually go — reversed what a rotation
        # about its local X means, so every heel strike became a toe-point and
        # the ankles read as inverted through the whole stride. Reported from
        # play; not visible in a single frame, because one flexed ankle looks
        # like a pose rather than a mistake.
        "FootL": {"x": [(1, -0.18), (5, -0.02), (9, 0.04), (13, 0.24),
                        (17, 0.12), (21, -0.07), (25, -0.14), (29, -0.19), (32, -0.18)]},
        "FootR": {"x": [(1, 0.12), (5, -0.07), (9, -0.14), (13, -0.19),
                        (17, -0.18), (21, -0.02), (25, 0.04), (29, 0.24), (32, 0.12)]},
        "UpperArmL": cycle_axis(0.30, -0.28, 32, 0.5),
        "UpperArmR": cycle_axis(0.30, -0.28, 32, 0.0),
        # The forearm lags the upper arm by a couple of frames, which is the
        # cheapest possible follow-through and the most visible.
        "LowerArmL": {"x": [(f + 2, v) for f, v in cycle(-0.16, -0.40, 32, 0.5)]},
        "LowerArmR": {"x": [(f + 2, v) for f, v in cycle(-0.16, -0.40, 32, 0.0)]},
        # Hips counter-rotating against the shoulders is what turns a pair of
        # swinging legs into a body walking.
        "Hips": {"z": cycle(-0.07, 0.07, 32, 0.0)},
        "Torso": {"z": cycle(0.06, -0.06, 32, 0.0), "x": [(1, 0.05), (32, 0.05)]},
        "Neck": {"x": [(1, -0.03), (32, -0.03)]},
    }, root_keys=[(1, (0, -0.012, 0)), (5, (0, -0.020, 0)), (9, (0, 0.016, 0)), (13, (0, 0.004, 0)),
                  (17, (0, -0.012, 0)), (21, (0, -0.020, 0)), (25, (0, 0.016, 0)),
                  (29, (0, 0.004, 0)), (32, (0, -0.012, 0))],
       sharp=(1, 17)))

    # RUN — not a fast walk. It has a FLIGHT PHASE, both feet off the ground,
    # and that is the whole difference: the body is thrown forward and caught,
    # rather than always supported. 20 frames, leaning into it, elbows bent
    # throughout.
    made.append(build_action(arm, "Run", 20, {
        "UpperLegL": {"x": [(1, 0.46), (4, 0.20), (7, -0.24), (10, -0.52),
                            (13, -0.20), (16, 0.20), (20, 0.46)]},
        "UpperLegR": {"x": [(1, -0.52), (4, -0.20), (7, 0.20), (10, 0.46),
                            (13, 0.20), (16, -0.24), (20, -0.52)]},
        "LowerLegL": {"x": [(1, -0.22), (4, -0.62), (7, -1.30), (10, -1.05),
                            (13, -1.40), (16, -0.70), (20, -0.22)]},
        "LowerLegR": {"x": [(1, -1.05), (4, -1.40), (7, -0.70), (10, -0.22),
                            (13, -0.62), (16, -1.30), (20, -1.05)]},
        "FootL": {"x": [(1, -0.10), (4, 0.30), (7, -0.25), (10, -0.30), (13, -0.20), (20, -0.10)]},
        "FootR": {"x": [(1, -0.30), (4, -0.20), (7, -0.10), (10, -0.10), (13, 0.30), (20, -0.30)]},
        "UpperArmL": cycle_axis(0.80, -0.60, 20, 0.5),
        "UpperArmR": cycle_axis(0.80, -0.60, 20, 0.0),
        "LowerArmL": {"x": [(f + 1, v) for f, v in cycle(-0.95, -1.35, 20, 0.5)]},
        "LowerArmR": {"x": [(f + 1, v) for f, v in cycle(-0.95, -1.35, 20, 0.0)]},
        "Hips": {"z": cycle(-0.12, 0.12, 20, 0.0)},
        "Torso": {"z": cycle(0.11, -0.11, 20, 0.0), "x": [(1, 0.20), (20, 0.20)]},
        "Neck": {"x": [(1, -0.16), (20, -0.16)]},
    }, root_keys=[(1, (0, -0.02, 0)), (4, (0, -0.05, 0)), (7, (0, 0.07, 0)), (10, (0, -0.02, 0)),
                  (13, (0, -0.05, 0)), (16, (0, 0.07, 0)), (20, (0, -0.02, 0))],
       sharp=(1, 10)))

    # ATTACK — anticipation, strike, stick, recover. The anticipation is three
    # frames of going the WRONG WAY, which is what makes the swing read as
    # deliberate rather than as the arm being teleported backwards.
    made.append(build_action(arm, "Attack", 20, {
        "UpperArmR": {"x": [(1, 0.0), (3, 0.22), (7, -1.45), (11, 0.55), (13, 0.42), (20, 0.0)],
                      "z": [(1, 0.0), (3, 0.10), (7, -0.38), (11, 0.34), (20, 0.0)]},
        "LowerArmR": {"x": [(1, -0.2), (3, -0.10), (7, -1.05), (11, -0.15), (13, -0.30), (20, -0.2)]},
        "Torso": {"y": [(1, 0.0), (3, 0.10), (7, -0.38), (11, 0.32), (20, 0.0)]},
        "Abdomen": {"y": [(1, 0.0), (7, -0.20), (11, 0.17), (20, 0.0)]},
        # The head stays on the target rather than following the shoulders
        # round, and arrives a frame late, which is the follow-through.
        "Neck": {"y": [(1, 0.0), (8, 0.22), (12, -0.17), (20, 0.0)]},
        "UpperArmL": {"x": [(1, 0.0), (7, 0.34), (12, -0.22), (20, 0.0)]},
        "UpperLegL": {"x": [(1, 0.0), (7, -0.10), (11, 0.16), (20, 0.0)]},
        "UpperLegR": {"x": [(1, 0.0), (7, 0.12), (11, -0.14), (20, 0.0)]},
    }, sharp=(11,)))

    # CHOP, MINE and PICK — the three the borrowed pack had no answer for, and
    # the reason this rig exists.
    #
    # THE WIND-UP GOES OVERHEAD. At 1.55 radians the arms reached about
    # forty-five degrees above horizontal and the pose read as "hands up" rather
    # than as an axe about to fall. A swing is sold by how far back it gathers.
    made.append(build_action(arm, "Chop", 24, {
        # Diagonally across the body: a blade meets a trunk side-on.
        "UpperArmR": {"x": [(1, 0.0), (3, 0.18), (10, -2.35), (14, 0.62), (16, 0.48), (24, 0.0)],
                      "z": [(1, 0.0), (10, -0.45), (14, 0.42), (24, 0.0)]},
        "LowerArmR": {"x": [(1, -0.25), (10, -1.05), (14, -0.18), (16, -0.34), (24, -0.25)]},
        "UpperArmL": {"x": [(1, -0.2), (3, 0.0), (10, -2.10), (14, 0.48), (16, 0.36), (24, -0.2)],
                      "z": [(1, 0.35), (10, 0.58), (14, 0.30), (24, 0.35)]},
        "LowerArmL": {"x": [(1, -0.5), (10, -1.00), (14, -0.32), (24, -0.5)]},
        "Torso": {"x": [(1, 0.05), (3, 0.12), (10, -0.20), (14, 0.38), (16, 0.30), (24, 0.05)],
                  "y": [(1, 0.0), (10, -0.32), (14, 0.28), (24, 0.0)]},
        "Abdomen": {"x": [(1, 0.0), (10, -0.12), (14, 0.26), (24, 0.0)]},
        "Neck": {"x": [(1, 0.0), (11, 0.14), (15, -0.24), (24, 0.0)]},
        # The knees dip as the blade lands, which is where the force goes.
        "UpperLegL": {"x": [(1, 0.0), (14, 0.22), (17, 0.08), (24, 0.0)]},
        "UpperLegR": {"x": [(1, 0.0), (14, 0.22), (17, 0.08), (24, 0.0)]},
        "LowerLegL": {"x": [(1, -0.04), (14, -0.38), (17, -0.16), (24, -0.04)]},
        "LowerLegR": {"x": [(1, -0.04), (14, -0.38), (17, -0.16), (24, -0.04)]},
    }, sharp=(14,)))

    made.append(build_action(arm, "Mine", 22, {
        # Higher and straighter than the chop — almost no sideways travel — and
        # it REBOUNDS off the stone instead of biting into it. A pick bounces;
        # an axe sticks. That one difference is most of what tells them apart.
        "UpperArmR": {"x": [(1, 0.0), (3, 0.20), (9, -2.60), (13, 0.55), (15, 0.05), (17, 0.28), (22, 0.0)],
                      "z": [(1, 0.0), (9, -0.12), (13, 0.10), (22, 0.0)]},
        "LowerArmR": {"x": [(1, -0.25), (9, -1.10), (13, -0.08), (15, -0.42), (22, -0.25)]},
        "UpperArmL": {"x": [(1, -0.2), (3, 0.0), (9, -2.40), (13, 0.48), (15, 0.0), (17, 0.22), (22, -0.2)],
                      "z": [(1, 0.30), (9, 0.44), (13, 0.26), (22, 0.30)]},
        "LowerArmL": {"x": [(1, -0.5), (9, -1.05), (13, -0.22), (22, -0.5)]},
        "Torso": {"x": [(1, 0.06), (3, 0.14), (9, -0.14), (13, 0.44), (15, 0.26), (22, 0.06)]},
        "Abdomen": {"x": [(1, 0.0), (9, -0.08), (13, 0.28), (22, 0.0)]},
        "UpperLegL": {"x": [(1, 0.0), (13, 0.34), (16, 0.12), (22, 0.0)]},
        "UpperLegR": {"x": [(1, 0.0), (13, 0.34), (16, 0.12), (22, 0.0)]},
        "LowerLegL": {"x": [(1, -0.04), (13, -0.50), (16, -0.20), (22, -0.04)]},
        "LowerLegR": {"x": [(1, -0.04), (13, -0.50), (16, -0.20), (22, -0.04)]},
        "Neck": {"x": [(1, 0.0), (10, 0.12), (14, -0.26), (22, 0.0)]},
    }, sharp=(13,)))

    made.append(build_action(arm, "Pick", 30, {
        # No swing at all. The body folds down over the bush, the near hand goes
        # in, CLOSES — a distinct beat, not a smooth pass — and comes back to
        # the chest with what it took.
        "Torso": {"x": [(1, 0.0), (9, 0.32), (22, 0.30), (30, 0.0)],
                  "y": [(1, 0.0), (15, -0.18), (30, 0.0)]},
        "Abdomen": {"x": [(1, 0.0), (9, 0.20), (22, 0.18), (30, 0.0)]},
        "Neck": {"x": [(1, 0.0), (9, 0.24), (22, 0.22), (30, 0.0)]},
        "UpperArmR": {"x": [(1, 0.0), (11, -1.10), (17, -1.18), (24, -0.30), (30, 0.0)],
                      "y": [(1, 0.0), (14, -0.32), (30, 0.0)],
                      "z": [(1, 0.0), (14, 0.24), (30, 0.0)]},
        # The fold is the grab: fast in, held for three frames, then drawn back.
        "LowerArmR": {"x": [(1, -0.2), (11, -0.72), (15, -1.40), (18, -1.48), (24, -0.55), (30, -0.2)]},
        "FistR": {"x": [(1, 0.0), (15, -0.35), (18, -0.40), (24, -0.10), (30, 0.0)]},
        # The other hand steadies the branch, which is what a picker's does.
        "UpperArmL": {"x": [(1, 0.0), (11, -0.48), (22, -0.45), (30, 0.0)],
                      "z": [(1, 0.0), (11, 0.18), (30, 0.0)]},
        "LowerArmL": {"x": [(1, -0.2), (11, -0.90), (22, -0.85), (30, -0.2)]},
        "UpperLegL": {"x": [(1, 0.0), (9, 0.36), (22, 0.34), (30, 0.0)]},
        "UpperLegR": {"x": [(1, 0.0), (9, 0.36), (22, 0.34), (30, 0.0)]},
        "LowerLegL": {"x": [(1, -0.04), (9, -0.56), (22, -0.52), (30, -0.04)]},
        "LowerLegR": {"x": [(1, -0.04), (9, -0.56), (22, -0.52), (30, -0.04)]},
    }, sharp=(15,)))

    # HIT — a flinch. Short, or it eats the time the player needs to react, and
    # the whole thing is the first two frames.
    made.append(build_action(arm, "Hit", 14, {
        "Torso": {"x": [(1, 0.0), (3, -0.34), (8, 0.10), (14, 0.0)],
                  "z": [(1, 0.0), (3, 0.12), (14, 0.0)]},
        "Abdomen": {"x": [(1, 0.0), (3, -0.20), (14, 0.0)]},
        "Neck": {"x": [(1, 0.0), (3, -0.32), (8, 0.12), (14, 0.0)]},
        "UpperArmL": {"x": [(1, 0.0), (3, 0.38), (14, 0.0)], "z": [(1, 0.0), (3, 0.28), (14, 0.0)]},
        "UpperArmR": {"x": [(1, 0.0), (3, 0.38), (14, 0.0)], "z": [(1, 0.0), (3, -0.28), (14, 0.0)]},
        "UpperLegL": {"x": [(1, 0.0), (4, 0.16), (14, 0.0)]},
        "UpperLegR": {"x": [(1, 0.0), (4, 0.12), (14, 0.0)]},
        "LowerLegL": {"x": [(1, -0.04), (4, -0.24), (14, -0.04)]},
        "LowerLegR": {"x": [(1, -0.04), (4, -0.20), (14, -0.04)]},
    }, sharp=(3,)))

    # DEATH — buckle, fall, LAND, settle. The landing is an impact like any
    # other and was the clip most obviously hurt by everything easing: a body
    # that decelerates into the floor is a body being lowered onto it.
    made.append(build_action(arm, "Death", 34, {
        "Torso": {"x": [(1, 0.0), (6, -0.30), (14, 0.35), (22, 0.95), (26, 1.02), (34, 0.95)]},
        "Abdomen": {"x": [(1, 0.0), (6, -0.18), (14, 0.22), (22, 0.55), (34, 0.55)]},
        "Neck": {"x": [(1, 0.0), (5, -0.34), (14, 0.30), (22, 0.62), (26, 0.70), (34, 0.60)]},
        "UpperArmL": {"x": [(1, 0.0), (8, 0.45), (22, 1.05), (26, 1.15), (34, 1.05)],
                      "z": [(1, 0.0), (34, 0.38)]},
        "UpperArmR": {"x": [(1, 0.0), (8, 0.45), (22, 1.05), (26, 1.15), (34, 1.05)],
                      "z": [(1, 0.0), (34, -0.38)]},
        "LowerArmL": {"x": [(1, -0.06), (14, -0.55), (26, -0.20), (34, -0.30)]},
        "LowerArmR": {"x": [(1, -0.06), (14, -0.55), (26, -0.20), (34, -0.30)]},
        # The knees go first, which is what a collapse is.
        "UpperLegL": {"x": [(1, 0.0), (10, 0.50), (22, 1.10), (34, 1.10)]},
        "UpperLegR": {"x": [(1, 0.0), (11, 0.42), (22, 1.00), (34, 1.00)]},
        "LowerLegL": {"x": [(1, -0.04), (10, -0.80), (22, -1.20), (34, -1.20)]},
        "LowerLegR": {"x": [(1, -0.04), (11, -0.70), (22, -1.05), (34, -1.05)]},
    }, root_keys=[(1, (0, 0, 0)), (10, (0, -0.16, 0)), (22, (0, -0.62, 0)),
                  (26, (0, -0.60, 0)), (34, (0, -0.62, 0))],
       sharp=(22,)))

    return made


def cycle_axis(a, b, length, phase=0.0):
    """`cycle` wrapped as a one-axis table, since most swinging joints are."""
    return {"x": cycle(a, b, length, phase)}
