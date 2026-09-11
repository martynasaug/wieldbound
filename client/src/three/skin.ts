// DIFFERENT SKIN, NOT THE SAME SKIN DARKER.
//
// The body is one mesh with one painted 1024x1024 texture, and until now a
// character's colouring was `material.color.multiply(tint)`. A multiply can
// only ever DARKEN: the texture's own browns are the ceiling, so the palest
// setting produced the model exactly as shipped and every other setting
// produced the same model with the lights turned down. Reported as the
// characters all looking like the standard Monk, which was precisely true —
// there was no axis on which they differed except brightness.
//
// So the texture itself is recoloured. Each skin tone is a hue, saturation and
// lightness transform applied to every pixel once, producing a variant texture
// that the material then uses as its map. That can go LIGHTER, which is the
// whole point, and it can shift hue, which is what makes a warm tone different
// from a cool one rather than merely paler.
//
// IT RECOLOURS THE CLOTHING TOO, and that is a consequence of one mesh with one
// texture rather than a decision. It is also not a bad one: the robe shifts
// with the wearer, so characters differ in two ways at once instead of sharing
// a uniform. What it cannot do is give one character dark skin and a pale robe,
// and that limit belongs to the model.
//
// ONE CANVAS PASS PER TONE, CACHED FOR THE SESSION. Eight tones against a
// million pixels is eight million operations if every one is used, which at
// startup would be visible; lazily, it is a few milliseconds the first time a
// tone appears and nothing ever again. Two players sharing a tone share the
// texture, which also keeps the upload count at the number of tones rather than
// the number of people.

import * as THREE from "three";

/** A skin tone as a transform of the body texture, rather than as a colour. */
export interface SkinTone {
  id: string;
  /** Turns of the hue wheel, 0..1. Small numbers: skin is a narrow band. */
  hueShift: number;
  /** Multiplies saturation. Below 1 washes out, above 1 deepens. */
  saturation: number;
  /**
   * Where this tone's MEAN lightness lands, 0..1.
   *
   * The texture is re-centred on this rather than shifted by an offset, and the
   * difference is the whole of a bug worth recording. An offset of -0.24 on a
   * texture whose mean is 0.36 leaves 0.12, with the painted shadows below it
   * clamped flat at zero — a character with no face, no fold in the robe and no
   * edge between arm and chest. That was the first dark tone here and it looked
   * like a hole in the world, which is the same complaint as the one that
   * started this work, arrived at from the opposite direction.
   */
  target: number;
  /**
   * How much of the texture's own light and shade survives the re-centring.
   *
   * Below 1 compresses it. The dark tones need that: there is less headroom
   * below 0.2 than there is around 0.5, so the same spread that reads as
   * modelling on pale skin reads as blotches on deep skin.
   */
  contrast: number;
}

/**
 * The body texture's own mean lightness — MEASURED, not assumed.
 *
 * Dumped from `Monk_Texture.png`: the dominant colours are a cluster of browns
 * around #6b543a, and the whole image averages to roughly this. Every tone is
 * expressed as a move away from it.
 */
const BASE_MEAN = 0.36;

/**
 * Eight tones, spread across LIGHTNESS first.
 *
 * Lightness is the channel that survives fog, dusk, shadow and ninety pixels;
 * hue is the one everybody reaches for and the one that reads least. The hue
 * shifts move WITH the lightness the way real skin does — pale skin is pink,
 * mid tones are yellow-olive, deep tones are red-brown — because a palette that
 * only changes brightness looks like one person under eight lighting rigs.
 *
 * THE RANGE STOPS SHORT OF BOTH ENDS, 0.24 to 0.72 rather than 0.05 to 0.95.
 * Three times the lightness from end to end is already an unmistakable
 * difference between two characters standing together, and the last stop in
 * either direction buys nothing but a silhouette or a ghost: detail dies at
 * both ends, and detail is what makes a character look like a person rather
 * than a shape.
 */
