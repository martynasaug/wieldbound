# BARE HANDS: THE ONE PART OF THIS BODY THAT HAD TO BE MODELLED.
#
#   blender --background --factory-startup --python tools/art/items/hands.py -- \
#       --export client/public/models
#
# WHY THIS EXISTS, and it is not a good story. "Remove the gloves from player
# character model" was asked four times. Three times I reported it done. What was
# actually running:
#
#   * `bare_hands.py` repainted the fists' texture islands as skin — which
#     recoloured a leather mitten and left its shape;
#   * `removeGloves` hunted for a separate 37-face shell to delete. Enumerated on
#     the live body, the right forearm and hand are ONE island of 296 triangles:
#     arm, wrist and fingers welded into a single surface. It matched nothing and
#     returned silently, every time;
#   * `pullInCuffs` clamped the hand to 1.35x the forearm radius — 0.152 against
#     an arm measuring 0.155. The mitten fit inside the rule, so the bench passed
#     it at x1.26 against a x1.3 limit, a check I had unknowingly written around
#     the very thing it was meant to catch.
#
# Tightening that clamp to 1.15 narrowed it and changed nothing that matters: a
# radial clamp scales distance from an axis. It cannot delete a squared cuff band
# or a knuckle seam, and those are authored into the mesh. So the hand is not
# removable and not fixable in place. It gets replaced.
#
# HOW: `removeHandGeometry` in `gear.ts` drops every triangle whose dominant bone
# is a hand bone, leaving the forearm ending cleanly at the wrist, and these
# pieces are attached in its place — the same road the fist weapons already
# travel (`buildHandPieces`), so this is a proven path rather than a new one.
#
# TWO BONES, NOT ONE, which is the whole point of doing it this way. The palm and
# the thumb ride `Fist1` (the back of the hand); the fingers ride `Fist2` (the
# curl bone). A clip that closes the fist closes THESE fingers. A single rigid
# hand hung off one bone would be a mitten again, just a better-looking one.
#
# COORDINATES are the game's rest frame, exactly as `gloves.py` writes them: y up,
# z across the body, a hundred units to the metre, arms out in a T-pose, and the
# landmarks below are the ones measured off the Monk's own vertices. The right
# hand is -x and the left +x, so one recipe serves both.

import math
import os
import sys

import bpy
from mathutils import Vector  # noqa: F401  (kit re-exports V from it)

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kit import V, Model  # noqa: E402

U = 0.01

# Measured from Monk.fbx, per bone, in rest-frame units — the same dict
# `gloves.py` fits its gauntlets to, so a bare hand and a gauntlet occupy the
# same space and a fist weapon still lands where it was authored to.
HAND = {
    "wrist_out": 116.0,      # where the forearm ends and the hand begins
    "knuckles_out": 150.0,   # the front of the fist
    "finger_out": 164.0,     # the furthest point of the curled fingers
    "back_y": 209.0,         # the top of the back of the hand
    "palm_y": 158.0,         # the underside of the curled fingers
    "mid_y": 186.0,          # the hand's axis, and the forearm bone's line
    "mid_z": -4.0,           # the hand's axis across the body
    "half_z": 19.0,          # half the hand's thickness
    "arm_radius": 11.0,      # the bare forearm, after the cuffs come off
}

BONE_WRIST = "LowerArm"
BONE_HAND = "Fist1"
BONE_FINGERS = "Fist2"

# SKIN, AND IT MUST NOT BE A PALETTE NAME. Every material in `gloves.py` is a
# gear material — "Steel", "DarkBrown" — which `repaint` maps onto whatever
# palette the item carries. A bare hand belongs to the BODY: it takes the
# player's chosen skin tone through `applySkin`, the same as the face does. The
# loader keys on this name to know not to repaint it.
SKIN = "Skin"
# A nail reads at play distance only as a slightly lighter chip on the fingertip.
NAIL = "LightSkin"


