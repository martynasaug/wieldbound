// Emberhold, built.
//
// Every structure here is generated rather than loaded. That is not stubbornness:
// the CC0 kits this project draws on have props, plants and characters but no
// buildings, and a downloaded building pack would arrive in a different
// stylisation from the trees standing behind it — which is exactly the mistake
// the treeline was already fixed for once (see World.buildDecor). Boxes and
// prisms in the game's own palette, flat-shaded, sit beside a Quaternius pine
// without either one looking borrowed.
//
// The whole town is authored in WORLD UNITS. `shared/town.ts` owns where things
// stand, in server pixels, because that is the language the protocol speaks;
// this file converts once at the top of each builder and then never thinks
// about pixels again.
//
// Two things here are load-bearing and easy to undo by accident:
//
//   1. Geometry is MERGED per material. A building is about sixty boxes — six
//      buildings, a palisade and a dozen lanterns is well over four hundred
//      meshes, which is four hundred draw calls for scenery that never moves.
//      Merged, the whole town is about a dozen.
//   2. The window material is ONE instance shared by every pane in town, and
//      the night lighting drives its emissive. Cloning it per building would
//      silently cost nothing at noon and leave five of the six dark at midnight.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  TOWN_BUILDINGS,
  TOWN_CENTER,
  TOWN_GATE_ANGLES,
  TOWN_GATE_HALF_DEG,
  TOWN_RADIUS_PX,
  type BuildingKind,
  type TownBuilding,
} from "../../../shared/town";
import { instantiate } from "./assets";
import { PX_PER_UNIT, toWorldX, toWorldZ } from "./World";

// --- Palette ----------------------------------------------------------------
// Warm plaster, cool stone, dark timber. Picked against the terrain shader's
// grass and the nature kit's bark rather than in isolation — a town that is
// beautiful on a grey background is a town that glows radioactively on grass.

const PALETTE = {
  plaster: 0xe4d3b2,
  plasterCool: 0xd6c8ae,
  timber: 0x4a3524,
  timberLight: 0x6b4c30,
  stone: 0x8d887b,
  stoneDark: 0x6f6a60,
  thatch: 0xb99552,
  shingle: 0x7c4a3a,
  slate: 0x4e5a64,
  door: 0x5d3d24,
  iron: 0x33363b,
  awning: 0xa8503c,
  awningAlt: 0x3f6b63,
  garden: 0x5e7a3a,
  glass: 0xffca74,
  banner: 0xa8503c,
} as const;

type MatKey = keyof typeof PALETTE;

// --- Surfaces ---------------------------------------------------------------
// Flat colour was the first pass and it was the right first pass — it settled
// the silhouettes and the layout with nothing in the way. It is also why the
// town read as cardboard: six buildings made of forty untextured boxes each,
// and the only value variation anywhere in the place came from the sun angle.
//
// Everything below is drawn on a canvas at load. Nothing is downloaded, for the
// same reason the buildings are generated at all: an atlas from a different
// pack would arrive in a different stylisation from the bark standing behind it.
//
// The maps are drawn NEAR WHITE and tint the palette colour rather than
// carrying colour of their own — `map` multiplies `color` — so the palette at
// the top of this file stays the single place a colour is decided, and a
// texture is only ever a pattern of light and shade laid over it.

/** How many times a texture repeats per world unit. Bigger is finer. */
const TEX_SCALE: Partial<Record<MatKey, number>> = {
  plaster: 0.55,
  plasterCool: 0.55,
  timber: 1.1,
  timberLight: 1.1,
  stone: 0.6,
  stoneDark: 0.6,
  thatch: 0.9,
  shingle: 0.85,
  slate: 0.8,
  door: 1.2,
  iron: 1.4,
  awning: 0.7,
  awningAlt: 0.7,
  banner: 0.7,
  garden: 1.0,
};

function canvas2d(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext("2d")! };
}

/** Seeded, so every client's plaster is the same plaster. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/** Fine grain over the whole tile. What stops a flat fill reading as plastic. */
function speckle(
  ctx: CanvasRenderingContext2D,
  size: number,
  rand: () => number,
  count: number,
  alpha: number,
): void {
  for (let i = 0; i < count; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
}

/**
 * Draws a shape and its wrap-around copies.
 *
 * Every texture here tiles, and anything drawn near an edge has to appear on
 * the opposite edge too or the seam is a visible line running round every
 * building in town. Nine passes rather than four: a stone straddling a corner
 * needs all three neighbours, not only the two obvious ones.
 */
function wrapped(ctx: CanvasRenderingContext2D, size: number, draw: () => void): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(dx, dy);
      draw();
      ctx.restore();
    }
  }
}

function plasterTexture(): HTMLCanvasElement {
  const size = 256;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(7717);
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(0, 0, size, size);
  // Broad blotches: the unevenness of a hand-applied render.
  for (let i = 0; i < 40; i++) {
    const shade = 214 + Math.floor(rand() * 42);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.55)`;
    wrapped(ctx, size, () => {
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, 12 + rand() * 40, 10 + rand() * 34, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  speckle(ctx, size, rand, 5200, 0.16);
  return canvas;
}

function woodTexture(): HTMLCanvasElement {
  const size = 256;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(3313);
  ctx.fillStyle = "#ededed";
  ctx.fillRect(0, 0, size, size);
  // Grain: long streaks, which the box projection lays along whichever pair of
  // world axes a face happens to lie in.
  for (let i = 0; i < 150; i++) {
    const x = rand() * size;
    const shade = 176 + Math.floor(rand() * 76);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.35 + rand() * 0.4})`;
    ctx.lineWidth = 0.6 + rand() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    for (let y = -10; y < size + 10; y += 22) {
      ctx.lineTo(x + Math.sin((y + i * 13) * 0.06) * 2.4, y);
    }
    ctx.stroke();
  }
  // Plank seams, so a wide surface reads as boards rather than as one slab.
  ctx.strokeStyle = "rgba(110,110,110,0.75)";
  ctx.lineWidth = 1.6;
  for (const x of [0, size / 2]) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    for (let r = 7; r > 0; r--) {
      ctx.strokeStyle = `rgba(${140 + r * 9},${140 + r * 9},${140 + r * 9},0.6)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.5, r, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  speckle(ctx, size, rand, 2600, 0.12);
  return canvas;
}

function masonryTexture(): HTMLCanvasElement {
  const size = 256;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(9091);
  ctx.fillStyle = "#b8b8b8";
  ctx.fillRect(0, 0, size, size);
  const courses = 6;
  const h = size / courses;
  for (let row = 0; row < courses; row++) {
    // Half-lap every other course, which is what makes it read as coursed
    // masonry rather than as a grid.
    const offset = (row % 2) * (size / 8);
    let x = -offset;
    while (x < size) {
      const w = size / 4 + (rand() - 0.5) * 22;
      const shade = 224 + Math.floor(rand() * 30);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      const bx = x;
      wrapped(ctx, size, () => ctx.fillRect(bx + 1.6, row * h + 1.6, w - 3.2, h - 3.2));
      ctx.fillStyle = "rgba(150,150,150,0.5)";
      wrapped(ctx, size, () => ctx.fillRect(bx + 1.6, row * h + h - 4.4, w - 3.2, 2.8));
      x += w;
    }
  }
  speckle(ctx, size, rand, 4200, 0.14);
  return canvas;
}

function thatchTexture(): HTMLCanvasElement {
  const size = 256;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(5501);
  ctx.fillStyle = "#e4e4e4";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 6 + rand() * 16;
    const shade = 168 + Math.floor(rand() * 88);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.7)`;
    ctx.lineWidth = 0.8 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y + len);
    ctx.stroke();
  }
  // The bound courses a thatcher works in.
  for (let row = 0; row < 4; row++) {
    const y = (row * size) / 4;
    ctx.fillStyle = "rgba(128,128,128,0.4)";
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(0, y + 3, size, 3);
  }
  return canvas;
}

function shingleTexture(): HTMLCanvasElement {
  const size = 256;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(2299);
  ctx.fillStyle = "#9a9a9a";
  ctx.fillRect(0, 0, size, size);
  const rows = 6;
  const h = size / rows;
  for (let row = 0; row < rows; row++) {
    const offset = (row % 2) * (size / 12);
    for (let i = -1; i < 7; i++) {
      const x = i * (size / 6) + offset;
      const shade = 206 + Math.floor(rand() * 48);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      wrapped(ctx, size, () => {
        ctx.beginPath();
        // A rounded tail, which is the whole silhouette of a shingle.
        ctx.moveTo(x + 1, row * h);
        ctx.lineTo(x + size / 6 - 1, row * h);
        ctx.lineTo(x + size / 6 - 1, row * h + h * 0.62);
        ctx.quadraticCurveTo(x + size / 12, row * h + h * 1.05, x + 1, row * h + h * 0.62);
        ctx.closePath();
        ctx.fill();
      });
    }
    // The shadow the course above casts on the one below.
    ctx.fillStyle = "rgba(96,96,96,0.55)";
    ctx.fillRect(0, row * h, size, 3.5);
  }
  speckle(ctx, size, rand, 2400, 0.1);
  return canvas;
}

