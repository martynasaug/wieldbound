# WHAT THE PACK'S STYLE ACTUALLY IS, IN NUMBERS.
#
#   blender --background --factory-startup --python tools/art/style.py
#
# Asked for: the pack's outfits as the standard our own item art has to reach,
# and an instrument for producing art to it. `kit.py` is already the production
# half — a vocabulary of forged, lathed and chamfered shapes with recipes in
# `weapons.py` and `armour.py`. What has never existed is the other half: a way
# to tell whether what came out of it matches the reference.
#
# Every art failure this week was found by rendering and looking, and every one
# of them was cheap to find that way and expensive to find any other. But looking
# does not scale to sixty items, and "does this match the style" is not a
# judgement anyone can hold steady across a catalogue. So the reference is
# measured, and our items are measured the same way, and the difference is a
# table.
#
# THE FOUR THINGS THAT MAKE THIS STYLE, chosen because they are what the eye
# actually reads at the distance this game is played at:
#
#   BUDGET      triangles per item. The pack is low-poly on purpose; an item at
#               ten times the reference count is a different style however it is
#               shaded.
#   COARSENESS  triangles per unit of surface area. The count alone says nothing
#               without the size — a shoulder pad and a greatsword are both "low
#               poly" at very different totals.
#   FACETING    vertices per triangle. This pack is faceted, and a smooth-shaded
#               item beside it reads as plastic — the single most obvious way to
#               be wrong.
#
#               MEASURED AS SPLITNESS, NOT AS THE SMOOTH FLAG, and the first
#               version of this got it wrong in a way worth keeping. Every
#               reference item reported `faceted 0.00` — every face flagged
#               smooth — while every render of them is plainly faceted. The
#               facets do not come from the flag: they come from VERTICES NOT
#               BEING SHARED between neighbouring faces, so each triangle carries
#               its own normals and smooth shading has nothing to interpolate.
#               Welded geometry runs about 0.5-0.7 vertices per triangle; fully
#               split geometry approaches 3. A number that says "not faceted"
#               about art that visibly is would have sent the first person to use
#               this instrument off to flat-shade something that was already
#               right.
#   BULK        mesh volume over bounding-box volume. The pack's forms are chunky
#               and fill their box; a spindly item reads as a different game even
#               at a matching triangle count.
#
# No palette here on purpose: `gear.ts` repaints every item by material NAME from
# the item's own palette, so colour is the game's decision and not the model's.

import json
import math
import os
import sys

import bmesh
import bpy

MODELS = "client/public/models"

# THE REFERENCE. The pack's own items, which is what "looks like the pack" means:
# the fittings its characters wear and the weapons they carry. The costume bodies
# are deliberately NOT here — a whole skinned torso is a garment, not an item,
# and averaging it in would tell us an item should be 700 triangles.
REFERENCE = [
    ("Warrior.fbx", ("ShoulderPad.L", "ShoulderPad.R")),
    ("Ranger.fbx", ("ArmGuard.L", "ArmGuard.R", "Pouch", "Cloak")),
    ("Wizard.fbx", ("ShoulderPad.L", "ShoulderPad.R", "Pouch")),
    ("Warrior_Sword.fbx", None),
    ("Ranger_Bow.fbx", None),
    ("Wizard_Staff.fbx", None),
    ("Rogue_Dagger.fbx", None),
    ("Cleric_Staff.fbx", None),
]


def measure(obj):
    """The four style numbers for one mesh object, in its own world scale."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.faces.ensure_lookup_table()

    mat = obj.matrix_world
    tris = len(bm.faces)
    if not tris:
        bm.free()
        return None

    area = 0.0
    for f in bm.faces:
        vs = [mat @ v.co for v in f.verts]
        # Triangle area by the cross product, in world units, so an item that was
        # authored small and scaled up is measured at the size it is worn.
        area += (vs[1] - vs[0]).cross(vs[2] - vs[0]).length / 2

    # Signed volume by the divergence theorem. Negative for inverted winding,
    # which is a fact about the mesh rather than about the style, so it is taken
    # absolute.
    volume = 0.0
    for f in bm.faces:
        a, b, c = (mat @ v.co for v in f.verts)
        volume += a.dot(b.cross(c)) / 6
    volume = abs(volume)

    lo = [min((mat @ v.co)[i] for v in bm.verts) for i in range(3)]
    hi = [max((mat @ v.co)[i] for v in bm.verts) for i in range(3)]
    box = max((hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]), 1e-9)
    # Read BEFORE the free: a bmesh that has been released raises on any access,
    # and building the result dict afterwards reached into it for this one field.
    verts = len(bm.verts)
    bm.free()

    return {
        "tris": tris,
        "area": area,
        "coarseness": tris / area if area > 1e-9 else 0.0,
        "faceted": verts / tris,
        "bulk": min(volume / box, 1.0),
        "size": [round(hi[i] - lo[i], 3) for i in range(3)],
    }


def gather(path, names):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.lower().endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    out = []
    for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
        if names is not None and obj.name not in names:
            continue
        m = measure(obj)
        if m:
            m["name"] = obj.name
            out.append(m)
    return out


def summarise(rows, label):
    if not rows:
        print(f"{label}: nothing measured")
        return None
    def med(key):
        vals = sorted(r[key] for r in rows)
        n = len(vals)
        return vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2
    # MEDIAN, not mean: one 800-triangle staff among a dozen 40-triangle pads
    # would drag a mean somewhere no item actually sits.
    return {
        "label": label,
        "items": len(rows),
        "tris": med("tris"),
        "coarseness": med("coarseness"),
        "faceted": med("faceted"),
        "bulk": med("bulk"),
    }


def main():
    root = os.getcwd()
    rows = []
    for fn, names in REFERENCE:
        path = os.path.join(root, MODELS, fn)
        if not os.path.exists(path):
            print(f"missing {fn}")
            continue
        for m in gather(path, names):
            m["file"] = fn
            rows.append(m)

    print("")
    print(f"{'item':<22}{'file':<20}{'tris':>6}{'coarse':>9}{'faceted':>9}{'bulk':>7}  size")
    for m in sorted(rows, key=lambda r: r["tris"]):
        print(
            f"{m['name']:<22}{m['file']:<20}{m['tris']:>6}{m['coarseness']:>9.1f}"
            f"{m['faceted']:>9.2f}{m['bulk']:>7.2f}  {m['size']}"
        )

    spec = summarise(rows, "pack reference")
    if spec:
        print("")
        print(f"REFERENCE across {spec['items']} items — median triangles {spec['tris']:.0f}, "
              f"coarseness {spec['coarseness']:.1f} tris/unit^2, "
              f"faceted {spec['faceted']:.2f}, bulk {spec['bulk']:.2f}")
        out = os.path.join(root, "tools/art/style_spec.json")
        with open(out, "w", encoding="utf-8") as fh:
            json.dump({"reference": spec, "items": rows}, fh, indent=2)
        print(f"WROTE {out}")


main()
