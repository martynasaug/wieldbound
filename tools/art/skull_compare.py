# ARE THE PACK'S SKULLS ACTUALLY THE SAME SKULL?
#
#   blender --background --factory-startup --python tools/art/skull_compare.py
#
# `look_pieces.py` opens by asserting that "Rogue, Monk and Wizard all carry the
# same ~68-face head". Every piece in the customizer rests on that claim: a
# beard cut from the Monk is dropped onto the player with no refit because the
# two heads are supposed to be one head.
#
# The claim was made from FACE COUNTS. Two heads can have the same topology and
# different sizes — same vertices, different positions — and a face count cannot
# tell them apart. This measures the geometry instead, which is what the pieces
# actually sit on.
#
# It compares the vertices the Head bone OWNS, because a mesh box would include
# the shoulders and a piece does not rest on a shoulder.

import os
import sys

import bpy
import mathutils

SUBJECTS = [
    ("Rogue", "client/public/models/Rogue.fbx"),
    ("Monk", "client/public/models/Monk.fbx"),
    ("Wizard", "client/public/models/Wizard.fbx"),
    ("Warrior", "client/public/models/Warrior.fbx"),
    ("PlayerBase", "client/public/models/Player_Base.glb"),
]


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)


def head_box(name):
    """World-space box of the vertices the Head bone dominates."""
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    count = 0
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        groups = {g.index: g.name for g in obj.vertex_groups}
        head_idx = {i for i, n in groups.items() if n in ("Head", "Head_end")}
        if not head_idx:
            continue
        mw = obj.matrix_world
        for v in obj.data.vertices:
            # Dominant, not merely present: a neck vertex shared with the spine
            # belongs to the throat, and counting it stretches the skull down.
            w = sum(g.weight for g in v.groups if g.group in head_idx)
            total = sum(g.weight for g in v.groups) or 1.0
            if w / total <= 0.5:
                continue
            p = mw @ v.co
            lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
            hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
            count += 1
    return (lo, hi, count) if count else None


def main():
    root = os.getcwd()
    print("")
    print("skull        " + "verts   size(x,y,z)".rjust(10) + "      centre(x,y,z)")
    for name, rel in SUBJECTS:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print(f"{name:12s} MISSING {rel}")
            continue
        load(path)
        box = head_box(name)
        if not box:
            print(f"{name:12s} no Head-weighted vertices")
            continue
        lo, hi, n = box
        size = hi - lo
        mid = (hi + lo) / 2
        print(
            f"{name:12s} {n:5d}  "
            f"size({size.x:6.3f},{size.y:6.3f},{size.z:6.3f})  "
            f"centre({mid.x:7.3f},{mid.y:7.3f},{mid.z:7.3f})"
        )


main()
