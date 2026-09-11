# HAIRSTYLES, MODELLED ON THE MONK'S OWN HEAD.
#
# The first attempt at hair was boxes, domes and cones placed by numbers in
# `gear.ts`, and it was rightly rejected: shells authored for a round skull left
# the top of this boxy one bare, and nothing about a primitive says hair. This
# builds hair the way an artist would fit it — ON the head it has to sit on.
#
# THE SCALP IS RAY-CAST, NOT ASSUMED. A grid of directions from the head's
# centre is cast INWARD onto the Monk's actual Head-weighted faces, so every
# vertex of the cap sits a chosen thickness above the real skull, whatever
# shape that skull is. The grid's rows follow a HAIRLINE — high at the brow,
# above the ear at the side, low at the nape — so the edge is a clean curve and
# not a staircase cut through a sphere.
#
# THE STYLE IS THE MONK'S. Its beard is curved, faceted wedge clumps, flat
# shaded. Hair here is the same vocabulary: a cap carved into clump ridges, and
# tapered wedge locks swept along curves for fringes, falls and tails.
#
# SPACE. The game's `Monk001` is Blender's `Monk.001`: a rigid head piece
# parented to the Head bone, whose local vertex coordinates match three.js's
# exactly. Each hairstyle is exported in THAT local space (and without the
# Y-up flip), so the game can hang it beside the beard with the beard's own
# transform and it lands where it was modelled.
#
#   blender --background --python tools/art/hair.py -- <preview_dir> [style ...]
#   blender --background --python tools/art/hair.py -- <preview_dir> --export <glb_dir>

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONT = Vector((0.0, -1.0, 0.0))  # the face looks down -Y in the imported FBX


# --- The Monk ----------------------------------------------------------------

def load_monk():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(ROOT, "client/public/models/Monk.fbx"))
    body = bpy.data.objects["Monk"]
    piece = bpy.data.objects["Monk.001"]
    # THE REST POSE, or the hair is fitted to a skull that is somewhere else.
    # The FBX arrives posed — fists up in front of the face — while `mesh.vertices`
    # holds the BIND positions, so the first cut ray-cast a scalp onto the bind
    # skull and rendered it floating behind and above the posed one. At rest,
    # the vertex data, the drawn head and `Monk.001`'s world matrix all agree,
    # and rest is also the frame the game attaches head pieces in.
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    # The FBX's texture path does not resolve outside the pack it came from, and
    # its material imports metallic, which renders the head as chrome.
    image = bpy.data.images.load(os.path.join(ROOT, "client/public/textures/Monk_Texture.png"))
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE":
                node.image = image
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Metallic"].default_value = 0.0
                node.inputs["Roughness"].default_value = 0.8
    return body, piece


class Head:
    """The skull as something to cast onto: Head-weighted faces, in world space."""

    def __init__(self, body, extras=()):
        mesh = body.data
        gi = body.vertex_groups["Head"].index
        weighted = {
            v.index for v in mesh.vertices
            if any(g.group == gi and g.weight > 0.5 for g in v.groups)
        }
        verts = [body.matrix_world @ v.co for v in mesh.vertices]
        polys = [list(p.vertices) for p in mesh.polygons if all(i in weighted for i in p.vertices)]
        pts = [verts[i] for i in weighted]
        # AND EVERYTHING ELSE ON THE HEAD. The rigid head piece carries more than
        # the beard: a strip rises from the nose past the brow into the hairline,
        # and a scalp cast onto the skull alone was fitted UNDER it — a tab of it
        # stood up through the front of the ponytail's hairline.
        for obj in extras:
            base = len(verts)
            verts.extend(obj.matrix_world @ v.co for v in obj.data.vertices)
            polys.extend([base + i for i in p.vertices] for p in obj.data.polygons)
        self.bvh = BVHTree.FromPolygons(verts, polys, all_triangles=False)
        self.lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        self.hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        self.centre = Vector((0.0, (self.lo.y + self.hi.y) / 2, self.lo.z + 0.55 * (self.hi.z - self.lo.z)))
        self.height = self.hi.z - self.lo.z

    def direction(self, azimuth, elevation):
        """0 azimuth is the face; positive turns towards +X."""
        ce = math.cos(elevation)
        return Vector((math.sin(azimuth) * ce, -math.cos(azimuth) * ce, math.sin(elevation)))

    misses = 0

    def surface(self, d):
        """Where a ray from outside, travelling back towards the centre along d, meets the skull."""
        start = self.centre + d * 3.0
        hit, normal, _, _ = self.bvh.ray_cast(start, -d)
        if hit is None:
            # Counted, because a miss puts a vertex INSIDE the skull and the
            # skull then shows through the hair — reported, not guessed at.
            self.misses += 1
            return self.centre + d * 0.35, d
        return hit, normal


