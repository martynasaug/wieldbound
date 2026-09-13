# TAKING A PACK "FACE" APART INTO CUSTOMIZATION PIECES.
#
#   blender --background --factory-startup --python tools/art/look_pieces.py -- \
#       --out tools/soak/shots/look [--only Monk]
#
# WHAT THIS IS FOR. The pack's skull is a FEATURELESS BLANK — Rogue, Monk and
# Wizard all carry the same ~68-face head with no eye, nose or brow on it, which
# was measured and then confirmed by rendering each skull with its face piece
# hidden (`tools/soak/shots/heads/*_without_*.png`). Every feature a player
# recognises lives in one extra mesh: `Monk.001` (2784f) or `Wizard/Face`
# (1374f). That single mesh holds brows, eyes and nose TOGETHER WITH beard,
# moustache, hair and neck beads.
#
# The head is shared by every character and must stay shared — helms are the only
# item allowed to change it — so the features cannot be grafted into the body.
# They are CUSTOMIZATION, chosen on the character screen, and a player choosing
# a beard should not thereby choose a set of neck beads. So the piece comes apart
# into loose islands, each reported and PHOTOGRAPHED IN PLACE OVER THE SKULL, and
# the islands are then grouped into options by what they are.
#
# NOTHING IS DISCARDED HERE. Beards, hair and beads are options a player picks,
# not clutter to delete — an earlier plan to "cut the face free of beard and
# beads" had it backwards.
#
# WHY EVERY RENDER KEEPS THE SKULL AND THE TEXTURE. Twice now I have judged this
# pack's head geometry from an isolated untextured shell and been wrong both
# times — a hollow brow ridge lit from outside reads as "overlapping plates", and
# on that basis I reported the pack as having no faces at all. An island alone in
# space is unreadable; an island on the head it belongs to is obvious.
#
# BONE PARENTING, which is where the five failed hair offsets in `hair.ts` came
# from. These pieces are not skinned. Each is parented to a bone and carries the
# pack's local transform (0.001, -2.756, 0.003) on an armature with scale 100, so
# its LOCAL coordinates are nowhere near its world position — measured local
# z -0.500..0.541 for a piece that sits at world z 2.005..3.057. Tuning an offset
# against local numbers is fighting the frame rather than placing the geometry.

import math
import os
import sys

import bpy
import mathutils

SUBJECTS = (
    ("Monk", "Monk_Texture.png", "Monk.001"),
    ("Wizard", "Wizard_Texture.png", "Face"),
    ("Warrior", "Warrior_Texture.png", "Face"),
)

