// A GARMENT IN THE COLOUR OF THE ITEM IT IS.
//
// Three chest styles — `robe`, `plate` and `leather` — are the pack's own
// costumes worn as items, and they carry the donor's painted atlas. That is what
// makes them the best-looking armour in the game and, until now, the only armour
// that ignored its own palette entirely: a Gilded Plate, a Blackened Plate and a
// Crimson Plate were the same pixels. Seventeen chest items in the catalogue, and
// three styles of them had one appearance each.
//
// Every other item answers to `PALETTES` through `repaint`, which works because a
// procedural item is built from NAMED materials — Steel, Gold, Wood — that can
// each be handed a colour. A garment has no such seams: it is one surface with a
// painting on it, and there is nothing to hand a colour to.
//
// SO THE PAINTING IS RECOLOURED, WHICH IS THE LESSON `skin.ts` ALREADY PAID FOR.
// A multiply over the material cannot work: these atlases mean 0.197 to 0.233, so
// multiplying by a palette only makes a dark garment darker, and a pale palette
// like Bone or Frost is unreachable by construction. The texture's pixels are
// transformed instead — hue taken from the palette, saturation mostly from it,
// and LIGHTNESS KEPT, because the lightness is the painting: the folds, the
// seams, the shadow under a collar. Change it and the garment stops being a
// photograph of cloth and becomes a silhouette in a new colour.
//
// One canvas pass per (garment, palette), cached for the session. Thirteen
// palettes across four garments is fifty-two possible textures and in practice a
// handful: a player wears what they have.

import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)];
}

/**
 * How much of the palette's own saturation the garment takes.
 *
 * Not all of it. A costume painted at one saturation throughout would lose the
 * difference between its leather and its cloth, which is half of what makes
 * these read as clothing rather than as a dyed sack — so the atlas keeps a third
 * of its own variation and the palette supplies the rest.
 */
const TAKE = 0.68;

/**
 * The garment's atlas, recoloured towards one palette colour.
 *
 * Returns the original if the image has not decoded or a canvas refuses to give
 * its pixels back. A garment in the wrong colour is a disappointment; a garment
 * with no texture is a white silhouette, and the fallback has to be the first.
 */
export function tintedGarment(base: THREE.Texture, hex: number, key: string): THREE.Texture {
  const cached = cache.get(key);
  if (cached) return cached;

  const image = base.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!image || !width || !height) return base;

  const target = new THREE.Color(hex);
  const [th, ts] = rgbToHsl(target.r, target.g, target.b);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return base;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const [, s, l] = rgbToHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      // A NEARLY GREY PIXEL KEEPS ITS HUE ALONE. Buckles, steel fittings and the
      // whites of a trim carry almost no saturation, and forcing the palette's
      // hue onto them paints the metalwork the same colour as the cloth — which
      // is exactly the flat single-colour look this exists to avoid.
      const pull = Math.min(1, s * 4);
      const [r, g, b] = hslToRgb(
        th,
        Math.min(1, s * (1 - TAKE * pull) + ts * TAKE * pull),
        l,
      );
      d[i] = r * 255;
      d[i + 1] = g * 255;
      d[i + 2] = b * 255;
    }
    ctx.putImageData(pixels, 0, 0);

    const out = new THREE.CanvasTexture(canvas);
    // EVERYTHING THE ORIGINAL CARRIED. A CanvasTexture defaults to flipY true
    // and no colour space, and either wrong is a garment rendered upside down or
    // washed out — the same one-line omission `skin.ts` has a note about.
    out.colorSpace = base.colorSpace;
    out.flipY = base.flipY;
    out.wrapS = base.wrapS;
    out.wrapT = base.wrapT;
    out.magFilter = base.magFilter;
    out.minFilter = base.minFilter;
    out.anisotropy = base.anisotropy;
    out.needsUpdate = true;
    cache.set(key, out);
    return out;
  } catch {
    return base;
  }
}
