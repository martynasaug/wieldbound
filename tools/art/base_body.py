# THE PLAYER'S OWN BODY, ON THE PACK'S SKELETON.
#
#   blender --background --factory-startup --python tools/art/base_body.py -- \
#       [--export client/public/models/Player_Base.glb] [--render out.png]
#
# WHY THIS EXISTS, and it is the third answer to the same question.
#
# The player needs a body to wear items ON. The first answer was the Monk, which
# is one welded lump with its clothes and its boxing-glove fists modelled in —
# four sessions went into taking those gloves off and the result still read as a
# paddle. The second was `Player_Base.glb` from `tools/art/player_rig.py`: a real
# attempt, but a featureless mannequin of rounded blocks on a 21-BONE rig of its
# own, which is the wrong skeleton. The pack's costumes and all twenty-five
# pooled clips are authored against a 44-bone `CharacterArmature`, so a 21-bone
# base throws both away.
#
# The third answer is this: keep the pack's skeleton, keep the pack's own head,
# hands and feet, and author only the part that does not exist — the body
# between them.
#
# WHAT THE PACK CAN AND CANNOT GIVE. Every costume in this kit is a single
# skinned surface where the clothes ARE the torso: cut the cloth away by bone
# weight and what remains is a head, two forearm stubs and two ankle nubs
# floating in space (rendered, to be sure rather than to assume —
# `tools/soak/shots/pack/WizardSkinOnly.png`). There is no body under the robe.
# So the skin islands are harvested and the underlayer is modelled to join them.
#
# A SIMPLE UNDERLAYER, not bare skin: a tunic and shorts, which is what a
# character wears before any armour and is far easier to make read at ninety
# pixels than anatomy would be. Armour, robes and cloaks are ITEMS worn over
# this; they are cut from the pack costumes by the same bone-weight split, and
# they never replace the head, the palms or the feet.
#
# MEASURED, NOT EYEBALLED. Every number below comes from the rig itself, in the
# body's own space (metres, z up, T-pose):
#
#     Head    bone 2.127 -> 2.756      head island   z 2.015 .. 2.994
#     Neck    bone 1.996 -> 2.127
#     Torso   bone 1.558 -> 1.830
#     Abdomen bone 1.242 -> 1.558
#     Hips    bone 1.026 -> 1.242
#     UpperArm x 0.320 -> 0.711        LowerArm x 0.711 -> 1.161
#     Fist     x 1.161 -> 1.288        hand island |x| 1.311 .. 1.526
#     UpperLeg z 1.158 -> 0.608        LowerLeg  z 0.608 -> 0.022
#     Foot     z 0.022                 foot island   z -0.003 .. 0.061
#
# The limbs are built as tapered rings along those bone axes and each ring is
# weighted to the bone whose segment it sits on. Rigid per-section weighting is
# what this kit itself does at this scale — the pack's own bodies barely blend —
# and it means no vertex can be pulled between two joints by a weight I guessed.

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

DONOR = "client/public/models/Wizard.fbx"
DONOR_MESH = "Wizard.001"

# The regions of a pack costume that are SKIN and are kept exactly as they are.
SKIN_BONES = ("Fist", "Thumb", "Foot", "Head", "Neck")

# --- what the rig measures ---------------------------------------------------
# Rest positions, world space, from the donor's own armature.
NECK_Z = 1.996
TORSO_Z0, TORSO_Z1 = 1.558, 1.830
ABDOMEN_Z0 = 1.242
HIPS_Z0 = 1.026
SHOULDER_X, ELBOW_X, WRIST_X = 0.320, 0.711, 1.161
HAND_X = 1.311            # where the harvested hand island begins
HIP_Z, KNEE_Z, ANKLE_Z = 1.158, 0.608, 0.022
FOOT_TOP_Z = 0.061        # where the harvested foot island reaches

