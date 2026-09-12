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

    def stud(self, bone, at, direction, length, width, mat, sides=4):
        """A rivet, a spike, a scale's point."""
        x, y, z = at
        dx, dy, dz = direction
        self.part(bone).shard(mesh(x, y, z), V(dx, -dz, dy), length * U, width * U, mat, sides=sides)

    def finish(self):
        return [(name, m.finish()) for name, m in self.models.items()]


# --- chest ----------------------------------------------------------------------------------
# Six, and no two share a silhouette: the whole reason this file exists.

def pauldrons(a, mat, span=18.0, drop=13.0, lip=True):
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


def plate_chest(a):
    """Plate: a shaped cuirass with a keel down the breast, a gorget, and tassets."""
    # The ribs are 17 wide and 23 deep, centred a little behind the middle: a
    # cuirass stands just proud of that. The first pass used 30 and read as a
    # barrel with a character inside it; the second hugged so close it read as
    # paint. This one stands about three units off the body and carries the
    # shoulder line, which is what makes a cuirass a garment rather than a skin.
    a.shell(BONE_CHEST, [(19.0, BODY["chest_y0"] - 5.0), (22.0, BODY["chest_y0"] + 14.0),
                         (22.5, BODY["chest_y1"] - 14.0), (20.0, BODY["chest_y1"] + 6.0)],
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
    a.shell(BONE_CHEST, [(17.0, BODY["chest_y0"] - 2.0), (20.0, BODY["chest_y1"] - 8.0),
                         (17.0, BODY["chest_y1"] + 2.0)], "DarkBrown", squash=(1.0, 1.15), z=-3.0)
    rows = 5
    for i in range(rows):
        y = BODY["chest_y0"] + 2.0 + i * (BODY["chest_y1"] - BODY["chest_y0"] - 6.0) / rows
        for k in range(9):
            angle = -math.pi * 0.62 + k * (math.pi * 1.24 / 8)
            x = math.sin(angle) * 19.0
            z = -3.0 + math.cos(angle) * 22.0
            a.stud(BONE_CHEST, (x, y, z), (math.sin(angle), -0.35, math.cos(angle)), 4.0, 4.0, "Steel", sides=4)
    a.band(BONE_CHEST, BODY["chest_y0"] - 1.0, 19.0, "DarkSteel", tube=2.5, squash=(1.0, 1.15), z=-3.0)
    a.shell(BONE_WAIST, [(22.0, BODY["waist_y1"]), (25.0, BODY["waist_y1"] - 28.0)],
            "DarkBrown", squash=(1.0, 1.0), z=-6.0)
    for k in range(8):
        angle = -math.pi * 0.6 + k * (math.pi * 1.2 / 7)
        a.stud(BONE_WAIST, (math.sin(angle) * 23.0, BODY["waist_y1"] - 14.0, -6.0 + math.cos(angle) * 23.0),
               (math.sin(angle), -0.4, math.cos(angle)), 4.0, 4.0, "Steel", sides=4)
    pauldrons(a, "Steel", span=12.0, drop=9.0)


def brigandine_chest(a):
    """Brigandine: quilted cloth over plates, held by rows of rivets and two straps."""
    a.shell(BONE_CHEST, [(18.0, BODY["chest_y0"] - 3.0), (20.0, BODY["chest_y0"] + 14.0),
                         (20.0, BODY["chest_y1"] - 10.0), (17.0, BODY["chest_y1"] + 3.0)],
            "Red", squash=(1.0, 1.15), z=-3.0)
    for y in (BODY["chest_y0"] + 6.0, BODY["chest_y0"] + 22.0, BODY["chest_y1"] - 9.0):
        for k in range(7):
            angle = -math.pi * 0.5 + k * (math.pi / 6)
            a.stud(BONE_CHEST, (math.sin(angle) * 19.0, y, -3.0 + math.cos(angle) * 22.0),
                   (math.sin(angle), 0.0, math.cos(angle)), 2.0, 1.8, "DarkSteel", sides=5)
    for side in (1, -1):
        a.plate(BONE_CHEST, [(side * 5.0, BODY["chest_y1"] + 1.0), (side * 14.0, BODY["chest_y1"] - 3.0),
                             (side * 11.0, BODY["chest_y0"] + 4.0), (side * 3.0, BODY["chest_y0"] + 6.0)],
                "DarkBrown", z=BODY["chest_front_z"] + 1.0, thickness=3.5)
    a.band(BONE_CHEST, BODY["chest_y0"] - 2.0, 19.0, "DarkBrown", tube=3.5, squash=(1.0, 1.15), z=-3.0)
    a.shell(BONE_WAIST, [(22.0, BODY["waist_y1"]), (23.0, BODY["waist_y1"] - 20.0)],
            "Red", squash=(1.0, 1.0), z=-6.0)
    pauldrons(a, "DarkBrown", span=12.0, drop=8.0, lip=False)


def chain_chest(a):
    """Mail: a shirt that hangs, a collar that stands, and a skirt to the thigh."""
    a.shell(BONE_CHEST, [(17.0, BODY["chest_y0"] - 5.0), (20.0, BODY["chest_y0"] + 12.0),
                         (20.0, BODY["chest_y1"] - 10.0), (16.0, BODY["chest_y1"] + 5.0)],
            "Steel", squash=(1.0, 1.15), z=-3.0)
    # A standing collar, the piece that separates mail from a tabard at a glance.
    a.shell(BONE_CHEST, [(13.0, BODY["chest_y1"] + 3.0), (14.0, BODY["chest_y1"] + 12.0)],
            "Steel", squash=(1.0, 1.1), sides=8, z=-3.0)
    # Banding across the shirt reads as rings at this size.
    for y in (BODY["chest_y0"] + 4.0, BODY["chest_y0"] + 17.0, BODY["chest_y0"] + 30.0):
        a.band(BONE_CHEST, y, 20.0, "DarkSteel", tube=1.6, squash=(1.0, 1.15), z=-3.0)
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
    a.shell(BONE_CHEST, [(18.5, BODY["chest_y0"] - 4.0), (21.0, BODY["chest_y0"] + 14.0),
                         (21.0, BODY["chest_y1"] - 12.0), (17.0, BODY["chest_y1"] + 4.0)],
            "DarkBrown", squash=(1.0, 1.15), z=-3.0)
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
                "DarkBrown", squash=(1.0, 1.0), sides=8, x=side * (BODY["shoulder_x"] + 1.0), z=-2.0)


