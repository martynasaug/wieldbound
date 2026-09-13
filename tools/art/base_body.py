# THE PLAYER'S OWN BODY.
#
#   blender --background --factory-startup --python tools/art/base_body.py -- \
#       [--export client/public/models/Player_Base.glb] [--render out.png]
#
# WHY THIS EXISTS, and it is the fourth answer to the same question. The first
# three are recorded because each one failed for a reason worth not repeating.
#
#   1. THE MONK. The player body since the rig landed, and the one model in this
#      pack that is a single welded lump — clothes and boxing-glove fists
#      modelled into the mesh. Four sessions went into taking those gloves off;
#      `removeGloves` never matched a single island because the forearm and hand
#      are ONE surface, and the modelled hand that replaced it still read as a
#      paddle.
#
#   2. A MANNEQUIN OF MY OWN. `tools/art/player_rig.py` built a body and a rig
#      from scratch: featureless rounded blocks on a 21-BONE skeleton. The pack's
#      costumes and all twenty-five pooled clips are authored against a 44-bone
#      `CharacterArmature`, so adopting it throws both away and gives worse art.
#
#   3. SCULPTING AN UNDERLAYER. Harvest the pack's head, hands and feet — every
#      costume is a single skinned surface where the clothes ARE the torso, so
#      cutting the cloth away leaves a head, two forearm stubs and two ankle nubs
#      floating in space (`tools/soak/shots/pack/WizardSkinOnly.png`) — and model
#      the body between them. Five passes of hand-tuned ring radii, each judged
#      against a render, and the last produced one improvement out of three
#      attempted. That is the signal to stop, not to guess a sixth time.
#
#   4. THIS. The pack already contains the thing I was approximating. The Rogue
#      IS a plain figure in a tunic and shorts on the right skeleton; everything
#      that makes it a rogue is a separate prop parented to a bone. So the base
#      body is the Rogue stripped, which is a cut rather than a sculpt — and the
#      cut is one already proven to work.
#
# WHAT COMES OFF: Belt, Guard, Pouch, Shoelace.L/R and Rogue_Dagger, all rigid
# props; and the `Face` plane, because the head belongs to character
# customization and helms are the only item that may change it. What is left is
# `Rogue`, 562 faces of authored body — bare head, bare hands, bare feet, tunic,
# shorts — on the 44-bone armature every garment and every pooled clip expects.
#
# ARMOUR, ROBES AND CLOAKS ARE ITEMS worn over this. They are cut from the pack's
# costumes by the same bone-weight split that produced the skin islands above,
# and they never replace the head, the palms or the feet.
#
# ORIENTATION AND SIZE ARE TWO DIFFERENT PROBLEMS, and neither value of the
# exporter's `export_yup` flag solves both:
#
#     export_yup=False   Z-up data. `instantiate` in `assets.ts` scales a model
#                        by bounding-box HEIGHT — `height / size.y` — and read
#                        the character's DEPTH (0.814) as its height, so the body
#                        arrived 3.6x too large.
#     export_yup=True    Numbers correct (y 2.949, scale 0.6105) and the
#                        character face-down on the cobbles: the armature and
#                        every clip were authored Z-up, and a blanket conversion
#                        tips the whole rig.
#
# So the rotation is applied to the ARMATURE before export and the exporter is
# told not to convert again. The data is genuinely Y-up, on a rig rotated with
# it, which is what the loader expects.
#
# AND DO NOT VERIFY A GLB BY RE-IMPORTING IT INTO BLENDER. That cost an hour.
# Blender's glTF IMPORTER applies its own Y-up conversion on read, so measuring
# a freshly written file in Blender reports the importer's interpretation rather
# than the bytes: the same file measured `y 3.945, tallest=y` in Blender and
# `y 0.814, z 2.949` in the browser, and I believed the wrong one and "fixed"
# an export that was never what I thought it was. The only honest measurement of
# a GLB is the one taken by the engine that will load it — see the probe that
# prints `PROTO` from inside the running client.
#
# MEASUREMENTS kept from the sculpting attempt, because they were dearly bought
# and are the reference for cutting garments out of costumes later (body space,
# metres, z up, T-pose, before the export rotation):
#
#     Head    bone 2.127 -> 2.756      head geometry begins z 2.136
#     Neck    bone 1.996 -> 2.127      (its lone vertex at 1.859 is an orphan)
#     Torso   bone 1.558 -> 1.830
#     Abdomen bone 1.242 -> 1.558
#     Hips    bone 1.026 -> 1.242
#     UpperArm x 0.320 -> 0.711        LowerArm x 0.711 -> 1.161
#     Fist     x 1.161 -> 1.288        hand island |x| 1.311 .. 1.526
#     UpperLeg z 1.158 -> 0.608        LowerLeg  z 0.608 -> 0.022
#     Foot     z 0.022                 foot island   z -0.003 .. 0.061

import math
import os
import sys

import bpy

DONOR = "client/public/models/Rogue.fbx"
BODY_MESH = "Rogue"

