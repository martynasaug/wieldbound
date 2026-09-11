# THE PLAYER'S OWN BODY, BUILT FROM A SCRIPT.
#
# Everything a character in this game is made of has been borrowed until now.
# The body is Quaternius's Monk; the other four class rigs exist only so their
# CLIPS can be harvested, and `clips.ts` pools twenty-five animations off the
# five of them because all five happen to share one 44-bone skeleton. That
# arrangement has been quietly deciding what the game can do:
#
#   * There is no chopping animation, no mining animation and no picking
#     animation, because nobody in that pack ever swung an axe at a tree. Three
#     milestones went into working around that — first playing the equipped
#     weapon's attack (a ranger shot arrows at trunks), then one borrowed sword
#     swing for all three, then hand-posed bone arcs.
#   * Character customisation is not possible at all. A body you did not author
#     has exactly the variants it shipped with.
#
# So this builds one. Generated rather than modelled by hand for the same reason
# every other asset in `tools/art/` is: the source of truth is a script that can
# be read, diffed and re-run, not a binary somebody dragged into the repo.
#
#   blender --background --python tools/art/player_rig.py -- <out.glb>
#
# THE BONE NAMES ARE DELIBERATELY THE OLD ONES. `Torso`, `UpperArmR`, `WeaponR`
# and the rest are what `gatherpose.ts` drives, what `Actor.weaponSocket` looks
# for, and what `gear.ts` attaches armour to. Keeping them means this body can
# be dropped in beside the borrowed one and everything that already works goes
# on working — which is the difference between a new rig and a rewrite.
#
# RIGID WEIGHTS, NOT AUTOMATIC ONES. Every part is bound wholly to one bone.
# Blender's automatic weights need a clean watertight mesh and a human eye on
# the result, and this runs headless; rigid binding is predictable, it is
# exactly reproducible from the script, and on a faceted low-poly body it is
# also what the art style wants — these characters bend at joints, not through
# their limbs.

import bpy
import sys
from mathutils import Vector

