# FOUR PIECES OF GEAR, DESIGNED AGAINST THE REFERENCE RATHER THAN INVENTED.
#
#   blender --background --factory-startup --python tools/art/items/ideas.py
#
# Asked for: ideas of my own for armour, helmets, capes and boots, shown rather
# than described. These are proposals — they build and render, and nothing in the
# game equips them yet. Fitting a piece to the rig is `armour.py`'s job and a
# separate step; this is the sketch that comes before it.
#
# WHAT THE REFERENCE ACTUALLY DOES, from `tools/art/bench.py` standing the pack's
# items beside ours, and `style.py` measuring them:
#
#   IT IS NOT HARD-FACETED. Measured at 0.61 vertices per triangle, the pack's
#   items are mostly WELDED — smooth-shaded, with the low-poly read coming from
#   the silhouette and from painted texture rather than from visible facets.
#   `kit.Model.finish` sets `use_smooth = False` on every polygon, so everything
#   we build is hard-facetted; beside the reference that is the loudest single
#   difference, and it is the opposite of what `kit.py`'s own header assumes.
#
#   EVERY PIECE IS THREE MATERIALS, NOT ONE. A reference sword is a steel blade, a
#   RED guard, a wrapped leather grip and a gold pommel — four readable parts in
#   four colours on one small object. Ours are a steel blade and a grey guard, and
#   they read as unfinished next to it. The rule taken from that: no part of an
#   item should be the same colour as the part it touches.
#
#   THE FORMS ARE CHUNKY AND STACKED. The Warrior's pauldron is literally three
#   bands lying on each other; the pouch is a fat wedge with a seam. Nothing in
#   the reference is thin, and our blades are needles by comparison.
#
# So each piece below is built as stacked, chunky parts in contrasting materials,
# and SMOOTH-SHADED — `finish()` is overridden here rather than changed globally,
# because flipping it for the whole catalogue is a decision to take with the
# weapons in front of you, not a side effect of a sketch.

import os
import sys

import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kit import V, Model, material  # noqa: E402


def smooth(obj, angle=0.55):
    """
    Welded and smooth-shaded, the way the reference is.

    `remove_doubles` in `finish` has already welded the seams; this only turns the
    shading on. The angle keeps genuinely sharp edges sharp — a plate's rim should
    still be a rim — so the result is the reference's look rather than a melted
    one.
    """
    for poly in obj.data.polygons:
        poly.use_smooth = True
    # BY ANGLE, VIA THE OPERATOR, because `mesh.use_auto_smooth` no longer exists:
    # Blender 4.1 removed it and 5.x replaced it with a modifier the operator
    # applies. The first version of this guarded with `hasattr` and then assigned
    # anyway — `x = True if hasattr(...) else False` still runs the assignment —
    # so the guard read as careful and did nothing.
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=angle)
    except (AttributeError, RuntimeError):
        # Plain smooth is still closer to the reference than hard facets are.
        bpy.ops.object.shade_smooth()
    return obj


# --- helm ---------------------------------------------------------------------------

def vaultwarden_helm():
    """
    A closed skullcap with a raised crest and a nose bar.

    The pack's own `full` helm is a bucket, and the review that prompted
    `armour.py` said so. This keeps the head's shape — a dome that follows the
    skull — and puts the reading on three added parts: a crest ridge front to
    back, a gold browband, and a nose bar hanging from it. At the distance this
    game is played at those three are the whole silhouette.
    """
    m = Model("vaultwarden_helm")
    # The dome. Squashed slightly front-to-back so it is a head and not a ball.
    m.lathe(
        [(0.0, 19.0), (7.0, 17.5), (12.5, 12.0), (14.5, 4.0), (14.8, -4.0), (14.0, -8.0)],
        "Steel", sides=12, squash=(1.0, 1.12),
    )
    # Crest: a slab standing on the midline, front to back over the crown.
    m.slab(
        [(-13.0, 3.0), (-7.0, 17.0), (4.0, 20.0), (12.0, 15.0), (13.0, 6.0), (6.0, 12.0), (-6.0, 11.0)],
        thickness=2.6, mat="DarkSteel", plane="yz",
    )
    # Browband, and the nose bar hanging off it.
    m.torus(V(0, 0, -1.0), V(0, 0, 1), radius=14.6, tube=1.7, mat="Gold", segments=14, sides=5)
    m.box(V(0, 13.2, -7.0), V(3.2, 3.0, 12.0), "Gold", taper=0.7)
    return m


# --- pauldron -----------------------------------------------------------------------

def emberplate_pauldron():
    """
    Three lames over the shoulder, rivetted along the top.

    Taken straight from what the Warrior's pauldron is doing — bands lying on each
    other — but turned outward more sharply so the silhouette has a corner in it
    rather than a curve, and given a gold rivet line so the stack reads as three
    plates and not as one lumpy one.
    """
    m = Model("emberplate_pauldron")
    for i, (w, d, y, drop) in enumerate((
        (17.0, 15.0, 6.0, 0.0),
        (19.5, 16.5, 0.0, 1.4),
        (21.0, 17.5, -6.5, 3.0),
    )):
        m.lathe(
            [(w * 0.62, 4.0), (w, 0.0), (w * 0.96, -3.6)],
            "Steel" if i != 1 else "DarkSteel",
            sides=10, centre=(0.0, drop), squash=(1.0, d / w),
        )
        m.box(V(0, drop + w * 0.55, y + 1.0), V(2.2, 2.2, 2.2), "Gold")
    # A leather strap under the stack, so it is fastened to something.
    m.torus(V(0, 2.0, -9.5), V(0, 0, 1), radius=13.5, tube=2.2, mat="DarkBrown", segments=12, sides=4)
    return m