function slateTexture(): HTMLCanvasElement {
  const size = 256;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(6607);
  ctx.fillStyle = "#8e8e8e";
  ctx.fillRect(0, 0, size, size);
  const rows = 7;
  const h = size / rows;
  for (let row = 0; row < rows; row++) {
    const offset = (row % 2) * (size / 10);
    for (let i = -1; i < 6; i++) {
      const x = i * (size / 5) + offset;
      const shade = 196 + Math.floor(rand() * 56);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      wrapped(ctx, size, () => ctx.fillRect(x + 1.5, row * h + 1.5, size / 5 - 3, h - 3));
    }
    ctx.fillStyle = "rgba(84,84,84,0.5)";
    ctx.fillRect(0, row * h, size, 2.6);
  }
  speckle(ctx, size, rand, 3000, 0.12);
  return canvas;
}

function clothTexture(): HTMLCanvasElement {
  const size = 128;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(4409);
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 2) {
    ctx.fillStyle = "rgba(150,150,150,0.28)";
    ctx.fillRect(i, 0, 1, size);
    ctx.fillRect(0, i, size, 1);
  }
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = "rgba(120,120,120,0.35)";
    ctx.fillRect(0, (i * size) / 4, size, 6);
  }
  speckle(ctx, size, rand, 900, 0.1);
  return canvas;
}

function metalTexture(): HTMLCanvasElement {
  const size = 128;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(8123);
  ctx.fillStyle = "#e0e0e0";
  ctx.fillRect(0, 0, size, size);
  // Hammered: shallow dents, which is all wrought iron needs at this distance.
  for (let i = 0; i < 260; i++) {
    const shade = 150 + Math.floor(rand() * 105);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.55)`;
    ctx.beginPath();
    ctx.ellipse(rand() * size, rand() * size, 2 + rand() * 5, 2 + rand() * 4, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function foliageTexture(): HTMLCanvasElement {
  const size = 128;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(1187);
  ctx.fillStyle = "#cfcfcf";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const shade = 150 + Math.floor(rand() * 105);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.8)`;
    wrapped(ctx, size, () => {
      ctx.beginPath();
      ctx.ellipse(rand() * size, rand() * size, 2 + rand() * 5, 1 + rand() * 3, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  return canvas;
}

const TEXTURE_SOURCES: Partial<Record<MatKey, () => HTMLCanvasElement>> = {
  plaster: plasterTexture,
  plasterCool: plasterTexture,
  timber: woodTexture,
  timberLight: woodTexture,
  door: woodTexture,
  stone: masonryTexture,
  stoneDark: masonryTexture,
  thatch: thatchTexture,
  shingle: shingleTexture,
  slate: slateTexture,
  awning: clothTexture,
  awningAlt: clothTexture,
  banner: clothTexture,
  iron: metalTexture,
  garden: foliageTexture,
};

/** Built once each; several palette entries deliberately share a drawing. */
const textureCache = new Map<() => HTMLCanvasElement, THREE.Texture>();

function textureFor(key: MatKey): THREE.Texture | null {
  const source = TEXTURE_SOURCES[key];
  if (!source) return null;
  const cached = textureCache.get(source);
  if (cached) return cached;
  const tex = new THREE.CanvasTexture(source());
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  // NOT sRGB. These are shading masks that multiply a colour, not colour of
  // their own — decoding them as sRGB darkens every surface in town by about a
  // stop and the palette stops meaning what it says.
  tex.colorSpace = THREE.NoColorSpace;
  textureCache.set(source, tex);
  return tex;
}

/**
 * Box-projects UVs from world position.
 *
 * This is the piece that makes one texture work across the whole town. A
 * BoxGeometry's own UVs run 0..1 on every face regardless of how big the box
 * is, so a shared map appears at a different scale on a wall than on a batten —
 * plaster stretched to four metres a tile on the inn and squeezed to eight
 * centimetres on a window frame. Projecting from world coordinates instead
 * gives every surface in Emberhold the same texel density, and it costs one
 * pass over the merged geometry at load.
 *
 * Per TRIANGLE rather than per vertex: the axis is chosen from the face normal,
 * so all three vertices of a face agree about which plane they project onto.
 * Choosing per vertex tears every triangle that spans a corner.
 */
function boxProjectUVs(geo: THREE.BufferGeometry, scale: number): void {
  const pos = geo.attributes.position;
  const count = pos.count;
  const uv = new Float32Array(count * 2);
  const ax = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const cx = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i + 2 < count; i += 3) {
    ax.fromBufferAttribute(pos, i);
    bx.fromBufferAttribute(pos, i + 1);
    cx.fromBufferAttribute(pos, i + 2);
    e1.subVectors(bx, ax);
    e2.subVectors(cx, ax);
    n.crossVectors(e1, e2);
    const nx = Math.abs(n.x);
    const ny = Math.abs(n.y);
    const nz = Math.abs(n.z);

    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? ax : k === 1 ? bx : cx;
      let u: number;
      let w: number;
      if (nx >= ny && nx >= nz) {
        u = v.z;
        w = v.y;
      } else if (ny >= nx && ny >= nz) {
        u = v.x;
        w = v.z;
      } else {
        u = v.x;
        w = v.y;
      }
      uv[(i + k) * 2] = u * scale;
      uv[(i + k) * 2 + 1] = w * scale;
    }
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * One material per palette entry, for the whole town.
 *
 * Built once and shared. `glass` is the reason this is a module-level cache
 * rather than something each building makes for itself: the night pass writes
 * one emissive value and every lit window in Emberhold answers.
 */
const materials = new Map<MatKey, THREE.MeshStandardMaterial>();

function materialFor(key: MatKey): THREE.MeshStandardMaterial {
  const existing = materials.get(key);
  if (existing) return existing;
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE[key],
    map: textureFor(key),
    // Flat shading is most of what makes generated geometry read as the same
    // stylisation as the low-poly kits. Smooth normals on a box look like a
    // box; on a roof prism they look like a mistake.
    flatShading: true,
    roughness: key === "glass" ? 0.35 : key === "iron" ? 0.55 : 0.92,
    metalness: key === "iron" ? 0.5 : 0.0,
  });
  if (key === "glass") {
    // A pane is a light source at night and a dull yellow square by day. The
    // emissive is driven from outside; this is only its colour.
    mat.emissive = new THREE.Color(PALETTE.glass);
    mat.emissiveIntensity = 0;
    // Nearly black underneath. The colour is what the emissive tints toward, so
    // leaving the base at full amber pushed a lit pane past the tone mapper's
    // shoulder and every lantern in town came out as a flat white box.
    mat.color.setHex(0x3a2a16);
  }
  materials.set(key, mat);
  return mat;
}

// --- A tiny geometry kit ----------------------------------------------------

/**
 * A gable roof: a triangular prism with the ridge running along X.
 *
 * Authored by hand rather than as a 3-sided cylinder, which is the usual trick.
 * A cylinder gives an equilateral cross-section, so the pitch is fixed at sixty
 * degrees and the only way to change it is a non-uniform scale that also skews
 * the overhang — and the overhang is the thing that makes a roof read as a roof
 * rather than as a lid.
 */
function gableGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const v: number[] = [];
  const push = (...pts: [number, number, number][]) => {
    for (const p of pts) v.push(p[0], p[1], p[2]);
  };

  const ridgeL: [number, number, number] = [-hw, height, 0];
  const ridgeR: [number, number, number] = [hw, height, 0];
  const frontL: [number, number, number] = [-hw, 0, hd];
  const frontR: [number, number, number] = [hw, 0, hd];
  const backL: [number, number, number] = [-hw, 0, -hd];
  const backR: [number, number, number] = [hw, 0, -hd];

  // Front slope, back slope, two gable ends, and the underside — which is
  // visible from below whenever the camera drops toward the horizon.
  push(frontL, frontR, ridgeR, frontL, ridgeR, ridgeL);
  push(backR, backL, ridgeL, backR, ridgeL, ridgeR);
  push(frontR, backR, ridgeR);
  push(backL, frontL, ridgeL);
  push(frontL, backL, backR, frontL, backR, frontR);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  // A uv nobody reads, because mergeGeometries requires every input to carry
  // the SAME attribute set and three's own primitives all ship one. Without it
  // the merge fails outright — and the failure is not a missing roof, which
  // would at least be obvious: it is a console warning and a handful of
  // enormous stretched triangles across the middle of the town.
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Collects geometry per material and merges at the end.
 *
 * Every `add` bakes the transform into the vertices, so the merged result needs
 * no scene graph at all — which is the point: a building becomes a handful of
 * static meshes with nothing to update.
 */
class Builder {
  private readonly parts = new Map<MatKey, THREE.BufferGeometry[]>();
  private readonly matrix = new THREE.Matrix4();
  private readonly euler = new THREE.Euler();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);

  add(
    key: MatKey,
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    rotZ = 0,
    rotX = 0,
  ): void {
    // Everything is normalised to NON-indexed before it goes in the pile.
    // mergeGeometries refuses a mix — "make sure index attribute exists among
    // all geometries, or in none of them" — and three's primitives are indexed
    // while the gable prism is not. Dropping the index rather than adding one
    // is the right way round here: these are flat-shaded, so almost every
    // vertex is already unique per face, and the saving an index would buy is
    // close to nothing.
    const flat = geo.index ? geo.toNonIndexed() : geo;
    this.euler.set(rotX, rotY, rotZ);
    this.quat.setFromEuler(this.euler);
    this.pos.set(x, y, z);
    this.matrix.compose(this.pos, this.quat, this.one);
    flat.applyMatrix4(this.matrix);
    const list = this.parts.get(key);
    if (list) list.push(flat);
    else this.parts.set(key, [flat]);
  }

  /** A box centred on (x, y+h/2, z) — y is the FLOOR, which is how buildings think. */
  box(
    key: MatKey,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    rotZ = 0,
  ): void {
    this.add(key, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, rotY, rotZ);
  }

  gable(
    key: MatKey,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rotY = 0,
  ): void {
    this.add(key, gableGeometry(w, h, d), x, y, z, rotY);
  }

  cyl(
    key: MatKey,
    radius: number,
    h: number,
    x: number,
    y: number,
    z: number,
    segments = 8,
    rotZ = 0,
  ): void {
    this.add(
      key,
      new THREE.CylinderGeometry(radius, radius, h, segments),
      x,
      y + h / 2,
      z,
      0,
      rotZ,
    );
  }

  /** Merges and returns. Everything casts and receives, because a town without
   *  self-shadowing reads as flat cardboard at every hour but noon. */
  finish(into: THREE.Group): THREE.Group {
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      // World-space UVs, computed once on the merged result rather than per
      // piece — the pieces' own UVs are thrown away, which is the point.
      if (merged) boxProjectUVs(merged, TEX_SCALE[key] ?? 1);
      if (!merged) {
        // Loud, because the alternative is a town that is quietly missing every
        // roof and nothing anywhere saying so.
        console.error(`[town] could not merge ${list.length} pieces of "${key}"`);
        continue;
      }
      const mesh = new THREE.Mesh(merged, materialFor(key));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      into.add(mesh);
    }
    return into;
  }
}

