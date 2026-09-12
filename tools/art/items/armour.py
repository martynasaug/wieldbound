# ARMOUR: SHAPES FITTED TO THIS BODY, NOT PRIMITIVES NEAR IT.
#
#   blender --background --factory-startup --python tools/art/items/armour.py -- ...
#   (normally through build.py: `--  armour` or a single style id)
#
# THE REVIEW THAT PROMPTED THIS, photographed one style at a time on the
# character (`tools/soak/armourstyles.mjs`): `scale` and `brigandine` are the
# same mesh as `plate`, all four capes are one drape because `capeParts` ignores
# its style argument, all four boots are the same dark block, the `full` helm is
# a featureless bucket, and `cap` and `circlet` are invisible under the hair.
# Nineteen declared styles drawing about eight shapes.
#
# Every style is its own model here, built from the same kit the weapons use and
# authored as a piece PER BONE — chest on the torso, skirt on the abdomen,
# pauldrons on the upper arms — so each piece moves with the part of the body it
# belongs to. `gear.ts` attaches them with the skeleton's own bind transform.
#
# COORDINATES ARE THE GAME'S REST FRAME, the readable one `gear.ts` already
# writes armour in: y up, z towards the face, a hundred units to the metre, and
# the body standing in its bind pose. Points are converted to the body's own
# mesh space (metres, z up) on the way out — see `mesh` below. The landmarks are
# measured off the Monk's own vertices per bone by `tools/art/body_frame.py`,
# not eyeballed, and they are what every number in this file is written against.

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kit import V, Model  # noqa: E402

U = 0.01


def mesh(x, y, z):
    """Rest frame (y up, z to the face) to the body's mesh space (z up, -y to the face)."""
    return V(x * U, -z * U, y * U)


# --- what armour has to fit -------------------------------------------------------------
# From `tools/art/body_frame.py`, per bone, in rest-frame units. Only the numbers
# a piece is actually cut against are named.
BODY = {
    # Torso: the ribs, from the belt to the collar.
    "chest_y0": 155.0, "chest_y1": 201.0, "chest_half_x": 17.0, "chest_front_z": 21.0, "chest_back_z": -26.0,
    # Abdomen: belly and hips.
    "waist_y0": 125.0, "waist_y1": 153.0, "waist_half_x": 24.0, "waist_front_z": 17.0, "waist_back_z": -36.0,
    # Shoulders and arms.
    "shoulder_x": 33.0, "shoulder_y": 187.0, "upperarm_x0": 34.0, "upperarm_x1": 67.0,
    "arm_y0": 173.0, "arm_y1": 201.0,
    # Neck and head.
    "neck_y": 200.0, "head_y0": 206.0, "head_y1": 295.0, "head_half_x": 33.0,
    "head_front_z": 33.0, "head_back_z": -48.0,
    # Legs and feet.
    "hip_y": 116.0, "knee_y": 61.0, "ankle_y": 10.0, "leg_x": 20.5,
    "foot_x0": 16.5, "foot_x1": 31.0, "foot_y1": 11.0, "foot_z0": -5.0, "foot_z1": 26.0,
}

BONE_CHEST = "Torso"
BONE_WAIST = "Abdomen"
BONE_ARM_L = "UpperArmL"
BONE_ARM_R = "UpperArmR"
BONE_HEAD = "Head"


