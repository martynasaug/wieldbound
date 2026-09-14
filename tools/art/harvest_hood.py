# THE RANGER'S OWN HOOD, HARVESTED AS THE HOOD HELM.
#
#   blender --background --factory-startup --python tools/art/harvest_hood.py
#
# Reported, twice: "the hood is looking like a regular helmet and not a hood ...
# the design itself is completely bad. Look at the default archer character
# model, he has a hood on, that's what it should look like."
#
# Both times I answered by modelling — folds, then a peak — and both times the
# result was a dome with things attached to it, because a lathe about a vertical
# axis IS a helmet and no amount of trim changes that. The pack already contains
# the shape being asked for: the Ranger wears a real hood, and it is a separate
# mesh called `Cloak` parented to the Head bone.
#
# It was in reach the whole time. `garments.py` cuts the Ranger's fittings and
# explicitly DROPS this one, because a chest item must not put a hood on the
# player's head — correct for the chest slot, and the same mesh is exactly what
# the HELM slot wants.
#
# HARVESTED, NOT MODELLED, which is the lesson this phase keeps relearning: the
# hair, the beards and the garments all came right the moment they stopped being
# built from primitives and started being cut from art someone drew.
#
# THE MATERIAL IS RENAMED TO A KIT NAME so the game's palette reaches it.
# `gear.ts` repaints armour by material NAME through `MATERIAL_LOOK`, and a piece
# arriving as `Ranger_Texture` matches nothing, falls to the metal role and is
# painted flat. Called `Steel` — which `armour.py` uses for cloth, being the
# palette's most identifying tone — a Verdant hood comes out green and a Crimson
# one red, like every other piece in the slot.

import os

import sys

import math

import bpy
import mathutils

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import register  # noqa: E402

MODELS = "client/public/models"
OUT = "client/public/models/armour/helm_hood.glb"
DONOR = "Ranger.fbx"
MESH = "Cloak"

# How far above the crown the cloth has to sit. The skull is 0.890 tall, so this
# is about three per cent of it -- enough that the head does not come through at
# the top under animation, small enough that the hood does not float.
CROWN_MARGIN = 0.03


