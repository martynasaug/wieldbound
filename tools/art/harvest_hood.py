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

import bpy

MODELS = "client/public/models"
OUT = "client/public/models/armour/helm_hood.glb"
DONOR = "Ranger.fbx"
MESH = "Cloak"


def main():
    root = os.getcwd()
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

    # BAKED, exactly as `look_pieces.py` bakes a beard: the world transform goes
    # into the vertices and the object is freed from its bone, so the game's
    # `boneAttachMatrix` places it with nothing supplied here.
    world = hood.matrix_world.copy()
    hood.parent = None
    hood.matrix_world = world
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
