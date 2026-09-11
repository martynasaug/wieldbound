# WEAPON RECIPES — ONE SHAPE PER ITEM.
#
# Every function builds one catalogue item from `kit.py` operations. The rule
# the whole file exists to keep: no two items share a silhouette. A band-5 sword
# is a different object from a band-1 sword, not the same one in another colour.
#
# Units: an arming sword is about 1.0 long. The game normalises length when it
# fits a weapon to the hand and scales per family and item from the catalogue, so
# these only need their PROPORTIONS right. Z up, pommel at the bottom, blade flat
# facing Y, edge on +X.

import math

from kit import V, Model


# --- helpers shared by the swords ---------------------------------------------------

def disc_pommel(m, z, r, mat="Steel", depth=0.03):
    m.lathe([(r * 0.55, z - depth * 0.5), (r, z), (r * 0.55, z + depth * 0.5)], mat, sides=8, squash=(1.0, 0.55))


def straight_guard(m, z, half_span, height, thick, mat="DarkSteel", flare=1.0):
    outline = [
        (-half_span, z - height * 0.5 * flare), (-half_span * 0.2, z - height * 0.5),
        (half_span * 0.2, z - height * 0.5), (half_span, z - height * 0.5 * flare),
        (half_span, z + height * 0.5 * flare), (half_span * 0.2, z + height * 0.5),
        (-half_span * 0.2, z + height * 0.5), (-half_span, z + height * 0.5 * flare),
    ]
    m.slab(outline, thick, mat, chamfer=thick * 0.25)


# --- swords ---------------------------------------------------------------------------------

def recruitblade(m):
    """A training blade: short, broad at the tip, a plain bar and a wooden grip."""
    m.lathe([(0.0, 0.0), (0.04, 0.012), (0.045, 0.035), (0.028, 0.06)], "Steel")
    m.lathe([(0.024, 0.06), (0.027, 0.1), (0.027, 0.17), (0.024, 0.2)], "Wood", sides=6)
    m.box((0, 0, 0.215), (0.19, 0.055, 0.032), "DarkSteel")
    m.blade([(0.23, 0.048, 0.048, 0.012, 0), (0.5, 0.05, 0.05, 0.012, 0), (0.62, 0.046, 0.046, 0.011, 0)], (0, 0.72), "Steel")


def armingsword(m):
    """The knight's sidearm: a long tapering double edge, flared cross, bound grip, disc pommel."""
    disc_pommel(m, 0.02, 0.055)
    m.wrap(0.045, 0.22, 0.023, "DarkBrown", "DarkWood", bands=4)
    straight_guard(m, 0.235, 0.14, 0.03, 0.045, flare=1.9)
    m.blade([(0.25, 0.044, 0.044, 0.011, 0), (0.62, 0.036, 0.036, 0.010, 0), (0.9, 0.022, 0.022, 0.008, 0)], (0, 1.0), "Steel", fuller=0.35)


def falchion(m):
    """A cleaver of a sword: single edge swelling towards a clipped point, a small S-guard."""
    m.lathe([(0.0, 0.0), (0.035, 0.015), (0.03, 0.04)], "DarkSteel", sides=6)
    m.lathe([(0.022, 0.04), (0.026, 0.12), (0.022, 0.19)], "Wood", sides=6)
    m.slab([(-0.09, 0.2), (-0.04, 0.19), (0.04, 0.2), (0.1, 0.24), (0.08, 0.25), (0.03, 0.225), (-0.03, 0.225), (-0.08, 0.215)],
           0.035, "DarkSteel", chamfer=0.008)
    m.blade(
        [(0.23, 0.03, 0.018, 0.011, 0), (0.5, 0.055, 0.018, 0.011, 0.005), (0.72, 0.075, 0.018, 0.01, 0.012), (0.8, 0.07, 0.018, 0.009, 0.01)],
        (-0.012, 0.92), "Steel", back_sharp=False,
    )


def boarspear(m):
    """A hunting spear: long ash shaft, iron collar, a broad leaf head with the lugs that stop a charge."""
    m.lathe([(0.0, 0.0), (0.028, 0.02), (0.024, 0.04)], "DarkSteel", sides=6)
    m.lathe([(0.022, 0.04), (0.022, 1.12)], "DarkWood", sides=6)
    m.lathe([(0.03, 1.12), (0.034, 1.16), (0.026, 1.2)], "DarkSteel", sides=6)
    m.box((0.075, 0, 1.2), (0.09, 0.03, 0.035), "Steel", taper=0.6)
    m.box((-0.075, 0, 1.2), (0.09, 0.03, 0.035), "Steel", taper=0.6)
    m.blade([(1.21, 0.02, 0.02, 0.012, 0), (1.3, 0.06, 0.06, 0.013, 0), (1.42, 0.045, 0.045, 0.011, 0)], (0, 1.56), "Steel", fuller=0.2)


def longsword(m):
    """A hand-and-a-half: long narrow blade, long grip, quillons that turn down towards the blade."""
    m.lathe([(0.0, -0.01), (0.03, 0.0), (0.045, 0.03), (0.03, 0.06), (0.0, 0.07)], "Steel", sides=8)
    m.wrap(0.06, 0.34, 0.022, "DarkBrown", "DarkSteel", bands=6)
    m.slab([(-0.17, 0.39), (-0.15, 0.37), (-0.03, 0.345), (0.03, 0.345), (0.15, 0.37), (0.17, 0.39),
            (0.14, 0.39), (0.03, 0.37), (-0.03, 0.37), (-0.14, 0.39)], 0.035, "DarkSteel", chamfer=0.008)
    m.blade([(0.37, 0.036, 0.036, 0.01, 0), (0.9, 0.03, 0.03, 0.009, 0), (1.2, 0.02, 0.02, 0.008, 0)], (0, 1.32), "Steel", fuller=0.4)


def rimeblade(m):
    """A blade grown over with ice: crystals along both edges and crystal for a guard."""
    m.lathe([(0.0, 0.0), (0.03, 0.02), (0.02, 0.05)], "LightBlue", sides=5)
    m.lathe([(0.022, 0.05), (0.024, 0.2)], "DarkSteel", sides=6)
    for sx in (-1, 1):
        m.shard(V(sx * 0.02, 0, 0.215), V(sx, 0, 0.45), 0.13, 0.024, "LightBlue", roll=0.4)
    m.blade([(0.22, 0.04, 0.04, 0.011, 0), (0.6, 0.038, 0.038, 0.01, 0), (0.86, 0.028, 0.028, 0.009, 0)], (0, 0.98), "Steel")
    # Growing OUT of the edge, big enough to read: at first they started inside a
    # narrow blade and floated beside it as specks.
    for i, z in enumerate((0.32, 0.45, 0.58, 0.71)):
        sx = 1 if i % 2 == 0 else -1
        edge = 0.04 * 1.6 * (1 - 0.3 * (z - 0.22) / 0.64)
        m.shard(V(sx * edge * 0.7, 0, z), V(sx, 0, 0.7), 0.12 - i * 0.012, 0.03, "LightBlue", roll=0.3)


