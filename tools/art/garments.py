# THE PACK'S COSTUMES, CUT INTO WEARABLE GARMENTS.
#
#   blender --background --factory-startup --python tools/art/garments.py -- \
#       [--export client/public/models/garments]
#
# Asked for: armour, robes and cloaks that look like the outfits the pack's own
# characters wear — because they are those outfits. Each of the four bodies is a
# single skinned surface where the clothes ARE the torso, so a garment is that
# surface with the SKIN cut away: hands, head and feet, which the player's own
# body supplies and which an item must never replace.
#
#     robe     from Wizard.001    a hooded gown, layered shoulder capes, sash
#     plate    from Warrior_Body  segmented skirt, chest and collar
#     leather  from Ranger        tunic and belted coat
#     light    from Rogue         the base body's own clothes, as an item
#
# THE CUT IS BY DOMINANT BONE WEIGHT, and it was checked by rendering both halves
# rather than assumed: `tools/soak/shots/pack/WizardGarmentOnly.png` is a robe
# with clean neck and wrist openings, and `WizardSkinOnly.png` is a head, two
# forearm stubs and two ankle nubs floating in space. There is no body under the
# robe, which is why the base body had to come from elsewhere.
#
# BINDING IS SAFE, and that was measured too: bone order is identical across all
# five rigs — 32 skinning bones in the same sequence — so a garment bound to the
# player's own skeleton needs no `skinIndex` remap. Proven in the running game by
# binding the Warrior's body to the Wizard's skeleton and photographing it
# deforming correctly.
#
# EVERY GLB MUST CARRY ITS OWN MATERIAL. This is the lesson `base_body.py` paid
# for twice: the FBX importer never wires this pack's textures in (no image node
# anywhere, base colour a flat 0.8, metalness 1), and the glTF branch of
# `assets.ts` does none of the dressing `dressFbx` does for the FBX branch. A
# garment exported without its atlas is grey plastic, and metal with no
# environment map renders near-black — which this project has now learned about
# armour, about a body, and would have learned a third time here.
#
# ORIENTATION IS THE LOADER'S JOB. The data stays Z-up exactly as the donor
# authored it; `instantiate` sees depth exceeding height and rotates the whole
# object, mesh and skeleton together. Rotating at export time was tried six ways
# and every one of them broke something — see the header of `base_body.py`.

import os
import sys

import bpy
import bmesh

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import register  # noqa: E402

# What a garment is NOT: the parts of a costume that are the wearer's own body,
# and the parts another SLOT owns.
#
# `Fist`, `Thumb`, `Foot`, `Head`, `Neck` are the wearer's — the player supplies
# them and an item must never replace them.
#
# `LowerLeg` is the BOOTS SLOT'S, and it was not cut until now. Measured, every
# garment covers the shin: plate 77 vertices a side, leather 230. So equipping a
# chest item dressed the whole body down to the ankle and then a boot was pulled
# on over cloth that was already there — which is the z-fighting between boots
# and the body on the open list, and it is also why the costume reads as one
# all-in-one item rather than as a chest piece.
#
# The cut stops at the KNEE and not at the hip. The plate's segmented skirt and
# the robe's gown hang off `UpperLeg`, and they are the best things about both;
# taking those would strip a garment back to a shirt. This game has no legs slot
# (`ITEM_SLOTS` is weapon, offhand, helm, armor, cape, boots, ring), so the thigh
# genuinely belongs to the chest item — the shin does not.
SKIN_BONES = ("Fist", "Thumb", "Foot", "Head", "Neck", "LowerLeg")

# Bone-parented meshes that are NOT armour, and must not travel with a garment.
# A weapon is an item of its own and the face belongs to the wearer — the player
# supplies both. Everything else parented to a bone is a fitting: see `cut`.
DROP_MESHES = (
    "Sword", "Bow", "Arrow", "Staff", "Dagger", "Face", "Monk.001",
    # AND THE RANGER'S ARM GUARDS, which is a decision rather than a rule.
    #
    # `tools/soak/fitcheck.mjs` catches them floating clear of this body's
    # forearm, and three attempts did not seat them: registering against the
    # limb's bounding box made the gap WORSE (0.133 to 0.192), anchoring at the
    # joint brought it back to 0.142, and neither is on the arm. The forearm is
    # thinly weighted on both rigs, so the box that every one of those
    # corrections is derived from is itself unreliable — the same sampling
    # problem that asked for a 7.5x stretch on the Wizard's waist.
    #
    # A missing bracer is strictly better than a bracer beside the arm, and the
    # leather garment keeps its pouch. Worth revisiting when a limb fitting is
    # worth its own solution; not worth shipping a visible fault meanwhile.
    "ArmGuard",
)

# donor file, the skinned mesh inside it, the garment it becomes, its atlas.
# The bones a fitting can hang from. Named once so the wearer's limbs and its
# joints are measured over the same set.
LIMBS = ("UpperArmL", "UpperArmR", "LowerArmL", "LowerArmR", "Abdomen", "Torso", "Hips")

JOBS = (
    ("Wizard", "Wizard.001", "robe", "Wizard_Texture"),
    ("Warrior", "Warrior_Body", "plate", "Warrior_Texture"),
    ("Ranger", "Ranger", "leather", "Ranger_Texture"),
    ("Rogue", "Rogue", "light", "Rogue_Texture"),
)

MODELS = "client/public/models"
TEXTURES = "client/public/textures"


def dress(obj, atlas_name):
    """Give every material its donor's own atlas, and take the metal off."""
    path = os.path.abspath(os.path.join(TEXTURES, f"{atlas_name}.png"))
    image = bpy.data.images.load(path) if os.path.exists(path) else None
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
    return image is not None


