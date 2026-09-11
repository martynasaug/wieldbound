// What a character looks like: which body they wear, what is in their hand, and
// what armour is strapped on top. The 3D answer to Phase 45's paperdoll.
//
// Three ideas carry the whole file, and two of them are the paperdoll's own,
// restated for a rig instead of a sprite sheet.
//
// 1. STYLE PICKS THE SHAPE, RARITY ONLY TINTS IT. `GearStyle` chooses which
//    mesh gets built; `ItemRarity` multiplies its colour and touches nothing
//    else. Baking the two together would need styles x rarities meshes, and
//    could never tint plate without also staining skin — the exact failure the
//    2D version was built to avoid.
//
// 2. ARMOUR IS AUTHORED IN RIG COORDINATES, NOT BONE COORDINATES. Every piece
//    below is modelled in the space the rig itself measures in — feet at y=0,
//    head bone at y~209, top of skull at y~290, +Z forward — and then handed to
//    a holder that cancels its bone's rest pose (see `Actor.holderFor`). So a
//    helm is written as "a dome at y=258, radius 34" rather than as an offset
//    buried inside some bone's rotated local frame, and it still rides the head
//    for free. The numbers come from measuring the rig's own vertices, not from
//    eyeballing: the four class bodies agree on every bone to within about one
//    unit in three hundred, which is why one set of armour fits all of them.
//
// 3. WEAPONS ARE HARVESTED FROM THE RIGS THAT AUTHORED THEM. Each character FBX
//    ships its weapon already parented to `WeaponR` with the right offset,
//    rotation and scale. Rather than copy those into constants that can drift,
//    the mesh is lifted off its native rig complete with its local transform —
//    so a grip is never tuned by eye, it is the grip the artist exported. Axe
//    and mace, which the pack has no model for, are built procedurally inside
//    the *sword's* geometry space, so they inherit that grip without a constant
//    of their own.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  RARITIES,
  RARITY_ORDER,
  type CharacterClass,
  type GearStyle,
  type ItemRarity,
  type ItemSlot,
  type WeaponType,
} from "../../../shared/protocol-types";
import { loadModel } from "./assets";
import { donorPart, type DonorPartId } from "./wardrobe";
import { PALETTES, itemBase, type PaletteDef } from "../../../shared/items";

// --- Bodies ---------------------------------------------------------------
// Class is worn, so the silhouette is worn too: pick up a staff and you are not
// a warrior holding a staff, you are a robed mage. Bare-handed maps to the
// Monk, the one body in the pack that reads as "carries nothing" rather than as
// a disarmed soldier — which is exactly what Adventurer is meant to be.
/**
 * The body. One of them, for everybody, at every moment.
 *
 * This was a `Record<CharacterClass, string>` — four bodies, picked by whatever
 * was in your hand — and it read as the strongest expression of the game's one
 * rule: pick up a staff and you do not become a soldier holding a staff, you
 * become a robed mage. It was in the README as a headline.
 *
 * It was a rendering constraint. The kit welds each character's mesh to its
 * animations in one file; the only sword swing in the project is inside the
 * Warrior file, so holding a sword meant BEING the Warrior. `clips.ts` unwelds
 * them — all five rigs share one 44-bone skeleton — and with the animations
 * pooled there is no longer any reason for the person to change when the tool
 * does.
 *
 * The rule itself is untouched, and it was always the more interesting half:
 * what you hold still decides your class, your skill bar, your reach, your mana
 * pool and your damage attribute. It now also decides how you SWING. What it no
 * longer decides is who you are, which was never something a weapon should get
 * to say.
 *
 * Monk, because it is what a character with nothing in its hands already was:
 * the plainest silhouette of the five, the only one with genuinely empty hands,
 * and the one least dressed as a profession before you have chosen one.
 */
/**
 * The body the player wears.
 *
 * SWITCHABLE WHILE THERE ARE TWO. `Player_Base.glb` is ours —
 * `tools/art/player_rig.py` builds it, and it carries its own nine clips
 * including the chop, mine and pick that no borrowed pack has. The Monk is
 * Quaternius's, and the whole of the game's animation vocabulary is
 * twenty-five clips harvested off it and its four siblings.
 *
 * Both are kept for now because "does the new body look right" is a question
 * about the GAME's camera at the GAME's distance, and the only way to answer it
 * is to stand them side by side:
 *
 *     http://localhost:5173/            the Monk, as before
 *     http://localhost:5173/?body=new   ours
 *
 * Read once at module load rather than per actor, so every character in a
 * session is the same body — a world with one of each would answer nothing.
 */
const WANT_NEW_BODY =
  typeof location !== "undefined" && new URLSearchParams(location.search).get("body") === "new";
export const PLAYER_BODY = WANT_NEW_BODY ? "Player_Base.glb" : "Monk";

/**
 * The body whose clips come from the pooled library rather than from itself.
 *
 * Only the Monk. `clips.ts` exists to unweld twenty-five animations off five
 * rigs that share a skeleton; a body that ships its own does not want any of
 * that, and `Actor.buildActions` reads its `instance.animations` instead.
 */
export const POOLED_CLIP_BODY = "Monk";

// Every body carries its own weapon baked into the scene graph, so they all
// have to go: otherwise a ranger who picks up a sword walks around holding both
// and the Monk's empty hands are the only honest state in the set.
export const BUILTIN_WEAPON_MESHES = new Set([
  "Warrior_Sword",
  "Ranger_Bow",
  "Wizard_Staff",
  "Rogue_Dagger",
  "Cleric_Staff",
]);

// --- Rarity ---------------------------------------------------------------
// One tint table, multiplied over whatever colour the piece's material role
// already carries. That is what keeps the two axes independent: a plate
// chestpiece and a leather one take the same epic tint and stay recognisably
// plate and leather, and no rarity can ever reach skin, because skin is not a
// gear material.
// Seven steps now, and they are read straight off the shared ladder rather
// than re-typed here — the same table the interface colours a bag slot with, so
// a Runed sword in your hand and a Runed sword in your bag cannot be different
// shades of the same word. Multiplied over whatever colour the piece's material
// role already carries, which is what keeps the two axes independent: a plate
// chestpiece and a leather one take the same Enchanted tint and stay
// recognisably plate and leather, and no quality can ever reach skin, because
// skin is not a gear material.
const RARITY_TINT: Record<ItemRarity, number> = Object.fromEntries(
  RARITY_ORDER.map((r) => [r, Number.parseInt(RARITIES[r].color.slice(1), 16)]),
) as Record<ItemRarity, number>;

// Only the top two glow, and that is the whole reason to have a glow at all: a
// hue shift gets lost against grass at any distance, and a lift that everything
// has is a lift that says nothing. `RarityDef.glow` decides which, so the
// interface and the world agree about where the line is.
const RARITY_GLOW: Record<ItemRarity, number> = Object.fromEntries(
  RARITY_ORDER.map((r) => [r, RARITIES[r].glow ? 0x2a2038 : 0x000000]),
) as Record<ItemRarity, number>;

/** What a piece is made of. The style picks this; rarity never does. */
type MaterialRole = "metal" | "leather" | "cloth" | "dark";

const ROLE_BASE: Record<MaterialRole, { color: number; roughness: number; metalness: number }> = {
  metal: { color: 0xb9bec6, roughness: 0.42, metalness: 0.55 },
  leather: { color: 0xa8825a, roughness: 0.88, metalness: 0.0 },
  cloth: { color: 0xa89880, roughness: 0.95, metalness: 0.0 },
  // Visor slits and eye holes. Deliberately exempt from tinting: a gold-tinted
  // hole stops reading as a hole.
  dark: { color: 0x17161a, roughness: 0.7, metalness: 0.2 },
};

function roleMaterial(role: MaterialRole, rarity: ItemRarity): THREE.MeshStandardMaterial {
  const base = ROLE_BASE[role];
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(base.color),
    roughness: base.roughness,
    metalness: base.metalness,
    flatShading: true,
  });
  if (role !== "dark") {
    mat.color.multiply(new THREE.Color(RARITY_TINT[rarity]));
    mat.emissive = new THREE.Color(RARITY_GLOW[rarity]);
  }
  return mat;
}

