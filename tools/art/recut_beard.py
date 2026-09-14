# CUTTING THE HAIR BACK OUT OF THE MONK'S "BEARD".
#
#   blender --background --factory-startup --python tools/art/recut_beard.py
#
# `look_pieces.py` sorts the Monk's face mesh into islands and files them by
# where they sit, and its note calls this group "the 26 clumps that wrap the
# jaw". Measured in the running game, the group spans y 1.21 to 1.68 against a
# nose at 1.44-1.55 and a skull topping out at 1.80 — so it reaches well ABOVE
# the eyes, up beside the ears, and it is wider than the skull on both sides.
# From the side those clumps sit behind and above the ear. That is the Monk's
# side hair, swept into the beard group by a threshold that was too generous.
#
# It looked like a placement bug for two milestones and was not: M70.322 fixed a
# real 0.105 offset, and this group still read wrong afterwards because half of
# it was never beard.
#
# WHICH WAY IS UP IS MEASURED, NOT ASSUMED. A previous pass at these files
# produced confident numbers from a guessed axis conversion and they were
# nonsense — the piece files and `Player_Base.glb` do not obviously agree. So the
# vertical axis is derived from the body itself: a face has its BROWS ABOVE ITS
# NOSE, both are present on the player as separate meshes, and the axis and sign
# that separates them is the one this script trusts.

import os

import bpy
import mathutils

MODELS = "client/public/models"
HAIR = f"{MODELS}/hair"
SOURCE = "Monk_beard"
# THE MOUSTACHE GOES BACK IN, because the Monk wears both and the creator was
# offering each half separately.
#
# `tools/art/monk_head_shot.py` photographs the source — which should have
# happened before any of this was cut — and the Monk's face is a jaw fringe of
# pale clumps running from the temple down the jaw, WITH a moustache, and almost
# nothing on the chin itself. Split into two styles, each half reads as a thin
# outline round a bare face; that is what "looks pretty weird" was seeing, and no
# amount of adjusting the height threshold was going to fix it, because the
# geometry was never the problem after the hair came out.
#
# Together they are the Monk, and the ladder the creator offers is then honest:
# a moustache alone, the Monk's full face, or the Wizard's proper beard.
MERGE = "Monk_moustache"
OUT = "Monk_jaw"


def load(path, fresh=True):
    if fresh:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)


def box(objs):
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        mw = obj.matrix_world
        for v in obj.data.vertices:
            p = mw @ v.co
            lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
            hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
    return lo, hi


def named(substr):
    return [o for o in bpy.data.objects if o.type == "MESH" and substr in o.name.lower()]


def main():
    root = os.getcwd()

    # --- which axis is up, and the height of the eye line -------------------
    load(os.path.join(root, MODELS, "Player_Base.glb"))
    nose = named("nose")
    brow = named("brow")
    if not nose or not brow:
        print("player has no nose/brow meshes to orient by")
        return
    nlo, nhi = box(nose)
    blo, bhi = box(brow)
    ncentre = (nlo + nhi) / 2
    bcentre = (blo + bhi) / 2
    diff = bcentre - ncentre
    axis = max(range(3), key=lambda i: abs(diff[i]))
    up = 1.0 if diff[axis] > 0 else -1.0
    print(f"up axis = {'xyz'[axis]}, sign {up:+.0f}  (brow - nose = {diff[axis]:+.3f})")

    # The top of the nose is the eye line, near enough. A beard may carry
    # sideburns to about there; anything above it is hair.
    limit = (nhi[axis] if up > 0 else nlo[axis])
    print(f"eye line at {'xyz'[axis]} = {limit:.3f}")

    # --- split the group and keep only what is below it ---------------------
    load(os.path.join(root, HAIR, f"{SOURCE}.glb"))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        print(f"{SOURCE}: nothing imported")
        return
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    whole = bpy.context.view_layer.objects.active

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    islands = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"{SOURCE}: {len(islands)} islands")

    keep, drop = [], []
    for isle in islands:
        ilo, ihi = box([isle])
        # The island's TOP against the eye line. Judging by the centre would keep
        # a long lock whose middle happens to fall low while its root is up at
        # the temple, which is exactly the geometry being removed.
        top = ihi[axis] if up > 0 else ilo[axis]
        above = (top > limit) if up > 0 else (top < limit)
        (drop if above else keep).append(isle)

    print(f"keeping {len(keep)}, dropping {len(drop)} that reach above the eye line")
    if not keep:
        print("REFUSING to write an empty beard")
        return

    for isle in drop:
        bpy.data.objects.remove(isle, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    for o in keep:
        o.select_set(True)
    bpy.context.view_layer.objects.active = keep[0]
    if len(keep) > 1:
        bpy.ops.object.join()
    result = bpy.context.view_layer.objects.active

    # --- and the moustache, so the style is the Monk's whole face ------------
    before = set(bpy.data.objects)
    load(os.path.join(root, HAIR, f"{MERGE}.glb"), fresh=False)
    added = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if not added:
        print(f"{MERGE}: nothing imported; writing the jaw alone")
    else:
        # Counted BEFORE the join: joining frees the source objects, and reading
        # one afterwards raises "StructRNA of type Object has been removed".
        merged_verts = sum(len(o.data.vertices) for o in added)
        bpy.ops.object.select_all(action="DESELECT")
        for o in added:
            o.select_set(True)
        result.select_set(True)
        bpy.context.view_layer.objects.active = result
        bpy.ops.object.join()
        result = bpy.context.view_layer.objects.active
        print(f"merged {MERGE} ({merged_verts} verts)")

    rlo, rhi = box([result])
    print(f"result box {'xyz'[axis]} [{rlo[axis]:.3f},{rhi[axis]:.3f}]  verts {len(result.data.vertices)}")

    bpy.ops.object.select_all(action="DESELECT")
    result.select_set(True)
    bpy.context.view_layer.objects.active = result
    out = os.path.join(root, HAIR, f"{OUT}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
    )
    print(f"EXPORTED {out}")


main()
