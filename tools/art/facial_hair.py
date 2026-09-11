# FACIAL HAIR, FROM THE MONK'S OWN CLUMPS AND FROM NEW ONES MODELLED ON ITS JAW.
#
# Asked for after the hairstyles: "start doing different facial hair."
#
# THE MONK ALREADY HAS GOOD FACIAL HAIR, and it is in pieces. Its rigid head
# piece (`Monk.001`) is a set of separate islands: two brows, a nose strip, a
# looped moustache, a cluster of leaf clumps on the chin, thirteen mirrored
# pairs of clumps down the cheeks, and ten beads. Islands can be recombined
# without redrawing a single face, so four styles are the Monk's own authored
# art, reassembled: moustache, goatee, mutton chops and the full Monk beard.
# Two more are modelled here, on the same jaw and in the same faceted clumps:
# a long beard hanging to a point, and a braided one.
#
# Everything is exported in `Monk.001`'s local space, like the hair (see
# `hair.py`), so the game hangs it beside the head piece with no fitting. The
# brows are exported too, as their own piece, so they can take the hair colour;
# in the game the baked head piece keeps only its nose.
#
#   blender --background --python tools/art/facial_hair.py -- <preview_dir> [style ...]
#   blender --background --python tools/art/facial_hair.py -- <preview_dir> --export <glb_dir>

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from hair import (  # noqa: E402
    ROOT,
    Builder,
    Head,
    bezier,
    elevation_at_z,
    export_style,
    load_monk,
    preview_scene,
    render_sheet,
)


# --- The Monk's islands ----------------------------------------------------------

