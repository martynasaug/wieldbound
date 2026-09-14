# FITTING ANY DONOR'S ART TO THE BODY THE PLAYER ACTUALLY WEARS.
#
#   blender --background --factory-startup --python tools/art/register.py
#       (prints the table; import it from a harvest script to use it)
#
# THE PROBLEM THIS EXISTS TO END. Every wearable in this game is cut from one of
# the pack's characters, and those characters do not share a body. Measured:
#
#     Rogue    skull 0.670 x 0.814 x 0.890     <- the player wears this one
#     Monk           0.668 x 0.812 x 0.887        the same head, to 0.3%
#     Wizard         0.678 x 0.824 x 0.915        1-3% larger
#     Warrior        0.571 x 0.760 x 0.811        15% narrower, 9% shorter
#     Ranger         0.572 x 0.761 x 0.727        16% narrower, 18% SHORTER
#
# So a piece harvested from the Monk or the Wizard fits by luck, and a piece from
# the Warrior or the Ranger does not. That has been discovered twice, separately,
# from scratch: the Warrior's hair came out a size too small and read as a bald
# patch, and the Ranger's hood came out a size too small and let the crown of the
# head through the top of it. Both times the fault was diagnosed as placement,
# corrected as placement, and only then measured.
#
# `skull_compare.py` would have said so the first time and was never asked,
# because it lists only the characters that had already been harvested from — the
# Ranger is not in it. A table that describes some of the donors is how you get
# surprised by the rest.
#
# THE RULE, AND IT IS SHORT:
#
#   * Art HARVESTED from a donor must be registered onto the wearer's body before
#     it is exported. That is this file.
#   * Art AUTHORED from the kit is built against the wearer's own landmarks
#     already — `armour.py`'s `BODY` table is measured off this same body — so it
#     needs nothing.
#
# Scale first, about the donor's own head centre, then translate the centres
# together. Doing it the other way round moves the piece and then grows it away
# from where it was put.

import os

import bpy
import mathutils

MODELS = "client/public/models"

# The file the player's body is stripped from. `base_body.py` builds
# `Player_Base.glb` out of this, so this is the head every wearable has to fit.
#
# MEASURED FROM THE FBX AND NOT FROM `Player_Base.glb`, deliberately: the donors
# are FBX, and comparing two files in the same format is a subtraction instead of
# an axis conversion. Every axis error in this phase came from converting between
# the two, including a scalp cap that came out as a ring standing on edge.
WEARER = "Rogue.fbx"

DONORS = ("Rogue.fbx", "Monk.fbx", "Wizard.fbx", "Warrior.fbx", "Ranger.fbx")


def head_box():
    """World box of the vertices this rig's Head bone dominates, or None."""
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    n = 0
    for obj in [o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups]:
        idx = {g.index for g in obj.vertex_groups if g.name.replace(".", "") == "Head"}
        if not idx:
            continue
        mw = obj.matrix_world
        for v in obj.data.vertices:
            # DOMINANT, not merely present: a throat vertex shared with the spine
            # is not part of the skull, and counting it stretches the box down the
            # neck and quietly changes every ratio derived from it.
            w = sum(g.weight for g in v.groups if g.group in idx)
            total = sum(g.weight for g in v.groups) or 1.0
            if w / total <= 0.5:
                continue
            q = mw @ v.co
            lo = mathutils.Vector((min(lo[i], q[i]) for i in range(3)))
            hi = mathutils.Vector((max(hi[i], q[i]) for i in range(3)))
            n += 1
    return (lo, hi) if n else None


def load(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(os.getcwd(), MODELS, name))


def wearer_head():
    """The player's skull, measured fresh. Cheap, and never stale."""
    load(WEARER)
    box = head_box()
    if not box:
        raise RuntimeError(f"{WEARER} has no Head-weighted vertices")
    return box


def registration(donor_box, wearer_box):
    """(scale, shift) taking a donor's head onto the wearer's."""
    dlo, dhi = donor_box
    wlo, whi = wearer_box
    dsize, wsize = dhi - dlo, whi - wlo
    scale = mathutils.Vector((
        wsize[i] / dsize[i] if dsize[i] > 1e-6 else 1.0 for i in range(3)
    ))
    return scale, ((wlo + whi) / 2), ((dlo + dhi) / 2)


def fit(obj, donor_box, wearer_box):
    """Scale a harvested object onto the wearer's head, then move it there."""
    scale, wearer_centre, donor_centre = registration(donor_box, wearer_box)
    for vert in obj.data.vertices:
        vert.co = mathutils.Vector((
            donor_centre[i] + (vert.co[i] - donor_centre[i]) * scale[i] for i in range(3)
        ))
    obj.location = obj.location + (wearer_centre - donor_centre)
    return scale, wearer_centre - donor_centre


def main():
    wearer = wearer_head()
    wlo, whi = wearer
    wsize = whi - wlo
    print("")
    print(f"WEARER {WEARER:<14} size({wsize.x:.3f},{wsize.y:.3f},{wsize.z:.3f})")
    print("")
    print(f"{'donor':<14}{'size':>26}{'scale onto the wearer':>30}")
    for name in DONORS:
        load(name)
        box = head_box()
        if not box:
            print(f"{name:<14} no Head-weighted vertices")
            continue
        lo, hi = box
        size = hi - lo
        scale, _, _ = registration(box, wearer)
        flag = "" if max(abs(scale.x - 1), abs(scale.y - 1), abs(scale.z - 1)) < 0.05 else "   <- needs fitting"
        print(f"{name:<14} ({size.x:6.3f},{size.y:6.3f},{size.z:6.3f})   "
              f"({scale.x:5.3f},{scale.y:5.3f},{scale.z:5.3f}){flag}")


if __name__ == "__main__":
    main()