class Armour:
    """One armour style: a `Model` per bone, in rest-frame coordinates."""

    def __init__(self, style):
        self.style = style
        self.models = {}

    def part(self, bone):
        if bone not in self.models:
            self.models[bone] = Model(bone)
        return self.models[bone]

    # --- the body's own shapes ----------------------------------------------------------

    def shell(self, bone, stations, mat, squash=None, sides=10, cap=True, x=0.0, z=0.0):
        """
        A tapered sleeve round the body's axis: a cuirass, a mail skirt, a collar.

        `stations` are (half_width, y) in rest units, and `squash` is how deep the
        body is against how wide — a torso is an oval, not a tube.
        """
        depth = (1.0, 0.82) if squash is None else squash
        self.part(bone).lathe(
            [(w * U, y * U) for w, y in stations], mat, sides=sides,
            centre=(x * U, -z * U), squash=depth, cap=cap, axis="z",
        )

    def plate(self, bone, outline, mat, z, thickness=5.0, chamfer=2.0):
        """A plate standing off the chest or back: an outline in (x, y), thick towards the face."""
        self.part(bone).slab(
            [(x * U, y * U) for x, y in outline], thickness * U, mat,
            chamfer=chamfer * U, y=-z * U, plane="xz",
        )

    def box(self, bone, centre, size, mat, taper=1.0):
        """A block, given (x, y, z) and (width, height, depth) in rest units."""
        x, y, z = centre
        w, h, d = size
        self.part(bone).box((x * U, -z * U, y * U), (w * U, d * U, h * U), mat, taper=taper)

    def band(self, bone, y, half_width, mat, tube=3.0, squash=None, sides=10, z=0.0, x=0.0):
        """A belt, a rivet line, the lip of a cuff."""
        depth = (1.0, 0.82) if squash is None else squash
        self.shell(bone, [(half_width, y - tube), (half_width + tube * 0.4, y), (half_width, y + tube)],
                   mat, squash=depth, sides=sides, cap=False, z=z, x=x)

    def hanging(self, stations, mat, lining=None, thickness=4.0, segments=3):
        """
        A cape, cut into segments that hang from one another.

        REPORTED: "Capes are too simple, some are barely visible, they don't even
        have the cape animation when walking." A cape modelled as one sheet
        welded to the torso can only ever be a board: there is nothing for the
        game to swing. So the fall is cut across into `segments` pieces, each
        named `Cape0`, `Cape1`… and each carrying the point it HINGES at — the
        middle of its top edge. `gear.ts` hangs them in a chain off the torso and
        `Actor` swings them with the character's own movement.

        `lining` is a second surface just inside the first, in another colour,
        so the inside of a cape is not the same flat sheet as the outside.
        """
        half = thickness / 2
        # One extra station per cut, interpolated, so a segment boundary never
        # lands between two shapes and pinches the fall.
        cuts = []
        for i in range(segments + 1):
            t = i / segments
            at = t * (len(stations) - 1)
            lo = min(int(at), len(stations) - 2)
            f = at - lo
            a, b = stations[lo], stations[lo + 1]
            cuts.append(tuple(a[k] + (b[k] - a[k]) * f for k in range(3)))

        for i in range(segments):
            top, bottom = cuts[i], cuts[i + 1]
            name = f"Cape{i}"
            model = self.part(name)
            # The hinge: the middle of this segment's top edge.
            model.pivot = mesh(0.0, top[1], top[2])
            # FLAT, AND SEAMLESS ACROSS THE CUTS. The curled eight-point section
            # this replaces gave the fall its own side faces, and photographed
            # running they lit up as bright rails down both edges with a hard
            # seam at every link — a stack of panels rather than a cape. A cape
            # at this scale is a sheet; what stops it reading as a signboard is
            # the TAPER and the swing, not extra geometry. Each segment starts
            # exactly where the one above ended, so no cut is visible.
            rings = []
            for w, y, z in (top, bottom):
                rings.append([mesh(-w, y, z - half), mesh(w, y, z - half),
                              mesh(w, y, z + half), mesh(-w, y, z + half)])
            model.loft(rings, mat, cap_start=False, cap_end=False)
            # NO LINING, and the parameter is ignored rather than removed so the
            # recipes keep reading as they did. It was a second sheet a
            # millimetre inside the first, and at this size the two never read as
            # inside and outside — they read as a bright fringe wherever the
            # edges disagreed, which is half of what made the fall look like a
            # plank with trim. A cape is one colour; the palette already tells it
            # apart from the body.

    def drape(self, bone, stations, mat, thickness=4.0):
        """
        A hanging sheet: (half_width, y, z) stations lofted from the shoulders down.

        A cape is not a plate. The first version was one flat quad standing thirty
        units off the back with square corners, and it read as a plank strapped to
        the character rather than as cloth — the same board in four styles, which
        is what this whole file is replacing. Stations let it start against the
        shoulders and swing out as it falls.
        """
        half = thickness / 2
        rings = []
        for w, y, z in stations:
            rings.append([mesh(-w, y, z - half), mesh(w, y, z - half),
                          mesh(w, y, z + half), mesh(-w, y, z + half)])
        self.part(bone).loft(rings, mat)

    def wrapped_ring(self, w, y, z, half, curl=0.42):
        """
        One cross-section of a hanging cloth: wide across the back, curling
        FORWARD at both edges so it sits round a body instead of behind one.

        A flat quad photographed from behind is a signboard on a hinge — square
        corners, a hard vertical edge standing clear of the shoulder, and no
        amount of swinging fixes it. Six points instead of four: the outer pair
        are pulled in and forward, which is what makes the silhouette read as
        cloth.
        """
        return [
            mesh(-w * 0.62, y, z - half - w * curl * 0.45),
            mesh(-w, y, z - half),
            mesh(w, y, z - half),
            mesh(w * 0.62, y, z - half - w * curl * 0.45),
            mesh(w * 0.62, y, z + half - w * curl * 0.45),
            mesh(w, y, z + half),
            mesh(-w, y, z + half),
            mesh(-w * 0.62, y, z + half - w * curl * 0.45),
        ]

    def stud(self, bone, at, direction, length, width, mat, sides=4):
        """A rivet, a spike, a scale's point."""
        x, y, z = at
        dx, dy, dz = direction
        self.part(bone).shard(mesh(x, y, z), V(dx, -dz, dy), length * U, width * U, mat, sides=sides)

    def finish(self):
        return [(name, m.finish()) for name, m in self.models.items()]


# --- what a worn surface may be made of -------------------------------------------------------
#
# THE PALETTE HAS TO REACH THE BIG SURFACES. `MATERIAL_LOOK` in gear.ts gives
# each kit material name a role, and three of them ignore the palette on
# purpose: `DarkBrown` is a fixed 0x3a281b, `White` a fixed 0xd9d0b8, `Black` a
# fixed 0x1d1c22. That is right for a sword — the grip wrap should stay leather
# whatever the blade is made of — and wrong for a garment, because the garment
# IS the item. Built from those names, a Warden's Jerkin in verdant measured
# 0.039 luma against a body at 0.21, and a Rimeward Robe could never be frost.
#
# So: the broad surfaces take palette-driven names, and the fixed ones are kept
# for small trim where a constant colour is the point.
# AND `wood` IS NOT A COLOUR EITHER. The first attempt at this sent garment
# surfaces to the palette's `wood` channel, which sounds right for leather and
# measured almost unchanged: every palette's wood is a dark brown — verdant
# 0x46351f, bronze 0x4e3520, obsidian 0x241d1a — so a Warden's Jerkin went from
# one near-black to another (0.039 to 0.042 luma). What carries a palette's
# identity is `metal` and `accent`: bronze's metal is a warm tan, verdant's a
# real green, bone's accent nearly white. Garments are cut from those, and the
# darker variant is the same colour at half strength rather than a different
# one.
CLOTH = "Steel"           # the palette's metal: its brightest, most identifying tone
CLOTH_TRIM = "Red"        # its accent
LEATHER = "Steel"         # a jerkin is the same palette, told apart by its SHAPE
LEATHER_TRIM = "DarkSteel"  # that colour at half strength, for straps and belts