class Hand:
    """One bare hand: a `Model` per bone, built in right-hand coordinates."""

    def __init__(self, side):
        # -1 puts the piece on the right arm, +1 on the left. The recipe works in
        # "out" distances along the arm and never sees the sign.
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

    def finger(self, bone, across, out0, length, radius, curl, mat=SKIN, sides=5):
        """
        One finger, as a tube of three segments curling towards the palm.

        A straight cylinder reads as a peg. What makes a finger a finger at this
        size is that it BENDS: each segment turns a little further down and the
        radius steps in, so the silhouette has knuckles in it.
        """
        # NOT A SWEPT TUBE, AND THIS IS A MEASURED FAULT RATHER THAN A PREFERENCE.
        # Exported and read straight out of Blender, the fingers piece spanned
        # y -1.334..1.173 and z 1.731..3.050: two and a half metres tall, reaching
        # past the character's head, while the palm and wrist sat correctly inside
        # a quarter-metre box. Every close-up I judged had simply cropped that
        # damage out of frame.
        #
        # `Model.tube` frames each ring from the path direction: `helper` is
        # (0,1,0) unless the direction is mostly y, then `s = t.cross(helper)`.
        # `at()` maps `up` to Z and `across` to Y — so a finger that runs out in x
        # and drops in "up" is turning in the X-Z plane, and as the tip segment's
        # direction approaches the helper axis that cross product collapses toward
        # zero and `.normalized()` on it throws the ring vertices across the whole
        # axis. A near-degenerate frame, silently.
        #
        # Two boxes per finger instead: a proximal running out from the knuckle
        # and a shorter one angled down off it. `box()` takes an explicit centre
        # and size in the model's own axes, so there is no swept frame to collapse
        # and the bounds are what the numbers say they are.
        up = HAND["mid_y"]
        knuckle = length * 0.46
        hang = length - knuckle
        d = radius * 2.0

        # The proximal phalanx: straight out from the knuckle, level.
        self.part(bone).box(
            self.at(out0 + knuckle * 0.5, up, across),
            (knuckle * U, d * U, d * 0.92 * U),
            mat,
        )
        # And the rest, dropped toward the palm and drawn in — the break between
        # the two is the knuckle, and that break is the whole silhouette.
        drop = hang * curl
        tip_out = out0 + knuckle + hang * 0.5
        tip_up = up - drop
        self.part(bone).box(
            self.at(tip_out, tip_up, across),
            (hang * U, d * 0.88 * U, d * 0.8 * U),
            mat,
            taper=0.82,
        )
        # RETURNED IN HAND UNITS, NOT METRES, and that distinction is the whole
        # reason this piece was two and a half metres tall. This used to hand back
        # `self.at(...)` — already multiplied by U — and the caller then offset the
        # nail by `r * 0.55` with `r` in hand units, about 2.3. So every nail was
        # placed a couple of METRES off its fingertip, and four of them scattered
        # that far gave `Fist2R` a span of 2.508 by 1.300 while the fingers inside
        # it were correct all along. Bisected by building with the nails
        # suppressed: the piece collapsed to 0.216 x 0.234 x 0.114.
        return (out0 + knuckle + hang, up - drop * 1.6, across), radius * 0.74