def greatsword(m):
    """Too big for one hand: a broad blade with a ricasso, a wide bar guard and a heavy pommel."""
    m.lathe([(0.0, -0.02), (0.05, 0.0), (0.06, 0.04), (0.04, 0.07)], "DarkSteel", sides=8)
    m.wrap(0.07, 0.38, 0.026, "DarkBrown", "DarkSteel", bands=5)
    straight_guard(m, 0.405, 0.22, 0.05, 0.06, flare=1.4)
    m.blade(
        [(0.43, 0.046, 0.046, 0.017, 0), (0.52, 0.046, 0.046, 0.017, 0), (0.55, 0.08, 0.08, 0.017, 0),
         (1.15, 0.07, 0.07, 0.015, 0), (1.3, 0.05, 0.05, 0.013, 0)],
        (0, 1.46), "Steel", fuller=0.3,
    )
    for sx in (-1, 1):
        m.box((sx * 0.07, 0, 0.535), (0.04, 0.03, 0.03), "DarkSteel", taper=0.4)


def gildedblade(m):
    """A courtier's sword: a sweeping gold guard, a gem in the pommel, a slim bright blade."""
    m.lathe([(0.0, -0.01), (0.035, 0.005), (0.045, 0.03), (0.03, 0.055)], "Gold", sides=8)
    m.shard(V(0, -0.045, 0.03), V(0, -1, 0), 0.02, 0.018, "Red", sides=6)
    m.shard(V(0, 0.045, 0.03), V(0, 1, 0), 0.02, 0.018, "Red", sides=6)
    m.wrap(0.055, 0.22, 0.021, "DarkBrown", "Gold", bands=3)
    m.slab([(-0.16, 0.3), (-0.12, 0.25), (-0.05, 0.225), (0.05, 0.225), (0.12, 0.25), (0.16, 0.3),
            (0.13, 0.3), (0.1, 0.265), (0.04, 0.25), (-0.04, 0.25), (-0.1, 0.265), (-0.13, 0.3)], 0.035, "Gold", chamfer=0.008)
    m.blade([(0.25, 0.035, 0.035, 0.009, 0), (0.7, 0.03, 0.03, 0.008, 0), (0.94, 0.02, 0.02, 0.007, 0)], (0, 1.04), "LightSteel", fuller=0.45)


def frostbrand(m):
    """A great blade whose base is a spray of frost: spikes flaring from the guard, a crystal pommel."""
    m.shard(V(0, 0, 0.05), V(0, 0, -1), 0.1, 0.045, "LightBlue", sides=5)
    m.wrap(0.05, 0.34, 0.025, "DarkSteel", "LightBlue", bands=4)
    straight_guard(m, 0.36, 0.13, 0.045, 0.055, mat="DarkSteel", flare=1.2)
    m.blade([(0.38, 0.06, 0.06, 0.016, 0), (1.05, 0.06, 0.06, 0.014, 0), (1.25, 0.045, 0.045, 0.012, 0)], (0, 1.4), "Steel", fuller=0.3)
    for sx in (-1, 1):
        for k, (z, lean, length) in enumerate(((0.37, 0.55, 0.2), (0.44, 0.9, 0.15), (0.52, 1.4, 0.1))):
            m.shard(V(sx * 0.07, 0, z), V(sx, 0, lean), length, 0.022 - k * 0.004, "LightBlue", roll=0.5)


def claymore(m):
    """The highland claymore: long grip, quillons swept towards the blade, each ending in rings."""
    m.lathe([(0.0, -0.02), (0.05, 0.0), (0.05, 0.03), (0.0, 0.05)], "DarkSteel", sides=8, squash=(1.0, 0.45))
    m.wrap(0.05, 0.4, 0.024, "DarkBrown", "DarkSteel", bands=6)
    m.lathe([(0.03, 0.4), (0.038, 0.43), (0.03, 0.46)], "DarkSteel", sides=8)
    # Heavy quillons and one big ring each: thin ones with paired small rings read
    # as a pair of scissor handles.
    for sx in (-1, 1):
        m.slab([(sx * 0.02, 0.41), (sx * 0.2, 0.52), (sx * 0.21, 0.58), (sx * 0.02, 0.47)], 0.05, "DarkSteel", chamfer=0.01)
        m.torus(V(sx * 0.235, 0, 0.6), V(0, 1, 0), 0.045, 0.015, "DarkSteel", segments=10)
    m.blade([(0.46, 0.05, 0.05, 0.014, 0), (1.2, 0.045, 0.045, 0.012, 0), (1.45, 0.03, 0.03, 0.01, 0)], (0, 1.6), "Steel", fuller=0.35)


def levinbrand(m):
    """A blade shaped like the strike it calls: zigzag edges, and a forked guard like a split bolt."""
    m.shard(V(0, 0, 0.04), V(0, 0, -1), 0.06, 0.035, "Gold", sides=4)
    m.wrap(0.04, 0.2, 0.022, "DarkSteel", "Gold", bands=3)
    for sx in (-1, 1):
        m.slab([(0, 0.2), (sx * 0.12, 0.3), (sx * 0.1, 0.32), (sx * 0.05, 0.27), (0, 0.24)], 0.04, "Gold", chamfer=0.008)
    stations = []
    for i, z in enumerate((0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 0.94)):
        xo = 0.028 * (1 if i % 2 else -1)
        w = 0.042 - i * 0.003
        stations.append((z, w, w, 0.011, xo))
    m.blade(stations, (0.015, 1.06), "LightSteel")


def wyrmtooth(m):
    """Carved from something's tooth: a curved single-edged blade with a serrated back and a bone grip."""
    m.lathe([(0.0, 0.0), (0.038, 0.02), (0.03, 0.05)], "White", sides=6)
    m.lathe([(0.025, 0.05), (0.028, 0.14), (0.024, 0.24)], "White", sides=6)
    m.lathe([(0.034, 0.24), (0.04, 0.26), (0.03, 0.28)], "Red", sides=6)
    stations = []
    for i, z in enumerate((0.28, 0.42, 0.56, 0.7, 0.84, 0.96)):
        u = i / 5
        xo = -0.09 * math.sin(u * math.pi * 0.55)
        stations.append((z, 0.05 - u * 0.018, 0.022, 0.013, xo))
    m.blade(stations, (-0.1, 1.08), "White", back_sharp=False)
    for i, z in enumerate((0.34, 0.46, 0.58, 0.7, 0.82)):
        u = (z - 0.28) / 0.68
        xo = -0.09 * math.sin(u * math.pi * 0.55)
        m.shard(V(xo - 0.022 * 1.6, 0, z), V(-1, 0, 0.7), 0.06, 0.02, "White", roll=0.5)


SWORDS = {
    "recruitblade": ("Recruit's Blade", recruitblade),
    "armingsword": ("Arming Sword", armingsword),
    "falchion": ("Falchion", falchion),
    "boarspear": ("Boar Spear", boarspear),
    "longsword": ("Longsword", longsword),
    "rimeblade": ("Rimeblade", rimeblade),
    "greatsword": ("Greatsword", greatsword),
    "gildedblade": ("Gilded Blade", gildedblade),
    "frostbrand": ("Frostbrand", frostbrand),
    "claymore": ("Bloodclaim Claymore", claymore),
    "levinbrand": ("Levinbrand", levinbrand),
    "wyrmtooth": ("Wyrmtooth", wyrmtooth),
}

# --- axes -----------------------------------------------------------------------------------
# The bit is an outline on the XZ plane at the top of the haft, edge towards +X.