# AND THE WORST PLACE TO SIT IS JUST BELOW THE SKIN. Measured against a stable
# reference at last, the three failures are all garments whose main surface
# lands a hair under the body's own value — iron 0.209, bronze 0.229 and 0.251
# against a body at 0.270 — which is precisely "merged with the body". The
# palette's ACCENT is the bright half of every palette (iron 0.559 against its
# metal 0.445, bronze 0.685 against 0.506), so the darker garments carry it over
# real area — panels and bands, not piping — instead of a few studs.
BRIGHT = "Red"            # the accent, used as a surface rather than as trim


# --- chest ----------------------------------------------------------------------------------
# Six, and no two share a silhouette: the whole reason this file exists.

def pauldrons(a, mat, span=23.0, drop=15.0, lip=True):
    """
    A plate over each shoulder, on the arm bone so it swings with the arm.

    MEASURED AGAINST THE SHOULDER, not guessed: the shoulder sits at x 33 and
    the first pass gave each pauldron a 26-unit radius — half a metre across on
    a body a metre and three quarters tall, which `armourprobe.mjs` read back as
    0.52m per shoulder. A pauldron covers the joint and a little of the arm.
    """
    for bone, side in ((BONE_ARM_L, 1), (BONE_ARM_R, -1)):
        x = side * (BODY["shoulder_x"] + 1.0)
        a.shell(bone, [(span * 0.6, BODY["shoulder_y"] + 8.0), (span, BODY["shoulder_y"] + 1.0),
                       (span * 0.94, BODY["shoulder_y"] - drop)], mat, squash=(1.0, 0.95), sides=8, x=x, z=-2.0)
        if lip:
            # On the SHOULDER, not on the body's axis: a band defaults to the
            # centre line, which for a pauldron is a ring round the chest.
            a.band(bone, BODY["shoulder_y"] - drop, span * 0.94, mat,
                   tube=2.0, squash=(1.0, 0.95), sides=8, x=x, z=-2.0)


# HOW FAR A PLATE STANDS OFF THE BODY.
#
# Reported: armour "is still barely visible, its merged with the body". The
# shells were cut to hug the ribs — 19 to 22 where the torso is 17 — which reads
# as a painted panel rather than a worn object, because at gameplay distance a
# garment is its SILHOUETTE before it is its colour. Real armour sits on
# padding: a cuirass stands off the chest, a pauldron stands off the shoulder,
# and both break the body's outline where they meet the arm.
PROUD = 5.0


def plate_chest(a):
    """Plate: a shaped cuirass with a keel down the breast, a gorget, and tassets."""
    # The ribs are 17 wide and 23 deep, centred a little behind the middle: a
    # cuirass stands just proud of that. The first pass used 30 and read as a
    # barrel with a character inside it; the second hugged so close it read as
    # paint. This one stands about three units off the body and carries the
    # shoulder line, which is what makes a cuirass a garment rather than a skin.
    a.shell(BONE_CHEST, [(19.0 + PROUD * 0.4, BODY["chest_y0"] - 6.0),
                         (22.0 + PROUD, BODY["chest_y0"] + 14.0),
                         (22.5 + PROUD, BODY["chest_y1"] - 14.0),
                         (20.0 + PROUD * 0.5, BODY["chest_y1"] + 7.0)],
            "Steel", squash=(1.0, 1.15), z=-3.0)
    # The keel: a raised ridge down the front, which is what makes a breastplate
    # read as forged rather than as a barrel.
    a.plate(BONE_CHEST, [(-3.5, BODY["chest_y0"] + 1.0), (3.5, BODY["chest_y0"] + 1.0),
                         (4.5, BODY["chest_y1"] - 7.0), (-4.5, BODY["chest_y1"] - 7.0)],
            "LightSteel", z=BODY["chest_front_z"] + 1.0, thickness=5.0)
    a.shell(BONE_CHEST, [(14.0, BODY["chest_y1"] + 1.0), (16.0, BODY["chest_y1"] + 7.0)],
            "DarkSteel", squash=(1.0, 1.05), sides=8, z=-3.0)
    a.shell(BONE_WAIST, [(22.0, BODY["waist_y1"] - 1.0), (24.0, BODY["waist_y1"] - 11.0)],
            "Steel", squash=(1.0, 1.0), z=-6.0)
    for side in (1, -1):
        a.box(BONE_WAIST, (side * 13.0, BODY["waist_y1"] - 24.0, -4.0), (18.0, 24.0, 26.0), "Steel", taper=0.85)
    pauldrons(a, "Steel")


def scale_chest(a):
    """Scale: overlapping rows of small plates, each row a little wider than the last."""
    a.shell(BONE_CHEST, [(17.0 + PROUD * 0.5, BODY["chest_y0"] - 3.0),
                         (20.0 + PROUD * 0.8, BODY["chest_y1"] - 8.0),
                         (17.0 + PROUD * 0.4, BODY["chest_y1"] + 3.0)],
            LEATHER, squash=(1.0, 1.15), z=-3.0)
    rows = 5
    for i in range(rows):
        y = BODY["chest_y0"] + 2.0 + i * (BODY["chest_y1"] - BODY["chest_y0"] - 6.0) / rows
        for k in range(9):
            angle = -math.pi * 0.62 + k * (math.pi * 1.24 / 8)
            x = math.sin(angle) * 19.0
            z = -3.0 + math.cos(angle) * 22.0
            # The scales in the ACCENT, not in the same metal as the coat under
            # them: drawn in one colour, a field of scales measures and reads as
            # one flat surface.
            # Bigger scales in the accent: a field of small studs the same value
            # as the coat under them measured as one flat surface at 0.229.
            a.stud(BONE_CHEST, (x, y, z), (math.sin(angle), -0.35, math.cos(angle)), 6.0, 6.5, BRIGHT, sides=4)
    a.band(BONE_CHEST, BODY["chest_y0"] - 1.0, 19.0, "DarkSteel", tube=2.5, squash=(1.0, 1.15), z=-3.0)
    # A BAND OF THE BRIGHT ACCENT ACROSS THE CHEST. Bronze scale measured 0.206
    # against a body at 0.186 — the same "just above the skin" value that reads
    # as merged — and a field of studs alone did not move it. The coat under the
    # scales carries the accent over real area instead.
    a.shell(BONE_CHEST, [(18.0 + PROUD * 0.5, BODY["chest_y0"] + 6.0),
                         (20.0 + PROUD * 0.8, BODY["chest_y1"] - 12.0)],
            BRIGHT, squash=(1.0, 1.15), z=-3.0)
    a.shell(BONE_WAIST, [(22.0, BODY["waist_y1"]), (25.0, BODY["waist_y1"] - 28.0)],
            LEATHER, squash=(1.0, 1.0), z=-6.0)
    for k in range(8):
        angle = -math.pi * 0.6 + k * (math.pi * 1.2 / 7)
        a.stud(BONE_WAIST, (math.sin(angle) * 23.0, BODY["waist_y1"] - 14.0, -6.0 + math.cos(angle) * 23.0),
               (math.sin(angle), -0.4, math.cos(angle)), 4.0, 4.0, CLOTH_TRIM, sides=4)
    pauldrons(a, "Steel", span=12.0, drop=9.0)


