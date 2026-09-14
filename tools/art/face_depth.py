# HOW FAR THE FACE STICKS OUT IN FRONT OF THE SKULL.
#
#   blender --background --factory-startup --python tools/art/face_depth.py
#
# `skull_compare.py` settled that the Monk's skull and the Rogue's are the same
# skull to within 0.3%, which kills the obvious explanation for beards floating
# in front of the player's face. The remaining candidate is the FACE MESH: every
# beard was cut from `Monk.001` or `Face`, which sit ON the shared skull and
# carry the character's own nose, lips and jaw. A beard authored to wrap a face
# with a lot of forward volume will stand off a flatter one.
#
# So this measures the front of each feature mesh against the front of the skull
# it sits on — the overhang a piece was authored against.
#
# AXES: these FBX files are Z-up, and the face looks along -Y (confirmed by the
# nose being the minimum-Y vertex of the feature mesh). The glTF player base is
# Y-up and looks along +Z, which is why it is reported separately rather than
# compared number-to-number.

import os

import bpy
import mathutils

SUBJECTS = [
    ("Monk", "client/public/models/Monk.fbx", "Monk.001"),
    ("Wizard", "client/public/models/Wizard.fbx", "Face"),
    ("Warrior", "client/public/models/Warrior.fbx", "Face"),
    ("Rogue", "client/public/models/Rogue.fbx", "Face"),
]


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)


def skull_span(axis):
    lo, hi = 1e9, -1e9
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        groups = {g.index: g.name for g in obj.vertex_groups}
        head_idx = {i for i, n in groups.items() if n in ("Head", "Head_end")}
        if not head_idx:
            continue
        mw = obj.matrix_world
        for v in obj.data.vertices:
            w = sum(g.weight for g in v.groups if g.group in head_idx)
            total = sum(g.weight for g in v.groups) or 1.0
            if w / total <= 0.5:
                continue
            p = (mw @ v.co)[axis]
            lo, hi = min(lo, p), max(hi, p)
    return lo, hi


def mesh_span(name, axis):
    obj = bpy.data.objects.get(name)
    if not obj:
        return None
    mw = obj.matrix_world
    lo, hi = 1e9, -1e9
    for v in obj.data.vertices:
        p = (mw @ v.co)[axis]
        lo, hi = min(lo, p), max(hi, p)
    return lo, hi


def main():
    root = os.getcwd()
    print("")
    print("character    skull front   face front   OVERHANG")
    for name, rel, face in SUBJECTS:
        path = os.path.join(root, rel)
        if not os.path.exists(path):
            print(f"{name:12s} MISSING")
            continue
        load(path)
        # Y is depth in these files, and the face looks along -Y, so "front" is
        # the MINIMUM.
        s = skull_span(1)
        f = mesh_span(face, 1)
        if not f:
            print(f"{name:12s} skull front {s[0]:7.3f}   no mesh named {face!r}")
            continue
        print(f"{name:12s} {s[0]:9.3f}   {f[0]:9.3f}   {s[0] - f[0]:8.3f}")


main()