/** Recolours a harvested weapon material by rarity without disturbing its map. */
function tintedClone(source: THREE.Material, rarity: ItemRarity): THREE.Material {
  const mat = (source as THREE.MeshStandardMaterial).clone();
  mat.color.multiply(new THREE.Color(RARITY_TINT[rarity]));
  if (mat.emissive) mat.emissive.setHex(RARITY_GLOW[rarity]);
  return mat;
}

/** Flat-shaded metal for the weapons the pack has no model for. */
function forgedMaterial(rarity: ItemRarity): THREE.Material[] {
  return [roleMaterial("metal", rarity), roleMaterial("leather", rarity)];
}

// --- Geometry helpers -----------------------------------------------------

/** Merges parts, forcing non-indexed first: the primitives disagree about
 *  indexing (icosahedra are not indexed, boxes are) and merge refuses a mix.
 *  Flat shading wants non-indexed anyway. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(flat, false);
  if (!out) throw new Error("gear: geometry merge failed");
  out.computeVertexNormals();
  return out;
}

/** A squat 8-sided shell — the workhorse for torsos, cuffs and skirts. */
function shell(
  rTop: number,
  rBottom: number,
  height: number,
  at: [number, number, number],
  depthScale = 1,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, height, 8, 1, true);
  g.scale(1, 1, depthScale);
  g.translate(at[0], at[1], at[2]);
  return g;
}

function box(
  size: [number, number, number],
  at: [number, number, number],
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  g.translate(at[0], at[1], at[2]);
  return g;
}