def brigandine_chest(a):
    """Brigandine: quilted cloth over plates, held by rows of rivets and two straps."""
    a.shell(BONE_CHEST, [(18.0 + PROUD * 0.4, BODY["chest_y0"] - 4.0),
                         (20.0 + PROUD * 0.9, BODY["chest_y0"] + 14.0),
                         (20.0 + PROUD * 0.9, BODY["chest_y1"] - 10.0),
                         (17.0 + PROUD * 0.4, BODY["chest_y1"] + 4.0)],
            "Red", squash=(1.0, 1.15), z=-3.0)
    for y in (BODY["chest_y0"] + 6.0, BODY["chest_y0"] + 22.0, BODY["chest_y1"] - 9.0):
        for k in range(7):
            angle = -math.pi * 0.5 + k * (math.pi / 6)
            a.stud(BONE_CHEST, (math.sin(angle) * 19.0, y, -3.0 + math.cos(angle) * 22.0),
                   (math.sin(angle), 0.0, math.cos(angle)), 2.0, 1.8, "DarkSteel", sides=5)
    for side in (1, -1):
        a.plate(BONE_CHEST, [(side * 5.0, BODY["chest_y1"] + 1.0), (side * 14.0, BODY["chest_y1"] - 3.0),
                             (side * 11.0, BODY["chest_y0"] + 4.0), (side * 3.0, BODY["chest_y0"] + 6.0)],
                LEATHER, z=BODY["chest_front_z"] + 1.0, thickness=3.5)
    a.band(BONE_CHEST, BODY["chest_y0"] - 2.0, 19.0, LEATHER_TRIM, tube=3.5, squash=(1.0, 1.15), z=-3.0)
    a.shell(BONE_WAIST, [(22.0, BODY["waist_y1"]), (23.0, BODY["waist_y1"] - 20.0)],
            "Red", squash=(1.0, 1.0), z=-6.0)
    pauldrons(a, LEATHER_TRIM, span=12.0, drop=8.0, lip=False)


def chain_chest(a):
    """Mail: a shirt that hangs, a collar that stands, and a skirt to the thigh."""
    a.shell(BONE_CHEST, [(17.0 + PROUD * 0.4, BODY["chest_y0"] - 6.0),
                         (20.0 + PROUD * 0.8, BODY["chest_y0"] + 12.0),
                         (20.0 + PROUD * 0.8, BODY["chest_y1"] - 10.0),
                         (16.0 + PROUD * 0.4, BODY["chest_y1"] + 6.0)],
            "Steel", squash=(1.0, 1.15), z=-3.0)
    # A standing collar, the piece that separates mail from a tabard at a glance.
    a.shell(BONE_CHEST, [(13.0, BODY["chest_y1"] + 3.0), (14.0, BODY["chest_y1"] + 12.0)],
            "Steel", squash=(1.0, 1.1), sides=8, z=-3.0)
    # Banding across the shirt reads as rings at this size — in the accent, so
    # the rings are visible against the mail rather than a darker shade of it.
    # Wide bands, not piping: iron's mail sits at 0.21 against a body at 0.27,
    # and a hairline of brighter metal does not change that.
    for y in (BODY["chest_y0"] + 4.0, BODY["chest_y0"] + 17.0, BODY["chest_y0"] + 30.0):
        a.band(BONE_CHEST, y, 20.0 + PROUD * 0.8, BRIGHT, tube=4.5, squash=(1.0, 1.15), z=-3.0)
    a.shell(BONE_WAIST, [(22.0, BODY["waist_y1"] + 2.0), (26.0, BODY["waist_y1"] - 32.0)],
            "Steel", squash=(1.0, 1.0), z=-6.0)
    a.band(BONE_WAIST, BODY["waist_y1"] - 32.0, 26.0, "DarkSteel", tube=2.0, squash=(1.0, 1.0), z=-6.0)
    # Short sleeves of mail rather than pauldrons: mail drapes, it does not plate.
    for bone, side in ((BONE_ARM_L, 1), (BONE_ARM_R, -1)):
        a.shell(bone, [(13.0, BODY["shoulder_y"] + 5.0), (12.0, BODY["shoulder_y"] - 15.0)],
                "Steel", squash=(1.0, 1.0), sides=8, x=side * (BODY["shoulder_x"] + 1.0), z=-2.0)


