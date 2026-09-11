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

import os
import sys

import bpy
from mathutils import Vector

# Blender does not put a --python script's own folder on the path, so a sibling
# module is not importable without this.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from player_clips import all_actions  # noqa: E402

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
# MEASURED OFF THE MONK, NOT CHOSEN. `tools/art/measure_monk.py` reads the
# game's existing character — which shares the bone names this rig copied — and
# prints its skeleton and its mesh widths normalised to a 1.8 body. Everything
# below comes from that, because five rounds of adjusting numbers by looking at
# our body ALONE produced an artist's mannequin standing next to a character,
# and every one of those adjustments was a guess dressed as a judgement.
#
# The two biggest differences, and they are not small:
#
#   * THE MONK'S HIP JOINT IS AT 0.626, NOT 0.90. Its legs are a THIRD of its
#     height; ours were half, which is roughly human and completely wrong for
#     this art style. Short legs and a long torso is most of what makes a
#     stylised hero read as one.
#   * ITS HEAD IS 0.38 TALL, 0.45 WIDE AND 0.50 DEEP. Ours was 0.34 by 0.30 by
#     0.28 — barely two thirds of the volume, on a visible neck. A big head sunk
#     between the shoulders is the other half of the look.
#
# Its chest is also half again as deep as ours was (0.33 against 0.20), which is
# why ours read as a plank from the side.
HEIGHT = 1.80
# Overshot once at 0.48 tall and 0.43 wide, which reads as a helmet balanced
# on a gap rather than a head. The Monk's skull bone spans 0.38; this is that
# plus a little, sunk far enough into the chest that no neck shows.
# MATCHING THE MONK'S HEAD EXACTLY MADE THE FIT WORSE, which is worth
# recording because the reasoning sounded right: the game's helms are authored
# for that head, so copying its 0.45 x 0.50 should make them fit. It did not —
# the head then protruded THROUGH the helms, because a helm is positioned
# relative to the head BONE and the Monk's skull sits differently on its bone
# than ours does on ours. Size is only half of a fit.
#
# So this is back to the size that photographed best, and helm alignment is an
# open problem: it wants a per-body offset on the head attachment rather than a
# body reshaped around hats.
HEAD_BOTTOM = 1.26
HEAD_TOP = 1.70
HEAD_HW = 0.190
HEAD_HD = 0.210
# Short, and mostly buried. The Monk's neck bone is 0.08 long.
NECK_TOP = 1.31
SHOULDER_Y = 1.17
CHEST_BOTTOM = 0.95
WAIST_Y = 0.80
HIP_TOP = 0.80
HIP_BOTTOM = 0.58
# The leg joints. 0.63 to the hip, and the knee proportionally higher with it.
HIP_Y = 0.64
KNEE_Y = 0.34
ANKLE_Y = 0.075
SHOULDER_X = 0.228
HIP_X = 0.105
ELBOW_Y = 0.90
WRIST_Y = 0.65


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# --- primitives -------------------------------------------------------------
#
# BOXES WERE THE WRONG PRIMITIVE AND FLAT SHADING WAS THE WRONG FINISH.
#
# The first body was eight-vertex boxes, flat-shaded, on the stated reasoning
# that "the faceted look is the art style". It is not, and the models already in
# the game say so plainly: the Monk the player currently wears is 3,447 verts
# and 6,714 triangles with 2,784 of 2,784 polygons SMOOTH-SHADED. Against 152
# verts, 228 triangles and not one smooth face, which is why it was reported as
# looking "like it's built out of blocks" — it was.
#
# So limbs are tapered tubes and bodies are rounded blocks, both smooth-shaded
# with an angle threshold that keeps a crease where a crease belongs. The budget
# to aim at is the neighbours': a few thousand triangles, not a few hundred.

SIDES = 10


