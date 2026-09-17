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
import { seededRandom } from "../../../shared/rng";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  TOWN_BUILDINGS,
  COLDHARROW_BASIN,
  COLDHARROW_STREETS,
  onColdharrowStreet,
  propPositionIn,
  inGatewayAmong,
  type Settlement,
  type Street,
  TOWN_CENTER,
  TOWN_GATE_ANGLES,
  TOWN_GATE_HALF_DEG,
  TOWN_RADIUS_PX,
  BENCH_ANGLES,
  BENCH_RING_PX,
  GARDEN_ANGLES,
  GARDEN_RING_PX,
  LANTERN_ANGLES,
  LANTERN_RING_PX,
  ROAD_HALF_WIDTH_PX,
  TOWN_PAVED_RADIUS_PX,
  TOWN_PROPS,
  propById,
  propPosition,
  inGateway as bearingInGateway,
  type BuildingKind,
  type TownBuilding,
} from "../../../shared/town";
import { clipName, instantiate } from "./assets";
import { Flames } from "./flame";
import { PX_PER_UNIT, toWorldX, toWorldZ } from "./World";

// --- Palette ----------------------------------------------------------------
// Warm plaster, cool stone, dark timber. Picked against the terrain shader's
// grass and the nature kit's bark rather than in isolation — a town that is
// beautiful on a grey background is a town that glows radioactively on grass.

const PALETTE = {
  // --- Coldharrow ----------------------------------------------------------
  // THE NORTH IS A DIFFERENT TEMPERATURE, and that is most of what makes it
  // read as somewhere else. Emberhold's stone (0x8d887b) is a warm grey that
  // sits happily beside plaster and thatch; used in a northern port it would
  // make Coldharrow look like Emberhold built larger, which is the one thing
  // it must not look like. These are the same values pulled toward blue and
  // down in value — cold light on wet rock.
  granite: 0x79808a,
  graniteDark: 0x565c66,
  slateCold: 0x3d4752,
  /** Tarred timber: boathouses, piles, quay edges. */
  pitch: 0x2f2b28,
  /** Frost on the north face of everything. */
  rime: 0xc3d2da,
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
  // --- Colour, added when the square was dressed ---------------------------
  // Emberhold read brown at noon: plaster, timber, thatch, cobble and grass are
  // four browns and a green, and the only saturated thing in the place was one
  // awning. A town nobody wants to stand in is a town with no colour at eye
  // level, and the fix is cloth — bunting, banners, awnings and flowers, which
  // are the things a real village puts out precisely because they are cheap and
  // bright. Four of them, kept close together in value so the square reads as
  // one palette rather than as a paint chart.
  buntingRed: 0xb8533c,
  buntingGold: 0xc9963f,
  buntingTeal: 0x40756a,
  buntingCream: 0xd9c9a4,
  /** Window boxes and planters: leaf, and two blooms to sit in it. */
  bloom: 0xc4577a,
  bloomAlt: 0xd7c05a,
  /** Sacking, sailcloth, laundry — an off-white that is not plaster. */
  linen: 0xcfc3a6,
  /** Fresh-cut timber, for the cart and the boards. Lighter than `timberLight`. */
  plank: 0x8a6b45,
  /**
   * Rough rock, for the waystones out in the field.
   *
   * Not `stone`, and the difference is coursed masonry. Every grey surface in
   * this file is a thing somebody BUILT — a wall, a plinth, a well head — so
   * `stone` carries a bonded-block texture and is right for all of them. A
   * standing stone is a rock that was dragged upright, and the first version
   * borrowed `stone` and came out looking like a brick chimney in a field.
   *
   * Warmer and a shade lighter than `stone`, so a waystone reads as something
   * that came out of the same ground it stands on rather than as a piece of the
   * town that walked off.
   */
  rock: 0x968f81,
  rockDark: 0x736c60,
  /**
   * Turned earth. The same brown the back lane is painted in, and deliberately
   * the same NUMBER rather than a shade near it: a path behind the inn and the
   * spoil round a leaning waystone are the same substance, and two browns half
   * a step apart is how a world stops looking like one place.
   */
  dirt: 0x6f6047,
} as const;

export type MatKey = keyof typeof PALETTE;

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
  buntingRed: 0.9,
  buntingGold: 0.9,
  buntingTeal: 0.9,
  buntingCream: 0.9,
  bloom: 1.6,
  bloomAlt: 1.6,
  linen: 0.8,
  plank: 1.0,
  // Coarse, and much larger than masonry: the mottling on a five-metre monolith
  // should be a handful of patches, not a hundred. At the masonry's 0.6 the
  // same drawing reads as gravel glued to a slab.
  rock: 1.9,
  rockDark: 1.9,
  dirt: 1.3,
};

function canvas2d(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return { canvas, ctx: canvas.getContext("2d")! };
}

/** Seeded, so every client's plaster is the same plaster. */
const seeded = seededRandom;

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

/**
 * Weathered rock: broad blotches, a few cracks, and grit over the top.
 *
 * Near-white and multiplying the palette like every other texture here — it is
 * a pattern of light and shade, and one place decides what colour rock is.
 * Deliberately has no repeating structure at all: masonry needs courses to read
 * as built, and this needs the opposite, because the moment a monolith shows a
 * grid it stops being a rock.
 */
