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
import type {
  CharacterClass,
  GearStyle,
  ItemRarity,
  ItemSlot,
  WeaponType,
} from "../../../shared/protocol-types";
import { loadModel } from "./assets";

// --- Bodies ---------------------------------------------------------------
// Class is worn, so the silhouette is worn too: pick up a staff and you are not
// a warrior holding a staff, you are a robed mage. Bare-handed maps to the
// Monk, the one body in the pack that reads as "carries nothing" rather than as
// a disarmed soldier — which is exactly what Adventurer is meant to be.
export const CLASS_BODIES: Record<CharacterClass, string> = {
  adventurer: "Monk",
  warrior: "Warrior",
  ranger: "Ranger",
  mage: "Wizard",
};

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
const RARITY_TINT: Record<ItemRarity, number> = {
  common: 0xccc7bd,
  rare: 0x9ec4ff,
  epic: 0xffd36e,
};

// Epics glow faintly so they read as epic across a field, where a hue shift
// alone gets lost against the grass.
const RARITY_GLOW: Record<ItemRarity, number> = {
  common: 0x000000,
  rare: 0x000000,
  epic: 0x3a2a06,
};

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

// --- Weapons --------------------------------------------------------------

/** Where a weapon mesh is lifted from, and how it is altered on the way. */
interface WeaponSource {
  /** Character FBX whose rig parents this weapon to `WeaponR`. */
  body: string;
  mesh: string;
  /** Multiplies the harvested grip scale. A wand is a staff cut down. */
  scale?: number;
  /** Built inside the donor's geometry space rather than harvested from it. */
  procedural?: (bounds: THREE.Box3) => THREE.BufferGeometry;
}

const WEAPON_SOURCES: Record<WeaponType, WeaponSource | null> = {
  // Not an omission: bare hands are a real archetype, and the honest way to
  // draw them is nothing at all.
  fist: null,
  sword: { body: "Warrior", mesh: "Warrior_Sword" },
  bow: { body: "Ranger", mesh: "Ranger_Bow" },
  staff: { body: "Wizard", mesh: "Wizard_Staff" },
  dagger: { body: "Rogue", mesh: "Rogue_Dagger" },
  // A wand is the staff's silhouette at hand length. Scaling the grip shrinks
  // it toward the hand rather than toward its own centre, so it stays held.
  wand: { body: "Wizard", mesh: "Wizard_Staff", scale: 0.5 },
  axe: { body: "Warrior", mesh: "Warrior_Sword", procedural: buildAxe },
  mace: { body: "Warrior", mesh: "Warrior_Sword", procedural: buildMace },
};

export interface HeldWeapon {
  object: THREE.Object3D;
  /** Bone the object expects to be parented to. */
  bone: string;
}

const weaponCache = new Map<string, Promise<HeldWeapon | null>>();

/**
 * The weapon for a type, carrying the grip transform its own rig exported.
 * Resolves to null for fists.
 */
export async function buildWeapon(
  type: WeaponType,
  rarity: ItemRarity,
): Promise<HeldWeapon | null> {
  const key = `${type}|${rarity}`;
  let p = weaponCache.get(key);
  if (!p) {
    p = makeWeapon(type, rarity);
    weaponCache.set(key, p);
  }
  const proto = await p;
  if (!proto) return null;
  // The cache holds a prototype; every wielder gets its own copy. The materials
  // have to be cloned too — `Object3D.clone` shares them, and the wielder owns
  // (and eventually disposes) whatever it is handed.
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

async function makeWeapon(type: WeaponType, rarity: ItemRarity): Promise<HeldWeapon | null> {
  const src = WEAPON_SOURCES[type];
  if (!src) return null;

  const proto = await loadModel(src.body);
  let found: THREE.Mesh | null = null;
  proto.traverse((o) => {
    if (!found && o.name === src.mesh && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh;
  });
  if (!found) {
    console.warn(`gear: ${src.mesh} not found on ${src.body}; ${type} will be invisible`);
    return null;
  }
  const donor = found as THREE.Mesh;

  let mesh: THREE.Mesh;
  if (src.procedural) {
    donor.geometry.computeBoundingBox();
    mesh = new THREE.Mesh(
      src.procedural(donor.geometry.boundingBox!.clone()),
      forgedMaterial(rarity),
    );
  } else {
    const source = Array.isArray(donor.material) ? donor.material[0] : donor.material;
    mesh = new THREE.Mesh(donor.geometry, tintedClone(source, rarity));
  }
  mesh.name = `weapon_${type}`;
  mesh.castShadow = true;

  // The grip: position, rotation and scale straight off the donor rig.
  mesh.position.copy(donor.position);
  mesh.quaternion.copy(donor.quaternion);
  mesh.scale.copy(donor.scale).multiplyScalar(src.scale ?? 1);
  return { object: mesh, bone: donor.parent?.name ?? "WeaponR" };
}

/**
 * An axe head on a haft, laid out along the donor sword's long axis so the
 * harvested grip places it identically. Two material groups: haft is leather,
 * head is metal.
 */
function buildAxe(b: THREE.Box3): THREE.BufferGeometry {
  const z0 = b.min.z;
  const len = b.max.z - z0;

  const head = new THREE.CylinderGeometry(0.44, 0.12, 0.18, 3, 1);
  head.rotateZ(Math.PI / 2);
  head.scale(1, 1, 2.4);
  head.translate(0.16, 0, z0 + len * 0.82);

  const haft = new THREE.CylinderGeometry(0.055, 0.07, len * 0.95, 6);
  haft.rotateX(Math.PI / 2);
  haft.translate(0, 0, z0 + len * 0.46);
  const cap = new THREE.CylinderGeometry(0.09, 0.09, 0.13, 6);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, z0 + 0.07);

  return grouped(merge([head]), merge([haft, cap]));
}

/** A flanged mace: short haft, blunt head, four ribs. */
function buildMace(b: THREE.Box3): THREE.BufferGeometry {
  const z0 = b.min.z;
  const len = (b.max.z - z0) * 0.8;
  const headZ = z0 + len * 0.88;

  const metal: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(0.22, 0)];
  metal[0].translate(0, 0, headZ);
  for (let i = 0; i < 4; i++) {
    const flange = new THREE.BoxGeometry(0.08, 0.36, 0.32);
    flange.rotateZ((i * Math.PI) / 2);
    flange.translate(0, 0, headZ);
    metal.push(flange);
  }

  const haft = new THREE.CylinderGeometry(0.06, 0.075, len * 0.88, 6);
  haft.rotateX(Math.PI / 2);
  haft.translate(0, 0, z0 + len * 0.44);
  const cap = new THREE.CylinderGeometry(0.095, 0.095, 0.13, 6);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, z0 + 0.07);

  return grouped(merge(metal), merge([haft, cap]));
}

/** Joins metal and leather halves into one geometry with two material groups,
 *  so a forged weapon can have a wooden haft without needing two meshes. */
function grouped(metal: THREE.BufferGeometry, leather: THREE.BufferGeometry): THREE.BufferGeometry {
  const metalCount = metal.attributes.position.count;
  const out = merge([metal, leather]);
  out.clearGroups();
  out.addGroup(0, metalCount, 0);
  out.addGroup(metalCount, out.attributes.position.count - metalCount, 1);
  return out;
}