def leather_chest(a):
    """A jerkin: a short sleeveless coat, a wide belt, and a strap across the chest."""
    # Proud of the body and darker than its tunic: hugged at 17 it read as the
    # same torso in another shade.
    a.shell(BONE_CHEST, [(18.5 + PROUD * 0.35, BODY["chest_y0"] - 5.0),
                         (21.0 + PROUD * 0.7, BODY["chest_y0"] + 14.0),
                         (21.0 + PROUD * 0.7, BODY["chest_y1"] - 12.0),
                         (17.0 + PROUD * 0.35, BODY["chest_y1"] + 5.0)],
            LEATHER, squash=(1.0, 1.15), z=-3.0)
    # A broad panel of the palette's bright accent down the chest, so a jerkin
    # is not one mid-tone surface at the body's own value.
    a.plate(BONE_CHEST, [(-13.0, BODY["chest_y0"] - 2.0), (13.0, BODY["chest_y0"] - 2.0),
                         (11.0, BODY["chest_y1"] - 6.0), (-11.0, BODY["chest_y1"] - 6.0)],
            BRIGHT, z=BODY["chest_front_z"] + PROUD * 0.35, thickness=5.0)
    # The coat is open down the front, which is what makes it a jerkin.
    a.plate(BONE_CHEST, [(-2.5, BODY["chest_y0"] + 2.0), (2.5, BODY["chest_y0"] + 2.0),
                         (2.5, BODY["chest_y1"] - 7.0), (-2.5, BODY["chest_y1"] - 7.0)],
            "Wood", z=BODY["chest_front_z"] + 1.0, thickness=3.0)
    a.plate(BONE_CHEST, [(-16.0, BODY["chest_y1"] - 17.0), (-5.0, BODY["chest_y1"] + 1.0),
                         (-1.0, BODY["chest_y1"] - 5.0), (-13.0, BODY["chest_y1"] - 22.0)],
            "Wood", z=BODY["chest_front_z"] + 1.0, thickness=3.0)
    a.band(BONE_CHEST, BODY["chest_y0"] - 1.0, 19.0, "Wood", tube=4.0, squash=(1.0, 1.15), z=-3.0)
    a.box(BONE_CHEST, (0.0, BODY["chest_y0"] - 1.0, BODY["chest_front_z"] + 2.0), (8.0, 8.0, 4.0), "Gold")
    for bone, side in ((BONE_ARM_L, 1), (BONE_ARM_R, -1)):
        a.shell(bone, [(11.0, BODY["shoulder_y"] + 4.0), (10.0, BODY["shoulder_y"] - 8.0)],
                LEATHER_TRIM, squash=(1.0, 1.0), sides=8, x=side * (BODY["shoulder_x"] + 1.0), z=-2.0)


def robe_chest(a):
    """A robe: a long fall of cloth from the shoulders, a sash, and soft shoulder folds."""
    a.shell(BONE_CHEST, [(17.0 + PROUD * 0.3, BODY["chest_y0"] - 3.0),
                         (19.0 + PROUD * 0.6, BODY["chest_y0"] + 16.0),
                         (19.0 + PROUD * 0.6, BODY["chest_y1"] - 10.0),
                         (15.0 + PROUD * 0.3, BODY["chest_y1"] + 8.0)],
            CLOTH, squash=(1.0, 1.15), z=-3.0)
    # The skirt falls from the waist and widens to the knee: the robe's whole shape.
    a.shell(BONE_WAIST, [(22.0, BODY["waist_y1"] + 2.0), (25.0, BODY["waist_y1"] - 20.0),
                         (29.0, BODY["waist_y1"] - 58.0), (27.0, BODY["waist_y1"] - 76.0)],
            CLOTH, squash=(1.0, 1.0), z=-6.0)
    # A ROBE IS ONE UNBROKEN SURFACE, and measured against the body it sat
    # within a hundredth of it: 0.138 against 0.127. Shape cannot fix that —
    # a placket down the front and a collar in the accent can, and they are what
    # a robe has anyway.
    # A WIDE PLACKET AND A STOLE, not a ribbon. The robe measured 0.206 against
    # a body at 0.186: one unbroken surface at very nearly skin value, which is
    # the complaint exactly. The palette's accent runs the full height of the
    # chest and over both shoulders, which is what a robe of office looks like
    # and what makes it read at a distance.
    a.plate(BONE_CHEST, [(-11.0, BODY["chest_y0"] + 2.0), (11.0, BODY["chest_y0"] + 2.0),
                         (12.0, BODY["chest_y1"] - 2.0), (-12.0, BODY["chest_y1"] - 2.0)],
            BRIGHT, z=BODY["chest_front_z"] + PROUD * 0.3, thickness=5.0)
    for side in (1, -1):
        a.plate(BONE_CHEST, [(side * 8.0, BODY["chest_y1"] + 2.0), (side * 20.0, BODY["chest_y1"] - 2.0),
                             (side * 18.0, BODY["chest_y0"] + 10.0), (side * 7.0, BODY["chest_y0"] + 12.0)],
                BRIGHT, z=BODY["chest_front_z"] + PROUD * 0.25, thickness=4.0)
    a.shell(BONE_CHEST, [(17.0, BODY["chest_y1"] - 2.0), (19.0, BODY["chest_y1"] + 9.0)],
            CLOTH_TRIM, squash=(1.0, 1.15), sides=10, z=-3.0)
    a.band(BONE_WAIST, BODY["waist_y1"] - 4.0, 23.0, CLOTH_TRIM, tube=4.0, squash=(1.0, 1.0), z=-6.0)
    # A knot and two hanging ends, so the sash reads as tied.
    a.box(BONE_WAIST, (11.0, BODY["waist_y1"] - 6.0, BODY["waist_front_z"] + 2.0), (8.0, 8.0, 5.0), CLOTH_TRIM)
    a.box(BONE_WAIST, (11.0, BODY["waist_y1"] - 21.0, BODY["waist_front_z"] + 1.0), (5.0, 22.0, 3.5), CLOTH_TRIM)
    for bone, side in ((BONE_ARM_L, 1), (BONE_ARM_R, -1)):
        a.shell(bone, [(12.0, BODY["shoulder_y"] + 6.0), (13.0, BODY["shoulder_y"] - 10.0),
                       (11.0, BODY["shoulder_y"] - 19.0)],
                CLOTH, squash=(1.0, 1.0), sides=8, x=side * (BODY["shoulder_x"] + 1.0), z=-2.0)