def cut(donor, mesh_name, out_name, atlas, export_dir, wearer_limbs, wearer_joints):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.abspath(os.path.join(MODELS, f"{donor}.fbx")))
    body = bpy.data.objects[mesh_name]
    me = body.data
    groups = {g.index: g.name for g in body.vertex_groups}

    def dominant(v):
        if not v.groups:
            return "?"
        return groups[max(v.groups, key=lambda g: g.weight).group]

    # A face goes if ANY of its vertices follows a skin bone: the seam ring at a
    # wrist or a collar is mixed, and keeping it leaves a cuff of costume
    # standing on the player's own arm.
    doomed = [
        p.index for p in me.polygons
        if any(any(s in dominant(me.vertices[i]) for s in SKIN_BONES) for i in p.vertices)
    ]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in doomed], context="FACES")
    bm.to_mesh(me)
    bm.free()

    body.name = "Garment"
    me.name = "Garment"
    textured = dress(body, atlas)

    # THE FITTINGS COME TOO, and leaving them behind is what made the plate look
    # like a padded suit.
    #
    # Each of these characters wears its armour in two parts: a skinned body, and
    # RIGID PIECES PARENTED TO BONES beside it — the Warrior's pauldrons on
    # `UpperArm.L/R`, the Ranger's cloak on `Head`, its bracers on `LowerArm.L/R`,
    # its pouch on `Abdomen`. This function used to delete every object but the
    # body, on the reasoning that what remained was "props, weapon, face". Two of
    # those three are right; the pauldrons are the armour.
    #
    # They are baked and re-parented to nothing, exactly as `look_pieces.py` bakes
    # a beard: with the world transform in the vertices, `boneAttachMatrix` places
    # them at runtime with no frame supplied anywhere. The bone is carried in the
    # NAME, spelled the way three.js spells it — dots stripped — so the runtime
    # can look it up without a translation table.
    fittings = []
    for obj in [x for x in bpy.data.objects if x.type == "MESH" and x is not body]:
        # NOT ON THE HEAD, THE HANDS OR THE FEET — the same rule the skin cut
        # above obeys, and for the same reason: those belong to the wearer and to
        # other slots. The Ranger's cloak hangs off `Head`, and carrying it along
        # gave a chest item a hood that covered the player's face and would fight
        # every helm in the game; the Rogue's boots hang off `Foot` and would
        # fight the boots slot. Photographed before this filter existed, which is
        # the only reason it does.
        on_skin = any(s in (obj.parent_bone or "") for s in SKIN_BONES)
        keep = obj.parent_type == "BONE" and obj.parent_bone and not on_skin and not any(
            drop in obj.name for drop in DROP_MESHES
        )
        if not keep:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        bone = obj.parent_bone.replace(".", "")
        # CAPTURED BEFORE THE PARENT IS CLEARED. `obj.parent_bone` is empty once
        # `obj.parent` is None, so reading it after unparenting asked the donor
        # for the box of a bone called "" and got nothing -- and the registration
        # below simply did not happen, silently, on every fitting.
        parented_to = obj.parent_bone
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        # REGISTERED ONTO THE WEARER'S OWN LIMB, by the same routine the hood
        # uses. These fittings were exported raw, and `tools/soak/fitcheck.mjs`
        # then caught the leather bracers floating a quarter of a unit clear of
        # this body's forearm — the Ranger is 16% narrower than the Rogue, so a
        # guard cut to its arm cannot sit on ours.
        #
        # It is the same bug as the Warrior's hair and the Ranger's hood, on a
        # third bone. Registering here rather than per-piece is what stops there
        # being a fourth.
        donor_limb = register.bone_box(parented_to)
        wearer_limb = wearer_limbs.get(bone)
        # ANCHORED AT THE JOINT. A fitting hangs partway down a limb, so the
        # point it shares with the wearer's version is the bone's origin, not
        # the middle of the limb's bounding box.
        donor_joint = register.bone_origin(parented_to)
        wearer_joint = wearer_joints.get(bone)
        if donor_limb and wearer_limb:
            scale, shift = register.fit(obj, donor_limb, wearer_limb, donor_joint, wearer_joint)
            print(f"  {obj.name} -> {bone}: scale "
                  f"({scale.x:.3f},{scale.y:.3f},{scale.z:.3f})")
        # `transform_apply` needs the object selected and active, and it is the
        # step that turns "positioned by a parent" into "positioned by its own
        # vertices" — which is the only form the runtime can place.
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        dress(obj, atlas)
        obj.name = f"fit_{bone}"
        fittings.append(obj.name)

    print(f"GARMENT {out_name:<8} {len(me.polygons):>4} faces (cut {len(doomed)} skin) "
          f"atlas={'attached' if textured else 'MISSING'} "
          f"fittings={','.join(fittings) if fittings else 'none'}")

    if export_dir:
        os.makedirs(export_dir, exist_ok=True)
        out = os.path.join(export_dir, f"{out_name}.glb")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.export_scene.gltf(
            filepath=out,
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_extras=True,
            export_yup=False,
            export_animations=False,
            export_materials="EXPORT",
            export_image_format="AUTO",
        )
        print(f"  WROTE {out}")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    export_dir = None
    i = 0
    while i < len(args):
        if args[i] == "--export":
            export_dir = os.path.abspath(args[i + 1]); i += 2
        else:
            i += 1
    # Measured ONCE, before any donor is loaded: every fitting on every garment
    # is registered against the same set of numbers.
    wearer_joints = register.wearer_joints(LIMBS)
    wearer_limbs = register.wearer_bones(
        LIMBS
    )
    for donor, mesh_name, out_name, atlas in JOBS:
        cut(donor, mesh_name, out_name, atlas, export_dir, wearer_limbs, wearer_joints)


main()