def _finish(obj, bevel=0.0, segments=2):
    """Bevel the hard edges and smooth-shade the result.

    The bevel is what stops a low-poly form reading as a cardboard box: a
    highlight needs somewhere to sit, and a perfect 90-degree edge gives it a
    single pixel. Two segments at a centimetre is invisible as geometry and
    changes the whole surface.
    """
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = 0.6
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def tube(name, x, z0, z1, r0, r1, squash=1.0, bevel=0.012):
    """A tapered limb: wide at the joint above, narrower at the joint below."""
    depth = z1 - z0
    bpy.ops.mesh.primitive_cone_add(
        vertices=SIDES, radius1=r0, radius2=r1, depth=depth,
        location=(x, 0.0, z0 + depth / 2),
    )
    obj = bpy.context.object
    obj.name = name
    # Limbs are not circular in section — an upper arm is deeper than it is
    # wide, a thigh more so — and squashing the tube is one number against
    # modelling an oval.
    obj.scale = (1.0, squash, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    return _finish(obj, bevel)


def blockish(name, center, size, bevel=0.04, segments=3):
    """A rounded block: the torso, the head, a fist, a boot.

    THE BEVEL IS CLAMPED TO THE PART, and that is not paranoia. A bevel eats
    inward from every edge, so one wider than half the smallest dimension
    consumes the whole shape: the abdomen was 0.10 units tall with a 0.045
    bevel asked for, and it rendered as a thin floating disc with the torso
    missing between the chest and the hips. The failure does not look like "the
    bevel is too big" — it looks like the model fell apart.
    """
    # `size=1.0` MAKES A CUBE ONE UNIT ACROSS, not one unit from the centre.
    # Scaling it by size/2 therefore halves every block — the head, the chest,
    # the pelvis, both fists and both boots came out at half their authored
    # dimensions, and the body read as a narrow trunk with limbs bolted on. It
    # took an ORTHOGRAPHIC render to catch: under perspective the head is
    # foreshortened anyway and "the head is 120 pixels where 218 was intended"
    # is not a measurement you can take.
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(obj, min(bevel, 0.3 * min(size)), segments)


def taper_block(name, center, size, top_scale, bevel=0.04, segments=3):
    """A rounded block that narrows toward the top, for a chest or a pelvis.

    LOCAL SPACE, NOT WORLD. The first version read `v.co.z` — which is LOCAL,
    because `primitive_cube_add(location=...)` puts the centre in the object's
    transform and leaves the mesh centred on its own origin — and compared it
    against a top and bottom computed in WORLD space. For the chest that made
    the interpolant about -3.5 instead of 0..1, and the taper scaled the whole
    block to 58% of its authored width.
    
    Every trunk piece was silently shrunk, which is why the body kept reading as
    too narrow through three rounds of widening the numbers: the numbers were
    fine and were being multiplied away. Nothing in the render says "this block
    is 58% of its size" — it says "the torso looks thin", and the obvious
    response to that is to make the torso wider, which does not help when the
    fault is a factor rather than a term.
    """
    obj = blockish(name, center, size, bevel, segments)
    half = size[2] / 2
    for v in obj.data.vertices:
        # 0 at the bottom of the block, 1 at the top — in the space the vertex
        # is actually expressed in.
        k = (v.co.z + half) / max(1e-6, size[2])
        s = 1.0 + (top_scale - 1.0) * k
        v.co.x *= s
        v.co.y *= s
    return obj


# --- the body ---------------------------------------------------------------
#
# Each entry is (part name, bone it binds to, geometry). The mapping is the
# whole rig: one part, one bone, weight 1.
def build_body():
    """Every part, and the bone it is bound wholly to."""
    parts = []

    def add(obj, bone):
        parts.append((obj, bone))

    # HEAD: big, deep, and sitting almost on the shoulders. Bevelled hard so it
    # is a skull rather than a crate.
    add(blockish("head", (0, -0.012, (HEAD_BOTTOM + HEAD_TOP) / 2),
                 (HEAD_HW * 2, HEAD_HD * 2, HEAD_TOP - HEAD_BOTTOM),
                 bevel=0.075, segments=4), "Head")
    # A jaw block under the skull, which is what stops a head being a box: the
    # Monk's face juts forward of its cranium and the shadow under it is most of
    # what reads as a face at this distance.
    add(blockish("jaw", (0, -0.070, HEAD_BOTTOM + 0.095),
                 (0.275, 0.19, 0.16), bevel=0.048, segments=3), "Head")
    add(tube("neck", 0, SHOULDER_Y - 0.10, HEAD_BOTTOM + 0.06, 0.105, 0.098), "Neck")

    # CHEST: broad at the shoulders, deep, narrowing to the waist.
    # THE CHEST NO LONGER CARRIES THE SHOULDER WIDTH. Tapering it WIDER at the
    # top made a horizontal slab across the figure — a coat hanger — and the
    # arms then hung inside its silhouette and vanished. The deltoid balls are
    # the widest thing up there now, which is how the Monk is built.
    add(taper_block("chest", (0, 0, (CHEST_BOTTOM + SHOULDER_Y) / 2),
                    (0.315, 0.29, SHOULDER_Y - CHEST_BOTTOM + 0.10), top_scale=1.02,
                    bevel=0.055), "Torso")
    add(taper_block("abdomen", (0, 0, 0.875),
                    (0.30, 0.255, 0.20), top_scale=1.10,
                    bevel=0.045), "Abdomen")
    add(taper_block("pelvis", (0, 0, 0.705),
                    (0.345, 0.275, 0.24), top_scale=0.94,
                    bevel=0.05), "Hips")

    # A BELT. One block, and the single cheapest thing that separates a torso
    # into a chest and hips instead of one continuous sausage.
    add(blockish("belt", (0, 0, 0.805), (0.335, 0.285, 0.075), bevel=0.028, segments=2), "Abdomen")

    for side, sx in (("L", 1.0), ("R", -1.0)):
        x = sx * SHOULDER_X
        # Shoulder: a ball, and a big one. This is the join the eye reads first
        # on a character with its arms down.
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.098,
                                             location=(x, 0, SHOULDER_Y - 0.05))
        cap = bpy.context.object
        cap.name = f"shoulder{side}"
        cap.scale = (1.0, 0.98, 0.88)
        bpy.ops.object.transform_apply(scale=True)
        _finish(cap)
        add(cap, f"Shoulder{side}")

        add(tube(f"upperarm{side}", x, ELBOW_Y, SHOULDER_Y - 0.03, 0.070, 0.088, squash=1.05), f"UpperArm{side}")
        add(tube(f"lowerarm{side}", x, WRIST_Y, ELBOW_Y + 0.02, 0.058, 0.074, squash=1.0), f"LowerArm{side}")
        # A fist with some mass in it: the Monk's gauntlets are the widest part
        # of its arm, and a small hand makes a thick arm look swollen.
        add(blockish(f"fist{side}", (x, -0.012, WRIST_Y - 0.072),
                     (0.115, 0.135, 0.155), bevel=0.038, segments=3), f"Fist{side}")

        lx = sx * HIP_X
        # A CUFF AT THE TOP OF THE THIGH and another at the boot. The Monk has
        # both — armoured skirt plates and boot tops — and they are most of why
        # its legs read as legs in armour rather than as two tubes. Three
        # primitives against a shape nobody would model by hand.
        add(tube(f"thighcuff{side}", lx, HIP_Y - 0.10, HIP_Y + 0.04, 0.125, 0.132, squash=1.05, bevel=0.03), f"UpperLeg{side}")
        add(tube(f"bootcuff{side}", lx, ANKLE_Y + 0.03, ANKLE_Y + 0.16, 0.098, 0.104, squash=1.0, bevel=0.028), f"LowerLeg{side}")
        add(tube(f"upperleg{side}", lx, KNEE_Y, HIP_Y + 0.03, 0.088, 0.115, squash=1.05), f"UpperLeg{side}")
        add(tube(f"lowerleg{side}", lx, ANKLE_Y, KNEE_Y + 0.02, 0.068, 0.092, squash=1.0), f"LowerLeg{side}")
        # FORWARD IS -Y, measured off the Monk rather than assumed: its toes
        # extend toward -Y and ours extended toward +Y, so the boots were on
        # backwards. Invisible in a static render because a foot is the only
        # part of this body that is not symmetric front-to-back.
        add(blockish(f"foot{side}", (lx, -0.055, 0.062),
                     (0.165, 0.30, 0.155), bevel=0.04, segments=3), f"Foot{side}")
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
    ("Neck", "Torso", (0, SHOULDER_Y, 0), (0, NECK_TOP, 0)),
    ("Head", "Neck", (0, NECK_TOP, 0), (0, HEAD_TOP, 0)),
]
for _side, _sx in (("L", 1.0), ("R", -1.0)):
    BONES += [
        (f"Shoulder{_side}", "Torso", (0, SHOULDER_Y - 0.04, 0), (_sx * SHOULDER_X, SHOULDER_Y - 0.06, 0)),
        (f"UpperArm{_side}", f"Shoulder{_side}", (_sx * SHOULDER_X, SHOULDER_Y - 0.10, 0), (_sx * SHOULDER_X, ELBOW_Y, 0)),
        (f"LowerArm{_side}", f"UpperArm{_side}", (_sx * SHOULDER_X, ELBOW_Y, 0), (_sx * SHOULDER_X, WRIST_Y, 0)),
        (f"Fist{_side}", f"LowerArm{_side}", (_sx * SHOULDER_X, WRIST_Y, 0), (_sx * SHOULDER_X, WRIST_Y - 0.11, 0)),
        (f"UpperLeg{_side}", "Hips", (_sx * HIP_X, HIP_Y, 0), (_sx * HIP_X, KNEE_Y, 0)),
        (f"LowerLeg{_side}", f"UpperLeg{_side}", (_sx * HIP_X, KNEE_Y, 0), (_sx * HIP_X, ANKLE_Y, 0)),
        (f"Foot{_side}", f"LowerLeg{_side}", (_sx * HIP_X, ANKLE_Y, 0), (_sx * HIP_X, ANKLE_Y - 0.02, -0.11)),
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
        # NO AXIS SWAP HERE ANY MORE. The old `box` helper took its arguments
        # as (x, height, depth) for readability and this undid that; the
        # primitives are placed in Blender's own Z-up space directly, so
        # swapping now would lay the character on its back.
        obj.vertex_groups.new(name=bone)
        obj.vertex_groups[bone].add(range(len(obj.data.vertices)), 1.0, "REPLACE")
        objs.append(obj)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "Body"
    body.data.name = "BodyMesh"

    # SMOOTH, WITH A CREASE ANGLE. Every polygon on the Monk is smooth-shaded;
    # the low-poly look in this art style comes from the SILHOUETTE and from
    # sparse geometry, not from faceting the surface. An angle threshold keeps
    # the hard edges hard — the corner of a boot, the brow of a helmet — while
    # letting a ten-sided limb read as round.
    for poly in body.data.polygons:
        poly.use_smooth = True
    smooth = body.modifiers.new("Smooth by Angle", "NODES") if hasattr(bpy.ops.object, "shade_auto_smooth") else None
    if smooth:
        body.modifiers.remove(smooth)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.shade_auto_smooth(angle=0.96)

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
    # BIG ENOUGH TO JUDGE. At 560x760 the figure was a couple of hundred
    # pixels tall and a missing torso segment looked like a shading artefact —
    # a render too small to answer the question is the same mistake as a render
    # framed wrongly, one step further along.
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1200
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
        "front": Vector((0.0, -3.05, 1.00)),
        "side": Vector((3.05, -0.15, 1.00)),
        "three-quarter": Vector((2.10, -2.30, 1.35)),
    }
    cam.location = spots.get(angle, spots["three-quarter"])
    # ORTHOGRAPHIC, because this render exists to judge PROPORTION. A 55mm lens
    # three metres from a 1.8-metre figure foreshortens the head and swells the
    # belly, and I spent a round reasoning about widths off a picture that was
    # lying about them by design. Perspective is right for showing a character
    # and wrong for measuring one.
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.2
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
    acts = all_actions(arm)

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_animations=True,
        # EVERY ACTION, not just the active one. The default exports whatever is
        # assigned plus NLA strips, which on a rig carrying eight loose actions
        # is one clip and a shrug.
        export_animation_mode="ACTIONS",
        export_yup=True,
        use_selection=True,
    )
    print(f"RIG bones={len(arm.data.bones)} verts={len(body.data.vertices)} clips={len(acts)}: " + ", ".join(a.name for a in acts))
    print(f"EXPORTED {out}")
    # A STRIP OF FRAMES THROUGH ONE CLIP, which is how a gait is judged. A
    # still of a walk says nothing: what matters is whether the legs alternate,
    # whether the arms oppose them, and whether the pose at the end matches the
    # pose at the start. Six frames from the side answers all three.
    strip = args[2] if len(args) > 2 else None
    if strip and preview:
        stem = preview[:-4] if preview.endswith(".png") else preview
        act = next((x for x in acts if x.name.lower() == strip.lower()), None)
        if act is None:
            print(f"NO CLIP {strip}")
        else:
            arm.animation_data.action = act
            length = int(act.frame_range[1])
            for i in range(6):
                frame = 1 + round(i * (length - 1) / 5)
                path = f"{stem}-{act.name.lower()}-{i}.png"
                render_preview(path, frame=frame, angle="side")
                print(f"FRAME {frame} {path}")
        return

    if preview:
        stem = preview[:-4] if preview.endswith(".png") else preview
        for angle in ("front", "side", "three-quarter"):
            path = f"{stem}-{angle}.png"
            render_preview(path, angle=angle)
            print(f"PREVIEW {path}")


main()
