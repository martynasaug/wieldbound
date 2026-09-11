# OURS BESIDE THEIRS, AT THE SAME SCALE.
#
# THIS SHOULD HAVE EXISTED FIRST. Every judgement about the new player body so
# far was made from renders of it ALONE — "it reads as a figure", "the
# proportions are right" — and a mannequin in an empty frame always reads as a
# figure, because there is nothing in shot that is better. Asked whether it
# resembled the game's existing character, the honest answer was that I had
# never put them next to each other: the Monk was rendered once, cropped, and
# measured for triangle count.
#
# The Monk imports at FBX scale — roughly a hundred times too big — so it also
# has to be normalised to 1.8 units before the comparison means anything. That
# normalisation is why a side-by-side is a script and not a glance.
#
#   blender --background --python tools/art/compare_bodies.py -- <out.png>

import os
import sys

import bpy
from mathutils import Vector

HEIGHT = 1.8


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def measure(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != "MESH":
            continue
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


def bring_in(path, x_offset):
    """Import a body, normalise it to 1.8 units tall, and stand it at `x_offset`."""
    before = set(bpy.data.objects)
    if path.lower().endswith(".glb") or path.lower().endswith(".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        bpy.ops.import_scene.fbx(filepath=path)
    added = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in added if o.parent is None]

    lo, hi = measure(added)
    tall = hi.z - lo.z
    scale = HEIGHT / tall if tall > 0 else 1.0
    # PARENT EVERYTHING TO ONE EMPTY AND SCALE THAT.
    #
    # Scaling the "roots" directly does not work reliably across both
    # importers: an FBX arrives as an armature with meshes under it, a glTF as a
    # scene empty with its own nesting, and which objects have no parent differs
    # between them. Scaling some subset of that either misses geometry or
    # applies twice. One empty over the whole import has neither failure mode —
    # and the first version of this rendered the Monk three times our height,
    # which made the comparison it exists for impossible.
    pivot = bpy.data.objects.new(f"pivot_{os.path.basename(path)}", None)
    bpy.context.collection.objects.link(pivot)
    for r in roots:
        r.parent = pivot
        r.matrix_parent_inverse = pivot.matrix_world.inverted()
    pivot.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    roots = [pivot]

    lo, hi = measure(added)
    for r in roots:
        r.location = (
            r.location.x + x_offset - (lo.x + hi.x) / 2,
            r.location.y - (lo.y + hi.y) / 2,
            r.location.z - lo.z,
        )
    bpy.context.view_layer.update()

    tris = 0
    added = added + [pivot]
    for o in added:
        if o.type == "MESH":
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
    return added, tris


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = args[0] if args else "compare.png"
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    clear()
    _, mine = bring_in(os.path.join(root, "client/public/models/Player_Base.glb"), -0.65)
    _, theirs = bring_in(os.path.join(root, "client/public/models/Monk.fbx"), 0.65)
    print(f"OURS {mine} triangles | THEIRS {theirs} triangles")

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 900
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True

    cam = bpy.data.objects.new("C", bpy.data.cameras.new("C"))
    bpy.context.collection.objects.link(cam)
    # Orthographic and dead-on: the question is shape, and perspective is a
    # distortion of exactly the thing being compared.
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.6
    cam.location = Vector((0.0, -6.0, 0.95))
    d = Vector((0.0, 0.0, 0.95)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f"COMPARED {out}")


main()
