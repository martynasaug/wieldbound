# THE ITEM KIT: A SMALL VOCABULARY OF SHAPES THAT READ AS FORGED, CARVED AND BOUND.
#
# Asked for: "Try making a system for item creation with blender ... No same
# model different color garbage like in the game right now." The review that
# prompted it counted fifty weapons on twenty-three downloaded models — five
# swords that are one sword, five maces that are one mallet — and sixty pieces
# of armour built from a handful of boxes.
#
# So every item is a RECIPE: a few lines in `weapons.py` calling the operations
# below, each building faceted low-poly geometry in the style of the Quaternius
# kits the rest of the world is made of. Blades are lofted through diamond
# cross-sections, so every edge catches light as a bevel. Grips and pommels are
# lathed octagons. Guards, axe heads and shields are 2D outlines extruded with a
# chamfer, so they have a raised face and not a slab edge.
#
# MATERIALS ARE NAMED FROM THE GAME'S VOCABULARY — Steel, DarkSteel, Wood,
# DarkBrown, Gold, Red — because `client/src/three/gear.ts` repaints a model by
# material NAME (`MATERIAL_ROLE`): metal, wood or accent, coloured by the item's
# palette and tinted by its rarity. A recipe decides what each part is made of;
# the game decides what colour that is.
#
# CONVENTIONS, which the game's grip fitting relies on: Z is up the weapon, the
# pommel sits at the bottom near z = 0, and a blade's flat faces look along Y.

import math

import bmesh
import bpy
from mathutils import Vector

# Colours for the Blender previews only. The game repaints by name.
PREVIEW_COLOURS = {
    "Steel": (0.6, 0.62, 0.66),
    "LightSteel": (0.82, 0.84, 0.88),
    "DarkSteel": (0.28, 0.3, 0.34),
    "Wood": (0.45, 0.29, 0.16),
    "DarkWood": (0.27, 0.17, 0.09),
    "DarkBrown": (0.2, 0.12, 0.07),
    "Gold": (0.86, 0.64, 0.22),
    "Red": (0.62, 0.08, 0.09),
    "LightBlue": (0.55, 0.85, 0.98),
    "Green": (0.22, 0.58, 0.26),
    "White": (0.9, 0.88, 0.82),
    "Black": (0.05, 0.05, 0.06),
}


BLADE_WIDTH = 1.6
BLADE_THICKNESS = 1.3


def material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    r, g, b = PREVIEW_COLOURS.get(name, (0.5, 0.5, 0.5))
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    metal = name in ("Steel", "LightSteel", "DarkSteel", "Gold")
    bsdf.inputs["Metallic"].default_value = 0.6 if metal else 0.0
    bsdf.inputs["Roughness"].default_value = 0.4 if metal else 0.8
    return mat


def V(x, y, z):
    return Vector((x, y, z))


