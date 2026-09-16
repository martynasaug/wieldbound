# FIST WEAPONS: WHAT A BARE-HANDED FIGHTER WEARS.
#
# Asked for: "Gloves (fists) should be another weapon type. Make a system and
# models for them." Everything else in the catalogue is HELD — one model in one
# socket. A fist weapon is WORN, on both hands, and it has to move with them:
# the Monk's hand is three bones (the wrist, the back of the hand, the curled
# fingers), and a single rigid glove hung off any one of them tears off the
# others the moment a clip bends the hand.
#
# So a fist item is built as one piece PER BONE, per hand, and the game attaches
# each piece to that bone (`buildHandPieces` in `client/src/three/gear.ts`). The
# mesh's NAME is the bone: `Fist1R`, `Fist2L`, `LowerArmR`.
#
# COORDINATES ARE THE GAME'S REST FRAME, the same space `gear.ts` authors armour
# in — y up, z forward, a hundred units to the metre, arms out in a T-pose —
# because `Actor.holderFor` already hangs that off a bone without the bone's own
# transform disturbing it. The hand landmarks below were measured off the Monk's
# own vertices per bone (`HAND`), not eyeballed, and both hands are the same
# numbers mirrored in x.
#
#   blender --background --factory-startup --python tools/art/items/gloves.py -- \
#       <id|all> [--sheet out.png] [--export dir]

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kit import V, Model  # noqa: E402

# --- what a glove has to fit ----------------------------------------------------------
# MEASURED ON THE ROGUE, WHICH IS THE BODY THE PLAYER HAS. `out` is distance
# from the body along the arm, so the same recipe serves both hands: the right
# hand is -x, the left +x.
#
# THIS TABLE USED TO SAY MONK, AND IT WAS WRONG IN BOTH WAYS AT ONCE.
#
# The Monk was the player body until M69 and this file was written against it.
# `ARM_CENTRE` in `armour.py` carried the same stale number and put every sleeve
# in the game seven and a half units in front of the arm; this one is the same
# mistake on the hand, with a second one on top of it. The Monk's fists are
# BOXING GLOVES modelled into its mesh — four sessions went into trying to take
# them off, which is why the player body is the Rogue now — so its hand box is
# three times the size of a hand:
#
#                    Monk (was)   Rogue (is)
#     across mid        -4.0         +3.8     <- 7.8 out, the same axis as the arm
#     up mid           186.0        182.0
#     back of hand     209.0        190.0     <- 19 units of daylight
#     underside        158.0        173.0
#     half thickness    19.0         15.0
#     fingertip        164.0        155.0
#
# Photographed on the character (`tools/soak/catalogue.mjs`), the result was
# seven pairs of grey tubes swallowing the forearms — a piece built for a hand
# three times too big, offset off the hand it was built for, and made large
# enough to cover it anyway. The same failure as the sleeves, and the same
# cause, one bone further out.
#
# AND A HAND IS A SLAB, NOT A ROD: thirty across and seventeen deep. Anything
# turned about the arm here takes a `squash` or it is a drum.
HAND = {
    "wrist_out": 113.0,      # where the forearm ends and the hand begins
    "knuckles_out": 146.0,   # the front of the fist, where a bar or a blade sits
    "finger_out": 155.0,     # the furthest point of the curled fingers
    "back_y": 190.0,         # the top of the back of the hand
    "palm_y": 173.0,         # the underside of the curled fingers
    "mid_y": 182.0,          # the hand's axis, and the forearm bone's line
    "mid_z": 3.8,            # the hand's axis across the body
    "half_z": 15.0,          # half the hand's width, across
    "half_y": 8.8,           # half its depth, which is a little over half that
    "arm_radius": 10.0,      # the bare forearm, after the cuffs come off
}

# How much flatter than wide a thing turned about the arm has to be. The hand
# is 0.58; the forearm is nearly round and takes 0.92.
FIST_SQUASH = (1.0, 0.58)
ARM_SQUASH = (1.0, 0.92)

