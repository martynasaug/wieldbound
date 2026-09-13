# WHAT EACH PACK CHARACTER'S HEAD ACTUALLY LOOKS LIKE, AND WHICH MESH IT IS.
#
#   blender --background --factory-startup --python tools/art/head_probe.py -- \
#       --out tools/soak/shots/heads [--layers Monk,Wizard,Rogue]
#
# WHY THIS EXISTS IN THIS FORM, because two earlier versions were wrong in the
# same way and the way is worth naming.
#
#   1. The first rendered each `Face` mesh ON ITS OWN, untextured, front-on. A
#      hollow shell lit from outside shows its inside through the opening, so a
#      brow ridge read as "overlapping plates" and a jaw as "tufts". From those
#      images I concluded the pack has no faces — while the Monk's face had been
#      on the player character for the whole project and looked right in game.
#      An isolated untextured render is not a look at a model; it is a look at a
#      shell.
#
#   2. Before that, I picked between the four `Face` meshes BY VERTEX COUNT and
#      shipped a cowl as a face. Counting is not looking. Same shape of mistake
#      as reading `removeGloves` as working because the rule existed.
#
# So: every render here is the character's own mesh, its own atlas attached, in
# place, with the rest of the character still around it. The only thing that
# changes between the images of a --layers pass is which ONE mesh is hidden,
# which makes "what does this mesh contribute" a difference between two otherwise
# identical pictures instead of a guess about a floating shell.
#
# The FBX importer wires none of this pack's textures, so they are attached here
# by name; without that every head renders flat 0.8 grey, which is most of what
# made the first probe unreadable.

import math
import os
import sys

import bpy

CHARACTERS = (
    ("Rogue", "Rogue_Texture.png"),
    ("Warrior", "Warrior_Texture.png"),
    ("Wizard", "Wizard_Texture.png"),
    ("Monk", "Monk_Texture.png"),
    ("Ranger", "Ranger_Texture.png"),
)

MODELS = "client/public/models"
TEXTURES = "client/public/textures"
NECK_TOP = 2.127


def dress(image):
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


def stage(sc):
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 32
    sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 480, 480
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.35, 0.35, 0.38, 1)
    sd = bpy.data.lights.new("s", "SUN")
    sd.energy = 4.0
    sun = bpy.data.objects.new("s", sd)
    sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(55), 0, math.radians(-35))


def shoot(sc, path, angle=0.0, height=2.45, scale=1.25):
    for cam in [o for o in bpy.data.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(cam, do_unlink=True)
    cd = bpy.data.cameras.new("c")
    cam = bpy.data.objects.new("c", cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cd.type = "ORTHO"
    cd.ortho_scale = scale
    r = 6.0
    cam.location = (r * math.sin(angle), -r * math.cos(angle), height)
    cam.rotation_euler = (math.radians(90), 0, angle)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def report(name):
    # Printed for every mesh so the geometry can contradict the pictures out
    # loud: how much of a mesh sits above the neck joint is what decides whether
    # a head can be cut out of it, and how much clutter comes with it.
    #
    # IN WORLD SPACE, which the first version of this was not. It measured local
    # coordinates and reported the Wizard's head pieces at `z -0.500..0.541` —
    # nowhere near a neck at 2.127 — because every rigid piece in this pack is
    # PARENTED TO A BONE with local transform (0.001, -2.756, 0.003) on an
    # armature carrying scale 100. Local z on a parented prop is not a height,
    # and an above-neck count taken from it is a count of nothing. The armature's
    # own meshes happened to read correctly, which is exactly why the wrong
    # numbers looked plausible.
    for o in sorted([x for x in bpy.data.objects if x.type == "MESH"], key=lambda m: m.name):
        me = o.data
        if not me.vertices:
            # The Wizard ships an empty placeholder mesh, which crashed this.
            print(f"  {name}/{o.name:<16} faces=0     (empty placeholder)")
            continue
        mw = o.matrix_world
        zs = [(mw @ v.co).z for v in me.vertices]
        above = sum(1 for p in me.polygons if (mw @ p.center).z >= NECK_TOP)
        print(f"  {name}/{o.name:<16} faces={len(me.polygons):<5} "
              f"z={min(zs):6.3f}..{max(zs):6.3f}  above-neck={above}")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.abspath(args[args.index("--out") + 1]) if "--out" in args else None
    layers = args[args.index("--layers") + 1].split(",") if "--layers" in args else []
    os.makedirs(out, exist_ok=True)

    for name, texname in CHARACTERS:
        if layers and name not in layers:
            continue
        fbx = os.path.abspath(os.path.join(MODELS, f"{name}.fbx"))
        if not os.path.exists(fbx):
            print(f"SKIP {name}: no {fbx}")
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=fbx)
        path = os.path.abspath(os.path.join(TEXTURES, texname))
        dress(bpy.data.images.load(path) if os.path.exists(path) else None)
        report(name)
        stage(bpy.context.scene)
        sc = bpy.context.scene

        if layers:
            # One image per mesh hidden, plus the intact head to compare against.
            shoot(sc, os.path.join(out, f"{name}_all.png"))
            for o in [x for x in bpy.data.objects if x.type == "MESH"]:
                o.hide_render = True
                shoot(sc, os.path.join(out, f"{name}_without_{o.name}.png"))
                o.hide_render = False
        else:
            for label, angle in (("front", 0.0), ("three-quarter", math.radians(35))):
                shoot(sc, os.path.join(out, f"{name}_{label}.png"), angle)
        print(f"  rendered {name}")


main()
