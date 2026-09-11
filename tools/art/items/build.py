# BUILD ITEMS: MODEL THEM, PUT THEM ON A SHEET, EXPORT THEM FOR THE GAME.
#
#   blender --background --python tools/art/items/build.py -- <family|id ...> [--sheet out.png] [--export dir]
#
# A family name (`swords`) or item ids. The sheet stands every built item in a
# row at its authored size, turned a little so a blade's thickness shows, with
# its name under it — the review happens there before anything reaches the game.
# `--export` writes one GLB per item, Z-up and unconverted, which the game's grip
# fitting turns into the hand (see `client/src/three/gear.ts`, `fitToGrip`).

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import weapons  # noqa: E402


def parse():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    sheet, export = None, None
    rest = []
    i = 0
    while i < len(args):
        if args[i] == "--sheet":
            sheet = os.path.abspath(args[i + 1])
            i += 2
        elif args[i] == "--export":
            export = os.path.abspath(args[i + 1])
            i += 2
        else:
            rest.append(args[i])
            i += 1
    ids = []
    for token in rest:
        if token in weapons.FAMILIES:
            ids.extend(weapons.FAMILIES[token].keys())
        elif token in weapons.RECIPES:
            ids.append(token)
        else:
            print(f"UNKNOWN {token}")
    return ids, sheet, export


def bounds(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def label(text, location, size):
    curve = bpy.data.curves.new(f"label_{text}", "FONT")
    curve.body = text
    curve.size = size
    curve.align_x = "CENTER"
    obj = bpy.data.objects.new(f"label_{text}", curve)
    obj.location = location
    obj.rotation_euler = (math.radians(90), 0, 0)
    mat = bpy.data.materials.get("LabelWhite") or bpy.data.materials.new("LabelWhite")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.95, 0.88, 0.7, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (0.95, 0.88, 0.7, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 0.6
    curve.materials.append(mat)
    bpy.context.collection.objects.link(obj)


def render_sheet(built, path):
    spacing = 0.42
    tallest = 0.0
    for i, (item_id, name, obj) in enumerate(built):
        lo, hi = bounds(obj)
        obj.location = (i * spacing - (lo.x + hi.x) / 2, 0, -lo.z)
        obj.rotation_euler = (0, 0, math.radians(28))
        tallest = max(tallest, hi.z - lo.z)
        label(name, (i * spacing, -0.2, -0.12), 0.045)
    width = max(1, len(built)) * spacing

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = int(min(3200, 260 * len(built)))
    scene.render.resolution_y = 900
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.13, 0.12, 0.14, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    for rot, energy in (((50, 0, -30), 3.0), ((65, 0, 150), 1.2)):
        light = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        light.data.energy = energy
        light.rotation_euler = tuple(math.radians(r) for r in rot)
        bpy.context.collection.objects.link(light)

    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    aspect = scene.render.resolution_x / scene.render.resolution_y
    cam.data.ortho_scale = max(width + 0.2, (tallest + 0.4) * aspect)
    centre = Vector(((len(built) - 1) * spacing / 2, 0, tallest / 2 - 0.06))
    cam.location = centre + Vector((0, -6, 0.6))
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"SHEET {path}")


def export(obj, path):
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=False,
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
    )
    print(f"EXPORTED {path}")


def main():
    ids, sheet, export_dir = parse()
    if not ids:
        print("NOTHING TO BUILD")
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    built = []
    for item_id in ids:
        name, obj = weapons.build(item_id)
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        print(f"ITEM {item_id}: {tris} triangles, materials {[m.name for m in obj.data.materials]}")
        built.append((item_id, name, obj))
    if export_dir:
        os.makedirs(export_dir, exist_ok=True)
        for item_id, _, obj in built:
            export(obj, os.path.join(export_dir, f"{item_id}.glb"))
    if sheet:
        os.makedirs(os.path.dirname(sheet), exist_ok=True)
        render_sheet(built, sheet)
    print("DONE")


main()