BONE_WRIST = "LowerArm"
BONE_HAND = "Fist1"
BONE_FINGERS = "Fist2"


# THE BODY'S OWN COORDINATES ARE METRES, Z UP. Measured, not assumed: the Monk's
# skinned geometry reads -1.6..1.6 across, 0..2.9 up, and the skeleton's bind
# matrix carries the hundredfold on its own — so a piece attached rigidly to a
# bone (`boneAttachMatrix` in gear.ts) must be in THAT space. Authoring in it is
# unreadable, though: a knuckle is at 1.503. So recipes are written in hand
# units — hundredths, y up, z across the body, the same numbers `gear.ts` uses
# for armour — and every point is converted on the way out. The first version
# skipped the conversion and the gloves arrived a hundred times life size,
# eighty metres from the character.
U = 0.01


class Glove:
    """One fist item: a `Model` per bone, built in right-hand coordinates."""

    def __init__(self, item_id, side):
        self.item_id = item_id
        # -1 puts the piece on the right arm, +1 on the left. Recipes work in
        # "out" distances and never see it.
        self.side = side
        self.models = {}

    def part(self, bone):
        key = f"{bone}{'R' if self.side < 0 else 'L'}"
        if key not in self.models:
            self.models[key] = Model(key)
        return self.models[key]

    def at(self, out, up, across=None):
        """A point, from a distance out along the arm, a height, and an offset across."""
        return V(self.side * out * U, (HAND["mid_z"] if across is None else across) * U, up * U)

    def band(self, bone, out, radius, mat, tube=3.0, sides=8, squash=FIST_SQUASH):
        """
        A strap or ring round the hand or wrist at `out`.

        A LATHE RATHER THAN A TORUS, because a torus is round and a hand is not:
        a ring wide enough to clear the knuckles stood eight units clear of the
        back and the palm. This is the same three-station band `armour.py` uses,
        and it takes a squash.
        """
        self.part(bone).lathe(
            [(radius * U, self.side * (out - tube) * U),
             ((radius + tube * 0.4) * U, self.side * out * U),
             (radius * U, self.side * (out + tube) * U)],
            mat, sides=sides, centre=(HAND["mid_z"] * U, HAND["mid_y"] * U),
            squash=squash, axis="x", cap=False,
        )

    def sleeve(self, bone, out0, out1, r0, r1, mat, sides=8, squash=FIST_SQUASH):
        """A tapering sleeve along the arm — a cuff, a wrap, a gauntlet's forearm."""
        self.part(bone).lathe(
            [(r0 * U, self.side * out0 * U), (r1 * U, self.side * out1 * U)], mat, sides=sides,
            # `axis="x"` turns about the arm; its centre is (across, up).
            centre=(HAND["mid_z"] * U, HAND["mid_y"] * U), squash=squash, axis="x",
        )

    def plate(self, bone, out0, out1, up, thickness, mat, half_z=None, chamfer=2.0):
        """A flat plate lying over the back of the hand, thick upwards."""
        hz = (HAND["half_z"] if half_z is None else half_z) * U
        mid = HAND["mid_z"] * U
        outline = [
            (self.side * out0 * U, mid - hz), (self.side * out1 * U, mid - hz),
            (self.side * out1 * U, mid + hz), (self.side * out0 * U, mid + hz),
        ]
        # Plane "xy": the outline lies across the back of the hand and the plate
        # is thick along z, which is up.
        self.part(bone).slab(outline, thickness * U, mat, chamfer=chamfer * U, y=up * U, plane="xy")

    def stud(self, bone, out, up, across, length, width, mat, sides=4):
        """A spike, stud or claw pointing out past the knuckles."""
        self.part(bone).shard(
            self.at(out, up, across), V(self.side, 0, 0), length * U, width * U, mat, sides=sides,
        )

    def box(self, bone, centre, size, mat, taper=1.0):
        """A block. Centre and size are both (out, up, across)."""
        out, up, across = centre
        long_out, long_up, long_across = size
        self.part(bone).box(
            (self.side * out * U, across * U, up * U),
            (long_out * U, long_across * U, long_up * U),
            mat, taper=taper,
        )

    def ring(self, bone, out, up, across, normal, radius, tube, mat, segments=8):
        """A ring — a finger loop, a rivet collar. `normal` is in body axes."""
        self.part(bone).torus(self.at(out, up, across), normal, radius * U, tube * U, mat, segments=segments)

    def spike(self, bone, out, up, across, direction, length, width, mat, sides=4):
        """A spike or crystal pointing wherever `direction` says, in body axes."""
        self.part(bone).shard(self.at(out, up, across), direction, length * U, width * U, mat, sides=sides)

    def finish(self):
        return [(name, m.finish()) for name, m in self.models.items()]


