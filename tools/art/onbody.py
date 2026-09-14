# THE ONLY QUESTION THAT MATTERS: HOW DOES IT LOOK ON THE CHARACTER.
#
#   blender --background --factory-startup --python tools/art/onbody.py
#
# `bench.py` stands an item next to the reference and judges craft — silhouette,
# surface, colour. That is worth having and it is not the question. A piece of
# gear is worn, at a fixed distance, on a body that is mostly other gear, and an
# item that reads beautifully alone can be invisible on a shoulder, twice the size
# it should be, or facing backwards. None of that shows in a studio render.
#
# So this puts each piece on the player's actual body, at the bone it belongs to,
# scaled to the part of the body it has to fit, and photographs the whole figure.
#
# THE BASIS IS DERIVED, NOT ASSUMED, and that is the single most expensive lesson
# of the last week. These files do not agree about which axis is up: the player
# body is authored Z-up and the glTF importer lays it on its back, `look_pieces`
# output disagrees with `Player_Base.glb`, and a scalp cap built on "+Y is up"
# came out as a ring standing on edge. So the body tells us its own frame:
#
#   UP       from the nose to the brows. A face has its brows above its nose.
#   FORWARD  from the skull's centre to the nose. A face points forwards.
#   RIGHT    the cross product of the two.
#
# Nothing here needs to know how the file was exported.
#
# FITTED BY MEASUREMENT, not by a number per item. Each sketch is scaled so its
# width matches the body part it sits on — a helm to the skull, a pauldron to the
# upper arm — because a sketch's authored size is arbitrary and its size ON THE
# BODY is the whole point. A piece that needs a hand-tuned constant to sit right
# is a piece that has not been fitted; see `hair.ts` for five of those.

import os
import sys

import bpy
import mathutils

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "items"))

MODELS = "client/public/models"
OUT = "tools/soak/shots/onbody"

# Each sketch, the bone it hangs from, and how wide it should be relative to the
# body part it sits on. A helm wraps the skull, so a little over 1; a pauldron
# caps a shoulder and overhangs it, so more.
PIECES = [
    ("vaultwarden_helm", "Head", 1.10, (0.0, 0.0, 0.18)),
    ("emberplate_pauldron", "UpperArmL", 1.55, (0.0, 0.0, 0.0)),
    ("wayfarer_mantle", "Torso", 1.25, (0.0, 0.0, 0.30)),
    ("ridgeguard_boots", "LowerLegL", 1.35, (0.0, 0.0, -0.15)),
]


def body_basis():
    """(up, forward, right) in the body's own space, read off its face."""
    nose = [o for o in bpy.data.objects if o.type == "MESH" and "nose" in o.name.lower()]
    brow = [o for o in bpy.data.objects if o.type == "MESH" and "brow" in o.name.lower()]
    if not nose or not brow:
        print("no nose/brow on this body — falling back to +Z up")
        return mathutils.Vector((0, 0, 1)), mathutils.Vector((0, -1, 0)), mathutils.Vector((1, 0, 0))

    def centre(objs):
        acc = mathutils.Vector((0, 0, 0))
        n = 0
        for o in objs:
            for v in o.data.vertices:
                acc += o.matrix_world @ v.co
                n += 1
        return acc / max(n, 1)

    nose_at, brow_at = centre(nose), centre(brow)
    up = (brow_at - nose_at).normalized()
    skull = bone_box("Head")
    fwd = (nose_at - (skull[0] + skull[1]) / 2) if skull else mathutils.Vector((0, -1, 0))
    # Only the part of "towards the nose" that is not "up": the nose sits below
    # the brows, so the raw vector leans downwards and would tilt every piece.
    fwd = (fwd - up * fwd.dot(up)).normalized()
    return up, fwd, up.cross(fwd).normalized()


def bone_box(bone_name):
    """World box of the vertices this bone dominates, or None."""
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    n = 0
    for obj in [o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups]:
        # DOTS OR NO DOTS. The GLB keeps the rig's own spelling — `UpperArm.L` —
        # and only three.js strips them, so a name taken from the runtime finds
        # nothing here. Both spellings are accepted rather than one being
        # declared correct.
        want = bone_name.replace(".", "")
        idx = {g.index for g in obj.vertex_groups if g.name.replace(".", "") == want}
        if not idx:
            continue
        for v in obj.data.vertices:
            w = sum(g.weight for g in v.groups if g.group in idx)
            total = sum(g.weight for g in v.groups) or 1.0
            if w / total <= 0.5:
                continue
            p = obj.matrix_world @ v.co
            lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
            hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
            n += 1
    return (lo, hi) if n else None


