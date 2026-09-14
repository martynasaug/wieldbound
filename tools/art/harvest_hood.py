# THE PLAYER'S OWN COWL, HARVESTED AS THE HOOD HELM.
#
#   blender --background --factory-startup --python tools/art/harvest_hood.py
#
# Reported four times, escalating: "the hood is looking like a regular helmet and
# not a hood", "it looks nothing like a hood, the design itself is completely
# bad", and finally "look at all the hoods, it's completely misplaced, to the
# point that it's laughable", with a photograph of it hanging off the back of the
# head like a satchel.
#
# The first two rounds were answered by MODELLING — folds, then a peak — and both
# produced a dome with things attached to it, because a lathe about a vertical
# axis IS a helmet and no amount of trim changes that.
#
# The next four were answered by FITTING the Ranger's `Cloak` mesh, and every one
# of them was wrong in a different direction: untouched it overhung the face,
# turned it sat beside the head, mirrored it sat behind, and registered on its
# cowl it still left the crown out. The reason all four failed is one mistake
# repeated: `Cloak` is a hooded CLOAK, mostly drape, and every correction was
# steered by a bounding box that was measuring the drape and calling it the hood.
#
# THE ANSWER WAS IN THE REPOSITORY THE WHOLE TIME, written down in `base_body.py`
# and read past six times. The player's body is the Rogue stripped, and the list
# of what gets stripped ends with `Face` — which, as that file's own note says at
# length, IS NOT A FACE:
#
#     Rogue    106 faces   a smooth featureless dome — a COWL
#
# It is stripped from the BODY because a base character must not come with a hood
# welded on. It is exactly what the HELM slot wants, and unlike anything cut from
# another character it was authored FOR THIS SKULL ON THIS BONE. Rendered on its
# own owner (`tools/soak/shots/roguecowl/01-whole.png`) it is a hood sitting on a
# head with the opening at the face — which is all the last four builds were
# trying to achieve by arithmetic.
#
# SO THERE IS NO REGISTRATION HERE, and that is the point rather than an
# omission. `register.py`'s rule is that art HARVESTED FROM A DONOR must be fitted
# to the wearer before export — and this is not from a donor. The wearer is the
# Rogue and so is this. Fitting it to itself could only move it off the head it
# already fits.
#
# THE MATERIAL IS RENAMED TO A KIT NAME so the game's palette reaches it.
# `gear.ts` repaints armour by material NAME through `MATERIAL_LOOK`, and a piece
# arriving as `Rogue_Texture` matches nothing, falls to the metal role and is
# painted flat. Called `Steel` — which `armour.py` uses for cloth, being the
# palette's most identifying tone — a Verdant hood comes out green and a Crimson
# one red, like every other piece in the slot.

import os
import sys

import bpy
import mathutils

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import register  # noqa: E402

MODELS = "client/public/models"
OUT = "client/public/models/armour/helm_hood.glb"

# The player's own file, and its own cowl. See the note above: this is not a
# donor, it is the wearer, which is why nothing below fits or moves it.
DONOR = "Rogue.fbx"
MESH = "Face"


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

    head = register.head_box()

    # BAKE THE WORLD TRANSFORM INTO THE VERTICES, by the same three lines
    # `look_pieces.py` uses for the hair and the beards — which are also
    # bone-parented props harvested off this rig, and which fit.
    #
    # It matters that it is these lines and not an equivalent-looking
    # `transform_apply`. These props carry the pack's local offset on an armature
    # SCALED 100, so their own coordinates mean nothing away from that rig.
    # Transformed into the mesh data with the basis then cleared, the geometry is
    # in the donor's MESH-BIND SPACE — the space our body's skeleton inverses are
    # expressed in — so `boneAttachMatrix` places it exactly, with no constant
    # supplied anywhere. That is the same note that records five tuned offsets in
    # `hair.ts` being defeated by getting this wrong.
    mw = hood.matrix_world.copy()
    hood.data.transform(mw)
    hood.parent = None
    hood.matrix_basis = mathutils.Matrix.Identity(4)

    # MIRRORED IN DEPTH, and this is the one correction that survived being
    # tested rather than reasoned about.
    #
    # Measured on the Rogue, his cowl sits BEHIND his face: its front stops 0.164
    # short of the face and its back reaches 0.408 past the back of the skull.
    # Photographed in game, harvested untouched, it arrives IN FRONT of the face
    # (`tools/soak/shots/hoodside/side.png`, shot in crimson so it cannot be
    # mistaken for the scenery — an earlier round of this was diagnosed against a
    # tree, in verdant).
    #
    # The loader stands Z-up data up with a -90 degree rotation about X (see
    # `instantiateNow` in `assets.ts`), which maps Blender's +y to three.js's -z.
    # The BODY and its skeleton go through that together and stay agreeing; a
    # rigid piece attached by `boneAttachMatrix` does not, so its depth arrives
    # reversed. Nothing authored in `armour.py` shows this, because those are
    # built in the game's own frame against the `BODY` table.
    #
    # A MIRROR, not a turn. A 180-degree turn was tried on the Ranger's cloak and
    # swings the whole piece across the head; a mirror flips only the depth axis,
    # so the cowl stays over the skull and only its facing changes. The winding
    # goes with it — a mirrored mesh is inside out — so the normals flip back.
    lo, hi = head
    mid_y = (lo.y + hi.y) / 2
    for vert in hood.data.vertices:
        vert.co.y = 2 * mid_y - vert.co.y
    hood.data.flip_normals()
    print(f"mirrored in depth about the head's own centre y={mid_y:.3f}")

    # NAMED FOR THE BONE. `build.py` exports armour as one object per bone and the
    # loader reads the object name to decide what to hang it on, so this has to be
    # `Head` and not `Face`.
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
