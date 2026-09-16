# WHERE THE PLAYER'S HAND ACTUALLY IS.
#
#   blender --background --factory-startup --python tools/art/items/probe_hand.py
#
# `gloves.py` carries a `HAND` table whose header says, in its own words, that
# it was "measured from Monk.fbx". The player's body is the stripped ROGUE, and
# `ARM_CENTRE` in `armour.py` was seven and a half units out for exactly that
# reason — the same table, the same axis, the same character mix-up.
#
# So this measures the same landmarks on the body the game actually puts in
# front of the player, in the frame `Glove.at` builds in: `out` along the arm is
# x, `across` is y, `up` is z, all times a hundred.

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import bodyshape  # noqa: E402

# The left hand, which is +x; the recipes mirror it themselves.
FIST = ("FistL", "Fist1L", "Fist2L", "Thumb1L", "Thumb2L")
FINGERS = ("Fist2L",)
FOREARM = ("LowerArmL",)


def span(names, k):
    pts = bodyshape.bones(list(names))
    if not pts:
        return None
    return min(p[k] for p in pts), max(p[k] for p in pts)


def main():
    bodyshape._load()
    print("")
    print("THE ROGUE'S LEFT HAND, in glove units (out=x, across=y, up=z)")
    for label, names in (("forearm", FOREARM), ("hand", FIST), ("fingers", FINGERS)):
        out = span(names, 0)
        across = span(names, 1)
        up = span(names, 2)
        if not out:
            print(f"  {label:<10} nothing")
            continue
        print(f"  {label:<10} out {out[0]:7.1f}..{out[1]:7.1f}   "
              f"across {across[0]:7.1f}..{across[1]:7.1f} (mid {sum(across) / 2:6.1f}, half {(across[1] - across[0]) / 2:5.1f})   "
              f"up {up[0]:7.1f}..{up[1]:7.1f} (mid {sum(up) / 2:6.1f})")

    print("")
    print("  the table says:  mid_z -4.0   mid_y 186.0   half_z 19.0")
    print("                   wrist_out 116   knuckles_out 150   finger_out 164")
    print("                   back_y 209   palm_y 158   arm_radius 11.0")


main()