# Half-widths. The pack is chunky and reads by silhouette, so these are blocky
# on purpose — a tunic that tapers like a dress form looks wrong beside a Rogue.
# MEASURED OFF THE PACK'S OWN BODIES, by slicing all four costumes horizontally
# and reading the trunk's half-width at each height. Guessing against the head
# island gave a puppet: a big skull on a narrow tapered trunk.
#
#                 neck    shoulder  ribs    waist   hip
#     Rogue       0.284   0.293     0.292   0.175   0.166
#     Ranger      0.312   0.281     0.212   0.222   0.236
#     Warrior     0.315   0.269     0.277   0.200   0.298
#     Wizard      0.297   0.306     0.271   0.300   0.280
#
# (Rows with n<5 are ignored — at chest height the band catches only arms,
# because the torso is hollow there, which is how `halfX=0.000` appears.)
#
# THE SHAPE IS A BARREL, NOT AN HOURGLASS. The striking thing is how little the
# trunk changes from neck to hip on any of them: roughly 0.28 all the way down,
# with only a slight waist. Mine tapered from 0.26 to 0.225 and read as a
# spindle. These are the measured numbers, rounded to the middle of the four.
NECK_R = 0.240
CHEST_R = 0.295
WAIST_R = 0.250
HIP_R = 0.285
# BELOW THE HIP RING, NOT ABOVE IT. This was 1.030 against a hip at 1.026, so the
# tunic's last section was four millimetres tall and inverted.
#
# AND MUCH HIGHER THAN 0.930. Rendered beside the Rogue at identical framing, the
# clearest difference was not the head — that matches the pack exactly — but the
# TORSO: the Rogue's trunk is a short wide barrel that ends at its belt around
# z 1.35, while mine ran long and slab-sided all the way to 0.93 and read as a
# puppet. The tunic ends at the hip, and the shorts are short.
TUNIC_HEM_Z = 1.090
SHORTS_HEM_Z = 0.980
# Arms, measured the same way: the pack's own arm sections read 0.15-0.20 at the
# shoulder and about 0.10 at shin height. Mine were 0.115 tapering to 0.085.
UPPER_ARM_R = 0.170
ELBOW_R = 0.140
WRIST_R = 0.110
# And legs against a hip of 0.285 rather than sticks under a wider tunic.
THIGH_R = 0.185
KNEE_R = 0.140
ANKLE_R = 0.110
LEG_X = 0.200             # the leg's own axis, from UpperLeg.L head x 0.196
# THE ARM IS LEVEL IN THE T-POSE. Shoulder, elbow and wrist joints all sit at
# z 1.858-1.868; the first pass started the arm at the TORSO's top (1.820),
# 0.048 below the joint, so it climbed from shoulder to elbow and read as a limb
# hanging at forty-five degrees.
ARM_Z = 1.866


def ring(centre, radius, sides=8, squash=1.0, axis="z"):
    """A ring of points round an axis — the section every limb is built from."""
    out = []
    for k in range(sides):
        a = 2 * math.pi * k / sides + math.pi / sides
        c, s = math.cos(a) * radius, math.sin(a) * radius * squash
        if axis == "z":
            out.append(Vector((centre[0] + c, centre[1] + s, centre[2])))
        else:  # along x, for arms
            out.append(Vector((centre[0], centre[1] + c, centre[2] + s)))
    return out


def loft(bm, rings, close_start=False, close_end=False):
    """Skin a sequence of rings into faces."""
    made = [[bm.verts.new(p) for p in r] for r in rings]
    for a, b in zip(made, made[1:]):
        n = len(a)
        for k in range(n):
            bm.faces.new([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]])
    if close_start:
        bm.faces.new(list(reversed(made[0])))
    if close_end:
        bm.faces.new(made[-1])
    return made


def weight_for(co):
    """
    Which bone a new vertex follows, from where it sits.

    Deliberately a hard assignment rather than a blend. The pack skins this way
    at this scale, and a guessed blend is how a vertex ends up pulled halfway to
    a joint it does not belong to.
    """
    x, _y, z = co.x, co.y, co.z
    side = "L" if x > 0 else "R"
    ax = abs(x)
    # Arms: anything far enough out along x.
    if ax > SHOULDER_X - 0.02 and z > 1.55:
        if ax >= ELBOW_X:
            return f"LowerArm.{side}"
        return f"UpperArm.{side}"
    # Legs: below the hips.
    if z < HIP_Z + 0.02 and ax > 0.06:
        if z <= KNEE_Z:
            return f"LowerLeg.{side}"
        return f"UpperLeg.{side}"
    # Trunk, bottom to top.
    if z < ABDOMEN_Z0:
        return "Hips"
    if z < TORSO_Z0:
        return "Abdomen"
    if z < NECK_Z:
        return "Torso"
    return "Neck"


