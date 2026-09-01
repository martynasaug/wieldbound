// THE GROUND, UNDER THE BLIPS.
//
// The minimap used to be a flat olive disc. Everything on it was a dot, and the
// map itself said nothing: you could not see the river you were about to walk
// into, the road you were trying to find, the forest you were standing in, or
// the town you were heading home to. A map whose entire content is "here are
// some dots relative to you" is a radar, not a map.
//
// Everything needed to draw the real thing is already in `shared/` and is pure
// arithmetic — no renderer, no assets, no server round trip — so the map can be
// drawn from the same functions that decide where the river and the road
// actually are. What the player sees is therefore what the world IS, rather than
// a second description of it that can drift.
//
// RENDERED INCREMENTALLY, AND THAT IS THE WHOLE DESIGN CONSTRAINT. Sampling
// terrain is not free: `distanceToRoad` and `distanceToRiver` each walk a
// polyline, and doing that for every cell of a tile in one frame is exactly the
// sort of 100ms stall this phase has spent weeks removing. So the tile is built
// a few rows per frame into an offscreen canvas and swapped in only when
// finished; until then the previous tile keeps being drawn, slightly stale and
// perfectly acceptable. Nothing here can produce a spike, by construction.
//
// The tile covers more ground than the view, so ordinary walking pans across an
// already-built image and only a large move or a zoom change starts a rebuild.

import { WORLD_WIDTH, WORLD_HEIGHT } from "../../../shared/protocol-types";
import { TOWN_CENTER, TOWN_RADIUS_PX, TOWN_PAVED_RADIUS_PX } from "../../../shared/town";
import { ROAD_HALF_WIDTH_PX, distanceToRoad } from "../../../shared/road";
import { RIVER_HALF_WIDTH_PX, distanceToRiver } from "../../../shared/river";
import { forestStrengthAt } from "../../../shared/forests";

/** Resolution of the offscreen tile. 128 is enough at every map size the
 *  settings offer — the tile is scaled up and the result reads as ground rather
 *  than as pixels, which is what a minimap wants. */
const TILE = 128;
/** How much wider than the visible circle the tile is. Walking pans within it;
 *  only leaving the margin triggers a rebuild. */
const TILE_OVERSCAN = 1.9;
/** Rows built per frame. At 128 rows a full tile takes about a second and a half
 *  of walking, and costs well under a millisecond a frame. */
const ROWS_PER_FRAME = 6;

/** Terrain colours, in the same register as the rest of the interface. */
const C = {
  water: [46, 82, 120],
  shallow: [66, 108, 142],
  road: [122, 101, 68],
  paving: [104, 99, 88],
  townDirt: [96, 84, 62],
  grass: [74, 92, 52],
  grassLit: [88, 106, 60],
  forest: [42, 62, 38],
  forestDeep: [32, 50, 32],
} as const;

const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * The colour of the ground at one point, in SERVER PIXELS.
 *
 * Order matters and is the order things are actually layered in the world: the
 * river cuts through everything, the road is laid over the ground, the town is
 * paved, and forest darkens whatever is left.
 */
function groundAt(px: number, py: number): [number, number, number] {
  if (px < 0 || py < 0 || px > WORLD_WIDTH || py > WORLD_HEIGHT) return [26, 24, 20];

  const river = distanceToRiver(px, py);
  if (river < RIVER_HALF_WIDTH_PX) {
    // Shallower at the edges, so the bank reads as a bank.
    const t = Math.min(1, river / RIVER_HALF_WIDTH_PX);
    return mix(C.water, C.shallow, t * t);
  }

  const road = distanceToRoad(px, py);
  const townR = Math.hypot(px - TOWN_CENTER.x, py - TOWN_CENTER.y);

  let base: [number, number, number];
  if (townR < TOWN_PAVED_RADIUS_PX) {
    base = [...C.paving] as [number, number, number];
  } else if (townR < TOWN_RADIUS_PX) {
    base = mix(C.paving, C.townDirt, (townR - TOWN_PAVED_RADIUS_PX) / (TOWN_RADIUS_PX - TOWN_PAVED_RADIUS_PX));
  } else {
    // A little variation so open country is not one flat block of colour.
    const n = Math.sin(px * 0.0021) * Math.cos(py * 0.0017);
    base = mix(C.grass, C.grassLit, (n + 1) / 2);
  }

  if (road < ROAD_HALF_WIDTH_PX) {
    const t = Math.min(1, road / ROAD_HALF_WIDTH_PX);
    base = mix(C.road, base, t * t);
  } else {
    // Forest only outside the road, so the highway stays legible through it.
    const strength = forestStrengthAt(px, py);
    if (strength > 0.02) {
      const deep = mix(C.forest, C.forestDeep, Math.min(1, strength));
      base = mix(base, deep, Math.min(1, strength * 1.25));
    }
  }
  return base;
}