def elevation_at_z(head, azimuth, z):
    """
    The elevation, from the centre, of the skull at height z on this bearing.

    SCANNED DOWN FROM THE CROWN, not bisected. Bisection assumes the surface
    rises steadily with elevation, and across the face it does not — the brow
    ridge and the face planes fold back on themselves — so on the bearings
    nearest the nose it could settle on the wrong crossing and cut the hairline
    high, leaving a notch of forehead standing up into the hair. The first
    crossing below the crown is the scalp's.
    """
    step = 0.01
    e = 1.5
    prev = e
    while e > -1.2:
        p, _ = head.surface(head.direction(azimuth, e))
        if p.z < z:
            lo, hi = e, prev
            for _ in range(20):
                mid = (lo + hi) / 2
                q, _ = head.surface(head.direction(azimuth, mid))
                if q.z < z:
                    lo = mid
                else:
                    hi = mid
            return (lo + hi) / 2
        prev = e
        e -= step
    return -1.2


def hairline(head, front_z, side_z, back_z):
    """A hairline as heights at the brow, above the ear and at the nape, eased round the head."""
    cache = {}

    def at(azimuth):
        key = round(azimuth, 4)
        if key not in cache:
            c = math.cos(azimuth)
            if c >= 0:
                z = side_z + (front_z - side_z) * (c ** 1.6)
            else:
                z = side_z + (back_z - side_z) * ((-c) ** 1.2)
            cache[key] = elevation_at_z(head, azimuth, z)
        return cache[key]

    return at


# --- Building blocks -------------------------------------------------------------