def haft(m, z0, z1, r, mat="DarkWood", butt="DarkSteel"):
    # The butt cap covers the butt and nothing else. It used to run the whole
    # length inside the wooden shaft, won the depth fight, and every axe and
    # hammer in the first sheet had a grey haft.
    m.lathe([(0.0, z0 - 0.015), (r * 1.3, z0), (r * 1.2, z0 + 0.03), (r * 1.05, z0 + 0.05)], butt, sides=6)
    m.lathe([(r, z0 + 0.05), (r * 0.85, z1)], mat, sides=6)


def handaxe(m):
    """A hatchet: a short haft and a small wedge of a head with a stub of a poll."""
    haft(m, 0.0, 0.58, 0.024)
    m.wrap(0.05, 0.2, 0.026, "DarkBrown", "DarkWood", bands=3)
    m.box((0, 0, 0.5), (0.075, 0.055, 0.1), "DarkSteel")
    m.slab([(0.03, 0.45), (0.12, 0.41), (0.17, 0.47), (0.17, 0.59), (0.12, 0.63), (0.03, 0.56)], 0.034, "Steel", chamfer=0.007)
    m.box((-0.055, 0, 0.5), (0.04, 0.045, 0.065), "DarkSteel", taper=0.7)


def woodcutter(m):
    """A felling axe: long haft, a broad bit with a long straight edge, a square hammer poll."""
    haft(m, 0.0, 0.98, 0.027)
    m.wrap(0.05, 0.28, 0.029, "DarkBrown", "DarkWood", bands=3)
    m.box((0, 0, 0.88), (0.085, 0.06, 0.13), "DarkSteel")
    m.slab([(0.04, 0.82), (0.11, 0.79), (0.21, 0.72), (0.26, 0.74), (0.26, 1.02), (0.21, 1.04), (0.11, 0.97), (0.04, 0.94)],
           0.038, "Steel", chamfer=0.008)
    m.box((-0.07, 0, 0.88), (0.06, 0.058, 0.1), "DarkSteel")


def cinderbite(m):
    """An axe whose bit is a flame: tongues licking back from the edge, an ember set in the eye."""
    haft(m, 0.0, 0.8, 0.025, mat="Black")
    m.wrap(0.05, 0.24, 0.027, "DarkBrown", "Red", bands=3)
    m.box((0, 0, 0.7), (0.08, 0.055, 0.13), "DarkSteel")
    m.slab([(0.03, 0.63), (0.12, 0.56), (0.16, 0.6), (0.21, 0.57), (0.2, 0.66), (0.26, 0.66), (0.21, 0.73),
            (0.27, 0.77), (0.2, 0.8), (0.23, 0.88), (0.13, 0.83), (0.03, 0.77)], 0.034, "Steel", chamfer=0.007)
    m.shard(V(0, -0.03, 0.7), V(0, -1, 0), 0.035, 0.028, "Red", sides=6)
    m.shard(V(0, 0.03, 0.7), V(0, 1, 0), 0.035, 0.028, "Red", sides=6)
    m.shard(V(-0.04, 0, 0.7), V(-1, 0, 0.15), 0.1, 0.028, "DarkSteel")


def beardedaxe(m):
    """A northern axe: the bit hooks down along the haft in a long beard, langets clasp the wood."""
    haft(m, 0.0, 0.95, 0.027)
    m.wrap(0.05, 0.3, 0.029, "DarkBrown", "DarkSteel", bands=4)
    m.box((0, 0, 0.88), (0.08, 0.06, 0.13), "DarkSteel")
    for sy in (-1, 1):
        m.box((0, sy * 0.03, 0.76), (0.03, 0.008, 0.14), "DarkSteel")
    m.slab([(0.04, 0.9), (0.08, 0.86), (0.11, 0.72), (0.15, 0.6), (0.23, 0.66), (0.25, 0.8), (0.24, 0.98), (0.17, 1.02),
            (0.09, 0.97), (0.04, 0.95)], 0.036, "Steel", chamfer=0.008)


def twinbite(m):
    """Two crescents back to back on a long haft, and a spike between them."""
    haft(m, 0.0, 1.02, 0.028, mat="DarkBrown")
    m.wrap(0.05, 0.34, 0.03, "DarkBrown", "DarkSteel", bands=4)
    m.box((0, 0, 0.87), (0.09, 0.065, 0.16), "DarkSteel")
    for sx in (-1, 1):
        m.slab([(sx * 0.04, 0.8), (sx * 0.18, 0.7), (sx * 0.28, 0.74), (sx * 0.24, 0.87), (sx * 0.28, 1.0), (sx * 0.18, 1.04),
                (sx * 0.04, 0.94)], 0.034, "Steel", chamfer=0.008)
    m.shard(V(0, 0, 0.95), V(0, 0, 1), 0.16, 0.035, "Steel")


def moonglaive(m):
    """A polearm crowned by a crescent moon: a long shaft, a counterweight, a broad curved blade."""
    m.lathe([(0.0, -0.04), (0.045, -0.01), (0.04, 0.05), (0.025, 0.08)], "DarkSteel", sides=8)
    m.lathe([(0.023, 0.08), (0.022, 1.32)], "DarkWood", sides=6)
    m.lathe([(0.03, 1.3), (0.04, 1.34), (0.03, 1.38)], "Gold", sides=8)
    # A crescent is the outer disc minus an inner one shifted TOWARDS the shaft.
    # The first version shifted it away, which left the blade zero wide across its
    # middle — a sliver that photographed as floating beside the shaft.
    cx, cz = -0.13, 1.52
    outer, inner = [], []
    for i in range(13):
        a = math.radians(-100 + i * (200 / 12))
        outer.append((cx + math.cos(a) * 0.3, cz + math.sin(a) * 0.3))
        inner.append((cx - 0.1 + math.cos(a) * 0.25, cz + math.sin(a) * 0.25))
    m.slab(outer + list(reversed(inner)), 0.034, "LightSteel", chamfer=0.008)
    m.box((0.02, 0, 1.44), (0.07, 0.045, 0.12), "Gold")


def reaperscythe(m):
    """A reaper's scythe: a bent snath with a hand-peg, and a long blade sweeping back over the head."""
    snath = [V(0, 0, 0), V(0.025, 0, 0.4), V(0.0, 0, 0.8), V(-0.035, 0, 1.2), V(-0.015, 0, 1.44)]
    m.tube(snath, 0.024, "Black", sides=6)
    m.box((0.06, 0, 0.72), (0.12, 0.03, 0.03), "Black")
    m.lathe([(0.034, 1.38), (0.036, 1.46)], "DarkSteel", sides=6, centre=(-0.015, 0))
    m.slab([(0.02, 1.47), (-0.1, 1.5), (-0.3, 1.46), (-0.52, 1.32), (-0.66, 1.13), (-0.52, 1.24), (-0.3, 1.36),
            (-0.1, 1.4), (0.02, 1.41)], 0.024, "DarkSteel", chamfer=0.005)


AXES = {
    "handaxe": ("Hand Axe", handaxe),
    "woodcutter": ("Woodcutter's Axe", woodcutter),
    "cinderbite": ("Cinderbite", cinderbite),
    "beardedaxe": ("Bearded Axe", beardedaxe),
    "twinbite": ("Twinbite", twinbite),
    "moonglaive": ("Moon Glaive", moonglaive),
    "reaperscythe": ("Reaper's Scythe", reaperscythe),
}


