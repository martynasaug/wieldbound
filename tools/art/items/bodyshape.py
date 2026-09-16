# THE SHAPE OF THE BODY THE ARMOUR IS WORN ON.
#
# Reported twice in one breath, and the two complaints have one cause: "there's
# still a lot of skin showing on the legs, hips, butt, arms" and "I don't like
# this barrel style armour, make it better."
#
# EVERY PROCEDURAL PIECE IN THIS PROJECT WAS A LATHE — a circle turned about an
# axis. A circle can only clear a body by being larger than that body's WIDEST
# point, so the only way to stop the character showing through is to inflate it
# until it is a barrel. Those are not two problems to trade off against each
# other. They are the same problem, and the lathe is it.
#
# The garment styles never had it. `garments.py` takes a character's own skinned
# surface and pushes it out along its normals, so it follows the body exactly
# and is a body shape rather than a tube. This does the same for the procedural
# styles: it measures the WEARER's own surface and hands back, for any station
# along a limb and any direction round it, how far the body reaches there.
#
# A shell built on those radii follows the figure — narrow at the waist, full at
# the ribs, flat across the shin — and clears it everywhere BY CONSTRUCTION,
# because the radius IS the body's radius plus the clearance. There is nothing
# left to trade: the piece is as close as the clearance says, everywhere, and
# never inside it.
#
# IT RAYCASTS THE SURFACE; IT DOES NOT LOOK AT VERTICES. The first version of
# this file measured the body's vertices and it could not work: this body has
# SEVENTEEN vertices on the whole torso and sixteen on the whole abdomen, so a
# cross-section at any one height has four or five points in it and a ring drawn
# through them describes where the vertices happen to be, not where the body is.
# A ray fired at the mesh answers for the surface between the vertices too,
# which is the half of the body the armour was sinking into.
#
# THE WEDGE IS THE OTHER HALF. A ring of twelve points is a POLYGON, and a
# polygon through twelve samples of a curve cuts every corner between them —
# that is the `LIMB_SIDES` lesson, already paid for once. So a facet is not
# sized by one ray down its middle: it is sized by the furthest the body reaches
# anywhere in the wedge that facet has to span, each sample pushed out onto the
# facet's chord. A facet cut that way contains its wedge outright.
#
# UNITS AND AXES ARE THE MESH FRAME — what `armour.mesh()` converts into, and
# what the FBX imports as: x across, y AWAY from the face, z up. Distances are
# on the `BODY` table's ruler, where the head box runs 206..295, so a number
# from here can be compared with `BODY["chest_half_x"]` or handed to a recipe
# as it stands. A centre `(x, y)` here is a centre `(x, y)` for `kit.lathe`.

import math
import os
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import register  # noqa: E402

MODELS = "client/public/models"

# The `BODY` table's head landmarks, which fix the ruler.
HEAD_Y0, HEAD_Y1 = 206.0, 295.0

# HOW FAR OUTSIDE THE LIMIT A RAY STARTS. It has to begin in clear air or the
# first surface it meets on the way in is the wrong side of something, and the
# whole body is under forty units from any axis a piece is turned about.
BEYOND = 40.0

_state = {}