CHEST = {
    "plate": plate_chest,
    "scale": scale_chest,
    "brigandine": brigandine_chest,
    "chain": chain_chest,
    "leather": leather_chest,
    "robe": robe_chest,
}


# --- head ------------------------------------------------------------------------------------
# The skull is 67 wide, 89 tall and 81 deep, centred about seven units behind the
# middle, and the face is on +z. A helm that ignores those numbers is the bucket
# this is replacing: the old `full` swallowed the head and showed nothing but a
# visor slit, and `cap` and `circlet` were lost under the hair entirely.

SKULL_Z = -7.0


# WHERE THE FACE IS. Photographed: a brow band at 252 sits across the EYES and
# reads as a blindfold on every head piece that has one. The skull runs 206 to
# 295 and the eyes are a little under halfway up it, so the brow is about 264
# and anything meant to be worn ON the head starts there. The first pass put
# every band, dome and rim ten to fifteen units too low.
BROW_Y = 264.0
CROWN_Y = 296.0


def skullcap(a, mat, y0=BROW_Y, y1=CROWN_Y, wide=35.0):
    """The dome every head piece except the hood is built on."""
    a.shell(BONE_HEAD, [(wide * 0.9, y0), (wide, y0 + 8.0), (wide * 0.9, y1 - 10.0), (wide * 0.6, y1)],
            mat, squash=(1.0, 1.16), z=SKULL_Z)


def cap_helm(a):
    """A skullcap: grips the crown, leaves the whole face alone, and has a brow band."""
    skullcap(a, "Steel")
    # THE BAND RIDES THE CAP, NOT THE FACE. At the brow line it still crossed
    # the eyes and read as a blindfold in every photograph — because the band is
    # a full ring and this face is flat, so its front edge lands on the eyes
    # however high the number says it is. It sits up on the dome now, where a
    # helmet's rim actually is, and the nasal is a short stub off it.
    a.band(BONE_HEAD, BROW_Y + 9.0, 35.0, "DarkSteel", tube=3.0, squash=(1.0, 1.16), z=SKULL_Z)
    a.plate(BONE_HEAD, [(-3.5, BROW_Y + 4.0), (3.5, BROW_Y + 4.0), (4.0, BROW_Y + 14.0), (-4.0, BROW_Y + 14.0)],
            "Steel", z=BODY["head_front_z"] - 2.0, thickness=4.0)


def full_helm(a):
    """A great helm: it closes over the face, and it has a comb and cheeks to show for it."""
    # Tapered at the jaw rather than square: a straight-sided shell over a head
    # this stylised is the bucket this style is being rescued from.
    a.shell(BONE_HEAD, [(26.0, 214.0), (33.0, 232.0), (36.0, BROW_Y), (34.0, 284.0), (22.0, CROWN_Y)],
            "Steel", squash=(1.0, 1.16), z=SKULL_Z)
    # The sight, at the eyes, where it belongs — this is the one band that should
    # be there — and a breath of slots under it.
    a.plate(BONE_HEAD, [(-22.0, 246.0), (22.0, 246.0), (22.0, 255.0), (-22.0, 255.0)],
            "Black", z=BODY["head_front_z"] + 1.0, thickness=7.0)
    for x in (-11.0, 0.0, 11.0):
        a.plate(BONE_HEAD, [(x - 3.0, 226.0), (x + 3.0, 226.0), (x + 3.0, 238.0), (x - 3.0, 238.0)],
                "Black", z=BODY["head_front_z"] + 1.0, thickness=6.0)
    # A comb from brow to nape: the silhouette that says great helm at a glance.
    a.box(BONE_HEAD, (0.0, CROWN_Y - 6.0, SKULL_Z), (7.0, 18.0, 64.0), "LightSteel", taper=0.7)
    a.band(BONE_HEAD, 240.0, 35.0, "DarkSteel", tube=3.0, squash=(1.0, 1.16), z=SKULL_Z)


def horned_helm(a):
    """The cap, and a horn on each side sweeping out and up."""
    skullcap(a, "DarkSteel")
    # Up on the dome — see `cap_helm`: a ring at the brow line reads as a blindfold.
    a.band(BONE_HEAD, BROW_Y + 9.0, 35.0, "Steel", tube=3.0, squash=(1.0, 1.16), z=SKULL_Z)
    for side in (1, -1):
        a.stud(BONE_HEAD, (side * 31.0, BROW_Y + 12.0, SKULL_Z), (side * 0.85, 0.5, -0.1), 30.0, 8.5, CLOTH, sides=6)
        a.stud(BONE_HEAD, (side * 31.0, BROW_Y + 10.0, SKULL_Z), (side * 0.5, -0.2, 0.0), 9.0, 6.0, "DarkSteel", sides=6)


def circlet_helm(a):
    """A band on the brow and a stone at the front. The one head piece that shows the wearer."""
    # A circlet is worn ABOVE the brow — the whole point of the style is that it
    # leaves the face visible, and at the brow line it covered the eyes instead.
    a.band(BONE_HEAD, BROW_Y + 10.0, 34.0, "Gold", tube=3.5, squash=(1.0, 1.16), z=SKULL_Z)
    a.plate(BONE_HEAD, [(-6.0, BROW_Y + 5.0), (6.0, BROW_Y + 5.0), (8.0, BROW_Y + 13.0),
                        (0.0, BROW_Y + 19.0), (-8.0, BROW_Y + 13.0)],
            "Gold", z=BODY["head_front_z"] - 4.0, thickness=3.5)
    a.stud(BONE_HEAD, (0.0, BROW_Y + 11.0, BODY["head_front_z"] - 2.0), (0.0, 0.0, 1.0), 6.0, 4.5, "Red", sides=6)


