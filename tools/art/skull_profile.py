# HOW WIDE THE SKULL ACTUALLY IS, AT EVERY HEIGHT.
#
#   blender --background --factory-startup --python tools/art/skull_profile.py
#
# THE PROBLEM THIS EXISTS TO END. `armour.py`'s `BODY` table carries one number
# for the head's width — `head_half_x` = 33 — and that number is the skull's
# WIDEST point. Every head piece in the game is built from it, and that has gone
# wrong in both directions, repeatedly:
#
#   TOO NARROW  the skullcap's cheek arc was built at `wide * 0.9` = 32.4, inside
#               a skull of 33, so the temples came through the sides of every
#               style built on that dome. Reported three times as "parts of the
#               head showing", and answered three times by moving the piece up or
#               down, because in a front view a gap at the SIDE of a head looks
#               exactly like a piece sitting too high.
#
#   TOO WIDE    the correction to that, on `full`, set every station to 39 — the
#               max plus clearance, all the way down to the jaw — and the helm
#               came out broader than the character's shoulders. A bucket, which
#               is the fault that style had just been rescued from.
#
# Both mistakes are the same mistake: a head is not a cylinder, and one number
# cannot describe it. The skull is widest at the temples and draws in above and
# below, so a piece that clears it at the ears is miles clear of it at the jaw.
#
# So this prints the profile: for each band of height between `head_y0` and
# `head_y1`, the half-width and the front and back of the skull, in the same
# units the `BODY` table uses. A head piece can then be cut to the head instead
# of to its widest slice.
#
# UNITS. The donor is measured in pack units and `BODY` is in hundredths of
# those — the skull is 0.890 tall in the FBX and 89 tall in the table (206 to
# 295) — so everything here is multiplied by 100 and shifted so the bottom of
# the skull lands on `head_y0`. Measured from the FBX and not from
# `Player_Base.glb` for the reason `register.py` gives: comparing two files in
# the same format is a subtraction instead of an axis conversion, and every axis
# error in this phase came from converting between the two.

import os

import bpy
import mathutils

MODELS = "client/public/models"
WEARER = "Rogue.fbx"

# The `BODY` table's own head landmarks, so the output is directly comparable.
HEAD_Y0 = 206.0
HEAD_Y1 = 295.0
# SIX, NOT TEN. This head is low-poly — about seventy-five vertices in the whole
# skull — and at ten bands one of them caught a single vertex and reported a
# half-width of 0.0, which is the sliver problem `register.py` already pays for
# with its `SCALE_LIMIT`. A band with too few vertices in it is not describing a
# head, it is describing where the vertices happen to be, so the count is printed
# beside every row and thin ones are flagged rather than quietly believed.
BANDS = 6
THIN = 4


def skull_vertices():
    """World positions of the vertices the Head bone dominates."""
    out = []
    for obj in [o for o in bpy.data.objects if o.type == "MESH" and o.vertex_groups]:
        idx = {g.index for g in obj.vertex_groups if g.name.replace(".", "") == "Head"}
        if not idx:
            continue
        mw = obj.matrix_world
        for v in obj.data.vertices:
            # Dominant weight only, exactly as `register.bone_box` counts it: a
            # throat vertex shared with the spine is not part of the skull, and
            # counting it drags the profile down the neck.
            w = sum(g.weight for g in v.groups if g.group in idx)
            total = sum(g.weight for g in v.groups) or 1.0
            if w / total > 0.5:
                out.append(mw @ v.co)
    return out


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(os.getcwd(), MODELS, WEARER))

    pts = skull_vertices()
    if not pts:
        print(f"no Head-weighted vertices on {WEARER}")
        return

    zlo = min(p.z for p in pts)
    zhi = max(p.z for p in pts)
    # The skull's own centre line in x, so a half-width is measured about the
    # head rather than about the world.
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2

    scale = (HEAD_Y1 - HEAD_Y0) / (zhi - zlo)

    def to_body_y(z):
        return HEAD_Y0 + (z - zlo) * scale

    print("")
    print(f"SKULL PROFILE from {WEARER}, in BODY units "
          f"(head {HEAD_Y0:.0f}..{HEAD_Y1:.0f}, scale x{scale:.1f})")
    print("")
    print(f"{'y':>8}{'half_x':>10}{'front_z':>10}{'back_z':>10}{'n':>6}")

    step = (zhi - zlo) / BANDS
    widest = 0.0
    for b in range(BANDS):
        lo, hi = zlo + b * step, zlo + (b + 1) * step
        band = [p for p in pts if (lo - 1e-6) <= p.z <= (hi + 1e-6)]
        if not band:
            continue
        half = max(abs(p.x - cx) for p in band) * scale
        front = max(p.y - cy for p in band) * scale
        back = min(p.y - cy for p in band) * scale
        widest = max(widest, half)
        flag = "   <- too few vertices to trust" if len(band) < THIN else ""
        print(f"{to_body_y((lo + hi) / 2):8.0f}{half:10.1f}{front:10.1f}{back:10.1f}{len(band):6d}{flag}")

    print("")
    print(f"widest half_x {widest:.1f}  (the BODY table's head_half_x is 33)")
    print("A head piece cut to this profile clears the skull everywhere without")
    print("being cut to the temples at the jaw.")


main()