// --- Half-timbering ---------------------------------------------------------

/**
 * The dark beams over the plaster, which is most of what says "town".
 *
 * Applied to one wall at a time in that wall's own frame: `width` runs along
 * local X, the wall face is at local z = 0, and beams stand a hair proud of it
 * so they are not fighting the plaster for the same depth values.
 */
function timberFrame(
  b: Builder,
  width: number,
  height: number,
  originX: number,
  originY: number,
  originZ: number,
  rotY: number,
  key: MatKey = "timber",
): void {
  const t = 0.11; // beam thickness
  const proud = 0.045;
  const sin = Math.sin(rotY);
  const cos = Math.cos(rotY);
  // Local (lx, ly, lz) -> world, given the wall's own rotation about Y.
  const place = (lx: number, ly: number, lz: number, w: number, h: number, d: number) => {
    b.box(
      key,
      w,
      h,
      d,
      originX + lx * cos + lz * sin,
      originY + ly,
      originZ - lx * sin + lz * cos,
      rotY,
    );
  };

  // Sill, top plate and two corner posts.
  place(0, 0, proud, width, t, t);
  place(0, height - t, proud, width, t, t);
  place(-width / 2 + t / 2, 0, proud, t, height, t);
  place(width / 2 - t / 2, 0, proud, t, height, t);

  // Studs, spaced so that no bay is much wider than it is tall — which is what
  // makes the pattern read as structure rather than as stripes.
  const bays = Math.max(2, Math.round(width / 1.5));
  for (let i = 1; i < bays; i++) {
    place(-width / 2 + (width * i) / bays, 0, proud, t, height, t);
  }

  // One diagonal brace per end bay. Angled braces are the difference between
  // half-timbering and a grid.
  const bayW = width / bays;
  const braceLen = Math.hypot(bayW, height) * 0.94;
  const angle = Math.atan2(bayW, height);
  for (const side of [-1, 1]) {
    const cx = side * (width / 2 - bayW / 2);
    b.add(
      key,
      new THREE.BoxGeometry(t, braceLen, t),
      originX + cx * cos + proud * sin,
      originY + height / 2,
      originZ - cx * sin + proud * cos,
      rotY,
      side * angle,
    );
  }
}

/**
 * Battens, barge boards and a fascia.
 *
 * The single biggest thing in this file for how a building reads. A gable is
 * two large quads, and a large untextured quad at this camera is a slab — the
 * chapel's roof is five and a half units deep and came out looking like a sheet
 * of card laid over a stone box. Three thin dark lines across each slope give
 * it a size, and the boards on the gable ends give it an edge; between them
 * they cost about a dozen boxes and do more than any amount of colour tuning.
 *
 * The maths is worth stating once: rotating a box about X by alpha takes its up
 * axis (0,1,0) to (0, cos a, sin a), so a batten lying flat on the +z slope —
 * whose normal is (0, D/2, roofH) — wants alpha = atan2(roofH, D/2). The -z
 * slope is the same angle negated. Getting the sign wrong plants the battens
 * edge-on through the roof, which looks like a shader fault rather than a
 * transform one.
 */
function roofDetail(
  b: Builder,
  width: number,
  depth: number,
  height: number,
  baseY: number,
): void {
  const halfD = depth / 2;
  const alpha = Math.atan2(height, halfD);
  const slopeLen = Math.hypot(halfD, height);

  for (const side of [-1, 1]) {
    // Battens across the slope, parallel to the ridge.
    for (const t of [0.32, 0.6, 0.87]) {
      b.add(
        "timber",
        new THREE.BoxGeometry(width + 0.06, 0.05, 0.11),
        0,
        baseY + height * (1 - t) + 0.03,
        side * halfD * t,
        0,
        0,
        side * alpha,
      );
    }
    // The fascia along the eaves, which is what gives the roof a bottom edge
    // rather than letting it fade into the wall behind it.
    b.box("timber", width + 0.12, 0.15, 0.1, 0, baseY - 0.11, side * (halfD - 0.02));
  }

  // Barge boards down both gable ends.
  for (const xSide of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      b.add(
        "timber",
        new THREE.BoxGeometry(0.1, 0.14, slopeLen),
        xSide * (width / 2 - 0.02),
        baseY + height / 2 + 0.03,
        (zSide * halfD) / 2,
        0,
        0,
        zSide * alpha,
      );
    }
  }
}

// --- Openings ---------------------------------------------------------------

/** A window: recessed frame, a pane that lights up, and a mullion cross. */
function window4(
  b: Builder,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
  shutters = false,
): void {
  const sin = Math.sin(rotY);
  const cos = Math.cos(rotY);
  const place = (
    key: MatKey,
    lx: number,
    ly: number,
    lz: number,
    bw: number,
    bh: number,
    bd: number,
  ) => {
    b.box(key, bw, bh, bd, x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos, rotY);
  };

  // Pane first, sunk slightly into the wall so the frame reads as a reveal.
  place("glass", 0, 0, 0.02, w, h, 0.04);
  const t = 0.09;
  place("timber", 0, -t / 2, 0.06, w + t * 2, t, t);
  place("timber", 0, h - t / 2, 0.06, w + t * 2, t, t);
  place("timber", -w / 2 - t / 2, 0, 0.06, t, h, t);
  place("timber", w / 2 + t / 2, 0, 0.06, t, h, t);
  // Mullions.
  place("timber", 0, 0, 0.07, 0.05, h, 0.05);
  place("timber", 0, h / 2 - 0.025, 0.07, w, 0.05, 0.05);

  if (shutters) {
    for (const side of [-1, 1]) {
      place("timberLight", side * (w / 2 + t + w / 4), 0, 0.055, w / 2, h, 0.05);
    }
  }
}

