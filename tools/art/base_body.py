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
import mathutils

DONOR = "client/public/models/Rogue.fbx"
BODY_MESH = "Rogue"

# Everything that makes the donor a ROGUE rather than a person.
#
# `Face` IS STRIPPED, and the round trip through keeping it is recorded because
# the mistake was not the decision — it was deciding without looking.
#
# The reasoning for keeping it went: the creator has no face art, so a bald head
# ships worse than a borrowed one, and `Face` is 122 faces authored for THIS
# skull on THIS bone, so it fits with nothing fitted. Every clause of that is
# true. It is also irrelevant, because `Face` IS NOT A FACE. Rendered in
# isolation, front-on (`tools/soak/shots/faces/`), the pack's four read:
#
#     Rogue    122 faces   a smooth featureless dome — a COWL
#     Warrior 1446 faces   layered plates with tufts at the sides — HAIR
#     Wizard  1410 faces   a peaked crown over falling strands — HOOD + BEARD
#     Monk    2624 faces   brows, moustache, beard outline — FACIAL HAIR
#
# Not one of them has an eye, a nose or a brow ridge on a surface. `Face` in this
# pack is the HAIR/HOOD PROP that sits in front of the skull; the face itself is
# painted into the body atlas on the body mesh's own head. So keeping the Rogue's
# put a hood on the player and a void where the face goes — the exact opposite of
# the plain starting character it was meant to rescue — and the bald head it
# "fixed" was never bald: it was the real head, already carrying its features.
#
# The tell was there before the render. I chose between the four by VERTEX COUNT,
# which is the same move as reading `removeGloves` as working because the rule
# existed, and as trusting Blender's measurement of an exported GLB. Counting is
# not looking.
#
# Face VARIETY later is still cheap, but it is a texture and geometry job on the
# head, not a choice of which of these four props to load.
#
# `Icosphere` is scene junk the donor carries — 80 faces of nothing, riding along
# in every export until it was spotted by re-importing the result and listing
# what was actually in the file.
STRIP = ("Belt", "Guard", "Pouch", "Shoelace.L", "Shoelace.R", "Rogue_Dagger", "Icosphere", "Face")


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

    # THE FACE, GRAFTED FROM THE MONK, because this pack's skull has none.
    #
    # Rogue, Monk and Wizard all carry the SAME featureless head — about 68 faces
    # with no eye, nose or brow anywhere on it, confirmed by rendering each skull
    # with its face piece hidden (`tools/soak/shots/heads/*_without_*.png`) — and
    # `Rogue_Texture.png` paints no face either. Every feature a player
    # recognises lives in one extra mesh: the Monk's `Monk.001`, which is the
    # face this project shipped for its whole life before the body changed.
    #
    # That mesh is 2784 faces of 41 loose islands, and `tools/art/look_pieces.py`
    # identified all of them by rendering each in red ON the head:
    #
    #       8 faces           the nose             (1)
    #      48 faces, high z   a brow               (2, mirrored)
    #      48 faces, low z    a moustache half     (2, mirrored)
    #     160 faces           a prayer bead       (10, a ring at the collar)
    #     34/36/46 faces      beard and sideburns (27, wrapping the jaw)
    #
    # ONLY THE NOSE AND BROWS ARE GRAFTED. They are facial STRUCTURE, wanted on
    # every character before any choice is made, and a starting character without
    # them reads as a blank. Beard and moustache are things a player picks, so
    # they stay runtime look pieces; the beads are nobody's default and are
    # exported for the wardrobe rather than worn here.
    #
    # NO OFFSET IS COMPUTED. Both files are the same 44-bone `CharacterArmature`
    # in the same authored space, so the pieces keep their own parent_bone,
    # matrix_parent_inverse and basis, and only the PARENT OBJECT is swapped to
    # this rig's armature. The transform is carried over verbatim rather than
    # reconstructed — which is the whole lesson of `hair.ts`, where five derived
    # constants put hair in the skull, at the ankles and finally underground.
    # Reparenting happens BEFORE the Monk's own armature is deleted, or the
    # pieces would lose the frame they are being carried in.
    face_donor = os.path.abspath("client/public/models/Monk.fbx")
    # Captured BEFORE the donor is imported, because afterwards there is no way
    # to tell this body's twelve clips from the Monk's eleven by name alone.
    keep_clips = {a.name for a in bpy.data.actions}
    grafted = []
    if os.path.exists(face_donor):
        seen = {o.as_pointer() for o in bpy.data.objects}
        bpy.ops.import_scene.fbx(filepath=face_donor)
        added = [o for o in bpy.data.objects if o.as_pointer() not in seen]
        faces_of = [o for o in added if o.type == "MESH" and len(o.data.polygons)]
        source = max(faces_of, key=lambda o: len(o.data.polygons)) if faces_of else None
        if source:
            source.parent = arm
            for o in added:
                if o is not source:
                    bpy.data.objects.remove(o, do_unlink=True)

            bpy.ops.object.select_all(action="DESELECT")
            source.select_set(True)
            bpy.context.view_layer.objects.active = source
            mark = {o.as_pointer() for o in bpy.data.objects}
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.separate(type="LOOSE")
            bpy.ops.object.mode_set(mode="OBJECT")
            islands = [source] + [o for o in bpy.data.objects
                                  if o.type == "MESH" and o.as_pointer() not in mark]

            brow = 0
            for o in islands:
                n = len(o.data.polygons)
                top = max((o.matrix_world @ v.co).z for v in o.data.vertices)
                if n == 8:
                    o.name = o.data.name = "Face_nose"
                    grafted.append(o)
                elif n == 48 and top > 2.30:
                    brow += 1
                    o.name = o.data.name = f"Face_brow{brow}"
                    grafted.append(o)
            for o in islands:
                if o not in grafted:
                    bpy.data.objects.remove(o, do_unlink=True)

            # STRAIGHTENED, because the Monk authored this face OFF-AXIS and a
            # verbatim graft inherits the skew. Measured on a skull centred at
            # x 0 and running -0.335..0.335:
            #
            #     brow A  x -0.072..0.211   centre +0.069
            #     brow B  x -0.375..-0.090  centre -0.233
            #     nose    x -0.124..-0.019  centre -0.071
            #
            # Those two brows are not reflections of each other — a symmetric
            # pair would sit near +/-0.15 — and one of them overhangs the skull's
            # left edge by 0.04. On the Monk this is hidden under a hood and a
            # beard; on a bare head it is a crooked face, which is part of what
            # the close portrait shows.
            #
            # So one brow is MIRRORED from the other rather than both being kept,
            # and the nose is centred. Mirroring keeps the pair identical by
            # construction, which no pair of tuned offsets would.
            brows = [o for o in grafted if o.name.startswith("Face_brow")]
            nose = next((o for o in grafted if o.name == "Face_nose"), None)
            if nose:
                # MEASURED AND MOVED IN THE SAME SPACE, which the first version
                # was not. It took min/max over `matrix_world @ v.co` — world
                # space — and then applied the correction with `data.transform`,
                # which is LOCAL. The two differ by this piece's bone-parent
                # transform, so the shift was wrong by exactly that much and the
                # nose exported at centre +0.071 on a skull 0.670 wide: a tenth
                # of the head off-axis, plainly visible at portrait distance.
                #
                # The brows came out symmetric (+/-0.151) through all of this
                # because MIRRORING is space-independent — reflecting one piece
                # onto another needs no correct origin, which is why that half
                # worked while this half silently did not. A fix that works for
                # the wrong reason hides the one that doesn't.
                xs = [v.co.x for v in nose.data.vertices]
                nose.data.transform(mathutils.Matrix.Translation(
                    (-(min(xs) + max(xs)) / 2, 0, 0)))
            if len(brows) == 2:
                # Keep the one that sits INSIDE the skull, and reflect it.
                keep, drop = sorted(brows, key=lambda o: abs(
                    sum((o.matrix_world @ v.co).x for v in o.data.vertices) / len(o.data.vertices)))
                mirrored = keep.data.copy()
                mirrored.transform(mathutils.Matrix.Diagonal((-1.0, 1.0, 1.0, 1.0)))
                mirrored.flip_normals()
                # THE ORPHAN KEEPS THE NAME UNTIL IT IS GONE. Swapping `drop.data`
                # leaves its original mesh datablock in the file with zero users
                # and still called `Face_brow2`, so assigning that name to the
                # mirror collided and Blender handed back `Face_brow2.001` — which
                # is what the exported GLB was named. Renaming harder would not
                # have helped; the previous occupant has to leave first.
                stale = drop.data
                drop.data = mirrored
                stale.name = "Face_brow_replaced"
                if stale.users == 0:
                    bpy.data.meshes.remove(stale)
                drop.name = drop.data.name = "Face_brow2"
                keep.name = keep.data.name = "Face_brow1"

            # NO SECOND ATLAS. These wore `Monk_Texture` — correct for pieces cut
            # from the Monk, and the reason `Player_Base.glb` embedded TWO images
            # totalling 1.52 MB of a 2.0 MB file. Worse than the weight: a rigid
            # mesh with its own material can never be toned, because
            # `Actor.bodyMaterials` is built from SKINNED meshes only, so a tan
            # character kept a Monk-brown nose. `buildBareHands` met this exact
            # problem and solved it by sharing the body's own material instance —
            # "there is nothing to keep in step: it is the same material."
            #
            # So the pieces are re-UV'd onto the Rogue atlas's head-skin region,
            # measured at u 0.368..0.644, v 0.041..0.352, whose centroid texel is
            # hue 31.0, sat 0.322, L 0.353 — real flesh. Flat-mapped to a patch
            # well inside it: these are 104 faces of solid skin with no painted
            # detail to lose, and sharing the body's atlas is what lets them
            # share the body's material and therefore the body's tone.
            # CLEARING IS NOT SHARING, which is the trap this nearly fell into. A
            # mesh with an empty material slot does not inherit the body's — it
            # exports with a default of its own, lands in a separate material,
            # and is excluded from `bodyMaterials` exactly as before. The body's
            # material is ASSIGNED here so there is one material for body and
            # face, which is the whole mechanism by which the tone reaches them.
            skin_mat = body.data.materials[0] if body.data.materials else None
            patch_u = 0.49
            patch_v = 0.17
            for o in grafted:
                o.data.materials.clear()
                if skin_mat:
                    o.data.materials.append(skin_mat)
                uv = o.data.uv_layers.active or o.data.uv_layers.new(name="UVMap")
                # One texel for the whole piece. These are 104 faces of solid
                # flesh with no painted detail to preserve, so a flat sample of
                # the head region is honest — and it keeps the pieces on the
                # body's atlas, which is what lets them share its material. If
                # they ever need painted shading, this is the line to replace.
                for loop in o.data.loops:
                    uv.data[loop.index].uv = (patch_u, patch_v)
            # AND THE MONK'S ANIMATIONS GO BACK, which the first version of this
            # graft did not do. Importing a second character to borrow two meshes
            # also imports ITS ACTIONS, and the exporter writes every action in
            # the file: `clips=12` became `clips=23` and `Player_Base.glb` grew
            # to 2.27 MB. The body must ship its own twelve and no one else's — a
            # duplicate clip set is both dead weight in every client download and
            # a second set of names for `findClip` to choose between.
            for action in [a for a in bpy.data.actions if a.name not in keep_clips]:
                bpy.data.actions.remove(action)
    print("  face:     " + (", ".join(f"{o.name}({len(o.data.polygons)}f)" for o in grafted)
                            or "NONE GRAFTED — the character has no nose or brows"))

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