/** A tile of drawn ground, and where it sits in the world. */
interface Tile {
  canvas: HTMLCanvasElement;
  /** Centre, in server pixels, and how many server pixels across the tile is. */
  cx: number;
  cy: number;
  spanPx: number;
}

export class MinimapTerrain {
  private ready: Tile | null = null;
  private building: (Tile & { row: number; image: ImageData }) | null = null;
  private readonly ctxCache = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();

  private context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    let ctx = this.ctxCache.get(canvas);
    if (!ctx) {
      ctx = canvas.getContext("2d")!;
      this.ctxCache.set(canvas, ctx);
    }
    return ctx;
  }

  /**
   * Called once a frame. Starts a tile when the view has drifted out of the one
   * in hand, and otherwise advances whatever is being built by a few rows.
   *
   * `centreX/centreY` and `viewSpanPx` are all in server pixels.
   */
  update(centreX: number, centreY: number, viewSpanPx: number): void {
    const wantSpan = viewSpanPx * TILE_OVERSCAN;
    const have = this.building ?? this.ready;
    const spanChanged = !have || Math.abs(have.spanPx - wantSpan) / wantSpan > 0.2;
    const drifted =
      !have || Math.hypot(centreX - have.cx, centreY - have.cy) > (have.spanPx - viewSpanPx) * 0.42;

    if (!this.building && (spanChanged || drifted)) {
      const canvas = document.createElement("canvas");
      canvas.width = TILE;
      canvas.height = TILE;
      this.building = {
        canvas,
        cx: centreX,
        cy: centreY,
        spanPx: wantSpan,
        row: 0,
        image: this.context(canvas).createImageData(TILE, TILE),
      };
    }

    const b = this.building;
    if (!b) return;
    const step = b.spanPx / TILE;
    const left = b.cx - b.spanPx / 2;
    const top = b.cy - b.spanPx / 2;
    const endRow = Math.min(TILE, b.row + ROWS_PER_FRAME);
    for (let row = b.row; row < endRow; row++) {
      const py = top + (row + 0.5) * step;
      for (let col = 0; col < TILE; col++) {
        const px = left + (col + 0.5) * step;
        const [r, g, bl] = groundAt(px, py);
        const i = (row * TILE + col) * 4;
        b.image.data[i] = r;
        b.image.data[i + 1] = g;
        b.image.data[i + 2] = bl;
        b.image.data[i + 3] = 255;
      }
    }
    b.row = endRow;
    if (b.row >= TILE) {
      this.context(b.canvas).putImageData(b.image, 0, 0);
      this.ready = { canvas: b.canvas, cx: b.cx, cy: b.cy, spanPx: b.spanPx };
      this.building = null;
    }
  }

  /**
   * Draws the ground under everything else. `project` maps server pixels to map
   * pixels, so rotation and zoom are the caller's business and this stays a
   * picture being placed rather than a second projection to keep in step.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    project: (px: number, py: number) => [number, number],
    rotation: number,
  ): boolean {
    const tile = this.ready;
    if (!tile) return false;
    const [cx, cy] = project(tile.cx, tile.cy);
    const [ex] = project(tile.cx + tile.spanPx / 2, tile.cy);
    const [, ey] = project(tile.cx, tile.cy + tile.spanPx / 2);
    // Half-width and half-height on screen, taken from the projected extents so
    // this cannot disagree with the blips about how far a pixel is.
    const halfW = Math.hypot(ex - cx, 0) || 1;
    const halfH = Math.hypot(0, ey - cy) || 1;
    const span = Math.max(halfW, halfH) * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tile.canvas, -span / 2, -span / 2, span, span);
    ctx.restore();
    return true;
  }
}