# --- maces and hammers ------------------------------------------------------------------------

def smithhammer(m):
    """A forge hammer: short handle, a square face on one side and a wedge peen on the other."""
    haft(m, 0.0, 0.55, 0.024, mat="Wood")
    m.wrap(0.05, 0.2, 0.026, "DarkBrown", "Wood", bands=2)
    m.box((0.04, 0, 0.52), (0.1, 0.075, 0.075), "DarkSteel")
    m.box((0.1, 0, 0.52), (0.03, 0.085, 0.085), "Steel")
    m.shard(V(-0.01, 0, 0.52), V(-1, 0, 0), 0.1, 0.04, "DarkSteel")


def quarrymaul(m):
    """A maul for splitting stone: a long haft and a great rough block of a head bound in iron."""
    haft(m, 0.0, 0.98, 0.032)
    m.wrap(0.05, 0.3, 0.034, "DarkBrown", "DarkWood", bands=3)
    m.box((0, 0, 0.94), (0.28, 0.17, 0.18), "DarkSteel", taper=0.92)
    for z in (0.88, 1.0):
        m.box((0, 0, z), (0.29, 0.18, 0.025), "Steel")


def warhammer(m):
    """A soldier's warhammer: small square face, a long beak behind, a spike on top."""
    haft(m, 0.0, 1.02, 0.026)
    m.wrap(0.05, 0.3, 0.028, "DarkBrown", "DarkSteel", bands=4)
    for sy in (-1, 1):
        m.box((0, sy * 0.029, 0.84), (0.03, 0.008, 0.18), "DarkSteel")
    m.box((0, 0, 0.96), (0.07, 0.06, 0.1), "DarkSteel")
    m.box((0.075, 0, 0.96), (0.08, 0.07, 0.07), "Steel", taper=0.85)
    m.shard(V(-0.03, 0, 0.96), V(-1, 0, -0.3), 0.22, 0.035, "Steel")
    m.shard(V(0, 0, 1.0), V(0, 0, 1), 0.12, 0.028, "Steel")


def sparkhead(m):
    """A flanged mace crackling with it: four iron flanges round a core, a storm crystal on top."""
    haft(m, 0.0, 0.8, 0.025, mat="DarkSteel", butt="Steel")
    m.wrap(0.05, 0.24, 0.027, "DarkBrown", "LightBlue", bands=3)
    m.lathe([(0.03, 0.7), (0.05, 0.74), (0.05, 0.9), (0.03, 0.94)], "DarkSteel", sides=8)
    flange = [(-0.1, 0.72), (-0.13, 0.8), (-0.11, 0.9), (-0.05, 0.95), (0.05, 0.95), (0.11, 0.9), (0.13, 0.8), (0.1, 0.72), (0.04, 0.69), (-0.04, 0.69)]
    m.slab(flange, 0.02, "Steel", chamfer=0.004)
    m.slab(flange, 0.02, "Steel", chamfer=0.004, plane="yz")
    m.shard(V(0, 0, 0.94), V(0, 0, 1), 0.14, 0.035, "LightBlue", sides=5)


def deepsledge(m):
    """A double-headed sledge: two heavy octagonal drums across a long haft, banded."""
    haft(m, 0.0, 1.0, 0.03)
    m.wrap(0.05, 0.32, 0.032, "DarkBrown", "DarkWood", bands=4)
    m.lathe([(0.0, -0.22), (0.075, -0.21), (0.09, -0.16), (0.09, 0.16), (0.075, 0.21), (0.0, 0.22)],
            "DarkSteel", sides=8, axis="x", centre=(0, 0.97))
    for x in (-0.12, 0.12):
        m.lathe([(0.097, x - 0.02), (0.097, x + 0.02)], "Steel", sides=8, axis="x", centre=(0, 0.97))


def chainfall(m):
    """A flail: a bound handle, a run of chain, and a spiked ball at the end of it."""
    m.lathe([(0.0, -0.01), (0.035, 0.01), (0.03, 0.04)], "DarkSteel", sides=8)
    m.wrap(0.04, 0.36, 0.026, "DarkBrown", "DarkSteel", bands=4)
    m.lathe([(0.03, 0.36), (0.036, 0.39), (0.02, 0.42)], "DarkSteel", sides=8)
    for i in range(5):
        normal = V(0, 1, 0) if i % 2 == 0 else V(1, 0, 0)
        m.torus(V(0.012 * i, 0, 0.45 + i * 0.05), normal, 0.03, 0.009, "Steel", segments=8)
    bx, bz = 0.07, 0.8
    m.lathe([(0.0, bz - 0.1), (0.06, bz - 0.08), (0.095, bz - 0.02), (0.095, bz + 0.02), (0.06, bz + 0.08), (0.0, bz + 0.1)],
            "DarkSteel", sides=8, centre=(bx, 0))
    for d in (V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0.7, 0.7, 0.4), V(-0.7, -0.7, 0.4), V(0.7, -0.7, -0.4)):
        c = V(bx, 0, bz)
        m.shard(c + d.normalized() * 0.08, d, 0.08, 0.025, "Steel")


def dawnbreaker(m):
    """A hammer of the rising sun: a gold sunburst between two hammer faces."""
    haft(m, 0.0, 1.0, 0.027, mat="Wood", butt="Gold")
    m.wrap(0.05, 0.32, 0.029, "DarkBrown", "Gold", bands=4)
    ring = [(math.cos(a) * 0.12, 1.02 + math.sin(a) * 0.12) for a in (i * math.pi / 4 + math.pi / 8 for i in range(8))]
    m.slab(ring, 0.06, "Gold", chamfer=0.012)
    for i in range(8):
        a = i * math.pi / 4
        d = V(math.cos(a), 0, math.sin(a))
        m.shard(V(0, 0, 1.02) + d * 0.11, d, 0.1, 0.028, "Gold")
    # Small enough that the sunburst reads round it; at 0.07 across the drum hid
    # the disc and the rays read as spikes on a barrel.
    m.lathe([(0.0, -0.2), (0.04, -0.19), (0.048, -0.14), (0.048, 0.14), (0.04, 0.19), (0.0, 0.2)],
            "Steel", sides=8, axis="x", centre=(0, 1.02))


def thunderhead(m):
    """A storm maul: a great iron head with a lightning bolt raised on each face and a crystal crown."""
    haft(m, 0.0, 1.02, 0.03, mat="DarkSteel", butt="Steel")
    m.wrap(0.05, 0.32, 0.032, "DarkBrown", "LightBlue", bands=4)
    m.box((0, 0, 0.98), (0.32, 0.15, 0.18), "DarkSteel")
    bolt = [(-0.1, 1.05), (0.01, 1.05), (-0.02, 0.99), (0.1, 0.99), (-0.03, 0.9), (0.0, 0.96), (-0.1, 0.96)]
    for y in (0.08, -0.08):
        m.slab(bolt, 0.02, "LightBlue", chamfer=0.004, y=y)
    m.shard(V(0, 0, 1.07), V(0, 0, 1), 0.15, 0.04, "LightBlue", sides=5)