# --- the six ----------------------------------------------------------------------------

def handwraps(g):
    """Linen strips: bound round the knuckles and the wrist, nothing else."""
    for out in (120.0, 130.0, 140.0):
        g.band(BONE_HAND, out, 16.2, "White", tube=2.2)
    g.band(BONE_FINGERS, 149.0, 16.0, "White", tube=2.2)
    g.sleeve(BONE_WRIST, 96.0, 113.0, 10.6, 12.0, "White", sides=8, squash=ARM_SQUASH)
    g.band(BONE_WRIST, 98.0, 12.4, "DarkBrown", tube=1.8, squash=ARM_SQUASH)


def studdedcestus(g):
    """A boxer's leather: a bound fist with iron studs across the knuckles."""
    g.sleeve(BONE_HAND, 113.0, 146.0, 16.4, 16.0, "DarkBrown", sides=8)
    g.sleeve(BONE_WRIST, 94.0, 113.0, 10.6, 12.4, "DarkBrown", sides=8, squash=ARM_SQUASH)
    g.band(BONE_WRIST, 96.0, 12.8, "DarkSteel", tube=2.2, squash=ARM_SQUASH)
    for across in (-6.0, 4.0, 14.0):
        g.stud(BONE_FINGERS, 150.0, 186.0, across, 6.0, 3.0, "DarkSteel", sides=5)
    g.band(BONE_FINGERS, 151.0, 16.4, "DarkBrown", tube=2.4)


def ironknuckles(g):
    """A bar of iron across the knuckles, four rings under it, a plain strap behind."""
    g.box(BONE_FINGERS, (150.0, 187.0, HAND["mid_z"]), (8.0, 8.0, 27.0), "Steel", taper=0.9)
    for across in (-7.0, -0.5, 6.0, 13.0):
        # Loops facing out past the knuckles, one per finger.
        g.ring(BONE_FINGERS, 148.0, 178.0, across, V(1, 0, 0), 4.0, 1.5, "Steel", segments=8)
    g.sleeve(BONE_HAND, 118.0, 144.0, 16.2, 16.2, "DarkBrown", sides=8)
    g.band(BONE_WRIST, 104.0, 12.0, "DarkBrown", tube=2.4, squash=ARM_SQUASH)


def emberfists(g):
    """Bound leather under iron plates that never quite go cold: embers show between them."""
    g.sleeve(BONE_WRIST, 98.0, 113.0, 10.6, 12.0, "DarkBrown", sides=8, squash=ARM_SQUASH)
    g.band(BONE_WRIST, 100.0, 12.4, "DarkSteel", tube=2.0, squash=ARM_SQUASH)
    g.sleeve(BONE_HAND, 116.0, 146.0, 16.2, 16.2, "DarkBrown", sides=8)
    g.plate(BONE_HAND, 120.0, 144.0, HAND["back_y"] - 1.0, 4.0, "DarkSteel", half_z=11.0)
    g.box(BONE_FINGERS, (150.0, 186.0, HAND["mid_z"]), (7.0, 9.0, 26.0), "DarkSteel", taper=0.9)
    for across in (-6.0, 4.0, 14.0):
        g.stud(BONE_FINGERS, 152.0, 186.0, across, 4.5, 2.0, "Red", sides=5)
    g.band(BONE_FINGERS, 149.0, 16.2, "DarkBrown", tube=2.2)


