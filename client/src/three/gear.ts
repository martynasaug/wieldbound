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
} from "../../../shared/protocol-types";
import { loadModel } from "./assets";
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
export const PLAYER_BODY = "Monk";

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
}

/** A part before it becomes a mesh: geometry plus what it is made of. */
interface Part {
  bone: string;
  role: MaterialRole;
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
    // The skirt hangs from the waist, so it swings with the hips rather than
    // the chest — a robe pinned to the ribs slides up the legs when running.
    parts.push({ bone: "Abdomen", role: "cloth", geometry: 
      shell(29, 46, 76, [0, WAIST_Y - 38, -6], 0.95) });
    return parts;
  }

  if (style === "leather") {
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
    parts.push({ bone: "Torso", role: "metal", geometry:
      shell(28, 32, chestH, [0, chestMid, -4], 0.92) });
    parts.push({ bone: "Abdomen", role: "metal", geometry: merge([
      shell(31, 30, 14, [0, WAIST_Y, -6], 0.94),
      // A short mail skirt: the silhouette that separates chain from plate.
      shell(30, 38, 36, [0, WAIST_Y - 22, -6], 0.96),
    ]) });
    return parts;
  }

  // "plate" — the heaviest look: a shaped cuirass, a gorget at the throat, and
  // real pauldrons on the arm bones so they swing with the shoulders.
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
  const parts: Part[] = [];
  for (const side of [1, -1] as const) {
    const x = side * FOOT_X;
    parts.push({
      bone: side > 0 ? "FootL" : "FootR",
      role: "leather",
      geometry: merge([
        box([21, 19, 46], [x, FOOT_Y + 2, FOOT_Z]),
        // Toe cap, so a boot is not simply a bigger foot.
        box([18, 12, 10], [x, FOOT_Y + 6, FOOT_Z + 23]),
      ]),
    });
    parts.push({
      bone: side > 0 ? "LowerLegL" : "LowerLegR",
      role: "leather",
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
    return { bone: part.bone, object: mesh };
  });
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
    mesh = new THREE.Mesh(
      base.art.build === "crystalstave" ? buildCrystalStave(grip.box) : buildQuiver(grip.box),
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
  } else if (base.art.model) {
    const proto = await loadModel(base.art.model);
    const donor = findMesh(proto, "") ?? firstMesh(proto);
    if (!donor) {
      console.warn(`gear: ${base.art.model} has no mesh; ${baseId} will be invisible`);
      return null;
    }
    mesh = new THREE.Mesh(
      fitToGrip(donor.geometry, grip.box, base.art.lay ?? "along"),
      repaint(donor.material, palette, rarity),
    );
  }
  if (!mesh) return null;

  // Everything that was NOT harvested off the rig still needs the rig's own
  // grip transform, or it hangs in world space beside the character.
  if (!base.art.model?.startsWith("rig:")) {
    mesh.position.copy(grip.position);
    mesh.quaternion.copy(grip.quaternion);
    mesh.scale.copy(grip.scale);
  }
  if (base.art.scale && base.art.scale !== 1) mesh.scale.multiplyScalar(base.art.scale);

  mesh.name = `held_${baseId}`;
  mesh.castShadow = true;

  if (hand === "left") {
    // AUTHORED, and the only authored transform here. The pack gives no left
    // socket, so the off-hand rides `FistL` with the right hand's grip mirrored
    // across the body's plane and turned to face outward — a shield held edge-on
    // is a stick. Re-derive this if the character pack is ever replaced.
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.rotation.set(Math.PI / 2, 0, Math.PI);
    holder.scale.set(1, 1, -1);
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
