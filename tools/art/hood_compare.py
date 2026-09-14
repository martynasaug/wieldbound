# DOES THE HOOD COVER OUR HEAD THE WAY IT COVERS THE RANGER'S?
#
#   blender --background --factory-startup --python tools/art/hood_compare.py
#
# THE PROBLEM THIS EXISTS TO END. The hood has now been reported misplaced four
# times. Every diagnosis so far was made from BOUNDING BOXES — the donor's head
# against the cloak's, the player's skull against the fitted hood's — and the
# boxes have agreed with each other every time while the picture stayed wrong.
# The last round matched the donor's box relationship to the per-cent: 71% of the
# head's depth covered on the Ranger, 71% on the player. It still came out as a
# shell hanging off the back of the skull.
#
# A BOX CANNOT SEE A HOOD. Two boxes overlap if the shapes are anywhere near each
# other; a hood is a thin surface wrapped round a sphere, and whether the skull
# is INSIDE that surface or beside it is invisible to a box test. `helmcover.mjs`
# said 43% of the skull was covered at the same moment the box test said 71% of
# the depth was. When two instruments disagree, at least one is measuring the
# wrong thing, and here it was the one every fix had been steered by.
#
# So this asks the only question that matters, on both bodies, the same way:
# standing at the centre of the head and looking outward through each of its
# vertices, is there cloth in the way?
#
#   RANGER   his own cloak over his own head. This is the TARGET — the art
#            works on him, so whatever number he scores is what a correctly
#            worn hood scores.
#   ROGUE    the harvested hood over the player's head, built by exactly the
#            pipeline `harvest_hood.py` runs.
#
# If the player's number is well under the Ranger's, the hood is not on the head,
# whatever the boxes say.

import os
import sys

import bpy
import mathutils

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import register  # noqa: E402

MODELS = "client/public/models"


def head_points(objs):
    """World positions of the vertices the Head bone dominates."""
    out = []
    for obj in objs:
        idx = {g.index for g in obj.vertex_groups if g.name.replace(".", "") == "Head"}
        if not idx:
            continue
        mw = obj.matrix_world
        for v in obj.data.vertices:
            w = sum(g.weight for g in v.groups if g.group in idx)
            total = sum(g.weight for g in v.groups) or 1.0
            if w / total > 0.5:
                out.append(mw @ v.co)
    return out


def coverage(points, cloth, label):
    """
    What fraction of these head vertices has cloth outside it.

    The ray starts a little OUTSIDE the vertex, not at it. Starting exactly on
    the surface makes the test a coin toss on whether the ray immediately hits
    the head's own skin, and this is being asked about the hood.
    """
    centre = mathutils.Vector((0, 0, 0))
    for p in points:
        centre += p
    centre /= len(points)

    inv = cloth.matrix_world.inverted()
    covered = 0
    for p in points:
        direction = (p - centre)
        if direction.length < 1e-6:
            continue
        direction.normalize()
        start = p + direction * 0.004
        hit, _, _, _ = cloth.ray_cast(inv @ start, inv.to_3x3() @ direction, distance=3.0)
        if hit:
            covered += 1
    pct = covered * 100.0 / len(points)
    print(f"{label:<28} {covered:3d}/{len(points):3d} vertices covered   {pct:5.1f}%")
    return pct


def ranger():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(os.getcwd(), MODELS, "Ranger.fbx"))
    pts = head_points([o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups])
    cloak = bpy.data.objects["Cloak"]
    return coverage(pts, cloak, "RANGER, his own cloak")


def rogue():
    """The harvested hood on the player's head, built the way `harvest_hood.py` builds it."""
    import math

    wearer = register.wearer_head()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(os.getcwd(), MODELS, "Ranger.fbx"))
    hood = bpy.data.objects["Cloak"]
    donor = register.head_box()

    world = hood.matrix_world.copy()
    hood.parent = None
    hood.matrix_world = world
    bpy.ops.object.select_all(action="DESELECT")
    hood.select_set(True)
    bpy.context.view_layer.objects.active = hood
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    head_mid = (donor[0] + donor[1]) / 2
    turn = mathutils.Matrix.Rotation(math.pi, 4, "Z")
    for vert in hood.data.vertices:
        vert.co = head_mid + turn @ (vert.co - head_mid)
    lo = mathutils.Vector((min(v.co[i] for v in hood.data.vertices) for i in range(3)))
    hi = mathutils.Vector((max(v.co[i] for v in hood.data.vertices) for i in range(3)))
    off = (lo.x + hi.x) / 2 - head_mid.x
    for vert in hood.data.vertices:
        vert.co.x -= off

    register.fit(hood, donor, wearer)
    hood_top = max((hood.matrix_world @ v.co).z for v in hood.data.vertices)
    want = wearer[1].z + 0.03
    if hood_top < want:
        hood.location.z += want - hood_top

    # The hood is now placed. Bring the PLAYER's head in beside it and measure.
    keep = hood
    keep.name = "FittedHood"
    for o in [x for x in bpy.data.objects if x is not keep]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(os.getcwd(), MODELS, register.WEARER))
    pts = head_points([o for o in bpy.data.objects
                       if o.type == "MESH" and o.vertex_groups and o is not keep])
    return coverage(pts, keep, "ROGUE, the fitted hood")


print("")
print("HOOD COVERAGE, the same question asked of both bodies")
print("")
target = ranger()
got = rogue()
print("")
if got < target - 8:
    print(f"THE HOOD IS NOT ON THE HEAD. It covers {target - got:.0f} points less of the")
    print("player's skull than the same art covers of the Ranger's.")
else:
    print("The hood sits on the player's head the way it sits on the Ranger's.")