/** A door, its frame and a lintel. */
function door(
  b: Builder,
  w: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
): void {
  const sin = Math.sin(rotY);
  const cos = Math.cos(rotY);
  const place = (
    key: MatKey,
    lx: number,
    ly: number,
    lz: number,
    bw: number,
    bh: number,
    bd: number,
  ) => {
    b.box(key, bw, bh, bd, x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos, rotY);
  };
  place("door", 0, 0, 0.03, w, h, 0.08);
  const t = 0.1;
  place("timber", -w / 2 - t / 2, 0, 0.07, t, h + t, t);
  place("timber", w / 2 + t / 2, 0, 0.07, t, h + t, t);
  place("timber", 0, h, 0.07, w + t * 2, t, t);
  // Planking and a ring handle, so a door is not a brown rectangle.
  place("timberLight", 0, h * 0.62, 0.08, w * 0.9, 0.06, 0.03);
  place("timberLight", 0, h * 0.24, 0.08, w * 0.9, 0.06, 0.03);
  place("iron", w * 0.3, h * 0.45, 0.1, 0.08, 0.08, 0.04);
  // A stone step, which also hides the seam where the plinth meets the ground.
  place("stone", 0, -0.02, 0.34, w + 0.4, 0.14, 0.6);
}

// --- Signs ------------------------------------------------------------------

const signTextures = new Map<string, THREE.Texture>();

/**
 * A painted board. Canvas-drawn because the alternative is an atlas of
 * pre-rendered names, and the names live in `shared/town.ts` where they belong.
 */
function signTexture(text: string): THREE.Texture {
  const cached = signTextures.get(text);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3b2a1b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#c8a35e";
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

  ctx.fillStyle = "#e8cf9a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Shrink to fit rather than clipping: "The Ledger & Lamp" is half again as
  // long as "The Bent Nail" and a board that crops its own name is worse than
  // a board with small writing on it.
  let size = 58;
  do {
    ctx.font = `${size}px Georgia, "Times New Roman", serif`;
    size -= 2;
  } while (ctx.measureText(text).width > canvas.width - 80 && size > 20);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  signTextures.set(text, tex);
  return tex;
}

/** The board plus the iron bracket that hangs it off the wall. */
function hangingSign(b: Builder, group: THREE.Group, text: string, x: number, y: number, z: number, rotY: number): void {
  const sin = Math.sin(rotY);
  const cos = Math.cos(rotY);
  const at = (lx: number, lz: number) => ({
    x: x + lx * cos + lz * sin,
    z: z - lx * sin + lz * cos,
  });

  // Bracket: out from the wall, then down to the board.
  const arm = at(0, 0.55);
  b.box("iron", 0.06, 0.06, 1.1, arm.x, y, arm.z, rotY);
  const drop = at(0, 1.0);
  b.box("iron", 0.05, 0.34, 0.05, drop.x, y - 0.34, drop.z, rotY);
  const stay = at(0, 0.3);
  b.box("iron", 0.05, 0.5, 0.05, stay.x, y - 0.02, stay.z, rotY, -0.6);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.47, 0.06),
    [
      new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: signTexture(text), roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ map: signTexture(text), roughness: 0.85 }),
    ],
  );
  const boardAt = at(0, 1.0);
  board.position.set(boardAt.x, y - 0.62, boardAt.z);
  board.rotation.y = rotY;
  board.castShadow = true;
  group.add(board);
}

// --- Lanterns ---------------------------------------------------------------

export interface Lantern {
  light: THREE.PointLight;
  /** The visible flame. Absent for lights that stand inside geometry of their
   *  own, where a second bright ball would only be a second bright ball. */
  glow: THREE.Mesh | null;
  /** Stable per-lantern phase, so the flames are not one flame drawn ten times. */
  phase: number;
  /** Multiplies this one's brightness. See the note on `lantern`. */
  strength: number;
}

const lanternGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc06a, fog: false });

/**
 * A post lantern: iron post, a glass housing, a flame and the light it casts.
 *
 * The light is the expensive half and the only half that has to be real. Three
 * evaluates every point light for every fragment of every lit surface, so these
 * are counted deliberately rather than sprinkled — see LANTERN_SPOTS.
 */
function lantern(
  b: Builder,
  group: THREE.Group,
  x: number,
  z: number,
  height: number,
  lanterns: Lantern[],
  /** Scales the light only, not the ironwork. The monument's four sit close
   *  together around one pale stone plinth, and at full strength they blew it
   *  out into the brightest thing in the square by a wide margin. */
  strength = 1,
): void {
  b.cyl("iron", 0.07, height, x, 0, z, 6);
  b.box("iron", 0.34, 0.05, 0.34, x, height, z);
  b.box("glass", 0.26, 0.34, 0.26, x, height + 0.05, z);
  b.box("iron", 0.34, 0.06, 0.34, x, height + 0.39, z);
  // A little cap, so the silhouette ends in something.
  b.add(
    "iron",
    new THREE.ConeGeometry(0.22, 0.22, 6),
    x,
    height + 0.56,
    z,
  );

  const light = new THREE.PointLight(0xffb45e, 0, 13, 2);
  light.position.set(x, height + 0.22, z);
  group.add(light);

  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), lanternGlowMaterial);
  glow.position.copy(light.position);
  group.add(glow);

  lanterns.push({ light, glow, phase: (x * 12.9898 + z * 78.233) % (Math.PI * 2), strength });
}

// --- Buildings --------------------------------------------------------------

interface KindStyle {
  wall: MatKey;
  roof: MatKey;
  /** Stone up to this height before the plaster starts. 0 for none. */
  plinth: number;
  storeyHeight: number;
  roofPitch: number;
  awning?: MatKey;
}

/**
 * Proportions.
 *
 * These came down about a fifth from the first pass, which was authored to
 * real-world measurements — a storey is about 2.4m, so a two-storey inn with a
 * pitched roof stands five times the height of the 1.7-unit player. That is
 * correct and it looks wrong: at this camera the inn filled the frame and the
 * townspeople in front of it read as children. Games shrink buildings against
 * characters for exactly this reason, and these character models are chunky
 * enough that a literal scale fights them.
 *
 * The floor is the doorway. A storey may not be shorter than a door plus its
 * lintel, or the front door punches through into the room above it.
 */
const STYLES: Record<BuildingKind, KindStyle> = {
  // The inn is the biggest and the warmest: shingles, a jetty and an awning
  // over the door.
  inn: { wall: "plaster", roof: "shingle", plinth: 0.32, storeyHeight: 2.25, roofPitch: 0.5, awning: "awning" },
  shop: { wall: "plaster", roof: "shingle", plinth: 0.28, storeyHeight: 2.2, roofPitch: 0.48, awning: "awningAlt" },
  // Stone to the first floor, because it is the one building meant to be
  // defended, and the silhouette should say so before the banner does.
  watchpost: { wall: "plasterCool", roof: "slate", plinth: 1.4, storeyHeight: 2.25, roofPitch: 0.5 },
  chapel: { wall: "stone", roof: "slate", plinth: 0.35, storeyHeight: 3.0, roofPitch: 0.7 },
  cottage: { wall: "plaster", roof: "thatch", plinth: 0.28, storeyHeight: 2.2, roofPitch: 0.56 },
  stable: { wall: "timberLight", roof: "thatch", plinth: 0.2, storeyHeight: 2.1, roofPitch: 0.5 },
};

/**
 * One building.
 *
 * Local frame: +X runs across the FRONT, +Z points out of the front door, and
 * the origin is the middle of the footprint at ground level. The group is then
 * turned by the building's facing, so everything below can be written as though
 * every building faced the same way — which is the only reason the openings and
 * the timbering are legible at all.
 */