def hood_helm(a):
    """A cowl: cloth over the skull, open at the face, falling to the shoulders behind."""
    # OPEN AT THE FRONT, which the first version was not: it had a panel across
    # the face, so the cowl read as a closed box with a wall where a face goes.
    # The shell is pulled back off the face and the opening is framed by two
    # cheek folds instead.
    a.shell(BONE_HEAD, [(33.0, 224.0), (38.0, 244.0), (39.0, 272.0), (32.0, 292.0), (19.0, 300.0)],
            CLOTH, squash=(1.0, 1.16), z=SKULL_Z - 8.0)
    for side in (1, -1):
        a.plate(BONE_HEAD, [(side * 16.0, 228.0), (side * 30.0, 236.0), (side * 30.0, 276.0), (side * 18.0, 272.0)],
                CLOTH, z=BODY["head_front_z"] - 6.0, thickness=9.0, chamfer=3.0)
    # And the fall down the back, which is what a cowl is from behind.
    a.plate(BONE_HEAD, [(-26.0, 206.0), (26.0, 206.0), (30.0, 250.0), (-30.0, 250.0)],
            CLOTH, z=BODY["head_back_z"] + 4.0, thickness=7.0)


HELM = {
    "cap": cap_helm,
    "full": full_helm,
    "horned": horned_helm,
    "circlet": circlet_helm,
    "hood": hood_helm,
}


# --- feet ------------------------------------------------------------------------------------
# The foot runs x 16.5..31, y 0..11, z -5..26 (it points forward), and the shin
# above it sits on x 12..37 with about a 13-unit radius. All four boot styles
# were one dark block before this; a boot is a shoe PLUS what it does at the
# shin, and that is where the four differ.

BONE_FOOT = (("FootL", 1), ("FootR", -1))
BONE_SHIN = (("LowerLegL", 1), ("LowerLegR", -1))
FOOT_X = 23.8
SHIN_X = 24.2


def shoe(a, mat, toe=None, height=13.0):
    """The part every boot has: a block over the foot and a cap over the toes."""
    for bone, side in BONE_FOOT:
        x = side * FOOT_X
        a.box(bone, (x, height * 0.5, 10.0), (21.0, height, 34.0), mat)
        a.box(bone, (x, height * 0.5 + 1.0, 24.0), (18.0, height * 0.7, 12.0), toe or mat)


def shin(a, mat, y0, y1, r0, r1, sides=8):
    """A cuff, a greave or a wrap up the lower leg."""
    for bone, side in BONE_SHIN:
        a.shell(bone, [(r0, y0), (r1, y1)], mat, squash=(1.0, 1.0), sides=sides, x=side * SHIN_X)


def shin_band(a, mat, y, r, tube=2.5):
    for bone, side in BONE_SHIN:
        a.band(bone, y, r, mat, tube=tube, squash=(1.0, 1.0), sides=8, x=side * SHIN_X)


def low_boots(a):
    """A shoe and a turned-down ankle cuff. The one that gets out of the way."""
    shoe(a, LEATHER, toe="Wood")
    shin(a, LEATHER, 11.0, 21.0, 14.0, 13.0)
    shin_band(a, "Wood", 21.0, 14.0, tube=2.5)


def tall_boots(a):
    """To the knee, with the top turned over — the silhouette that says riding boot."""
    shoe(a, LEATHER, toe="DarkWood")
    shin(a, LEATHER, 11.0, 46.0, 14.5, 12.5)
    shin_band(a, "Wood", 46.0, 14.0, tube=3.5)
    shin_band(a, "Wood", 24.0, 13.6, tube=2.0)


def plated_boots(a):
    """A steel greave over the shin, a knee cop above it, and a plated toe."""
    shoe(a, "Steel", toe="LightSteel")
    shin(a, "Steel", 11.0, 42.0, 15.0, 13.5)
    shin_band(a, "DarkSteel", 22.0, 15.0, tube=2.5)
    for bone, side in BONE_SHIN:
        # The knee, which is what separates a greave from a tall boot.
        a.shell(bone, [(13.0, 44.0), (15.0, 50.0), (11.0, 56.0)], "LightSteel",
                squash=(1.0, 1.0), sides=8, x=side * SHIN_X)


def wrapped_boots(a):
    """Cloth wound from ankle to knee over a soft sole: the lightest thing to wear."""
    shoe(a, LEATHER, height=11.0)
    shin(a, CLOTH, 11.0, 44.0, 13.5, 12.0)
    for y in (16.0, 25.0, 34.0, 42.0):
        shin_band(a, CLOTH, y, 13.6, tube=2.2)


BOOTS = {
    "low": low_boots,
    "tall": tall_boots,
    "plated": plated_boots,
    "wrapped": wrapped_boots,
}


# --- back ------------------------------------------------------------------------------------
# All four of these were ONE drape: `capeParts` in gear.ts ignored its style
# argument entirely, so a Mantle, a Tabard and a Cloak were the same sheet of
# cloth. They hang off the torso, behind the body (its back is at z -26).

BACK_Z = -30.0


def collar(a, mat, y=None, r=21.0, tube=3.5):
    """
    The band that carries a cape at the neck — and the only part of it a player
    sees from the FRONT.

    Photographed standing, the back view read correctly and the front view was
    bare: no collar, no shoulder line, nothing. A cape that only exists from
    behind is half an item. The band is a full ring round the neck, so it shows
    from any angle, and two short straps run out over the shoulders to say what
    is holding the weight.
    """
    at = BODY["chest_y1"] - 4.0 if y is None else y
    a.band(BONE_CHEST, at, r, mat, tube=tube, squash=(1.0, 1.15), z=-3.0)
    for side in (1, -1):
        a.plate(BONE_CHEST,
                [(side * 6.0, at + 6.0), (side * 20.0, at + 1.0),
                 (side * 20.0, at - 6.0), (side * 6.0, at - 3.0)],
                mat, z=BODY["chest_front_z"] - 2.0, thickness=4.0, chamfer=1.0)