def robe_chest(a):
    """A robe: a long fall of cloth from the shoulders, a sash, and soft shoulder folds."""
    a.shell(BONE_CHEST, [(17.0, BODY["chest_y0"] - 2.0), (19.0, BODY["chest_y0"] + 16.0),
                         (19.0, BODY["chest_y1"] - 10.0), (15.0, BODY["chest_y1"] + 7.0)],
            "White", squash=(1.0, 1.15), z=-3.0)
    # The skirt falls from the waist and widens to the knee: the robe's whole shape.
    a.shell(BONE_WAIST, [(22.0, BODY["waist_y1"] + 2.0), (25.0, BODY["waist_y1"] - 20.0),
                         (29.0, BODY["waist_y1"] - 58.0), (27.0, BODY["waist_y1"] - 76.0)],
            "White", squash=(1.0, 1.0), z=-6.0)
    a.band(BONE_WAIST, BODY["waist_y1"] - 4.0, 23.0, "Red", tube=4.0, squash=(1.0, 1.0), z=-6.0)
    # A knot and two hanging ends, so the sash reads as tied.
    a.box(BONE_WAIST, (11.0, BODY["waist_y1"] - 6.0, BODY["waist_front_z"] + 2.0), (8.0, 8.0, 5.0), "Red")
    a.box(BONE_WAIST, (11.0, BODY["waist_y1"] - 21.0, BODY["waist_front_z"] + 1.0), (5.0, 22.0, 3.5), "Red")
    for bone, side in ((BONE_ARM_L, 1), (BONE_ARM_R, -1)):
        a.shell(bone, [(12.0, BODY["shoulder_y"] + 6.0), (13.0, BODY["shoulder_y"] - 10.0),
                       (11.0, BODY["shoulder_y"] - 19.0)],
                "White", squash=(1.0, 1.0), sides=8, x=side * (BODY["shoulder_x"] + 1.0), z=-2.0)


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
        a.stud(BONE_HEAD, (side * 31.0, BROW_Y + 12.0, SKULL_Z), (side * 0.85, 0.5, -0.1), 30.0, 8.5, "White", sides=6)
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
            "White", squash=(1.0, 1.16), z=SKULL_Z - 8.0)
    for side in (1, -1):
        a.plate(BONE_HEAD, [(side * 16.0, 228.0), (side * 30.0, 236.0), (side * 30.0, 276.0), (side * 18.0, 272.0)],
                "White", z=BODY["head_front_z"] - 6.0, thickness=9.0, chamfer=3.0)
    # And the fall down the back, which is what a cowl is from behind.
    a.plate(BONE_HEAD, [(-26.0, 206.0), (26.0, 206.0), (30.0, 250.0), (-30.0, 250.0)],
            "White", z=BODY["head_back_z"] + 4.0, thickness=7.0)


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
    shoe(a, "DarkBrown", toe="Wood")
    shin(a, "DarkBrown", 11.0, 21.0, 14.0, 13.0)
    shin_band(a, "Wood", 21.0, 14.0, tube=2.5)