def _load():
    """The wearer's surface as a BVH tree, on the `BODY` ruler. Loaded once."""
    if _state:
        return _state

    # A SEPARATE IMPORT INTO THE LIVE FILE, because the caller is mid-build with
    # its own objects in the scene and `read_factory_settings` would throw them
    # away. Everything this adds is removed again before it returns.
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(
        filepath=os.path.join(os.getcwd(), MODELS, register.WEARER))
    added = [o for o in bpy.data.objects if o not in before]

    try:
        body = None
        for obj in added:
            if obj.type == "MESH" and obj.vertex_groups and (
                body is None or len(obj.data.vertices) > len(body.data.vertices)
            ):
                body = obj
        if body is None:
            raise RuntimeError(f"{register.WEARER} has no skinned mesh")

        groups = {g.index: g.name.replace(".", "") for g in body.vertex_groups}
        mw = body.matrix_world
        world = [mw @ v.co for v in body.data.vertices]

        bone_of = {}
        for i, v in enumerate(body.data.vertices):
            if v.groups:
                bone_of[i] = groups[max(v.groups, key=lambda g: g.weight).group]

        # THE RULER, off this body's own skull, as `body_profile.py` sets it.
        skull = [world[i] for i, b in bone_of.items() if b == "Head"]
        if len(skull) < 8:
            raise RuntimeError(f"{register.WEARER} has no skull to measure against")
        lo, hi = min(p.z for p in skull), max(p.z for p in skull)
        scale = (HEAD_Y1 - HEAD_Y0) / (hi - lo)

        # THE FRAME IS THE MODEL'S OWN, NOT A RECENTRED ONE. The first version of
        # this centred x and y on the spine's bounding box, which moved the whole
        # body eight units forward of where `armour.mesh()` puts it — and a
        # measurement in the wrong frame is worse than no measurement, because
        # every piece built on it is confidently, uniformly wrong. The recipes'
        # rest frame is the FBX's own: x = 0 down the middle, z = 0 at the face
        # side of nothing in particular, scaled by a hundred. Only HEIGHT is
        # anchored, to the skull, because that is what the `BODY` table's 206 is.
        def onto(p):
            return Vector((
                p.x * scale,
                p.y * scale,
                HEAD_Y0 + (p.z - lo) * scale,
            ))

        _state["verts"] = [tuple(onto(p)) for p in world]
        _state["polys"] = [tuple(f.vertices) for f in body.data.polygons]
        _state["owner"] = bone_of
        _state["trees"] = {}
        _state["bones"] = {}
        for i, b in bone_of.items():
            _state["bones"].setdefault(b, []).append(Vector(_state["verts"][i]))
    finally:
        for obj in added:
            bpy.data.objects.remove(obj, do_unlink=True)
    return _state


def bones(names):
    """Every vertex the named bones own, on the ruler. For axes and extents."""
    out = []
    for n in names:
        out.extend(_load()["bones"].get(n, []))
    return out


def span(names, run="z"):
    """How far along `run` the named bones reach: (lo, hi), or None."""
    pts = bones(names)
    if not pts:
        return None
    k = {"x": 0, "y": 1, "z": 2}[run]
    return min(p[k] for p in pts), max(p[k] for p in pts)


def _frame(run):
    """(station axis, the two axes across it), as indices into a mesh point."""
    return {"z": (2, 0, 1), "x": (0, 1, 2)}[run]


# WHOLE REGIONS A MEASUREMENT HAS TO BE ABLE TO LEAVE OUT, by bone-name prefix.
#
# THE BODY IS BOUND IN A T-POSE, and that is not a detail — it decides whether
# this file works at all. A ray fired sideways out of the chest at rib height
# never reaches the chest's own surface: the arm is hanging in the way, so the
# ray exits through the BICEP and reports a half-width of forty-three where the
# torso is twenty. A breastplate built on that answer is a barrel again, which
# is exactly the complaint, arrived at from the opposite direction.
#
# So a torso piece measures the body with the arms taken out of the mesh, and a
# pauldron — which covers the shoulder AND the arm — measures it with them in.
ARMS = ("UpperArm", "LowerArm", "Fist", "Thumb", "Hand")
LEGS = ("UpperLeg", "LowerLeg", "Foot", "Toe")


def _tree(exclude=()):
    """The surface as a BVH, with whole regions left out. Built once per set."""
    state = _load()
    key = tuple(sorted(exclude))
    if key in state["trees"]:
        return state["trees"][key]
    polys = state["polys"]
    if key:
        owner = state["owner"]

        def dropped(i):
            b = owner.get(i, "")
            return any(b.startswith(pre) for pre in key)

        # BY MAJORITY, not by any vertex: a face at the armpit is shared, and
        # dropping every face that touches an arm opens a hole in the chest that
        # the next ray escapes through.
        polys = [f for f in polys if sum(dropped(i) for i in f) * 2 <= len(f)]
    tree = BVHTree.FromPolygons(state["verts"], polys, all_triangles=False)
    state["trees"][key] = tree
    return tree


