# THE MISSING ANIMATIONS, AUTHORED ONTO THE BODY THE GAME ALREADY WEARS.
#
# THIS IS A CHANGE OF APPROACH AND THE REASON IS WORTH WRITING DOWN.
#
# The player body was going to be replaced with one built from primitives so
# that it could carry its own chop, mine and pick — the three animations the
# borrowed pack has never had, and which three milestones went into faking at
# runtime. That body was measured, rebuilt and re-measured six times and never
# stopped looking like an artist's mannequin beside the Monk, because a figure
# assembled from tapered tubes and rounded blocks IS a mannequin. No amount of
# adjusting its numbers was going to turn it into a character: the approach was
# wrong, not the numbers, and I kept tuning instead of asking that.
#
# What was actually wanted is a character that looks like the Monk and can be
# customised. The Monk already looks like the Monk. It is properly skinned to
# the 44-bone skeleton the whole game is built around, every piece of armour in
# the wardrobe is authored to fit it, and all twenty-five pooled clips play on
# it. The only thing it lacks is those three clips — so this adds them to it
# instead of replacing it to get them.
#
# ITS BONES ARE THE SAME NAMES WITH DOTS IN THEM: `UpperArm.L` in the FBX is
# `UpperArmL` at runtime, because three.js's loader strips them. Rather than
# translate every table, the bones are RENAMED to the runtime spelling before
# the clips are built — which also means the exported clips target exactly the
# names the game looks for.
#
#   blender --background --python tools/art/monk_clips.py -- <out.glb>

import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from player_clips import all_actions  # noqa: E402

# The three the pack has no answer for. Idle, walk, run, attack, hit and death
# it already ships, and its own are better than anything authored blind here:
# they were made by the people who modelled it.
WANTED = ("Chop", "Mine", "Pick")

STEMS = ("UpperArm", "LowerArm", "Shoulder", "Fist", "Fist1", "Fist2",
         "UpperLeg", "LowerLeg", "Foot", "Thumb1", "Thumb2", "Weapon", "PoleTarget")


def to_runtime_names(arm):
    """Rename `Thing.L` to `ThingL` on the armature, in place."""
    renamed = 0
    for bone in arm.data.bones:
        name = bone.name
        for stem in STEMS:
            for side in ("L", "R"):
                if name in (f"{stem}.{side}", f"{stem}.{side}_end"):
                    bone.name = name.replace(".", "")
                    renamed += 1
    return renamed


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = args[0] if args else "monk_clips.glb"
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(root, "client/public/models/Monk.fbx"))
    arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if arm is None:
        print("NO ARMATURE")
        return

    # Whatever the FBX arrived carrying, so the export holds only what is built
    # here.
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)

    renamed = to_runtime_names(arm)
    print(f"renamed {renamed} bones to their runtime spelling")

    # Every clip is built and the ones the Monk already has are then dropped.
    # Building all of them and discarding is deliberate: the tables stay in one
    # place, and a Chop that silently referenced a bone this rig does not have
    # would export as an empty clip rather than as an error.
    built = all_actions(arm)
    made = [a for a in built if a.name in WANTED]
    for act in built:
        if act.name not in WANTED:
            bpy.data.actions.remove(act)
    print("KEPT " + ", ".join(a.name for a in made))

    # The armature alone. A clip has to be expressed against a skeleton, and
    # three.js reads the animations off the file without minding that no mesh
    # came with them — shipping the Monk's body a second time would double an
    # already two-megabyte download for nothing.
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_yup=True,
        use_selection=True,
    )
    print(f"EXPORTED {out}")


main()