# --- cape ---------------------------------------------------------------------------

def wayfarer_mantle():
    """
    A yoke over the shoulders with a split drape hanging from it.

    `armour.py`'s note records all four capes drawing one drape. The idea here is
    that a cape is TWO things — the thing it hangs from and the cloth — and that
    the hanging part is what should differ between styles. This one is a heavy
    leather yoke, a gold throat clasp, and a drape that splits at the back so it
    reads as cloth rather than as a board.
    """
    m = Model("wayfarer_mantle")
    # Yoke: a thick collar sitting on the shoulders.
    m.lathe(
        [(18.0, 4.0), (20.0, 0.0), (19.0, -5.0)],
        "DarkBrown", sides=12, squash=(1.0, 0.82),
    )
    m.torus(V(0, 0, 2.0), V(0, 0, 1), radius=19.0, tube=2.0, mat="Gold", segments=14, sides=4)
    m.box(V(0, -16.0, 0.0), V(7.0, 4.0, 7.0), "Gold", taper=0.6)
    # Drape: two panels falling from the yoke, parted down the back.
    for side in (-1, 1):
        m.loft(
            [
                [V(side * 3.0, 12.0, -4.0), V(side * 17.0, 10.0, -4.0), V(side * 18.0, -2.0, -4.0), V(side * 4.0, -2.0, -4.0)],
                [V(side * 4.0, 18.0, -34.0), V(side * 23.0, 14.0, -32.0), V(side * 24.0, -4.0, -32.0), V(side * 5.0, -6.0, -34.0)],
                [V(side * 5.0, 20.0, -62.0), V(side * 26.0, 15.0, -58.0), V(side * 27.0, -6.0, -58.0), V(side * 6.0, -9.0, -62.0)],
            ],
            "Red",
        )
    return m


# --- boots --------------------------------------------------------------------------

def ridgeguard_boots():
    """
    A shin plate with a standing ridge, over a banded boot.

    The review found all four boot styles drawing one dark block. A boot is read
    almost entirely in silhouette from above — this game looks down at feet — so
    this puts the detail where it can be seen: a raised ridge up the shin, a gold
    ankle band, and a toe cap that catches the light from overhead.
    """
    m = Model("ridgeguard_boots")
    # Foot: a wedge, wider at the toe than the heel.
    m.loft(
        [
            [V(-6.5, -4.0, 0.0), V(6.5, -4.0, 0.0), V(6.5, 9.0, 0.0), V(-6.5, 9.0, 0.0)],
            [V(-7.5, -6.0, 5.0), V(7.5, -6.0, 5.0), V(8.0, 13.0, 5.0), V(-8.0, 13.0, 5.0)],
            [V(-7.0, -5.0, 10.5), V(7.0, -5.0, 10.5), V(7.0, 6.0, 10.5), V(-7.0, 6.0, 10.5)],
        ],
        "DarkBrown",
    )
    # Toe cap.
    m.slab(
        [(-7.6, 4.0), (7.6, 4.0), (6.6, 13.5), (-6.6, 13.5)],
        thickness=3.0, mat="LightSteel", plane="xy", y=4.0,
    )
    # Shin: a tapering tube up from the ankle, banded in gold.
    m.lathe(
        [(7.6, 10.0), (7.2, 18.0), (6.4, 30.0), (6.0, 38.0)],
        "DarkBrown", sides=10, squash=(1.0, 0.86),
    )
    m.torus(V(0, 0, 17.0), V(0, 0, 1), radius=7.6, tube=1.6, mat="Gold", segments=12, sides=4)
    # The ridge, standing off the front of the shin.
    m.slab(
        [(12.0, 12.0), (14.0, 22.0), (13.0, 36.0), (6.0, 36.0), (6.0, 12.0)],
        thickness=2.8, mat="Steel", plane="yz",
    )
    return m


IDEAS = (vaultwarden_helm, emberplate_pauldron, wayfarer_mantle, ridgeguard_boots)


def main():
    out_dir = os.path.join(os.getcwd(), "tools/soak/shots/ideas")
    os.makedirs(out_dir, exist_ok=True)
    for build in IDEAS:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        model = build()
        obj = model.finish()
        smooth(obj)
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            lo = Vector((min(lo[i], p[i]) for i in range(3)))
            hi = Vector((max(hi[i], p[i]) for i in range(3)))
        print(f"{obj.name}: {len(obj.data.polygons)} faces  size {[round(hi[i]-lo[i], 1) for i in range(3)]}")

        sc = bpy.context.scene
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.resolution_x, sc.render.resolution_y = 360, 440
        world = bpy.data.worlds.new("w")
        sc.world = world
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.43, 0.46, 1)
        key = bpy.data.lights.new("key", "SUN")
        key.energy = 3.6
        lamp = bpy.data.objects.new("key", key)
        sc.collection.objects.link(lamp)
        lamp.rotation_euler = (0.95, 0.05, 0.75)
        fill = bpy.data.lights.new("fill", "SUN")
        fill.energy = 1.1
        lamp2 = bpy.data.objects.new("fill", fill)
        sc.collection.objects.link(lamp2)
        lamp2.rotation_euler = (1.2, 0.0, -2.2)

        centre = (lo + hi) / 2
        span = max(max(hi - lo), 1e-4)
        cam_data = bpy.data.cameras.new("cam")
        cam = bpy.data.objects.new("cam", cam_data)
        sc.collection.objects.link(cam)
        sc.camera = cam
        d = Vector((0.75, -1.0, 0.45)).normalized() * (span * 1.6)
        cam.location = centre + d
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(out_dir, f"{obj.name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"WROTE {obj.name}.png")


main()