class Model:
    """One item under construction: a single mesh, one material slot per material name."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.slots = []
        # WHERE THE FIST GOES, as (x, y, z) in the model's own space. Exported as a
        # glTF extra and read by `gear.ts`. Left as None the game uses the handle
        # convention: the handle's axis is x = y = 0 and the fist sits near the
        # butt — right for anything lathed round the origin. A bow's handle is on
        # its back, not at the origin, so it says so.
        self.grip = None
        # WHERE THIS PIECE HINGES, as (x, y, z) in the model's own space, for a
        # piece meant to SWING rather than sit still: each segment of a cape
        # hangs from the one above it. Exported as a glTF extra beside `grip`
        # and read by `gear.ts`, which builds the chain.
        self.pivot = None

    # --- plumbing ---------------------------------------------------------------

    def slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def face(self, verts, mat):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        f.material_index = self.slot(mat)
        return f

    def verts(self, points):
        return [self.bm.verts.new(p) for p in points]

    # --- lofting --------------------------------------------------------------------

    def loft(self, rings, mat, cap_start=True, cap_end=True, closed=True):
        """
        Skin a sequence of rings. A ring is a list of points, or a single point for
        a tip. Every ring of more than one point must have the same count.

        `closed` wraps the last column back to the first, which is right for
        anything turned the whole way round and WRONG for an arc: an open cap
        would get a quad stretched straight across its opening, sealing the very
        gap that makes it a cap rather than a bucket.
        """
        made = []
        for ring in rings:
            if isinstance(ring, Vector):
                made.append(self.verts([ring]))
            else:
                made.append(self.verts(ring))
        for a, b in zip(made, made[1:]):
            if len(a) == 1 and len(b) > 1:
                n = len(b)
                for k in range(n if closed else n - 1):
                    self.face([a[0], b[(k + 1) % n], b[k]], mat)
            elif len(b) == 1 and len(a) > 1:
                n = len(a)
                for k in range(n if closed else n - 1):
                    self.face([a[k], a[(k + 1) % n], b[0]], mat)
            else:
                n = len(a)
                for k in range(n if closed else n - 1):
                    self.face([a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]], mat)
        if cap_start and len(made[0]) > 2:
            self.face(list(reversed(made[0])), mat)
        if cap_end and len(made[-1]) > 2:
            self.face(made[-1], mat)

    def lathe(self, profile, mat, sides=8, centre=(0.0, 0.0), squash=(1.0, 1.0), turn=0.0, cap=True, axis="z", arc=1.0):
        """
        A turned part — grip, pommel, collar, shaft — from (radius, position) pairs.
        A radius of 0 closes to a point. Eight sides by default: round enough to
        read as turned, few enough to stay faceted.

        `axis` "z" turns it up the weapon (`centre` is x, y); "x" turns it across —
        a sledge's drum, a hammer's face — and then `centre` is y, z.
        """
        # ARC IS THE FRACTION OF THE CIRCLE TURNED, and a partial one is what makes
        # an open-fronted piece possible at all.
        #
        # Every helm built on this was a FULL revolution, so a skullcap could only
        # be lowered past the brow by also closing over the eyes — which is why
        # `cap` and `horned` stop at the crown and cover 37% and 17% of the head.
        # Measured at the game's own camera, a character is about sixty pixels
        # tall and those two read as a bare pale head with a smudge on top.
        #
        # An arc under 1 leaves a gap, centred opposite `turn`, so a cap can come
        # down to the nape and the ears and still have a face.
        span = 2 * math.pi * arc
        closed = arc >= 0.999
        steps = sides if closed else max(2, sides)
        rings = []
        for r, w in profile:
            if r <= 1e-6:
                rings.append(V(centre[0], centre[1], w) if axis == "z" else V(w, centre[0], centre[1]))
                continue
            ring = []
            for k in range(steps if closed else steps + 1):
                a = (
                    turn + span * k / sides + math.pi / sides
                    if closed
                    else turn + span * (k / steps) - span / 2
                )
                p, q = math.cos(a) * r * squash[0], math.sin(a) * r * squash[1]
                if axis == "z":
                    ring.append(V(centre[0] + p, centre[1] + q, w))
                else:
                    ring.append(V(w, centre[0] + p, centre[1] + q))
            rings.append(ring if axis == "z" else list(reversed(ring)))
        self.loft(rings, mat, cap_start=cap and closed, cap_end=cap and closed, closed=closed)

    def tube(self, path, radii, mat, sides=6, cap=True):
        """A faceted tube along a path — a scythe's bent snath, a bow's limb, a chain's run."""
        rings = []
        n = len(path)
        for i, p in enumerate(path):
            t = (path[min(n - 1, i + 1)] - path[max(0, i - 1)]).normalized()
            helper = V(0, 1, 0) if abs(t.y) < 0.9 else V(1, 0, 0)
            s = t.cross(helper).normalized()
            u = t.cross(s).normalized()
            r = radii[i] if isinstance(radii, (list, tuple)) else radii
            if r <= 1e-6:
                rings.append(p)
                continue
            rings.append([p + (s * math.cos(a) + u * math.sin(a)) * r
                          for a in (2 * math.pi * k / sides + math.pi / sides for k in range(sides))])
        self.loft(rings, mat, cap_start=cap, cap_end=cap)

    def box(self, centre, size, mat, taper=1.0):
        """A block, optionally narrowing towards its top (for lugs, wedges, pommel nuts)."""
        cx, cy, cz = centre
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        bottom = [V(cx - sx, cy - sy, cz - sz), V(cx + sx, cy - sy, cz - sz), V(cx + sx, cy + sy, cz - sz), V(cx - sx, cy + sy, cz - sz)]
        tx, ty = sx * taper, sy * taper
        top = [V(cx - tx, cy - ty, cz + sz), V(cx + tx, cy - ty, cz + sz), V(cx + tx, cy + ty, cz + sz), V(cx - tx, cy + ty, cz + sz)]
        self.loft([bottom, top], mat)

    # --- blades -----------------------------------------------------------------------

    def blade(self, stations, tip, mat, back_sharp=True, fuller=0.0):
        """
        A blade lofted through faceted cross-sections.

        `stations` is a list of (z, half_width_edge, half_width_back, half_thickness,
        x_offset): the edge is on +X, the back on -X. A sharp back gives a lozenge —
        a double-edged sword. A blunt back gives a thick spine — a falchion, a knife.
        `tip` is the point, as (x, z). `fuller` sinks the flat faces a little along
        the centre, which reads as a groove down the blade.
        """
        rings = []
        for z, we, wb, t, xo in stations:
            # CHUNKIER THAN A REAL BLADE, ON PURPOSE. The first sheet was twelve
            # needles: true-to-life widths vanish at the size a weapon is drawn
            # in the game, and the Quaternius kits everything else comes from are
            # stylised broad for exactly that reason.
            we, wb, t = we * BLADE_WIDTH, wb * BLADE_WIDTH, t * BLADE_THICKNESS
            front_mid = V(xo - (0 if back_sharp else wb * 0.35), t * (1 - fuller), z)
            back_mid = V(xo - (0 if back_sharp else wb * 0.35), -t * (1 - fuller), z)
            edge = V(xo + we, 0, z)
            if back_sharp:
                back = [V(xo - wb, 0, z)]
            else:
                back = [V(xo - wb, -t * 0.75, z), V(xo - wb, t * 0.75, z)][::-1]
                back = [V(xo - wb, t * 0.75, z), V(xo - wb, -t * 0.75, z)]
            ring = [edge, front_mid] + back + [back_mid]
            rings.append(ring)
        rings.append(V(tip[0], 0, tip[1]))
        self.loft(rings, mat, cap_start=True, cap_end=False)

    # --- flat shapes --------------------------------------------------------------------

    def slab(self, outline, thickness, mat, chamfer=0.0, y=0.0, plane="xz"):
        """
        A 2D outline extruded into a plate with a chamfered face — guards, axe
        heads, shield boards, spikes. `outline` is a list of (u, v) points; in the
        default "xz" plane u is X and v is Z and the plate is thick along Y.
        """
        pts = [Vector((u, v)) for u, v in outline]
        area = sum(pts[i].x * pts[(i + 1) % len(pts)].y - pts[(i + 1) % len(pts)].x * pts[i].y for i in range(len(pts)))
        if area < 0:
            pts.reverse()
        n = len(pts)
        inner = []
        for i in range(n):
            p, a, b = pts[i], pts[i - 1], pts[(i + 1) % n]
            e1 = (p - a).normalized()
            e2 = (b - p).normalized()
            n1 = Vector((-e1.y, e1.x))
            n2 = Vector((-e2.y, e2.x))
            bis = (n1 + n2)
            bis = bis.normalized() if bis.length > 1e-6 else n1
            scale = 1.0 / max(0.35, bis.dot(n1))
            inner.append(p + bis * chamfer * 0.8 * scale)

        def place(uv, depth):
            if plane == "xz":
                return V(uv.x, y + depth, uv.y)
            if plane == "yz":
                return V(y + depth, uv.x, uv.y)
            return V(uv.x, uv.y, y + depth)

        half = thickness / 2
        of = self.verts([place(p, half) for p in pts])
        ob = self.verts([place(p, -half) for p in pts])
        if chamfer > 0:
            inf = self.verts([place(p, half + chamfer * 0.6) for p in inner])
            inb = self.verts([place(p, -half - chamfer * 0.6) for p in inner])
        for i in range(n):
            j = (i + 1) % n
            self.face([of[i], ob[i], ob[j], of[j]], mat)
            if chamfer > 0:
                self.face([of[i], of[j], inf[j], inf[i]], mat)
                self.face([ob[j], ob[i], inb[i], inb[j]], mat)
        if chamfer > 0:
            self.face(inf, mat)
            self.face(list(reversed(inb)), mat)
        else:
            self.face(of, mat)
            self.face(list(reversed(ob)), mat)

    # --- accents -----------------------------------------------------------------------

    def shard(self, base, direction, length, width, mat, sides=4, roll=0.0):
        """A crystal or spike: a faceted cone from `base` along `direction`."""
        d = direction.normalized()
        helper = V(0, 1, 0) if abs(d.y) < 0.9 else V(1, 0, 0)
        s = d.cross(helper).normalized()
        u = d.cross(s).normalized()
        ring = []
        for k in range(sides):
            a = roll + 2 * math.pi * k / sides
            ring.append(base + (s * math.cos(a) + u * math.sin(a)) * width)
        mid = [base + d * length * 0.3 + (p - base) * 1.15 for p in ring]
        self.loft([ring, mid, base + d * length], mat, cap_start=True, cap_end=False)

    def torus(self, centre, normal, radius, tube, mat, segments=10, sides=4):
        """A ring — for quillon terminals, bands, sword knots."""
        n = normal.normalized()
        helper = V(0, 0, 1) if abs(n.z) < 0.9 else V(1, 0, 0)
        a1 = n.cross(helper).normalized()
        a2 = n.cross(a1).normalized()
        rings = []
        for i in range(segments):
            t = 2 * math.pi * i / segments
            c = centre + (a1 * math.cos(t) + a2 * math.sin(t)) * radius
            out = (c - centre).normalized()
            ring = []
            for k in range(sides):
                s = 2 * math.pi * k / sides + math.pi / sides
                ring.append(c + (out * math.cos(s) + n * math.sin(s)) * tube)
            rings.append(self.verts(ring))
        for i in range(segments):
            a, b = rings[i], rings[(i + 1) % segments]
            for k in range(sides):
                self.face([a[k], b[k], b[(k + 1) % sides], a[(k + 1) % sides]], mat)

    def wrap(self, z0, z1, radius, mat_grip, mat_band, bands=4, sides=8):
        """A bound grip: the handle, and raised bands of cord or leather round it."""
        self.lathe([(radius, z0), (radius, z1)], mat_grip, sides=sides)
        step = (z1 - z0) / bands
        for i in range(bands):
            zc = z0 + step * (i + 0.5)
            h = step * 0.35
            self.lathe([(radius * 1.12, zc - h), (radius * 1.18, zc), (radius * 1.12, zc + h)], mat_band, sides=sides)

    # --- finishing ---------------------------------------------------------------------

    def finish(self):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        for poly in mesh.polygons:
            poly.use_smooth = False
        obj = bpy.data.objects.new(self.name, mesh)
        if self.grip is not None:
            obj["grip"] = [float(v) for v in self.grip]
        if self.pivot is not None:
            obj["pivot"] = [float(v) for v in self.pivot]
        bpy.context.collection.objects.link(obj)
        for name in self.slots:
            obj.data.materials.append(material(name))
        return obj


