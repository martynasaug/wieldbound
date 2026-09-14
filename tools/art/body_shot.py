# THE PACK'S CHARACTERS, WHOLE, IN THEIR OWN COLOURS.
#
#   blender --background --factory-startup --python tools/art/body_shot.py -- Warrior
#
# `garments.py` cuts four of these outfits into wearable armour, and in the game
# the Wizard's robe reads as vivid blue and gold while the Warrior's plate and
# the Ranger's leather render nearly black. Before deciding whether that is the
# art or something the game is doing to it, the art itself has to be looked at —
# which is the lesson `monk_head_shot.py` was written for one milestone ago,
# after two beard styles were judged and re-cut without anyone opening the
# source.
#
# The texture is wired in by hand because this pack's FBX files carry no image
# node at all: base colour is a flat 0.8 and metalness is 1, so an unedited
# import renders as grey plastic and a metallic one as near-black. That fact is
# already written down in `garments.py` and `base_body.py`; it applies here too.

import os
import sys

import bpy
import mathutils

OUT = "tools/soak/shots/pack"

CHARACTERS = {
    "Monk": ("Monk.fbx", "Monk_Texture.png"),
    "Wizard": ("Wizard.fbx", "Wizard_Texture.png"),
    "Warrior": ("Warrior.fbx", "Warrior_Texture.png"),
    "Ranger": ("Ranger.fbx", "Ranger_Texture.png"),
    "Rogue": ("Rogue.fbx", "Rogue_Texture.png"),
}


def main():
    root = os.getcwd()
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    who = args[0] if args else "Warrior"
    if who not in CHARACTERS:
        print(f"unknown {who}; have {', '.join(CHARACTERS)}")
        return
    fbx, texname = CHARACTERS[who]
    os.makedirs(os.path.join(root, OUT), exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(root, "client/public/models", fbx))

    img_path = os.path.join(root, "client/public/textures", texname)
    image = bpy.data.images.load(img_path) if os.path.exists(img_path) else None
    if not image:
        print(f"no texture at {img_path} — the render will be grey")
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        for mat in obj.data.materials:
            if not mat or not mat.node_tree:
                continue
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not bsdf:
                continue
            bsdf.inputs["Metallic"].default_value = 0.0
            if image and not any(n.type == "TEX_IMAGE" and n.image for n in mat.node_tree.nodes):
                tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
                tex.image = image
                mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
            hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
    centre = (lo + hi) / 2
    span = max(hi - lo)
    print(f"{who} box {tuple(round(v, 2) for v in lo)} .. {tuple(round(v, 2) for v in hi)}")

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 420, 640
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.5, 0.55, 1)

    key = bpy.data.lights.new("key", "SUN")
    key.energy = 4.0
    obj = bpy.data.objects.new("key", key)
    sc.collection.objects.link(obj)
    obj.rotation_euler = (0.9, 0.1, 0.6)

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    # Z-up, facing -Y: established by `face_depth.py`, which found each rig's
    # nose at the minimum-Y end of its feature mesh.
    for name, dirv in {
        "front": mathutils.Vector((0, -1, 0.12)),
        "back": mathutils.Vector((0, 1, 0.12)),
    }.items():
        cam.location = centre + dirv.normalized() * (span * 1.5)
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(root, OUT, f"{who.lower()}_body_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"WROTE {sc.render.filepath}")


main()
