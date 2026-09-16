# THE PLAYER'S OWN COWL, HARVESTED AS THE HOOD HELM.
#
#   blender --background --factory-startup --python tools/art/harvest_hood.py
#
# Reported four times, escalating: "the hood is looking like a regular helmet and
# not a hood", "it looks nothing like a hood, the design itself is completely
# bad", and finally "look at all the hoods, it's completely misplaced, to the
# point that it's laughable", with a photograph of it hanging off the back of the
# head like a satchel.
#
# The first two rounds were answered by MODELLING — folds, then a peak — and both
# produced a dome with things attached to it, because a lathe about a vertical
# axis IS a helmet and no amount of trim changes that.
#
# The next four were answered by FITTING the Ranger's `Cloak` mesh, and every one
# of them was wrong in a different direction: untouched it overhung the face,
# turned it sat beside the head, mirrored it sat behind, and registered on its
# cowl it still left the crown out. The reason all four failed is one mistake
# repeated: `Cloak` is a hooded CLOAK, mostly drape, and every correction was
# steered by a bounding box that was measuring the drape and calling it the hood.
#
# THE ANSWER WAS IN THE REPOSITORY THE WHOLE TIME, written down in `base_body.py`
# and read past six times. The player's body is the Rogue stripped, and the list
# of what gets stripped ends with `Face` — which, as that file's own note says at
# length, IS NOT A FACE:
#
#     Rogue    106 faces   a smooth featureless dome — a COWL
#
# It is stripped from the BODY because a base character must not come with a hood
# welded on. It is exactly what the HELM slot wants, and unlike anything cut from
# another character it was authored FOR THIS SKULL ON THIS BONE. Rendered on its
# own owner (`tools/soak/shots/roguecowl/01-whole.png`) it is a hood sitting on a
# head with the opening at the face — which is all the last four builds were
# trying to achieve by arithmetic.
#
# SO THERE IS NO REGISTRATION HERE, and that is the point rather than an
# omission. `register.py`'s rule is that art HARVESTED FROM A DONOR must be fitted
# to the wearer before export — and this is not from a donor. The wearer is the
# Rogue and so is this. Fitting it to itself could only move it off the head it
# already fits.
#
# THE MATERIAL IS RENAMED TO A KIT NAME so the game's palette reaches it.
# `gear.ts` repaints armour by material NAME through `MATERIAL_LOOK`, and a piece
# arriving as `Rogue_Texture` matches nothing, falls to the metal role and is
# painted flat. Called `Steel` — which `armour.py` uses for cloth, being the
# palette's most identifying tone — a Verdant hood comes out green and a Crimson
# one red, like every other piece in the slot.

import os
import sys

import bpy
import bmesh
import mathutils

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import register  # noqa: E402

MODELS = "client/public/models"
OUT = "client/public/models/armour/helm_hood.glb"

# The player's own file, and its own cowl. See the note above: this is not a
# donor, it is the wearer, which is why nothing below fits or moves it.
DONOR = "Ranger.fbx"
MESH = "Cloak"

# How far above the crown the cloth sits. The skull is 0.890 tall, so this is
# about three per cent of it: enough that the head does not come through the top
# under animation, small enough that the hood does not float.
CROWN_MARGIN = 0.090

# And a little larger than the head all round. The head-ratio scale gives the
# hood the Ranger’s own clearance, and his was barely enough on his own skull:
# lifting alone left facets of this crown piercing the cloth, because a lift
# moves a shape without making it roomier. Ten per cent about the cowl’s own
# centre is the thickness of a hood over a head.
HOOD_CLEAR = 1.09


