# WHAT ARE THE GAME'S CHARACTER'S ACTUAL PROPORTIONS?
#
# Our body was authored from numbers I chose and then adjusted five times by
# looking at it alone, which is how it ended up as an artist's mannequin beside
# a character: thin even-width limbs, a small head on a visible neck, no mass
# anywhere. Every one of those adjustments was a guess dressed as a judgement.
#
# The Monk shares the 44-bone skeleton this rig deliberately copied the NAMES
# from, so its proportions are readable rather than guessable. This prints them
# normalised to a 1.8-unit body, which is what `player_rig.py` should be built
# around — and prints the mesh's WIDTHS per band too, since a skeleton says
# where the joints are and nothing about how heavy the limbs on it look.
#
#   blender --background --python tools/art/measure_monk.py -- client/public/models/Monk.fbx

import sys

import bpy

HEIGHT = 1.8
BONES = [
    "Hips", "Abdomen", "Torso", "Neck", "Head",
    "ShoulderL", "UpperArmL", "LowerArmL", "FistL",
    "UpperLegL", "LowerLegL", "FootL",
]


def main():
    path = sys.argv[-1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=path)

    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not arm:
        print("NO ARMATURE")
        return

    # Everything is in world space and the FBX arrives at about a hundred times
    # scale, so one factor normalises both the skeleton and the mesh.
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    lo_z, hi_z = min(zs), max(zs)
    k = HEIGHT / (hi_z - lo_z)
    print(f"raw height {hi_z - lo_z:.2f}, scaling by {k:.4f}")

    print("\nBONE POSITIONS, normalised to a 1.8 body (height above the floor):")
    for name in BONES:
        b = arm.data.bones.get(name)
        if not b:
            print(f"  {name}: missing")
            continue
        head = arm.matrix_world @ b.head_local
        tail = arm.matrix_world @ b.tail_local
        print(
            f"  {name:<12} head z={(head.z - lo_z) * k:.3f} x={head.x * k:+.3f}"
            f"   tail z={(tail.z - lo_z) * k:.3f} x={tail.x * k:+.3f}"
        )

    # WIDTH PER BAND. The skeleton says where the joints are; it says nothing
    # about how heavy the body around them looks, and "too thin" was the whole
    # complaint. Slicing the mesh horizontally and reading its extent is the
    # only honest answer to how wide a chest is.
    print("\nMESH WIDTH by height, normalised (x span, y span):")
    for i in range(18):
        lo = i / 18 * HEIGHT
        hi = (i + 1) / 18 * HEIGHT
        xs = []
        ys = []
        for o in meshes:
            for v in o.data.vertices:
                w = o.matrix_world @ v.co
                z = (w.z - lo_z) * k
                if lo <= z < hi:
                    xs.append(w.x * k)
                    ys.append(w.y * k)
        if not xs:
            continue
        print(f"  z {lo:.2f}-{hi:.2f}:  wide {max(xs) - min(xs):.3f}   deep {max(ys) - min(ys):.3f}")


main()
