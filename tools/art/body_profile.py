# HOW WIDE AND HOW DEEP THE BODY IS, AT EVERY HEIGHT.
#
#   blender --background --factory-startup --python tools/art/body_profile.py
#
# THE PROBLEM THIS EXISTS TO END. `armour.py` carries a `BODY` table of about
# twenty numbers — `chest_half_x`, `chest_front_z`, `head_half_x` and so on —
# and every piece in the game is sized from them. They are single numbers for
# whole regions, and a body is not a stack of cylinders, so a piece cut to one of
# them is right at exactly one height and wrong above and below it.
#
# That has now gone wrong twice in the same phase, in opposite directions:
#
#   THE SKULL   `head_half_x` is 33, the WIDEST point. The skullcap's cheek arc
#               was built at 32.4 and the temples came through it; the
#               correction widened every station to 39, including the jaw where
#               the skull is only 25.4, and produced a bucket.
#               `skull_profile.py` was written to settle that one.
#
#   THE COLLAR  chain's standing collar is radius 13 at the neck, and the body's
#               chest front reaches z 21 — so the collar sits INSIDE the body,
#               draws nothing, and the throat is bare from the chin to the
#               breastplate. Reported: "the armors are especially showing a lot
#               of character skin."
#
# So this does for the whole body what `skull_profile.py` does for the head: it
# prints the real half-width and the real front and back, in bands, in the units
# the `BODY` table uses. A collar can then be cut to the neck it goes round.
#
# UNITS. `BODY` is in hundredths of the donor's units — the skull is 0.890 tall
# in the FBX and 89 tall in the table — and the table pins the head at 206..295,
# so everything here is scaled and shifted to land on that same ruler.

import os
import sys

import bpy
import mathutils

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import register  # noqa: E402

MODELS = "client/public/models"

# The `BODY` table's own head landmarks, which fix the ruler.
HEAD_Y0 = 206.0
HEAD_Y1 = 295.0

# Printed from the hips up: this exists for collars, chests and shoulders, and
# the legs have never been the problem.
FROM, TO, STEP = 120.0, 230.0, 5.0

# Too few vertices in a band and the answer describes where the vertices happen
# to be rather than where the body is. `register.py` pays for the same lesson
# with its `SCALE_LIMIT`.
THIN = 3


# THE TORSO ONLY, AND THIS IS NOT A REFINEMENT — IT IS THE WHOLE MEASUREMENT.
#
# The body is bound in a T-POSE, so at shoulder height the outermost vertex of
# the mesh is a FINGERTIP. Measured without this filter the profile reported a
# half-width of 155 across the chest, which is an arm span, and any collar or
# breastplate cut to it would be a table.
TORSO_BONES = ("Torso", "Abdomen", "Chest", "Spine", "Waist", "Hip", "Neck")


def body_points():
    """
    Vertices the wearer's SPINE owns, in world space.

    Dominant weight only, the same rule `register.bone_box` uses: a vertex the
    shoulder shares with the arm belongs to neither cleanly, and counting it
    drags the torso's box out along the arm.
    """
    out = []
    for obj in [o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups]:
        if len(obj.data.vertices) < 200:
            continue
        wanted = {
            g.index for g in obj.vertex_groups
            if any(b in g.name.replace(".", "") for b in TORSO_BONES)
        }
        if not wanted:
            continue
        mw = obj.matrix_world
        for v in obj.data.vertices:
            w = sum(g.weight for g in v.groups if g.group in wanted)
            total = sum(g.weight for g in v.groups) or 1.0
            if w / total > 0.5:
                out.append(mw @ v.co)
    return out


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(
        filepath=os.path.join(os.getcwd(), MODELS, register.WEARER))

    head = register.head_box()
    if not head:
        print(f"no Head-weighted vertices on {register.WEARER}")
        return
    pts = body_points()
    if not pts:
        print("no body mesh")
        return

    # The ruler: the head box is 206..295 by definition of the table.
    scale = (HEAD_Y1 - HEAD_Y0) / (head[1].z - head[0].z)
    base = head[0].z

    def to_body(z):
        return HEAD_Y0 + (z - base) * scale

    def to_world(y):
        return base + (y - HEAD_Y0) / scale

    # Measured about the body's own centre line, not the world's.
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2

    print("")
    print(f"BODY PROFILE from {register.WEARER}, in the units `armour.py`'s BODY table uses")
    print("")
    print(f"{'y':>6}{'half_x':>9}{'front_z':>9}{'back_z':>9}{'n':>6}")

    y = FROM
    while y <= TO:
        lo, hi = to_world(y - STEP / 2), to_world(y + STEP / 2)
        band = [p for p in pts if lo <= p.z <= hi]
        if band:
            half = max(abs(p.x - cx) for p in band) * scale
            front = max(p.y - cy for p in band) * scale
            back = min(p.y - cy for p in band) * scale
            flag = "   <- too few to trust" if len(band) < THIN else ""
            print(f"{y:6.0f}{half:9.1f}{front:9.1f}{back:9.1f}{len(band):6d}{flag}")
        else:
            print(f"{y:6.0f}{'-':>9}{'-':>9}{'-':>9}{0:6d}")
        y += STEP

    print("")
    print("A collar has to clear `half_x` and `front_z` at the height it sits at,")
    print("or it draws inside the body and the throat stays bare.")


main()