def main():
    root = os.getcwd()

    # The head this will be worn on, measured first, because loading the donor
    # replaces the scene.
    wearer = register.wearer_head()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(root, MODELS, DONOR))

    hood = bpy.data.objects.get(MESH)
    if not hood:
        print(f"no mesh named {MESH}; present:")
        for o in bpy.data.objects:
            if o.type == "MESH":
                print("   ", o.name)
        return
    print(f"{MESH}: {len(hood.data.polygons)} faces, parent {hood.parent_type}/{hood.parent_bone}")

    head = register.head_box()

    # BAKE THE WORLD TRANSFORM INTO THE VERTICES, by the same three lines
    # `look_pieces.py` uses for the hair and the beards — which are also
    # bone-parented props harvested off this rig, and which fit.
    #
    # It matters that it is these lines and not an equivalent-looking
    # `transform_apply`. These props carry the pack's local offset on an armature
    # SCALED 100, so their own coordinates mean nothing away from that rig.
    # Transformed into the mesh data with the basis then cleared, the geometry is
    # in the donor's MESH-BIND SPACE — the space our body's skeleton inverses are
    # expressed in — so `boneAttachMatrix` places it exactly, with no constant
    # supplied anywhere. That is the same note that records five tuned offsets in
    # `hair.ts` being defeated by getting this wrong.
    mw = hood.matrix_world.copy()
    hood.data.transform(mw)
    hood.parent = None
    hood.matrix_basis = mathutils.Matrix.Identity(4)

    # IT WAS NEVER FACING THE WRONG WAY. IT WAS NEVER ON THE HEAD.
    #
    # Three builds photographed on the body from four sides
    # (`tools/soak/wearlook.mjs`), which is the only thing that has settled any
    # of this:
    #
    #   left alone          a pale dome over the whole face, hair behind it
    #   mirrored            the cowl entirely BEHIND the head, open to the rear
    #   mirrored + centred   a dome over the face AND an opening at the back
    #
    # Read together they say what no single one of them did. Left alone, the cowl
    # sat wholly in FRONT of the face, so what the camera saw was its outer back
    # surface — the opening was already pointing at the face, correctly, the
    # whole time. Mirroring turned a correct orientation into a wrong one; the
    # third build proves it, because that is the one where the opening finally
    # shows up at the BACK.
    #
    # So there is no axis correction here at all. This is the player's own cowl,
    # authored on this bone, and it goes on the way its author put it on. The
    # only thing wrong was WHERE.
    #
    # CENTRED ON THE COWL — not on the mesh. This is a hooded cloak: the cowl is
    # the part at head height and the rest is drape falling to the waist, so the
    # mesh's own box centre sits far below and behind the head, and aligning by
    # it hangs the cowl out in space. That mistake has now been made four times
    # across two different meshes, and it is the whole reason this took so long.
    lo, _hi = head
    at_head = [v.co for v in hood.data.vertices if v.co.z >= lo.z]
    if not at_head:
        print("no cowl found at head height")
        return
    # SCALED BY THE TWO HEADS, NOT BY SQUEEZING THE COWL ONTO ONE.
    #
    # `register.fit(hood, cowl_box, head_box)` was the obvious call and it is
    # wrong here: it makes the cowl's box EQUAL the skull's, and a hood that is
    # exactly the size of the head it covers is not a hood. Photographed, it came
    # out at 0.855 x 0.912 — smaller than the cowl was authored — with the hair
    # standing through the cloth in front of the face.
    #
    # What transfers is the ratio of the two HEADS: the Ranger's skull is
    # 0.572 x 0.761 x 0.727 against this body's 0.670 x 0.814 x 0.890, so the
    # hood grows by the same amount the head does and keeps the clearance its
    # author gave it.
    scale, wearer_mid, donor_mid = register.registration(head, wearer)
    for vert in hood.data.vertices:
        vert.co = mathutils.Vector((
            donor_mid[i] + (vert.co[i] - donor_mid[i]) * scale[i] for i in range(3)
        ))
    for vert in hood.data.vertices:
        vert.co = mathutils.Vector((
            donor_mid[i] + (vert.co[i] - donor_mid[i]) * HOOD_CLEAR for i in range(3)
        ))

    # THEN THE COWL — not the mesh — IS PUT ON THE HEAD. Re-measured after the
    # scaling, because scaling about the donor's head centre moves it.
    at_head = [v.co for v in hood.data.vertices if v.co.z >= lo.z * scale.z + donor_mid.z * (1 - scale.z)]
    if not at_head:
        at_head = [v.co for v in hood.data.vertices]
    cowl_mid = mathutils.Vector((
        (min(p[i] for p in at_head) + max(p[i] for p in at_head)) / 2 for i in range(3)
    ))
    shift = mathutils.Vector((wearer_mid.x - cowl_mid.x, wearer_mid.y - cowl_mid.y, 0.0))
    for vert in hood.data.vertices:
        vert.co += shift
    # AND LIFTED CLEAR OF THE CROWN.
    #
    # The Ranger's hood only just covers his own head, and his skull is a fifth
    # shorter than this one, so registering it faithfully leaves the top of the
    # head standing through the cloth. That went unseen for four milestones
    # because the HAIR was filling the gap: the moment `HELM_COVERS_HAIR.hood`
    # became true — because the hair was coming through the cloth — the bare
    # crown underneath it appeared.
    #
    # A lift, not more scale: the hood is the right size everywhere else, and
    # growing it until the crown cleared would widen and lengthen it too.
    top = max(v.co.z for v in hood.data.vertices)
    want = wearer[1].z + CROWN_MARGIN
    if top < want:
        for vert in hood.data.vertices:
            vert.co.z += want - top
        print(f"lifted {want - top:+.3f} to clear the crown")

    print(f"scaled ({scale.x:.3f},{scale.y:.3f},{scale.z:.3f}), "
          f"cowl centred by ({shift.x:+.3f},{shift.y:+.3f})")

    # AND NOTHING IS LEFT HANGING IN THE FACE OPENING.
    #
    # Reported: "what the hell is that on a face when wearing a hood?" — a grey
    # bar down the middle of the face, inside the cowl.
    #
    # It is not a clasp the Ranger wears there. Measured on him, ALL EIGHT of
    # this mesh's loose parts have their centre BEHIND his head's own centre;
    # there is nothing in front of his face at all. It is the centring shift
    # above: moving the cowl forward onto this body's head carries the front
    # edge of the drape with it, and on a skull a fifth taller than the one it
    # was cut for, that edge lands across the nose.
    #
    # Dropped by LOOSE PART rather than by face, so a piece is removed whole and
    # no hole is opened in the cowl. A part goes only if its centre is inside
    # the wearer's own face box — in front of the cheekbones, within the width
    # of the head and between the chin and the brow — which nothing that is
    # actually hood can be.
    wlo, whi = wearer
    # The box a face occupies: the front 45% of the head*s depth, inside its
    # own width and between chin and crown. A hood never has geometry here --
    # that space is the opening.
    # NOTHING OF THE HOOD MAY BE INSIDE THE HEAD.
    #
    # Reported: "what the hell is that on a face when wearing a hood?" -- a pale
    # post standing in the face opening. Five passes chased it with hand-measured
    # boxes and the first four were on the WRONG SIDE, because the game`s forward
    # is this frame`s -y (the same inversion `assets.ts` applies standing a Z-up
    # file upright) and every one of them tested `c.y >= face_y`.
    #
    # `tools/soak/postprobe.mjs` read the offending vertices back out of the
    # running game in this mesh`s own local space -- x 0.063..0.089, y
    # -0.285..-0.207, z 2.091..2.123 -- and what that says is not `in front of
    # the face`. It is INSIDE THE HEAD: the head spans x -0.335..0.335, y
    # -0.329..0.485, z 2.056..2.945, and the post is within all three.
    #
    # That is the rule, and it needs no tuning. A hood goes round a head; any
    # face of it whose centre is well inside the skull is geometry hanging in
    # the void where the head is, and it can only ever show through the opening.
    # The inset keeps the cowl`s own rim, which hugs the head and legitimately
    # grazes the boundary.
    inset = 0.12
    ilo = mathutils.Vector((
        wlo[i] + (whi[i] - wlo[i]) * inset for i in range(3)))
    ihi = mathutils.Vector((
        whi[i] - (whi[i] - wlo[i]) * inset for i in range(3)))
    bm = bmesh.new()
    bm.from_mesh(hood.data)
    bm.faces.ensure_lookup_table()
    doomed = []
    # AND THE TAB THAT HANGS BELOW THE CHIN.
    #
    # The rule above catches anything inside the skull and misses this, because
    # it is not inside the skull -- it hangs UNDER it. Measured out of the
    # running game in this mesh`s local space: y -0.285 against a head front of
    # -0.329, z 1.923..2.194 against a head bottom of 2.056. A tongue of cloth
    # at the very front, from the chin down over the throat.
    #
    # The z window stops well above head height, so the cowl`s own front rim --
    # which is at the same depth but up at the face -- is untouched.
    span = mathutils.Vector((whi[i] - wlo[i] for i in range(3)))
    tab_y = wlo.y + span.y * 0.10
    tab_lo_z, tab_hi_z = wlo.z - span.z * 0.22, wlo.z + span.z * 0.20
    tab_half = span.x * 0.28
    for f in bm.faces:
        c = f.calc_center_median()
        if all(ilo[i] <= c[i] <= ihi[i] for i in range(3)):
            doomed.append(f)
        elif (c.y <= tab_y and tab_lo_z <= c.z <= tab_hi_z
              and abs(c.x - (wlo.x + whi.x) / 2) <= tab_half):
            doomed.append(f)
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        print(f"dropped {len(doomed)} faces sitting in the face opening")
    bm.to_mesh(hood.data)
    bm.free()
    # NAMED FOR THE BONE. `build.py` exports armour as one object per bone and the
    # loader reads the object name to decide what to hang it on, so this has to be
    # `Head` and not `Face`.
    hood.name = "Head"
    hood.data.name = "Head"

    hood.data.materials.clear()
    mat = bpy.data.materials.new("Steel")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.6, 0.62, 0.66, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.86
    hood.data.materials.append(mat)

    for o in [x for x in bpy.data.objects if x.type == "MESH" and x is not hood]:
        bpy.data.objects.remove(o, do_unlink=True)

    out = os.path.join(root, OUT)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    hood.select_set(True)
    bpy.context.view_layer.objects.active = hood
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_yup=False,
        export_apply=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=False,
        export_extras=True,
    )
    print(f"EXPORTED {out}")


main()