function makeBuilding(b: TownBuilding, lanterns: Lantern[]): THREE.Group {
  const group = new THREE.Group();
  // Stamped so a test can find one building among the merged meshes without
  // being handed a second copy of the layout to compare against — the whole
  // point of asking the built scene is that it might disagree with the data.
  group.userData.buildingId = b.id;
  group.position.set(toWorldX(b.x), 0, toWorldZ(b.y));
  // Server degrees are measured in the XY plane where +y is south; world Z is
  // south too, so a bearing maps to a Y rotation by negating and quarter-turning.
  group.rotation.y = -((b.facingDeg * Math.PI) / 180) + Math.PI / 2;

  const style = STYLES[b.kind];
  const w = b.widthPx / PX_PER_UNIT;
  const d = b.depthPx / PX_PER_UNIT;
  const hw = w / 2;
  const hd = d / 2;
  const builder = new Builder();

  const storeys = b.storeys;
  const bodyH = style.storeyHeight * storeys;
  // The upper floor of a two-storey building oversails the lower one. It is a
  // small number and it does more for the silhouette than anything else here.
  const jetty = storeys === 2 ? 0.22 : 0;

  // Plinth.
  if (style.plinth > 0) {
    builder.box("stone", w + 0.18, style.plinth, d + 0.18, 0, 0, 0);
    builder.box("stoneDark", w + 0.3, 0.12, d + 0.3, 0, 0, 0);
  }

  // Ground floor.
  const groundH = storeys === 2 ? style.storeyHeight : bodyH;
  builder.box(style.wall, w, groundH, d, 0, style.plinth, 0);

  // Upper floor, wider by the jetty on all four sides.
  if (storeys === 2) {
    builder.box(style.wall, w + jetty * 2, style.storeyHeight, d + jetty * 2, 0, style.plinth + groundH, 0);
    // The bressummer — the beam the overhang sits on. Without it the upper
    // floor looks like it is floating rather than cantilevered.
    for (const [bw, bd, bx, bz, ry] of [
      [w + jetty * 2 + 0.1, 0.2, 0, hd + jetty, 0],
      [w + jetty * 2 + 0.1, 0.2, 0, -hd - jetty, 0],
      [d + jetty * 2 + 0.1, 0.2, hw + jetty, 0, Math.PI / 2],
      [d + jetty * 2 + 0.1, 0.2, -hw - jetty, 0, Math.PI / 2],
    ] as [number, number, number, number, number][]) {
      builder.box("timber", bw, 0.22, bd + 0.16, bx, style.plinth + groundH - 0.1, bz, ry);
    }
  }

  const wallTop = style.plinth + bodyH;
  const outerHW = hw + jetty;
  const outerHD = hd + jetty;

  // Timbering on all four faces of whatever the top storey is.
  const frameY = storeys === 2 ? style.plinth + groundH : style.plinth;
  const frameH = storeys === 2 ? style.storeyHeight : bodyH;
  if (style.wall !== "stone") {
    timberFrame(builder, w + jetty * 2, frameH, 0, frameY, outerHD, 0);
    timberFrame(builder, w + jetty * 2, frameH, 0, frameY, -outerHD, Math.PI);
    timberFrame(builder, d + jetty * 2, frameH, outerHW, frameY, 0, Math.PI / 2);
    timberFrame(builder, d + jetty * 2, frameH, -outerHW, frameY, 0, -Math.PI / 2);
  }

  // Roof. Ridge along X, so it runs across the front — which is what puts a
  // gable end over the door.
  //
  // Capped against the WALLS as well as scaled from the depth. Pitch alone is a
  // trap on a deep, single-storey building: the chapel is nearly five units
  // front to back and one storey tall, so a pitch that looks right on a cottage
  // gave it a roof taller than the building under it — which from the square
  // read as a featureless slate slab with a spire stuck on the end of it.
  const roofH = Math.min(d * style.roofPitch, bodyH * 0.8);
  const overhang = 0.36;
  const roofW = w + jetty * 2 + overhang * 2;
  const roofD = d + jetty * 2 + overhang * 2;
  builder.gable(style.roof, roofW, roofH, roofD, 0, wallTop, 0);
  // Ridge cap.
  builder.box("timber", roofW + 0.1, 0.13, 0.16, 0, wallTop + roofH - 0.06, 0);
  roofDetail(builder, roofW, roofD, roofH, wallTop);

  // --- Openings -------------------------------------------------------------
  const doorW = 1.0;
  const doorH = 1.9;
  door(builder, doorW, doorH, 0, style.plinth, outerHD + 0.01, 0);

  // Ground-floor windows either side of the door, and a row upstairs.
  const groundWindowY = style.plinth + 0.85;
  const sideOffset = Math.min(hw - 0.7, doorW / 2 + 1.0);
  if (sideOffset > doorW / 2 + 0.5) {
    for (const side of [-1, 1]) {
      window4(builder, 0.85, 1.0, side * sideOffset, groundWindowY, outerHD + 0.01, 0, b.kind === "cottage");
    }
  }
  if (storeys === 2) {
    const upperY = style.plinth + groundH + 0.75;
    const count = w > 5.5 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1)) * 2 - 1;
      window4(builder, 0.8, 0.95, t * (outerHW - 0.85), upperY, outerHD + 0.01, 0, true);
    }
  }
  // A window on each flank, whatever the storey count. Skipping this for
  // single-storey buildings left the chapel — deep, tall, stone-walled, and
  // therefore with no timbering either — as a completely blank slab from three
  // sides out of four, and at night as a black hole in a lit square.
  {
    const flankY = storeys === 2 ? style.plinth + groundH + 0.75 : style.plinth + 0.95;
    const flankH = storeys === 2 ? 0.95 : Math.min(1.5, bodyH - 1.3);
    const rows = Math.max(1, Math.round(d / 2.2));
    for (const side of [-1, 1]) {
      for (let i = 0; i < rows; i++) {
        const t = rows === 1 ? 0 : (i / (rows - 1)) * 2 - 1;
        window4(
          builder,
          0.75,
          flankH,
          side * (outerHW + 0.01),
          flankY,
          t * (outerHD - 0.9),
          side * (Math.PI / 2),
        );
      }
    }
  }

  // --- Per-kind character ---------------------------------------------------
  if (style.awning) {
    // A sloped canvas over the door, on two posts.
    builder.add(
      style.awning,
      new THREE.BoxGeometry(doorW + 1.5, 0.08, 1.5),
      0,
      style.plinth + doorH + 0.55,
      outerHD + 0.72,
      0,
      0,
      -0.28,
    );
    for (const side of [-1, 1]) {
      builder.cyl("timberLight", 0.07, style.plinth + doorH + 0.3, side * (doorW / 2 + 0.6), 0, outerHD + 1.36, 6);
    }
  }

  if (b.kind === "inn" || b.kind === "cottage") {
    // Chimney, on the flank, breaking the ridge line.
    const cx = outerHW - 0.5;
    builder.box("stone", 0.62, wallTop + roofH + 0.7, 0.62, cx, 0, -outerHD * 0.35);
    builder.box("stoneDark", 0.8, 0.18, 0.8, cx, wallTop + roofH + 0.7, -outerHD * 0.35);
  }

  if (b.kind === "watchpost") {
    // A crenellated lookout above the roof line, and a banner down the front.
    const platY = wallTop + roofH;
    builder.box("stoneDark", w * 0.55, 0.16, d * 0.55, 0, platY, 0);
    const merlonW = 0.3;
    const ringW = w * 0.55;
    const ringD = d * 0.55;
    for (let i = 0; i < 5; i++) {
      const t = (i / 4) * 2 - 1;
      builder.box("stone", merlonW, 0.42, merlonW, t * (ringW / 2 - 0.15), platY + 0.16, ringD / 2 - 0.15);
      builder.box("stone", merlonW, 0.42, merlonW, t * (ringW / 2 - 0.15), platY + 0.16, -ringD / 2 + 0.15);
      builder.box("stone", merlonW, 0.42, merlonW, ringW / 2 - 0.15, platY + 0.16, t * (ringD / 2 - 0.15));
      builder.box("stone", merlonW, 0.42, merlonW, -ringW / 2 + 0.15, platY + 0.16, t * (ringD / 2 - 0.15));
    }
    builder.box("banner", 1.0, 2.4, 0.06, 0, style.plinth + bodyH - 2.6, outerHD + 0.07);
    builder.box("iron", 1.2, 0.1, 0.1, 0, style.plinth + bodyH - 0.25, outerHD + 0.09);
  }

  if (b.kind === "chapel") {
    // A bell tower over the door: a square shaft, an open belfry, a spire.
    const towerW = 1.5;
    const shaftH = wallTop + roofH * 0.55;
    builder.box("stone", towerW, shaftH, towerW, 0, 0, outerHD - towerW / 2 + 0.15);
    // Belfry openings, faked as four corner posts under a cap.
    for (const [px, pz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as [number, number][]) {
      builder.box(
        "stone",
        0.28,
        1.0,
        0.28,
        px * (towerW / 2 - 0.14),
        shaftH,
        outerHD - towerW / 2 + 0.15 + pz * (towerW / 2 - 0.14),
      );
    }
    builder.box("stoneDark", towerW + 0.3, 0.18, towerW + 0.3, 0, shaftH + 1.0, outerHD - towerW / 2 + 0.15);
    builder.add(
      "slate",
      new THREE.ConeGeometry(towerW * 0.78, 1.9, 4),
      0,
      shaftH + 1.18 + 0.95,
      outerHD - towerW / 2 + 0.15,
      Math.PI / 4,
    );
    // The bell itself, visible through the belfry.
    builder.add("iron", new THREE.ConeGeometry(0.26, 0.42, 8), 0, shaftH + 0.62, outerHD - towerW / 2 + 0.15);
    // A tall lancet either side of the door. The one piece of decoration the
    // chapel gets, and the only thing that makes it read as a chapel rather
    // than as the biggest shed in town.
    for (const side of [-1, 1]) {
      window4(builder, 0.55, bodyH - 1.5, side * (hw - 0.75), style.plinth + 0.8, outerHD + 0.01, 0);
    }
  }

  // A bracket lantern either side of every front door. These are what make the
  // town navigable after dark at close range; the post lanterns in the square
  // do the wide work.
  for (const side of [-1, 1]) {
    const lx = side * (doorW / 2 + 0.42);
    builder.box("iron", 0.06, 0.06, 0.4, lx, style.plinth + doorH - 0.15, outerHD + 0.2);
    builder.box("glass", 0.22, 0.3, 0.22, lx, style.plinth + doorH - 0.5, outerHD + 0.4);
    builder.box("iron", 0.28, 0.06, 0.28, lx, style.plinth + doorH - 0.2, outerHD + 0.4);
  }

  // The sign's ironwork is geometry like everything else and goes in before the
  // merge; only the painted board, which carries its own texture, is a mesh of
  // its own. Calling finish() first and then adding to the same Builder is the
  // trap here — the geometry is accepted, never merged, and simply does not
  // appear, which looks exactly like a missing model.
  if (b.name) {
    hangingSign(builder, group, b.name, outerHW - 0.5, style.plinth + doorH + 1.15, outerHD, 0);
  }

  builder.finish(group);

  // One real light per building, at the door, rather than one per lantern:
  // twelve door lanterns would be twelve point lights for a difference nobody
  // can see once the six post lanterns in the square are lit.
  const doorLight = new THREE.PointLight(0xffb45e, 0, 9, 2);
  doorLight.position.set(0, style.plinth + doorH - 0.35, outerHD + 0.5);
  group.add(doorLight);
  lanterns.push({ light: doorLight, glow: null, phase: (b.x * 0.37) % 6.283, strength: 1 });

  return group;
}

