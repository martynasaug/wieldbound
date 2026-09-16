# WHAT `bodyshape.py` ACTUALLY MEASURES, printed against the numbers the
# recipes are written in.
#
#   blender --background --factory-startup --python tools/art/items/probe_shape.py
#
# A bench, not a build. Nothing reads its output but me, and it exists because
# a body-following shell is only as good as the frame it is measured in: if the
# sign of y is wrong, or the ruler is off, every piece moves backwards and the
# fault looks like a modelling mistake rather than an axis one.

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import bodyshape  # noqa: E402

LIMBS = [
    ("thigh L", "z", (22.0, 0.0), 24.0, (), [116, 108, 100, 92, 84, 76, 68]),
    ("shin L", "z", (24.2, 0.0), 20.0, (), [58, 46, 34, 22, 14]),
    ("torso", "z", (0.0, 3.0), 44.0, bodyshape.ARMS, [204, 198, 186, 174, 162, 156]),
    ("waist", "z", (0.0, 6.0), 44.0, bodyshape.ARMS, [152, 140, 128, 118, 108]),
    ("upper arm L", "x", (-4.0, 186.0), 20.0, (), [38, 48, 58, 66]),
    ("lower arm L", "x", (-4.0, 186.0), 17.0, (), [70, 82, 94, 104]),
    ("skull", "z", (0.0, 3.0), 54.0, (), [214, 238, 262, 286]),
]


def main():
    state = bodyshape._load()
    print("")
    print("BONES: how many vertices, and where they sit on the ruler")
    for bone, pts in sorted(state["bones"].items(), key=lambda kv: -len(kv[1])):
        print(f"  {bone:<14}{len(pts):4d}   "
              f"z {min(p.z for p in pts):7.1f}..{max(p.z for p in pts):7.1f}   "
              f"x {min(p.x for p in pts):7.1f}..{max(p.x for p in pts):7.1f}   "
              f"y {min(p.y for p in pts):7.1f}..{max(p.y for p in pts):7.1f}")

    sides = 12
    angles = [2 * math.pi * k / sides + math.pi / sides for k in range(sides)]
    for name, run, centre, limit, drop, stations in LIMBS:
        print("")
        print(f"{name}  (about {centre}, along {run}, limit {limit:.0f})")
        for at in stations:
            got = bodyshape.ring(at, centre, angles, math.pi / sides, run=run,
                                 band=4.5, limit=limit, exclude=drop,
                                 recentre=run == "x" or "leg" in name or "arm" in name)
            if got is None:
                print(f"  {at:6.0f}   nothing in range")
                continue
            radii, found = got
            print(f"  {at:6.0f}   centre ({found[0]:6.1f},{found[1]:6.1f})   "
                  f"min {min(radii):5.1f} max {max(radii):5.1f}   "
                  + " ".join(f"{r:4.1f}" for r in radii))


main()
