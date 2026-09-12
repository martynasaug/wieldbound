# WHAT ARMOUR HAS TO FIT: THE BODY, BONE BY BONE, IN THE UNITS ARMOUR IS
# AUTHORED IN.
#
#   blender --background --factory-startup --python tools/art/body_frame.py -- <Monk.fbx>
#
# `gear.ts` writes armour as absolute numbers on a standing character — a dome
# at y=296, a boot at y=5 — and those numbers came from measuring this rig once.
# There are a dozen of them and they cover the head, chest, waist and feet; a
# remake needs every bone, and needs them again for any new body.
#
# TWO CANDIDATE MAPPINGS, because the game's rest frame is Y-up and the model's
# own mesh space is Z-up metres (measured: the Monk's geometry reads -1.6..1.6
# across and 0..2.9 up, and the skeleton's bind matrix carries the hundredfold).
# Rather than assume which way the front faces, both are printed and checked
# against the constants already in `gear.ts` — HEAD_TOP 296, HEAD_BOTTOM 205,
# HEAD_HALF_WIDTH 33, HEAD_FRONT_Z 32, HEAD_BACK_Z -46, CHEST_TOP 202,
# CHEST_BOTTOM 150, WAIST_Y 146, SHOULDER_X 35, SHOULDER_Y 187, FOOT_Y 5,
# FOOT_Z 11, FOOT_X 23.6 — so the answer is confirmed rather than guessed.

import collections
import sys

import bpy
from mathutils import Vector

# The named numbers in gear.ts, to check the mapping against.
KNOWN = {
    "HEAD_TOP": 296, "HEAD_BOTTOM": 205, "HEAD_HALF_WIDTH": 33,
    "HEAD_FRONT_Z": 32, "HEAD_BACK_Z": -46,
    "CHEST_TOP": 202, "CHEST_BOTTOM": 150, "WAIST_Y": 146,
    "SHOULDER_X": 35, "SHOULDER_Y": 187,
    "FOOT_Y": 5, "FOOT_Z": 11, "FOOT_X": 23.6,
}


def rest_a(p):
    """Mesh space (metres, Z up) to the game's rest frame, front on +z."""
    return Vector((p.x * 100.0, p.z * 100.0, -p.y * 100.0))


def rest_b(p):
    """The same, with the front the other way."""
    return Vector((p.x * 100.0, p.z * 100.0, p.y * 100.0))


def extents(points):
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi


def main():
    fbx = sys.argv[sys.argv.index("--") + 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.data.pose_position = "REST"
    body = bpy.data.objects["Monk"]
    me = body.data
    groups = {g.index: g.name for g in body.vertex_groups}

    region = collections.defaultdict(list)
    for v in me.vertices:
        if not v.groups:
            continue
        bone = groups[max(v.groups, key=lambda g: g.weight).group]
        region[bone].append(v.co.copy())

    # Which way is the face? The head is longer behind than in front (gear.ts
    # has HEAD_FRONT_Z 32 against HEAD_BACK_Z -46), so the mapping whose head
    # runs +32/-46 rather than +46/-32 is the right one.
    head = region.get("Head", [])
    for name, fn in (("A (front +z = -y)", rest_a), ("B (front +z = +y)", rest_b)):
        lo, hi = extents([fn(p) for p in head])
        print(f"MAPPING {name}: head z {lo.z:+.0f}..{hi.z:+.0f}, y {lo.y:.0f}..{hi.y:.0f}, half width {hi.x:.0f}")

    print("\nBONE                 x            y            z         (rest frame, mapping A)")
    for bone, points in sorted(region.items(), key=lambda kv: -len(kv[1])):
        lo, hi = extents([rest_a(p) for p in points])
        print(f"{bone:<16} {lo.x:7.1f}..{hi.x:<7.1f} {lo.y:7.1f}..{hi.y:<7.1f} {lo.z:7.1f}..{hi.z:<7.1f} ({len(points)} verts)")

    print("\nBONE HEADS AND TAILS (rest frame, mapping A)")
    for bone in arm.data.bones:
        h, t = rest_a(bone.head_local), rest_a(bone.tail_local)
        print(f"{bone.name:<16} head {h.x:7.1f} {h.y:7.1f} {h.z:7.1f}   tail {t.x:7.1f} {t.y:7.1f} {t.z:7.1f}")

    print("\nAGAINST THE CONSTANTS IN gear.ts")
    for name, value in KNOWN.items():
        print(f"  {name:<16} {value}")
    print("DONE")


main()