// --- Ground, wall and dressing ----------------------------------------------

/**
 * The cobbled square and the road through it.
 *
 * One texture with an alpha that falls off at the edges, laid a few centimetres
 * above the terrain. A hard-edged patch of a different colour reads as a decal
 * bug; a soft one reads as ground that has been walked on.
 */
/**
 * The paving: a seamless tile of set cobbles, meant to REPEAT.
 *
 * The first version baked its own alpha falloff into one 512px image stretched
 * across the whole square, which is why the plaza read as mud with pebbles
 * printed on it: twenty-seven world units of ground carrying 512 pixels of
 * detail is about nineteen pixels per unit, against a player who is 1.7 units
 * tall. Tiling instead puts the same image down twelve times across the square,
 * and the fade is done with vertex alpha on the mesh — see `buildGround`.
 */
function cobbleTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(20260821);

  // Mortar under everything, so the gaps between stones are a colour rather
  // than a hole.
  ctx.fillStyle = "#5c5449";
  ctx.fillRect(0, 0, size, size);

  // Set in courses with a half-lap, the way a real sett pavement is laid. Rows
  // of random blobs read as gravel; courses read as something somebody built.
  const rows = 9;
  const h = size / rows;
  for (let row = 0; row < rows; row++) {
    let x = -((row % 2) * h) / 2;
    while (x < size) {
      const w = h * (0.75 + rand() * 0.8);
      const shade = 118 + Math.floor(rand() * 54);
      const warm = rand() * 10;
      ctx.fillStyle = `rgb(${shade + warm},${shade + warm * 0.5},${shade - 6})`;
      const bx = x;
      wrapped(ctx, size, () => {
        ctx.beginPath();
        // Rounded rectangles: a sett is a cut stone with worn corners.
        const r = 2.5;
        ctx.roundRect(bx + 1.2, row * h + 1.2, w - 2.4, h - 2.4, r);
        ctx.fill();
      });
      // A highlight on top and a shadow at the bottom, which is the whole
      // relief cue at this camera.
      ctx.fillStyle = "rgba(255,255,255,0.13)";
      wrapped(ctx, size, () => ctx.fillRect(bx + 2, row * h + 2, w - 4, 1.6));
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      wrapped(ctx, size, () => ctx.fillRect(bx + 2, row * h + h - 3.6, w - 4, 1.8));
      x += w;
    }
  }
  speckle(ctx, size, rand, 5000, 0.12);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function roadTexture(): THREE.Texture {
  const w = 128;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#7d6c53";
  ctx.fillRect(0, 0, w, h);
  const rand = seeded(4242);
  // Rutted earth: long streaks along the road plus loose stones, rather than a
  // uniform speckle. A cart track has a direction and the old one did not.
  for (let i = 0; i < 90; i++) {
    const y = rand() * h;
    const shade = 100 + Math.floor(rand() * 52);
    ctx.strokeStyle = `rgba(${shade},${shade - 10},${shade - 26},0.5)`;
    ctx.lineWidth = 0.8 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(-5, y);
    for (let x = -5; x < w + 5; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.09 + i) * 1.6);
    ctx.stroke();
  }
  for (let i = 0; i < 500; i++) {
    const shade = 96 + Math.floor(rand() * 66);
    ctx.fillStyle = `rgba(${shade},${shade - 8},${shade - 22},0.75)`;
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, 0.8 + rand() * 2.4, 0.6 + rand() * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    // Fades along the short axis, so the road has verges rather than kerbs.
    const t = Math.abs((y / (h - 1)) * 2 - 1);
    const a = Math.min(1, Math.max(0, (1 - t) / 0.35));
    for (let x = 0; x < w; x++) img.data[(y * w + x) * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(26, 1);
  return tex;
}

/** The palisade: posts around the boundary, opening at each gate. */
function palisade(b: Builder, group: THREE.Group, lanterns: Lantern[]): void {
  const radius = TOWN_RADIUS_PX / PX_PER_UNIT;
  const cx = toWorldX(TOWN_CENTER.x);
  const cz = toWorldZ(TOWN_CENTER.y);

  const inGateway = (deg: number) =>
    TOWN_GATE_ANGLES.some((g) => {
      const diff = Math.abs(((deg - g + 540) % 360) - 180);
      return 180 - diff < TOWN_GATE_HALF_DEG;
    });

  let seed = 991;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  const step = 1.15; // degrees between posts
  for (let deg = 0; deg < 360; deg += step) {
    if (inGateway(deg)) continue;
    const a = (deg * Math.PI) / 180;
    // Server bearings again: +y is south, and south is +z.
    const x = cx + Math.cos(a) * radius;
    const z = cz + Math.sin(a) * radius;
    const h = 2.0 + rand() * 0.45;
    b.cyl("timberLight", 0.15, h, x, 0, z, 6);
    // A sharpened tip, which is the whole reason a palisade reads as defence.
    b.add("timberLight", new THREE.ConeGeometry(0.16, 0.34, 6), x, h + 0.17, z);
  }

  // Rails, drawn as short chords between posts. Coarser than the posts on
  // purpose — a rail per post triples the geometry for a line you read as one.
  for (let deg = 0; deg < 360; deg += step * 3) {
    if (inGateway(deg) || inGateway(deg + step * 3)) continue;
    const a0 = (deg * Math.PI) / 180;
    const a1 = ((deg + step * 3) * Math.PI) / 180;
    const x0 = cx + Math.cos(a0) * radius;
    const z0 = cz + Math.sin(a0) * radius;
    const x1 = cx + Math.cos(a1) * radius;
    const z1 = cz + Math.sin(a1) * radius;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const midX = (x0 + x1) / 2;
    const midZ = (z0 + z1) / 2;
    const rot = -Math.atan2(z1 - z0, x1 - x0);
    b.box("timber", len + 0.1, 0.12, 0.09, midX, 1.35, midZ, rot);
  }

  // Gatehouses: two heavy posts and a lintel at each opening, with a lantern on
  // top. This is what turns a gap in a fence into a way in.
  for (const gate of TOWN_GATE_ANGLES) {
    const a = (gate * Math.PI) / 180;
    // Perpendicular to the radius, so the posts flank the road.
    const px = -Math.sin(a);
    const pz = Math.cos(a);
    const gx = cx + Math.cos(a) * radius;
    const gz = cz + Math.sin(a) * radius;
    const halfGap = radius * Math.tan((TOWN_GATE_HALF_DEG * Math.PI) / 180);
    for (const side of [-1, 1]) {
      const x = gx + px * halfGap * side;
      const z = gz + pz * halfGap * side;
      b.box("timber", 0.42, 3.4, 0.42, x, 0, z, -a);
      b.box("stoneDark", 0.62, 0.2, 0.62, x, 0, z, -a);
    }
    // Lintel across the top.
    const rot = -Math.atan2(pz, px);
    b.box("timber", halfGap * 2 + 0.5, 0.32, 0.34, gx, 3.4, gz, rot);
    b.box("timberLight", halfGap * 2 + 0.9, 0.16, 0.5, gx, 3.72, gz, rot);
    lantern(b, group, gx + px * (halfGap - 0.6), gz + pz * (halfGap - 0.6), 3.2, lanterns);
  }
}

/** The well in the square, plus a market stall, troughs and fences. */
function squareDressing(b: Builder, group: THREE.Group, lanterns: Lantern[]): void {
  const cx = toWorldX(TOWN_CENTER.x);
  const cz = toWorldZ(TOWN_CENTER.y);
  const polar = (radiusPx: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + (Math.cos(a) * radiusPx) / PX_PER_UNIT, z: cz + (Math.sin(a) * radiusPx) / PX_PER_UNIT };
  };

  // --- The monument ---------------------------------------------------------
  // What the square is FOR. A plaza with a smithy in the middle of it and
  // nothing else is a yard; a plaza with something in it people would stand
  // near is a square. Stepped base, plinth, obelisk, and a bronze band round
  // the top so the eye has somewhere to land.
  //
  // Placed off the exact centre, because the exact centre is the anvil and is
  // also where every player in the game arrives.
  const monument = polar(330, 62);
  for (let step = 0; step < 3; step++) {
    const half = 2.5 - step * 0.42;
    b.box(step === 1 ? "stoneDark" : "stone", half * 2, 0.22, half * 2, monument.x, step * 0.22, monument.z, Math.PI / 4);
  }
  b.box("stone", 1.5, 0.55, 1.5, monument.x, 0.66, monument.z, Math.PI / 4);
  b.box("stoneDark", 1.24, 0.16, 1.24, monument.x, 1.21, monument.z, Math.PI / 4);
  b.box("stone", 0.86, 3.1, 0.86, monument.x, 1.37, monument.z, Math.PI / 4);
  b.box("iron", 0.95, 0.2, 0.95, monument.x, 3.6, monument.z, Math.PI / 4);
  b.add("iron", new THREE.ConeGeometry(0.62, 1.0, 4), monument.x, 5.05, monument.z, Math.PI / 4);
  // Four small lamps at the corners of the base, which is what makes it the
  // brightest thing in the square after dark.
  for (const deg of [45, 135, 225, 315]) {
    const a = (deg * Math.PI) / 180;
    lantern(b, group, monument.x + Math.cos(a) * 2.1, monument.z + Math.sin(a) * 2.1, 1.5, lanterns, 0.4);
  }

  // --- The well -------------------------------------------------------------
  const well = polar(430, 330);
  b.add("stone", new THREE.CylinderGeometry(1.05, 1.15, 0.9, 12), well.x, 0.45, well.z);
  b.add("stoneDark", new THREE.CylinderGeometry(1.12, 1.12, 0.14, 12), well.x, 0.93, well.z);
  b.add("iron", new THREE.CylinderGeometry(0.9, 0.9, 0.06, 12), well.x, 0.62, well.z);
  // Posts short enough that the whole well comes in under a cottage's eaves.
  // The first pass stood 3.75 units tall — taller than the houses around it —
  // and the roof read as a khaki plane floating over the square.
  for (const side of [-1, 1]) {
    b.box("timberLight", 0.15, 1.5, 0.15, well.x + side * 0.8, 0.9, well.z);
  }
  b.box("timberLight", 2.0, 0.15, 0.15, well.x, 2.3, well.z);
  b.gable("thatch", 2.4, 0.85, 1.5, well.x, 2.4, well.z);
  b.cyl("timberLight", 0.1, 1.7, well.x, 0.95, well.z, 8, Math.PI / 2);
  b.box("iron", 0.05, 0.55, 0.05, well.x, 1.72, well.z);
  b.box("timberLight", 0.42, 0.3, 0.42, well.x, 1.4, well.z);

  // --- A market stall -------------------------------------------------------
  const stall = polar(430, 200);
  const stallRot = -((200 - 180) * Math.PI) / 180;
  for (const [sx, sz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]] as [number, number][]) {
    const rx = stall.x + sx * Math.cos(stallRot) + sz * Math.sin(stallRot);
    const rz = stall.z - sx * Math.sin(stallRot) + sz * Math.cos(stallRot);
    b.cyl("timberLight", 0.08, 2.2, rx, 0, rz, 6);
  }
  b.box("timberLight", 2.9, 0.16, 0.7, stall.x, 1.0, stall.z, stallRot);
  b.box("timberLight", 2.9, 0.5, 0.1, stall.x, 0.5, stall.z + 0.35, stallRot);
  // Pitched properly rather than nearly flat: a 0.55 rise over two units of
  // depth reads as a grey plane floating over four sticks.
  b.gable("awning", 3.1, 0.9, 2.0, stall.x, 2.2, stall.z, stallRot);
  // Goods on the counter, as a row of small crates and a couple of sacks.
  for (let i = -1; i <= 1; i++) {
    b.box("timber", 0.34, 0.3, 0.34, stall.x + i * 0.7 * Math.cos(stallRot), 1.16, stall.z - i * 0.7 * Math.sin(stallRot), stallRot);
  }

  // --- Post lanterns around the square -------------------------------------
  // Six, on the ring between the anvil and the buildings. This is the number
  // the night pass is tuned against; every extra one is a real per-fragment
  // cost on every lit surface in view.
  for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const p = polar(620, deg + 22);
    lantern(b, group, p.x, p.z, 3.1, lanterns);
  }

  // --- Fences, troughs and a woodpile --------------------------------------
  const pile = polar(660, 165);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      b.cyl(
        "timberLight",
        0.15,
        1.4,
        pile.x + (i - (3 - row) / 2) * 0.34,
        row * 0.3,
        pile.z,
        7,
        Math.PI / 2,
      );
    }
  }

  const trough = polar(660, 105);
  b.box("timberLight", 1.9, 0.55, 0.75, trough.x, 0, trough.z);
  b.box("stoneDark", 1.7, 0.12, 0.6, trough.x, 0.4, trough.z);

  // --- Benches --------------------------------------------------------------
  // Somewhere to stand around, which is what this square is for. Placed facing
  // inward on the ring the lanterns are on, so the lit part of the town at
  // night is also the part with something to sit on.
  for (const deg of [22, 68, 112, 158, 202, 248, 292, 338]) {
    const p = polar(540, deg);
    const rot = -((deg + 90) * Math.PI) / 180;
    b.box("timberLight", 1.9, 0.11, 0.5, p.x, 0.45, p.z, rot);
    b.box("timberLight", 1.9, 0.42, 0.1, p.x, 0.56, p.z, rot, 0);
    for (const side of [-1, 1]) {
      const lx = side * 0.75;
      b.box(
        "timber",
        0.14,
        0.45,
        0.44,
        p.x + lx * Math.cos(rot),
        0,
        p.z - lx * Math.sin(rot),
        rot,
      );
    }
  }

  // --- The band between the buildings and the wall --------------------------
  // Widening the square left a six-unit ring of bare grass inside the palisade,
  // which reads as a fence somebody put round a field. Kitchen gardens, hedges
  // and a cart fill it — all of it built from the same kit as everything else
  // so nothing here needs a download.
  for (const deg of [20, 65, 110, 160, 200, 250, 295, 340]) {
    const p = polar(735, deg);
    const rot = -((deg + 90) * Math.PI) / 180;
    // A fenced plot: four low rails and three rows of something growing.
    for (const side of [-1, 1]) {
      b.box("timberLight", 3.0, 0.09, 0.07, p.x, 0.5, p.z + side * 1.1, rot);
      b.box("timberLight", 3.0, 0.09, 0.07, p.x, 0.24, p.z + side * 1.1, rot);
    }
    for (let i = -2; i <= 2; i++) {
      const lx = i * 0.62;
      b.box(
        "garden",
        0.34,
        0.2,
        1.7,
        p.x + lx * Math.cos(rot),
        0,
        p.z - lx * Math.sin(rot),
        rot,
      );
    }
  }
}