// THE PALE END WAS GREY, and seen side by side in the creator it looked like a
// statue rather than a person. The body texture is a low-saturation brown (HSL
// saturation about 0.3), and porcelain multiplied that by 0.55: a lightness of
// 0.62 with almost no colour in it is khaki-grey, whatever the hue. Pale skin is
// peach — about as saturated as the brown it started from, much lighter, and a
// little towards pink.
//
// AND THEN IT WAS ORANGE. The first correction multiplied saturation by 1.7,
// which in HSL at a lightness of 0.6 is terracotta: porcelain and fair came out
// as the same sunburn and neither read lighter than olive. The saturation that
// reads as pale skin is close to the texture's own (~0.33); what makes it pale
// is the LIGHTNESS, so that is where the range lives now.
export const SKIN_TONES: SkinTone[] = [
  { id: "porcelain", hueShift: -0.03, saturation: 1.1, target: 0.72, contrast: 0.9 },
  { id: "fair", hueShift: -0.025, saturation: 1.1, target: 0.64, contrast: 0.95 },
  { id: "light", hueShift: -0.015, saturation: 1.05, target: 0.56, contrast: 1.0 },
  { id: "olive", hueShift: -0.020, saturation: 0.95, target: 0.44, contrast: 1.0 },
  { id: "tan", hueShift: -0.008, saturation: 1.05, target: 0.39, contrast: 1.0 },
  { id: "bronze", hueShift: -0.016, saturation: 1.12, target: 0.33, contrast: 0.92 },
  { id: "umber", hueShift: -0.010, saturation: 1.08, target: 0.27, contrast: 0.82 },
  // Lifted from 0.21: at full figure the body read as a black silhouette.
  { id: "ebony", hueShift: -0.004, saturation: 1.0, target: 0.24, contrast: 0.74 },
];

/** Roughly how light this tone comes out, for keeping hair off the skin. */
export function toneLightness(tone: SkinTone): number {
  return tone.target;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * How much a texel of the body texture is SKIN, 0..1, from its hue, saturation
 * and lightness.
 *
 * THE ROBE CHANGED COLOUR WITH THE SKIN, and so did the beard, and it was the
 * player who pointed it out. The Monk is one mesh painted from one texture:
 * skin, the olive robe panels, the near-black cloth and the pale wraps all share
 * it, so a transform over every pixel recoloured all of them.
 *
 * Hue alone cannot tell them apart — the whole texture sits between 27 and 42
 * degrees. Measured from the texture itself (a hue x lightness histogram of
 * every fourth pixel), the classes separate on all three channels together:
 *
 *     skin         hue ~30   lightness 25-35%   saturation 0.25-0.29
 *     olive robe   hue 36-39 lightness 30-40%   saturation 0.24-0.29
 *     dark cloth   hue 36-39 lightness 15-20%   saturation ~0.15
 *     pale wraps   hue 33-36 lightness 45-60%   saturation ~0.14
 *
 * So skin is warm, saturated and mid-lit, and each edge is a soft ramp rather
 * than a cut, because a hard threshold on a painted texture leaves speckle
 * where the brush strokes cross it. `tools/soak/skinmask.mjs` draws this
 * function over the texture so the boundary can be seen, not assumed.
 */
export function skinWeight(h: number, s: number, l: number): number {
  const hueDeg = h * 360;
  const hue = 1 - smoothstep(33, 37, hueDeg);
  const saturation = smoothstep(0.15, 0.21, s);
  const dark = smoothstep(0.15, 0.22, l);
  const pale = 1 - smoothstep(0.46, 0.56, l);
  return hue * saturation * dark * pale;
}

/** A tone by its wire id (`shared/look.ts`). Unknown ids get a middle tone rather than a throw. */
export function toneById(id: string): SkinTone {
  return SKIN_TONES.find((t) => t.id === id) ?? SKIN_TONES[3];
}

/**
 * One flat colour standing in for a whole recoloured texture: the body's
 * dominant painted brown (#6b543a, see `BASE_MEAN`) run through the same
 * transform `recolour` applies to every pixel.
 *
 * For the pieces of a face that are geometry rather than texture — a nose, a
 * pair of ears — and for the creator's swatches, so the swatch you click is
 * the colour the body turns.
 */
export function toneSwatchRgb(tone: SkinTone): [number, number, number] {
  const [h, s, l] = rgbToHsl(0x6b / 255, 0x54 / 255, 0x3a / 255);
  return hslToRgb(
    (h + tone.hueShift + 1) % 1,
    clamp01(s * tone.saturation),
    clamp01(tone.target + (l - BASE_MEAN) * tone.contrast),
  );
}

export function toneSwatch(tone: SkinTone): THREE.Color {
  const [r, g, b] = toneSwatchRgb(tone);
  return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
}

export function toneCss(tone: SkinTone): string {
  const [r, g, b] = toneSwatchRgb(tone);
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/**
 * The texture each material was built with, before any tone touched it.
 *
 * A look can change while the game runs now, and `applySkin` replaces
 * `mat.map` with its recoloured canvas — so without remembering the original,
 * the second tone would be computed from the FIRST tone's pixels, and every
 * change after it would compound. A WeakMap rather than `userData`, because
 * material clones copy `userData` through JSON and a texture does not survive it.
 */
const originalMaps = new WeakMap<THREE.Material, THREE.Texture>();

const cache = new Map<string, THREE.Texture>();

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

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
 * The body texture recoloured for one skin tone, or null if it cannot be yet.
 *
 * Null means the source image has not decoded — see `applySkin`, which is what
 * callers should use.
 */
function recolour(base: THREE.Texture, tone: SkinTone): THREE.Texture | null {
  const cached = cache.get(tone.id);
  if (cached) return cached;

  const image = base.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (!image || !width || !height) return null;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const [h, sat, l] = rgbToHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      // ONLY THE SKIN. See `skinWeight`: the robe, the wraps and the dark cloth
      // are painted into this same texture, and recolouring all of it changed a
      // character's clothes whenever they changed their skin.
      const w = skinWeight(h, sat, l);
      if (w <= 0) continue;
      const [r, g, b] = hslToRgb(
        (h + tone.hueShift + 1) % 1,
        clamp01(sat * tone.saturation),
        clamp01(tone.target + (l - BASE_MEAN) * tone.contrast),
      );
      d[i] = d[i] + (r * 255 - d[i]) * w;
      d[i + 1] = d[i + 1] + (g * 255 - d[i + 1]) * w;
      d[i + 2] = d[i + 2] + (b * 255 - d[i + 2]) * w;
    }
    ctx.putImageData(pixels, 0, 0);

    const out = new THREE.CanvasTexture(canvas);
    // EVERYTHING THE ORIGINAL WAS SET TO. A CanvasTexture defaults to flipY
    // true and to no colour space, and either of those wrong is a body that
    // renders upside down or washed out — a whole-character fault out of a
    // one-line omission.
    out.colorSpace = base.colorSpace;
    out.flipY = base.flipY;
    out.wrapS = base.wrapS;
    out.wrapT = base.wrapT;
    out.magFilter = base.magFilter;
    out.minFilter = base.minFilter;
    out.anisotropy = base.anisotropy;
    out.needsUpdate = true;
    cache.set(tone.id, out);
    return out;
  } catch {
    return null;
  }
}