MODELS = "client/public/models"
TEXTURES = "client/public/textures"


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
    sc.cycles.samples = 24
    sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 420, 420
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


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = os.path.abspath(args[args.index("--out") + 1]) if "--out" in args else None
    only = args[args.index("--only") + 1].split(",") if "--only" in args else []
    os.makedirs(out, exist_ok=True)

    for name, texname, piece in SUBJECTS:
        if only and name not in only:
            continue
        fbx = os.path.abspath(os.path.join(MODELS, f"{name}.fbx"))
        if not os.path.exists(fbx):
            print(f"SKIP {name}: no {fbx}")
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.fbx(filepath=fbx)
        path = os.path.abspath(os.path.join(TEXTURES, texname))
        dress(bpy.data.images.load(path) if os.path.exists(path) else None)

        target = bpy.data.objects.get(piece)
        if not target:
            print(f"SKIP {name}: no mesh named {piece}")
            continue

        # Split into loose parts. `separate` keeps each island's parenting and
        # transform, so every fragment stays exactly where it was on the head —
        # which is the whole reason the renders below can be trusted.
        bpy.ops.object.select_all(action="DESELECT")
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        # COLLECTED BY IDENTITY, NOT BY NAME. The first version gathered islands
        # whose name started with the source mesh's, which worked for the Wizard
        # (`Face` -> `Face.001`..`Face.032`) and silently lost the Monk: Blender
        # names the fragments of `Monk.001` as `Monk.002`, `Monk.003`, ... so the
        # prefix matched only the original and a 2784-face mesh reported as ONE
        # island of 160 faces. A number that does not move when it should, again.
        before = {o.as_pointer() for o in bpy.data.objects}
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE")
        bpy.ops.object.mode_set(mode="OBJECT")

        islands = [target] + [o for o in bpy.data.objects
                              if o.type == "MESH" and o.as_pointer() not in before]
        islands.sort(key=lambda o: -(o.matrix_world @ o.data.vertices[0].co).z
                     if o.data.vertices else 0)
        print(f"{name}: {piece} -> {len(islands)} islands")

        stage(bpy.context.scene)
        sc = bpy.context.scene

        # AIM AT THE PIECE, NOT AT A NUMBER. The first pass framed every subject
        # at a hardcoded height of 2.45, chosen while looking at the Wizard's
        # head (z 2.005..3.057). The Monk's face piece spans z 1.633..2.566, so
        # its lowest islands — the ten 160-face beads at 1.63..2.06 — sat at or
        # below the bottom edge, and four renders came back apparently identical
        # to the bare head. The same mistake `portrait.mjs` exists to prevent:
        # an aim taken from a constant instead of from the subject's live bounds.
        every = [o.matrix_world @ v.co for o in islands for v in o.data.vertices]
        lo = min(p.z for p in every)
        hi = max(p.z for p in every)
        aim = (lo + hi) / 2
        span = max(hi - lo, max(p.x for p in every) - min(p.x for p in every))
        scale = span * 1.9
        print(f"  framing z {lo:.3f}..{hi:.3f}  aim {aim:.3f}  ortho {scale:.3f}")

        # AND MAKE IT UNMISTAKABLE. Tan geometry on a tan head is invisible even
        # when correctly framed — island 03 and island 20 were both in frame and
        # both unreadable. The island under test wears flat red, so "is this
        # piece the nose" stops being a question about shading.
        red = bpy.data.materials.new("ISLAND")
        red.use_nodes = True
        bsdf = next(n for n in red.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (0.9, 0.05, 0.05, 1)
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Roughness"].default_value = 0.5

        argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
        export_dir = os.path.abspath(argv[argv.index("--export") + 1]) if "--export" in argv else None
        per_island = "--islands" in argv

        for o in islands:
            o.hide_render = True
        if per_island:
            for idx, o in enumerate(islands):
                me = o.data
                if not me.vertices:
                    continue
                mw = o.matrix_world
                pts = [mw @ v.co for v in me.vertices]
                xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = [p.z for p in pts]
                tag = f"{idx:02d}"
                print(f"  {tag} {o.name:<18} faces={len(me.polygons):<5} "
                      f"x {min(xs):6.3f}..{max(xs):6.3f}  "
                      f"y {min(ys):6.3f}..{max(ys):6.3f}  "
                      f"z {min(zs):6.3f}..{max(zs):6.3f}")
                # One island visible at a time, ON the skull, from three-quarters
                # so a brow reads differently from a moustache.
                keep = list(me.materials)
                me.materials.clear()
                me.materials.append(red)
                o.hide_render = False
                shoot(sc, os.path.join(out, f"{name}_{tag}.png"), math.radians(25), aim, scale)
                o.hide_render = True
                me.materials.clear()
                for m in keep:
                    me.materials.append(m)

        # WHAT EACH ISLAND IS, decided by geometry rather than by name, and every
        # one of the Monk's 41 accounted for. Each rule below was CONFIRMED by
        # rendering that island in red on the head, not inferred from its size:
        #
        #     8 faces           the nose             (1)
        #    48 faces, high z   a brow               (2, mirrored)
        #    48 faces, low z    a moustache half     (2, mirrored)
        #   160 faces           a prayer bead       (10, a ring at the collar)
        #   34/36/46 faces      beard and sideburns (27, wrapping the jaw)
        #
        # The two 48-face groups are the reason this splits on height as well as
        # count: brows and moustache are the same clump reused, and only their z
        # tells them apart (2.32..2.45 against 1.99..2.19).
        # AND THE OTHER TWO DONORS SPLIT ON GEOMETRY, NOT ON COUNTS. The rules
        # above are particular to `Monk.001` — 8, 48 and 160 happen to be
        # distinctive there — and transfer to nothing. The Wizard's islands are
        # 14/32/44/68 faces and the Warrior's 10/32/44, so a count rule would
        # merge hair with beard on both.
        #
        # Measured, every island on both donors falls cleanly on one side of the
        # SAME two questions — does it reach behind the skull, and how high does
        # it stand? Front is -y; the skull runs z 2.056..2.945.
        #
        #   Wizard  12 islands  y 0.275..0.650   z 2.663..2.983   crown and back
        #            4 islands  y -0.399..0.460  z 2.338..3.057   locks sweeping over
        #            1 island   y -0.376..-0.276 z 2.289..2.543   the nose (14f)
        #           16 islands  y max <= -0.077  z 2.005..2.585   moustache and beard
        #
        #   Warrior 33 islands  reaching y 0.722, tops to z 2.914  a full head of hair
        #            1 island   y -0.402..-0.273 z 2.277..2.480   the nose (10f)
        #           NOTHING below z 2.120 at the front — the Warrior is clean-shaven,
        #           which is why these two donors give two silhouettes and not one.
        #
        # No island on either donor sits in between, so these thresholds are read
        # off a gap in the data rather than tuned until the picture looked right.
        def classify_pack(o):
            pts = [o.matrix_world @ v.co for v in o.data.vertices]
            back = max(p.y for p in pts)
            front = min(p.y for p in pts)
            top = max(p.z for p in pts)
            width = max(abs(p.x) for p in pts)
            # The nose is the one small island centred on the face and forward of
            # everything: both donors have exactly one, and it is not hair.
            if len(o.data.polygons) <= 14 and width < 0.07 and front < -0.25:
                return "nose"
            # Anything that reaches behind the skull, or stands above the brow
            # line, is hair. Beard and moustache do neither.
            if back > 0.05 or top > 2.60:
                return "hair"
            return "beard"

        def classify(o):
            if name != "Monk":
                return classify_pack(o)
            n = len(o.data.polygons)
            if n == 160:
                return "beads"
            if n == 8:
                return "nose"
            if n == 48:
                top = max((o.matrix_world @ v.co).z for v in o.data.vertices)
                return "brows" if top > 2.30 else "moustache"
            return "beard"

        groups = {}
        for o in islands:
            if o.data.vertices:
                groups.setdefault(classify(o), []).append(o)
        print("  groups: " + ", ".join(
            f"{g}={len(v)} islands/{sum(len(o.data.polygons) for o in v)}f"
            for g, v in sorted(groups.items())))

        # Every group photographed WHOLE before anything is written, because a
        # group is what a player will actually select — an island at a time says
        # nothing about whether the beard reads as a beard.
        for group, members in sorted(groups.items()):
            keep = [(o, list(o.data.materials)) for o in members]
            for o in members:
                o.data.materials.clear()
                o.data.materials.append(red)
                o.hide_render = False
            shoot(sc, os.path.join(out, f"{name}_grp_{group}.png"), math.radians(25), aim, scale)
            for o, mats in keep:
                o.hide_render = True
                o.data.materials.clear()
                for m in mats:
                    o.data.materials.append(m)

        # NOTHING IS DISCARDED — the beads are exported too. They are not a face
        # feature and no player spawns wearing them, but they are authored art
        # for this head and belong in the wardrobe as a neck item rather than in
        # the bin.
        if export_dir:
            os.makedirs(export_dir, exist_ok=True)
            for group, members in sorted(groups.items()):
                # BAKE THE WORLD TRANSFORM INTO THE VERTICES. These islands are
                # bone-parented props carrying the pack's local (0.001, -2.756,
                # 0.003) on an armature scaled 100, so their own coordinates mean
                # nothing away from that rig — which is what defeated five tuned
                # offsets in `hair.ts`. Baked, the geometry is in the donor's
                # MESH-BIND SPACE, the same space our body's skeleton inverses
                # are expressed in, so `boneAttachMatrix` places it exactly with
                # no constant supplied anywhere.
                for o in members:
                    mw = o.matrix_world.copy()
                    o.data.transform(mw)
                    o.parent = None
                    o.matrix_basis = mathutils.Matrix.Identity(4)
                # AND THE ATLAS IS NOT COMING WITH THEM.
                #
                # An EIGHT-FACE NOSE exported at 879,860 bytes. My first guess
                # was the armature riding along through `use_selection`, so I
                # cleared the parent — and the file came back 879,860 bytes, the
                # same number to the byte. A rule edited that nothing consults,
                # caught by a number that did not move, which is the third time
                # in this project.
                #
                # Read rather than guessed, the glTF JSON says it plainly: no
                # `skins`, no `animations`, one `image` of 877,213 bytes named
                # `Monk_Texture`. The atlas is 99.7% of the file, and `dress()`
                # put it on every material before the split so all five pieces
                # carry their own copy of the same 1024x1024 PNG. The sizes said
                # so before the JSON did — 8 faces and 1600 faces exported within
                # 9% of each other, which cannot be geometry.
                #
                # None of it is ever read. `hair.ts` takes `mesh.geometry` and
                # nothing else, building its own material because hair colour
                # belongs to the wearer. So the materials go, and a nose becomes
                # the size of a nose.
                for o in members:
                    o.data.materials.clear()
                bpy.ops.object.select_all(action="DESELECT")
                for o in members:
                    o.select_set(True)
                bpy.context.view_layer.objects.active = members[0]
                if len(members) > 1:
                    bpy.ops.object.join()
                joined = bpy.context.view_layer.objects.active
                joined.name = f"{name}_{group}"
                path = os.path.join(export_dir, f"{name}_{group}.glb")
                bpy.ops.export_scene.gltf(
                    filepath=path,
                    export_format="GLB",
                    use_selection=True,
                    export_apply=False,
                    # Z-up, unconverted, to match the space described above. The
                    # loader must not rotate these: they are attached to a bone,
                    # never passed through `instantiate`.
                    export_yup=False,
                    export_animations=False,
                )
                print(f"  WROTE {path} ({len(joined.data.polygons)}f)")
        print(f"  rendered {name}")


main()