MACES = {
    "smithhammer": ("Smith's Hammer", smithhammer),
    "quarrymaul": ("Quarry Maul", quarrymaul),
    "warhammer": ("Warhammer", warhammer),
    "sparkhead": ("Sparkhead", sparkhead),
    "deepsledge": ("Deepsledge", deepsledge),
    "chainfall": ("Chainfall", chainfall),
    "dawnbreaker": ("Dawnbreaker", dawnbreaker),
    "thunderhead": ("Thunderhead", thunderhead),
}

# --- daggers --------------------------------------------------------------------------------
# Handle about two fifths of the length: the game halves a dagger's size, so the
# grip has to stay big enough to be seen in a fist.

def dirk(m):
    """A plain dirk with a notch worn into its edge, a short bar and a wooden grip."""
    m.lathe([(0.0, 0.0), (0.035, 0.012), (0.04, 0.03), (0.024, 0.05)], "DarkSteel", sides=6)
    m.lathe([(0.024, 0.05), (0.028, 0.12), (0.024, 0.2)], "Wood", sides=6)
    m.box((0, 0, 0.21), (0.12, 0.05, 0.025), "DarkSteel")
    m.blade([(0.22, 0.04, 0.04, 0.012, 0), (0.33, 0.04, 0.04, 0.012, 0), (0.35, 0.025, 0.04, 0.012, 0),
             (0.38, 0.037, 0.037, 0.011, 0), (0.44, 0.03, 0.03, 0.01, 0)], (0, 0.52), "Steel")


def thiefknife(m):
    """A slim throwing knife: no guard, a bound grip, a ring for a pommel, a single keen edge."""
    m.torus(V(0, 0, 0.02), V(0, 1, 0), 0.03, 0.009, "DarkSteel", segments=8)
    m.wrap(0.045, 0.19, 0.02, "DarkBrown", "DarkSteel", bands=3)
    m.blade([(0.19, 0.03, 0.012, 0.009, 0), (0.34, 0.03, 0.012, 0.008, 0.004), (0.43, 0.02, 0.01, 0.007, 0.004)],
            (0.01, 0.52), "LightSteel", back_sharp=False)


def fangtooth(m):
    """A beast's fang for a blade, bone for a grip, cord wound round it."""
    m.lathe([(0.0, 0.0), (0.03, 0.015), (0.026, 0.04)], "White", sides=6)
    m.wrap(0.04, 0.19, 0.024, "White", "DarkBrown", bands=3)
    stations = []
    for i, z in enumerate((0.2, 0.28, 0.36, 0.44)):
        u = i / 3
        stations.append((z, 0.05 - u * 0.02, 0.025 - u * 0.008, 0.016 - u * 0.004, -0.06 * u * u))
    m.blade(stations, (-0.09, 0.54), "White", back_sharp=False)


def nightedge(m):
    """A black wavy blade in the kris manner, and a guard swept back like wings."""
    m.shard(V(0, 0, 0.04), V(0, 0, -1), 0.04, 0.03, "Black", sides=5)
    m.lathe([(0.022, 0.04), (0.025, 0.12), (0.022, 0.19)], "Black", sides=6)
    for sx in (-1, 1):
        m.slab([(0, 0.18), (sx * 0.09, 0.14), (sx * 0.1, 0.17), (sx * 0.02, 0.21)], 0.03, "DarkSteel", chamfer=0.006)
    stations = []
    for i, z in enumerate((0.21, 0.27, 0.33, 0.39, 0.45)):
        stations.append((z, 0.036 - i * 0.003, 0.036 - i * 0.003, 0.01, 0.018 * (1 if i % 2 else -1)))
    m.blade(stations, (0.0, 0.56), "DarkSteel")


def adderfang(m):
    """A serpent's knife: the guard is a snake's open head, fangs bared, the blade its tongue."""
    m.lathe([(0.0, 0.0), (0.03, 0.02), (0.024, 0.04)], "Green", sides=6)
    m.wrap(0.04, 0.18, 0.023, "DarkBrown", "Green", bands=4)
    m.lathe([(0.03, 0.18), (0.05, 0.2), (0.045, 0.24), (0.02, 0.26)], "DarkSteel", sides=6, squash=(1.3, 0.8))
    for sx in (-1, 1):
        m.shard(V(sx * 0.03, 0.0, 0.25), V(sx * 0.4, 0, 1), 0.06, 0.012, "White")
        m.shard(V(sx * 0.04, -0.03, 0.22), V(0, -1, 0), 0.015, 0.01, "Red", sides=5)
    stations = [(0.26, 0.03, 0.03, 0.01, 0), (0.33, 0.034, 0.034, 0.01, 0.02), (0.41, 0.03, 0.03, 0.009, -0.01)]
    m.blade(stations, (0.012, 0.52), "Steel")


def venomkiss(m):
    """A stiletto with a vial of venom set in its guard, and a groove to carry it down the blade."""
    m.lathe([(0.0, 0.0), (0.03, 0.015), (0.02, 0.035)], "Gold", sides=8)
    m.lathe([(0.018, 0.035), (0.022, 0.12), (0.018, 0.19)], "Black", sides=8)
    m.lathe([(0.03, 0.19), (0.05, 0.2), (0.05, 0.215), (0.03, 0.225)], "Gold", sides=8)
    m.shard(V(0, -0.045, 0.207), V(0, -1, 0), 0.025, 0.02, "Green", sides=6)
    m.shard(V(0, 0.045, 0.207), V(0, 1, 0), 0.025, 0.02, "Green", sides=6)
    m.blade([(0.225, 0.018, 0.018, 0.012, 0), (0.4, 0.012, 0.012, 0.01, 0)], (0, 0.56), "LightSteel", fuller=0.6)


DAGGERS = {
    "dirk": ("Notched Dirk", dirk),
    "thiefknife": ("Thief's Knife", thiefknife),
    "fangtooth": ("Fangtooth", fangtooth),
    "nightedge": ("Nightedge", nightedge),
    "adderfang": ("Adderfang", adderfang),
    "venomkiss": ("Venomkiss", venomkiss),
}


# --- bows ---------------------------------------------------------------------------------------
# Limbs along Z with the grip at the middle, the back of the bow on +X (towards the
# target) and the string on the archer's side. Held like a sword — the handle runs
# through the fist, limbs out of either end of it — at the grip point the wrap sets.

def bow_path(length, depth, recurve=0.0, steps=10):
    """The curve of a braced bow: the grip forward, the limbs drawing back to the tips."""
    pts = []
    for i in range(steps + 1):
        t = -1 + 2 * i / steps
        x = depth * (1 - t * t)
        if recurve:
            x += recurve * max(0.0, abs(t) - 0.75) ** 2 * 16
        pts.append(V(x, 0, (t + 1) * length / 2))
    return pts


def limbs(m, path, grip_r, tip_r, mat, sides=6):
    n = len(path) - 1
    radii = [tip_r + (grip_r - tip_r) * (1 - abs(-1 + 2 * i / n)) ** 0.7 for i in range(n + 1)]
    m.tube(path, radii, mat, sides=sides)


def string(m, path, mat="White"):
    top, bottom = path[-1], path[0]
    m.tube([bottom + V(-0.012, 0, 0.01), top + V(-0.012, 0, -0.01)], 0.004, mat, sides=4)