/**
 * Give a material the body texture in one skin tone.
 *
 * RETRIES, BECAUSE THE TEXTURE ARRIVES LATE. The model and its texture load
 * independently: the FBX can be parsed, instantiated and dressed onto a
 * character while `Monk_Texture.png` is still in flight, and a canvas cannot
 * read pixels out of an image that has not decoded. Recolouring once at build
 * time would therefore work or not work depending on network timing, which is
 * the kind of bug that is invisible on a local dev server and universal for
 * everyone else.
 *
 * So a failed attempt is retried on later frames rather than abandoned. The cap
 * exists because a texture that 404s never decodes, and a retry that never
 * stops would poll for the life of the session.
 */
export function applySkin(mat: THREE.MeshStandardMaterial, tone: SkinTone): void {
  if (mat.map && !originalMaps.has(mat)) originalMaps.set(mat, mat.map);
  const base = originalMaps.get(mat) ?? mat.map;
  if (!base) {
    // No texture to recolour — a flat-coloured material, which some bodies do
    // have. A multiply is all that is available, and it is enough: a flat
    // colour has no painted detail for it to flatten.
    mat.color.multiplyScalar(clamp01(tone.target / BASE_MEAN));
    mat.needsUpdate = true;
    return;
  }

  let tries = 0;
  const attempt = () => {
    // The material may have been swapped or the actor torn down while this was
    // waiting. Re-reading `mat.map` rather than closing over the old one keeps
    // it from resurrecting a texture the actor has moved on from.
    if (!mat.map) return;
    const out = recolour(originalMaps.get(mat) ?? mat.map, tone);
    if (out) {
      mat.map = out;
      // The colour stays white under a map: the recolour lives in the pixels
      // now, and a multiply on top would apply it a second time.
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
      return;
    }
    if (++tries > MAX_TRIES) return;
    requestAnimationFrame(attempt);
  };
  attempt();
}

/** About four seconds of frames. See `applySkin`. */
const MAX_TRIES = 240;