def islands_of(piece):
    """Every connected island of the head piece, in world space, with its bounds."""
    bm = bmesh.new()
    bm.from_mesh(piece.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.faces.ensure_lookup_table()
    world = piece.matrix_world
    seen, found = set(), []
    for start in bm.faces:
        if start.index in seen:
            continue
        stack, faces = [start], []
        seen.add(start.index)
        while stack:
            face = stack.pop()
            faces.append(face)
            for edge in face.edges:
                for other in edge.link_faces:
                    if other.index not in seen:
                        seen.add(other.index)
                        stack.append(other)
        polys = [[world @ v.co for v in f.verts] for f in faces]
        pts = [p for poly in polys for p in poly]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        found.append({"polys": polys, "centre": (lo + hi) / 2, "size": hi - lo, "count": len(faces)})
    bm.free()
    return found


def kind(island):
    """
    What an island is, from where it sits and how big it is.

    Read off a colour-coded render of the piece and its printed bounds: ten
    beads of 160 faces; two wide bars above the eyes; one narrow strip down the
    centre; a moustache just under it; a chin cluster close to the centre line
    below the mouth; and everything else is the cheeks.
    """
    c, s, n = island["centre"], island["size"], island["count"]
    if n >= 120 and max(s) < 0.2:
        return "bead"
    if c.z > 2.5 and abs(c.x) < 0.2 and s.x > 0.2:
        return "brow"
    if abs(c.x) < 0.01 and n <= 16:
        return "nose"
    if 2.2 < c.z < 2.3 and abs(c.x) < 0.1:
        return "moustache"
    if abs(c.x) < 0.13 and c.z < 2.2:
        return "chin"
    return "cheek"


def from_islands(name, islands, mat):
    b = Builder(name)
    for island in islands:
        for poly in island["polys"]:
            b.face([b.bm.verts.new(p) for p in poly])
    return b.finish(mat)


# --- Modelled on the jaw -------------------------------------------------------------

def style_long(skull, groups, mat):
    """A long full beard: the Monk's moustache over a jaw of clumps hanging to a point."""
    b = Builder("beard_long")
    # THE MONK'S OWN CLUMPS ON TOP, not a modelled jaw sheet. The first version
    # cast a smooth shell over the jaw, and beside the Monk's faceted clumps it
    # read as a balaclava with a hard edge from ear to moustache. The authored
    # beard is the upper half; only the length hanging below it is new.
    for island in groups["moustache"] + groups["cheek"] + groups["chin"]:
        for poly in island["polys"]:
            b.face([b.bm.verts.new(p) for p in poly])
    forward = Vector((0, -1, 0))
    count = 13
    for k in range(count):
        u = k / (count - 1)
        a = -1.15 + 2.3 * u
        root, n = skull.surface(skull.direction(a, elevation_at_z(skull, a, 2.14)))
        # Longest at the centre, so the whole falls to a point.
        length = 0.2 + 0.28 * math.cos(a * 1.1) ** 2
        tip_x = root.x * 0.35
        p0 = root + n * 0.05
        p1 = root + n * 0.06 + forward * 0.05 + Vector((0, 0, -length * 0.45))
        p2 = Vector((tip_x, root.y - 0.02, root.z - length))
        b.lock(skull, bezier(p0, p1, p2, 5), 0.075, 0.045, shape="clump", roll=0.3 * math.sin(k * 1.7))
    return b.finish(mat)


def braid(b, skull, top, bottom, width):
    """A braid: short clumps crossing left and right down a line, which reads as woven."""
    steps = 8
    down = bottom - top
    side = Vector((1, 0, 0))
    for s in range(steps):
        u0, u1 = s / steps, (s + 1) / steps
        c0 = top + down * u0
        c1 = top + down * u1
        flip = 1 if s % 2 == 0 else -1
        taper = 1.0 - 0.35 * u1
        path = [c0 + side * width * 0.9 * flip, (c0 + c1) / 2, c1 - side * width * 0.9 * flip]
        b.lock(skull, path, width * taper, width * 0.85 * taper, shape="wedge")
    # A band and a tuft at the end.
    b.lock(skull, [bottom + Vector((0, 0, 0.01)), bottom - Vector((0, 0, 0.02))], width * 0.8, width * 0.8, sides=6, shape="band")
    b.lock(skull, [bottom - Vector((0, 0, 0.02)), bottom - Vector((0, 0, 0.1))], width * 0.9, width * 0.7, shape="tail")


def style_braided(skull, groups, mat):
    """The Monk's moustache, a close jaw, and two braids hanging from the chin."""
    b = Builder("beard_braided")
    # The Monk's moustache and chin clumps, with the braids growing out of them —
    # the same reason as `style_long`: a modelled jaw sheet read as a balaclava.
    for island in groups["moustache"] + groups["chin"] + groups["cheek"]:
        for poly in island["polys"]:
            b.face([b.bm.verts.new(p) for p in poly])
    for sx in (-0.065, 0.065):
        a = math.atan2(sx, 0.3)
        root, n = skull.surface(skull.direction(a, elevation_at_z(skull, a, 2.1)))
        top = root + n * 0.05 + Vector((0, -0.02, 0))
        bottom = top + Vector((0, -0.04, -0.34))
        braid(b, skull, top, bottom, 0.05)
    return b.finish(mat)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    export_dir = None
    if "--export" in args:
        at = args.index("--export")
        export_dir = os.path.abspath(args[at + 1])
        args = args[:at] + args[at + 2:]
    out_dir = os.path.abspath(args[0]) if args else os.path.join(ROOT, "tools/soak/shots/beards")
    os.makedirs(out_dir, exist_ok=True)

    body, piece = load_monk()
    islands = islands_of(piece)
    groups = {}
    for island in islands:
        groups.setdefault(kind(island), []).append(island)
    print("ISLANDS " + ", ".join(f"{k} {len(v)}" for k, v in sorted(groups.items())))

    # The jaw WITHOUT the old beard or the beads on it: new beards are cast onto
    # the face, not onto the clumps they replace.
    skull = Head(body)

    mat = bpy.data.materials.new("facial_hair")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.28, 0.17, 0.09, 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    skin = bpy.data.materials.new("nose")
    skin.use_nodes = True
    skin.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.4, 0.28, 1)

    # The piece itself is replaced by its parts: a nose that stays, brows that
    # take the hair colour, and whichever beard is being shown.
    piece.hide_render = True
    nose = from_islands("face_nose", groups["nose"], skin)
    brows = from_islands("face_brows", groups["brow"], mat)

    styles = {
        "moustache": lambda: from_islands("beard_moustache", groups["moustache"], mat),
        "goatee": lambda: from_islands("beard_goatee", groups["moustache"] + groups["chin"], mat),
        "chops": lambda: from_islands("beard_chops", groups["cheek"], mat),
        "monk": lambda: from_islands("beard_monk", groups["moustache"] + groups["chin"] + groups["cheek"], mat),
        "long": lambda: style_long(skull, groups, mat),
        "braided": lambda: style_braided(skull, groups, mat),
    }
    wanted = [a for a in args[1:] if a in styles] or list(styles)

    scene, cam = preview_scene(body, skull)
    built = {}
    for name in wanted:
        skull.misses = 0
        built[name] = styles[name]()
        print(f"BEARD {name}: {len(built[name].data.polygons)} triangles, {skull.misses} rays missed")
    for name, obj in built.items():
        for other in built.values():
            other.hide_render = other is not obj
        render_sheet(scene, cam, skull, f"beard_{name}", out_dir)

    if export_dir:
        os.makedirs(export_dir, exist_ok=True)
        export_style(brows, piece, os.path.join(export_dir, "Face_brows.glb"))
        for name, obj in built.items():
            export_style(obj, piece, os.path.join(export_dir, f"Beard_{name}.glb"))
    _ = nose
    print("DONE")


if __name__ == "__main__":
    main()
