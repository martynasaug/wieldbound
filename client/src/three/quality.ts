// GRAPHICS QUALITY, because the rest of the frame cost is a matter of taste.
//
// M70.28 removed the waste — geometry drawn at a distance where it could not
// be seen — and that needed nobody's opinion: nothing looked different and the
// far half of the world stopped being submitted. What is left is not waste.
// A 2048x2048 soft shadow map, a device pixel ratio of 2, and multisampling
// are all things somebody is PAYING for and getting something back for, and
// the exchange rate depends entirely on the machine and the person.
//
// So this is a setting rather than a decision. Three levels, cycled with F4,
// remembered per browser. The profiler (F3) is the other half of it: between
// them a player can see what a level costs them and choose, which is a better
// answer than any single default this file could have picked.
//
// What each knob actually does, so the levels below are readable:
//
//   PIXEL RATIO is the biggest single lever on a high-DPI screen and the least
//   obvious, because it is invisible in every counter: at a ratio of 2 the GPU
//   shades FOUR times as many fragments as at 1 for exactly the same draw
//   calls and triangles. On a 1x display it changes nothing at all, which is
//   why it cannot simply be turned down for everyone.
//
//   SHADOW MAP SIZE is a whole extra render of every casting object, into a
//   texture whose area grows with the square. 2048 -> 1024 quarters that
//   texture and softens contact shadows; turning it off entirely is a large
//   win and a large loss, so it is only at the bottom level.
//
//   SHADOW FILTER is deliberately NOT a knob here, and the reason is worth
//   keeping: PCFSoftShadowMap is DEPRECATED in this version of three.js —
//   WebGLShadowMap.render warns and reassigns itself to PCFShadowMap on the
//   first frame. A setting for it would read correctly, apply silently, and
//   change nothing, which is the same reason antialias is absent.
//
//   CULL SCALE multiplies M70.28's distance radii. Below 1 the world closes in
//   around the player; it is last because it is the only one that changes what
//   is THERE rather than how it is drawn.
//
//   ANTIALIAS was hardcoded `true` at the renderer's construction until M70.45
//   — invisible to this file even though MSAA is exactly the kind of cost the
//   other four knobs are: nothing about it is waste, it is a fixed multiple of
//   fill-rate work a low-end or integrated GPU pays for every single pixel,
//   every single frame, whether or not the player has ever opened this menu.
//   Unlike the other knobs it cannot change live — WebGL fixes the sample
//   count at context creation — so it is read once, from whatever quality was
//   loaded before the renderer existed, and a level switched via F4 mid-session
//   takes effect on the next page load rather than the next frame.

export type QualityLevel = "high" | "balanced" | "performance";

export interface QualitySettings {
  label: string;
  /** What the browser's own devicePixelRatio is clamped to. */
  pixelRatioCap: number;
  /**
   * MSAA at the renderer. Fixed for the life of the renderer — see the note
   * above; a quality switched live keeps its OLD antialias setting until the
   * page reloads, since WebGL cannot change sample count on an open context.
   */
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Multiplies the ground-cover and tree cull radii. */
  cullScale: number;
  /**
   * Re-render the shadow map every N frames. 1 is every frame.
   *
   * The shadow pass is a COMPLETE second render of every casting object in the
   * frustum, and it runs at full frame rate whether or not anything moved. Most
   * of what casts here is scenery that will not move for the life of the world;
   * the things that do move are a handful of characters. At 2 their shadows
   * update thirty times a second, which on a soft 1024 map under a top-down
   * camera is not something you can see, and it halves the pass.
   */
  shadowEveryNFrames: number;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  // What the game has always rendered at. Unchanged on purpose: somebody whose
  // machine is fine should see no difference from before this file existed.
  high: {
    label: "High",
    pixelRatioCap: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    cullScale: 1,
    shadowEveryNFrames: 1,
  },
  // The one that should be most people's answer. Everything is still here and
  // still shadowed; the expensive halves of three separate knobs are not.
  balanced: {
    label: "Balanced",
    pixelRatioCap: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    cullScale: 0.8,
    shadowEveryNFrames: 2,
  },
  // For a machine that cannot hold a frame. Shadows go entirely — it is the
  // single biggest saving available and there is no point pretending it is
  // subtle — and the pixel ratio drops to native. MSAA goes with it: it is
  // full-scene fill-rate work paid on every pixel of every frame, which is
  // exactly the kind of fixed tax a machine that cannot hold a frame cannot
  // afford, and losing it here costs a soft edge rather than a system.
  performance: {
    label: "Performance",
    pixelRatioCap: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    cullScale: 0.62,
    shadowEveryNFrames: 0,
  },
};

export const QUALITY_ORDER: QualityLevel[] = ["high", "balanced", "performance"];

const KEY = "wieldbound.quality";

/**
 * Remembered per browser, like the camera distance already is.
 *
 * Defaults to `balanced` rather than to `high`: the reading this was written
 * from was 32fps on a machine its owner describes as not low-end, so `high`
 * is demonstrably the wrong thing to hand somebody who has never opened the
 * setting. Anyone who wants the old picture back is one keypress away and can
 * see on F3 what it costs.
 */
export function loadQuality(): QualityLevel {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && (QUALITY_ORDER as string[]).includes(raw)) return raw as QualityLevel;
  } catch {
    // Private windows and blocked site data both throw here rather than
    // returning null. A default is a perfectly good answer.
  }
  return "balanced";
}

export function saveQuality(level: QualityLevel): void {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
}

export function nextQuality(level: QualityLevel): QualityLevel {
  return QUALITY_ORDER[(QUALITY_ORDER.indexOf(level) + 1) % QUALITY_ORDER.length];
}

/**
 * Whether the shadow map should be re-rendered this frame.
 *
 * Pulled out as a pure function purely so it can be tested: it encodes a
 * three.js behaviour that is invisible from the call site and produced a real
 * GPU error the first time it was written by hand.
 *
 * `WebGLShadowMap.render` bails on `autoUpdate === false && needsUpdate ===
 * false` BEFORE it allocates `light.shadow.map`. Every material in the scene
 * compiles against `shadowMap.enabled`, so they all carry a `sampler2DShadow`
 * — and with no map to bind they draw against the renderer's default empty
 * texture, which is a GL_INVALID_OPERATION per draw call:
 *
 *   Mismatch between texture format and sampler type (signed/unsigned/float/shadow)
 *
 * So `hasMap` is not an optimisation, it is the correctness condition: the
 * schedule may only start skipping frames once there is a map worth keeping.
 */
export function shadowSchedule(
  hasMap: boolean,
  tick: number,
  interval: number,
): { tick: number; needsUpdate: boolean } {
  // Interval 0 means shadows are off entirely and 1 means every frame, which
  // three.js does on its own through `autoUpdate`. Neither skips anything.
  if (interval <= 1) return { tick: 0, needsUpdate: true };
  if (!hasMap) return { tick: 0, needsUpdate: true };
  const next = (tick + 1) % interval;
  return { tick: next, needsUpdate: next === 0 };
}