# --- proportions ------------------------------------------------------------
#
# 1.8 units tall, which is what the rest of the game assumes: `MONSTER_MODELS`
# heights are in the same scale, the camera is framed for it, and
# PLAYER_BODY_RADIUS_PX is 14px against PX_PER_UNIT 40 — a 0.7-unit width.
#
# The head is deliberately large. A realistic head at this scale is four pixels
# across at the camera's distance and the character reads as a stick; the whole
# low-poly-hero style the game's art already uses is built on the opposite
# choice, and the borrowed Monk has it too.
# WHAT THE FIRST RENDER GOT WRONG, since these numbers are the character.
#
#   * The head was TALLER THAN IT WAS WIDE and tapered toward the crown, which
#     is a flowerpot. A stylised head is close to a cube and narrows at the JAW.
#   * The legs began at 51% of the height — realistic proportions, and on a
#     blocky figure they read as stilts. Every low-poly hero in this art style
#     is built the other way: short legs, long torso, big head.
#   * Everything was too thin. A limb thinner than the gap beside it disappears
#     at the distance the camera actually sits.
HEIGHT = 1.80
# Head: a fifth of the whole figure, wider than tall.
# LOWER AND BIGGER than the second attempt. A head perched above a visible
# neck stalk reads as a robot, and this art style hides the neck almost
# entirely: the skull sits down between the shoulders.
HEAD_BOTTOM = 1.38
HEAD_TOP = 1.78
HEAD_HW = 0.185
HEAD_HD = 0.175
SHOULDER_Y = 1.34
CHEST_BOTTOM = 1.06
WAIST_Y = 0.96
HIP_TOP = 0.98
HIP_BOTTOM = 0.86
# Legs start at 46% of the height rather than 51%, which is the single biggest
# difference between "stylised hero" and "stick insect".
HIP_Y = 0.90
KNEE_Y = 0.50
ANKLE_Y = 0.10
SHOULDER_X = 0.208
HIP_X = 0.115
ELBOW_Y = 1.02
WRIST_Y = 0.74


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def box(name, lo, hi, taper_top=1.0, taper_bottom=1.0):
    """
    An axis-aligned box as loose geometry, with optional tapering.

    Tapering is what stops the body reading as a pile of crates: a forearm that
    narrows toward the wrist and a torso that narrows toward the waist are two
    numbers each and most of what makes a blocky character look deliberate
    rather than unfinished.
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    cx = (lo[0] + hi[0]) / 2
    cz = (lo[2] + hi[2]) / 2
    hx = (hi[0] - lo[0]) / 2
    hz = (hi[2] - lo[2]) / 2
    verts = []
    for y, t in ((lo[1], taper_bottom), (hi[1], taper_top)):
        for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append((cx + sx * hx * t, y, cz + sz * hz * t))
    faces = [
        (0, 1, 2, 3),          # bottom
        (7, 6, 5, 4),          # top
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    return obj


# --- the body ---------------------------------------------------------------
#
# Each entry is (part name, bone it binds to, geometry). The mapping is the
# whole rig: one part, one bone, weight 1.
def build_body():
    parts = []

    def add(name, bone, lo, hi, tt=1.0, tb=1.0):
        parts.append((box(name, lo, hi, tt, tb), bone))

    # Head: broad, close to a cube, narrowing at the jaw rather than the crown.
    add("head", "Head", (-HEAD_HW, HEAD_BOTTOM, -HEAD_HD), (HEAD_HW, HEAD_TOP, HEAD_HD), tt=0.94, tb=0.84)
    # A short neck, mostly hidden — enough that the head is attached and not
    # balanced on the collarbone.
    add("neck", "Neck", (-0.088, SHOULDER_Y - 0.06, -0.078), (0.088, HEAD_BOTTOM + 0.03, 0.078))

    # Chest: broad at the shoulders, narrowing to the waist.
    add("chest", "Torso", (-0.205, CHEST_BOTTOM, -0.125), (0.205, SHOULDER_Y, 0.125), tb=0.80)
    add("abdomen", "Abdomen", (-0.16, WAIST_Y, -0.105), (0.16, CHEST_BOTTOM, 0.105), tt=1.04, tb=0.96)
    add("pelvis", "Hips", (-0.17, HIP_BOTTOM, -0.115), (0.17, HIP_TOP, 0.115), tb=0.88)

    for side, sx in (("L", 1.0), ("R", -1.0)):
        # Shoulder cap: what gives a blocky figure a deltoid instead of a
        # right-angle where the arm meets the chest.
        add(
            f"shoulder{side}", f"Shoulder{side}",
            (sx * SHOULDER_X - 0.072, SHOULDER_Y - 0.15, -0.085),
            (sx * SHOULDER_X + 0.066, SHOULDER_Y + 0.005, 0.085),
            tb=0.82,
        )
        add(
            f"upperarm{side}", f"UpperArm{side}",
            (sx * SHOULDER_X - 0.072, ELBOW_Y, -0.072),
            (sx * SHOULDER_X + 0.072, SHOULDER_Y - 0.10, 0.072),
            tb=0.86,
        )
        add(
            f"lowerarm{side}", f"LowerArm{side}",
            (sx * SHOULDER_X - 0.062, WRIST_Y, -0.062),
            (sx * SHOULDER_X + 0.062, ELBOW_Y + 0.01, 0.062),
            tb=0.86,
        )
        add(
            f"fist{side}", f"Fist{side}",
            (sx * SHOULDER_X - 0.068, WRIST_Y - 0.135, -0.066),
            (sx * SHOULDER_X + 0.068, WRIST_Y + 0.005, 0.070),
            tb=0.86,
        )
        add(
            f"upperleg{side}", f"UpperLeg{side}",
            (sx * HIP_X - 0.098, KNEE_Y, -0.098),
            (sx * HIP_X + 0.098, HIP_Y, 0.098),
            tb=0.86,
        )
        add(
            f"lowerleg{side}", f"LowerLeg{side}",
            (sx * HIP_X - 0.082, ANKLE_Y, -0.082),
            (sx * HIP_X + 0.082, KNEE_Y + 0.01, 0.082),
            tb=0.90,
        )
        # The boot reaches forward of the ankle: a foot is the one part that is
        # not symmetric about its joint, and a character without one looks like
        # it is standing on its shins.
        add(
            f"foot{side}", f"Foot{side}",
            (sx * HIP_X - 0.088, 0.0, -0.085),
            (sx * HIP_X + 0.088, ANKLE_Y + 0.05, 0.145),
        )
    return parts


# --- the skeleton -----------------------------------------------------------
#
# (name, parent, head, tail). Positions are in the same space as the geometry,
# so a bone sits where the joint it drives sits.
BONES = [
    ("Root", None, (0, 0, 0), (0, 0.18, 0)),
    ("Hips", "Root", (0, HIP_BOTTOM, 0), (0, HIP_TOP, 0)),
    ("Abdomen", "Hips", (0, HIP_TOP, 0), (0, CHEST_BOTTOM, 0)),
    ("Torso", "Abdomen", (0, CHEST_BOTTOM, 0), (0, SHOULDER_Y, 0)),
    ("Neck", "Torso", (0, SHOULDER_Y, 0), (0, HEAD_BOTTOM, 0)),
    ("Head", "Neck", (0, HEAD_BOTTOM, 0), (0, HEAD_TOP, 0)),
]
for _side, _sx in (("L", 1.0), ("R", -1.0)):
    BONES += [
        (f"Shoulder{_side}", "Torso", (0, SHOULDER_Y - 0.04, 0), (_sx * SHOULDER_X, SHOULDER_Y - 0.06, 0)),
        (f"UpperArm{_side}", f"Shoulder{_side}", (_sx * SHOULDER_X, SHOULDER_Y - 0.10, 0), (_sx * SHOULDER_X, ELBOW_Y, 0)),
        (f"LowerArm{_side}", f"UpperArm{_side}", (_sx * SHOULDER_X, ELBOW_Y, 0), (_sx * SHOULDER_X, WRIST_Y, 0)),
        (f"Fist{_side}", f"LowerArm{_side}", (_sx * SHOULDER_X, WRIST_Y, 0), (_sx * SHOULDER_X, WRIST_Y - 0.11, 0)),
        (f"UpperLeg{_side}", "Hips", (_sx * HIP_X, HIP_Y, 0), (_sx * HIP_X, KNEE_Y, 0)),
        (f"LowerLeg{_side}", f"UpperLeg{_side}", (_sx * HIP_X, KNEE_Y, 0), (_sx * HIP_X, ANKLE_Y, 0)),
        (f"Foot{_side}", f"LowerLeg{_side}", (_sx * HIP_X, ANKLE_Y, 0), (_sx * HIP_X, ANKLE_Y - 0.02, 0.11)),
    ]
# THE WEAPON SOCKET, which is not a joint and does not deform anything: it is a
# named place on the right fist for `Actor.weaponSocket` to find and parent a
# sword to. The whole "class is what you hold" mesh swap hangs off this one
# bone existing with this one name.
BONES.append(("WeaponR", "FistR", (-SHOULDER_X, WRIST_Y - 0.06, 0.02), (-SHOULDER_X, WRIST_Y - 0.06, 0.18)))


def build_armature():
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = "Armature"
    arm.data.name = "PlayerSkeleton"
    edit = arm.data.edit_bones
    # The primitive arrives with one bone; it is the Root once renamed.
    for b in list(edit):
        edit.remove(b)
    made = {}
    for name, parent, head, tail in BONES:
        b = edit.new(name)
        # Blender is Z-up: the tuples above are written (x, height, depth) for
        # readability, so height goes to Z and depth to Y.
        b.head = Vector((head[0], head[2], head[1]))
        b.tail = Vector((tail[0], tail[2], tail[1]))
        if parent:
            b.parent = made[parent]
            b.use_connect = False
        made[name] = b
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def bind(parts, arm):
    """Join every part into one mesh and weight each wholly to its own bone."""
    objs = []
    for obj, bone in parts:
        # Same axis swap as the bones.
        me = obj.data
        for v in me.vertices:
            x, h, d = v.co.x, v.co.y, v.co.z
            v.co = Vector((x, d, h))
        obj.vertex_groups.new(name=bone)
        obj.vertex_groups[bone].add(range(len(me.vertices)), 1.0, "REPLACE")
        objs.append(obj)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "Body"
    body.data.name = "BodyMesh"

    # Flat shading: the faceted look is the art style, and smooth shading on a
    # box is a box with a gradient on it.
    for poly in body.data.polygons:
        poly.use_smooth = False

    mod = body.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    body.parent = arm
    return body


def material(body):
    """
    One material, vertex-coloured later by the game.

    Deliberately plain: `Actor` tints the body from the player's name and the
    wardrobe paints gear on top, so anything authored here would be overwritten
    or would fight it.
    """
    mat = bpy.data.materials.new("PlayerBody")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.62, 0.47, 0.36, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    body.data.materials.append(mat)


def action_fcurves(act):
    """The F-curves of an action, across the old and new Action APIs."""
    if hasattr(act, "fcurves"):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, "layers", []):
        for strip in getattr(layer, "strips", []):
            for bag in getattr(strip, "channelbags", []):
                out.extend(bag.fcurves)
    return out


def idle_action(arm):
    """
    Breathing, and the weight shifting a little.

    WHAT AN IDLE IS FOR: telling the player the game has not frozen. It is the
    animation they will look at for more of the session than any other, and the
    failure mode is not ugliness — it is a character that reads as a statue, or
    one that sways so much it looks like it is on a boat.
    """
    arm.animation_data_create()
    act = bpy.data.actions.new("Idle")
    arm.animation_data.action = act
    for b in arm.pose.bones:
        b.rotation_mode = "QUATERNION"

    # A 96-frame loop at 24fps: four seconds, slow enough not to read as a tic.
    keys = {
        # (bone, axis, [(frame, radians)])
        "Abdomen": ("x", [(1, 0.0), (24, 0.022), (48, 0.0), (72, -0.012), (96, 0.0)]),
        "Torso": ("x", [(1, 0.0), (24, -0.030), (48, 0.0), (72, 0.016), (96, 0.0)]),
        "Neck": ("x", [(1, 0.0), (24, 0.020), (48, 0.0), (72, -0.010), (96, 0.0)]),
        # The head drifts rather than nodding in time with the chest, which is
        # what stops the whole figure pulsing as one object.
        "Head": ("y", [(1, 0.0), (32, 0.045), (64, -0.035), (96, 0.0)]),
        # Arms hang and swing a few degrees, out of phase with each other.
        "UpperArmL": ("x", [(1, 0.0), (30, 0.035), (66, -0.020), (96, 0.0)]),
        "UpperArmR": ("x", [(1, 0.0), (36, -0.030), (72, 0.030), (96, 0.0)]),
        "LowerArmL": ("x", [(1, 0.0), (48, 0.040), (96, 0.0)]),
        "LowerArmR": ("x", [(1, 0.0), (52, 0.035), (96, 0.0)]),
    }
    for name, (axis, frames) in keys.items():
        pb = arm.pose.bones[name]
        for frame, value in frames:
            q = pb.rotation_quaternion
            q.identity()
            setattr(q, axis, value)
            q.w = 1.0
            q.normalize()
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame)

    # The whole body rises and falls a couple of centimetres with the breath.
    root = arm.pose.bones["Root"]
    for frame, dz in ((1, 0.0), (24, 0.012), (48, 0.0), (72, -0.006), (96, 0.0)):
        root.location = Vector((0.0, 0.0, dz))
        root.keyframe_insert("location", frame=frame)

    # EVERY CURVE, WHEREVER THIS BLENDER KEEPS THEM.
    #
    # Actions grew layers and slots in 4.4 and `Action.fcurves` is gone in 5.x,
    # which is the kind of break that turns a script into a one-version
    # artefact. Both shapes are handled so re-running this in two years is not
    # an archaeology exercise.
    for fc in action_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 96
    return act


def look_at(obj, target):
    """Point an object at a point, rather than guessing Euler angles.

    The first version hardcoded a rotation that had been eyeballed, and the
    render came out with the head cropped off the top of the frame and the
    figure in a corner — a picture that cannot answer the question it was taken
    to answer. Aiming is arithmetic; there is no reason to guess at it.
    """
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_preview(path, frame=24, angle="three-quarter"):
    """
    A picture of the thing, because a rig that exports cleanly and looks wrong
    is still wrong.
    """
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 560
    scene.render.resolution_y = 760
    scene.render.film_transparent = False
    scene.frame_set(frame)
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True

    cam = bpy.data.objects.get("Preview")
    if cam is None:
        cam = bpy.data.objects.new("Preview", bpy.data.cameras.new("Preview"))
        bpy.context.collection.objects.link(cam)
    # Distance and lens chosen so a 1.8-unit figure fills the frame with a
    # margin at head and heel — the whole point is to see the silhouette.
    spots = {
        "front": Vector((0.0, -4.2, 1.05)),
        "side": Vector((4.2, -0.2, 1.05)),
        "three-quarter": Vector((2.9, -3.2, 1.55)),
    }
    cam.location = spots.get(angle, spots["three-quarter"])
    cam.data.lens = 55
    look_at(cam, (0.0, 0.0, 0.92))
    scene.camera = cam

    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = args[0] if args else "player.glb"
    preview = args[1] if len(args) > 1 else None

    clear()
    arm = build_armature()
    parts = build_body()
    body = bind(parts, arm)
    material(body)
    act = idle_action(arm)

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_animations=True,
        export_yup=True,
        use_selection=True,
    )
    print(f"RIG bones={len(arm.data.bones)} verts={len(body.data.vertices)} action={act.name}")
    print(f"EXPORTED {out}")
    if preview:
        stem = preview[:-4] if preview.endswith(".png") else preview
        for angle in ("front", "side", "three-quarter"):
            path = f"{stem}-{angle}.png"
            render_preview(path, angle=angle)
            print(f"PREVIEW {path}")


main()