def main():
    root = os.getcwd()

    # REGISTERED ONTO THE HEAD IT WILL BE WORN ON, by the one routine that does
    # this for every donor. See `register.py` for the table and the rule: art
    # HARVESTED from a donor is fitted here, art AUTHORED from the kit already
    # uses this body's own landmarks and needs nothing.
    #
    # Uncorrected, this hood landed 0.22 forward of the player's face with its
    # crown 0.07 BELOW the skull's, so the head came out of the top of it. The
    # shift turned out to be eighteen thousandths -- the two heads sit in nearly
    # the same place -- and the SCALE was the whole of it: the Ranger's skull is
    # 0.727 tall against the Rogue's 0.889, a fifth shorter.
    wearer = register.wearer_head()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(root, MODELS, DONOR))

    hood = bpy.data.objects.get(MESH)
    if not hood:
        print(f"no mesh named {MESH}; present:")
        for o in bpy.data.objects:
            if o.type == "MESH":
                print("   ", o.name)
        return
    print(f"{MESH}: {len(hood.data.polygons)} faces, parent {hood.parent_type}/{hood.parent_bone}")

    donor = register.head_box()
    if not donor:
        print(f"no Head-weighted vertices on {DONOR}")
        return

    # FREED FROM THE BONE FIRST, AND THE WORLD TRANSFORM BAKED IN, so that
    # everything below is in one frame.
    #
    # The measurements this is corrected against — the donor head box, the
    # wearer's — are WORLD boxes, and `vert.co` is LOCAL. While this mesh is
    # parented to the Head bone those are not the same space, so rotating or
    # shifting vertices about a world point quietly applies the correction in the
    # wrong frame. Baking here costs nothing and removes the whole class of
    # error; the export below then has nothing left to apply.
    world = hood.matrix_world.copy()
    hood.parent = None
    hood.matrix_world = world
    bpy.ops.object.select_all(action="DESELECT")
    hood.select_set(True)
    bpy.context.view_layer.objects.active = hood
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # IT WAS COMING OUT BACK TO FRONT, and that is why it read as a helmet with a
    # hole in it rather than as a hood. Reported: "look at all the hoods, it's
    # completely misplaced, to the point that it's laughable."
    #
    # Measured on the RANGER, where this mesh belongs, the cloak sits BEHIND the
    # head — its back is 0.345 further back than the skull's and its front stops
    # 0.214 SHORT of the face, because the cowl opens forward and the drape hangs
    # off the back of the skull. Measured on the player by `helmfit.mjs` it was
    # the exact opposite: 0.222 in FRONT of the face, with its back 0.13 forward
    # of the back of the skull, so the crown and nape were bare and the drape was
    # hanging over the face. The depth axis is inverted for this piece.
    #
    # Registration could never have caught it. `register.fit` matches head
    # CENTRES, and a mesh turned about its own centre has the same centre it
    # started with — the shift it reported was eighteen thousandths, correctly,
    # while the hood was pointing the wrong way.
    #
    # Turned about the head's own vertical axis, BEFORE registration, so the
    # scaling that follows acts on a hood that is already facing the right way.
    head_mid = (donor[0] + donor[1]) / 2
    turn = mathutils.Matrix.Rotation(math.pi, 4, "Z")
    for vert in hood.data.vertices:
        vert.co = head_mid + turn @ (vert.co - head_mid)
    # AND CENTRED. The drape is off-centre by 0.065 on the Ranger himself — a
    # deliberate asymmetry on a character who wears it over one shoulder — and on
    # a head that is not his it just reads as the hood having slipped, with the
    # skull standing out of one side of it. The turn above flips the sign of that
    # offset; this removes it.
    lo = mathutils.Vector((min(v.co[i] for v in hood.data.vertices) for i in range(3)))
    hi = mathutils.Vector((max(v.co[i] for v in hood.data.vertices) for i in range(3)))
    off = (lo.x + hi.x) / 2 - head_mid.x
    for vert in hood.data.vertices:
        vert.co.x -= off
    print(f"turned about the head, and centred by {off:+.3f}")

    scale, shift = register.fit(hood, donor, wearer)
    print(f"registered: scale ({scale.x:.3f},{scale.y:.3f},{scale.z:.3f}) "
          f"shift ({shift.x:+.3f},{shift.y:+.3f},{shift.z:+.3f})")
    # AND LIFTED CLEAR OF THE CROWN. The Ranger's own hood only just covers his
    # head — measured on him, its top is 0.011 BELOW the top of his skull — so
    # registering it faithfully onto a taller skull reproduces that fault rather
    # than fixing it, and the crown stands through the top of the cloth. It came
    # out at -0.009 even after the 1.225 vertical scale.
    #
    # Registration is the wrong place to correct this: scaling the whole hood up
    # until its crown clears would widen and lengthen it too, and it is already
    # the right size everywhere else. A lift is the smaller change.
    hood_top = max((hood.matrix_world @ v.co).z for v in hood.data.vertices)
    want = wearer[1].z + CROWN_MARGIN
    if hood_top < want:
        hood.location.z += want - hood_top
        print(f"lifted {want - hood_top:+.3f} to clear the crown")

    # `fit` moves the object rather than its vertices, so that goes in too — the
    # game's `boneAttachMatrix` places this with nothing supplied here.
    bpy.ops.object.select_all(action="DESELECT")
    hood.select_set(True)
    bpy.context.view_layer.objects.active = hood
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # NAMED FOR THE BONE. `build.py` exports armour as one object per bone and the
    # loader reads the object name to decide what to hang it on, so this has to be
    # `Head` and not `Cloak`.
    hood.name = "Head"
    hood.data.name = "Head"

    hood.data.materials.clear()
    mat = bpy.data.materials.new("Steel")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.6, 0.62, 0.66, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.86
    hood.data.materials.append(mat)

    for o in [x for x in bpy.data.objects if x.type == "MESH" and x is not hood]:
        bpy.data.objects.remove(o, do_unlink=True)

    out = os.path.join(root, OUT)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    hood.select_set(True)
    bpy.context.view_layer.objects.active = hood
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_yup=False,
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
        export_extras=True,
    )
    print(f"EXPORTED {out}")


main()
