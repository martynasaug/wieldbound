# BARE HANDS: TAKE THE MONK'S GLOVES OFF.
#
#   blender --background --factory-startup --python tools/art/bare_hands.py -- <Monk.fbx> <source.png> <out.png> [overlay.png]
#
# Asked for: "Remove the gloves from player character model. Gloves (fists)
# should be another weapon type." The gloves are not a node that can be removed:
# they are PAINT. The Monk is one skinned mesh on one texture, and the fists and
# the cuffs over the wrists are faces like any other, whose UV islands happen to
# be painted dark leather and cloth. The fist itself is already modelled as a
# curled bare hand; the cuff is a flared band that `gear.ts` pulls in to the
# forearm at load (`bareForearms`).
#
# So this repaints exactly those islands as skin. Which faces are hand is read
# from the skin weights — a face belongs to the bone most of its vertices follow
# — and the islands were checked to be used by nothing else (a hand face and a
# robe face never share texels; see `tools/soak/shots/hands/uv_exclusive.png`).
#
# SKIN IS MEASURED, NOT PICKED: the hue, saturation and lightness of the paint on
# the upper arms, which are bare. The repaint keeps each island's own brushwork
# as lightness variation around that, so a hand reads as painted like the rest
# of the body rather than filled. And it lands inside `skinWeight` in
# `client/src/three/skin.ts`, so a player's chosen skin tone reaches the hands
# the same way it reaches the face.
#
# The source is `tools/art/source/Monk_Texture_original.png`, never the output,
# so running this twice does not compound.

import colorsys
import collections
import sys

import bpy
import numpy as np

HAND_BONES = {"Fist.R", "Fist1.R", "Fist2.R", "Thumb1.R", "Thumb2.R", "Fist.L", "Fist1.L", "Fist2.L", "Thumb1.L", "Thumb2.L"}
# The cuff sits on the forearm bone; so does the bare forearm above it, which is
# already skin and survives the repaint unchanged in hue.
ARM_BONES = {"LowerArm.R", "LowerArm.L"}
SKIN_SAMPLE_BONES = {"UpperArm.R", "UpperArm.L"}
# Texels past an island's edge that are repainted too, so mip levels and
# filtering do not pull the old leather in along the seams.
BLEED = 3
# A forearm face further than this times the bare forearm's radius from the
# bone is the cuff.
CUFF_PROUD = 1.2