def grip(m, z, r, mat="DarkBrown", band="DarkWood", x=0.0):
    # The fist closes round this wrap, and it sits on the bow's back — nowhere
    # near the origin the game would otherwise centre on.
    m.grip = (x, 0.0, z)
    m.lathe([(r, z - 0.07), (r * 1.15, z - 0.05), (r * 1.15, z + 0.05), (r, z + 0.07)], mat, sides=6, centre=(x, 0))


def shortbow(m):
    """A short hunting bow: one plain arc of wood and a leather grip."""
    path = bow_path(0.9, 0.12)
    limbs(m, path, 0.024, 0.01, "Wood")
    string(m, path)
    grip(m, 0.45, 0.028, x=0.12)


def hunterbow(m):
    """A hunter's bow: a longer self bow, horn nocks at the tips, a thick bound grip."""
    path = bow_path(1.1, 0.13)
    limbs(m, path, 0.026, 0.011, "DarkWood")
    string(m, path)
    grip(m, 0.55, 0.031, x=0.13)
    for p in (path[0], path[-1]):
        m.shard(p, V(-0.3, 0, 1 if p.z > 0.5 else -1), 0.05, 0.014, "White")


def recurve(m):
    """A recurve: limbs that flick forward again at the tips, tipped in bone."""
    path = bow_path(1.0, 0.1, recurve=0.07)
    limbs(m, path, 0.026, 0.01, "DarkWood")
    string(m, path)
    grip(m, 0.5, 0.03, x=0.1)
    for p in (path[0], path[-1]):
        m.lathe([(0.013, p.z - 0.03), (0.016, p.z), (0.0, p.z + (0.04 if p.z > 0.5 else -0.04))], "White", sides=5, centre=(p.x, 0))


def hoarstring(m):
    """A bow grown over with frost: ice shards bristling back along both limbs."""
    path = bow_path(1.0, 0.12)
    limbs(m, path, 0.025, 0.011, "Wood")
    string(m, path, "LightBlue")
    grip(m, 0.5, 0.03, x=0.12)
    for i in (2, 3, 4, 6, 7, 8):
        p = path[i]
        m.shard(p + V(0.01, 0, 0), V(1, 0, 0.6 if p.z > 0.5 else -0.6), 0.07, 0.018, "LightBlue")


def yewlongbow(m):
    """A yew longbow: taller than its archer, slim, pale sapwood on the back."""
    path = bow_path(1.5, 0.11, steps=14)
    limbs(m, path, 0.024, 0.009, "Wood")
    back = [p + V(0.012, 0, 0) for p in path]
    limbs(m, back, 0.014, 0.005, "White")
    string(m, path)
    grip(m, 0.75, 0.028, x=0.11)


def gildedbow(m):
    """A ceremonial bow: gold limbs that sweep into wings beside the grip, and curled tips."""
    path = bow_path(1.0, 0.13, recurve=0.05)
    limbs(m, path, 0.026, 0.011, "Gold")
    string(m, path)
    grip(m, 0.5, 0.032, mat="Red", x=0.13)
    for sz in (1, -1):
        z = 0.5 + sz * 0.09
        m.slab([(0.13, z), (0.22, z + sz * 0.05), (0.2, z + sz * 0.13), (0.15, z + sz * 0.06)], 0.02, "Gold", chamfer=0.004)


def ruinstring(m):
    """A cruel black bow: barbs down both limbs and a red grip."""
    path = bow_path(1.05, 0.13)
    limbs(m, path, 0.027, 0.011, "Black")
    string(m, path, "Red")
    grip(m, 0.525, 0.032, mat="Red", x=0.13)
    for i in (1, 2, 3, 7, 8, 9):
        p = path[i]
        m.shard(p, V(0.8, 0, 0.8 if p.z > 0.5 else -0.8), 0.08, 0.018, "Black")


BOWS = {
    "shortbow": ("Shortbow", shortbow),
    "hunterbow": ("Hunter's Bow", hunterbow),
    "recurve": ("Recurve Bow", recurve),
    "hoarstring": ("Hoarstring", hoarstring),
    "yewlongbow": ("Yew Longbow", yewlongbow),
    "gildedbow": ("Gilded Bow", gildedbow),
    "ruinstring": ("Ruinstring", ruinstring),
}


# --- staves ---------------------------------------------------------------------------------------
# Butt at z = 0, head at the top. Held about a third of the way up (`grip`).

def ferrule(m, r=0.028):
    m.lathe([(0.0, -0.02), (r * 1.1, 0.0), (r, 0.05)], "DarkSteel", sides=6)


def apprenticestaff(m):
    """A plain quarterstaff with an iron ferrule and a turned knob at the head."""
    ferrule(m)
    m.lathe([(0.025, 0.05), (0.024, 1.3)], "Wood", sides=6)
    m.lathe([(0.028, 1.3), (0.045, 1.34), (0.05, 1.39), (0.03, 1.44), (0.0, 1.46)], "DarkWood", sides=8)


def oakenstave(m):
    """A gnarled oak stave, twisting as it rises into a heavy burl."""
    ferrule(m, 0.03)
    path = [V(0.008 * math.sin(i * 0.9), 0.006 * math.cos(i * 0.7), 0.05 + i * 0.12) for i in range(11)]
    m.tube(path, [0.03 - i * 0.001 for i in range(11)], "Wood", sides=6)
    top = path[-1]
    m.lathe([(0.03, top.z - 0.02), (0.07, top.z + 0.04), (0.075, top.z + 0.1), (0.04, top.z + 0.16), (0.0, top.z + 0.18)],
            "DarkWood", sides=7, centre=(top.x, top.y))
    for k in range(3):
        a = k * 2.1
        m.shard(V(top.x, top.y, top.z + 0.08), V(math.cos(a), math.sin(a), 0.5), 0.07, 0.02, "DarkWood")


def pilgrimstaff(m):
    """A pilgrim's staff: long and straight, a crook at the head, a bone charm tied beneath it."""
    ferrule(m)
    m.lathe([(0.024, 0.05), (0.023, 1.3)], "DarkWood", sides=6)
    hook = [V(0, 0, 1.3), V(0, 0, 1.42), V(0.04, 0, 1.5), V(0.12, 0, 1.52), V(0.17, 0, 1.46), V(0.16, 0, 1.38)]
    m.tube(hook, [0.023, 0.022, 0.021, 0.02, 0.019, 0.017], "DarkWood", sides=6)
    m.lathe([(0.03, 1.24), (0.034, 1.27), (0.03, 1.3)], "White", sides=6)
    m.tube([V(0.02, 0, 1.26), V(0.05, 0, 1.18)], 0.004, "DarkBrown", sides=4)
    m.shard(V(0.05, 0, 1.18), V(0, 0, -1), 0.06, 0.02, "White", sides=5)


def thornstave(m):
    """A living staff: a vine-wound shaft bristling with thorns, still leafing at the head."""
    ferrule(m)
    m.lathe([(0.024, 0.05), (0.024, 1.3)], "Wood", sides=6)
    vine = [V(0.03 * math.cos(i * 0.9), 0.03 * math.sin(i * 0.9), 0.3 + i * 0.08) for i in range(13)]
    m.tube(vine, 0.009, "Green", sides=4)
    for i in range(2, 12, 2):
        p = vine[i]
        m.shard(p, V(p.x, p.y, 0.3), 0.05, 0.01, "DarkWood")
    for k in range(5):
        a = k * 2 * math.pi / 5
        m.shard(V(0, 0, 1.32), V(math.cos(a), math.sin(a), 1.2), 0.14, 0.03, "Green", sides=4, roll=a)