# Everything that makes the donor a ROGUE rather than a person.
#
# `Face` IS KEPT, and that reverses an earlier decision. It was stripped on the
# reasoning that the head belongs to the character creator — which is right about
# who OWNS it and wrong about what to ship in the meantime: the creator has no
# face art, so stripping it left every player bald and featureless, and the
# Monk-era hair that was supposed to cover for it is modelled in a different
# rig's frame and cannot be placed (five attempts, recorded in `hair.ts`).
#
# This Face is 122 faces authored for THIS skull, parented to `Head`, and it fits
# with nothing fitted. Face variety later is then a cheap change rather than a
# new system: the pack ships three more (Warrior 1446, Wizard 1410, Monk 2624),
# all on the same bone with the same convention, so a creator option becomes a
# choice of which one to load.
#
# `Icosphere` is scene junk the donor carries — 80 faces of nothing, riding along
# in every export until it was spotted by re-importing the result and listing
# what was actually in the file.
STRIP = ("Belt", "Guard", "Pouch", "Shoelace.L", "Shoelace.R", "Rogue_Dagger", "Icosphere")


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
    body = bpy.data.objects[BODY_MESH]
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")

    # `STRIP` GOVERNS THIS, AND UNTIL NOW IT DID NOT. This loop dropped every
    # mesh that was not the body, so taking "Face" out of the tuple above changed
    # nothing but the warning text: the export came back byte-identical, 562
    # faces, and the player stayed bald. The same shape of mistake as
    # `removeGloves` — editing a rule that nothing consults — and the same tell,
    # a number that does not move when it should.
    dropped = []
    kept = []
    for o in [x for x in bpy.data.objects if x.type == "MESH" and x is not body]:
        if o.name in STRIP:
            dropped.append(o.name)
            bpy.data.objects.remove(o, do_unlink=True)
        else:
            kept.append(o.name)
    body.name = "PlayerBody"
    body.data.name = "PlayerBody"

    print(f"BASE BODY faces={len(body.data.polygons)} verts={len(body.data.vertices)} "
          f"groups={len(body.vertex_groups)} bones={len(arm.data.bones)} "
          f"clips={len(bpy.data.actions)}")
    # AND THE MATERIAL, WHICH THIS SCRIPT KEPT NOT DOING. The body once rendered
    # as black chrome, and the fix — attach the atlas the client ships, drop the
    # metalness — was made in a one-off shell command and never written down
    # here. Every export since has quietly undone it: re-imported, this file
    # reads `images=NONE, metallic=1.0` on both meshes. The same shape of mistake
    # as `STRIP` governing nothing, and the same cure: put the rule where the
    # work happens.
    #
    # The FBX importer never wires this pack's textures in (measured: no image
    # node anywhere, base colour a flat 0.8), and the glTF branch of `assets.ts`
    # does none of the dressing `dressFbx` does for FBX — so a GLB must carry its
    # own. Metal with no environment map renders near-black, which this project
    # learned once about armour and once about a body.
    texture = os.path.abspath("client/public/textures/Rogue_Texture.png")
    image = bpy.data.images.load(texture) if os.path.exists(texture) else None
    for obj in [body] + [o for o in bpy.data.objects if o.type == "MESH" and o is not body]:
        for mat in obj.data.materials:
            if not mat or not mat.use_nodes:
                continue
            bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf:
                bsdf.inputs["Metallic"].default_value = 0.0
            has_image = any(n.type == "TEX_IMAGE" and n.image for n in mat.node_tree.nodes)
            if image and bsdf and not has_image:
                tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
                tex.image = image
                mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    print(f"  material: {'atlas attached' if image else 'NO TEXTURE FILE'}, metalness 0")

    print("  stripped: " + ", ".join(sorted(dropped)))
    # Said out loud so the two lists cannot silently disagree again: what
    # survives is as much the point as what goes.
    print("  kept:     " + (", ".join(sorted(kept)) if kept else "(nothing but the body)"))
    missing = [n for n in STRIP if n not in dropped]
    if missing:
        # Loud, because a prop that silently stops being stripped is a rogue's
        # dagger welded to every player in the game.
        print("  WARNING: expected to strip but did not find: " + ", ".join(missing))

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
        cd.ortho_scale = 3.4
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
        # NOTHING IS ROTATED HERE. The orientation is the LOADER's job, and every
        # attempt to solve it at export time made things worse in a new way.
        #
        # The last of those attempts was the subtlest and is worth recording,
        # because the numbers all looked right while the character lay on the
        # ground. Baking a -90 degree rotation into the armature with
        # `transform_apply` rotates the BONE RESTS and leaves the mesh vertices
        # untouched — so the exported file measures upright (x 3.098, y 3.007,
        # z 1.004, tall on y), the loader's Z-up test correctly declines to
        # rotate it, and then skinning drags the body flat because the skeleton
        # is in a frame the mesh is not. Mesh and skeleton must agree, and the
        # only way to keep them agreeing is to move neither.
        #
        # So the data stays exactly as the donor authored it: Z-up. `instantiate`
        # in `assets.ts` sees depth exceeding height, rotates the whole object as
        # the FBX loader would have, and both frames stay together. Measured that
        # way, the body stands with its feet at 0 and its head at 1.68.
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
            export_animation_mode="ACTIONS",
        )
        print(f"WROTE {export}")


main()