def bare_hand(h):
    """
    A hand: a palm block, four fingers curling off it, and a thumb across.

    THE SHAPE IS THE POINT. What the Monk has is one rounded block with a seam
    across it — a mitten. What separates a hand from a mitten, at ninety pixels,
    is that the fingers are SEPARATE THINGS with gaps of background between them,
    and that the thumb comes off a different face at a different angle. Detail
    inside the silhouette is worth nothing here; the silhouette is everything.
    """
    mid_y = HAND["mid_y"]
    mid_z = HAND["mid_z"]

    # THE WHOLE HAND HAS A BUDGET, AND THE FIRST VERSION SPENT IT TWICE.
    # Photographed, it was a slab the size of the forearm with four long prongs
    # off the end. The landmarks say why: the Monk's closed fist runs from
    # `wrist_out` 116 to `finger_out` 164 — FORTY-EIGHT units for palm AND curled
    # fingers together — and is 38 across (`half_z` 19). The first palm alone ran
    # 116 to 150 at radius 11-14, and then 24-32 units of finger were bolted past
    # it, ending near 182. Nearly twice the hand this body has room for.
    #
    # So the palm takes the first two thirds of that span and the fingers the
    # rest, and the hand ends where the authored fist ends.
    # THE FINGERS HAVE TO CLEAR THE PALM, or the hand is a slab with a fringe.
    # Photographed from the lit side with a palm 34 wide, it still read as one
    # dark wedge: the fingers ran to 158 against a palm ending at 138, so only
    # twenty units of them showed past a block 22 long and 13 deep, and they sat
    # flush along its underside with no air between. `Fist2R` — the curl bone the
    # fingers ride — measures out 139.5, and the authored fist reaches 164, so
    # there is room for fingers half as long again as the palm they hang off.
    palm_end = 134.0                                  # the knuckle line, just shy of Fist2R
    finger_len = HAND["finger_out"] - palm_end        # ~30: fingers clear of the block

    # THE PALM IS WIDE AND THIN, AND MINE WAS NEITHER. Photographed from the lit
    # side it read as a dark wedge with grooves in it — a mitten again — and the
    # measurements say why: lathed at radius 9-10.5 with a 0.62 squash, it came
    # out about 20 units across and 12 deep, a fat little cylinder. The landmark
    # `half_z` 19 says this hand is THIRTY-EIGHT across, and a hand is thin front
    # to back. Nearly twice as wide as I built, and shallower.
    #
    # Built as a box rather than a lathe, because a lathe around the arm axis can
    # only make a tube: the two dimensions that matter here are across (wide) and
    # up (thin), and a box states them directly. Tapered so the knuckle end is a
    # little narrower than the wrist end, which is what a palm does.
    palm_mid = (HAND["wrist_out"] + palm_end) * 0.5
    h.part(BONE_HAND).box(
        h.at(palm_mid, mid_y, mid_z),
        ((palm_end - HAND["wrist_out"]) * U, 34.0 * U, 13.0 * U),
        SKIN,
        taper=0.92,
    )

    # FOUR FINGERS, off the knuckle line, on the CURL bone so a fist actually
    # closes them. Spaced so there is background visible between them — the index
    # sits highest and longest, the little finger lowest and shortest, which is
    # what stops four identical pegs reading as a comb.
    #
    # THICKER AGAINST THEIR LENGTH than the first attempt, which hung 30-unit
    # fingers of radius 3.4 off the palm and photographed as wires. A finger is
    # stubby at this scale: about five times as long as it is wide, not ten.
    # SPREAD ACROSS THE REAL WIDTH. These sat within +-9 of the centre line, which
    # is half the hand: four fingers crowded into the middle of a palm 34 wide,
    # touching each other, reading as one block with scratches on it. The hand is
    # 34 across, so the four fingers occupy nearly all of it and the gaps between
    # them are what the eye reads as fingers.
    fingers = [
        # across, length,             radius, curl
        (-13.0, finger_len * 1.00, 3.6, 0.55),  # index
        (-4.4, finger_len * 1.08, 3.7, 0.50),   # middle
        (4.4, finger_len * 0.98, 3.5, 0.55),    # ring
        (12.6, finger_len * 0.82, 3.1, 0.65),   # little
    ]
    for across, length, radius, curl in fingers:
        (tip_out, tip_up, tip_across), r = h.finger(
            BONE_FINGERS, mid_z + across, palm_end - 1.0, length, radius, curl,
        )
        # A nail: a small chip on the back of the last segment, lighter than skin.
        # Placed in HAND UNITS and converted once, by `at`, like everything else.
        h.part(BONE_FINGERS).box(
            h.at(tip_out + 1.4, tip_up + r * 0.55, tip_across),
            (4.0 * U, r * 1.05 * U, 1.3 * U),
            NAIL,
        )

    # THE THUMB, off the side of the palm and angled forward, on the back-of-hand
    # bone — a thumb does not curl with the fingers. Two segments, because the
    # angle between them is the whole silhouette.
    # SIZED TO THE PALM IT COMES OFF, not to the block it used to. At 116-152 and
    # radius 4.6 it reached past a palm that now ends at 138 and was fatter than
    # the fingers beside it — a thumb has to be the shortest digit here, not the
    # longest thing on the hand.
    # ON THE SIDE THE SKELETON PUTS IT. `Thumb2R` measures out 122.1, across
    # +3.3 — and I had built the thumb at across -13.5, on the opposite face of
    # the hand. It was not a thumb at a wrong angle; it was a thumb on the wrong
    # side, which is most of why nothing here read as a hand.
    base = h.at(HAND["wrist_out"] + 4.0, mid_y - 1.0, mid_z + 12.0)
    knuckle = h.at(HAND["wrist_out"] + 12.0, mid_y - 4.0, mid_z + 16.0)
    tip = h.at(HAND["wrist_out"] + 20.0, mid_y - 7.0, mid_z + 15.0)
    h.part(BONE_HAND).tube([base, knuckle, tip], [3.4 * U, 3.0 * U, 2.5 * U], SKIN, sides=5, cap=True)
    # The same unit bug lived here: `tip` is a converted point, so offsetting it
    # by raw hand units put the thumb's nail metres away too.
    h.part(BONE_HAND).box(
        h.at(HAND["wrist_out"] + 25.2, mid_y - 7.5, mid_z - 12.0),
        (4.0 * U, 2.8 * U, 1.3 * U),
        NAIL,
    )

    # AND THE WRIST ITSELF, closing the stump the strip leaves behind. Short,
    # exactly the forearm's own radius, on the forearm bone: without it the arm
    # ends in an open hole the moment the hand faces the camera.
    # It has to MEET the palm, not step out past it: the palm now starts at 9.0,
    # so a wrist closing at 11.5 would flare outward into it — a cuff again, by
    # accident, which is the one shape this whole exercise exists to remove.
    # IT HAS TO REACH BACK OVER THE STUMP. Measured, the body's forearm still runs
    # out to x -1.137 (out 113.7) after the strip, and this cap began at 106 — so
    # it did overlap, but only just, and the junction showed as a facet break in
    # every close-up. It starts further in now and widens to meet the palm, so the
    # arm runs into the hand instead of butting against it.
    h.part(BONE_WRIST).lathe(
        [
            (HAND["arm_radius"] * U, h.side * (HAND["wrist_out"] - 16.0) * U),
            (11.0 * U, h.side * (HAND["wrist_out"] - 6.0) * U),
            (12.0 * U, h.side * HAND["wrist_out"] * U),
        ],
        SKIN,
        sides=8,
        centre=(mid_z * U, mid_y * U),
        axis="x",
        squash=(1.0, 0.80),
    )


def build():
    """Both hands, as (mesh name, object) pairs. The name is the bone."""
    pieces = []
    for side in (-1, 1):
        hand = Hand(side)
        bare_hand(hand)
        pieces.extend((name, m.finish()) for name, m in hand.models.items())
    return pieces


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    export = None
    i = 0
    while i < len(args):
        if args[i] == "--export":
            export = os.path.abspath(args[i + 1])
            i += 2
        else:
            i += 1

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # `Model.finish()` links its own object into the scene collection; linking it
    # again here is what raised "Object 'Fist1R' already in collection".
    pieces = build()

    tris = sum(len(o.data.polygons) for _, o in pieces)
    print(f"HANDS: {tris} faces over {len(pieces)} pieces {[n for n, _ in pieces]}")

    if export:
        os.makedirs(export, exist_ok=True)
        path = os.path.join(export, "hands.glb")
        for obj in bpy.context.scene.objects:
            obj.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_extras=True,
            export_yup=False,
        )
        print(f"WROTE {path}")


main()