def runewood(m):
    """A dark staff banded with gold runes, splitting at the head into prongs that hold a crystal."""
    ferrule(m)
    m.lathe([(0.025, 0.05), (0.024, 1.25)], "DarkWood", sides=8)
    for z in (0.5, 0.7, 0.9, 1.1):
        m.lathe([(0.029, z - 0.012), (0.031, z), (0.029, z + 0.012)], "Gold", sides=8)
    for k in range(3):
        a = k * 2 * math.pi / 3
        d = V(math.cos(a), math.sin(a), 0)
        m.tube([V(0, 0, 1.24), V(0, 0, 1.24) + d * 0.05 + V(0, 0, 0.1), V(0, 0, 1.24) + d * 0.035 + V(0, 0, 0.24)], 0.012, "Gold", sides=4)
    m.shard(V(0, 0, 1.3), V(0, 0, 1), 0.2, 0.045, "Red", sides=6)
    m.shard(V(0, 0, 1.32), V(0, 0, -1), 0.06, 0.045, "Red", sides=6)


def starcaller(m):
    """A tall staff crowned with a ring, and in the ring a star that hangs without touching it."""
    ferrule(m)
    m.lathe([(0.024, 0.05), (0.022, 1.4)], "DarkWood", sides=8)
    m.lathe([(0.03, 1.38), (0.04, 1.42), (0.03, 1.46)], "LightSteel", sides=8)
    m.torus(V(0, 0, 1.58), V(0, 1, 0), 0.12, 0.013, "LightSteel", segments=12)
    m.tube([V(0, 0, 1.46), V(0, 0, 1.47)], 0.01, "LightSteel", sides=4)
    for k in range(5):
        a = k * 2 * math.pi / 5 + math.pi / 2
        m.shard(V(0, 0, 1.58), V(math.cos(a), 0, math.sin(a)), 0.07, 0.022, "LightBlue", sides=4)


STAVES = {
    "apprenticestaff": ("Apprentice's Staff", apprenticestaff),
    "oakenstave": ("Oaken Stave", oakenstave),
    "pilgrimstaff": ("Pilgrim's Staff", pilgrimstaff),
    "thornstave": ("Thornstave", thornstave),
    "runewood": ("Runewood Staff", runewood),
    "starcaller": ("Starcaller", starcaller),
}


# --- wands ------------------------------------------------------------------------------------------
# Butt at z = 0, business end at the top; held at the butt like anything with a handle.

def birchrod(m):
    """A birch rod: pale bark with dark rings, a knot at the tip."""
    m.lathe([(0.0, 0.0), (0.02, 0.01), (0.022, 0.12), (0.016, 0.5), (0.012, 0.58)], "White", sides=6)
    for z in (0.2, 0.31, 0.44):
        m.lathe([(0.019, z - 0.006), (0.02, z), (0.019, z + 0.006)], "DarkWood", sides=6)
    m.lathe([(0.014, 0.58), (0.024, 0.61), (0.0, 0.65)], "Wood", sides=6)


def iciclerod(m):
    """A rod that ends in a cluster of icicles."""
    m.wrap(0.0, 0.14, 0.02, "DarkBrown", "LightBlue", bands=2)
    m.lathe([(0.018, 0.14), (0.014, 0.5)], "LightSteel", sides=6)
    m.shard(V(0, 0, 0.5), V(0, 0, 1), 0.14, 0.03, "LightBlue", sides=5)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        m.shard(V(0, 0, 0.52), V(math.cos(a), math.sin(a), 1.8), 0.08, 0.018, "LightBlue", sides=4)


def emberwand(m):
    """A charred rod with an ember held in an iron claw."""
    m.lathe([(0.0, 0.0), (0.022, 0.01), (0.02, 0.14), (0.015, 0.46)], "Black", sides=6)
    m.lathe([(0.018, 0.46), (0.03, 0.48), (0.02, 0.5)], "DarkSteel", sides=6)
    for k in range(3):
        a = k * 2 * math.pi / 3
        m.tube([V(0, 0, 0.49), V(math.cos(a) * 0.04, math.sin(a) * 0.04, 0.55), V(math.cos(a) * 0.02, math.sin(a) * 0.02, 0.61)], 0.007, "DarkSteel", sides=4)
    m.lathe([(0.0, 0.52), (0.03, 0.55), (0.03, 0.58), (0.0, 0.61)], "Red", sides=6)


def arcwand(m):
    """A rod whose crystal floats inside a gold ring above the tip."""
    m.wrap(0.0, 0.14, 0.02, "DarkBrown", "Gold", bands=2)
    m.lathe([(0.018, 0.14), (0.014, 0.46)], "DarkWood", sides=6)
    m.lathe([(0.02, 0.46), (0.028, 0.48), (0.018, 0.5)], "Gold", sides=6)
    m.torus(V(0, 0, 0.6), V(0, 1, 0), 0.06, 0.009, "Gold", segments=10)
    m.shard(V(0, 0, 0.6), V(0, 0, 1), 0.05, 0.025, "Red", sides=6)
    m.shard(V(0, 0, 0.6), V(0, 0, -1), 0.05, 0.025, "Red", sides=6)


def stormrod(m):
    """A dark rod forking at the tip into two lightning prongs."""
    m.wrap(0.0, 0.14, 0.02, "DarkBrown", "LightBlue", bands=2)
    m.lathe([(0.018, 0.14), (0.015, 0.46)], "DarkSteel", sides=6)
    for sx in (-1, 1):
        bolt = [V(0, 0, 0.46), V(sx * 0.04, 0, 0.51), V(sx * 0.02, 0, 0.54), V(sx * 0.06, 0, 0.6), V(sx * 0.04, 0, 0.66)]
        m.tube(bolt, [0.012, 0.011, 0.01, 0.008, 0.001], "Gold", sides=4)


WANDS = {
    "birchrod": ("Birch Rod", birchrod),
    "iciclerod": ("Icicle Rod", iciclerod),
    "emberwand": ("Ember Wand", emberwand),
    "arcwand": ("Arcwand", arcwand),
    "stormrod": ("Stormrod", stormrod),
}


# --- off-hands -------------------------------------------------------------------------------------
# Shields face -Y, flat in the XZ plane, and are held with `lay: "flat"`.

def circle(cx, cz, r, n=12, start=0.0):
    return [(cx + math.cos(start + 2 * math.pi * i / n) * r, cz + math.sin(start + 2 * math.pi * i / n) * r) for i in range(n)]


def rim(m, points, thickness, mat, width=0.03, y=0.0):
    """A raised band round a shield's edge, following its outline."""
    n = len(points)
    for i in range(n):
        a, b = V(points[i][0], y, points[i][1]), V(points[(i + 1) % n][0], y, points[(i + 1) % n][1])
        m.tube([a, b], width * 0.5, mat, sides=4)


def plankshield(m):
    """Boards, a strap and optimism: five planks, two iron bands across them."""
    for i in range(5):
        x = -0.2 + i * 0.1
        top = 0.55 + 0.04 * (1 - abs(i - 2) / 2)
        m.box((x, 0, (0.0 + top) / 2), (0.095, 0.035, top), "Wood" if i % 2 else "DarkWood")
    for z in (0.14, 0.42):
        m.box((0, -0.025, z), (0.52, 0.015, 0.045), "DarkSteel")