/** Top half of a squashed sphere: skullcaps, pauldrons, dome crowns. */
function dome(
  radius: number,
  at: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(radius, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(scale[0], scale[1], scale[2]);
  g.translate(at[0], at[1], at[2]);
  return g;
}

/**
 * A hanging cloth panel, described as a stack of rings the cape passes through:
 * each row gives a height, a depth and a half-width. Built by hand rather than
 * from a primitive because a cape's whole character is that it narrows at the
 * shoulders, bells out at the hem, and drifts backwards on the way down —
 * none of which a cylinder can be talked into.
 */
function drape(rows: { y: number; z: number; halfWidth: number }[]): THREE.BufferGeometry {
  const verts: number[] = [];
  const uvs: number[] = [];
  // UVs carry no texture here, but they are not optional: the primitives
  // this gets merged with all have them, and `mergeGeometries` refuses a set
  // of geometries that disagree about which attributes exist.
  const quad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    u0: number, u1: number, v0: number, v1: number,
  ) => {
    verts.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    verts.push(ax, ay, az, cx, cy, cz, dx, dy, dz);
    uvs.push(u0, v0, u1, v0, u1, v1);
    uvs.push(u0, v0, u1, v1, u0, v1);
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const t = rows[i];
    const b = rows[i + 1];
    // Split each row in two so the cape has a soft crease down the spine
    // instead of reading as a flat board.
    const bulge = 6;
    const v0 = i / (rows.length - 1);
    const v1 = (i + 1) / (rows.length - 1);
    quad(
      -t.halfWidth, t.y, t.z, 0, t.y, t.z - bulge, 0, b.y, b.z - bulge, -b.halfWidth, b.y, b.z,
      0, 0.5, v0, v1,
    );
    quad(
      0, t.y, t.z - bulge, t.halfWidth, t.y, t.z, b.halfWidth, b.y, b.z, 0, b.y, b.z - bulge,
      0.5, 1, v0, v1,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// --- Armour ---------------------------------------------------------------

/** One mesh and the rig bone it rides. A style may produce several. */
export interface GearAttachment {
  bone: string;
  object: THREE.Object3D;
  /**
   * Whether this piece is authored in the BONE's own space rather than the
   * model's rest frame.
   *
   * Two coordinate systems, and mixing them up is the whole difficulty of
   * adding harvested parts to a generated set. Everything `gear.ts` builds is
   * authored in rest-frame coordinates — `[0, chestMid, -4]`, absolute
   * positions on a standing character — and `Actor.holderFor` exists precisely
   * to hang that off a bone without the bone's own transform disturbing it.
   * Everything harvested in `wardrobe.ts` arrives the other way round: it was
   * a CHILD of its bone in the donor file and carries the local offset that put
   * it there. Sent through the holder it would be offset twice, and the failure
   * is a pauldron floating a metre from the shoulder rather than anything that
   * looks like a coordinate bug.
   */
  boneLocal?: boolean;
}

/** A part before it becomes a mesh: geometry plus what it is made of. */
interface Part {
  bone: string;
  role: MaterialRole;
  /** Set for harvested parts. See `GearAttachment.boneLocal`. */
  local?: { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };
  geometry: THREE.BufferGeometry;
}

// Rig landmarks the pieces below are measured against, all from the per-bone
// vertex extents of the four class bodies. Named rather than inlined so a
// change to the rig has one place to land.
// The crown of the tallest of the four skulls (the Monk's, at 295). Head gear
// is sized to clear this with room to spare: a dome that stops even slightly
// short does not read as "a slightly small helmet", it lets the skull erupt
// through the top and leaves only a ring visible round the ears.
const HEAD_TOP = 296;
const HEAD_BOTTOM = 205;
const HEAD_HALF_WIDTH = 33;
const HEAD_FRONT_Z = 32;
const HEAD_BACK_Z = -46;
const CHEST_TOP = 202;
const CHEST_BOTTOM = 150;
const WAIST_Y = 146;
const SHOULDER_X = 35;
const SHOULDER_Y = 187;
const FOOT_Y = 5;
const FOOT_Z = 11;
const FOOT_X = 23.6;
const SHIN_Y = 34;
const SHIN_X = 22;

function helmParts(style: GearStyle, _rarity: ItemRarity): Part[] {
  const mid = (HEAD_TOP + HEAD_BOTTOM) / 2;

  if (style === "cap") {
    // A skullcap: grips the crown and leaves the whole face alone.
    const brow = mid + 6;
    return [{ bone: "Head", role: "metal", geometry: merge([
      dome(HEAD_HALF_WIDTH + 7, [0, brow, -6], [1, 1.4, 1.2]),
      shell(HEAD_HALF_WIDTH + 9, HEAD_HALF_WIDTH + 9, 10, [0, brow + 2, -6], 1.2),
    ]) }];
  }

  if (style === "hood") {
    // The kit's own cowl, which is the piece this generated one was reaching
    // for: a real hood with a lip, a fold and a fall at the back, and it lands
    // on the Monk's skull at the size it was authored for because every rig in
    // the pack shares the head bone it was hung from.
    const cowl = donor("hood", "cloth");
    if (cowl) return [cowl];
    // A cowl: swallows the whole skull and trails down the back.
    return [{ bone: "Head", role: "cloth", geometry: merge([
      dome(HEAD_HALF_WIDTH + 11, [0, mid, -8], [1, 1.4, 1.2]),
      shell(HEAD_HALF_WIDTH + 12, HEAD_HALF_WIDTH + 6, 44, [0, mid - 20, -8], 1.2),
      // The drape down the back, which is what separates a hood from a helmet.
      drape([
        { y: mid - 30, z: HEAD_BACK_Z + 8, halfWidth: 34 },
        { y: mid - 54, z: HEAD_BACK_Z + 4, halfWidth: 29 },
        { y: mid - 72, z: HEAD_BACK_Z - 2, halfWidth: 20 },
      ]),
    ]) }];
  }

  if (style === "circlet") {
    // A BAND, NOT A BUCKET. `GEAR_STYLES` declares five head styles and this
    // file implemented two, so `circlet` and `horned` both fell through to the
    // closed great helm below — five of the twelve helms in the catalogue
    // rendering as something else entirely. A Gilded Crown, a Silver Circlet
    // and a Galecrown all arrived as a face-hiding bucket with a visor slit,
    // which is why the seeded character has been photographed in one for weeks.
    //
    // The point of a circlet is that it leaves the head alone: worn on the brow
    // above the eyes, with the face and hair still visible. It is the only head
    // piece that shows who is wearing it.
    const brow = mid + 20;
    const front = HEAD_FRONT_Z - 4;
    return [{ bone: "Head", role: "metal", geometry: merge([
      shell(HEAD_HALF_WIDTH + 4, HEAD_HALF_WIDTH + 4, 9, [0, brow, -6], 1.2),
      // A tall point over the brow and two shorter ones at the temples, which
      // is what separates a crown from a headband at this size.
      box([9, 21, 5], [0, brow + 13, front]),
      box([6, 13, 5], [-21, brow + 9, front - 7]),
      box([6, 13, 5], [21, brow + 9, front - 7]),
    ]) }];
  }

  if (style === "horned") {
    // The cap's own crown, so a Horned Helm is a helmet with horns rather than
    // a separate hat, and then a horn on each side sweeping out and up. Built
    // from stepped boxes because the primitives here are all axis-aligned —
    // `shell` has no rotation — and a faceted horn suits the rig anyway.
    const brow = mid + 6;
    const horn = (side: -1 | 1): THREE.BufferGeometry[] => [
      box([16, 15, 16], [side * 41, brow + 6, -4]),
      box([13, 15, 13], [side * 51, brow + 19, -4]),
      box([10, 14, 10], [side * 58, brow + 32, -4]),
      box([7, 13, 7], [side * 61, brow + 44, -4]),
      box([4, 10, 4], [side * 62, brow + 54, -4]),
    ];
    return [{ bone: "Head", role: "metal", geometry: merge([
      dome(HEAD_HALF_WIDTH + 7, [0, brow, -6], [1, 1.3, 1.2]),
      shell(HEAD_HALF_WIDTH + 9, HEAD_HALF_WIDTH + 9, 10, [0, brow + 2, -6], 1.2),
      ...horn(-1),
      ...horn(1),
    ]) }];
  }

  // "full" — a closed great helm. The one style that hides the face, so it
  // needs a slit or the character reads as headless.
  return [
    { bone: "Head", role: "metal", geometry: merge([
      shell(HEAD_HALF_WIDTH + 7, HEAD_HALF_WIDTH + 10, HEAD_TOP - HEAD_BOTTOM + 4, [0, mid + 3, -6], 1.2),
      dome(HEAD_HALF_WIDTH + 7, [0, HEAD_TOP - 2, -6], [1, 0.6, 1.2]),
      // Crest ridge, front to back over the crown.
      box([6, 18, 88], [0, HEAD_TOP - 4, -7]),
    ]) },
    { bone: "Head", role: "dark", geometry: box([50, 11, 8], [0, mid + 16, HEAD_FRONT_Z + 6]) },
  ];
}

function armorParts(style: GearStyle, _rarity: ItemRarity): Part[] {
  const parts: Part[] = [];
  // The cuirass stands proud of the ribs and reaches from the hips to the
  // collarbone. Hugging the torso exactly — which is what the first pass did —
  // reads as a cummerbund rather than as armour, because this rig is stylised
  // and its torso is only about a sixth of its height.
  const chestTop = CHEST_TOP + 8;
  const chestBottom = CHEST_BOTTOM - 12;
  const chestH = chestTop - chestBottom;
  const chestMid = (chestTop + chestBottom) / 2;

  if (style === "robe") {
    parts.push({ bone: "Torso", role: "cloth", geometry: merge([
      shell(26, 31, chestH, [0, chestMid, -4], 0.92),
      shell(22, 27, 14, [0, chestTop + 4, -4], 0.92),
    ]) });
    // The Wizard's little folded shoulder caps, which are a robe's shoulders
    // rather than armour's — the distinction the heavy pair cannot make.
    const softL = donor("pauldron-soft-l", "cloth");
    const softR = donor("pauldron-soft-r", "cloth");
    if (softL && softR) parts.push(softL, softR);
    // The skirt hangs from the waist, so it swings with the hips rather than
    // the chest — a robe pinned to the ribs slides up the legs when running.
    parts.push({ bone: "Abdomen", role: "cloth", geometry: 
      shell(29, 46, 76, [0, WAIST_Y - 38, -6], 0.95) });
    return parts;
  }

  if (style === "leather") {
    // Bracers, which is what leather armour has instead of pauldrons — and a
    // belt with a pouch on it, which is what leather armour has instead of a
    // waist plate. Four small harvested pieces, and between them they do more
    // for "this is a person who travels" than any amount of chest geometry.
    const guardL = donor("armguard-l", "leather");
    const guardR = donor("armguard-r", "leather");
    if (guardL && guardR) parts.push(guardL, guardR);
    const belt = donor("belt", "leather");
    const pouch = donor("pouch", "leather");
    if (belt) parts.push(belt);
    if (pouch) parts.push(pouch);
    parts.push({ bone: "Torso", role: "leather", geometry: merge([
      shell(27, 30, chestH - 10, [0, chestMid - 4, -4], 0.9),
      // Two broad straps crossing the chest — the cheapest way to say leather.
      box([13, 58, 6], [12, chestMid + 4, 25]),
      box([13, 58, 6], [-12, chestMid + 4, 25]),
    ]) });
    parts.push({ bone: "Abdomen", role: "leather", geometry:
      shell(30, 30, 13, [0, WAIST_Y, -6], 0.94) });
    return parts;
  }

  if (style === "chain") {
    // A bracer on the shield arm only, which is where a mail wearer puts one.
    const bracer = donor("bracer", "metal");
    if (bracer) parts.push(bracer);
    parts.push({ bone: "Torso", role: "metal", geometry:
      shell(28, 32, chestH, [0, chestMid, -4], 0.92) });
    parts.push({ bone: "Abdomen", role: "metal", geometry: merge([
      shell(31, 30, 14, [0, WAIST_Y, -6], 0.94),
      // A short mail skirt: the silhouette that separates chain from plate.
      shell(30, 38, 36, [0, WAIST_Y - 22, -6], 0.96),
    ]) });
    return parts;
  }

  // "plate", "scale" and "brigandine" — the heaviest look: a shaped cuirass, a
  // gorget at the throat, and real pauldrons on the arm bones so they swing
  // with the shoulders.
  parts.push({ bone: "Torso", role: "metal", geometry: merge([
    shell(30, 28, chestH, [0, chestMid, -4], 0.94),
    shell(24, 30, 16, [0, chestTop + 6, -4], 0.94),
  ]) });
  parts.push({ bone: "Abdomen", role: "metal", geometry: merge([
    shell(31, 33, 15, [0, WAIST_Y, -6], 0.96),
    // Tassets.
    box([26, 32, 20], [15, WAIST_Y - 20, -2]),
    box([26, 32, 20], [-15, WAIST_Y - 20, -2]),
  ]) });
  // THE PAULDRONS ARE HARVESTED WHERE THEY EXIST.
  //
  // The generated pair — a squashed dome with a shell under it — was built
  // because there was nothing else, and it is the one piece of the armour set
  // where the kit's own version is plainly better: the Warrior's shoulder plate
  // has a rolled lip, a bevel and a shape that reads as forged from any angle,
  // and no arrangement of two primitives gets there. Everything ELSE in this
  // file stays generated, because for a cuirass, a tasset and a mail skirt it
  // is the other way round.
  //
  // If the donor never loaded, the pair below is still here. A wardrobe that
  // takes a character's shoulders off when a file 404s is worse than a plain
  // pauldron.
  const heavyL = donor("pauldron-heavy-l", "metal");
  const heavyR = donor("pauldron-heavy-r", "metal");
  if (heavyL && heavyR) {
    parts.push(heavyL, heavyR);
    return parts;
  }
  for (const side of [1, -1] as const) {
    parts.push({
      bone: side > 0 ? "UpperArmL" : "UpperArmR",
      role: "metal",
      geometry: merge([
        dome(23, [side * (SHOULDER_X + 1), SHOULDER_Y + 2, -3], [1.15, 1.0, 1.2]),
        shell(23, 25, 11, [side * (SHOULDER_X + 1), SHOULDER_Y - 3, -3], 1.2),
      ]),
    });
  }
  return parts;
}

function bootsParts(style: GearStyle, _rarity: ItemRarity): Part[] {
  // WHAT THE BOOT IS MADE OF, which was "leather" for all four styles.
  //
  // The shape here is deliberately one boot with a `tall` cuff variant — a
  // greave and a sandal really are the same silhouette at this scale, and that
  // is a fair economy. The MATERIAL is not: Plated Greaves, Silvered Greaves
  // and Bronze-shod Boots were all drawn in leather, so the heaviest boots in
  // the game read as the lightest and took the leather base colour before the
  // rarity tint went anywhere near them.
  //
  // Same family of mistake as the helm styles in this file — a `GEAR_STYLES`
  // entry the builder never names — and `tools/test/gearstyles.mjs` now fails
  // when one appears.
  // All four named, including the one that takes the default. A ternary ending
  // in `: "leather"` is indistinguishable from having forgotten `low`, which is
  // the whole mistake this file just made twice — so the table says it out loud
  // and `gearstyles.mjs` can tell "handled" from "fell through".
  const BOOT_ROLE: Partial<Record<GearStyle, MaterialRole>> = {
    low: "leather",
    tall: "leather",
    plated: "metal",
    wrapped: "cloth",
  };
  const role: MaterialRole = BOOT_ROLE[style] ?? "leather";
  const parts: Part[] = [];
  for (const side of [1, -1] as const) {
    const x = side * FOOT_X;
    parts.push({
      bone: side > 0 ? "FootL" : "FootR",
      role,
      geometry: merge([
        box([21, 19, 46], [x, FOOT_Y + 2, FOOT_Z]),
        // Toe cap, so a boot is not simply a bigger foot.
        box([18, 12, 10], [x, FOOT_Y + 6, FOOT_Z + 23]),
      ]),
    });
    parts.push({
      bone: side > 0 ? "LowerLegL" : "LowerLegR",
      role,
      geometry: style === "tall"
        // The cuff rides the shin bone, so it bends at the knee with the leg.
        ? merge([
            shell(17, 18, 48, [side * SHIN_X, SHIN_Y + 6, 1], 1.0),
            shell(20, 17, 10, [side * SHIN_X, SHIN_Y + 32, 1], 1.0),
          ])
        : shell(18, 19, 24, [side * SHIN_X, 20, 1], 1.0),
    });
  }
  return parts;
}

function capeParts(_style: GearStyle, _rarity: ItemRarity): Part[] {
  return [
    {
      bone: "Torso",
      role: "cloth",
      geometry: drape([
        { y: CHEST_TOP + 6, z: -28, halfWidth: 26 },
        { y: CHEST_TOP - 24, z: -33, halfWidth: 36 },
        { y: CHEST_TOP - 62, z: -38, halfWidth: 40 },
        { y: CHEST_TOP - 104, z: -44, halfWidth: 42 },
        { y: CHEST_TOP - 140, z: -52, halfWidth: 36 },
      ]),
    },
  ];
}

const SLOT_BUILDERS: Partial<Record<ItemSlot, (s: GearStyle, r: ItemRarity) => Part[]>> = {
  helm: helmParts,
  armor: armorParts,
  boots: bootsParts,
  cape: capeParts,
};

// Geometry is style-only, so it is shared across rarities and across every
// player wearing the same look. Only the material differs per rarity, and
// materials are cheap.
const geometryCache = new Map<string, Part[]>();

function partsFor(slot: ItemSlot, style: GearStyle, rarity: ItemRarity): Part[] {
  const key = `${slot}|${style}`;
  let parts = geometryCache.get(key);
  if (!parts) {
    const build = SLOT_BUILDERS[slot];
    if (!build) return [];
    parts = build(style, rarity);
    geometryCache.set(key, parts);
  }
  return parts;
}

/**
 * The meshes for one equipped item, ready to be parented to the named bones.
 * Returns an empty list for slots with no look (ring), which is a real answer:
 * a ring is invisible at this camera and pretending otherwise would be noise.
 */
export function buildArmour(slot: ItemSlot, style: GearStyle, rarity: ItemRarity): GearAttachment[] {
  return partsFor(slot, style, rarity).map((part) => {
    const mesh = new THREE.Mesh(part.geometry, roleMaterial(part.role, rarity));
    mesh.name = `gear_${slot}_${style}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Capes and drapes are single sheets; without this the inside face vanishes
    // the moment the camera swings behind the character.
    (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    if (part.local) {
      mesh.position.copy(part.local.position);
      mesh.quaternion.copy(part.local.quaternion);
      mesh.scale.copy(part.local.scale);
    }
    return { bone: part.bone, object: mesh, boneLocal: !!part.local };
  });
}

/**
 * Turns a harvested piece into a `Part`, or nothing if its donor never arrived.
 *
 * The `role` is this project's, not the kit's: a harvested pauldron takes the
 * `metal` palette and the rarity tint over it, exactly as the generated one
 * does, so a Runed piece is the same shade whether it was modelled or built.
 * That is the point of routing these through `Part` at all rather than
 * attaching them directly — otherwise the wardrobe would be a second look with
 * a second colour scheme sitting next to the first.
 */
function donor(id: DonorPartId, role: MaterialRole): Part | null {
  const p = donorPart(id);
  if (!p) return null;
  return {
    bone: p.bone,
    role,
    geometry: p.geometry,
    local: { position: p.position, quaternion: p.quaternion, scale: p.scale },
  };
}

// --- Held items -------------------------------------------------------------
// What is in your hands, which since the catalogue arrived is a much bigger
// question than "which of four weapons".
//
// THE GRIP IS STILL HARVESTED, NOT AUTHORED. Every character rig ships its own
// weapon already parented to `WeaponR` with the right offset, rotation and
// scale, and that transform is the one piece of this that must not be guessed:
// a grip tuned by eye is wrong on the next animation and wrong again on the
// next body. So the donor sword is loaded once, its transform is kept, and
// every model in the catalogue is FITTED INTO ITS GEOMETRY SPACE — measured,
// rotated onto the same axis, scaled to the same length, and seated so its
// handle lands where the sword's handle lands.
//
// That is the same move `buildAxe` and `buildMace` already made for two
// procedural shapes, generalised to twenty-three downloaded ones. The payoff is
// that adding a weapon to the game is a row in `shared/items.ts` and a file on
// disk, with no grip constant anywhere.
//
// THE OFF-HAND HANGS OFF `FistL`. The pack authored no left socket — there is a
// `WeaponR` and nothing facing it — so this is the one transform in the file
// that IS authored, mirrored off the right hand's. It is marked as such below,
// because it is exactly the kind of constant that rots quietly.

/** Which pack material names map onto which palette role. */
const MATERIAL_ROLE: Record<string, "metal" | "wood" | "accent"> = {
  Steel: "metal", LightSteel: "metal", DarkSteel: "metal",
  Wood: "wood", LightWood: "wood", DarkWood: "wood", DarkBrown: "wood",
  Gold: "accent", LightGold: "accent", White: "accent", Black: "metal",
  Red: "accent", LightRed: "accent", Green: "accent", LightBlue: "accent",
};

export interface HeldWeapon {
  object: THREE.Object3D;
  /** Bone the object expects to be parented to. */
  bone: string;
}

/**
 * The donor grip: the sword the Warrior rig carries, with its local transform.
 *
 * Loaded once and shared. Everything held in the right hand is placed by
 * copying this transform and fitting itself into the box the sword occupies.
 */
interface Grip {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  bone: string;
  /** The donor's own geometry bounds, in its own space. */
  box: THREE.Box3;
}

let gripPromise: Promise<Grip | null> | null = null;

async function donorGrip(): Promise<Grip | null> {
  if (!gripPromise) gripPromise = loadGrip();
  return gripPromise;
}

async function loadGrip(): Promise<Grip | null> {
  const proto = await loadModel("Warrior");
  const donor = findMesh(proto, "Warrior_Sword");
  if (!donor) {
    console.warn("gear: the donor grip (Warrior_Sword) is missing; hands will be empty");
    return null;
  }
  donor.geometry.computeBoundingBox();
  return {
    position: donor.position.clone(),
    quaternion: donor.quaternion.clone(),
    scale: donor.scale.clone(),
    bone: donor.parent?.name ?? "WeaponR",
    box: donor.geometry.boundingBox!.clone(),
  };
}

function findMesh(root: THREE.Object3D, name: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && o.name === name && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  return found;
}

const heldCache = new Map<string, Promise<HeldWeapon | null>>();

/**
 * Held-item GEOMETRY, cached on what the geometry actually depends on.
 *
 * `heldCache` above is keyed `${baseId}|${rarity}|${hand}`, and that is right
 * for a prototype: the materials genuinely differ by rarity, and a left-hand
 * item is wrapped in a mirrored holder. The geometry differs by NEITHER.
 * `makeHeldItem` uses rarity in exactly two places, `paletteMaterial` and
 * `repaint`, and both make materials; `hand` only decides whether the finished
 * mesh gets a holder group around it. So keying the geometry the same way built
 * one byte-identical copy per rarity per hand — up to fourteen of every shape,
 * with a ceiling of 686 cached geometries for the 49 distinct ones this game
 * has.
 *
 * That ceiling is why the leak hunt took three sessions. A driven session meets
 * new (base, rarity, hand) combinations at a fairly steady rate as monsters
 * spawn carrying varied gear, so the geometry counter climbed at a flat
 * ~1.6/min for forty-five minutes and "never converged" — which reads as an
 * unbounded leak and is really a cache with a ceiling too distant to see. It
 * cannot be found by watching the counter, because the counter looks the same
 * either way; it is found by asking what each surviving geometry was built FROM.
 *
 * Keyed by the geometry's own inputs, so two items that would build the same
 * shape share one. The cache owns these forever, which is correct and bounded:
 * one per distinct shape, and there are 49 of those.
 */
const heldGeoCache = new Map<string, Promise<THREE.BufferGeometry>>();

function cachedHeldGeometry(
  key: string,
  build: () => THREE.BufferGeometry,
): Promise<THREE.BufferGeometry> {
  let g = heldGeoCache.get(key);
  if (!g) {
    g = Promise.resolve(build());
    heldGeoCache.set(key, g);
  }
  return g;
}

/**
 * The thing in a hand, by catalogue id.
 *
 * Cached per (item, quality, hand) as a prototype; every wielder gets a clone
 * with its own materials, because the wielder owns — and eventually disposes —
 * whatever it is handed.
 */
export async function buildHeldItem(
  baseId: string | undefined | null,
  rarity: ItemRarity,
  hand: "right" | "left" = "right",
): Promise<HeldWeapon | null> {
  if (!baseId) return null;
  const key = `${baseId}|${rarity}|${hand}`;
  let p = heldCache.get(key);
  if (!p) {
    p = makeHeldItem(baseId, rarity, hand);
    heldCache.set(key, p);
  }
  const proto = await p;
  if (!proto) return null;

  const object = proto.object.clone(true);
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();
  });
  return { bone: proto.bone, object };
}

/**
 * Rig-harvested meshes that need turning end for end, and the axis to turn on.
 *
 * See the note where this is applied. Only meshes taken off a body OTHER than
 * the grip donor can need it, and only when that body's socket disagrees with
 * the Warrior's.
 */
const RIG_FLIP: Record<string, [number, number, number]> = {
  "rig:Wizard/Wizard_Staff": [1, 0, 0],
};

/**
 * Length relative to the donor sword, per weapon family.
 *
 * See the note where this is applied. `fitToGrip` deliberately gives every
 * weapon the same longest axis; this is where a family says it is shorter than
 * that. A missing entry means "as long as the sword", which is right for
 * swords, axes, maces, staves and bows.
 */
const FAMILY_LENGTH: Partial<Record<WeaponType, number>> = {
  // A knife is about half a sword. Measured against the character rather than
  // reasoned about: at 1.0 the blade reached from the fist past the far hip.
  dagger: 0.5,
};

async function makeHeldItem(
  baseId: string,
  rarity: ItemRarity,
  hand: "right" | "left",
): Promise<HeldWeapon | null> {
  const base = itemBase(baseId);
  const grip = await donorGrip();
  if (!grip) return null;

  const palette = PALETTES[base.art.palette] ?? PALETTES.steel;
  let mesh: THREE.Mesh | null = null;

  if (base.art.build) {
    // `grip.box` comes from `donorGrip()`, which is itself cached, so the only
    // input to either builder is the build name.
    // A REGISTRY RATHER THAN A TERNARY. Two builders fitted in a conditional;
    // five do not, and the failure mode of the conditional was silent — an
    // unknown build name fell through to the quiver, so a mistyped weapon would
    // have been drawn as a bag of arrows rather than reported.
    const builder = HELD_BUILDERS[base.art.build];
    if (!builder) {
      console.warn(`gear: no builder named "${base.art.build}"; ${baseId} will be invisible`);
      return null;
    }
    const built = await cachedHeldGeometry(`build:${base.art.build}`, () => builder(grip.box));
    mesh = new THREE.Mesh(
      built,
      [
        paletteMaterial(palette, "metal", rarity),
        paletteMaterial(palette, "wood", rarity),
        paletteMaterial(palette, "accent", rarity),
      ],
    );
  } else if (base.art.model?.startsWith("rig:")) {
    // Harvested off the rig that authored it — the original four weapons, and
    // still the most accurate path there is, since the mesh is already sitting
    // in the socket it belongs in.
    const [body, meshName] = base.art.model.slice(4).split("/");
    const proto = await loadModel(body);
    const donor = findMesh(proto, meshName);
    if (!donor) {
      console.warn(`gear: ${meshName} not found on ${body}; ${baseId} will be invisible`);
      return null;
    }
    mesh = new THREE.Mesh(donor.geometry, repaint(donor.material, palette, rarity));
    mesh.position.copy(donor.position);
    mesh.quaternion.copy(donor.quaternion);
    mesh.scale.copy(donor.scale);
    // A HARVESTED MESH KEEPS A TRANSFORM AUTHORED FOR ITS OWN RIG, AND WE HANG
    // IT ON SOMEBODY ELSE'S BONE.
    //
    // `donorGrip` takes the socket from `Warrior_Sword`, so every right-hand
    // weapon is parented to the WARRIOR's weapon bone. That is exactly right for
    // the Warrior's own sword, whose local transform was authored against it,
    // and it is an assumption for anything harvested off another body: the
    // Wizard's staff and the Ranger's bow carry transforms that mean something
    // relative to THEIR sockets.
    //
    // The Wizard's staff does not survive the move. Measured across all 29
    // models, every weapon in the game points its far end up and away — an `up`
    // component around +0.5 — and this one alone reads -0.84: it hangs downward
    // with the ORB at the fist and the plain butt pointing out at the floor.
    // Held by the head, business end at its owner, which is what "the blade was
    // facing the player" describes.
    //
    // Flipped end for end here rather than by re-fitting it like a
    // `weapons/...` model, because `fitToGrip` would also renormalise its length
    // and this mesh is otherwise correct — it is one axis, not a bad import.
    const flip = RIG_FLIP[base.art.model];
    if (flip) mesh.rotateOnAxis(new THREE.Vector3(flip[0], flip[1], flip[2]), Math.PI);
  } else if (base.art.model) {
    const proto = await loadModel(base.art.model);
    const donor = findMesh(proto, "") ?? firstMesh(proto);
    if (!donor) {
      console.warn(`gear: ${base.art.model} has no mesh; ${baseId} will be invisible`);
      return null;
    }
    // The fitted clone depends on the donor model and the lay, and on nothing
    // else — not on rarity, not on which hand holds it.
    const lay = base.art.lay ?? "along";
    const fitted = await cachedHeldGeometry(`fit:${base.art.model}|${lay}`, () =>
      fitToGrip(donor.geometry, grip.box, lay),
    );
    mesh = new THREE.Mesh(fitted, repaint(donor.material, palette, rarity));
  }
  if (!mesh) return null;

  // NO ACTOR OWNS THIS GEOMETRY. All three branches now hand out geometry that
  // something else holds for the life of the process: `rig:` shares the loaded
  // model's own, and the other two share a `heldGeoCache` entry.
  //
  // This used to set `userData.ownedByActor` on the two generated branches so
  // `Actor.clearGear` would dispose them, and that was unsafe from the moment it
  // was written. `buildHeldItem` hands every wielder `proto.object.clone(true)`,
  // and `Mesh.copy` does `this.geometry = source.geometry` — it clones the
  // materials and SHARES the geometry. So the flag was never on a per-actor
  // copy; it was on the cached prototype's geometry, and the first monster to
  // despawn disposed a geometry the cache and every other wielder still held.
  // Nothing visibly broke because three.js silently re-uploads a disposed
  // geometry the next time it is drawn, which is also exactly why disposing
  // them measured as no improvement at all: the buffers came straight back.
  //
  // Geometry here is cache-owned and bounded — one per distinct shape. Actors
  // own their materials, which `clearGear` disposes, and nothing else.

  // Everything that was NOT harvested off the rig still needs the rig's own
  // grip transform, or it hangs in world space beside the character.
  if (!base.art.model?.startsWith("rig:")) {
    mesh.position.copy(grip.position);
    mesh.quaternion.copy(grip.quaternion);
    mesh.scale.copy(grip.scale);
  }
  if (base.art.scale && base.art.scale !== 1) mesh.scale.multiplyScalar(base.art.scale);

  // HOW LONG A FAMILY IS, because `fitToGrip` makes everything one length.
  //
  // That function normalises a weapon's longest axis to the donor sword's, and
  // says so — it is the right call for ORIENTATION and it is the whole reason a
  // shield does not come out five times the character. But it also means a
  // dagger is issued at greatsword length: all six dagger bases use real dagger
  // models and came out as long as a Warrior's sword, sprawled across the
  // torso, which is what "look at how that character is holding that sword"
  // was pointing at.
  //
  // A FAMILY NUMBER RATHER THAN SIX ITEM ONES. Per-item `art.scale` is the
  // existing lever and it is the wrong shape for this: every dagger needs the
  // same correction, so scattering it six ways means six chances to forget, and
  // a seventh dagger added later would arrive sword-length again. Length is a
  // property of what the weapon IS.
  //
  // Only families that need it appear here. Wands already correct themselves
  // per item — they are built from the Wizard's staff mesh at 0.5-0.58 — and
  // adding them here would apply the correction twice.
  const familyLength = FAMILY_LENGTH[base.weaponType as WeaponType];
  if (familyLength) mesh.scale.multiplyScalar(familyLength);

  mesh.name = `held_${baseId}`;
  mesh.castShadow = true;

  if (hand === "left") {
    // AUTHORED, and the only authored transform here. The pack gives no left
    // socket, so the off-hand rides `FistL` with the right hand's grip mirrored
    // across the body's plane and turned to face outward — a shield held edge-on
    // is a stick. Re-derive this if the character pack is ever replaced.
    // TURNED, NOT MIRRORED, and the mirror was costing more than it bought.
    //
    // This was `rotation(PI/2, 0, PI)` with `scale(1, 1, -1)`: the right hand's
    // grip reflected across the body's plane. A negative scale reverses the
    // winding order of every triangle under it and three.js does not flip
    // `frontFace` per object, so everything below this group drew inside out.
    // The shield's own materials were patched to `BackSide` to compensate —
    // which worked, and then stopped being enough the moment M70.219 made the
    // outline passes rebuild on gear changes, because the HULLS are built with
    // the actor's SHARED silhouette and outline materials and cannot be flipped
    // for one object without flipping them for the whole figure. The result was
    // a shield washed out under a transparent panel at 0.47 opacity.
    //
    // A rotation has no such cost. Compared side by side at noon: the mirror
    // pastes the shield face-on across the whole torso and hides the body,
    // while this puts it on the forearm at the character's side with the figure
    // still readable. Both were photographed before choosing — see
    // `shots/grip/offhand-current.png` against `offhand-rotZ.png`.
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.rotation.set(Math.PI / 2, 0, 0);
    // The `BackSide` patch that used to sit here went with the mirror. It was
    // compensating for reversed winding, and there is no longer any to
    // compensate for; leaving it would draw the shield's inside face instead.
    return { object: holder, bone: "FistL" };
  }

  return { object: mesh, bone: grip.bone };
}

function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  return found;
}

/**
 * Rotates, scales and seats a downloaded model into the donor sword's geometry
 * space.
 *
 * WHICH AXIS IS MEASURED, NOT WHICH AXIS IS ASSUMED. The first version rotated
 * every model a quarter turn on the assumption the pack authored things
 * standing up in Y — which is true of the source files and false of what
 * arrives, because FBXLoader has already converted them to Z-up. So the
 * rotation turned a model that was already lying correctly onto its thin axis,
 * the length came out as the blade's WIDTH, and every fitted weapon was drawn
 * about twelve times too big. Measuring the box and picking the longest axis is
 * both correct for the models we have and robust to a pack that does it
 * differently — the same lesson the ground scatter recorded when it started
 * normalising by largest dimension rather than by height.
 *
 * `lay` decides which of the model's axes runs down the grip. A sword is
 * "along": its length points away from the hand. A shield is "flat": its
 * SHORTEST axis does, so the face turns outward instead of lying edge-on like
 * a plank.
 */
function fitToGrip(
  source: THREE.BufferGeometry,
  box: THREE.Box3,
  lay: "along" | "flat" = "along",
): THREE.BufferGeometry {
  const geo = source.clone();
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const size = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];

  // The axis that should end up pointing down the grip.
  const pick = lay === "along"
    ? size.indexOf(Math.max(...size))
    : size.indexOf(Math.min(...size));
  if (pick === 0) geo.rotateY(Math.PI / 2);
  else if (pick === 1) geo.rotateX(-Math.PI / 2);

  // SCALE BY THE LARGEST EXTENT, ALWAYS — orientation and size are separate
  // questions and conflating them was a real bug. Scaling by whatever ends up
  // down the grip is right for a sword and wrong for a shield, whose thinnest
  // axis points that way: normalising a shield's 60-unit thickness to a
  // sword's length blew it up to five times the character. Same rule the
  // ground scatter arrived at when a flower clump normalised by height came
  // out a metre across.
  const longest = Math.max(...size) || 1;
  const target = box.max.z - box.min.z;
  const scale = target / longest;
  geo.scale(scale, scale, scale);

  geo.computeBoundingBox();
  const after = geo.boundingBox!;
  // Centred across the grip, with the butt of the handle at the donor's own
  // start, so every weapon is held at the same point in the fist however long
  // it is.
  geo.translate(
    -(after.min.x + after.max.x) / 2,
    -(after.min.y + after.max.y) / 2,
    box.min.z - after.min.z,
  );
  return geo;
}

/**
 * Repaints a downloaded model by ROLE rather than by hue.
 *
 * The pack's material names are a small shared vocabulary — Steel, DarkWood,
 * Gold and a few accents — so a palette can darken the blade and leave the grip
 * leather-coloured, instead of staining the whole object one colour. Rarity is
 * then multiplied over the result, which keeps the two axes independent exactly
 * as they are for armour: a Frost greatsword and a Crimson one take the same
 * Enchanted tint and stay recognisably frost and crimson.
 */
function repaint(
  source: THREE.Material | THREE.Material[],
  palette: PaletteDef,
  rarity: ItemRarity,
): THREE.Material | THREE.Material[] {
  const list = Array.isArray(source) ? source : [source];
  const out = list.map((m) => {
    const src = m as THREE.MeshStandardMaterial;
    const role = MATERIAL_ROLE[src.name] ?? "metal";
    const mat = paletteMaterial(palette, role, rarity);
    mat.name = src.name;
    return mat;
  });
  return out.length === 1 ? out[0] : out;
}

function paletteMaterial(
  palette: PaletteDef,
  role: "metal" | "wood" | "accent",
  rarity: ItemRarity,
): THREE.MeshStandardMaterial {
  const base = palette[role];
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(base),
    roughness: role === "metal" ? 0.4 : role === "accent" ? 0.5 : 0.85,
    metalness: role === "wood" ? 0 : 0.5,
    flatShading: true,
  });
  mat.color.multiply(new THREE.Color(RARITY_TINT[rarity]));
  mat.emissive = new THREE.Color(RARITY_GLOW[rarity]);
  return mat;
}

/**
 * A stave with a floating crystal at its head — the one silhouette no pack in
 * the project ships, and the reason `staff` and `wand` would otherwise be five
 * items sharing two meshes.
 *
 * Three material groups so the palette can reach all of it: shaft is wood,
 * the claw is metal, the stone is accent.
 */
function buildCrystalStave(b: THREE.Box3): THREE.BufferGeometry {
  const z0 = b.min.z;
  const len = (b.max.z - z0) * 1.35;
  const headZ = z0 + len * 0.94;

  const claw: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.CylinderGeometry(0.018, 0.05, 0.3, 4);
    prong.rotateX(Math.PI / 2);
    prong.rotateZ((i * Math.PI * 2) / 3);
    prong.translate(
      Math.cos((i * Math.PI * 2) / 3) * 0.075,
      Math.sin((i * Math.PI * 2) / 3) * 0.075,
      headZ - 0.14,
    );
    claw.push(prong);
  }

  const shaft = new THREE.CylinderGeometry(0.036, 0.05, len * 0.9, 7);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, z0 + len * 0.45);
  const collar = new THREE.CylinderGeometry(0.062, 0.062, 0.06, 7);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0, headZ - 0.3);

  // Deliberately not touching the claw: the gap is the whole idea, and an
  // octahedron reads as cut stone where a sphere reads as a ball on a stick.
  const stone = new THREE.OctahedronGeometry(0.13, 0);
  stone.scale(1, 1, 1.5);
  stone.translate(0, 0, headZ + 0.1);

  return threeGroups(merge(claw), merge([shaft, collar]), stone);
}

/**
 * WHY THERE ARE PROCEDURAL WEAPONS AT ALL, and why more of them is the right
 * way to make the late game look like something.
 *
 * The imported pack is twenty-three meshes with NO TEXTURES — flat material
 * colour in a small vocabulary — and that is the whole reason a palette can
 * repaint one and a quality can tint it. It is what turns twenty-three models
 * into a hundred and twenty items. The cost of that bargain is that two items
 * sharing a mesh are the same object in two colours, and at the top of the
 * catalogue that starts to show: a relic somebody crossed the world for should
 * not be the recruit's sword in red.
 *
 * Importing a better-looking model is the obvious fix and the wrong one. Every
 * good-looking pack is textured, a textured mesh cannot be repainted, and the
 * item would become the only thing in the game outside the palette system —
 * which is also the only thing an artist would have to redo for every future
 * variant of it.
 *
 * Geometry written HERE has neither problem. It is new silhouette, it costs no
 * download, and it comes out of `threeGroups` already divided into metal, wood
 * and accent — so it is repainted and tinted by exactly the same rules as
 * everything else. The three below are shapes the pack does not contain at all.
 */
const HELD_BUILDERS: Record<string, (b: THREE.Box3) => THREE.BufferGeometry> = {
  crystalstave: (b) => buildCrystalStave(b),
  quiver: (b) => buildQuiver(b),
  fangblade: (b) => buildFangblade(b),
  flail: (b) => buildFlail(b),
  glaive: (b) => buildGlaive(b),
};

/**
 * A single-edged blade with a torn back and a tooth at the tip.
 *
 * Deliberately ASYMMETRIC, which is the thing none of the imported swords are:
 * five of them are a mirrored taper and read as the same object at a glance.
 * The spine steps down twice toward the point so the silhouette has notches in
 * it, and the guard is a pair of forward-swept horns rather than a crossbar.
 */
function buildFangblade(b: THREE.Box3): THREE.BufferGeometry {
  const z0 = b.min.z;
  // SHORTER AND MUCH WIDER THAN THE FIRST ATTEMPT, which was 1.28 of the donor
  // box at a tenth of a unit across and photographed as a NEEDLE — a red spike
  // with no blade to it. At this camera a weapon is read almost entirely by its
  // width against the character's shoulders, and the stepped spine that is the
  // whole idea of this shape cannot be seen at all unless the steps are a
  // visible fraction of that width.
  const len = (b.max.z - z0) * 1.0;
  const metal: THREE.BufferGeometry[] = [];
  const wood: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];

  // Blade: three stacked slabs, each shorter and narrower, so the back edge
  // steps down toward the point rather than tapering smoothly.
  const seg = [
    { z: 0.34, w: 0.23, h: 0.045, l: 0.46 },
    { z: 0.72, w: 0.175, h: 0.038, l: 0.34 },
    { z: 0.97, w: 0.115, h: 0.030, l: 0.22 },
  ];
  for (const s of seg) {
    const slab = new THREE.BoxGeometry(s.w, s.h, len * s.l);
    // Shifted off-centre so the cutting edge is one side only and the notches
    // all fall on the other.
    slab.translate(s.w * 0.22, 0, z0 + len * s.z);
    metal.push(slab);
  }
  // The tooth: a broad four-sided pyramid past the last slab.
  const tip = new THREE.ConeGeometry(0.1, len * 0.2, 4);
  tip.rotateX(Math.PI / 2);
  tip.translate(0.02, 0, z0 + len * 1.13);
  metal.push(tip);

  // Two horns sweeping forward from the guard.
  for (const side of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.042, 0.26, 5);
    horn.rotateZ(side * Math.PI * 0.42);
    horn.rotateX(-0.25);
    horn.translate(side * 0.13, 0, z0 + len * 0.14);
    accent.push(horn);
  }
  const collar = new THREE.CylinderGeometry(0.055, 0.07, 0.05, 6);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0, z0 + len * 0.13);
  accent.push(collar);

  const grip = new THREE.CylinderGeometry(0.036, 0.042, len * 0.2, 6);
  grip.rotateX(Math.PI / 2);
  grip.translate(0, 0, z0 + len * 0.04);
  wood.push(grip);
  const pommel = new THREE.OctahedronGeometry(0.05, 0);
  pommel.translate(0, 0, z0 - len * 0.05);
  accent.push(pommel);

  return threeGroups(merge(metal), merge(wood), merge(accent));
}

/**
 * A haft, a length of chain, and a spiked head that hangs off the end.
 *
 * The pack has two hammers and nothing articulated, so this is the one mace
 * silhouette that is not a block on a stick. The chain is four small torus
 * links rather than a cylinder, because the gaps are what make it read as
 * chain at the distance this camera sits at.
 */
function buildFlail(b: THREE.Box3): THREE.BufferGeometry {
  const z0 = b.min.z;
  const len = (b.max.z - z0) * 1.05;
  const metal: THREE.BufferGeometry[] = [];
  const wood: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];

  const haft = new THREE.CylinderGeometry(0.036, 0.044, len * 0.6, 7);
  haft.rotateX(Math.PI / 2);
  haft.translate(0, 0, z0 + len * 0.3);
  wood.push(haft);

  const cap = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 7);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, z0 + len * 0.61);
  accent.push(cap);

  // Links, drooping slightly so it does not read as a rigid pole.
  for (let i = 0; i < 4; i++) {
    const link = new THREE.TorusGeometry(0.032, 0.011, 4, 8);
    if (i % 2 === 1) link.rotateX(Math.PI / 2);
    link.translate(0, -i * 0.012, z0 + len * (0.66 + i * 0.055));
    metal.push(link);
  }

  const head = new THREE.IcosahedronGeometry(0.125, 0);
  head.translate(0, -0.062, z0 + len * 0.96);
  metal.push(head);
  // Six spikes off the ball, on the axes, so the silhouette is spiky from
  // every angle the camera can take.
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const spike = new THREE.ConeGeometry(0.026, 0.09, 4);
    if (dx) spike.rotateZ(dx * -Math.PI / 2);
    if (dz) spike.rotateX(dz * Math.PI / 2);
    if (dy < 0) spike.rotateZ(Math.PI);
    spike.translate(dx * 0.12, -0.062 + dy * 0.12, z0 + len * 0.96 + dz * 0.12);
    accent.push(spike);
  }

  return threeGroups(merge(metal), merge(wood), merge(accent));
}

/**
 * A polearm: a long shaft with a broad curved blade and a rear hook.
 *
 * The pack's one long weapon is a spear, which is a point on a pole. This is
 * the other half of that family — something with a cutting edge out at the end,
 * and a counterweight behind it so the silhouette is not symmetrical.
 */
function buildGlaive(b: THREE.Box3): THREE.BufferGeometry {
  const z0 = b.min.z;
  const len = (b.max.z - z0) * 1.55;
  const metal: THREE.BufferGeometry[] = [];
  const wood: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];

  const shaft = new THREE.CylinderGeometry(0.03, 0.038, len * 0.78, 7);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, z0 + len * 0.36);
  wood.push(shaft);

  // The blade: two slabs at a slight angle to each other, so the edge reads as
  // curved without needing a lathe.
  const lower = new THREE.BoxGeometry(0.115, 0.022, len * 0.22);
  lower.rotateY(0.12);
  lower.translate(0.035, 0, z0 + len * 0.84);
  const upper = new THREE.BoxGeometry(0.085, 0.02, len * 0.16);
  upper.rotateY(0.3);
  upper.translate(0.075, 0, z0 + len * 1.0);
  metal.push(lower, upper);
  const point = new THREE.ConeGeometry(0.045, len * 0.1, 4);
  point.rotateX(Math.PI / 2);
  point.rotateY(0.3);
  point.translate(0.1, 0, z0 + len * 1.1);
  metal.push(point);

  // Rear hook, opposite the edge.
  const hook = new THREE.ConeGeometry(0.03, 0.14, 4);
  hook.rotateZ(Math.PI * 0.62);
  hook.translate(-0.075, 0, z0 + len * 0.8);
  accent.push(hook);

  const ferrule = new THREE.CylinderGeometry(0.045, 0.045, 0.06, 7);
  ferrule.rotateX(Math.PI / 2);
  ferrule.translate(0, 0, z0 + len * 0.76);
  accent.push(ferrule);
  const butt = new THREE.CylinderGeometry(0.04, 0.028, 0.1, 6);
  butt.rotateX(Math.PI / 2);
  butt.translate(0, 0, z0 - len * 0.03);
  accent.push(butt);

  return threeGroups(merge(metal), merge(wood), merge(accent));
}

/** A quiver of arrows, for the ranger's off-hand. */
function buildQuiver(b: THREE.Box3): THREE.BufferGeometry {
  const z0 = b.min.z;
  const len = (b.max.z - z0) * 0.5;

  const body = new THREE.CylinderGeometry(0.11, 0.085, len, 8, 1, true);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, z0 + len * 0.5);
  const rim = new THREE.TorusGeometry(0.11, 0.016, 4, 10);
  rim.translate(0, 0, z0 + len);

  const shafts: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.045;
    const y = Math.sin(a) * 0.045;
    const shaft = new THREE.CylinderGeometry(0.008, 0.008, len * 0.55, 4);
    shaft.rotateX(Math.PI / 2);
    shaft.translate(x, y, z0 + len * 1.15);
    shafts.push(shaft);
    const head = new THREE.ConeGeometry(0.022, 0.06, 4);
    head.rotateX(Math.PI / 2);
    head.translate(x, y, z0 + len * 1.45);
    heads.push(head);
  }

  return threeGroups(merge([rim, ...heads]), merge([body, ...shafts]), new THREE.BufferGeometry());
}

/** Joins three halves into one geometry with three material groups, so a
 *  palette can paint metal, wood and accent independently on one mesh. */
function threeGroups(
  metal: THREE.BufferGeometry,
  wood: THREE.BufferGeometry,
  accent: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const a = metal.attributes.position?.count ?? 0;
  const b = wood.attributes.position?.count ?? 0;
  const parts = [metal, wood, accent].filter((g) => (g.attributes.position?.count ?? 0) > 0);
  const out = merge(parts);
  out.clearGroups();
  let at = 0;
  if (a > 0) { out.addGroup(at, a, 0); at += a; }
  if (b > 0) { out.addGroup(at, b, 1); at += b; }
  const rest = out.attributes.position.count - at;
  if (rest > 0) out.addGroup(at, rest, 2);
  return out;
}

// --- Gathering tools --------------------------------------------------------
//
// THE RIGHT TOOL FOR THE JOB, because chopping a tree with a dagger is what
// gathering looked like until now: the character played its weapon's attack
// with its weapon in hand, so a ranger harvested wood by shooting the trunk and
// everybody else poked it with whatever they were carrying.
//
// These are not items. They cannot be equipped, sold, forged or dropped; they
// exist for the length of a gather and go away again, which is why they live
// here rather than in `ITEM_BASES`. A player owning a woodcutter's axe is a
// design decision about the economy; a woodcutter's axe APPEARING IN THEIR
// HANDS while they chop is a statement about what they are doing, and only the
// second one is being made.
//
// A bush gets none. You pick berries with your fingers, and handing the
// character a tool for it would be the same mistake in the other direction.
export type GatherToolKind = "tree" | "rock";

/**
 * A felling axe, off the pack's own `Axe.fbx`.
 *
 * Harvested rather than built: the kit ships a broad single-bit axe that reads
 * as a woodcutter's tool at a glance, and hand-building a worse one to avoid
 * loading a file would be pride rather than engineering. Painted in plain steel
 * and wood — a working tool, not a weapon, so it carries no rarity tint and
 * none of the palette schools.
 */
const TOOL_MODEL: Record<GatherToolKind, string | null> = {
  tree: "weapons/Axe",
  rock: null, // built below; nothing in the pack is a pickaxe
};

/**
 * A pickaxe, because no art pack ships one.
 *
 * The silhouette is the whole job here. An axe and a pickaxe are both "a haft
 * with a metal head", and if the two read the same at gameplay distance then
 * mining and chopping look identical however different the swing is — which is
 * exactly the complaint this is answering. So the head is deliberately the
 * opposite shape to the axe's broad blade: a long slim double point, one end
 * tapering to a spike and the other flattened into a chisel, set CROSSWISE on
 * the haft so it is unmistakable from the side, which is where the camera is.
 */
function buildPickaxe(b: THREE.Box3): THREE.BufferGeometry {
  const z0 = b.min.z;
  // SHORT. The grip box is sized for a SWORD, and the first version took 1.15
  // of it for the haft and hung a small head on the end — which photographed as
  // a spear: a two-metre pole with a point on it, indistinguishable from the
  // polearm silhouette at any distance the camera actually sits. A pickaxe is a
  // short tool with a big head, and the ratio between those two is the entire
  // difference between reading as a pick and reading as a stick.
  const len = (b.max.z - z0) * 0.62;
  const metal: THREE.BufferGeometry[] = [];
  const wood: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];

  const haft = new THREE.CylinderGeometry(0.040, 0.048, len * 0.94, 8);
  haft.rotateX(Math.PI / 2);
  haft.translate(0, 0, z0 + len * 0.47);
  wood.push(haft);

  // A leather-bound choke where the hand sits — the one piece of detail that
  // separates a tool from a stick at this size.
  const bind = new THREE.CylinderGeometry(0.054, 0.054, len * 0.18, 8);
  bind.rotateX(Math.PI / 2);
  bind.translate(0, 0, z0 + len * 0.18);
  accent.push(bind);

  const headZ = z0 + len * 0.92;
  const collar = new THREE.CylinderGeometry(0.062, 0.068, 0.10, 8);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0, headZ);
  metal.push(collar);

  // THE HEAD IS THE SILHOUETTE, so it is big: a span of nearly a third of the
  // whole tool, set CROSSWISE, which is the shape no weapon in the game has.
  // A long tapering spike on one side, a squared chisel on the other.
  const spike = new THREE.ConeGeometry(0.058, 0.46, 6);
  spike.rotateZ(-Math.PI / 2);
  // Tilted down a few degrees: the points of a pick lead its swing, and a
  // perfectly horizontal head reads as a hammer.
  spike.rotateY(0.18);
  spike.translate(0.27, -0.03, headZ);
  metal.push(spike);

  const chisel = new THREE.BoxGeometry(0.30, 0.075, 0.11);
  chisel.rotateY(-0.14);
  chisel.translate(-0.19, -0.02, headZ);
  metal.push(chisel);
  const tip = new THREE.BoxGeometry(0.06, 0.115, 0.13);
  tip.rotateY(-0.14);
  tip.translate(-0.35, -0.04, headZ);
  accent.push(tip);

  return threeGroups(merge(metal), merge(wood), merge(accent));
}

/**
 * The mesh a character holds while working a node, ready to parent to `WeaponR`.
 *
 * Cached per kind like every other held geometry — there are two of these in
 * the whole game and they are identical for every player.
 */
export async function buildGatherTool(kind: GatherToolKind): Promise<THREE.Object3D | null> {
  const grip = await donorGrip();
  if (!grip) return null;
  // Plain working materials. `paletteMaterial` at "honed" is the catalogue's own
  // baseline — no tint, no glow — which is what a tool should look like beside
  // an enchanted weapon.
  const palette = PALETTES.steel;
  const model = TOOL_MODEL[kind];
  let mesh: THREE.Mesh | null = null;
  if (model) {
    const proto = await loadModel(model);
    const donor = findMesh(proto, "") ?? firstMesh(proto);
    if (!donor) {
      console.warn(`gear: ${model} has no mesh; the ${kind} tool will be invisible`);
      return null;
    }
    const fitted = await cachedHeldGeometry(`tool:${kind}`, () =>
      fitToGrip(donor.geometry, grip.box, "along"),
    );
    mesh = new THREE.Mesh(fitted, repaint(donor.material, palette, "honed"));
  } else {
    const built = await cachedHeldGeometry(`tool:${kind}`, () => buildPickaxe(grip.box));
    mesh = new THREE.Mesh(built, [
      paletteMaterial(palette, "metal", "honed"),
      paletteMaterial(PALETTES.wood ?? palette, "wood", "honed"),
      paletteMaterial(palette, "accent", "honed"),
    ]);
  }
  mesh.name = `tool_${kind}`;
  mesh.castShadow = true;
  return mesh;
}