class Builder:
    """Accumulates flat-shaded geometry in world space and becomes one object."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()

    def face(self, vs):
        try:
            self.bm.faces.new(vs)
        except ValueError:
            pass

    # 24 x 6, not 48 x 10: the Monk is built from big bold facets, and a dense
    # cap read as smooth noise beside it.
    def cap(self, head, line, thickness, rows=6, cols=32, inset=0.006, jag=(0, 0.0), fade=0.8):
        """
        A closed shell over the scalp down to `line`.

        `thickness(azimuth, t)` gives the height above the skull, with t running
        0 at the crown to 1 at the hairline, so a style can carve ridges and swell
        or thin the hair anywhere.

        NOT A HAT. The first caps kept full thickness right to a smooth edge and
        every style read as a knitted beanie with a rim above the brows. Hair
        thins where it grows out of skin, and its edge is strands, not a hem: so
        `fade` thins the last stretch towards the scalp, and `jag` (count, depth)
        drops every other column below the hairline like the tips of locks.
        """
        bm = self.bm
        top = math.radians(86)
        outer, inner = [], []
        for j in range(cols):
            # ON the centre line, not straddling it. The skull is faceted with a
            # ridge running exactly along x = 0 over the crown and down the back,
            # and columns either side of it left a facet spanning the ridge —
            # which stood up through the hair as a tab above the brow and a line
            # of specks down the back. Measured, after two wrong guesses.
            a = -math.pi + j * 2 * math.pi / cols
            e_low = line(a)
            if jag[0]:
                phase = (a / (2 * math.pi)) * jag[0]
                e_low -= jag[1] * (1 - abs(2 * (phase - math.floor(phase)) - 1))
            ring_o, ring_i = [], []
            for i in range(rows + 1):
                t = i / rows
                e = top + (e_low - top) * t
                d = head.direction(a, e)
                p, n = head.surface(d)
                # Mostly RADIAL. Pushed along the hit face's normal, two columns
                # either side of a ridge were driven apart and the facet between
                # them sagged under the ridge edge.
                push = (n * 0.3 + d * 0.7).normalized()
                thin =1 - fade * (max(0.0, (t - 0.55) / 0.45) ** 2)
                # A FLOOR everywhere but the edge row. Thinned too far, a flat
                # facet spans a crease in the skull — the ridge up the forehead,
                # the seam down the back — and the skull pokes through it: a white
                # tab above the brow and three holes down the back of the head.
                floor = inset + 0.003 if i == rows else 0.022
                ring_o.append(bm.verts.new(p + push * max(floor, thickness(a, t) * thin)))
                ring_i.append(bm.verts.new(p + push * inset))
            outer.append(ring_o)
            inner.append(ring_i)
        pole_d = head.direction(0.0, math.pi / 2)
        pole_p, pole_n = head.surface(pole_d)
        pole_o = bm.verts.new(pole_p + pole_n * thickness(0.0, 0.0))
        pole_i = bm.verts.new(pole_p + pole_n * inset)
        for j in range(cols):
            k = (j + 1) % cols
            self.face([pole_o, outer[j][0], outer[k][0]])
            self.face([pole_i, inner[k][0], inner[j][0]])
            for i in range(rows):
                self.face([outer[j][i], outer[j][i + 1], outer[k][i + 1], outer[k][i]])
                self.face([inner[j][i], inner[k][i], inner[k][i + 1], inner[j][i + 1]])
            # The rim at the hairline, so the edge has a thickness and is not a sheet.
            self.face([outer[j][rows], inner[j][rows], inner[k][rows], outer[k][rows]])
        return outer

    def lock(self, head, path, width, depth, sides=4, shape="wedge", roll=0.0):
        """
        A tapered, faceted clump along a path — the shape of every lock in the
        Monk's beard. `shape` decides how the width runs: `wedge` swells then
        narrows to a point, `tail` starts full and narrows, `band` stays even.
        """
        bm = self.bm
        n = len(path)
        rings = []
        for i, p in enumerate(path):
            t = i / (n - 1)
            prev = path[max(0, i - 1)]
            nxt = path[min(n - 1, i + 1)]
            tangent = (nxt - prev).normalized()
            out = (p - head.centre)
            out = (out - tangent * out.dot(tangent)).normalized()
            side = tangent.cross(out).normalized()
            if roll:
                side, out = (side * math.cos(roll) + out * math.sin(roll)), (out * math.cos(roll) - side * math.sin(roll))
            if shape == "wedge":
                s = math.sin(math.pi * min(1.0, 0.15 + t * 0.85)) ** 0.7
            elif shape == "tail":
                s = (1.0 - t) ** 0.8
            elif shape == "clump":
                # Full for most of its length and blunt at the end: a lock of
                # hair has weight, and a needle-thin tip reads as a tine.
                s = (1.0 - t ** 1.8) ** 0.6
            else:
                s = 1.0
            if i == n - 1 and shape != "band":
                rings.append([bm.verts.new(p)])
                continue
            ring = []
            for k in range(sides):
                th = 2 * math.pi * k / sides
                ring.append(bm.verts.new(p + side * math.cos(th) * width * s + out * math.sin(th) * depth * s))
            rings.append(ring)
        first = rings[0]
        self.face(list(reversed(first)))
        for r0, r1 in zip(rings, rings[1:]):
            if len(r1) == 1:
                for k in range(sides):
                    self.face([r0[k], r0[(k + 1) % sides], r1[0]])
            else:
                for k in range(sides):
                    self.face([r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]])
        if len(rings[-1]) > 1:
            self.face(rings[-1])

    def finish(self, material):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        bmesh.ops.triangulate(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for poly in mesh.polygons:
            poly.use_smooth = False
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(material)
        return obj


def bezier(p0, p1, p2, steps):
    return [p0 * (1 - t) ** 2 + p1 * 2 * (1 - t) * t + p2 * t * t for t in (i / steps for i in range(steps + 1))]


def ridges(count, depth, flow=0.0):
    """Clump ridges running crown to hairline: a triangle wave round the head, bent by `flow`."""

    def f(a, t):
        phase = (a / (2 * math.pi)) * count + flow * t
        x = phase - math.floor(phase)
        return depth * (1 - abs(2 * x - 1))

    return f


# --- The styles ----------------------------------------------------------------------

def style_short(head, mat):
    """Close and tidy: a textured cap and a short broken fringe."""
    b = Builder("hair_short")
    h = head.height
    # Down to the nape at the back and low at the temples: the first cut stopped
    # high all round and left the back of the skull bare under a rim.
    line = hairline(head, front_z=head.lo.z + 0.80 * h, side_z=head.lo.z + 0.55 * h, back_z=head.lo.z + 0.22 * h)
    carve = ridges(11, 0.014, flow=0.6)
    b.cap(head, line, lambda a, t: 0.04 + carve(a, t) + 0.012 * math.cos(a) * (1 - t), jag=(22, 0.06))
    # Tufts lying back across the crown, so the top is a head of hair and not a dome.
    for k in range(9):
        a = -1.1 + k * 0.275
        e0 = math.radians(62 - 14 * abs(math.sin(k * 1.3)))
        start, n0 = head.surface(head.direction(a, e0))
        end, n1 = head.surface(head.direction(a * 1.15, e0 - 0.42))
        mid, nm = head.surface(head.direction(a * 1.07, e0 - 0.2))
        b.lock(head, bezier(start + n0 * 0.035, mid + nm * 0.06, end + n1 * 0.035, 4), 0.055, 0.02, shape="wedge")
    # A fringe of short clumps lying forward over the hairline.
    for k in range(-3, 4):
        a = k * 0.16
        e = line(a)
        start, _ = head.surface(head.direction(a, e + 0.28))
        mid, _ = head.surface(head.direction(a * 1.1, e + 0.08))
        tip, n = head.surface(head.direction(a * 1.15, e - 0.05))
        b.lock(head, bezier(start + n * 0.03, mid + n * 0.06, tip + n * 0.045, 6), 0.042, 0.018, shape="wedge")
    return b.finish(mat)


def style_long(head, mat):
    """Long and loose: a parted cap with falls past the jaw at the sides and back."""
    b = Builder("hair_long")
    h = head.height
    line = hairline(head, front_z=head.lo.z + 0.80 * h, side_z=head.lo.z + 0.58 * h, back_z=head.lo.z + 0.30 * h)
    carve = ridges(9, 0.02, flow=0.9)
    b.cap(head, line, lambda a, t: 0.05 + carve(a, t) + 0.015 * t, jag=(16, 0.05), fade=0.5)
    # A CURTAIN UNDER THE FALLS. Seen in the game from the camera's slightly
    # raised angle, separate clumps hung with bare neck between them and the
    # style read as tentacles. Real long hair is a sheet first; the clumps are
    # its texture. So a continuous skirt drops from the hairline round the sides
    # and back, flaring out, with a ragged hem, and the falls lie over it.
    skirt_cols = 26
    tops, bottoms = [], []
    for j in range(skirt_cols + 1):
        a = math.radians(62 + j * (236 / skirt_cols))
        e = line(a)
        p, n = head.surface(head.direction(a, e + 0.1))
        out = Vector((p.x, p.y - head.centre.y, 0)).normalized()
        length = (0.3 if abs(math.cos(a)) < 0.5 else 0.25) + 0.05 * (j % 2)
        tops.append(p + n * 0.045)
        bottoms.append(p + out * 0.05 + Vector((0, 0, -length)))
    bm = b.bm
    top_v = [bm.verts.new(v) for v in tops]
    mid_v = [bm.verts.new((t + bo) / 2 + (bo - t).cross(Vector((0, 0, 1))).normalized() * 0.0 + Vector((0, 0, 0)))
             for t, bo in zip(tops, bottoms)]
    bot_v = [bm.verts.new(v) for v in bottoms]
    for j in range(skirt_cols):
        b.face([top_v[j], mid_v[j], mid_v[j + 1], top_v[j + 1]])
        b.face([mid_v[j], bot_v[j], bot_v[j + 1], mid_v[j + 1]])
    # Falls: a few heavy clumps from the hairline round the sides and back,
    # swinging out then down — broad and overlapping, not a fringe of tines.
    count = 9
    for k in range(count):
        a = math.radians(60 + k * (240 / (count - 1)))
        e = line(a)
        root, n = head.surface(head.direction(a, e + 0.2))
        out = Vector((root.x, root.y - head.centre.y, 0)).normalized()
        length = 0.42 if abs(math.cos(a)) < 0.5 else 0.36
        # HANGING, not swinging out. With the falls pushed 0.14 away from the
        # head they rolled out from the cheeks and, from the front in the game,
        # the style read as a pair of earmuffs.
        p0 = root + n * 0.04
        p1 = root + out * 0.06 + Vector((0, 0, -length * 0.35))
        p2 = root + out * 0.045 + Vector((0, 0, -length))
        b.lock(head, bezier(p0, p1, p2, 5), 0.12, 0.05, shape="clump", roll=0.25 * math.sin(k * 1.7))
    # A side-swept fringe, parted off centre.
    for k in range(4):
        a = -0.15 + k * 0.17
        e = line(a)
        start, n = head.surface(head.direction(-0.1, e + 0.35))
        tip, n2 = head.surface(head.direction(a + 0.45, e - 0.1))
        mid = (start + tip) / 2 + n * 0.07
        b.lock(head, bezier(start + n * 0.04, mid, tip + n2 * 0.05, 7), 0.05, 0.02, shape="wedge")
    return b.finish(mat)


def style_ponytail(head, mat):
    """Pulled back tight and tied at the back of the crown, with a tail swinging down."""
    b = Builder("hair_ponytail")
    h = head.height
    line = hairline(head, front_z=head.lo.z + 0.80 * h, side_z=head.lo.z + 0.60 * h, back_z=head.lo.z + 0.40 * h)
    # Ridges that converge on the tie: many, shallow, pulled back.
    carve = ridges(13, 0.01, flow=0.0)
    b.cap(head, line, lambda a, t: 0.04 + carve(a, t), jag=(24, 0.04))
    tie_d = head.direction(math.pi, 0.3)
    tie, n = head.surface(tie_d)
    # Stood well off the skull: pressed against it, the tail read as a strip
    # painted down the back of the head.
    tie = tie + n * 0.08
    # A mound of gathered hair under the tie, so the tail grows out of the cap.
    root, rn = head.surface(tie_d)
    b.lock(head, [root + rn * 0.01, root + rn * 0.05, tie], 0.09, 0.07, sides=6, shape="band")
    # The band that gathers it.
    b.lock(head, [tie - n * 0.02, tie + n * 0.03], 0.075, 0.075, sides=8, shape="band")
    # The tail: heavy clumps from the tie, arcing out and swinging down.
    for k in range(4):
        spread = (k - 1.5) * 0.035
        side = Vector((spread, 0, 0))
        p0 = tie + n * 0.02 + side * 0.4
        p1 = tie + n * 0.26 + side + Vector((0, 0, -0.06))
        p2 = tie + n * 0.16 + side * 1.4 + Vector((0, 0, -0.52 - 0.05 * abs(k - 1.5)))
        b.lock(head, bezier(p0, p1, p2, 6), 0.085, 0.07, shape="clump", roll=spread * 5)
    return b.finish(mat)


def frame_at(head, point, normal):
    """Two directions lying flat on the head at a point, for arranging clumps round it."""
    helper = Vector((1, 0, 0)) if abs(normal.x) < 0.9 else Vector((0, 1, 0))
    t1 = normal.cross(helper).normalized()
    t2 = normal.cross(t1).normalized()
    return t1, t2


def style_bun(head, mat):
    """Pulled up tight into a knot at the back of the crown."""
    b = Builder("hair_bun")
    h = head.height
    line = hairline(head, front_z=head.lo.z + 0.80 * h, side_z=head.lo.z + 0.58 * h, back_z=head.lo.z + 0.34 * h)
    carve = ridges(14, 0.01)
    b.cap(head, line, lambda a, t: 0.04 + carve(a, t), jag=(24, 0.035))
    root, n = head.surface(head.direction(math.pi, 0.9))
    centre = root + n * 0.11
    t1, t2 = frame_at(head, centre, n)
    # FIVE BIG TWISTS, not seven small ones. The first knot was a crumple of
    # little facets, like a screwed-up sheet of paper; a knot of hair is a few
    # heavy strands wound round each other, and each one has to be big enough
    # to read as a strand at this size.
    for k in range(5):
        phi = k * 2 * math.pi / 5
        path = []
        for s in range(6):
            u = s / 5
            ang = phi + u * 2.2
            r = 0.13 * math.sin(math.pi * (0.25 + u * 0.75))
            path.append(centre + (t1 * math.cos(ang) + t2 * math.sin(ang)) * r + n * (-0.08 + u * 0.17))
        b.lock(head, path, 0.08, 0.065, shape="clump")
    # The band that holds it, where the knot meets the head.
    b.lock(head, [centre - n * 0.1, centre - n * 0.055], 0.1, 0.1, sides=8, shape="band")
    return b.finish(mat)


def style_mohawk(head, mat):
    """Bare at the sides, with a ridge of heavy clumps from the brow to the nape."""
    b = Builder("hair_mohawk")
    h = head.height
    front = elevation_at_z(head, 0.0, head.lo.z + 0.80 * h)
    back = elevation_at_z(head, math.pi, head.lo.z + 0.36 * h)

    def along(u):
        """A point on the centre line, over the top from the brow (0) to the nape (1)."""
        sweep = front + (math.pi - front - back) * u
        d = head.direction(0.0, sweep) if sweep <= math.pi / 2 else head.direction(math.pi, math.pi - sweep)
        return head.surface(d)

    # A CONTINUOUS STRIP OF HAIR FIRST. The first mohawk was a row of separate
    # spikes with bare skull between them, and read as a dinosaur's back rather
    # than a haircut. A mohawk is a band of hair; the fins grow out of it.
    strip = []
    for i in range(16):
        p, n = along(i / 15)
        strip.append(p + n * 0.035)
    b.lock(head, strip, 0.075, 0.045, sides=6, shape="band")

    # Fins that sweep back far enough to overlap the next one, so the crest
    # reads as one mass from the side and not as teeth.
    steps = 10
    for i in range(steps):
        u = 0.03 + 0.9 * i / (steps - 1)
        p, n = along(u)
        q, _ = along(min(1.0, u + 0.12))
        backward = (q - p).normalized()
        tall = 0.12 + 0.12 * math.sin(math.pi * min(1.0, 0.15 + u * 0.95))
        path = [
            p + n * 0.02,
            p + n * tall * 0.6 + backward * tall * 0.35,
            p + n * tall + backward * tall * 0.95,
        ]
        b.lock(head, path, 0.07, 0.085, shape="clump")
    return b.finish(mat)


def style_spiky(head, mat):
    """A thick cap thrown up into spikes over the crown, with a broken spiky fringe."""
    b = Builder("hair_spiky")
    h = head.height
    line = hairline(head, front_z=head.lo.z + 0.80 * h, side_z=head.lo.z + 0.58 * h, back_z=head.lo.z + 0.30 * h)
    carve = ridges(12, 0.012)
    b.cap(head, line, lambda a, t: 0.05 + carve(a, t), jag=(18, 0.05))
    # FEW AND BIG. The first pass scattered seventeen small spikes over a smooth
    # cap and it read as a crown of thorns. Spiky hair is a handful of heavy
    # clumps that ARE the silhouette — wide at the root, long, fanning up and
    # back from a point below the crown, and overlapping so the cap barely shows.
    fan_from = head.centre - Vector((0, 0, 0.25)) + Vector((0, 0.08, 0))
    # NO LOW RING. Photographed in the game, the lowest ring stuck out sideways
    # at one height all the way round and the style read as a crown. The spikes
    # stay on the top of the head, where hair stands up, and lean back.
    rings = [(math.radians(82), 4, 0.0), (math.radians(62), 7, 0.5), (math.radians(48), 5, 0.25)]
    for e, count, offset in rings:
        for k in range(count):
            a = (k + offset) * 2 * math.pi / count + 0.3
            p, n = head.surface(head.direction(a, e))
            out = (p - fan_from).normalized()
            # BLADES, NOT CRYSTALS. A square wedge swelling in the middle read as
            # quartz. A spike of hair is flat, fullest where it leaves the mass
            # and tapering to a point, and they all lean the same combed way.
            lean = (out * 0.4 + Vector((0, 0.6, 0.5))).normalized()
            length = 0.22 + 0.05 * math.sin(k * 2.1 + e * 5)
            path = [p - n * 0.03, p + n * 0.04 + lean * length * 0.4, p + lean * length + n * 0.03]
            b.lock(head, path, 0.11, 0.035, shape="tail", roll=0.25 * math.sin(k * 1.9))
    # The fringe: a few big points thrown forward over the brow.
    for k in range(-2, 3):
        a = k * 0.22
        e = line(a)
        start, n0 = head.surface(head.direction(a, e + 0.3))
        tip, n1 = head.surface(head.direction(a * 1.3, e - 0.1))
        mid = (start + tip) / 2 + n0 * 0.1
        b.lock(head, [start + n0 * 0.04, mid, tip + n1 * 0.08], 0.085, 0.04, shape="wedge")
    return b.finish(mat)


STYLES = {
    "short": style_short,
    "long": style_long,
    "ponytail": style_ponytail,
    "bun": style_bun,
    "mohawk": style_mohawk,
    "spiky": style_spiky,
}


# --- Previews ----------------------------------------------------------------------------

def preview_scene(body, head):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = 520
    scene.render.resolution_y = 520
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.16, 0.17, 0.2, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    key.data.energy = 3.2
    key.rotation_euler = (math.radians(50), 0, math.radians(-35))
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 1.0
    fill.rotation_euler = (math.radians(70), 0, math.radians(140))
    for o in (key, fill):
        bpy.context.collection.objects.link(o)
    # Head and neck only: in the bind pose the fists sit in front of the face.
    keep = body.vertex_groups.new(name="preview_keep")
    names = {"Head", "Neck"}
    idx = {body.vertex_groups[n].index for n in names if n in body.vertex_groups}
    for v in body.data.vertices:
        if any(g.group in idx and g.weight > 0.3 for g in v.groups):
            keep.add([v.index], 1.0, "REPLACE")
    mask = body.modifiers.new("preview_mask", "MASK")
    mask.vertex_group = "preview_keep"
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = head.height * 1.9
    scene.camera = cam
    return scene, cam


VIEWS = [
    ("front", 0.0, 0.08),
    ("three-quarter", 0.75, 0.15),
    ("side", 1.5708, 0.05),
    ("back", 3.1416, 0.12),
]


def render_sheet(scene, cam, head, name, out_dir):
    target = head.centre + Vector((0, 0, -0.12))
    paths = []
    for label, azimuth, lift in VIEWS:
        d = head.direction(azimuth, lift)
        cam.location = target + d * 4.0
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(out_dir, f"_{name}_{label}.png")
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    # Stitched into one sheet, so a style is judged from every side at once.
    import numpy as np
    tiles = []
    for p in paths:
        img = bpy.data.images.load(p)
        w, h = img.size
        tiles.append(np.array(img.pixels[:]).reshape(h, w, 4))
        bpy.data.images.remove(img)
        os.remove(p)
    sheet = np.concatenate(tiles, axis=1)
    h, w, _ = sheet.shape
    out = bpy.data.images.new(f"sheet_{name}", w, h, alpha=True)
    out.pixels = sheet.ravel()
    out.filepath_raw = os.path.join(out_dir, f"hair_{name}.png")
    out.file_format = "PNG"
    out.save()
    print(f"SHEET {out.filepath_raw}")


def export_style(obj, piece, path):
    """
    One hairstyle as a GLB whose vertices are in `Monk.001`'s LOCAL space.

    The game already has that frame: its `Monk001` is this object, parented to
    the Head bone with the same local coordinates. So the hair is baked into it
    here — world to the piece's local — and exported WITHOUT the Y-up flip, and
    the client hangs it beside the beard with the beard's own transform.
    """
    mesh = obj.data.copy()
    mesh.transform(piece.matrix_world.inverted() @ obj.matrix_world)
    baked = bpy.data.objects.new(f"{obj.name}_export", mesh)
    bpy.context.collection.objects.link(baked)
    bpy.ops.object.select_all(action="DESELECT")
    baked.select_set(True)
    bpy.context.view_layer.objects.active = baked
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=False,
        export_apply=True,
        export_normals=True,
        export_materials="NONE",
        export_animations=False,
    )
    bpy.data.objects.remove(baked)
    print(f"EXPORTED {path}")


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    export_dir = None
    if "--export" in args:
        at = args.index("--export")
        export_dir = os.path.abspath(args[at + 1])
        args = args[:at] + args[at + 2:]
    # ABSOLUTE, because Blender resolves a render path against the .blend (there
    # is none here), not against the shell's working directory — the first run
    # rendered every view somewhere else and then failed to find them.
    out_dir = os.path.abspath(args[0]) if args else os.path.join(ROOT, "tools/soak/shots/hair")
    wanted = [a for a in args[1:] if a in STYLES] or list(STYLES)
    os.makedirs(out_dir, exist_ok=True)

    body, piece = load_monk()
    head = Head(body, extras=[piece])
    print(f"HEAD centre {tuple(round(c, 3) for c in head.centre)} height {head.height:.3f}")
    mat = bpy.data.materials.new("hair")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.28, 0.17, 0.09, 1)
    bsdf.inputs["Roughness"].default_value = 0.85

    scene, cam = preview_scene(body, head)
    built = {}
    for name in wanted:
        head.misses = 0
        obj = STYLES[name](head, mat)
        built[name] = obj
        print(f"STYLE {name}: {len(obj.data.polygons)} triangles, {head.misses} rays missed the head")
    # The hairline on the bearings nearest the face, where a notch was seen.
    probe = hairline(head, front_z=head.lo.z + 0.80 * head.height, side_z=head.lo.z + 0.60 * head.height,
                     back_z=head.lo.z + 0.40 * head.height)
    cols = 32
    for j in (14, 15, 16, 17):
        a = -math.pi + (j + 0.5) * 2 * math.pi / cols
        p, _ = head.surface(head.direction(a, probe(a)))
        print(f"HAIRLINE column {j} azimuth {math.degrees(a):+.1f}: z {p.z:.3f} (target {head.lo.z + 0.80 * head.height:.3f})")
    for name, obj in built.items():
        for other in built.values():
            other.hide_render = other is not obj
        render_sheet(scene, cam, head, name, out_dir)
    if export_dir:
        os.makedirs(export_dir, exist_ok=True)
        for name, obj in built.items():
            export_style(obj, piece, os.path.join(export_dir, f"Hair_{name}.glb"))
    print("DONE")


main()