function rockTexture(): HTMLCanvasElement {
  const size = 256;
  const { canvas, ctx } = canvas2d(size);
  const rand = seeded(7717);
  ctx.fillStyle = "#dcdcdc";
  ctx.fillRect(0, 0, size, size);
  // Blotches, wrapped so the tile has no findable edge.
  for (let i = 0; i < 46; i++) {
    const r = 14 + rand() * 46;
    const shade = 196 + Math.floor(rand() * 54);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.3 + rand() * 0.4})`;
    const x = rand() * size;
    const y = rand() * size;
    wrapped(ctx, size, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.6 + rand() * 0.7), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // Cracks. Short, angular and few — a crack per face at this scale, not a web.
  for (let i = 0; i < 14; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.strokeStyle = `rgba(120,120,120,${0.25 + rand() * 0.35})`;
    ctx.lineWidth = 0.7 + rand() * 1.4;
    wrapped(ctx, size, () => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      let cx = x;
      let cy = y;
      for (let s = 0; s < 3; s++) {
        cx += (rand() - 0.5) * 46;
        cy += (rand() - 0.5) * 46;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    });
  }
  speckle(ctx, size, rand, 6200, 0.2);
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
  // The new cloth shares the weave the awnings already use, and the blooms
  // share the foliage stipple — nine canvases still, for twenty-two materials.
  buntingRed: clothTexture,
  buntingGold: clothTexture,
  buntingTeal: clothTexture,
  buntingCream: clothTexture,
  linen: clothTexture,
  bloom: foliageTexture,
  bloomAlt: foliageTexture,
  plank: woodTexture,
  rock: rockTexture,
  rockDark: rockTexture,
  // Earth borrows the rock's mottling: it is broad blotches and grit either
  // way, and what makes one soil and the other stone is the colour over it.
  dirt: rockTexture,
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
 * One material per palette entry, shared by everything that is not a building.
 *
 * Buildings get their OWN clones — see `Builder.finish`. That is not an
 * optimisation, it is what makes the occlusion fade possible: when a wall ends
 * up between the camera and the character the client fades the wall, and with
 * one plaster material for the whole town, fading the inn you are standing
 * behind would also fade the chapel across the square.
 *
 * The cost of splitting is materials, not draw calls — each building still
 * draws one mesh per surface — and the one thing that genuinely wanted sharing,
 * the lit-window emissive, is served by `litGlass` below instead.
 */
const materials = new Map<MatKey, THREE.MeshStandardMaterial>();

/**
 * Every window material in town, prototype and clones alike.
 *
 * The night pass walks this instead of writing one shared value. A dozen
 * assignments once a frame is nothing, and it is the price of being able to
 * fade one building without fading the rest.
 */
const litGlass: THREE.MeshStandardMaterial[] = [];

export function materialFor(key: MatKey): THREE.MeshStandardMaterial {
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
    litGlass.push(mat);
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
/**
 * Merges a pile of primitives into one mesh per material.
 *
 * EXPORTED, and it is the one thing in this file that is not about Emberhold.
 * The waystones out in the field are built with it: they are boxes and prisms
 * in the same palette, surfaced with the same procedural masonry, and the
 * alternative was a second copy of nine canvas textures so that a standing
 * stone could be the same grey as the town wall. A landmark that does not match
 * the place it was cut for is the same mistake a downloaded building pack would
 * have been.
 */
export class Builder {
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

  /**
   * Merges and returns. Everything casts and receives, because a town without
   * self-shadowing reads as flat cardboard at every hour but noon.
   *
   * `ownMaterials` clones the palette for this builder alone, which is what a
   * building wants and the palisade does not: only something that can be faded
   * independently needs materials of its own.
   */
  finish(into: THREE.Group, ownMaterials = false): THREE.Group {
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
      let mat = materialFor(key);
      if (ownMaterials) {
        mat = mat.clone();
        // The clone shares the texture by reference, which is the whole point:
        // seventy materials, still nine canvases.
        if (key === "glass") litGlass.push(mat);
      }
      const mesh = new THREE.Mesh(merged, mat);
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
  /**
   * Null for a fitting that is drawn lit but casts no real light.
   *
   * See the `light` parameter on `lantern`: a city's worth of street lamps at
   * one PointLight each is what made Coldharrow unplayable, and most of them
   * are now post-and-glow only.
   */
  light: THREE.PointLight | null;
  /** The visible flame. Absent for lights that stand inside geometry of their
   *  own, where a second bright ball would only be a second bright ball. */
  glow: THREE.Mesh | null;
  /** Stable per-lantern phase, so the flames are not one flame drawn ten times. */
  phase: number;
  /** Multiplies this one's brightness. See the note on `lantern`. */
  strength: number;
}

/**
 * The open fires in town.
 *
 * Only the braziers, deliberately. A post lantern is a wick behind four panes
 * of glass and its little emissive ball is the right object for that — you are
 * looking at a lamp, not at a fire. A brazier is a basket of burning wood that
 * people stand round, and until now the two were literally the same sphere with
 * a different multiplier on the light.
 */
let townFlames: Flames | null = null;

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
  /**
   * Light only, no post.
   *
   * For fittings that build their own body — the brazier is an iron basket on
   * three legs and wants a flame in it, not a lamp post growing out of it.
   * Sharing the light-and-flicker half is what keeps every warm source in town
   * on one clock.
   */
  bare = false,
  /** Suppresses the emissive ball, for a fitting that supplies its own fire. */
  noGlow = false,
  /**
   * Whether this fitting gets a real `PointLight`.
   *
   * THE SINGLE MOST EXPENSIVE THING IN THE CITY, and the reason this parameter
   * exists. Emberhold has six lanterns and so six point lights, which is fine.
   * Coldharrow's streets wanted a lamp every 380px along four spokes and two
   * rings, and that came to FIFTY-EIGHT — sixty-six with the braziers, an
   * eleven-fold increase in dynamic lights. Reported from play as "unplayable,
   * you made the game lag and freeze like crazy", which is exactly right: every
   * lit fragment in the scene pays for every light in range, and three.js
   * recompiles the shader program whenever the count changes, so walking the
   * city triggers a stall on nearly every step.
   *
   * A lamp does not need a light to read as lit. The POST is merged geometry
   * and effectively free; the GLOW is a small emissive ball that is bright at
   * night on its own. So most lamps get both of those and no light, a few get
   * the real thing so the street has actual pools of illumination, and the
   * braziers keep theirs because they are what people gather at.
   */
  light = true,
): void {
  if (!bare) {
    b.cyl("iron", 0.07, height, x, 0, z, 6);
    b.box("iron", 0.34, 0.05, 0.34, x, height, z);
    b.box("glass", 0.26, 0.34, 0.26, x, height + 0.05, z);
    b.box("iron", 0.34, 0.06, 0.34, x, height + 0.39, z);
    // A little cap, so the silhouette ends in something.
    b.add("iron", new THREE.ConeGeometry(0.22, 0.22, 6), x, height + 0.56, z);
  }

  let lit: THREE.PointLight | null = null;
  if (light) {
    lit = new THREE.PointLight(0xffb45e, 0, 13, 2);
    lit.position.set(x, height + 0.22, z);
    group.add(lit);
  }

  let glow: THREE.Mesh | null = null;
  if (!noGlow) {
    glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), lanternGlowMaterial);
    glow.position.set(x, height + 0.22, z);
    group.add(glow);
  }

  lanterns.push({
    light: lit,
    glow,
    phase: (x * 12.9898 + z * 78.233) % (Math.PI * 2),
    strength,
  });
}


// --- Dressing the square ----------------------------------------------------
// Emberhold's first pass got the architecture right and left the place empty.
// Six good buildings round twenty-seven units of bare cobble is a car park with
// nice sheds on it, and the square is the first thing a new player stands in.
//
// Everything below is the cheap, bright, human-scale stuff a real village puts
// out — bunting, window boxes, a handcart, a notice board, a brazier — built
// from the same box kit as the buildings so none of it needs a download and all
// of it takes the same procedural surfaces.

/** The four cloth colours the bunting cycles through. */
const BUNTING_CLOTH: MatKey[] = ["buntingRed", "buntingGold", "buntingTeal", "buntingCream"];

/**
 * How wide one pennant is, and how many hang per unit of string.
 *
 * These two are one decision and have to move together, which is why they sit
 * next to each other rather than at their use sites. The first pass hung flags
 * 0.15 wide at 1.5 per unit — a flag every 67cm, each one a fifth as wide as
 * the gap beside it — and from across the square that is not bunting, it is a
 * wire with something caught on it. The arrowhead fix shrank the cloth (a
 * tetrahedron half a metre across had to come down) and nothing put the spacing
 * back to match.
 *
 * Real bunting hangs flags at about one and a half times their own width apart,
 * so the line reads as a band of colour with light through it rather than as a
 * row of separate objects. 0.28 wide at 2.4 per unit is 42cm centres — the same
 * ratio, at a size legible from the far side of the plaza. It is the same
 * argument the flower heads were sized by: at this camera a botanically honest
 * one is noise on the texture.
 *
 * The cord is subdivided per flag, so raising the density also smooths the
 * catenary. Everything here merges into the town's one static mesh, so the cost
 * is geometry at load and nothing at all per frame.
 */
const BUNTING_FLAG_WIDTH = 0.28;
const BUNTING_FLAGS_PER_UNIT = 2.4;

/**
 * A line of pennants slung between two points.
 *
 * The catenary is the whole trick: a straight line of flags reads as a
 * washing line drawn in a level editor, and a sagging one reads as string.
 * `sag` is how far the middle drops, and the flags hang from wherever the
 * curve is rather than from a constant height.
 */
function bunting(
  b: Builder,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  sag: number,
  seed: number,
): void {
  const rand = seeded(seed);
  const span = Math.hypot(bx - ax, bz - az);
  const flags = Math.max(4, Math.round(span * BUNTING_FLAGS_PER_UNIT));
  const heading = Math.atan2(bz - az, bx - ax);

  const pointAt = (t: number) => ({
    x: ax + (bx - ax) * t,
    // A parabola is close enough to a catenary at this scale and is one
    // multiply instead of a cosh.
    y: ay + (by - ay) * t - sag * 4 * t * (1 - t),
    z: az + (bz - az) * t,
  });

  // The cord, as short segments following the curve.
  let prev = pointAt(0);
  for (let i = 1; i <= flags; i++) {
    const next = pointAt(i / flags);
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dy, dz);
    // Laid along its own length: `cyl` stands a cylinder up, so it is rotated
    // onto the segment's direction instead — pitch first, then heading.
    b.add(
      "iron",
      new THREE.CylinderGeometry(0.018, 0.018, len, 4),
      prev.x + dx / 2,
      prev.y + dy / 2,
      prev.z + dz / 2,
      heading,
      Math.PI / 2 - Math.atan2(dy, Math.hypot(dx, dz)),
    );
    prev = next;
  }

  // A pennant under every knot, alternating colour.
  for (let i = 1; i < flags; i++) {
    const p = pointAt(i / flags);
    const cloth = BUNTING_CLOTH[i % BUNTING_CLOTH.length];
    const w = BUNTING_FLAG_WIDTH + rand() * 0.05;
    // Hung in the PLANE of the string, so it is broadside from where the line
    // is being looked along — which is how bunting is actually seen.
    b.add(cloth, pennantGeometry(w, w * 1.5), p.x, p.y, p.z, heading);
  }
}

/**
 * One flag: a flat triangle hanging point-down, doubled so it has two faces.
 *
 * FLAT, and that is the whole note. The first version used a three-sided
 * `ConeGeometry`, which is not a triangle — it is a tetrahedron, and at half a
 * metre across it hung over the square like a row of arrowheads. Cloth has no
 * thickness, so the geometry should not either.
 *
 * Two windings rather than `side: DoubleSide`, because the material is shared
 * with the awnings and the sacking and none of those want to pay for two-sided
 * shading.
 */
function pennantGeometry(width: number, height: number): THREE.BufferGeometry {
  const hw = width / 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -hw, 0, 0, hw, 0, 0, 0, -height, 0,
        hw, 0, 0, -hw, 0, 0, 0, -height, 0,
      ],
      3,
    ),
  );
  geo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0, 1, 1, 0, 1, 0.5, 0], 2),
  );
  geo.computeVertexNormals();
  return geo;
}

/**
 * A window box of flowers.
 *
 * Three pieces: the box, a bed of leaf, and a scatter of blooms in two colours.
 * It is the smallest thing in the town kit and does more for how the place
 * feels than anything else here, because it is the only saturated colour at the
 * height a player's eye actually sits.
 */
function windowBox(
  b: Builder,
  x: number,
  y: number,
  z: number,
  rotY: number,
  width: number,
  seed: number,
): void {
  const rand = seeded(seed);
  b.box("timber", width, 0.16, 0.26, x, y, z, rotY);
  b.box("garden", width * 0.86, 0.1, 0.18, x, y + 0.14, z, rotY);
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const blooms = Math.max(3, Math.round(width * 5));
  for (let i = 0; i < blooms; i++) {
    const lx = (i / (blooms - 1) - 0.5) * width * 0.82;
    const lz = (rand() - 0.5) * 0.1;
    b.add(
      i % 2 === 0 ? "bloom" : "bloomAlt",
      // Bigger than a real flower head, and deliberately. At the camera this
      // game is played at, a botanically honest bloom is two pixels and reads
      // as noise on the texture; these have to be legible from across the
      // square or they are not colour, they are dither.
      new THREE.IcosahedronGeometry(0.085 + rand() * 0.04, 0),
      x + lx * cos + lz * sin,
      y + 0.23 + rand() * 0.04,
      z - lx * sin + lz * cos,
    );
  }
}

/**
 * A bench, built out of SLATS rather than slabs.
 *
 * The first one was four boxes: a plank for the seat, a panel for the back, and
 * two solid blocks 14cm by 44cm for legs. Every dimension was honest and the
 * result was clunky — because what makes furniture read as furniture at this
 * distance is not its outline, it is the GAPS. A seat with daylight between
 * three slats reads as carpentry; the same seat as one solid board reads as a
 * crate. Legs are the same story: a leg is a stick, and a block the depth of
 * the seat is a plinth.
 *
 * So: three seat slats with air between them, two back slats on posts that lean
 * away, four square legs and a stretcher between them. Twelve pieces instead of
 * four, all of it merged into the same static mesh as everything else in town,
 * so the cost is geometry at load and nothing at all per frame.
 */
function bench(b: Builder, x: number, z: number, rotY: number): void {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });

  const length = 1.8;
  const seatY = 0.42;
  const legInset = 0.72;

  // Legs: square sticks, set in from the ends the way a real one is.
  for (const side of [-1, 1]) {
    for (const front of [-1, 1]) {
      const leg = at(side * legInset, front * 0.17);
      b.box("timber", 0.08, seatY, 0.08, leg.x, 0, leg.z, rotY);
    }
    // A stretcher tying each pair together, low down.
    const rail = at(side * legInset, 0);
    b.box("timber", 0.06, 0.05, 0.38, rail.x, 0.14, rail.z, rotY);
  }
  // And a rail the long way, under the seat, so the legs are not four
  // independent sticks.
  b.box("timber", length - 0.2, 0.05, 0.06, x, 0.16, z, rotY);

  // Seat: three slats with real gaps between them.
  for (const lz of [-0.16, 0, 0.16]) {
    const slat = at(0, lz);
    b.box("timberLight", length, 0.05, 0.12, slat.x, seatY, slat.z, rotY);
  }

  // Back posts, rising from the rear legs.
  for (const side of [-1, 1]) {
    const post = at(side * legInset, -0.17);
    b.box("timber", 0.07, 0.5, 0.07, post.x, seatY + 0.05, post.z, rotY);
  }
  // Two back slats. The upper one sits further back than the lower, which fakes
  // a recline without having to rotate anything inside an already-rotated frame
  // — the Builder composes its Euler in world axes, so a lean here would tilt
  // the wrong way on six of the eight bearings.
  const lower = at(0, -0.19);
  b.box("timberLight", length, 0.11, 0.045, lower.x, seatY + 0.16, lower.z, rotY);
  const upper = at(0, -0.235);
  b.box("timberLight", length, 0.11, 0.045, upper.x, seatY + 0.36, upper.z, rotY);
}

/** A planter: a tub of the same flowers, for standing on paving. */
function planter(b: Builder, x: number, z: number, seed: number): void {
  const rand = seeded(seed);
  b.add("timberLight", new THREE.CylinderGeometry(0.42, 0.34, 0.46, 8), x, 0.23, z);
  b.add("iron", new THREE.TorusGeometry(0.4, 0.03, 4, 10), x, 0.38, z, 0, Math.PI / 2);
  b.add("garden", new THREE.SphereGeometry(0.34, 7, 5), x, 0.56, z);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.3;
    b.add(
      i % 2 === 0 ? "bloom" : "bloomAlt",
      new THREE.IcosahedronGeometry(0.1 + rand() * 0.045, 0),
      x + Math.cos(a) * r,
      0.62 + rand() * 0.12,
      z + Math.sin(a) * r,
    );
  }
}

/**
 * A handcart, tipped forward onto its shafts the way an idle one is left.
 *
 * Reads as a town faster than almost anything else that can be built out of
 * boxes, because nothing else in the kit says "somebody was working here and
 * will be back".
 */
function handcart(b: Builder, x: number, z: number, rotY: number): void {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });

  // Bed and sides.
  b.box("plank", 1.7, 0.12, 0.95, x, 0.62, z, rotY);
  for (const side of [-1, 1]) {
    const p = at(0, side * 0.46);
    b.box("plank", 1.7, 0.34, 0.08, p.x, 0.7, p.z, rotY);
  }
  const back = at(-0.85, 0);
  b.box("plank", 0.08, 0.34, 0.95, back.x, 0.7, back.z, rotY);

  // Wheels, and the axle between them.
  for (const side of [-1, 1]) {
    const p = at(-0.2, side * 0.55);
    b.add("timber", new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12), p.x, 0.42, p.z, rotY, 0, Math.PI / 2);
    b.add("iron", new THREE.TorusGeometry(0.42, 0.035, 4, 14), p.x, 0.42, p.z, rotY);
  }

  // Shafts, down to the ground at the front.
  for (const side of [-1, 1]) {
    const p = at(0.9, side * 0.34);
    b.add("plank", new THREE.BoxGeometry(1.5, 0.09, 0.09), p.x, 0.36, p.z, rotY, 0, -0.32);
  }

  // A sack and a barrel in the bed, so it is a cart in use rather than a prop.
  const load = at(-0.35, 0);
  b.add("linen", new THREE.SphereGeometry(0.3, 6, 5), load.x, 0.86, load.z);
  const keg = at(0.3, 0.1);
  b.add("timberLight", new THREE.CylinderGeometry(0.24, 0.24, 0.5, 10), keg.x, 0.93, keg.z, rotY, 0, Math.PI / 2);
}

/**
 * The notice board: where the watch and the inn post what they want doing.
 *
 * The one piece of dressing in the square that is about the GAME rather than
 * about the place — Emberhold hands out six quests and had nowhere that looked
 * like it. It is scenery, not an interface: the quests come from Cabel and
 * Marda, and a board you can click would be a second way to do a thing that
 * already works.
 */
function noticeBoard(b: Builder, x: number, z: number, rotY: number): void {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
  for (const side of [-1, 1]) {
    const p = at(side * 0.62, 0);
    b.box("timber", 0.14, 1.85, 0.14, p.x, 0, p.z, rotY);
  }
  b.box("plank", 1.5, 1.0, 0.08, x, 0.75, z, rotY);
  b.box("timber", 1.62, 0.1, 0.14, x, 1.75, z, rotY);
  // A little shingled hood, so the notices keep out of the rain.
  b.gable("shingle", 1.75, 0.28, 0.5, x, 1.85, z, rotY);
  // Papers pinned to it, at slight angles.
  const rand = seeded(7781);
  for (let i = 0; i < 5; i++) {
    const p = at(-0.45 + (i % 3) * 0.45, 0);
    b.box(
      "linen",
      0.3,
      0.36,
      0.02,
      p.x,
      0.92 + Math.floor(i / 3) * 0.42,
      p.z + 0.05 * cos,
      rotY,
      (rand() - 0.5) * 0.24,
    );
  }
}

/** An iron fire basket on legs. Warm colour by day, a real light after dark. */
function brazier(
  b: Builder,
  group: THREE.Group,
  x: number,
  z: number,
  lanterns: Lantern[],
  /**
   * Whether this one casts real light. See `lantern`'s `light` parameter and
   * the measured cost in `coldharrowDressing`, which is why a brazier can now
   * be fire without being a lamp.
   */
  light = true,
): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box("iron", 0.07, 0.62, 0.07, x + Math.cos(a) * 0.26, 0, z + Math.sin(a) * 0.26, 0, (i % 2 ? 1 : -1) * 0.12);
  }
  b.add("iron", new THREE.CylinderGeometry(0.42, 0.28, 0.34, 8), x, 0.78, z);
  b.add("iron", new THREE.TorusGeometry(0.4, 0.035, 4, 12), x, 0.94, z, 0, Math.PI / 2);
  // The coals. CHARRED, not red — this used to be an awning-coloured ball,
  // which was the right call when it was the only warm thing in the basket and
  // the wrong one the moment a real fire went in behind it: a maroon facet next
  // to a flame reads as painted card, not as burning wood. Dark and small now,
  // sitting low, so what you see in the basket is the fire.
  b.add("rockDark", new THREE.IcosahedronGeometry(0.19, 0), x, 0.86, z);
  // Stronger than a lamp, because an open fire is: the lanterns line the square
  // and a brazier is meant to be a place people stand round after dark. No
  // glow ball — the fire below IS the visible half now.
  lantern(b, group, x, z, 1.05, lanterns, 1.25, true, true, light);
  // Sitting IN the basket, on the coals, and wider than a torch's: a brazier
  // burns logs laid flat and a torch burns a bundle held upright, so one is
  // squat and one is a tongue.
  // Squat and wide: a basket of logs, not a torch. 0.86 tall and 1.15 across.
  townFlames?.add(x, 1.0, z, 0.9, Math.abs(x * 13.1 + z * 7.7), 1.1);
}


// --- The back lane ----------------------------------------------------------
// The ring of grass between the houses and the palisade was the last bare part
// of Emberhold: six buildings turn their fronts to the square, and everything
// behind them was mown lawn with a fence round it. A village's back land is the
// most USED ground it has — it is where the firewood, the laundry, the hens and
// the midden are — so this is the half of the town that should look worked
// rather than arranged.

/**
 * A worn earth path running round behind the buildings.
 *
 * An annulus with vertex alpha at both rims, the same trick the road arms use,
 * so it fades into the grass instead of stopping at a circle. It is the piece
 * that makes the belt read as somewhere people walk rather than as a lawn:
 * scenery says a place was built, and a desire path says it is lived in.
 */
function beltPath(innerR: number, outerR: number): THREE.BufferGeometry {
  const segments = 96;
  const across = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  // Full down the middle, gone at both rims.
  const alphaAcross = (t: number) => Math.min(1, Math.max(0, (1 - Math.abs(t * 2 - 1)) / 0.55));

  const vertex = (i: number, j: number) => {
    const a = (i / segments) * Math.PI * 2;
    const t = j / across;
    const r = innerR + (outerR - innerR) * t;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    positions.push(x, y, 0);
    // Along the path rather than across it, so the ruts run the way feet go.
    uvs.push(a * r * 0.34, t * 2);
    colors.push(1, 1, 1, alphaAcross(t));
  };

  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < across; j++) {
      vertex(i, j);
      vertex(i + 1, j);
      vertex(i + 1, j + 1);
      vertex(i, j);
      vertex(i + 1, j + 1);
      vertex(i, j + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A washing line with sheets on it.
 *
 * Reuses the bunting's sagging cord — the same parabola, because a rope does
 * the same thing whatever is pegged to it — and hangs rectangles of linen
 * instead of pennants. The inn has beds upstairs, so the inn has sheets; that
 * is the entire justification and it is enough.
 */
function laundryLine(
  b: Builder,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  seed: number,
): void {
  const rand = seeded(seed);
  const heading = Math.atan2(bz - az, bx - ax);
  const sag = 0.34;
  const pointAt = (t: number) => ({
    x: ax + (bx - ax) * t,
    y: ay + (by - ay) * t - sag * 4 * t * (1 - t),
    z: az + (bz - az) * t,
  });

  // The cord.
  const steps = 10;
  let prev = pointAt(0);
  for (let i = 1; i <= steps; i++) {
    const next = pointAt(i / steps);
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dy, dz);
    b.add(
      "linen",
      new THREE.CylinderGeometry(0.015, 0.015, len, 4),
      prev.x + dx / 2,
      prev.y + dy / 2,
      prev.z + dz / 2,
      heading,
      Math.PI / 2 - Math.atan2(dy, Math.hypot(dx, dz)),
    );
    prev = next;
  }

  // Four sheets, hung in the plane of the line so they read broadside.
  for (let i = 1; i <= 4; i++) {
    const p = pointAt(i / 5);
    const w = 0.5 + rand() * 0.22;
    const h = 0.55 + rand() * 0.3;
    b.box("linen", w, h, 0.02, p.x, p.y - h, p.z, heading);
  }
}

/**
 * A pell and a rack of arms, for behind the Warden's Post.
 *
 * The watch is the one building in town with a JOB, and a training post is what
 * that job looks like when nobody is doing it. Straw-bound, notched about, and
 * leaning very slightly, because a dummy that has never been hit is a dummy
 * nobody trains on.
 */
function trainingPost(b: Builder, x: number, z: number, rotY: number): void {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });

  // The post, and a wedge of earth round its foot.
  b.cyl("timber", 0.11, 1.7, x, 0, z, 8);
  b.add("garden", new THREE.CylinderGeometry(0.34, 0.42, 0.12, 10), x, 0.06, z);
  // Cross arm.
  b.box("timber", 1.0, 0.09, 0.09, x, 1.24, z, rotY);
  // A straw body lashed to it.
  b.add("thatch", new THREE.CylinderGeometry(0.26, 0.22, 0.62, 9), x, 1.05, z);
  b.add("iron", new THREE.TorusGeometry(0.26, 0.022, 4, 10), x, 1.16, z, 0, Math.PI / 2);
  b.add("iron", new THREE.TorusGeometry(0.24, 0.022, 4, 10), x, 0.86, z, 0, Math.PI / 2);
  // A battered shield hung on one arm.
  const shield = at(0.44, 0);
  b.box("timberLight", 0.06, 0.44, 0.38, shield.x, 0.95, shield.z, rotY);
  b.box("iron", 0.02, 0.1, 0.1, shield.x, 1.12, shield.z, rotY);
}

/** A rack of spears leaning against the watch's wall. */
function spearRack(b: Builder, x: number, z: number, rotY: number): void {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const at = (lx: number, lz: number) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
  for (const side of [-1, 1]) {
    const p = at(side * 0.5, 0);
    b.box("timber", 0.08, 1.05, 0.08, p.x, 0, p.z, rotY);
  }
  b.box("timber", 1.15, 0.07, 0.09, x, 0.95, z, rotY);
  b.box("timber", 1.15, 0.07, 0.09, x, 0.3, z, rotY);
  // Five shafts, standing in it at slightly different leans.
  const rand = seeded(5150);
  for (let i = 0; i < 5; i++) {
    const p = at(-0.42 + i * 0.21, 0);
    b.cyl("timberLight", 0.03, 1.55, p.x, 0, p.z, 5, (rand() - 0.5) * 0.09);
    b.add("iron", new THREE.ConeGeometry(0.05, 0.2, 5), p.x, 1.62, p.z);
  }
}

/** A hay rick under a thatched cap. Round, because a square one is a shed. */
function hayRick(b: Builder, x: number, z: number): void {
  b.add("timberLight", new THREE.CylinderGeometry(0.9, 0.95, 0.16, 10), x, 0.08, z);
  b.add("thatch", new THREE.CylinderGeometry(0.86, 0.94, 1.15, 10), x, 0.74, z);
  b.add("thatch", new THREE.ConeGeometry(1.05, 0.72, 10), x, 1.66, z);
  // A pitchfork left in it, which is the detail that says somebody is coming back.
  b.cyl("timberLight", 0.028, 1.3, x + 0.95, 0, z + 0.2, 5, 0.22);
  b.box("iron", 0.02, 0.22, 0.24, x + 1.24, 1.24, z + 0.2);
}

/** A straw skep on a plank stand. Bees, which is what a herb garden is for. */
function beehive(b: Builder, x: number, z: number): void {
  b.box("timberLight", 0.62, 0.1, 0.5, x, 0.28, z);
  for (const side of [-1, 1]) {
    b.box("timber", 0.07, 0.28, 0.07, x + side * 0.24, 0, z);
  }
  // Three tapering courses of coiled straw.
  b.add("thatch", new THREE.CylinderGeometry(0.24, 0.28, 0.16, 10), x, 0.46, z);
  b.add("thatch", new THREE.CylinderGeometry(0.19, 0.24, 0.16, 10), x, 0.62, z);
  b.add("thatch", new THREE.SphereGeometry(0.19, 10, 6), x, 0.74, z);
}

/** A water butt under a downpipe, at the corner of a building. */
function rainBarrel(b: Builder, x: number, z: number): void {
  b.add("timberLight", new THREE.CylinderGeometry(0.34, 0.3, 0.78, 12), x, 0.39, z);
  b.add("iron", new THREE.TorusGeometry(0.33, 0.028, 4, 14), x, 0.62, z, 0, Math.PI / 2);
  b.add("iron", new THREE.TorusGeometry(0.31, 0.028, 4, 14), x, 0.2, z, 0, Math.PI / 2);
  b.add("slate", new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12), x, 0.79, z);
}

// --- The chapel's back land --------------------------------------------------
// The Quiet Lamp is the only building in town that is not somebody's trade or
// somebody's bed, and it was the one whose yard said nothing about it. A burial
// ground is what a chapel has behind it.

/**
 * A grave marker: a slab with a rounded head, leaning.
 *
 * THE LEAN IS THE WHOLE PROP. Three identical uprights read as a fence; three
 * stones at three different angles read as a churchyard, and the angle is
 * seeded from the position so it is the same one every session rather than a
 * different graveyard on every reload.
 */
function graveMarker(b: Builder, x: number, z: number, rotY: number, seed: number): void {
  const r = seededRandom(Math.floor(Math.abs(seed) * 977) + 31);
  // Enough to read as settled ground, not enough to read as fallen over.
  const lean = (r() - 0.5) * 0.22;
  const turn = rotY + (r() - 0.5) * 0.5;
  const h = 0.62 + r() * 0.26;
  const w = 0.34;
  const thick = 0.11;

  b.add("stoneDark", new THREE.BoxGeometry(0.42, 0.1, 0.3), x, 0.05, z, turn);

  // THE LEAN AND THE STACKING ARE BAKED INTO THE GEOMETRY, not passed as Euler
  // angles, and that is the whole of what was wrong with the first version.
  // `Builder.add` composes rotX, rotY and rotZ through one Euler, and which
  // order those multiply in decides whether "turn the slab, then tip it" and
  // "tip it, then turn it" mean the same thing — they do not. Reasoning about it
  // produced a cap sticking out sideways like a T-bar, three little anvils in a
  // row where the churchyard should be.
  //
  // Rotating the geometry itself removes the question. Body and cap are built
  // about the SAME local origin — the foot of the slab — and leaned by the same
  // angle about it, so they are glued together by construction and only the
  // bearing is left for the Builder to apply.
  const body = new THREE.BoxGeometry(w, h, thick);
  body.translate(0, h / 2, 0);
  body.rotateZ(lean);
  b.add("stone", body, x, 0.06, z, turn);

  // A full cylinder lying across the slab's thickness, sunk to its waist: what
  // shows above the slab is a semicircle, which is a headstone. A half
  // cylinder would need a `thetaStart` pointing the right way, which is one
  // more thing to be wrong about for no gain.
  const cap = new THREE.CylinderGeometry(w / 2, w / 2, thick, 12);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, h, 0);
  cap.rotateZ(lean);
  b.add("stone", cap, x, 0.06, z, turn);
}

/**
 * A low offering stone with the lamp the chapel is named for standing on it.
 *
 * It is a real light after dark, like the braziers and the lanterns, because a
 * building called The Quiet Lamp with an unlit lamp behind it is a joke the town
 * is not in on. Registered through the same `lanterns` list everything else in
 * town lights by, so nobody keeps a second opinion about the hour.
 */
function offeringStone(
  b: Builder,
  group: THREE.Group,
  x: number,
  z: number,
  rotY: number,
  lanterns: Lantern[],
): void {
  for (const side of [-1, 1]) {
    b.box(
      "stoneDark",
      0.22,
      0.42,
      0.34,
      x + Math.cos(rotY) * side * 0.42,
      0,
      z - Math.sin(rotY) * side * 0.42,
    );
  }
  b.box("stone", 1.3, 0.14, 0.56, x, 0.42, z, rotY);
  // The lamp: an iron stem, a glass bowl and a little slate cap.
  b.cyl("iron", 0.035, 0.34, x, 0.56, z, 6);
  b.add("iron", new THREE.CylinderGeometry(0.17, 0.13, 0.05, 8), x, 0.88, z);
  b.add("glass", new THREE.SphereGeometry(0.15, 10, 8), x, 1.02, z);
  b.add("slate", new THREE.ConeGeometry(0.19, 0.14, 8), x, 1.2, z);
  // Through the same `lantern` every other light in town goes through, bare
  // because this one builds its own fitting above. Half strength: it is a votive
  // lamp behind a chapel, not a street light, and the back lane is meant to be
  // the dark side of the square.
  lantern(b, group, x, z, 1.02, lanterns, 0.5, true);
}

// --- The shop's back land ----------------------------------------------------
// The Ledger & Lamp is a counting house, so what waits behind it is stock.

/** Crates stacked against a wall, three up and one leaning off the pile. */
function crateStack(b: Builder, x: number, z: number, rotY: number): void {
  const crate = (w: number, cx: number, cy: number, cz: number, turn: number) => {
    b.box("plank", w, w, w, cx, cy, cz, turn);
    // Two battens across the face, which is what makes a box read as a crate.
    b.box("timberLight", w * 1.02, 0.05, w * 0.14, cx, cy + w * 0.24, cz, turn);
    b.box("timberLight", w * 1.02, 0.05, w * 0.14, cx, cy + w * 0.68, cz, turn);
  };
  crate(0.66, x, 0, z, rotY);
  crate(0.54, x + Math.cos(rotY + 1.1) * 0.62, 0, z - Math.sin(rotY + 1.1) * 0.62, rotY + 0.35);
  crate(0.48, x + 0.02, 0.66, z + 0.03, rotY + 0.22);
}

/**
 * Sacks, which is the other half of what arrives at a merchant's back door.
 *
 * `thatch` and not `linen`, and the difference is the whole prop. Linen is the
 * off-white the washing is hung in, and four pale rounded lumps in the grass
 * photographed as BOULDERS sitting next to the crates — which is the failure
 * this project already has a rule about one system over: nothing scattered may
 * resemble something the player is meant to read as significant, and a rock is
 * the ore node's silhouette. Sacking is straw-coloured, and the colour does more
 * to separate the two than any amount of shape.
 *
 * Taller than they are wide, too, for the same reason: a sack stands up because
 * something is in it, and the squat version had the proportions of a stone.
 */
function sackPile(b: Builder, x: number, z: number, seed: number): void {
  const r = seededRandom(Math.floor(Math.abs(seed) * 613) + 17);
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 0.3;
    const sx = x + Math.cos(a) * d;
    const sz = z + Math.sin(a) * d;
    const h = 0.42 + r() * 0.18;
    // Belly, shoulder and a tied neck: three primitives, and the neck is what
    // stops it reading as a rounded thing lying in the grass.
    b.add("thatch", new THREE.SphereGeometry(h * 0.46, 8, 6), sx, h * 0.42, sz, a);
    b.add("thatch", new THREE.CylinderGeometry(h * 0.34, h * 0.46, h * 0.5, 8), sx, h * 0.72, sz, a);
    b.add("thatch", new THREE.ConeGeometry(h * 0.26, h * 0.3, 7), sx, h * 1.06, sz, a);
    b.cyl("timber", h * 0.09, h * 0.08, sx, h * 1.0, sz, 6);
  }
}

/**
 * A chopping block with the axe still in it, and the split logs beside it.
 *
 * What a cottage has out the back. It is here because every other yard had
 * something that was ITS OWN and this one had a water butt and a share of a
 * washing line, both of which two other buildings also have — see the
 * distinctiveness check in `tools/test/town.mjs`.
 */
function choppingBlock(b: Builder, x: number, z: number, rotY: number, seed: number): void {
  const r = seededRandom(Math.floor(Math.abs(seed) * 401) + 7);
  b.add("timberLight", new THREE.CylinderGeometry(0.3, 0.32, 0.5, 10), x, 0.25, z);
  // The axe: a haft leaning out of the block and a head buried in it.
  const haft = new THREE.CylinderGeometry(0.032, 0.032, 0.62, 6);
  haft.translate(0, 0.31, 0);
  haft.rotateZ(0.42);
  b.add("timber", haft, x, 0.46, z, rotY);
  b.add("iron", new THREE.BoxGeometry(0.06, 0.2, 0.16), x, 0.52, z, rotY, 0.42);
  // Split logs, stacked anyhow.
  for (let i = 0; i < 5; i++) {
    const a = rotY + 1.3 + (r() - 0.5) * 0.6;
    const d = 0.52 + r() * 0.3;
    const log = new THREE.CylinderGeometry(0.075, 0.08, 0.34 + r() * 0.12, 7);
    log.rotateZ(Math.PI / 2);
    b.add("timberLight", log, x + Math.cos(a) * d, 0.08 + (i % 2) * 0.15, z - Math.sin(a) * d, a + r());
  }
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
/**
 * How a settlement is BUILT, as opposed to where.
 *
 * KEPT IN THE RENDERER RATHER THAN ON `Settlement`, because a `MatKey` is a
 * material in a palette in this file and `shared/` is not allowed to know that
 * such a thing exists — the same rule that keeps FBX filenames out of the NPC
 * table. What shared owns is the shape of a town; what this owns is what it is
 * made of.
 *
 * There will be two of these and they must not resemble each other. Emberhold
 * is warm plaster, shingle and thatch because it is an inland village; the
 * north is to be stone and slate because it is a cold port, and giving it extra
 * rows in Emberhold's table would produce a bigger Emberhold rather than a
 * different place.
 */
export interface SettlementLook {
  styles: Record<BuildingKind, KindStyle>;
  /** What stands round it. A palisade is timber and a curtain wall is not. */
  wall: (b: Builder, group: THREE.Group, lanterns: Lantern[], s: Settlement) => void;
  /**
   * How tall that wall is, for the CAMERA COLLIDERS.
   *
   * The ring of invisible boxes has to cover the thing it is standing in for,
   * and 2.7 was the palisade's height written into the collider builder as a
   * constant. Coldharrow's curtain is 4.6 before its merlons, so at 2.7 the
   * camera rose straight over the colliders and sat INSIDE the masonry — the
   * first photograph of the Landward Gate is a grey band filling the frame with
   * the player drawn as a through-walls silhouette.
   *
   * Here rather than measured off the geometry, because the geometry is a few
   * hundred merged boxes by the time it exists and the builder is the only
   * thing that ever knew the number.
   */
  wallHeight: number;
  /**
   * The furniture in the middle.
   *
   * ALSO PER-LOOK, and for a sharper reason than taste: `squareDressing` places
   * benches, lanterns and bunting from `BENCH_ANGLES`, `LANTERN_RING_PX` and the
   * rest — which are EMBERHOLD's layout constants. Threading a settlement into
   * it moved the village's own furniture to Coldharrow's centre rather than
   * giving Coldharrow furniture.
   */
  dressing: (b: Builder, group: THREE.Group, lanterns: Lantern[], s: Settlement) => void;
}

const EMBERHOLD_STYLES: Record<BuildingKind, KindStyle> = {
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
  // Emberhold has none of these and never will — it is a farming village with
  // six buildings. They are here because `Record<BuildingKind, KindStyle>` is
  // exhaustive, which is the compiler insisting that if a kind can exist then
  // every town must have an answer for it. Given in Emberhold's own materials,
  // so that if one ever IS placed here it looks like the rest of the village
  // rather than like a piece of the north dropped in.
  warehouse: { wall: "timberLight", roof: "thatch", plinth: 0.3, storeyHeight: 2.2, roofPitch: 0.5 },
  guildhall: { wall: "plaster", roof: "shingle", plinth: 0.4, storeyHeight: 2.4, roofPitch: 0.52 },
  bathhouse: { wall: "plaster", roof: "shingle", plinth: 0.35, storeyHeight: 2.3, roofPitch: 0.45 },
  stall: { wall: "timberLight", roof: "thatch", plinth: 0.12, storeyHeight: 1.9, roofPitch: 0.4 },
  tower: { wall: "stone", roof: "slate", plinth: 1.6, storeyHeight: 2.4, roofPitch: 0.75 },
  pier: { wall: "timberLight", roof: "thatch", plinth: 0.1, storeyHeight: 1.8, roofPitch: 0.3 },
  granary: { wall: "timberLight", roof: "thatch", plinth: 0.5, storeyHeight: 2.2, roofPitch: 0.58 },
  barracks: { wall: "plasterCool", roof: "slate", plinth: 0.9, storeyHeight: 2.2, roofPitch: 0.48 },
  boathouse: { wall: "timber", roof: "thatch", plinth: 0.15, storeyHeight: 2.0, roofPitch: 0.44 },
  ruin: { wall: "stoneDark", roof: "slate", plinth: 0.5, storeyHeight: 2.0, roofPitch: 0.3 },
};

/**
 * Coldharrow: stone and slate, and not one thatched roof.
 *
 * THE WHOLE POINT IS THAT THIS TABLE SHARES NO VALUES WITH THE ONE ABOVE.
 * Emberhold is plaster, shingle and thatch — warm, soft, low. This is granite,
 * cold slate and tar: taller storeys, steeper pitches, and plinths deep enough
 * to read as buildings that expect weather. A city made of the same materials
 * as the village would be the village at a larger scale however the streets
 * were arranged, which is the failure this is written to avoid.
 *
 * Shingle and thatch appear nowhere. Where Emberhold would reach for them this
 * reaches for slate, because a roof is the largest single surface a building
 * shows at this camera and it is what the eye reads the place by.
 */
const COLDHARROW_STYLES: Record<BuildingKind, KindStyle> = {
  // The six it inherits, rebuilt in northern materials rather than imported.
  inn: { wall: "granite", roof: "slateCold", plinth: 0.8, storeyHeight: 2.4, roofPitch: 0.62, awning: "awningAlt" },
  shop: { wall: "granite", roof: "slateCold", plinth: 0.7, storeyHeight: 2.35, roofPitch: 0.6, awning: "awningAlt" },
  watchpost: { wall: "graniteDark", roof: "slateCold", plinth: 1.8, storeyHeight: 2.4, roofPitch: 0.6 },
  chapel: { wall: "granite", roof: "slateCold", plinth: 0.6, storeyHeight: 3.2, roofPitch: 0.85 },
  cottage: { wall: "granite", roof: "slateCold", plinth: 0.55, storeyHeight: 2.25, roofPitch: 0.64 },
  stable: { wall: "pitch", roof: "slateCold", plinth: 0.3, storeyHeight: 2.1, roofPitch: 0.5 },

  // And its own.
  warehouse: { wall: "graniteDark", roof: "slateCold", plinth: 0.9, storeyHeight: 2.6, roofPitch: 0.42 },
  guildhall: { wall: "granite", roof: "slateCold", plinth: 1.1, storeyHeight: 2.8, roofPitch: 0.66 },
  bathhouse: { wall: "granite", roof: "slateCold", plinth: 0.7, storeyHeight: 2.6, roofPitch: 0.38 },
  // Low, open and awninged: the one warm-coloured thing on the waterfront.
  stall: { wall: "pitch", roof: "slateCold", plinth: 0.15, storeyHeight: 1.9, roofPitch: 0.32, awning: "awningAlt" },
  tower: { wall: "graniteDark", roof: "slateCold", plinth: 2.4, storeyHeight: 2.7, roofPitch: 0.9 },
  // Barely a building: a deck on piles, which is why the plinth is nothing and
  // the roof is almost flat.
  pier: { wall: "pitch", roof: "slateCold", plinth: 0.08, storeyHeight: 1.6, roofPitch: 0.16 },
  granary: { wall: "granite", roof: "slateCold", plinth: 1.2, storeyHeight: 2.5, roofPitch: 0.7 },
  barracks: { wall: "graniteDark", roof: "slateCold", plinth: 1.3, storeyHeight: 2.3, roofPitch: 0.5 },
  boathouse: { wall: "pitch", roof: "slateCold", plinth: 0.2, storeyHeight: 2.2, roofPitch: 0.5 },
  // Roofless. A pitch this shallow on a stump of a storey reads as a wall with
  // the sky above it, which is what a ruin is.
  ruin: { wall: "graniteDark", roof: "slateCold", plinth: 0.9, storeyHeight: 1.5, roofPitch: 0.12 },
};

/** Which settlements have streets. Emberhold's square IS its street. */
const STREETS_BY_SETTLEMENT: Record<string, Street[]> = {
  coldharrow: COLDHARROW_STREETS,
};

/** Keyed by settlement id. */
const LOOKS: Record<string, SettlementLook> = {
  emberhold: {
    styles: EMBERHOLD_STYLES,
    wall: palisade,
    // Posts stand about 2.45 and their sharpened tips reach 2.6.
    wallHeight: 2.7,
    dressing: squareDressing,
  },
  coldharrow: {
    styles: COLDHARROW_STYLES,
    wall: curtainWall,
    // Curtain 4.6, merlons to 5.3; a little over so the camera cannot ride the
    // parapet either.
    wallHeight: 6.2,
    dressing: coldharrowDressing,
  },
};

function lookFor(s: Settlement): SettlementLook {
  return LOOKS[s.id] ?? LOOKS.emberhold;
}

/**
 * One building.
 *
 * Local frame: +X runs across the FRONT, +Z points out of the front door, and
 * the origin is the middle of the footprint at ground level. The group is then
 * turned by the building's facing, so everything below can be written as though
 * every building faced the same way — which is the only reason the openings and
 * the timbering are legible at all.
 */
function makeBuilding(
  b: TownBuilding,
  lanterns: Lantern[],
  styles: Record<BuildingKind, KindStyle>,
): THREE.Group {
  const group = new THREE.Group();
  // Stamped so a test can find one building among the merged meshes without
  // being handed a second copy of the layout to compare against — the whole
  // point of asking the built scene is that it might disagree with the data.
  group.userData.buildingId = b.id;
  group.position.set(toWorldX(b.x), 0, toWorldZ(b.y));
  // Server degrees are measured in the XY plane where +y is south; world Z is
  // south too, so a bearing maps to a Y rotation by negating and quarter-turning.
  group.rotation.y = -((b.facingDeg * Math.PI) / 180) + Math.PI / 2;

  const style = styles[b.kind];
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
      const wx = t * (outerHW - 0.85);
      window4(builder, 0.8, 0.95, wx, upperY, outerHD + 0.01, 0, true);
      // A flower box under every upper window on the front.
      //
      // This is the cheapest colour in the whole town and it does the most
      // work, because it is the only saturated thing at the height a player
      // actually looks: the square's other colour is all overhead (bunting,
      // awnings, roofs) or underfoot. A row of these turns six competent grey
      // boxes into somewhere people live.
      windowBox(builder, wx, upperY - 0.14, outerHD + 0.13, 0, 0.86, 3100 + i * 41);
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

  // Its own materials, so this building can be faded without taking the rest
  // of the town with it.
  builder.finish(group, true);

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
/**
 * Trodden ground, for the yards and lanes between a city's buildings.
 *
 * THE OTHER HALF OF THE GRASS REPORT, and the half `coverRadiusPx` does not
 * touch. "Still a lot of grass and flowers in the city" was two faults wearing
 * one description. The FLOWERS were the ground-cover scatter, which suppressed
 * itself inside the paving and so covered the 87% of Coldharrow that is not the
 * central square. The GRASS underneath them was never the scatter at all:
 * `buildGround` paves `pavedRadiusPx` and nothing else, so everything from the
 * square out to the curtain wall was raw terrain, and raw terrain is meadow.
 *
 * Emberhold wants exactly that — the belt of grass between the houses and the
 * palisade is where the gardens and the woodpile live, and a village green is
 * supposed to be green. A city is not. What lies between blocks in a walled
 * city is beaten earth, grit, and the snow that gets trodden into it, which is
 * what this draws.
 *
 * Separate from `cobbleTexture` rather than a tint of it, because the two are
 * different surfaces doing different jobs. Setts are LAID, in courses, by
 * somebody. A yard is what is left where nobody laid anything.
 */
function yardTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(20260917);

  ctx.fillStyle = "#585349";
  ctx.fillRect(0, 0, size, size);

  // Broad mottling first, so the ground is never one flat tone at any distance.
  for (let i = 0; i < 90; i++) {
    const r = 14 + rand() * 46;
    const shade = 74 + Math.floor(rand() * 26);
    ctx.fillStyle = `rgba(${shade + 8},${shade + 4},${shade - 4},0.5)`;
    wrapped(ctx, size, () => {
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Grit: small, many, and barely lighter than the ground. A yard reads as
  // gritty because of the DENSITY of the specks, not their contrast.
  for (let i = 0; i < 1500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.6 + rand() * 1.9;
    const shade = 96 + Math.floor(rand() * 44);
    ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 10})`;
    wrapped(ctx, size, () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Trodden snow, and the FIRST VERSION OF THIS WAS THE PROBLEM. It was 26 big
  // soft circles at radius 7-22, which tiles out to pale discs a couple of
  // metres across — reported from play as not looking like snow at all, and
  // they did not: they read as bubbles, or as a stain, because nothing in
  // nature that size is a circle.
  //
  // What makes trodden snow read is the EDGE. It survives in irregular patches
  // with ragged, roughly straight borders where boots have scuffed it back, and
  // it is thin enough that the grit shows through. So each patch is built from
  // a ring of overlapping small blobs at a jittered radius — which gives a
  // lumpy outline instead of a circle — and then knocked back by scattering
  // ground-coloured specks over it, so the snow never reads as a clean fill.
  const patch = (cxp: number, cyp: number, span: number, alpha: number) => {
    const lobes = 9 + Math.floor(rand() * 7);
    const wob: number[] = [];
    for (let i = 0; i < lobes; i++) wob.push(0.55 + rand() * 0.8);
    ctx.fillStyle = `rgba(206,212,214,${alpha})`;
    wrapped(ctx, size, () => {
      for (let i = 0; i < lobes; i++) {
        const a = (i / lobes) * Math.PI * 2;
        const rr = span * wob[i];
        ctx.beginPath();
        ctx.arc(cxp + Math.cos(a) * rr, cyp + Math.sin(a) * rr, span * 0.52, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cxp, cyp, span * 0.62, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  for (let i = 0; i < 14; i++) {
    patch(rand() * size, rand() * size, 5 + rand() * 11, 0.2 + rand() * 0.22);
  }

  // Grit back over the top, so the patches are trodden rather than laid.
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = 78 + Math.floor(rand() * 34);
    ctx.fillStyle = `rgba(${shade},${shade - 3},${shade - 9},${0.3 + rand() * 0.5})`;
    wrapped(ctx, size, () => {
      ctx.beginPath();
      ctx.arc(x, y, 0.5 + rand() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

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

export function roadTexture(): THREE.Texture {
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
  // NO ALPHA IS BAKED IN HERE any more, and that is the fix for the butt joint
  // where the road met the paving. A fade baked into the image can only run
  // across the SHORT axis — the image tiles twenty-six times along the road's
  // length, so there is no "end of the road" for it to fade at. The ends were
  // therefore cut by geometry, with a razor edge. The fade is vertex alpha on
  // the strip now (see `roadStrip`), which can taper all four sides.
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(26, 1);
  return tex;
}

/**
 * One arm of the road, as a strip that fades out at every edge.
 *
 * Built by hand rather than from `PlaneGeometry` for the same reason the paving
 * is a `ringedDisc`: the fade has to live in vertex alpha, and a plane with one
 * quad has no vertices to put it on.
 *
 * Runs along local +X from the square outward. Alpha tapers four ways:
 *
 *   THE INNER END crossfades with the paving. It is fully transparent while the
 *   paving is still fully opaque and only reaches strength outside the plaza's
 *   own rim, so the two hand over in the middle of each other's fade and there
 *   is no join to see. Butting them instead — which is what the first cut of
 *   this did — puts a hard diagonal line between cobble and dirt.
 *
 *   THE OUTER END simply peters out, because a cart track that stops dead in a
 *   field is a decal, not a road.
 *
 *   THE TWO SIDES taper to verges rather than kerbs.
 */
function roadStrip(
  innerR: number,
  outerR: number,
  width: number,
  fadeInEnd: number,
  fadeOutStart: number,
): THREE.BufferGeometry {
  const along = 40;
  const across = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  const alphaAlong = (r: number) => {
    if (r <= innerR) return 0;
    if (r < fadeInEnd) return (r - innerR) / (fadeInEnd - innerR);
    if (r <= fadeOutStart) return 1;
    return Math.max(0, 1 - (r - fadeOutStart) / (outerR - fadeOutStart));
  };
  // Full across the middle three quarters, tapering to nothing at the verge.
  // Wider than this and the track stops reading as a track: at 0.4 the solid
  // part was narrower than the fade either side of it and the whole thing came
  // out as a soft dark smear on the grass rather than as something carts use.
  const alphaAcross = (t: number) => Math.min(1, Math.max(0, (1 - Math.abs(t)) / 0.24));

  const vertex = (i: number, j: number) => {
    const r = innerR + ((outerR - innerR) * i) / along;
    const t = (j / across) * 2 - 1;
    positions.push(r, (t * width) / 2, 0);
    uvs.push((r - innerR) * 0.35, (t + 1) / 2);
    colors.push(1, 1, 1, alphaAlong(r) * alphaAcross(t));
  };

  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      vertex(i, j);
      vertex(i + 1, j);
      vertex(i + 1, j + 1);
      vertex(i, j);
      vertex(i + 1, j + 1);
      vertex(i, j + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geo.computeVertexNormals();
  return geo;
}

/**
 * The apron of flagstones the statue stands on.
 *
 * A ring of dressed slabs round the island, so the road visibly parts round
 * something rather than running through a box that happens to be in the way.
 * Laid radially — the courses point at the plinth, which is what a paved circus
 * round a monument actually looks like and what stops it reading as the same
 * cobble tile with a different tint.
 */
function islandTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(60607);
  const c = size / 2;

  ctx.fillStyle = "#6a6154";
  ctx.fillRect(0, 0, size, size);

  // Four courses of radial slabs, each ring offset so the joints break.
  const rings = [0.3, 0.52, 0.74, 0.98];
  for (let r = 0; r < rings.length; r++) {
    const inner = (r === 0 ? 0.1 : rings[r - 1]) * c;
    const outer = rings[r] * c;
    const count = 10 + r * 6;
    const offset = (r % 2) * (Math.PI / count);
    for (let i = 0; i < count; i++) {
      const a0 = (i / count) * Math.PI * 2 + offset + 0.012;
      const a1 = ((i + 1) / count) * Math.PI * 2 + offset - 0.012;
      const shade = 132 + Math.floor(rand() * 46);
      ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 14})`;
      ctx.beginPath();
      ctx.arc(c, c, outer - 1.6, a0, a1);
      ctx.arc(c, c, inner + 1.6, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    }
  }
  speckle(ctx, size, rand, 2600, 0.1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The palisade: posts around the boundary, opening at each gate. */
/**
 * An invisible ring of boxes standing where the palisade stands, for the camera
 * to bump into.
 *
 * THE WALL COULD NOT PUSH THE CAMERA OUT, and that is why a character standing
 * against it was cut off at the waist by their own town (M70.241). Camera
 * colliders are `town.buildings` — the houses — and the palisade is not an
 * object at all: its posts go into the shared `Builder` and merge with
 * everything else.
 *
 * THE OBVIOUS FIX WAS MEASURED AND REJECTED. Giving the real palisade a group
 * and handing that to `setCameraColliders` cost 4.93ms a frame against a
 * baseline of 0.309 — seventy-one per cent of a 144Hz budget — because its
 * merges span the whole ring, so every one has a town-sized bounding sphere and
 * every ray inside the walls falls through to per-triangle work.
 *
 * Seventy-two short boxes have seventy-two SMALL spheres instead, so a ray near
 * one stretch of wall rejects the rest on the cheap test. And this group is
 * never added to the scene: `clearDistance` raycasts the array it is given
 * directly, so a collider needs a world matrix and nothing else. No draw calls,
 * no material, nothing to render — it exists only to be hit.
 */
function wallColliderRing(s: Settlement, height: number): THREE.Group {
  const group = new THREE.Group();
  const radius = s.radiusPx / PX_PER_UNIT;
  const cx = toWorldX(s.center.x);
  const cz = toWorldZ(s.center.y);
  const step = 5; // degrees per box
  const geo = new THREE.BoxGeometry(2 * radius * Math.sin((step / 2) * (Math.PI / 180)) * 1.06, height, 0.4);
  for (let deg = 0; deg < 360; deg += step) {
    // THIS SETTLEMENT'S OWN GATES. It used to ask Emberhold's, which for
    // Coldharrow meant a solid collider across its Landward Gate and openings
    // at three bearings with wall standing in them.
    if (inGatewayAmong(s.gates, deg) || inGatewayAmong(s.gates, deg + step)) continue;
    const a = ((deg + step / 2) * Math.PI) / 180;
    const m = new THREE.Mesh(geo);
    m.position.set(cx + Math.cos(a) * radius, height / 2, cz + Math.sin(a) * radius);
    // Long axis along the tangent. Rotating local +X by -(a + 90 degrees) puts
    // it there; check it at a = 0, where the tangent is +z.
    m.rotation.y = -(a + Math.PI / 2);
    group.add(m);
  }
  // Once, because none of it ever moves — and a collider that has never had its
  // world matrix computed is a collider a ray passes straight through.
  group.updateMatrixWorld(true);
  return group;
}

/**
 * Coldharrow's curtain wall.
 *
 * NOT A PALISADE WITH BETTER MATERIALS. A palisade is a line of sharpened posts
 * and it reads as a boundary somebody put up; a curtain wall is a continuous
 * solid with towers on it and it reads as a thing that was BUILT, at cost, by
 * people who expected to be attacked. That difference is most of what separates
 * a village from a city at this camera, and it is why the wall is a function on
 * `SettlementLook` rather than a flag on one shared builder — there is no
 * parameter that turns one of these into the other.
 *
 * Three parts, and each is doing work the others cannot:
 *
 *   The CURTAIN is chord boxes, not posts. A solid face takes the light as one
 *   surface, which is what makes it read as masonry rather than as fence.
 *   The MERLONS are what say "defence" at a distance, the way the palisade's
 *   sharpened tips do — a flat-topped wall reads as a retaining wall.
 *   The TOWERS are the silhouette. A ring of plain wall is a circle; a ring
 *   with drums standing proud of it every thirty degrees has a shape you can
 *   recognise across the ice, which is the whole job of the seaward side.
 */
function curtainWall(b: Builder, group: THREE.Group, lanterns: Lantern[], s: Settlement): void {
  const radius = s.radiusPx / PX_PER_UNIT;
  const cx = toWorldX(s.center.x);
  const cz = toWorldZ(s.center.y);
  const open = (deg: number) => inGatewayAmong(s.gates, deg);

  const HEIGHT = 4.6;
  const THICK = 0.62;
  const at = (deg: number, r = radius) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
  };

  // --- the curtain ---------------------------------------------------------
  // Two degrees a segment: at this radius that is a chord of about 2.3 units,
  // short enough that the ring does not read as a polygon and long enough that
  // the whole wall is a hundred and eighty boxes rather than a thousand.
  const STEP = 2;
  for (let deg = 0; deg < 360; deg += STEP) {
    if (open(deg) || open(deg + STEP)) continue;
    const p0 = at(deg);
    const p1 = at(deg + STEP);
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const midX = (p0.x + p1.x) / 2;
    const midZ = (p0.z + p1.z) / 2;
    const rot = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
    b.box("granite", len + 0.06, HEIGHT, THICK, midX, HEIGHT / 2, midZ, rot);
    // A darker course at the foot, so the wall has a base instead of growing
    // out of the grass.
    b.box("graniteDark", len + 0.12, 0.5, THICK + 0.16, midX, 0.25, midZ, rot);
  }

  // --- merlons -------------------------------------------------------------
  for (let deg = 0; deg < 360; deg += STEP) {
    if (open(deg)) continue;
    const p = at(deg);
    const a = (deg * Math.PI) / 180;
    b.box("granite", 1.1, 0.72, THICK, p.x, HEIGHT + 0.36, p.z, -a + Math.PI / 2);
  }

  // --- towers --------------------------------------------------------------
  // Every thirty degrees, standing proud of the face and taller than it.
  for (let deg = 0; deg < 360; deg += 30) {
    if (open(deg)) continue;
    const p = at(deg, radius + 0.3);
    const h = HEIGHT + 2.6;
    b.cyl("graniteDark", 1.35, h, p.x, 0, p.z, 10);
    // A crown a little wider than the drum, which is what reads as a tower
    // rather than as a pillar.
    b.cyl("granite", 1.55, 0.5, p.x, h, p.z, 10);
    b.add(
      "slateCold",
      new THREE.ConeGeometry(1.62, 2.1, 10),
      p.x,
      h + 0.25 + 1.05,
      p.z,
    );
  }

  // --- gatehouses ----------------------------------------------------------
  // Square towers flanking each opening, and a lintel across it. A gate is the
  // one part of a wall people look at from close up.
  for (const gate of s.gates) {
    const half = gate.halfDeg;
    for (const side of [-1, 1]) {
      const p = at(gate.angleDeg + side * (half + 1.4), radius + 0.2);
      const a = ((gate.angleDeg + side * (half + 1.4)) * Math.PI) / 180;
      const h = HEIGHT + 3.4;
      b.box("graniteDark", 3.0, h, 3.0, p.x, h / 2, p.z, -a + Math.PI / 2);
      b.box("granite", 3.4, 0.55, 3.4, p.x, h + 0.28, p.z, -a + Math.PI / 2);
      // A lamp on the inner face of each gate tower. Through the shared helper
      // rather than pushed onto the list directly: every warm source in a town
      // is on one flicker clock, and a hand-made entry would sit dead still
      // beside them.
      const lamp = at(gate.angleDeg + side * (half + 1.4), radius - 2.2);
      lantern(b, group, lamp.x, lamp.z, h - 1.2, lanterns, 0.85);
    }
    // The lintel: one beam across the opening at the top of the curtain.
    const p0 = at(gate.angleDeg - half, radius);
    const p1 = at(gate.angleDeg + half, radius);
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const rot = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
    b.box(
      "granite",
      len,
      1.0,
      THICK + 0.2,
      (p0.x + p1.x) / 2,
      HEIGHT - 0.2,
      (p0.z + p1.z) / 2,
      rot,
    );
  }
}

function palisade(b: Builder, group: THREE.Group, lanterns: Lantern[], s: Settlement): void {
  const radius = s.radiusPx / PX_PER_UNIT;
  const cx = toWorldX(s.center.x);
  const cz = toWorldZ(s.center.y);

  // The same predicate the wall collision uses, so the timber and the thing
  // stopping you walking through it open in the same places.
  const inGateway = (deg: number) => inGatewayAmong(s.gates, deg);

  const rand = seededRandom(991);

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

/**
 * One broken plate of ice: an irregular slab with an angular outline.
 *
 * BECAUSE `BoxGeometry` LOOKS LIKE A BOX, which is what the first two attempts
 * at this were and exactly what came back from play — "ice just looks like
 * blocks too". No amount of colour, tilt or scatter fixes a cube: the silhouette
 * is the thing being read, and a cube's silhouette is a cube's at every angle.
 *
 * Ice does not break into rectangles. A sheet under stress fractures along
 * lines that meet at odd angles, so a plate is a POLYGON with a handful of
 * straight sides of unequal length — six to nine of them, none of them square
 * to each other. That outline is nearly the whole cue, and it costs the same as
 * the box did.
 *
 * The radius is a smooth function of the angle rather than a per-vertex random,
 * so the outline is irregular without being spiky, and the top and bottom faces
 * agree — the seam a per-vertex jitter leaves at angle zero is visible as a
 * notch, and on a slab this flat it reads as a modelling error.
 */
function icePlate(
  radius: number,
  thickness: number,
  sides: number,
  /** Decorrelates plates so no two share an outline. */
  phase: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius * 0.94, thickness, sides);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    // Two low harmonics: enough to make the sides unequal, too smooth to spike.
    const f =
      1 +
      0.3 * Math.sin(a * 3 + phase) +
      0.17 * Math.sin(a * 7 + phase * 2.3) +
      0.09 * Math.sin(a * 11 + phase * 0.7);
    pos.setX(i, x * f);
    pos.setZ(i, z * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Smooth seeded value noise, for mottling the harbour ice.
 *
 * A lattice of random values read back with smoothstep interpolation, which is
 * the cheapest thing that gives PATCHES rather than static — and patches are
 * what the ice needed. Per-vertex random would have been noise on a disc and
 * still read as one flat tone from any distance; this gives drifts a few metres
 * across, which is the scale wind-blown snow actually sits at.
 *
 * Two of these at different lattice sizes are layered at the call site. One
 * octave reads as a regular grid once you have noticed it; two does not.
 */
function iceMottle(seed: number, cols: number, rows: number): (u: number, v: number) => number {
  const r = seededRandom(seed);
  const g: number[] = [];
  for (let i = 0; i < cols * rows; i++) g.push(r());
  return (u, v) => {
    const x = Math.max(0, Math.min(1, u)) * (cols - 1);
    const y = Math.max(0, Math.min(1, v)) * (rows - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, cols - 1);
    const y1 = Math.min(y0 + 1, rows - 1);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = g[y0 * cols + x0] * (1 - sx) + g[y0 * cols + x1] * sx;
    const bot = g[y1 * cols + x0] * (1 - sx) + g[y1 * cols + x1] * sx;
    return top * (1 - sy) + bot * sy;
  };
}

/**
 * Coldharrow's furniture.
 *
 * NOT `squareDressing` WITH DIFFERENT NUMBERS. That function sets out benches,
 * planters, a well and bunting on a ring round a village green. A harbour has
 * none of those, which is why the look table grew a `dressing` slot in the
 * first place — running Emberhold's put a hamlet's garden furniture round an
 * ice basin.
 *
 * What a cold port has instead, and why each one is here:
 *
 *   LAMPS, along the streets. A village is walked between doors it can see; a
 *   city is walked at night down roads it cannot, and the lamps are what make
 *   the street legible as a route rather than a gap between buildings. They go
 *   at the KERB, inside the carriageway — the one band guaranteed clear of
 *   masonry, because `settleLayout` has already pushed every building out of it.
 *   Set at the edge, outside the street, they would be half-buried in whatever
 *   the solver happened to park there.
 *
 *   BOLLARDS, along the quay lip. The single detail that makes a waterfront
 *   read as a waterfront rather than a paved area that stops. Low enough to
 *   step over and given no collision, because stopping a body on every one of
 *   them would fence off the harbour.
 *
 *   CARGO and BRAZIERS, from `s.props` rather than from a second list here, so
 *   the fire you can see is the fire you bump into.
 */
/**
 * The braziers that throw light, as opposed to the ones that are only fire.
 *
 * A set rather than a count, because WHICH four matters: the pair at the head
 * of the quays and the pair inside the Landward Gate are where a player arrives
 * and where they stand about. The ones in the works yard and out on the commons
 * are seen from across the city, where a light contributes nothing a flame does
 * not already do.
 */
const LIT_BRAZIERS = new Set([
  "cold-brazier-gate-w",
  "cold-brazier-gate-e",
  "cold-brazier-quay-w",
  "cold-brazier-quay-e",
]);

function coldharrowDressing(
  b: Builder,
  group: THREE.Group,
  lanterns: Lantern[],
  s: Settlement,
): void {
  const cx = toWorldX(s.center.x);
  const cz = toWorldZ(s.center.y);
  const at = (radiusPx: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return {
      x: cx + (Math.cos(a) * radiusPx) / PX_PER_UNIT,
      z: cz + (Math.sin(a) * radiusPx) / PX_PER_UNIT,
    };
  };

  // --- lamps ----------------------------------------------------------------
  // Alternating sides rather than facing pairs: a matched pair every forty feet
  // reads as a runway, and a stagger reads as a street.
  //
  // SPACED AT 620px AND MOSTLY UNLIT, which is the fix for the worst thing this
  // file has done. At 380px spacing with a PointLight each, the four spokes and
  // two rings came to fifty-eight dynamic lights — on top of the braziers,
  // sixty-six against Emberhold's six. Every lit fragment pays for every light
  // in range and three.js rebuilds the shader program when the count changes,
  // so the city stuttered on nearly every step. Reported from play as
  // "unplayable... lag and freeze like crazy".
  //
  // NOT ONE OF THEM CARRIES A REAL LIGHT, and the number that settled it is
  // this: a point light costs ~210-300ms OF LOAD TIME, every time. Not frame
  // time — LOAD time, because it lengthens the unrolled light loop in every one
  // of the 43 shaders the game compiles under the loading screen. Bisected
  // against a 15.9s baseline, with everything else in the city present:
  //
  //      0 Coldharrow lights ......... 15.9s   (baseline)
  //      8 (the braziers only) ....... 18.3s
  //     21 (plus every third lamp) ... 21.0s
  //
  // Which is how a city with street lighting turned a sixteen-second load into
  // a twenty-one-second one and made the loading screen look like a hang. It
  // was reported that way — "on the loading screen it freezes and my whole
  // browser freezes" — and the comment on Emberhold's six square lanterns had
  // already said it in plain words: every extra one is a real cost on every lit
  // surface. It was right, and it understated the case.
  //
  // The posts and their emissive glow balls cost nothing of the sort, and they
  // are what actually reads at this camera. Pools of light on the cobbles were
  // never worth five seconds of every session.
  let flip = false;
  let n = 0;
  const LIT_EVERY = Number.POSITIVE_INFINITY;
  for (const st of COLDHARROW_STREETS) {
    const kerb = st.halfPx - 28;
    if (st.kind === "spoke") {
      const angle = st.angleDeg ?? 0;
      const along = (angle * Math.PI) / 180;
      const across = ((angle + 90) * Math.PI) / 180;
      for (let r = (st.fromPx ?? 0) + 340; r <= (st.toPx ?? 0) - 160; r += 620) {
        flip = !flip;
        const off = kerb * (flip ? 1 : -1);
        const x = cx + (Math.cos(along) * r + Math.cos(across) * off) / PX_PER_UNIT;
        const z = cz + (Math.sin(along) * r + Math.sin(across) * off) / PX_PER_UNIT;
        lantern(b, group, x, z, 3.2, lanterns, 1.15, false, false, n++ % LIT_EVERY === 0);
      }
    } else {
      // Constant ARC LENGTH, not constant angle: the two rings are at different
      // radii, and a fixed angular step would space the outer ring's lamps
      // almost twice as far apart as the inner ring's.
      const ring = st.radiusPx ?? 1;
      const stepDeg = (620 / ring) * (180 / Math.PI);
      for (let d = (st.startDeg ?? 0) + stepDeg / 2; d < (st.endDeg ?? 0); d += stepDeg) {
        flip = !flip;
        const p = at(ring + kerb * (flip ? 1 : -1), d);
        lantern(b, group, p.x, p.z, 3.2, lanterns, 1.15, false, false, n++ % LIT_EVERY === 0);
      }
    }
  }

  // --- the quay lip ---------------------------------------------------------
  const lip = COLDHARROW_BASIN.innerPx - 45;
  for (let deg = COLDHARROW_BASIN.startDeg + 2; deg < COLDHARROW_BASIN.endDeg; deg += 3.4) {
    const a = (deg * Math.PI) / 180;
    // Skip where a street runs out to the water: a bollard in the middle of the
    // road at the end of the spine is a bollard somebody put there by accident.
    if (onColdharrowStreet(s.center.x + Math.cos(a) * lip, s.center.y + Math.sin(a) * lip)) {
      continue;
    }
    const p = at(lip, deg);
    b.cyl("pitch", 0.2, 0.8, p.x, 0, p.z, 8);
    b.add("pitch", new THREE.SphereGeometry(0.23, 8, 6), p.x, 0.8, p.z);
  }

  // --- what the shared table says is here -----------------------------------
  for (const prop of s.props) {
    const at2 = propPositionIn(s, prop);
    const x = toWorldX(at2.x);
    const z = toWorldZ(at2.y);
    if (prop.id.startsWith("cold-brazier")) {
      // FOUR OF THE EIGHT ARE LIT. All eight are built — the iron, the coals
      // and the fire are merged geometry either way — but only the four people
      // actually gather at throw light. That keeps Coldharrow's total near
      // Emberhold's six, which its own note calls "the number the night pass is
      // tuned against".
      brazier(b, group, x, z, lanterns, LIT_BRAZIERS.has(prop.id));
      continue;
    }
    if (prop.id.startsWith("cold-cargo")) {
      // A PILE, not a prop. Cargo on a quay is stacked, and three loose crates
      // spaced out on the flags read as litter; boxes rather than gltf
      // instances because the stack is the shape that matters, not the lid.
      const r = seededRandom(prop.id.charCodeAt(prop.id.length - 1) * 977 + prop.radiusPx);
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const w = 0.8 + r() * 0.45;
        const h = 0.62 + r() * 0.3;
        const lift = i >= 3 ? 0.95 : 0;
        b.box(
          i % 2 ? "timber" : "timberLight",
          w,
          h,
          w * (0.82 + r() * 0.36),
          x + (r() - 0.5) * 1.4,
          lift,
          z + (r() - 0.5) * 1.4,
          r() * Math.PI,
        );
      }
      continue;
    }
    if (prop.id === "cold-notices") {
      b.cyl("timber", 0.09, 2.0, x - 0.6, 0, z, 6);
      b.cyl("timber", 0.09, 2.0, x + 0.6, 0, z, 6);
      b.box("timberLight", 1.6, 1.1, 0.1, x, 1.4, z, 0);
    }
  }
}

/** The well in the square, plus a market stall, troughs and fences. */
function squareDressing(b: Builder, group: THREE.Group, lanterns: Lantern[], s: Settlement): void {
  const cx = toWorldX(s.center.x);
  const cz = toWorldZ(s.center.y);
  const polar = (radiusPx: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + (Math.cos(a) * radiusPx) / PX_PER_UNIT, z: cz + (Math.sin(a) * radiusPx) / PX_PER_UNIT };
  };

  // Positions come from `shared/town.ts`, not from numbers typed here.
  // Collision keeps a body out of these same entries, and two copies of a
  // placement is two copies to move next time the square is rearranged — with
  // the failure being an invisible wall in the middle of open paving.
  const prop = (id: string) => {
    const p = propById(id)!;
    return polar(p.radiusPx, p.angleDeg);
  };

  // --- The statue's plinth --------------------------------------------------
  // What the square is FOR, and it stands dead centre.
  //
  // The obelisk this replaces was a stack of four grey boxes and a cone, pushed
  // off to one side because the middle of the square was where every player
  // materialised. Both halves of that were wrong. A monument that is not on the
  // centre is not the centre of anything, and the arrival problem was never a
  // reason to leave the best spot in town empty — it was a reason to move
  // ARRIVAL, which is what `PLAYER_ARRIVAL` now does.
  //
  // Only the base is built here. The figure on top is a real character rig cast
  // in stone — see `Town.raiseStatue`, and the note there for why that is the
  // right way to get a good statue out of a project with no sculptor.
  const statue = prop("statue");
  // Three shallow steps, square to the road rather than turned 45 degrees: the
  // road runs east-west past either side of this, and a diamond plan puts a
  // corner into the carriageway.
  for (let step = 0; step < 3; step++) {
    const half = 2.15 - step * 0.36;
    b.box(step === 1 ? "stoneDark" : "stone", half * 2, 0.2, half * 2, statue.x, step * 0.2, statue.z);
  }
  // The pedestal: a base moulding, the die, and a cornice under the figure.
  b.box("stone", 1.62, 0.22, 1.62, statue.x, 0.6, statue.z);
  b.box("stoneDark", 1.34, 1.15, 1.34, statue.x, 0.82, statue.z);
  b.box("stone", 1.58, 0.2, 1.58, statue.x, 1.97, statue.z);
  // A bronze plate on the face that looks back down the road toward the gate.
  b.box("iron", 0.76, 0.46, 0.05, statue.x, 1.28, statue.z + 0.69);
  // Four lamps at the corners of the base, which is what makes it the brightest
  // thing in the square after dark.
  for (const deg of [45, 135, 225, 315]) {
    const a = (deg * Math.PI) / 180;
    lantern(b, group, statue.x + Math.cos(a) * 1.95, statue.z + Math.sin(a) * 1.95, 1.5, lanterns, 0.45);
  }

  // --- The well -------------------------------------------------------------
  const well = prop("well");
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
  const stallProp = propById("stall")!;
  const stall = polar(stallProp.radiusPx, stallProp.angleDeg);
  const stallRot = -((stallProp.angleDeg - 180) * Math.PI) / 180;
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
  for (const deg of LANTERN_ANGLES) {
    const p = polar(LANTERN_RING_PX, deg);
    lantern(b, group, p.x, p.z, 3.1, lanterns);
  }

  // --- Fences, troughs and a woodpile --------------------------------------
  const pile = prop("woodpile");
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      // Placed with `add` rather than `cyl`, because `cyl` raises a piece by
      // half its HEIGHT — which is right for a post standing up and wrong for
      // a log lying down. Through `cyl` these floated 0.55 units off the grass
      // on a stack that is only 0.75 tall.
      b.add(
        "timberLight",
        new THREE.CylinderGeometry(0.15, 0.15, 1.4, 7),
        pile.x + (i - (3 - row) / 2) * 0.34,
        0.15 + row * 0.28,
        pile.z,
        0,
        Math.PI / 2,
      );
    }
  }

  const trough = prop("trough");
  b.box("timberLight", 1.9, 0.55, 0.75, trough.x, 0, trough.z);
  b.box("stoneDark", 1.7, 0.12, 0.6, trough.x, 0.4, trough.z);

  // --- Benches --------------------------------------------------------------
  // Somewhere to stand around, which is what this square is for. Placed facing
  // inward on the ring the lanterns are on, so the lit part of the town at
  // night is also the part with something to sit on.
  for (const deg of BENCH_ANGLES) {
    const p = polar(BENCH_RING_PX, deg);
    bench(b, p.x, p.z, -((deg + 90) * Math.PI) / 180);
  }

  // --- The band between the buildings and the wall --------------------------
  // Widening the square left a six-unit ring of bare grass inside the palisade,
  // which reads as a fence somebody put round a field. Kitchen gardens, hedges
  // and a cart fill it — all of it built from the same kit as everything else
  // so nothing here needs a download.
  for (const deg of GARDEN_ANGLES) {
    const p = polar(GARDEN_RING_PX, deg);
    const rot = -((deg + 90) * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const at = (lx: number, lz: number) => ({
      x: p.x + lx * cos + lz * sin,
      z: p.z - lx * sin + lz * cos,
    });
    // A fenced plot. The rails used to be the whole fence, hanging at 0.24 and
    // 0.5 with nothing under them — two brown planks floating over the grass,
    // which is what a fence looks like when you forget the posts.
    for (const lx of [-1.5, -0.5, 0.5, 1.5]) {
      for (const lz of [-1.1, 1.1]) {
        const q = at(lx, lz);
        b.box("timberLight", 0.09, 0.62, 0.09, q.x, 0, q.z, rot);
      }
    }
    for (const side of [-1, 1]) {
      const q = at(0, side * 1.1);
      b.box("timberLight", 3.1, 0.08, 0.06, q.x, 0.5, q.z, rot);
      b.box("timberLight", 3.1, 0.08, 0.06, q.x, 0.24, q.z, rot);
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

  // --- Bunting -------------------------------------------------------------
  // Strung post to post right round the lantern ring, so the square has
  // something overhead. This is the single biggest change to how the place
  // FEELS: an open plaza with a line of flags across it reads as somewhere that
  // holds a market, and the same plaza without them reads as a yard.
  //
  // Slung between consecutive lanterns rather than corner to corner, because a
  // rope across the middle of the square would hang over the statue and cut the
  // one clear sight line in town.
  for (let i = 0; i < LANTERN_ANGLES.length; i++) {
    const from = polar(LANTERN_RING_PX, LANTERN_ANGLES[i]);
    const to = polar(LANTERN_RING_PX, LANTERN_ANGLES[(i + 1) % LANTERN_ANGLES.length]);
    // Skip the two spans that would cross a gateway: bunting over the road is
    // bunting a cart takes down.
    const mid = (LANTERN_ANGLES[i] + LANTERN_ANGLES[(i + 1) % LANTERN_ANGLES.length]) / 2;
    if (bearingInGateway(mid)) continue;
    bunting(b, from.x, 3.35, from.z, to.x, 3.35, to.z, 0.62, 400 + i * 37);
  }

  // --- A handcart, a notice board and two braziers --------------------------
  // The things that say somebody works here. Every position comes out of
  // `TOWN_PROPS`, so what is drawn and what a body is kept out of are one
  // entry — the rule the well and the monument were already moved onto.
  const cartProp = propById("cart")!;
  const cart = prop("cart");
  handcart(b, cart.x, cart.z, -(cartProp.angleDeg * Math.PI) / 180);

  // The board faces the middle of the square from beside the west gate, which
  // is where somebody walking in off the road passes it.
  const boardProp = propById("noticeboard")!;
  const board = prop("noticeboard");
  noticeBoard(b, board.x, board.z, -((boardProp.angleDeg + 180) * Math.PI) / 180);

  for (const id of ["brazier-a", "brazier-b"]) {
    const p = prop(id);
    brazier(b, group, p.x, p.z, lanterns);
  }

  // --- Planters ------------------------------------------------------------
  // Colour at eye level, which the square had none of. Paired either side of
  // every bench so they read as arranged rather than dropped.
  let planterSeed = 900;
  for (const p of TOWN_PROPS) {
    if (!p.id.startsWith("planter-")) continue;
    const at = polar(p.radiusPx, p.angleDeg);
    planter(b, at.x, at.z, (planterSeed += 53));
  }

  // --- The back lane --------------------------------------------------------
  // The belt between the houses and the palisade. Everything here belongs to
  // the building it stands behind — the pell and the spears to the watch, hay
  // and a cart to the inn, hives beside the herb gardens — so the ring reads as
  // six households' back yards rather than as one decorated circle.
  const facingOut = (id: string) => -((propById(id)!.angleDeg + 180) * Math.PI) / 180;

  const pell = prop("trainingpost");
  trainingPost(b, pell.x, pell.z, facingOut("trainingpost"));
  const rack = prop("spearrack");
  spearRack(b, rack.x, rack.z, facingOut("spearrack"));

  const rick = prop("hayrick");
  hayRick(b, rick.x, rick.z);

  for (const id of ["beehive-a", "beehive-b", "beehive-c"]) {
    const p = prop(id);
    beehive(b, p.x, p.z);
  }
  // Every rain barrel in the table, rather than a list typed beside it. The
  // shop's yard gained one in the same milestone that gave it crates, and a
  // hand-written list is how a prop ends up placed, collided with, and never
  // drawn — visible from nowhere, because a barrel that is not there looks
  // exactly like a barrel that was never asked for.
  for (const p of TOWN_PROPS) {
    if (!p.id.startsWith("rainbarrel-")) continue;
    const at = prop(p.id);
    rainBarrel(b, at.x, at.z);
  }

  // The chapel's burial ground, and the lamp it is named for.
  for (const p of TOWN_PROPS) {
    if (!p.id.startsWith("grave-")) continue;
    const at = prop(p.id);
    graveMarker(b, at.x, at.z, facingOut(p.id), at.x + at.z);
  }
  const offering = prop("offeringstone");
  offeringStone(b, group, offering.x, offering.z, facingOut("offeringstone"), lanterns);

  // The shop's stock, waiting at the back door.
  const crates = prop("cratestack");
  crateStack(b, crates.x, crates.z, facingOut("cratestack"));
  const sacks = prop("sackpile");
  sackPile(b, sacks.x, sacks.z, sacks.x - sacks.z);

  const block = prop("choppingblock");
  choppingBlock(b, block.x, block.z, facingOut("choppingblock"), block.x + block.z);

  // Washing, on its own pair of posts behind the inn and behind the cottages.
  //
  // A SHORT span — four or five units, which is a washing line. The first
  // version strung it between two lamp posts forty-four degrees apart: thirteen
  // units of cord with four small sheets lost somewhere along it, which from
  // the square read as nothing at all.
  for (const [p1, p2] of [
    ["laundry-a1", "laundry-a2"],
    ["laundry-b1", "laundry-b2"],
  ]) {
    const a = prop(p1);
    const c = prop(p2);
    b.cyl("timber", 0.07, 2.3, a.x, 0, a.z, 6);
    b.cyl("timber", 0.07, 2.3, c.x, 0, c.z, 6);
    laundryLine(b, a.x, 2.25, a.z, c.x, 2.25, c.z, 6100 + a.x);
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
export function ringedDisc(
  radius: number,
  segments: number,
  bands: number[],
  /**
   * Where the fade to transparent begins, as a fraction of the radius.
   *
   * A PARAMETER BECAUSE THE YARD NEEDS A DIFFERENT ONE, and the default hid
   * that. `bands` only says where the geometry is tessellated; the alpha ramp
   * was a hardcoded 0.78 regardless, which is right for the paved square — a
   * plaza should melt into the grass round it over a fifth of its width. For a
   * surface whose whole job is that there is NO grass under it out to the wall,
   * the same ramp leaves a ring of meadow inside the city: the bug moved
   * outward rather than fixed.
   */
  fadeFrom = 0.78,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  const span = Math.max(0.001, 1 - fadeFrom);
  const alphaAt = (t: number) =>
    t <= fadeFrom ? 1 : Math.max(0, 1 - (t - fadeFrom) / span);
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

// --- The statue -------------------------------------------------------------
// The one object in Emberhold that is loaded rather than generated, and the
// exception is the point: everything else here is boxes because a downloaded
// building would arrive in a different stylisation from the trees behind it.
// A person is the opposite case — the game already HAS people, in exactly this
// stylisation, and no arrangement of boxes is going to beat one.

/** The town watch, in stone. The same rig every warrior in the world uses. */
const STATUE_MODEL = "Warrior";
/**
 * How tall the carved figure is, feet to crown.
 *
 * 3.4 — a shade under twice a player's 1.8, which is where civic sculpture
 * actually sits. The first pass used 2.5 and it was wrong in a way that only
 * shows up beside the pedestal: 2.5 is 1.4 times life size, and a figure 1.4
 * times life on a pedestal 2.2 metres tall reads as a person standing on a box
 * rather than as something somebody carved. The pedestal was out-massing the
 * sculpture, and the fix is the sculpture rather than a smaller pedestal —
 * shrinking the base would have made the monument shorter than the well.
 *
 * Bounded at the top by the roofline. The inn's eaves are 4.8 and the figure's
 * crown now lands at about 5.5, so the monument is the tallest FREE-STANDING
 * thing in Emberhold and still stands below the ridges around it, which is what
 * a village square looks like and what a cathedral square does not.
 */
const STATUE_HEIGHT = 3.4;
/**
 * Which clip to hold a frame of, best first.
 *
 * NAMES RATHER THAN A PATTERN, and that is a scar. The first version matched
 * `/attack|slash|swing/i` and the rig's clip list happens to contain
 * `RecieveHit_Attacking` — a recoil — several entries before `Sword_Attack`.
 * The statue was a stone man flinching, which looked like a bad model and was a
 * bad regex.
 *
 * `Idle_Weapon` wins on purpose. A swing frozen mid-air reads as a person who
 * has been paused; a figure standing squarely with the sword down reads as
 * something somebody carved. It also has no root motion in it, so the feet stay
 * over the middle of the plinth.
 */
const STATUE_POSE_ORDER = ["Idle_Weapon", "Sword_Attack", "Idle"];
/** How far into that clip to stop, as a fraction. */
const STATUE_POSE_AT = 0.0;
/** Top of the plinth built in `squareDressing`, in world units. */
const STATUE_PLINTH_TOP = 2.07;

// --- The town ---------------------------------------------------------------

export class Town {
  /**
   * Which settlement this draws.
   *
   * WAS IMPLICIT UNTIL PHASE 71 C. Every function below read `TOWN_CENTER`,
   * `TOWN_RADIUS_PX`, `TOWN_BUILDINGS` and `TOWN_PROPS` out of module scope, so
   * there could only ever be one town and it was always Emberhold. The data
   * generalised in A1; this is the renderer catching up, and Emberhold coming
   * out pixel-identical is the whole proof that it did.
   */
  constructor(private readonly settlement: Settlement) {
    // Assigned HERE rather than as a field initialiser: those run before a
    // constructor parameter property exists, so `wallColliderRing(this.settlement)`
    // at the declaration read an undefined settlement.
    this.wallColliders = wallColliderRing(settlement, lookFor(settlement).wallHeight);
  }

  readonly group = new THREE.Group();
  /**
   * The six buildings, each as its own group.
   *
   * Held separately from `group` because the camera treats them differently
   * from everything else in town: a wall is something it must stay in front of,
   * and a lamp post, a bench and a picket fence are not. Handing the whole town
   * to the camera as a collider makes it lurch forward every time a lantern
   * passes behind the player's shoulder.
   */
  readonly buildings: THREE.Group[] = [];
  /** Invisible boxes standing where the palisade stands, so the camera has a
   *  wall to avoid. Never added to the scene — see `wallColliderRing`. */
  readonly wallColliders: THREE.Group;
  /**
   * Things standing in the town that should go translucent when they get
   * between you and the camera.
   *
   * The statue is the whole reason this exists. It goes into `group` like the
   * palisade did, so it was in neither `buildings` nor `decor` — which are the
   * two lists `refreshOccluderCandidates` builds from — and a player standing
   * behind it in the middle of the busiest square in the game was hidden from
   * the chest down with nothing fading and no camera pull. Same structural gap
   * as M70.241 found in the wall, in the most-walked place there is.
   *
   * Unlike the wall this is safe to fade: it is one compact object with a
   * bounding sphere to match, and `raiseStatue` gives it a cloned material of
   * its own, so making it translucent drags nothing else with it.
   */
  readonly ornaments: THREE.Object3D[] = [];
  private readonly lanterns: Lantern[] = [];
  /** Lifts the whole square after dark. See `update`. */
  private readonly townFill = new THREE.HemisphereLight(0xffd8a0, 0x3a2c1e, 0);
  /** A soft warm pool over the square itself, so the middle is the brightest. */
  private readonly squareGlow = new THREE.PointLight(0xffbe72, 0, 46, 1.6);
  /** The braziers' fire. See `townFlames`. */
  private flames: Flames | null = null;

  build(scene: THREE.Scene): void {
    const builder = new Builder();

    // Before anything that burns is built, because `brazier` reaches for it.
    // Two entries in `TOWN_PROPS`, so the capacity is a count rather than a
    // guess — the same rule the props table already enforces on collision.
    this.flames = new Flames(
      this.settlement.props.filter((p) => p.id.startsWith("brazier-")).length,
      `flames:${this.settlement.id}`,
    );
    townFlames = this.flames;
    this.group.add(this.flames.mesh);

    const look = lookFor(this.settlement);
    for (const b of this.settlement.buildings) {
      const built = makeBuilding(b, this.lanterns, look.styles);
      this.buildings.push(built);
      this.group.add(built);
    }

    look.wall(builder, this.group, this.lanterns, this.settlement);
    look.dressing(builder, this.group, this.lanterns, this.settlement);
    builder.finish(this.group);

    this.buildGround();
    this.buildStreets();
    this.buildHarbour();

    const cx = toWorldX(this.settlement.center.x);
    const cz = toWorldZ(this.settlement.center.y);
    this.squareGlow.position.set(cx, 7.5, cz);
    this.group.add(this.squareGlow);
    this.group.add(this.townFill);

    scene.add(this.group);
    void this.dressWithProps();
    void this.raiseStatue();
  }

  /**
   * The figure on the plinth: a character rig, frozen mid-swing and cast in
   * stone.
   *
   * THE MODEL IS THE GAME'S OWN WARRIOR, and that is the whole idea. This
   * project has no sculptor and every attempt to build a human out of the box
   * kit lands somewhere between a snowman and a scarecrow — the obelisk that
   * stood here was four grey boxes and a cone precisely because a figure was
   * out of reach. But the game already ships a warrior with a sword, in exactly
   * the stylisation of everything standing round the square, and a statue is
   * only a person who has stopped moving and turned the colour of rock.
   *
   * So: instantiate the rig, hold one frame of its own animation, and repaint
   * every surface in the town's stone. It costs one model that is already in
   * the cache — the same file every warrior in the world is drawn from — and it
   * is the one thing in Emberhold that could not have been generated.
   *
   * Frozen by SAMPLING A CLIP rather than by leaving it in bind pose. An
   * unposed FBX stands in a T, arms straight out, which reads as a scarecrow
   * and not as a monument. Playing a clip and stopping the mixer on a chosen
   * frame gives a pose an animator made, for free.
   */
  private async raiseStatue(): Promise<void> {
    const inst = await instantiate(STATUE_MODEL, STATUE_HEIGHT).catch((err) => {
      // A missing statue is a bare plinth, not a broken town — the same rule
      // the props load under. Warned rather than swallowed, because "the middle
      // of the square is empty" is exactly the kind of thing that goes
      // unnoticed until somebody screenshots it.
      console.warn("[town] the statue did not load:", err);
      return null;
    });
    if (!inst) return;

    // One frame of a real animation, held. `mixer.update` once with the clip
    // playing puts every bone where the animator put it at that instant; the
    // mixer is then dropped, so nothing ticks for the rest of the session.
    const named = (want: string) =>
      inst.animations.find((c) => clipName(c.name).toLowerCase() === want.toLowerCase());
    let clip: THREE.AnimationClip | undefined;
    for (const want of STATUE_POSE_ORDER) {
      clip = named(want);
      if (clip) break;
    }
    clip ??= inst.animations[0];
    if (clip) {
      const mixer = new THREE.AnimationMixer(inst.object);
      const action = mixer.clipAction(clip);
      action.play();
      mixer.setTime(clip.duration * STATUE_POSE_AT);
      inst.object.updateMatrixWorld(true);
    }

    // Stone, over every surface it has. One shared material: a statue has no
    // rarity tint, no emissive flash and nothing to fade, so unlike an actor it
    // has no reason to own a copy per mesh.
    const stone = materialFor("stone").clone();
    stone.color.setHex(PALETTE.stone);
    // Rougher and a shade paler than the plinth, so the figure reads as carved
    // rather than as an extension of the box it stands on.
    stone.roughness = 1;
    stone.metalness = 0;
    inst.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = stone;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // A skinned mesh posed once and never again still gets skinned every
      // frame unless it is told the bounds are final; without this it is also
      // culled against a bind-pose box and pops out of view at the screen edge.
      mesh.frustumCulled = false;
    });

    const statue = propById("statue")!;
    const at = propPosition(statue);
    inst.object.position.set(toWorldX(at.x), STATUE_PLINTH_TOP, toWorldZ(at.y));
    // Facing back down the road toward the east gate, so anybody walking in
    // through it is looked at rather than looked past.
    inst.object.rotation.y = Math.PI / 2;
    this.group.add(inst.object);
    // Fadeable, so standing behind it does not hide you. See `ornaments`.
    this.ornaments.push(inst.object);
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
  /**
   * Paving along the streets, for a settlement that has any.
   *
   * SEPARATE FROM `buildGround` because they are different surfaces doing
   * different jobs. The ground is one disc in the middle — the place the city
   * gathers — and the streets are the routes between districts, which reach
   * nearly to the wall. Drawing them as one shape would pave the entire
   * enclosure and turn the city into a floor with buildings on it.
   *
   * Laid as quads along each run rather than as one merged mesh, because a
   * street is a ribbon and a ribbon of quads takes the terrain's own slope
   * where a single plane cannot. They sit a hair above the ground for the same
   * reason the square does: without it the cobbles z-fight the terrain at
   * grazing angles and the symptom looks like a shader bug.
   */
  /**
   * The frozen harbour.
   *
   * ICE IS THE SAME PROBLEM AS THE RIVER'S WATER, INVERTED. The note on the
   * Coldwater's material explains why it carries a constant dim emissive: a
   * smooth dark surface with no reflection probe to catch a sky goes very
   * nearly black the moment the sun is low, and the river is the one thing you
   * must not walk into. Ice has the opposite failure — it is nearly WHITE, so
   * at noon it blows out into a flat sheet with no form at all, and at dusk it
   * is the only thing in the frame still bright.
   *
   * So: a pale blue that is darker than snow, a low roughness for the sheen,
   * and a small emissive that keeps it readable at night without letting it
   * glow. Two layers — the sheet, and a paler crust of broken floes nearer the
   * quays — because one flat polygon the size of a harbour reads as a hole in
   * the ground rather than as a surface.
   */
  /**
   * The ice, so the clock can dim it.
   *
   * AN INSTANCE FIELD, NOT A MODULE-LEVEL LIST like `litGlass` above. That one
   * is shared by every Town ever built, which is survivable only because
   * Emberhold is the only settlement with windows and is a bug waiting for the
   * third town. This file has already produced four singleton faults of exactly
   * that shape — `wallColliders`, `TOWN_CENTER` in the flat spots, the gate
   * angles in the camera ring, `squareDressing` — and there is no reason to add
   * a fifth for the sake of two materials.
   */
  private readonly iceSurfaces: THREE.MeshStandardMaterial[] = [];

  /** Whether this settlement's lanterns are currently in the render list. */
  private lightsOn = true;

  private buildHarbour(): void {
    if (this.settlement.id !== "coldharrow") return;

    const cx = toWorldX(this.settlement.center.x);
    const cz = toWorldZ(this.settlement.center.y);
    const b = COLDHARROW_BASIN;
    const group = new THREE.Group();

    // WHAT WAS WRONG WITH THE FIRST ONE, because it explains every choice below.
    // It was a single flat-shaded ring sector in one colour with thirty white
    // boxes laid on top, and it read — accurately — as "not rendered white
    // floor and white blocks". Nothing in it said ice. A frozen harbour is not
    // a pale disc: it is a SURFACE, and what makes a surface is variation
    // across it, breaks in it, and something standing proud of it. So:
    //
    //   MOTTLE   the sheet, so it is never one flat tone across 1,100 units.
    //   RELIEF   it, so the normals differ and it catches the light unevenly.
    //   CRACK    it, because a fracture network is the single most legible
    //            "this is ice and not stone" signal there is.
    //   RIDGE    it, where plates have driven into each other and ridden up.
    //
    // All of it is seeded, so every client sees the same harbour.

    const rand = seededRandom(70177);

    // --- the sheet ----------------------------------------------------------
    const sheet = new THREE.MeshStandardMaterial({
      // White, because the COLOUR COMES FROM THE VERTICES below. `vertexColors`
      // multiplies the two, so a tinted base would tint the mottle as well and
      // the range would compress back to the flat tone being fixed.
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.16,
      metalness: 0.0,
      // Kept just off black so the basin does not become a hole at night. The
      // INTENSITY is driven by the clock in `update`, not fixed here: at a
      // constant 1 this emitted at full strength at every hour, so at first
      // light the harbour was a glowing white void in a city of black roofs.
      // Reported from play as "what the hell is this white thing".
      emissive: 0x16242c,
      emissiveIntensity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.iceSurfaces.push(sheet);

    // Two octaves of smooth value noise. One is a lattice; two is weather.
    const broad = iceMottle(70177, 9, 5);
    const fine = iceMottle(90011, 23, 11);
    const openIce = new THREE.Color(0x3f5a68);
    const driftedSnow = new THREE.Color(0x9db3bd);

    const ANG = 112;
    const RAD = 16;
    const pos: number[] = [];
    const col: number[] = [];
    const scratch = new THREE.Color();

    const corner = (ai: number, ri: number) => {
      const u = ai / ANG;
      const v = ri / RAD;
      const deg = b.startDeg + (b.endDeg - b.startDeg) * u;
      const a = (deg * Math.PI) / 180;
      const radPx = b.innerPx + (b.outerPx - b.innerPx) * v;
      const r = radPx / PX_PER_UNIT;
      // Snow drifts against the quay and thins toward open ice, so the sheet
      // has a direction to it rather than being noise on a disc.
      let t = broad(u, v) * 0.62 + fine(u, v) * 0.38;
      t = t * 0.76 + (1 - v) * 0.24;
      t = t * t * (3 - 2 * t);
      scratch.copy(openIce).lerp(driftedSnow, t);
      return {
        x: cx + Math.cos(a) * r,
        // A hand's breadth of relief. Ice is not a plane — it sags and heaves —
        // and without it every normal is identical, which is what made the
        // first sheet read as untextured floor no matter what colour it was.
        y: 0.02 + (broad(u, v) - 0.5) * 0.14,
        z: cz + Math.sin(a) * r,
        c: scratch.clone(),
      };
    };

    for (let ai = 0; ai < ANG; ai++) {
      for (let ri = 0; ri < RAD; ri++) {
        const p00 = corner(ai, ri);
        const p10 = corner(ai + 1, ri);
        const p11 = corner(ai + 1, ri + 1);
        const p01 = corner(ai, ri + 1);
        for (const t of [p00, p10, p11, p00, p11, p01]) {
          pos.push(t.x, t.y, t.z);
          col.push(t.c.r, t.c.g, t.c.b);
        }
      }
    }
    const sheetGeo = new THREE.BufferGeometry();
    sheetGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    sheetGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
    sheetGeo.computeVertexNormals();
    const sheetMesh = new THREE.Mesh(sheetGeo, sheet);
    sheetMesh.renderOrder = 2;
    sheetMesh.receiveShadow = true;
    group.add(sheetMesh);

    // --- cracks -------------------------------------------------------------
    // Thin dark ribbons just above the sheet. A fracture WANDERS and BRANCHES;
    // a straight line reads as a join in the floor, which is the thing being
    // fixed rather than a way to fix it.
    const crackMat = new THREE.MeshStandardMaterial({
      color: 0x2c4350,
      roughness: 0.5,
      emissive: 0x0d161b,
      emissiveIntensity: 0,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.iceSurfaces.push(crackMat);

    const inBasin = (x: number, z: number): boolean => {
      const dx = x - cx;
      const dz = z - cz;
      const rPx = Math.hypot(dx, dz) * PX_PER_UNIT;
      if (rPx < b.innerPx || rPx > b.outerPx) return false;
      let deg = (Math.atan2(dz, dx) * 180) / Math.PI;
      while (deg < b.startDeg) deg += 360;
      return deg <= b.endDeg;
    };

    const crackVerts: number[] = [];
    const ribbon = (x0: number, z0: number, x1: number, z1: number, w: number) => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1;
      const nx = (-dz / len) * w;
      const nz = (dx / len) * w;
      const y = 0.09;
      crackVerts.push(
        x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz,
        x0 - nx, y, z0 - nz, x1 + nx, y, z1 + nz, x0 + nx, y, z0 + nz,
      );
    };

    const walk = (x: number, z: number, heading: number, segs: number, w: number) => {
      let hx = x;
      let hz = z;
      let dir = heading;
      for (let i = 0; i < segs; i++) {
        dir += (rand() - 0.5) * 0.7;
        const len = 2.2 + rand() * 5.5;
        const tx = hx + Math.cos(dir) * len;
        const tz = hz + Math.sin(dir) * len;
        if (!inBasin(tx, tz)) return;
        ribbon(hx, hz, tx, tz, w * (0.6 + rand() * 0.8));
        hx = tx;
        hz = tz;
      }
    };

    for (let c = 0; c < 22; c++) {
      const deg = b.startDeg + rand() * (b.endDeg - b.startDeg);
      const radPx = b.innerPx + rand() * (b.outerPx - b.innerPx);
      const a = (deg * Math.PI) / 180;
      const x = cx + (Math.cos(a) * radPx) / PX_PER_UNIT;
      const z = cz + (Math.sin(a) * radPx) / PX_PER_UNIT;
      const heading = rand() * Math.PI * 2;
      walk(x, z, heading, 5 + Math.floor(rand() * 9), 0.11);
      // Fork off the same origin, at an angle, thinner. Fractures branch.
      if (rand() > 0.45) walk(x, z, heading + 1.4 + rand(), 3 + Math.floor(rand() * 5), 0.07);
    }
    if (crackVerts.length) {
      const cg = new THREE.BufferGeometry();
      cg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(crackVerts), 3));
      cg.computeVertexNormals();
      const cm = new THREE.Mesh(cg, crackMat);
      cm.renderOrder = 3;
      group.add(cm);
    }

    // --- pressure ridges and loose plates -----------------------------------
    const plate = new THREE.MeshStandardMaterial({
      // Only a shade off the sheet. At 0xc6d8e2 against pale ice these read as
      // torn paper scattered over the harbour; the point of a floe is that it
      // is the SAME ice, broken and tilted, so it differs by a shade and a
      // normal rather than by being white.
      color: 0x7d95a1,
      roughness: 0.22,
      emissive: 0x16242c,
      emissiveIntensity: 0,
    });
    this.iceSurfaces.push(plate);

    // ONE MESH FOR ALL OF IT. Every shard and floe below used to be its own
    // `THREE.Mesh` with `castShadow` set — two hundred and fifty-seven of them,
    // which is 257 draw calls in the main pass and 257 more in the shadow pass,
    // for objects twelve centimetres thick whose shadows nobody will ever pick
    // out. They are collected and merged instead, the same way `Builder` treats
    // the buildings, and the shadow casting is dropped.
    const plateParts: THREE.BufferGeometry[] = [];
    const plateMatrix = new THREE.Matrix4();
    const plateEuler = new THREE.Euler();
    const plateQuat = new THREE.Quaternion();
    const plateScale = new THREE.Vector3(1, 1, 1);
    const addPlate = (
      g: THREE.BufferGeometry,
      px: number,
      py: number,
      pz: number,
      rx: number,
      ry: number,
      rz: number,
    ) => {
      plateEuler.set(rx, ry, rz);
      plateQuat.setFromEuler(plateEuler);
      plateMatrix.compose(new THREE.Vector3(px, py, pz), plateQuat, plateScale);
      const flat = g.index ? g.toNonIndexed() : g;
      flat.applyMatrix4(plateMatrix);
      flat.deleteAttribute("uv");
      plateParts.push(flat);
    };

    // A ridge is where two plates met and one rode up: a LINE of shards, packed
    // and leaning the same way. The line is what the eye reads as ice under
    // pressure; the same shards scattered read as rubble.
    for (let r = 0; r < 4; r++) {
      const radPx = b.innerPx + 120 + rand() * Math.max(60, b.outerPx - b.innerPx - 260);
      const startDeg = b.startDeg + rand() * (b.endDeg - b.startDeg - 26);
      const spanDeg = 9 + rand() * 20;
      const lean = (rand() - 0.5) * 0.5;
      const shards = Math.floor(spanDeg * 3.2);
      for (let i = 0; i < shards; i++) {
        const deg = startDeg + (spanDeg * i) / shards;
        const a = (deg * Math.PI) / 180;
        const rr = (radPx + (rand() - 0.5) * 34) / PX_PER_UNIT;
        // PLATES STOOD ON EDGE, which is what a pressure ridge physically is:
        // the same flat sheet, snapped, with the broken pieces shoved up on
        // their sides. Tipped most of the way over rather than a little, so the
        // silhouette is a row of angled blades and not a row of lumps.
        const g = icePlate(0.5 + rand() * 0.95, 0.12 + rand() * 0.1, 6 + Math.floor(rand() * 3), rand() * 6.3);
        addPlate(
          g,
          cx + Math.cos(a) * rr,
          0.16 + rand() * 0.4,
          cz + Math.sin(a) * rr,
          (rand() - 0.5) * 0.5,
          a + (rand() - 0.5) * 0.9,
          lean + (Math.PI / 2) * (0.55 + rand() * 0.4) * (rand() > 0.5 ? 1 : -1),
        );
      }
    }

    // And a few plates frozen in flat, away from the ridges, so the open ice
    // between them is not perfectly smooth either.
    for (let i = 0; i < 16; i++) {
      const deg = b.startDeg + rand() * (b.endDeg - b.startDeg);
      const radPx = b.innerPx + rand() * (b.outerPx - b.innerPx);
      const a = (deg * Math.PI) / 180;
      const rr = radPx / PX_PER_UNIT;
      const w = 0.7 + rand() * 1.5;
      const g = icePlate(w, 0.11 + rand() * 0.1, 6 + Math.floor(rand() * 4), rand() * 6.3);
      // A few degrees off flat. It is the TILT rather than the outline that
      // makes a plate read as broken ice — laid perfectly flat they are tiles.
      addPlate(
        g,
        cx + Math.cos(a) * rr,
        0.05,
        cz + Math.sin(a) * rr,
        (rand() - 0.5) * 0.2,
        rand() * Math.PI,
        (rand() - 0.5) * 0.2,
      );
    }

    if (plateParts.length) {
      const merged = mergeGeometries(plateParts, false);
      if (merged) {
        const m = new THREE.Mesh(merged, plate);
        m.renderOrder = 4;
        group.add(m);
      }
    }

    this.group.add(group);
  }

  private buildStreets(): void {
    const streets = STREETS_BY_SETTLEMENT[this.settlement.id];
    if (!streets?.length) return;

    const cx = toWorldX(this.settlement.center.x);
    const cz = toWorldZ(this.settlement.center.y);
    const mat = new THREE.MeshStandardMaterial({
      map: cobbleTexture(),
      // A shade cooler and darker than Emberhold's warm setts: these are wet
      // northern stone, and a street should read as older than the square.
      color: 0x8a8880,
      transparent: true,
      roughness: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    const group = new THREE.Group();
    const quad = (
      x0: number, z0: number, x1: number, z1: number, halfW: number,
    ) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.01) return;
      const g = new THREE.PlaneGeometry(len, halfW * 2);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.set((x0 + x1) / 2, 0.035, (z0 + z1) / 2);
      m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      m.renderOrder = 1;
      group.add(m);
    };

    const at = (r: number, deg: number) => {
      const a = (deg * Math.PI) / 180;
      return { x: cx + (Math.cos(a) * r) / PX_PER_UNIT, z: cz + (Math.sin(a) * r) / PX_PER_UNIT };
    };

    for (const st of streets) {
      const halfW = st.halfPx / PX_PER_UNIT;
      if (st.kind === "spoke") {
        const p0 = at(st.fromPx ?? 0, st.angleDeg ?? 0);
        const p1 = at(st.toPx ?? 0, st.angleDeg ?? 0);
        quad(p0.x, p0.z, p1.x, p1.z, halfW);
      } else {
        // An arc in eight-degree steps: short enough that the ring does not
        // read as a polygon, long enough not to be a thousand quads.
        const from = st.startDeg ?? 0;
        const to = st.endDeg ?? 0;
        for (let d = from; d < to; d += 8) {
          const p0 = at(st.radiusPx ?? 0, d);
          const p1 = at(st.radiusPx ?? 0, Math.min(d + 8, to));
          quad(p0.x, p0.z, p1.x, p1.z, halfW);
        }
      }
    }
    this.group.add(group);
  }

  private buildGround(): void {
    // ITS OWN CENTRE AND ITS OWN RADII. All three of these read Emberhold's,
    // so Coldharrow's paving was drawn eight thousand pixels south of
    // Coldharrow — on top of Emberhold's, at Emberhold's size — and the city
    // itself had bare grass between every building.
    const cx = toWorldX(this.settlement.center.x);
    const cz = toWorldZ(this.settlement.center.y);
    const radius = this.settlement.radiusPx / PX_PER_UNIT;
    // Stops just short of the buildings' front walls rather than running under
    // them: paving that reaches the palisade makes the whole enclosure one
    // surface, and the belt of grass between the houses and the wall is what
    // gives the gardens and the woodpile somewhere to be.
    //
    // Shared, because the ground-cover scatter has to keep out of exactly this
    // circle and no more — see the note on `TOWN_PAVED_RADIUS_PX`.
    const paveRadius = this.settlement.pavedRadiusPx / PX_PER_UNIT;

    // THE YARD, under everything else, out to the wall.
    //
    // Only where a settlement actually wants one. `coverRadiusPx` says how far
    // the meadow is suppressed; where that reaches further than the paving
    // there is a band with no grass and no cobbles, which is the city's yards
    // and back lanes and was bare terrain until now. Emberhold sets the two
    // equal, so it draws no yard and keeps its green exactly as it was.
    if (this.settlement.coverRadiusPx > this.settlement.pavedRadiusPx) {
      // Opaque past the wall, fading only outside it — hence the 0.94 rather
      // than the default 0.78, which would have left a ring of meadow between
      // the last houses and the curtain.
      const yardRadius = (this.settlement.coverRadiusPx / PX_PER_UNIT) * 1.06;
      const yard = new THREE.Mesh(
        ringedDisc(yardRadius, 96, [0, 0.55, 0.8, 0.94, 0.97, 1], 0.94),
        new THREE.MeshStandardMaterial({
          map: yardTexture(),
          color: 0x8e8d86,
          transparent: true,
          vertexColors: true,
          roughness: 1,
          depthWrite: false,
          // A weaker offset than the paving's and the streets', so both win
          // over this where they overlap it. Three surfaces at one height need
          // an order, and the order is: yard, then streets, then the square.
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      yard.rotation.x = -Math.PI / 2;
      yard.position.set(cx, 0.012, cz);
      yard.renderOrder = 0;
      yard.receiveShadow = true;
      yard.name = "town-yard";
      this.group.add(yard);
    }

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
    // Named so tooling can tell the ground decals apart from the things
    // standing on them — a check for "is anything floating" that counts the
    // paving as support passes no matter what is hovering over it.
    square.name = "town-paving";
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
      // The fade lives on the mesh now rather than in the image — see
      // `roadStrip`. An image can only taper across the axis it does not tile
      // on, which left the road's ENDS as razor cuts.
      vertexColors: true,
      roughness: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    // Wide enough to pass either side of the statue's island, and the width
    // comes from the shared constant the layout test walks — so "the road looks
    // wide enough" and "the road IS wide enough" cannot come apart.
    const roadWidth = (ROAD_HALF_WIDTH_PX * 2) / PX_PER_UNIT;

    // TWO ARMS THAT CROSSFADE WITH THE PAVING — not one plank through the middle.
    //
    // The comment that used to sit here said the road runs gate to gate and is
    // paved where it crosses the square, and drew it as a single 58-unit plane
    // under the plaza on the strength of the paving covering it. It did not.
    // What the player saw was a dark dirt band across the whole lower half of
    // the square with a hard edge along its far side, which this camera's
    // foreshortening stretched into a dead straight seam right across town.
    //
    // Cutting it at the paving fixed that and introduced a second, smaller
    // version of the same mistake: a butt joint where cobble met dirt, because
    // the fade was baked into the image and an image that tiles along the road
    // has no end to fade at. `roadStrip` tapers all four edges in vertex alpha
    // instead, and the inner taper is timed against the paving's own — the road
    // is still invisible where the plaza is solid and reaches full strength only
    // outside its rim, so the two hand over inside each other's fade.
    const roadOuter = radius * 1.45;
    // Starts well inside the plaza and is worth nothing until it is nearly out
    // of it. `paveRadius * 0.78` is exactly where the paving's own alpha starts
    // dropping (see `ringedDisc`).
    const roadInner = paveRadius * 0.78;
    const roadSolid = paveRadius * 1.16;
    const roadPetersOut = roadOuter - (roadOuter - roadSolid) * 0.4;
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(
        roadStrip(roadInner, roadOuter, roadWidth, roadSolid, roadPetersOut),
        roadMat,
      );
      arm.name = "town-road";
      // The strip is authored along +X in its own plane; lay it flat, then turn
      // it to point out of the gate this arm belongs to.
      arm.rotation.set(-Math.PI / 2, 0, side < 0 ? Math.PI : 0);
      arm.position.set(cx, 0.02, cz);
      arm.receiveShadow = true;
      arm.renderOrder = 1;
      this.group.add(arm);
    }

    // The island the statue stands on, laid over both. Radial flagstones, so
    // the middle of the square reads as a place the paving was arranged AROUND
    // rather than as a plinth dropped onto a car park.
    const statue = propById("statue")!;
    const at = propPosition(statue);
    const island = new THREE.Mesh(
      new THREE.CircleGeometry((statue.blockRadiusPx * 1.85) / PX_PER_UNIT, 48),
      new THREE.MeshStandardMaterial({
        map: islandTexture(),
        color: 0xa79c8c,
        transparent: true,
        roughness: 1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    // The back lane's own worn earth, between the houses and the wall. Laid
    // before the island so the ordering reads outward: road, paving, lane,
    // island — and drawn under everything standing in it.
    // Its own copy of the rutted earth, with the repeat turned OFF: the road's
    // texture carries `repeat.set(26, 1)` because a road is one long quad with
    // 0..1 UVs, and `beltPath` already writes world-scale UVs of its own. Left
    // as it came, the two multiplied out to three hundred and seventy tiles
    // round the ring and the lane aliased into flat noise — which read as
    // nothing at all.
    const laneTex = roadTexture();
    laneTex.repeat.set(1, 1);
    const lane = new THREE.Mesh(
      beltPath((TOWN_PAVED_RADIUS_PX * 1.16) / PX_PER_UNIT, (TOWN_RADIUS_PX * 0.97) / PX_PER_UNIT),
      new THREE.MeshStandardMaterial({
        map: laneTex,
        color: 0x6f6047,
        transparent: true,
        vertexColors: true,
        roughness: 1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    lane.name = "town-lane";
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(cx, 0.025, cz);
    lane.receiveShadow = true;
    lane.renderOrder = 1;
    this.group.add(lane);

    island.name = "town-island";
    island.rotation.x = -Math.PI / 2;
    island.position.set(toWorldX(at.x), 0.04, toWorldZ(at.y));
    island.receiveShadow = true;
    island.renderOrder = 3;
    this.group.add(island);
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
    // ITS OWN RADIUS. This read `TOWN_RADIUS_PX` — Emberhold's 800 — which for
    // a city of 2,600 meant the fill light and the square glow faded out four
    // fifths of the way in from the wall, so most of Coldharrow was lit as
    // though the player were standing outside it.
    const radius = this.settlement.radiusPx / PX_PER_UNIT;
    // Full strength inside the wall, gone by half a radius past it.
    const nearness = Math.max(0, Math.min(1, 1 - (distanceFromCentre - radius) / (radius * 0.5)));
    const eased = nearness * nearness * (3 - 2 * nearness);

    this.townFill.intensity = night * 0.7 * eased;
    this.squareGlow.intensity = night * 34 * Math.max(eased, 0.25);

    // AND THE OTHER TOWN'S LIGHTS ARE TURNED OFF ENTIRELY.
    //
    // Every settlement is built at load and lives in the scene for the whole
    // session, so their lights are in the renderer's list wherever the player
    // happens to be standing. Three.js uploads every visible light to every lit
    // material's uniforms and loops all of them per fragment — so Emberhold's
    // six were being paid for on Coldharrow's quay, and Coldharrow's twenty-one
    // were being paid for in Emberhold's square, four hundred units away and
    // behind the horizon.
    //
    // `visible = false` takes a light out of the render list altogether. That
    // changes the shader program and costs a recompile, which is exactly the
    // stall this is meant to avoid — so the switch has a WIDE HYSTERESIS BAND
    // and flips at most once per approach, rather than on the distance test
    // used for the fill light, which changes every frame as the player walks.
    const wantLights = distanceFromCentre < radius * (this.lightsOn ? 3.4 : 2.6);
    if (wantLights !== this.lightsOn) {
      this.lightsOn = wantLights;
      for (const l of this.lanterns) {
        if (l.light) l.light.visible = wantLights;
        if (l.glow) l.glow.visible = wantLights;
      }
    }

    // Lanterns are lit by the hour alone, not by where the player is: a town
    // that only lights up once you are inside it is a town with nothing to walk
    // toward.
    const lit = night;
    // The braziers, on the same `lit` the lanterns and the windows take, so
    // everything warm in town comes up together.
    this.flames?.update(timeSeconds, lit);
    for (const l of this.lanterns) {
      const flicker =
        0.86 +
        Math.sin(timeSeconds * 6.1 + l.phase) * 0.09 +
        Math.sin(timeSeconds * 2.3 + l.phase * 2) * 0.05;
      if (l.light) l.light.intensity = lit * 12 * flicker * l.strength;
      if (!l.glow) continue;
      // `wantLights` wins: a glow ball in a town the player is nowhere near is
      // a draw call for something over the horizon.
      l.glow.visible = wantLights && lit > 0.04;
      if (l.glow.visible) l.glow.scale.setScalar(0.85 + flicker * 0.3);
    }

    // Every pane in town. A loop rather than one assignment, because the
    // buildings own their materials so that they can be faded one at a time.
    for (const glass of litGlass) glass.emissiveIntensity = lit * 1.15;

    // The harbour. Backwards from the windows on purpose: a lit pane is a
    // thing somebody switched on and belongs to the dark, whereas the ice is
    // only ever catching the sky. So it emits a little at night — enough that
    // the basin stays a surface rather than a hole — and nothing by day, when
    // the sun is doing the work and any emissive at all turns it to paper.
    for (const ice of this.iceSurfaces) ice.emissiveIntensity = lit * 0.55;
  }
}