def build_underlayer(bm):
    """The tunic, the shorts and the limbs: everything the pack does not ship."""
    # THE TRUNK — neck down to the tunic's hem, as one lofted column. Squashed
    # in y because a torso is an oval seen from above, not a tube.
    # THE TOP RING MEETS THE SKULL, and finding where that is took a measurement
    # rather than a bound. The head island's LOWEST vertex is z 1.859 — but that
    # is one orphan vertex in the `Neck` group (n=1, halfX=0.000), and the real
    # head geometry does not begin until the tenth percentile at z 2.136. A ring
    # at 1.900 therefore stopped a quarter of a metre short of the skull and left
    # a hole with a single stray triangle bridging it, which is the dark notch
    # under the chin in every render so far.
    trunk = [
        ring((0, 0, 2.130), NECK_R * 0.86, squash=0.9),
        ring((0, 0, 1.960), NECK_R, squash=0.9),
        ring((0, 0, TORSO_Z1), CHEST_R * 0.92, squash=0.78),
        ring((0, 0, TORSO_Z0), CHEST_R, squash=0.78),
        ring((0, 0, ABDOMEN_Z0), WAIST_R, squash=0.80),
        ring((0, 0, HIPS_Z0), HIP_R, squash=0.84),
        # The hem stands slightly proud, the way a tunic hangs away from a hip.
        ring((0, 0, TUNIC_HEM_Z), HIP_R * 1.06, squash=0.86),
    ]
    loft(bm, trunk, close_start=True, close_end=True)

    for side in (1, -1):
        # THE ARM — shoulder to wrist, along x, stopping where the harvested
        # hand island starts so the two meet instead of overlapping.
        # A SHOULDER, THEN AN ARM. Rendered beside the Rogue these were flat
        # planks of constant width sticking out of the ribs: three rings all
        # within a hair of the same radius, the first already outside the trunk.
        # A limb in this pack swells at the deltoid and tapers from there, and
        # that swell is what makes the arm look attached rather than glued on.
        arm = [
            # Buried inside the chest, so the join is hidden rather than seamed.
            ring((side * (SHOULDER_X - 0.14), 0.02, ARM_Z), UPPER_ARM_R * 1.25, axis="x"),
            # The deltoid: the widest point of the whole arm.
            ring((side * (SHOULDER_X + 0.02), 0.02, ARM_Z), UPPER_ARM_R * 1.18, axis="x"),
            ring((side * ELBOW_X, 0.03, ARM_Z), ELBOW_R, axis="x"),
            ring((side * (HAND_X - 0.01), 0.043, ARM_Z - 0.006), WRIST_R, axis="x"),
        ]
        loft(bm, arm, close_start=True, close_end=True)

        # THE LEG — shorts at the top, then the shin down to the ankle, ending
        # where the harvested foot island begins.
        # HEAVY COLUMNS THAT FLARE INTO THE HIP, not stilts. Beside the Rogue
        # these were two even posts with daylight between the shorts hem and the
        # knee — the top ring sat at HIP_Z + 0.02 while the hem had moved, so the
        # thigh started below the shorts instead of inside them.
        leg = [
            # Inside the tunic, so hip and thigh are continuous.
            ring((side * LEG_X, 0.02, TUNIC_HEM_Z + 0.04), THIGH_R * 1.12),
            ring((side * LEG_X, 0.01, SHORTS_HEM_Z), THIGH_R),
            ring((side * LEG_X, 0.00, KNEE_Z), KNEE_R),
            ring((side * LEG_X, 0.02, FOOT_TOP_Z + 0.01), ANKLE_R),
        ]
        loft(bm, leg, close_start=True, close_end=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    export = None
    render = None
    i = 0
    while i < len(args):
        if args[i] == "--export":
            export = os.path.abspath(args[i + 1]); i += 2
        elif args[i] == "--render":
            render = os.path.abspath(args[i + 1]); i += 2
        else:
            i += 1

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(DONOR))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = bpy.data.objects[DONOR_MESH]

    # 1. KEEP ONLY THE SKIN. Head, hands and feet, exactly as the pack authored
    #    them — the same cut that produced `WizardSkinOnly.png`.
    me = body.data
    groups = {g.index: g.name for g in body.vertex_groups}

    def dom(v):
        if not v.groups:
            return "?"
        return groups[max(v.groups, key=lambda g: g.weight).group]

    doomed = []
    for p in me.polygons:
        names = [dom(me.vertices[i]) for i in p.vertices]
        if not any(any(s in n for s in SKIN_BONES) for n in names):
            doomed.append(p.index)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in doomed], context="FACES")
    bm.to_mesh(me)
    bm.free()
    kept = len(me.polygons)

    # 2. BUILD THE UNDERLAYER as its own mesh, in the same world space.
    under_bm = bmesh.new()
    build_underlayer(under_bm)
    bmesh.ops.remove_doubles(under_bm, verts=under_bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(under_bm, faces=under_bm.faces)
    under_me = bpy.data.meshes.new("Underlayer")
    under_bm.to_mesh(under_me)
    under_bm.free()
    for poly in under_me.polygons:
        poly.use_smooth = False
    under = bpy.data.objects.new("Underlayer", under_me)
    bpy.context.collection.objects.link(under)
    under.matrix_world = body.matrix_world.copy()

    # 3. WEIGHT IT, one bone per vertex, from where the vertex sits.
    made = {}
    inv = body.matrix_world.inverted()
    for v in under_me.vertices:
        world = under.matrix_world @ v.co
        name = weight_for(world)
        g = made.get(name) or under.vertex_groups.get(name) or under.vertex_groups.new(name=name)
        made[name] = g
        g.add([v.index], 1.0, "REPLACE")
    _ = inv

    # 4. JOIN the underlayer into the harvested skin so the player is ONE mesh
    #    on ONE skeleton, the way every pack body is.
    bpy.ops.object.select_all(action="DESELECT")
    under.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = "PlayerBody"
    body.data.name = "PlayerBody"

    print(f"BASE BODY: kept {kept} skin faces, total {len(body.data.polygons)} faces, "
          f"{len(body.vertex_groups)} vertex groups, armature {len(arm.data.bones)} bones")

    # Nothing else from the donor travels: no robe, no staff, no hood.
    for o in list(bpy.data.objects):
        if o.type == "MESH" and o is not body:
            bpy.data.objects.remove(o, do_unlink=True)

    if render:
        sc = bpy.context.scene
        sc.render.engine = "CYCLES"
        sc.cycles.samples = 24
        sc.cycles.device = "CPU"
        sc.render.resolution_x, sc.render.resolution_y = 420, 700
        w = bpy.data.worlds.new("w")
        sc.world = w
        w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (0.35, 0.35, 0.38, 1)
        cd = bpy.data.cameras.new("c")
        cam = bpy.data.objects.new("c", cd)
        sc.collection.objects.link(cam)
        sc.camera = cam
        cd.type = "ORTHO"
        cd.ortho_scale = 3.3
        cam.location = (0.0, -6.0, 1.5)
        cam.rotation_euler = (math.radians(90), 0, 0)
        sd = bpy.data.lights.new("s", "SUN")
        sd.energy = 4.0
        sun = bpy.data.objects.new("s", sd)
        sc.collection.objects.link(sun)
        sun.rotation_euler = (math.radians(55), 0, math.radians(-35))
        sc.render.filepath = render
        bpy.ops.render.render(write_still=True)
        print(f"RENDERED {render}")

    if export:
        os.makedirs(os.path.dirname(export), exist_ok=True)
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(
            filepath=export,
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_extras=True,
            export_yup=False,
            export_animations=True,
        )
        print(f"WROTE {export}")


main()
