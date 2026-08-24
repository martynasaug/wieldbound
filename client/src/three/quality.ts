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
//   SHADOW FILTER: PCFSoft samples the map many more times per fragment than
//   PCF. It is the cheapest quality to give up — the shadows stay in the same
//   places, their edges just get crisper.
//
//   CULL SCALE multiplies M70.28's distance radii. Below 1 the world closes in
//   around the player; it is last because it is the only one that changes what
//   is THERE rather than how it is drawn.

export type QualityLevel = "high" | "balanced" | "performance";

export interface QualitySettings {
  label: string;
  /** What the browser's own devicePixelRatio is clamped to. */
  pixelRatioCap: number;
  shadows: boolean;
  shadowMapSize: number;
  /** True for PCFSoft, false for plain PCF. */
  softShadows: boolean;
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
    shadows: true,
    shadowMapSize: 2048,
    softShadows: true,
    cullScale: 1,
    shadowEveryNFrames: 1,
  },
  // The one that should be most people's answer. Everything is still here and
  // still shadowed; the expensive halves of three separate knobs are not.
  balanced: {
    label: "Balanced",
    pixelRatioCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    softShadows: false,
    cullScale: 0.8,
    shadowEveryNFrames: 2,
  },
  // For a machine that cannot hold a frame. Shadows go entirely — it is the
  // single biggest saving available and there is no point pretending it is
  // subtle — and the pixel ratio drops to native.
  performance: {
    label: "Performance",
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 512,
    softShadows: false,
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
