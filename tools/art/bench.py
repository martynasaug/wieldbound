# THE ITEM BENCH: OUR ART BESIDE THE ART IT IS MEANT TO MATCH.
#
#   blender --background --factory-startup --python tools/art/bench.py
#
# Asked for: the pack's outfits as the standard our items should reach, and an
# instrument for producing art to it — "taste, style, textures, not just
# numbers".
#
# `style.py` measures four things and is worth having, but a triangle budget has
# never made anything look good. What makes an item look like it belongs is
# silhouette, how the surface is painted, and what colour it is next to the thing
# beside it — and none of that can be read off a table. It can only be looked at,
# and it can only be JUDGED when the two are side by side at the same size under
# the same light. A reference in one window and our work in another is how every
# "close enough" in this project has happened.
#
# So this renders both into one folder, identically, and `tools/soak/sheet.mjs`
# tiles them:
#
#   blender --background --factory-startup --python tools/art/bench.py
#   node tools/soak/sheet.mjs tools/soak/shots/bench
#
# NORMALISED TO THE FRAME, NOT TO WORLD SCALE. A shoulder pad is 0.4 units and a
# staff is 2.9, and a sheet that respected that would be a row of specks beside
# one sword. The question here is "does this look like it came from the same
# hand", which is about surface and silhouette, not size — the game already knows
# how big things are, and `style.py` records the real dimensions.
#
# EVERY PACK ITEM GETS ITS ATLAS WIRED, because these FBX files carry no image
# node at all: base colour flat 0.8, metalness 1. That fact has now been paid for
# by the body, the garments, the head shots and this file. Our own GLBs carry
# named materials with no texture by design — `gear.ts` repaints them from the
# item's palette — so what they show here is their shape and their preview
# colour, which is exactly the comparison worth having.

import os

import bpy
import mathutils

MODELS = "client/public/models"
TEXTURES = "client/public/textures"
OUT = "tools/soak/shots/bench"

# The pack's own items, which is what "looks like the pack" means.
REFERENCE = [
    ("Warrior.fbx", "ShoulderPad.L", "Warrior_Texture", "ref_warrior_pauldron"),
    ("Ranger.fbx", "ArmGuard.L", "Ranger_Texture", "ref_ranger_bracer"),
    ("Ranger.fbx", "Pouch", "Ranger_Texture", "ref_ranger_pouch"),
    ("Warrior_Sword.fbx", None, "Warrior_Sword_Texture", "ref_warrior_sword"),
    ("Wizard_Staff.fbx", None, "Wizard_Staff_Texture", "ref_wizard_staff"),
    ("Rogue_Dagger.fbx", None, "Rogue_Dagger_Texture", "ref_rogue_dagger"),
]

# Ours, from `tools/art/items/build.py --export`. One of each family, so the
# sheet is a comparison and not a catalogue.
OURS = [
    ("items/armingsword.glb", "our_armingsword"),
    ("items/claymore.glb", "our_claymore"),
    ("items/apprenticestaff.glb", "our_apprenticestaff"),
    ("items/adderfang.glb", "our_adderfang"),
]


def wire_atlas(atlas_name):
    path = os.path.abspath(os.path.join(TEXTURES, f"{atlas_name}.png"))
    image = bpy.data.images.load(path) if os.path.exists(path) else None
    if not image:
        print(f"  no atlas {atlas_name}.png — rendering untextured")
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        for mat in obj.data.materials:
            if not mat or not mat.use_nodes:
                continue
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not bsdf:
                continue
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = 0.86
            if image and not any(n.type == "TEX_IMAGE" and n.image for n in mat.node_tree.nodes):
                tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
                tex.image = image
                mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])


def stage():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 360, 440
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    # A MID GREY GROUND, not black and not white. Both of those flatter one half
    # of a comparison: dark art disappears on black and pale art disappears on
    # white, and the point of this sheet is that neither gets an advantage.
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.43, 0.46, 1)

    key = bpy.data.lights.new("key", "SUN")
    key.energy = 3.6
    lamp = bpy.data.objects.new("key", key)
    sc.collection.objects.link(lamp)
    lamp.rotation_euler = (0.95, 0.05, 0.75)

    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 1.1
    lamp2 = bpy.data.objects.new("fill", fill)
    sc.collection.objects.link(lamp2)
    lamp2.rotation_euler = (1.2, 0.0, -2.2)
    return sc


def shoot(name, keep, out_dir):
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and (keep is None or o.name == keep)]
    if not meshes:
        print(f"{name}: no mesh matching {keep!r}")
        return
    for o in [x for x in bpy.data.objects if x.type == "MESH" and x not in meshes]:
        bpy.data.objects.remove(o, do_unlink=True)

    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
            hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
    centre = (lo + hi) / 2
    span = max(max(hi - lo), 1e-4)

    sc = stage()
    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    # A three-quarter view from slightly above: the angle a player sees a weapon
    # at, and the one that shows a bevel rather than a flat face.
    d = mathutils.Vector((0.75, -1.0, 0.45)).normalized() * (span * 1.45)
    cam.location = centre + d
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()

    sc.render.filepath = os.path.join(out_dir, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"WROTE {name}.png  span {span:.2f}")


def main():
    root = os.getcwd()
    out_dir = os.path.join(root, OUT)
    os.makedirs(out_dir, exist_ok=True)

    for fn, mesh, atlas, name in REFERENCE:
        path = os.path.join(root, MODELS, fn)
        if not os.path.exists(path):
            print(f"missing {fn}")
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=path)
        wire_atlas(atlas)
        shoot(name, mesh, out_dir)

    for rel, name in OURS:
        path = os.path.join(root, MODELS, rel)
        if not os.path.exists(path):
            print(f"missing {rel}")
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
        shoot(name, None, out_dir)


main()
