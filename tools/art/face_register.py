# REGISTERING EACH DONOR'S FACE AGAINST THE PLAYER'S, BY THE NOSE.
#
#   blender --background --factory-startup --python tools/art/face_register.py
#
# The moustache sits on the character's neck. `lookfit.ts` closed the FORWARD gap
# it was measured to have, and the picture then showed the real fault: the piece
# is about a tenth of a unit too LOW, which a forward push was never going to
# reach. Every Monk-derived facial piece looks similarly dropped.
#
# The likely cause is that the player's face was not copied wholesale. The nose
# and brows were grafted onto the skull by `base_body.py`, and if that graft
# seated the nose anywhere other than exactly where the Monk wore it, then every
# other piece cut from the Monk is off by that same amount — one offset, not one
# per beard.
#
# THE NOSE IS THE LANDMARK, and the pack makes that possible: `look_pieces.py`
# cut `Monk_nose`, `Wizard_nose` and `Warrior_nose` as separate files. Each is
# the same feature on the same face, so lining a donor's nose up with the
# player's lines up everything else that came off that donor.
#
# THIS SCRIPT ALSO CHECKS ITS OWN PREMISE, which the last Blender attempt at
# this did not. A previous measurement pass produced confident numbers from a
# guessed axis conversion, and they were nonsense. Loading the pieces into the
# SAME scene as the player body makes the question self-answering: if the spaces
# agree, the donor noses land on the player's face and the deltas are small; if
# they do not, the noses land somewhere absurd and it is visible in the numbers
# rather than hidden inside an assumption.

import os

import bpy
import mathutils

MODELS = "client/public/models"
HAIR = f"{MODELS}/hair"
NOSES = ["Monk_nose", "Wizard_nose", "Warrior_nose"]
# The pieces the creator actually wears, measured against the same nose. A
# moustache belongs immediately under it; anything much lower is on the chin or
# the throat, whatever the file is called.
WORN = ["Monk_moustache", "Monk_beard", "Wizard_beard", "Wizard_hair", "Warrior_hair"]


def box_of(objs):
    lo = mathutils.Vector((1e9, 1e9, 1e9))
    hi = mathutils.Vector((-1e9, -1e9, -1e9))
    n = 0
    for obj in objs:
        mw = obj.matrix_world
        for v in obj.data.vertices:
            p = mw @ v.co
            lo = mathutils.Vector((min(lo[i], p[i]) for i in range(3)))
            hi = mathutils.Vector((max(hi[i], p[i]) for i in range(3)))
            n += 1
    return (lo, hi, n) if n else None


def fmt(box):
    lo, hi, n = box
    mid = (lo + hi) / 2
    return (
        f"x[{lo.x:7.3f},{hi.x:7.3f}] y[{lo.y:7.3f},{hi.y:7.3f}] z[{lo.z:7.3f},{hi.z:7.3f}]"
        f"  centre({mid.x:7.3f},{mid.y:7.3f},{mid.z:7.3f}) n={n}"
    )


def main():
    root = os.getcwd()
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # The player first, so its objects are the ones already present.
    bpy.ops.import_scene.gltf(filepath=os.path.join(root, MODELS, "Player_Base.glb"))
    before = set(bpy.data.objects)

    player_nose = [o for o in bpy.data.objects if o.type == "MESH" and "nose" in o.name.lower()]
    if not player_nose:
        print("PLAYER has no nose mesh; names present:")
        for o in bpy.data.objects:
            if o.type == "MESH":
                print("   ", o.name)
        return
    pbox = box_of(player_nose)
    print("")
    print(f"PLAYER  {' '.join(o.name for o in player_nose):14s} {fmt(pbox)}")

    for stem in NOSES:
        path = os.path.join(root, HAIR, f"{stem}.glb")
        if not os.path.exists(path):
            print(f"{stem:14s} MISSING")
            continue
        bpy.ops.import_scene.gltf(filepath=path)
        fresh = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
        if not fresh:
            print(f"{stem:14s} imported nothing")
            continue
        dbox = box_of(fresh)
        print(f"{stem:14s} {fmt(dbox)}")
        delta = ((pbox[0] + pbox[1]) / 2) - ((dbox[0] + dbox[1]) / 2)
        print(f"{'':14s} DELTA to player nose ({delta.x:+.3f},{delta.y:+.3f},{delta.z:+.3f})")
        # Removed again so the next donor is measured alone rather than against a
        # scene that is accumulating noses.
        for o in fresh:
            bpy.data.objects.remove(o, do_unlink=True)

    # y is the vertical axis in this file and it runs NEGATIVE at the head, so a
    # piece with a larger y is HIGHER. Reported as "below nose base" to keep the
    # sign readable: positive means the piece hangs under the nose, which is
    # where facial hair belongs.
    nose_base = pbox[0].y
    print("")
    print("piece                                                        below nose base")
    for stem in WORN:
        path = os.path.join(root, HAIR, f"{stem}.glb")
        if not os.path.exists(path):
            print(f"{stem:20s} MISSING")
            continue
        bpy.ops.import_scene.gltf(filepath=path)
        fresh = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
        box = box_of(fresh)
        if box:
            lo, hi, _ = box
            print(f"{stem:20s} y[{lo.y:7.3f},{hi.y:7.3f}]  top {nose_base - hi.y:+7.3f}  bottom {nose_base - lo.y:+7.3f}")
        for o in fresh:
            bpy.data.objects.remove(o, do_unlink=True)


main()