def tigerclaws(g):
    """Three curved blades on a leather backing, worn over the knuckles."""
    g.plate(BONE_HAND, 118.0, 146.0, HAND["back_y"] - 2.0, 4.0, "DarkBrown", half_z=12.0)
    g.sleeve(BONE_WRIST, 100.0, 113.0, 10.6, 12.0, "DarkBrown", sides=8, squash=ARM_SQUASH)
    for across in (-6.0, 4.0, 14.0):
        g.stud(BONE_FINGERS, 153.0, 184.0, across, 19.0, 3.4, "LightSteel", sides=4)
        g.box(BONE_FINGERS, (149.0, 188.0, across), (7.0, 5.0, 6.0), "DarkSteel")
    g.band(BONE_FINGERS, 149.0, 16.2, "DarkBrown", tube=2.4)


def warplategauntlets(g):
    """Plate: a fluted cuff, a plated back of the hand, ridged knuckles."""
    g.sleeve(BONE_WRIST, 86.0, 113.0, 11.4, 13.6, "Steel", sides=8, squash=ARM_SQUASH)
    g.band(BONE_WRIST, 88.0, 14.4, "DarkSteel", tube=2.6, squash=ARM_SQUASH)
    g.plate(BONE_HAND, 114.0, 147.0, HAND["back_y"] - 1.0, 5.0, "Steel", half_z=14.0)
    g.plate(BONE_HAND, 120.0, 140.0, HAND["back_y"] + 4.0, 4.0, "LightSteel", half_z=9.0)
    for across in (-6.0, 4.0, 14.0):
        g.box(BONE_FINGERS, (150.0, 186.0, across), (8.0, 11.0, 7.0), "Steel", taper=0.85)
    g.sleeve(BONE_FINGERS, 144.0, 154.0, 16.6, 16.2, "DarkSteel", sides=8)


def stormfists(g):
    """Storm gauntlets: a crystal on the back of each hand, bolts along the cuff."""
    g.sleeve(BONE_WRIST, 90.0, 113.0, 11.0, 13.2, "DarkSteel", sides=8, squash=ARM_SQUASH)
    for across in (-4.0, 12.0):
        g.spike(BONE_WRIST, 96.0, HAND["mid_y"] + 8.0, across, V(g.side * 0.3, 0.2, 1), 9.0, 2.4, "LightBlue")
    g.plate(BONE_HAND, 114.0, 146.0, HAND["back_y"] - 1.0, 5.0, "DarkSteel", half_z=13.0)
    g.spike(BONE_HAND, 128.0, HAND["back_y"] + 3.0, HAND["mid_z"], V(0, 0, 1), 7.0, 3.6, "LightBlue", sides=6)
    g.box(BONE_FINGERS, (150.0, 186.0, HAND["mid_z"]), (9.0, 13.0, 26.0), "DarkSteel", taper=0.9)
    for across in (-4.0, 12.0):
        g.stud(BONE_FINGERS, 153.0, 186.0, across, 6.0, 2.4, "LightBlue", sides=4)


RECIPES = {
    "handwraps": ("Hand Wraps", handwraps),
    "studdedcestus": ("Studded Cestus", studdedcestus),
    "ironknuckles": ("Iron Knuckles", ironknuckles),
    "emberfists": ("Emberfists", emberfists),
    "tigerclaws": ("Tiger Claws", tigerclaws),
    "warplategauntlets": ("Warplate Gauntlets", warplategauntlets),
    "stormfists": ("Stormfists", stormfists),
}


def build(item_id):
    """Every piece of one item, both hands, as (mesh name, object) pairs."""
    name, fn = RECIPES[item_id]
    pieces = []
    for side in (-1, 1):
        glove = Glove(item_id, side)
        fn(glove)
        pieces.extend(glove.finish())
    return name, pieces