def roundshield(m):
    """A round shield: a wooden board, an iron rim and a domed boss."""
    ring = circle(0, 0, 0.28, n=14)
    m.slab(ring, 0.035, "Wood", chamfer=0.006)
    rim(m, ring, 0.035, "DarkSteel", width=0.035)
    m.lathe([(0.07, 0.02), (0.065, -0.02), (0.04, -0.05), (0.0, -0.06)], "Steel", sides=8, axis="x")
    m.lathe([(0.0, -0.06), (0.05, -0.04), (0.07, -0.02)], "Steel", sides=8, axis="x", cap=False)


def kiteshield(m):
    """A kite shield: long enough to cover the leg, a raised rim and a cross on its face."""
    outline = [(-0.22, 0.5), (0.22, 0.5), (0.24, 0.3), (0.16, 0.05), (0.0, -0.3), (-0.16, 0.05), (-0.24, 0.3)]
    m.slab(outline, 0.035, "Steel", chamfer=0.01)
    rim(m, outline, 0.035, "DarkSteel", width=0.03)
    m.box((0, -0.03, 0.22), (0.05, 0.02, 0.44), "Red")
    m.box((0, -0.03, 0.34), (0.3, 0.02, 0.05), "Red")


def bulwark(m):
    """A tower shield: a tall slab of banded iron with spikes along its top."""
    outline = [(-0.25, -0.35), (0.25, -0.35), (0.27, 0.45), (0.0, 0.52), (-0.27, 0.45)]
    m.slab(outline, 0.045, "DarkSteel", chamfer=0.012)
    for z in (-0.15, 0.1, 0.35):
        m.box((0, -0.035, z), (0.54, 0.02, 0.05), "Steel")
    for x in (-0.18, 0.0, 0.18):
        m.shard(V(x, 0, 0.47 + (0.04 if x == 0 else 0)), V(0, 0, 1), 0.09, 0.025, "Steel")


def stillwardglass(m):
    """A shield of faceted crystal in a silver frame."""
    ring = circle(0, 0, 0.26, n=8, start=math.pi / 8)
    m.slab(ring, 0.05, "LightBlue", chamfer=0.03)
    rim(m, ring, 0.05, "LightSteel", width=0.03)
    m.shard(V(0, -0.05, 0), V(0, -1, 0), 0.06, 0.06, "LightBlue", sides=8)


def verdantaegis(m):
    """A shield shaped like a great leaf, veined, with a vine curling round its edge."""
    outline = [(0.0, 0.58), (0.16, 0.4), (0.24, 0.15), (0.2, -0.1), (0.0, -0.32), (-0.2, -0.1), (-0.24, 0.15), (-0.16, 0.4)]
    m.slab(outline, 0.035, "Green", chamfer=0.01)
    m.box((0, -0.03, 0.13), (0.025, 0.015, 0.8), "Wood")
    for sz in (0.0, 0.2, 0.38):
        for sx in (-1, 1):
            m.tube([V(0, -0.03, sz - 0.05), V(sx * 0.15, -0.03, sz + 0.06)], 0.008, "Wood", sides=4)
    rim(m, outline, 0.035, "Gold", width=0.022)


def silverbuckler(m):
    """A small fist-shield: a silver disc and a pointed star for a boss."""
    ring = circle(0, 0, 0.18, n=12)
    m.slab(ring, 0.03, "LightSteel", chamfer=0.008)
    rim(m, ring, 0.03, "Steel", width=0.03)
    for k in range(6):
        a = k * math.pi / 3
        m.shard(V(math.cos(a) * 0.02, -0.02, math.sin(a) * 0.02), V(math.cos(a), -0.6, math.sin(a)), 0.1, 0.025, "Steel")


def wardingfocus(m):
    """A caster's focus: an orb of power turning inside a gold ring on a short handle."""
    m.wrap(0.0, 0.14, 0.02, "DarkBrown", "Gold", bands=2)
    m.lathe([(0.02, 0.14), (0.03, 0.17), (0.02, 0.2)], "Gold", sides=6)
    m.torus(V(0, 0, 0.32), V(0, 1, 0), 0.12, 0.014, "Gold", segments=12)
    m.torus(V(0, 0, 0.32), V(1, 0, 0), 0.1, 0.01, "Gold", segments=12)
    m.lathe([(0.0, 0.25), (0.05, 0.28), (0.065, 0.32), (0.05, 0.36), (0.0, 0.39)], "LightBlue", sides=8)


def hunterquiver(m):
    """A quiver: a leather tube with a strap, full of fletched arrows."""
    m.lathe([(0.0, 0.0), (0.06, 0.01), (0.065, 0.1), (0.07, 0.42), (0.06, 0.44)], "DarkBrown", sides=8, cap=True)
    for z in (0.1, 0.38):
        m.lathe([(0.071, z - 0.012), (0.074, z), (0.071, z + 0.012)], "Wood", sides=8)
    for k in range(5):
        a = k * 2 * math.pi / 5
        base = V(math.cos(a) * 0.03, math.sin(a) * 0.03, 0.4)
        m.tube([base, base + V(0, 0, 0.16)], 0.005, "Wood", sides=4)
        m.slab([(base.x - 0.018, 0.5), (base.x + 0.018, 0.5), (base.x + 0.012, 0.58), (base.x - 0.012, 0.58)], 0.004, "White", y=base.y)


def woodoffhand(m):
    """A bundle of kindling: split sticks tied round the middle with cord."""
    for k in range(7):
        a = k * 2 * math.pi / 7
        r = 0.035 if k else 0.0
        x, y = math.cos(a) * r, math.sin(a) * r
        m.tube([V(x, y, 0.0 + 0.02 * (k % 3)), V(x * 1.2, y * 1.2, 0.5 - 0.03 * (k % 2))], 0.014, "Wood" if k % 2 else "DarkWood", sides=5)
    for z in (0.14, 0.34):
        m.lathe([(0.058, z - 0.012), (0.062, z), (0.058, z + 0.012)], "DarkBrown", sides=8)


OFFHANDS = {
    "plankshield": ("Plank Shield", plankshield),
    "roundshield": ("Round Shield", roundshield),
    "kiteshield": ("Kite Shield", kiteshield),
    "bulwark": ("Bulwark", bulwark),
    "stillwardglass": ("Stillward Glass", stillwardglass),
    "verdantaegis": ("Verdant Aegis", verdantaegis),
    "silverbuckler": ("Silvered Buckler", silverbuckler),
    "wardingfocus": ("Warding Focus", wardingfocus),
    "hunterquiver": ("Hunter's Quiver", hunterquiver),
    "woodoffhand": ("Bundled Kindling", woodoffhand),
}

RECIPES = {**SWORDS, **AXES, **MACES, **DAGGERS, **BOWS, **STAVES, **WANDS, **OFFHANDS}
FAMILIES = {
    "swords": SWORDS, "axes": AXES, "maces": MACES, "daggers": DAGGERS,
    "bows": BOWS, "staves": STAVES, "wands": WANDS, "offhands": OFFHANDS,
}


def build(item_id):
    name, fn = RECIPES[item_id]
    m = Model(item_id)
    fn(m)
    return name, m.finish()
