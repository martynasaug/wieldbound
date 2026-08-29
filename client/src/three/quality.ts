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
  /**
   * Terrain texture anisotropy. Same "read once" treatment as antialias, for
   * a simpler reason: the ground plane is built once for the life of the
   * world, not rebuilt on a quality switch, so there is nothing to update
   * live even though the GPU-side value itself could change at any time.
   * Sampled at a grazing angle across most of the screen (see terrain.ts),
   * which is exactly where anisotropy cost is highest and most visible.
   */
  anisotropyCap: number;
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
    anisotropyCap: 16,
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
    anisotropyCap: 16,
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
  // Anisotropy halves rather than drops to one: this is the near-field ground
  // the player is looking at for the whole session, and filtering degrades
  // gracefully — eight is a softer grazing edge, not a swimming one.
  performance: {
    label: "Performance",
    pixelRatioCap: 1,
    antialias: false,
    anisotropyCap: 8,
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

// --- Adapting the level to the machine, rather than to an opinion ----------
//
// The file above argues that quality is "a setting rather than a decision",
// and that argument still holds for what a player PREFERS. What it does not
// cover is the case this exists for: a machine that cannot hold its own
// display's refresh rate at the level it happens to be set to.
//
// The pacer's response to that is to halve the frame rate — on a 144Hz display
// a frame costing 9ms misses the 6.94ms budget, so it draws one frame per two
// refreshes and the player gets 72fps at High. Nothing is wrong with that
// arithmetic, but it is the wrong trade to make silently: almost nobody would
// choose a 2048 shadow map and a pixel ratio of 2 over DOUBLE the frame rate,
// and nothing on screen tells them that is the choice being made on their
// behalf. The pacer knows the display is fast and knows the frame is too
// expensive for it, which is everything needed to lower the one and let the
// other recover.
//
// The player's own hand always wins: one press of F4 sets `manual` and this
// stops adjusting for the rest of the session.

/** How long a level must be held before it may change again. Long enough that
 *  a monster camp coming into view cannot trigger a level change on its own. */
export const AUTO_HOLD_MS = 8000;
/** How far inside the budget a frame must sit before trying a HIGHER level.
 *  Deliberately generous: stepping up is optional and stepping back down is
 *  visible, so it should only happen when there is real room. */
export const AUTO_UP_HEADROOM = 0.6;
/**
 * How long after the loop starts before the level may move at all.
 *
 * The first seconds of play are not representative of play: monster rigs are
 * still being built, buffers are still being uploaded the first time each
 * chunk is drawn, and the pacer's cost estimate is still converging. Adapting
 * from that produced a real and visible churn the first time this ran - the
 * log read "Graphics set to Performance" and then, seconds later, "Graphics
 * set to Balanced", which is the machine being measured while it is still
 * standing up. Nothing is decided until it has settled.
 */
export const AUTO_SETTLE_MS = 20000;

export interface AutoQualityState {
  level: QualityLevel;
  /**
   * The best level adaptation may try.
   *
   * Lowered permanently whenever a step UP has to be taken back, which is the
   * whole anti-oscillation mechanism. Flapping between two levels every eight
   * seconds is worse to look at than either level, and a machine that has once
   * failed to hold a level is not going to start holding it later in the same
   * session.
   */
  ceiling: QualityLevel;
  changedAt: number;
  /** When the controller first saw a frame, for AUTO_SETTLE_MS. */
  startedAt: number | null;
  /** The player pressed F4. Their choice is final. */
  manual: boolean;
}

export function newAutoQuality(level: QualityLevel): AutoQualityState {
  return { level, ceiling: "high", changedAt: 0, startedAt: null, manual: false };
}

const rank = (l: QualityLevel): number => QUALITY_ORDER.indexOf(l);

/**
 * Decide whether the quality level should move, from what the pacer measured.
 *
 * Pure, and returns the whole next state rather than mutating, so the rule can
 * be walked by `tools/test/autoquality.mjs` without a browser — the same
 * treatment `shadowSchedule` and the pacer's own divisor rule already get.
 * Returns null when nothing should change.
 */
export function autoQualityDecision(
  s: AutoQualityState,
  measured: { divisor: number; costMs: number; refreshMs: number },
  now: number,
): AutoQualityState | null {
  if (s.manual) return null;
  // Nothing has been measured yet. The pacer reports refreshMs 0 until its
  // first probe lands, and a decision from no data is a guess.
  if (measured.refreshMs <= 0 || measured.costMs <= 0) return null;
  // The settle period runs from the first frame this ever saw, not from page
  // load: `performance.now()` is already ~35 seconds old by the time the
  // loading screen lifts, so a deadline measured against it would be over
  // before the game had drawn anything.
  if (s.startedAt === null || now - s.startedAt < AUTO_SETTLE_MS) return null;
  if (now - s.changedAt < AUTO_HOLD_MS) return null;

  const budget = measured.refreshMs;
  const down = QUALITY_ORDER[rank(s.level) + 1];
  const up = QUALITY_ORDER[rank(s.level) - 1];

  // THE FRAME DOES NOT FIT THE DISPLAY. The pacer has already given up a
  // refresh for it, which is the measurement — not a prediction.
  if (measured.divisor > 1 && down) {
    return { ...s, level: down, ceiling: s.ceiling, changedAt: now };
  }
  // Room to spare, and allowed to try. `ceiling` is what stops this climbing
  // back into a level that has already been proven too expensive.
  if (measured.divisor === 1 && up && rank(up) >= rank(s.ceiling) &&
      measured.costMs < budget * AUTO_UP_HEADROOM) {
    return { ...s, level: up, changedAt: now };
  }
  return null;
}

/**
 * Record that a level did not hold, so adaptation never tries it again.
 *
 * Called when a step down immediately follows a step up: the level we just
 * left becomes the ceiling.
 */
export function lowerCeiling(s: AutoQualityState, failed: QualityLevel): AutoQualityState {
  return rank(failed) < rank(s.ceiling) ? s : { ...s, ceiling: QUALITY_ORDER[rank(failed) + 1] ?? "performance" };
}
