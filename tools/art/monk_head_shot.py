# WHAT THE MONK'S FACE ACTUALLY LOOKS LIKE, ON THE MONK.
#
#   blender --background --factory-startup --python tools/art/monk_head_shot.py
#
# The "monk" beard has now been judged wrong twice — once as dangling locks, once
# as a tuft by the ear — and each time I adjusted a threshold and looked at the
# player again. That is guessing at how much to cut without ever having seen the
# thing being cut.
#
# `Monk.001` is one mesh holding brows, eyes, nose, beard, moustache, hair and
# neck beads together, and the creator's "beard" is one group of islands out of
# it. Whether that group is a beard at all is a question about the SOURCE, and
# the source can simply be photographed.
#
# EEVEE rather than Cycles: `look_pieces.py` renders at 24 Cycles samples per
# island, which is right for a careful catalogue and far too slow for one look.

import os
import sys

import bpy
import mathutils

OUT = "tools/soak/shots/heads"


CHARACTERS = {
    "Monk": ("Monk.fbx", "Monk.001", "Monk_Texture.png"),
    "Wizard": ("Wizard.fbx", "Face", "Wizard_Texture.png"),
    "Warrior": ("Warrior.fbx", "Face", "Warrior_Texture.png"),
}


def main():
    root = os.getcwd()
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    who = args[0] if args else "Monk"
    fbx, facename, texname = CHARACTERS[who]
    os.makedirs(os.path.join(root, OUT), exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(root, "client/public/models", fbx))

    face = bpy.data.objects.get(facename)
    if not face:
        print("no " + facename + "; meshes present:")
        for o in bpy.data.objects:
            if o.type == "MESH":
                print("   ", o.name)
        return

    # The head only. The robe and the body would fill the frame and the point is
    # the face.
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    for v in face.data.vertices:
        p = face.matrix_world @ v.co
        lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
        hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
    centre = (lo + hi) / 2
    span = max(hi - lo)
    print(f"{who} {facename} box {tuple(round(v, 3) for v in lo)} .. {tuple(round(v, 3) for v in hi)}")

    # A flat texture-less render would hide the beard against the face, so the
    # image is loaded the way `look_pieces.py` does it.
    img_path = os.path.join(root, os.path.join("client/public/textures", texname))
    image = bpy.data.images.load(img_path) if os.path.exists(img_path) else None
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

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = 540
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.5, 0.55, 1)

    light_data = bpy.data.lights.new("key", "SUN")
    light_data.energy = 4.0
    light = bpy.data.objects.new("key", light_data)
    sc.collection.objects.link(light)
    light.rotation_euler = (0.9, 0.1, 0.6)

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    # These files are Z-up and the face looks along -Y, established by
    # `face_depth.py` finding the nose at the minimum-Y end of the feature mesh.
    views = {
        "front": mathutils.Vector((0, -1, 0)),
        "side": mathutils.Vector((1, -0.15, 0)),
        "threequarter": mathutils.Vector((0.8, -0.9, 0.15)),
    }
    for name, dirv in views.items():
        d = dirv.normalized() * (span * 2.6)
        cam.location = centre + d
        # Point the camera at the head: the -Z axis of a camera is its forward.
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(root, OUT, f"{who.lower()}_face_{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"WROTE {sc.render.filepath}")


main()