def faces_by_bone(body, arm):
    """UV polygons per dominant bone — with the forearm split into bare arm and cuff."""
    me = body.data
    groups = {g.index: g.name for g in body.vertex_groups}
    uv = me.uv_layers.active.data
    out = collections.defaultdict(list)
    forearm = collections.defaultdict(list)
    for p in me.polygons:
        names = collections.Counter()
        for i in p.vertices:
            v = me.vertices[i]
            if v.groups:
                names[groups[max(v.groups, key=lambda g: g.weight).group]] += 1
        if not names:
            continue
        bone = names.most_common(1)[0][0]
        polygon = [tuple(uv[li].uv) for li in p.loop_indices]
        if bone in ARM_BONES:
            forearm[bone].append((polygon, [me.vertices[i].co.copy() for i in p.vertices]))
        else:
            out[bone].append(polygon)

    # THE CUFF IS A SHAPE, NOT A COLOUR. Telling it from the bare forearm by its
    # paint left speckle wherever the brown of the leather strayed into the range
    # of the brown of skin. By geometry it is unambiguous: a flared band that
    # stands proud of the forearm. Radius is measured from the bone's own axis,
    # and "proud" is against the forearm's radius near the elbow.
    for bone, faces in forearm.items():
        b = arm.data.bones[bone]
        head, tail = arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local
        axis = tail - head
        length = axis.length
        axis.normalize()

        def place(points):
            c = sum(points, points[0] * 0) / len(points)
            t = (c - head).dot(axis) / length
            r = max(((q - head) - axis * (q - head).dot(axis)).length for q in points)
            return t, r

        placed = [(polygon, *place(points)) for polygon, points in faces]
        # Measured: the bare forearm's faces sit at t 0.42-0.47, radius ~0.10; the
        # cuff runs from t 0.70 past the wrist at radius 0.15-0.22. Nothing is
        # nearer the elbow than 0.42 (the upper arm takes over), so "near the
        # elbow" is the first half of the bone.
        elbow = sorted(r for _, t, r in placed if t < 0.6)
        bare = elbow[len(elbow) // 2] if elbow else 0.0
        for polygon, t, r in placed:
            kind = "cuff" if r > bare * CUFF_PROUD else "bare"
            out[f"{bone}:{kind}"].append(polygon)
        print(f"FOREARM {bone}: bare radius {bare:.3f}; faces (t, r): "
              + " ".join(f"({t:.2f},{r:.3f})" for _, t, r in sorted(placed, key=lambda x: x[1])))
    return out


def rasterise(polys, width, height):
    mask = np.zeros((height, width), dtype=bool)
    for poly in polys:
        for k in range(1, len(poly) - 1):
            tri = np.array([poly[0], poly[k], poly[k + 1]]) * [width, height]
            x0, y0 = np.floor(tri.min(axis=0)).astype(int)
            x1, y1 = np.ceil(tri.max(axis=0)).astype(int)
            x0, y0 = max(x0, 0), max(y0, 0)
            x1, y1 = min(x1, width - 1), min(y1, height - 1)
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (ax, ay), (bx, by), (cx, cy) = tri
            d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(d) < 1e-9:
                continue
            w1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
            w2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
            inside = (w1 >= 0) & (w2 >= 0) & (w1 + w2 <= 1)
            mask[y0:y1 + 1, x0:x1 + 1] |= inside
    return mask


def grow(mask, steps):
    m = mask.copy()
    for _ in range(steps):
        g = m.copy()
        g[1:, :] |= m[:-1, :]
        g[:-1, :] |= m[1:, :]
        g[:, 1:] |= m[:, :-1]
        g[:, :-1] |= m[:, 1:]
        m = g
    return m


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    fbx, source, out = args[0], args[1], args[2]
    overlay = args[3] if len(args) > 3 else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    body = bpy.data.objects["Monk"]
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.data.pose_position = "REST"
    by_bone = faces_by_bone(body, arm)
    cuff_keys = {f"{b}:cuff" for b in ARM_BONES}
    bare_keys = {f"{b}:bare" for b in ARM_BONES}

    image = bpy.data.images.load(source)
    width, height = image.size
    px = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)

    hands = rasterise([p for b in HAND_BONES for p in by_bone.get(b, [])], width, height)
    cuff = rasterise([p for b in cuff_keys for p in by_bone.get(b, [])], width, height)
    others = rasterise([p for b, ps in by_bone.items() if b not in HAND_BONES | cuff_keys for p in ps], width, height)
    sample = rasterise([p for b in SKIN_SAMPLE_BONES | bare_keys for p in by_bone.get(b, [])], width, height)

    # The skin, from the bare upper arms.
    hls = np.array([colorsys.rgb_to_hls(*c) for c in px[sample][:, :3]])
    skin_h = float(np.median(hls[:, 0]))
    skin_l = float(np.median(hls[:, 1]))
    skin_s = float(np.median(hls[:, 2]))
    print(f"SKIN hue {skin_h * 360:.1f} light {skin_l:.3f} sat {skin_s:.3f} from {sample.sum()} texels")

    print(f"CUFF texels {cuff.sum()}, HAND texels {hands.sum()}")

    # WHOLE ISLANDS, NOT JUST THE FACES I CLASSIFIED. The mask was built from the
    # faces whose vertices follow a hand bone, grown by a few texels — and the
    # glove's painted decoration (a flower on the back of each hand, a bright
    # seam at the wrist) sits on texels just outside those faces, so it survived
    # every repaint and showed up on the bare hand. Growing the mask much
    # further, still clipped against everything that is NOT hand, covers the
    # island the hand actually occupies.
    target = grow(hands | cuff, BLEED * 6) & ~grow(others, 1)
    ys, xs = np.nonzero(target)
    region = px[ys, xs, :3]
    region_hls = np.array([colorsys.rgb_to_hls(*c) for c in region])
    mean_l = float(region_hls[:, 1].mean())
    # KEEP THE BRUSHWORK, BUT ONLY THE BRUSHWORK. At 0.55 this preserved the
    # glove's own decoration along with its shading: a pale petal motif on the
    # back of each hand and a bright seam along the wrist survived as skin-
    # coloured versions of themselves, which is worse than either a glove or a
    # hand. Skin on this body is painted almost flat, so the variation is
    # clamped to a narrow band around the median and the outliers — which are
    # the motif and the seam, not shading — are pulled in with it.
    spread = np.clip((region_hls[:, 1] - mean_l) * 0.28, -0.05, 0.05)
    new = np.array([colorsys.hls_to_rgb(skin_h, min(max(skin_l + d, 0.0), 1.0), skin_s)
                    for d in spread])
    px[ys, xs, :3] = new
    print(f"REPAINTED {len(ys)} texels (was mean lightness {mean_l:.3f})")

    image.pixels[:] = px.ravel()
    image.filepath_raw = out
    image.file_format = "PNG"
    image.save()
    print(f"WROTE {out}")

    if overlay:
        view = px.copy()
        view[target, 0] = view[target, 0] * 0.5 + 0.5
        image.pixels[:] = view.ravel()
        image.filepath_raw = overlay
        image.save()
        print(f"OVERLAY {overlay}")


main()