/**
 * A disc built as concentric rings, with UVs in world units and a vertex alpha
 * that reaches zero at the rim.
 *
 * `bands` are the radii as fractions, and they are not evenly spaced on purpose:
 * the fade only needs geometry where it happens, and a uniformly subdivided disc
 * spends most of its vertices in the middle where the alpha is a constant 1.
 */
function ringedDisc(radius: number, segments: number, bands: number[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  const alphaAt = (t: number) => (t <= 0.78 ? 1 : Math.max(0, 1 - (t - 0.78) / 0.22));
  const push = (t: number, angle: number) => {
    const r = t * radius;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    positions.push(x, y, 0);
    // World units, so the tiling is the same density as everything else in town.
    uvs.push(x * 0.42, y * 0.42);
    const a = alphaAt(t);
    colors.push(1, 1, 1, a);
  };

  for (let b = 0; b < bands.length - 1; b++) {
    const inner = bands[b];
    const outer = bands[b + 1];
    for (let s = 0; s < segments; s++) {
      const a0 = (s / segments) * Math.PI * 2;
      const a1 = ((s + 1) / segments) * Math.PI * 2;
      if (inner === 0) {
        push(0, a0);
        push(outer, a0);
        push(outer, a1);
      } else {
        push(inner, a0);
        push(outer, a0);
        push(outer, a1);
        push(inner, a0);
        push(outer, a1);
        push(inner, a1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geo.computeVertexNormals();
  return geo;
}

// --- The town ---------------------------------------------------------------

export class Town {
  readonly group = new THREE.Group();
  private readonly lanterns: Lantern[] = [];
  /** Lifts the whole square after dark. See `update`. */
  private readonly townFill = new THREE.HemisphereLight(0xffd8a0, 0x3a2c1e, 0);
  /** A soft warm pool over the square itself, so the middle is the brightest. */
  private readonly squareGlow = new THREE.PointLight(0xffbe72, 0, 46, 1.6);

  build(scene: THREE.Scene): void {
    const builder = new Builder();

    for (const b of TOWN_BUILDINGS) {
      this.group.add(makeBuilding(b, this.lanterns));
    }

    palisade(builder, this.group, this.lanterns);
    squareDressing(builder, this.group, this.lanterns);
    builder.finish(this.group);

    this.buildGround();

    const cx = toWorldX(TOWN_CENTER.x);
    const cz = toWorldZ(TOWN_CENTER.y);
    this.squareGlow.position.set(cx, 7.5, cz);
    this.group.add(this.squareGlow);
    this.group.add(this.townFill);

    scene.add(this.group);
    void this.dressWithProps();
  }

  /**
   * The paved square and the road, laid flat just above the terrain.
   *
   * The paving is a DISC with vertex alpha rather than a quad with a baked
   * falloff, which is what lets the cobble texture tile. Three's standard
   * material multiplies a four-component colour attribute into both the diffuse
   * and the opacity, so "fade out at the rim" becomes a per-vertex number and
   * the map is free to repeat as often as it likes underneath it.
   */
  private buildGround(): void {
    const cx = toWorldX(TOWN_CENTER.x);
    const cz = toWorldZ(TOWN_CENTER.y);
    const radius = TOWN_RADIUS_PX / PX_PER_UNIT;
    // Stops just short of the buildings' front walls rather than running under
    // them: paving that reaches the palisade makes the whole enclosure one
    // surface, and the belt of grass between the houses and the wall is what
    // gives the gardens and the woodpile somewhere to be.
    const paveRadius = radius * 0.66;

    // Rings, so the fade has somewhere to happen. Three's own CircleGeometry is
    // a fan from a single centre vertex, and an alpha interpolated straight
    // from the middle to the rim fades the whole plaza rather than only its
    // edge — which is why this is built by hand.
    const ringed = ringedDisc(paveRadius, 72, [0, 0.55, 0.78, 0.9, 1]);

    const square = new THREE.Mesh(
      ringed,
      new THREE.MeshStandardMaterial({
        map: cobbleTexture(),
        // Warmed and taken down. Straight out of the canvas the setts are a
        // neutral mid-grey, and a neutral grey the size of this plaza reads as
        // a car park next to a field of warm grass.
        color: 0x9d9384,
        transparent: true,
        vertexColors: true,
        roughness: 1,
        // Without this the cobbles z-fight the terrain at grazing angles, and
        // the symptom is a shimmering ring that looks like a shader bug.
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    square.rotation.x = -Math.PI / 2;
    square.position.set(cx, 0.03, cz);
    square.receiveShadow = true;
    // Over the road. The road is a cart track that runs gate to gate, and where
    // it crosses the square it is paved — drawing it the other way round put a
    // pale strip of dirt straight across the middle of the plaza, which read as
    // a decal that had failed to blend rather than as a road.
    square.renderOrder = 2;
    this.group.add(square);

    // The road runs gate to gate, and a little way past each, so it does not
    // simply stop at the wall.
    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture(),
      color: 0x8f7f62,
      transparent: true,
      roughness: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.9, 4.2), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(cx, 0.02, cz);
    road.receiveShadow = true;
    road.renderOrder = 1;
    this.group.add(road);
  }

  /**
   * Barrels, crates and a chest from the props kit, standing against walls.
   *
   * Loaded rather than generated, because these six props already exist, are in
   * the right style, and are what the smithy is dressed with — reusing them is
   * what ties the square to the forge in the middle of it.
   */
  private async dressWithProps(): Promise<void> {
    const cx = toWorldX(TOWN_CENTER.x);
    const cz = toWorldZ(TOWN_CENTER.y);
    const polar = (radiusPx: number, deg: number) => {
      const a = (deg * Math.PI) / 180;
      return {
        x: cx + (Math.cos(a) * radiusPx) / PX_PER_UNIT,
        z: cz + (Math.sin(a) * radiusPx) / PX_PER_UNIT,
      };
    };

    // model, height, radius, bearing, y-rotation
    const props: [string, number, number, number, number][] = [
      ["props/Barrel.gltf", 0.9, 468, 235, 0.4],
      ["props/Barrel.gltf", 0.9, 476, 242, 1.9],
      ["props/Crate_Wooden.gltf", 0.6, 464, 294, -0.5],
      ["props/Crate_Wooden.gltf", 0.5, 472, 290, 0.8],
      ["props/Chest_Wood.gltf", 0.55, 460, 276, 2.4],
      ["props/Barrel.gltf", 0.85, 460, 55, -0.9],
      ["props/Crate_Wooden.gltf", 0.55, 458, 126, 1.3],
      ["props/Pouch_Large.gltf", 0.35, 424, 197, 0.6],
    ];

    const loaded = await Promise.all(
      props.map(([model, height]) =>
        instantiate(model, height).catch((err) => {
          // Same reasoning as the smithy: a missing prop is a barer square, not
          // a broken town, but silence here is how two of the six went missing
          // once already with nothing to say they had.
          console.warn(`[town] ${model} did not load:`, err);
          return null;
        }),
      ),
    );

    for (let i = 0; i < props.length; i++) {
      const inst = loaded[i];
      if (!inst) continue;
      const [, , radiusPx, deg, rotY] = props[i];
      const p = polar(radiusPx, deg);
      inst.object.position.set(p.x, 0, p.z);
      inst.object.rotation.y = rotY;
      this.group.add(inst.object);
    }
  }

  /**
   * Applies the hour.
   *
   * `night` is 0 in daylight and 1 in full dark; `distanceFromCentre` is the
   * player's, in world units.
   *
   * Two separate jobs, and it matters that they are separate:
   *
   *   1. The lanterns and the windows are PLACES. They light up after dark and
   *      they do it whether or not anybody is watching, because they are what
   *      the town looks like from outside it.
   *   2. The fill is a CONCESSION. Night in this game is genuinely dark — that
   *      is the point of the day/night grading — but a town you cannot read is
   *      a town nobody uses after dusk. So the ambient lift is scaled by how
   *      close the player is: standing in the square at midnight is comfortably
   *      legible, and twenty units past the gate you are back in the dark the
   *      rest of the world is in. Nobody gets to carry the town's light out
   *      into the field with them.
   */
  update(night: number, distanceFromCentre: number, timeSeconds: number): void {
    const radius = TOWN_RADIUS_PX / PX_PER_UNIT;
    // Full strength inside the wall, gone by half a radius past it.
    const nearness = Math.max(0, Math.min(1, 1 - (distanceFromCentre - radius) / (radius * 0.5)));
    const eased = nearness * nearness * (3 - 2 * nearness);

    this.townFill.intensity = night * 0.7 * eased;
    this.squareGlow.intensity = night * 34 * Math.max(eased, 0.25);

    // Lanterns are lit by the hour alone, not by where the player is: a town
    // that only lights up once you are inside it is a town with nothing to walk
    // toward.
    const lit = night;
    for (const l of this.lanterns) {
      const flicker =
        0.86 +
        Math.sin(timeSeconds * 6.1 + l.phase) * 0.09 +
        Math.sin(timeSeconds * 2.3 + l.phase * 2) * 0.05;
      l.light.intensity = lit * 12 * flicker * l.strength;
      if (!l.glow) continue;
      l.glow.visible = lit > 0.04;
      if (l.glow.visible) l.glow.scale.setScalar(0.85 + flicker * 0.3);
    }

    // Every pane in town, in one assignment. See the note on `materials`.
    const glass = materialFor("glass");
    glass.emissiveIntensity = lit * 1.15;
  }
}
