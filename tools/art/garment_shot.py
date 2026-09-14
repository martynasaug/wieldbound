# THE GARMENT FILES THEMSELVES, RENDERED OUT OF THE GAME.
#
#   blender --background --factory-startup --python tools/art/garment_shot.py
#
# In game the Wizard's robe reads as vivid blue and gold while the Warrior's
# plate and the Ranger's leather come out nearly black — and `body_shot.py` shows
# the donors are steel grey and teal green. Something between the donor and the
# screen is losing the colour, and the garment GLB sits exactly in the middle:
# render it alone and the question splits in two. Dark here means the cut or the
# export; bright here means the game.
#
# No material editing, deliberately. These files carry their own atlas — that is
# what `garments.py` exists to guarantee — so anything this script did to the
# materials would be testing this script instead of the file.

import os

import bpy
import mathutils

GARMENTS = "client/public/models/garments"
OUT = "tools/soak/shots/pack"


def render(path, name, out_dir):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        print(f"{name}: no mesh")
        return
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
            hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
    centre = (lo + hi) / 2
    span = max(hi - lo)

    mats = {m.name for o in meshes for m in o.data.materials if m}
    imgs = {
        n.image.name
        for o in meshes
        for m in o.data.materials
        if m and m.node_tree
        for n in m.node_tree.nodes
        if n.type == "TEX_IMAGE" and n.image
    }
    print(f"{name}: materials {sorted(mats)} images {sorted(imgs) or 'NONE'}")

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 380, 520
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.5, 0.5, 0.55, 1)

    key = bpy.data.lights.new("key", "SUN")
    key.energy = 4.0
    lamp = bpy.data.objects.new("key", key)
    sc.collection.objects.link(lamp)
    lamp.rotation_euler = (0.9, 0.1, 0.6)

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    # THE SHORTEST AXIS IS THE ONE TO LOOK DOWN, derived rather than assumed.
    # These files are Z-up as the donor authored them and Blender's glTF importer
    # assumes Y-up, so it lays them on their back — a hard-coded "front" gave a
    # model lit edge-on, dark for reasons of its own, and I nearly read that as
    # the garment being dark. A person is taller than they are wide and wider
    # than they are deep, so the smallest extent is front-to-back whichever way
    # up the file happens to be.
    size = hi - lo
    depth_axis = min(range(3), key=lambda i: size[i])
    view = mathutils.Vector((0, 0, 0))
    view[depth_axis] = -1.0
    cam.location = centre + view.normalized() * (span * 1.5)
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(out_dir, f"garment_{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"WROTE {sc.render.filepath}")


def main():
    root = os.getcwd()
    out_dir = os.path.join(root, OUT)
    os.makedirs(out_dir, exist_ok=True)
    for fn in sorted(os.listdir(os.path.join(root, GARMENTS))):
        if fn.endswith(".glb"):
            render(os.path.join(root, GARMENTS, fn), fn[:-4], out_dir)


main()