def cape_back(a):
    """A cape: pinned at the shoulders, falling to mid-thigh, swinging as it goes."""
    # SHOULDER WIDTH AT THE TOP, NARROWING AND THEN FLARING. A fall that starts
    # 19 wide on a body whose shoulders are 33 leaves daylight at the collar; one
    # that stays 30 all the way down is a rectangle. This one sits on the
    # shoulders, draws in at the waist and opens again at the hem, which is the
    # shape that reads as cloth from behind.
    # AGAINST THE BACK AT THE TOP. In profile the fall hung clear of the body
    # with daylight between the cloth and the shoulder blade; the torso's own
    # back is at -26, so the cape starts just outside it and swings away as it
    # drops rather than starting away and staying there.
    # A REAL FLARE, not a parallel fall. Measured on the bench, the hem came out
    # x1.12 the collar's width — which is a sheet, and reads as "a square on the
    # back". A cape gathers at the shoulders and opens as it drops; the hem is
    # half as wide again as the collar now, and the fall lengthens to the knee
    # so there is room for it to open.
    a.hanging([(30.0, BODY["chest_y1"] + 4.0, -27.0),
               (25.0, BODY["chest_y0"] + 10.0, -29.0),
               (34.0, BODY["waist_y0"] - 6.0, -35.0),
               (46.0, BODY["waist_y0"] - 40.0, -43.0)], CLOTH)
    collar(a, "Gold")


def cloak_back(a):
    """A cloak: longer, wider, with a rolled collar and a clasp at the throat."""
    a.hanging([(31.0, BODY["chest_y1"] + 5.0, -27.0),
               (27.0, BODY["chest_y0"] + 10.0, -29.0),
               (38.0, BODY["waist_y0"] - 16.0, -36.0),
               (48.0, BODY["waist_y0"] - 50.0, -44.0),
               (52.0, BODY["waist_y0"] - 72.0, -48.0)], LEATHER, thickness=5.0)
    a.shell(BONE_CHEST, [(20.0, BODY["chest_y1"] - 2.0), (23.0, BODY["chest_y1"] + 8.0),
                         (20.0, BODY["chest_y1"] + 14.0)],
            LEATHER, squash=(1.0, 1.15), sides=10, z=-3.0)
    # AND THE SHOULDER STRAPS. This was the one cape building its own collar, so
    # it was also the one still invisible from the front — its triangle count
    # never moved when the others gained theirs.
    collar(a, LEATHER, r=20.0, tube=2.5)
    a.stud(BONE_CHEST, (0.0, BODY["chest_y1"] - 2.0, BODY["chest_front_z"] + 1.0),
           (0.0, 0.0, 1.0), 6.0, 5.0, "Gold", sides=6)


def mantle_back(a):
    """A mantle: a short cape over the shoulders and nothing below them."""
    # Two links, not three: a mantle is short, and a hem that swings a long way
    # on a piece that ends at the ribs reads as a bug rather than as cloth.
    a.hanging([(28.0, BODY["chest_y1"] + 5.0, -26.0),
               (33.0, BODY["chest_y1"] - 10.0, -28.0),
               (34.0, BODY["chest_y0"] + 14.0, -31.0),
               (30.0, BODY["chest_y0"] + 4.0, -34.0)], CLOTH, thickness=5.0, segments=2)
    # Over the shoulders as well, or it is a bib worn backwards.
    for bone, side in ((BONE_ARM_L, 1), (BONE_ARM_R, -1)):
        a.shell(bone, [(15.0, BODY["shoulder_y"] + 7.0), (17.0, BODY["shoulder_y"] - 6.0)],
                CLOTH, squash=(1.0, 1.0), sides=8, x=side * (BODY["shoulder_x"] + 1.0), z=-2.0)
    collar(a, LEATHER, r=20.0, tube=3.0)


def tabard_back(a):
    """A tabard: one panel down the front and one down the back, belted at the waist."""
    # The BACK panel hangs and swings; the front one is belted flat to the body,
    # so it stays a drape. A tabard that flapped at the chest would be wrong.
    a.hanging([(15.0, BODY["chest_y1"] + 2.0, -24.0),
               (16.0, BODY["chest_y0"] + 6.0, -28.0),
               (17.0, BODY["waist_y0"] - 22.0, -30.0)], CLOTH, segments=2)
    a.drape(BONE_CHEST, [(15.0, BODY["chest_y1"] + 2.0, BODY["chest_front_z"] - 1.0),
                         (16.0, BODY["chest_y0"] + 6.0, BODY["chest_front_z"] + 2.0),
                         (17.0, BODY["waist_y0"] - 22.0, BODY["chest_front_z"] + 2.0)], CLOTH)
    a.band(BONE_WAIST, BODY["waist_y1"] - 2.0, 23.0, LEATHER, tube=4.0, squash=(1.0, 1.0), z=-6.0)
    collar(a, "Gold", r=20.0, tube=2.5)


CAPE = {
    "cape": cape_back,
    "cloak": cloak_back,
    "mantle": mantle_back,
    "tabard": tabard_back,
}

# Slot per style, so `build.py` can name the file and the game can find it.
SLOT_OF = {
    **{style: "armor" for style in CHEST},
    **{style: "helm" for style in HELM},
    **{style: "boots" for style in BOOTS},
    **{style: "cape" for style in CAPE},
}
RECIPES = {**CHEST, **HELM, **BOOTS, **CAPE}
FAMILIES = {"chest": list(CHEST), "helm": list(HELM), "boots": list(BOOTS), "cape": list(CAPE)}


def build(style):
    """Every piece of one style, as (mesh name, object) pairs. The name is the bone."""
    a = Armour(style)
    RECIPES[style](a)
    return f"{SLOT_OF[style]}:{style}", a.finish()
