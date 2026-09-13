# THE PACK'S COSTUMES, CUT INTO WEARABLE GARMENTS.
#
#   blender --background --factory-startup --python tools/art/garments.py -- \
#       [--export client/public/models/garments]
#
# Asked for: armour, robes and cloaks that look like the outfits the pack's own
# characters wear — because they are those outfits. Each of the four bodies is a
# single skinned surface where the clothes ARE the torso, so a garment is that
# surface with the SKIN cut away: hands, head and feet, which the player's own
# body supplies and which an item must never replace.
#
#     robe     from Wizard.001    a hooded gown, layered shoulder capes, sash
#     plate    from Warrior_Body  segmented skirt, chest and collar
#     leather  from Ranger        tunic and belted coat
#     light    from Rogue         the base body's own clothes, as an item
#
# THE CUT IS BY DOMINANT BONE WEIGHT, and it was checked by rendering both halves
# rather than assumed: `tools/soak/shots/pack/WizardGarmentOnly.png` is a robe
# with clean neck and wrist openings, and `WizardSkinOnly.png` is a head, two
# forearm stubs and two ankle nubs floating in space. There is no body under the
# robe, which is why the base body had to come from elsewhere.
#
# BINDING IS SAFE, and that was measured too: bone order is identical across all
# five rigs — 32 skinning bones in the same sequence — so a garment bound to the
# player's own skeleton needs no `skinIndex` remap. Proven in the running game by
# binding the Warrior's body to the Wizard's skeleton and photographing it
# deforming correctly.
#
# EVERY GLB MUST CARRY ITS OWN MATERIAL. This is the lesson `base_body.py` paid
# for twice: the FBX importer never wires this pack's textures in (no image node
# anywhere, base colour a flat 0.8, metalness 1), and the glTF branch of
# `assets.ts` does none of the dressing `dressFbx` does for the FBX branch. A
# garment exported without its atlas is grey plastic, and metal with no
# environment map renders near-black — which this project has now learned about
# armour, about a body, and would have learned a third time here.
#
# ORIENTATION IS THE LOADER'S JOB. The data stays Z-up exactly as the donor
# authored it; `instantiate` sees depth exceeding height and rotates the whole
# object, mesh and skeleton together. Rotating at export time was tried six ways
# and every one of them broke something — see the header of `base_body.py`.

import os
import sys

import bpy
import bmesh

# What a garment is NOT: the parts of a costume that are the wearer's own body.
SKIN_BONES = ("Fist", "Thumb", "Foot", "Head", "Neck")

# donor file, the skinned mesh inside it, the garment it becomes, its atlas.
JOBS = (
    ("Wizard", "Wizard.001", "robe", "Wizard_Texture"),
    ("Warrior", "Warrior_Body", "plate", "Warrior_Texture"),
    ("Ranger", "Ranger", "leather", "Ranger_Texture"),
    ("Rogue", "Rogue", "light", "Rogue_Texture"),
)

MODELS = "client/public/models"
TEXTURES = "client/public/textures"


def dress(obj, atlas_name):
    """Give every material its donor's own atlas, and take the metal off."""
    path = os.path.abspath(os.path.join(TEXTURES, f"{atlas_name}.png"))
    image = bpy.data.images.load(path) if os.path.exists(path) else None
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf:
            bsdf.inputs["Metallic"].default_value = 0.0
        has_image = any(n.type == "TEX_IMAGE" and n.image for n in mat.node_tree.nodes)
        if image and bsdf and not has_image:
            tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
            tex.image = image
            mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return image is not None


def cut(donor, mesh_name, out_name, atlas, export_dir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(os.path.join(MODELS, f"{donor}.fbx")))
    body = bpy.data.objects[mesh_name]
    me = body.data
    groups = {g.index: g.name for g in body.vertex_groups}

    def dominant(v):
        if not v.groups:
            return "?"
        return groups[max(v.groups, key=lambda g: g.weight).group]

    # A face goes if ANY of its vertices follows a skin bone: the seam ring at a
    # wrist or a collar is mixed, and keeping it leaves a cuff of costume
    # standing on the player's own arm.
    doomed = [
        p.index for p in me.polygons
        if any(any(s in dominant(me.vertices[i]) for s in SKIN_BONES) for i in p.vertices)
    ]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in doomed], context="FACES")
    bm.to_mesh(me)
    bm.free()

    body.name = "Garment"
    me.name = "Garment"
    textured = dress(body, atlas)

    # Only the garment and its rig travel: no props, no weapon, no face.
    for o in [x for x in bpy.data.objects if x.type == "MESH" and x is not body]:
        bpy.data.objects.remove(o, do_unlink=True)

    print(f"GARMENT {out_name:<8} {len(me.polygons):>4} faces (cut {len(doomed)} skin) "
          f"atlas={'attached' if textured else 'MISSING'}")

    if export_dir:
        os.makedirs(export_dir, exist_ok=True)
        out = os.path.join(export_dir, f"{out_name}.glb")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(
            filepath=out,
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_extras=True,
            export_yup=False,
            export_animations=False,
            export_materials="EXPORT",
            export_image_format="AUTO",
        )
        print(f"  WROTE {out}")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    export_dir = None
    i = 0
    while i < len(args):
        if args[i] == "--export":
            export_dir = os.path.abspath(args[i + 1]); i += 2
        else:
            i += 1
    for donor, mesh_name, out_name, atlas in JOBS:
        cut(donor, mesh_name, out_name, atlas, export_dir)


main()