def place(obj, bone_name, width_ratio, offset, basis):
    """Scale a sketch to the body part it sits on, orient it, and set it there."""
    up, fwd, right = basis
    box = bone_box(bone_name)
    if not box:
        print(f"  no vertices for bone {bone_name}")
        return False
    lo, hi = box
    centre = (lo + hi) / 2
    across = max((hi - lo).dot(right), (hi - lo).length * 0.25)

    ilo = mathutils.Vector((1e9, 1e9, 1e9))
    ihi = mathutils.Vector((-1e9, -1e9, -1e9))
    for v in obj.data.vertices:
        ilo = mathutils.Vector((min(ilo[i], v.co[i]) for i in range(3)))
        ihi = mathutils.Vector((max(ihi[i], v.co[i]) for i in range(3)))
    item_w = max(ihi.x - ilo.x, 1e-6)
    scale = abs(across) * width_ratio / item_w

    # The sketch's own frame is the kit's: x right, y forward, z up. Mapped onto
    # the body's measured basis, so a piece authored upright arrives upright
    # whatever the file thinks its axes are.
    rot = mathutils.Matrix((
        (right.x, fwd.x, up.x),
        (right.y, fwd.y, up.y),
        (right.z, fwd.z, up.z),
    ))
    span = (hi - lo).length
    where = centre + up * (offset[2] * span) + fwd * (offset[1] * span) + right * (offset[0] * span)
    obj.matrix_world = (
        mathutils.Matrix.Translation(where)
        @ rot.to_4x4()
        @ mathutils.Matrix.Scale(scale, 4)
    )
    return True


def stage(sc):
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = 380, 620
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.43, 0.46, 1)
    key = bpy.data.lights.new("key", "SUN")
    key.energy = 3.4
    lamp = bpy.data.objects.new("key", key)
    sc.collection.objects.link(lamp)
    lamp.rotation_euler = (0.95, 0.05, 0.75)
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 1.0
    lamp2 = bpy.data.objects.new("fill", fill)
    sc.collection.objects.link(lamp2)
    lamp2.rotation_euler = (1.2, 0.0, -2.2)


def main():
    root = os.getcwd()
    out_dir = os.path.join(root, OUT)
    os.makedirs(out_dir, exist_ok=True)

    import ideas  # noqa: E402  — needs the items dir on the path, done above

    builders = {fn.__name__: fn for fn in ideas.IDEAS}

    for name, bone, ratio, offset in PIECES:
        build = builders.get(name)
        if not build:
            print(f"no builder named {name}")
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(root, MODELS, "Player_Base.glb"))
        basis = body_basis()

        obj = ideas.smooth(build().finish())
        if not place(obj, bone, ratio, offset, basis):
            continue

        lo = mathutils.Vector((1e9, 1e9, 1e9))
        hi = mathutils.Vector((-1e9, -1e9, -1e9))
        for o in [x for x in bpy.data.objects if x.type == "MESH"]:
            for v in o.data.vertices:
                p = o.matrix_world @ v.co
                lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
                hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
        centre = (lo + hi) / 2
        span = max(hi - lo)

        sc = bpy.context.scene
        stage(sc)
        cam_data = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", cam_data)
        sc.collection.objects.link(cam)
        sc.camera = cam
        up, fwd, right = basis
        # A three-quarter front view, from a little above — near enough the angle
        # the game's camera actually looks down at a character from.
        d = (fwd * 1.0 + right * 0.55 + up * 0.32).normalized() * (span * 1.35)
        cam.location = centre + d
        # THE CAMERA'S UP IS THE BODY'S UP, not the world's. Blender's
        # `to_track_quat("-Z", "Y")` rolls the camera to world +Y, and this body is
        # authored Z-up and laid on its back by the glTF importer — so every shot
        # came back with the character horizontal and half out of frame. The basis
        # is already measured off the face; the camera has to use it too.
        fwd_cam = (centre - cam.location).normalized()
        cam_up = (up - fwd_cam * up.dot(fwd_cam)).normalized()
        cam_right = fwd_cam.cross(cam_up).normalized()
        cam.matrix_world = mathutils.Matrix((
            (cam_right.x, cam_up.x, -fwd_cam.x, cam.location.x),
            (cam_right.y, cam_up.y, -fwd_cam.y, cam.location.y),
            (cam_right.z, cam_up.z, -fwd_cam.z, cam.location.z),
            (0.0, 0.0, 0.0, 1.0),
        ))
        sc.render.filepath = os.path.join(out_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"WROTE {name}.png  on {bone}")


main()