def tall_boots(a):
    """To the knee, with the top turned over — the silhouette that says riding boot."""
    shoe(a, "DarkBrown", toe="DarkWood")
    shin(a, "DarkBrown", 11.0, 46.0, 14.5, 12.5)
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
    shoe(a, "DarkBrown", height=11.0)
    shin(a, "White", 11.0, 44.0, 13.5, 12.0)
    for y in (16.0, 25.0, 34.0, 42.0):
        shin_band(a, "White", y, 13.6, tube=2.2)


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
    a.band(BONE_CHEST, BODY["chest_y1"] - 4.0 if y is None else y, r, mat,
           tube=tube, squash=(1.0, 1.15), z=-3.0)


def cape_back(a):
    """A cape: pinned at the shoulders, falling to mid-thigh, swinging out as it goes."""
    a.drape(BONE_CHEST, [(19.0, BODY["chest_y1"] + 2.0, -22.0),
                         (25.0, BODY["chest_y0"] + 12.0, -26.0),
                         (30.0, BODY["waist_y0"] + 4.0, -32.0),
                         (28.0, BODY["waist_y0"] - 22.0, -38.0)], "Red")
    collar(a, "Gold")


def cloak_back(a):
    """A cloak: longer, wider, with a rolled collar and a clasp at the throat."""
    a.drape(BONE_CHEST, [(21.0, BODY["chest_y1"] + 3.0, -22.0),
                         (28.0, BODY["chest_y0"] + 10.0, -27.0),
                         (35.0, BODY["waist_y0"] - 16.0, -34.0),
                         (36.0, BODY["waist_y0"] - 50.0, -42.0),
                         (31.0, BODY["waist_y0"] - 68.0, -46.0)], "DarkBrown", thickness=5.0)
    a.shell(BONE_CHEST, [(20.0, BODY["chest_y1"] - 2.0), (23.0, BODY["chest_y1"] + 8.0),
                         (20.0, BODY["chest_y1"] + 14.0)],
            "DarkBrown", squash=(1.0, 1.15), sides=10, z=-3.0)
    a.stud(BONE_CHEST, (0.0, BODY["chest_y1"] - 2.0, BODY["chest_front_z"] + 1.0),
           (0.0, 0.0, 1.0), 6.0, 5.0, "Gold", sides=6)


def mantle_back(a):
    """A mantle: a short cape over the shoulders and nothing below them."""
    a.drape(BONE_CHEST, [(24.0, BODY["chest_y1"] + 5.0, -20.0),
                         (32.0, BODY["chest_y1"] - 10.0, -26.0),
                         (34.0, BODY["chest_y0"] + 14.0, -31.0),
                         (30.0, BODY["chest_y0"] + 4.0, -34.0)], "White", thickness=5.0)
    # Over the shoulders as well, or it is a bib worn backwards.
    for bone, side in ((BONE_ARM_L, 1), (BONE_ARM_R, -1)):
        a.shell(bone, [(15.0, BODY["shoulder_y"] + 7.0), (17.0, BODY["shoulder_y"] - 6.0)],
                "White", squash=(1.0, 1.0), sides=8, x=side * (BODY["shoulder_x"] + 1.0), z=-2.0)
    collar(a, "DarkBrown", r=20.0, tube=3.0)


def tabard_back(a):
    """A tabard: one panel down the front and one down the back, belted at the waist."""
    for z0, z1 in ((-24.0, -28.0), (BODY["chest_front_z"] - 1.0, BODY["chest_front_z"] + 2.0)):
        a.drape(BONE_CHEST, [(15.0, BODY["chest_y1"] + 2.0, z0),
                             (16.0, BODY["chest_y0"] + 6.0, z1),
                             (17.0, BODY["waist_y0"] - 22.0, z1)], "Green")
    a.band(BONE_WAIST, BODY["waist_y1"] - 2.0, 23.0, "DarkBrown", tube=4.0, squash=(1.0, 1.0), z=-6.0)
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