# --- baked depth -------------------------------------------------------------------

def bake_occlusion(obj, samples=24, reach=None, floor=0.42):
    """
    Bake ambient occlusion into a vertex colour, so an item has painted depth.

    WHY THIS EXISTS. `tools/art/bench.py` stands our items beside the pack's and
    the difference is not silhouette and not triangle count: every reference item
    is PAINTED — value running down a blade, dark in the recesses of a pauldron,
    a seam on a pouch — and ours are flat palette colours on bare geometry. That
    is the single biggest gap, and it is a missing capability rather than a
    missing effort.

    VALUE, NOT COLOUR, AND THAT IS THE WHOLE DESIGN. `gear.ts` repaints every
    item by material NAME from its palette: that is what gives a Frostbrand its
    ice and a Gilded Blade its gold, and baking colour into a texture would throw
    it away. Occlusion is a multiplier on lightness, so it survives the repaint —
    a Frostbrand comes out ice with dark creases, which is what the reference
    does.

    NO UVs AND NO ATLAS. A colour attribute rides inside the GLB, needs no second
    file, no unwrap, and no atlas budget to manage. At these triangle counts the
    gradient is coarse, which is correct: this pack's own shading is coarse.

    `floor` is how dark a fully buried vertex may go. Occlusion that reaches zero
    reads as dirt rather than as depth, and on a small object seen at ninety
    pixels it just looks like the item has a hole in it.
    """
    import mathutils
    from mathutils.bvhtree import BVHTree

    me = obj.data
    me.calc_loop_triangles()
    verts = [v.co.copy() for v in me.vertices]
    tris = [tuple(t.vertices) for t in me.loop_triangles]
    if not tris:
        return None
    tree = BVHTree.FromPolygons(verts, tris, all_triangles=True)

    size = max(me.dimensions) if hasattr(me, "dimensions") else 1.0
    if reach is None:
        # Occlusion is a LOCAL effect: how enclosed a point is by what is beside
        # it. A ray long enough to cross the whole item makes a sword's tip
        # "occluded" by its own pommel, and the blade goes uniformly grey.
        reach = max(size * 0.22, 1e-4)

    # A fixed spiral over the hemisphere rather than random directions: the same
    # item baked twice should be the same item, and random sampling at 24 rays
    # speckles a flat face with noise that reads as damage.
    directions = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(samples):
        z = 1.0 - (i + 0.5) * 2.0 / samples
        r = math.sqrt(max(0.0, 1.0 - z * z))
        a = golden * i
        directions.append(mathutils.Vector((math.cos(a) * r, math.sin(a) * r, z)))

    normals = [v.normal.copy() for v in me.vertices]
    shade = []
    for i, co in enumerate(verts):
        n = normals[i]
        origin = co + n * (size * 1e-3)
        hits = 0
        used = 0
        for d in directions:
            if d.dot(n) <= 0.0:
                continue
            used += 1
            hit = tree.ray_cast(origin, d, reach)
            if hit[0] is not None:
                hits += 1
        openness = 1.0 - (hits / used if used else 0.0)
        shade.append(floor + (1.0 - floor) * openness)

    layer = me.color_attributes.new(name="AO", type="FLOAT_COLOR", domain="POINT")
    for i, s in enumerate(shade):
        layer.data[i].color = (s, s, s, 1.0)
    return layer