def _shoot(origin, direction, limit, exclude=()):
    """
    How far the OUTERMOST surface is along a ray, or None if there is none
    within `limit`.

    FIRED INWARD FROM OUTSIDE, NOT OUTWARD FROM THE AXIS, and the difference is
    not a refinement. This body is 562 faces and some of them are inside it: the
    forearm carries a face straight across its own middle, so a ray fired out
    from the arm's axis hits that septum four hundredths of a unit from where it
    started and reports a forearm with a radius of nothing. Every direction
    where that happened came back as a sleeve collapsed onto the bone.

    Coming the other way there is no such trap. The first surface a ray meets on
    its way in from outside is the surface the armour has to clear, whatever is
    behind it — which is the definition of the thing being measured.
    """
    far = limit + BEYOND
    out = origin + direction * far
    hit = _tree(exclude).ray_cast(out, -direction, far)
    if hit[0] is None:
        return None
    reach = far - hit[3]
    # Beyond the limit it is some OTHER part of the body -- the far hip, the
    # other leg -- and this direction counts as unmeasured.
    return None if reach > limit else max(0.0, reach)


def ring(at, centre, angles, wedge, run="z", clear=0.0, band=0.0,
         limit=48.0, floor=None, rays=5, recentre=False, exclude=()):
    """
    ONE RING THAT CONTAINS THE BODY, one radius per angle in `angles`.

    `at` is the station along `run` — "z" for anything standing up the body, "x"
    for a T-posed arm — and `centre` the two coordinates across it, the same
    pair `kit.lathe` takes. `wedge` is how far either side of its own angle a
    facet has to cover, and `band` the same along the run, for a shell whose
    next station is some way off. The angles come from the caller rather than a
    count because an ARC is spaced differently from a full turn and both have to
    come out of here containing the body.

    Every radius is the body's own reach plus `clear`, never below `floor` (one
    per angle, or None). Rays that find nothing inside `limit` — which is what
    happens when a ray fired sideways out of the chest runs down a T-posed arm
    instead, or inward out of a thigh crosses the pelvis — are filled in from
    the neighbours that did measure, so one stray direction can neither collapse
    the ring nor blow it out to an arm's length.
    """
    k, a0, a1 = _frame(run)

    def cast(c, angle, station):
        origin = [0.0, 0.0, 0.0]
        origin[k] = station
        origin[a0] = c[0]
        origin[a1] = c[1]
        d = [0.0, 0.0, 0.0]
        d[a0] = math.cos(angle)
        d[a1] = math.sin(angle)
        return _shoot(Vector(origin), Vector(d), limit, exclude)

    # RECENTRED ON THE LIMB, not on the bone the recipe guessed at. A ring hung
    # off a centre that is not the middle of the limb is slack on one side and
    # tight on the other, and it is the tight side the body comes through.
    if recentre:
        for _ in range(2):
            moved, n = [0.0, 0.0], 0
            for a in angles:
                d = cast(centre, a, at)
                if d is None:
                    continue
                moved[0] += centre[0] + math.cos(a) * d
                moved[1] += centre[1] + math.sin(a) * d
                n += 1
            if n < len(angles) // 2:
                break
            centre = (moved[0] / n, moved[1] / n)

    stations = [at] if band <= 0.0 else [at - band, at, at + band]
    raw = []
    for a in angles:
        best = None
        for j in range(rays):
            # Across the facet's own wedge, both ends included.
            off = -wedge + 2 * wedge * j / (rays - 1) if rays > 1 else 0.0
            for station in stations:
                d = cast(centre, a + off, station)
                if d is None:
                    continue
                # A FACET IS A CHORD, NOT AN ARC: a sample `off` round from the
                # middle of the facet is only cleared if the chord is pushed out
                # to d / cos(off). This is the `LIMB_SIDES` lesson, stated once
                # in arithmetic instead of paid for again in screenshots.
                need = d / math.cos(off)
                if best is None or need > best:
                    best = need
        raw.append(best)

    n = len(raw)
    if not any(r is not None for r in raw):
        return None
    for i in range(n):
        if raw[i] is not None:
            continue
        back = next((j for j in range(1, n) if raw[i - j] is not None), None)
        fwd = next((j for j in range(1, n) if raw[(i + j) % n] is not None), None)
        # An open arc does not wrap, so one side may have nothing at all.
        lo = raw[i - back] if back is not None else None
        hi = raw[(i + fwd) % n] if fwd is not None else None
        if lo is None or hi is None:
            raw[i] = lo if lo is not None else hi
        else:
            raw[i] = lo + (hi - lo) * back / (back + fwd)

    out = [r + clear for r in raw]
    if floor is not None:
        out = [max(r, f) for r, f in zip(out, floor)]
    return out, centre
