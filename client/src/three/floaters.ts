// Floating combat text.
//
// The last thing on screen still drawn the way the 2D client drew it: one
// class, one animation, one colour per call, projected once at spawn and then
// left to slide up the screen while the world moved out from under it. Beside
// the nameplates and the unit frames it read as a different game's HUD.
//
// Three things are wrong with fire-and-forget screen text in a 3D world, and
// all three are why this is now a per-frame system rather than a `setTimeout`:
//
//   1. It is not anchored. A number spawned over a monster belongs to that
//      monster, and the camera moves — so it has to be re-projected every
//      frame from the body it came off, or a player who walks two steps sees
//      damage numbers hanging over empty grass.
//   2. It does not stack. Two hits in the same frame — a cleave, a double
//      swing, a chain — drew exactly on top of each other, so a pack fight
//      showed one number where five landed. Floats now fan out around their
//      anchor and stagger in time.
//   3. It says nothing about magnitude. A 3 and a 40 were the same size in the
//      same colour, which throws away the one thing the number is for. Size
//      now carries the hit's weight RELATIVE TO WHAT IT HIT: ten damage is a
//      third of a slime and a rounding error on a dragon, and the float should
//      not claim they are the same event.
//
// Everything below the anchor and the arc is presentation, so this owns its own
// stylesheet the way the HUD does.

const STYLE = `
#floaters { position: fixed; inset: 0; pointer-events: none; z-index: 6;
  font-family: Georgia, serif; contain: layout style; }
#floaters .f {
  position: absolute; left: 0; top: 0;
  will-change: transform, opacity;
  white-space: nowrap;
  text-align: center;
  /* Stroke behind the fill, so the outline never eats into the digits at the
     small end. Without paint-order a 2px stroke on 13px text closes up the
     counters of an 8 and a 0 and the number stops being legible. */
  paint-order: stroke fill;
  -webkit-text-stroke: 3px rgba(10,6,2,.72);
  font-weight: bold;
  line-height: 1;
}
/* The crit tag. Small, letterspaced and above the number rather than inline,
   so the digits stay the thing being read and the word is a label on them. */
#floaters .f b {
  display: block;
  font: bold 0.42em/1 Georgia, serif;
  letter-spacing: .22em;
  text-indent: .22em;
  margin-bottom: .06em;
  opacity: .92;
  -webkit-text-stroke: 2px rgba(10,6,2,.66);
}
#floaters .f i { font-style: normal; font-size: .62em; opacity: .85; }

/* --- the six treatments ---
   Colour separates whose damage it is before the number is even read: warm
   white is your weapon, blue is your spells, red is what is being done to you.
   That split matters more than any per-school palette would, because the one
   question a player asks mid-fight is "am I winning". */
#floaters .k-hit   { color: #fff3d6; }
#floaters .k-skill { color: #9ad4ff; }
#floaters .k-taken { color: #ff6b6b; }
#floaters .k-heal  { color: #7ed957; }
#floaters .k-xp    { color: #ffd873; }
/* Loot takes its colour from the item's quality, set inline, so this rule only
   carries what the quality does not decide. */
#floaters .k-loot {
  letter-spacing: .02em;
  text-shadow: 0 0 12px currentColor;
}
#floaters .k-miss  {
  color: #b9ab8d; font-weight: normal; font-style: italic;
  letter-spacing: .08em;
  -webkit-text-stroke: 2px rgba(10,6,2,.6);
}

/* Crits are gold whichever direction they travel, and they glow. The glow is
   what carries at the size a crit is drawn — the colour alone reads as "a
   slightly different number". */
#floaters .crit.k-hit, #floaters .crit.k-skill { color: #ffd85e; }
#floaters .crit.k-taken { color: #ff9a4e; }
#floaters .crit {
  text-shadow: 0 0 10px currentColor, 0 0 22px rgba(255,180,60,.45);
}
`;

export type FloatKind = "hit" | "skill" | "taken" | "heal" | "miss" | "xp" | "loot";

/**
 * A live position in the world. Held by reference deliberately: `Actor.root
 * .position` is mutated in place every frame, so a float keeps up with a
 * monster that is being knocked around or is walking away mid-animation.
 */
export interface FloatAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FloatSpec {
  kind: FloatKind;
  /** The number, or the word, as it should read. */
  text: string;
  crit?: boolean;
  /**
   * How much this hit mattered, 0..1 — damage over the victim's maximum
   * health. Drives size, so the same 10 damage is loud on a slime and quiet on
   * a dragon. Absent means "no scale information", which draws at the base
   * size rather than at the smallest one.
   */
  weight?: number;
  /** Height above the anchor's own origin to spawn at, in world units. */
  headY?: number;
  /**
   * Overrides the kind's colour.
   *
   * Exists for exactly one caller: loot, whose colour is the item's quality and
   * so cannot be a class in this stylesheet. Everything else takes its colour
   * from what KIND of event it is, which is the property the six treatments
   * were built around and the reason they read at a glance.
   */
  color?: string;
}

interface Float {
  el: HTMLElement;
  anchor: FloatAnchor;
  headY: number;
  born: number;
  lifeMs: number;
  /** Screen-space drift, in px over the whole life. */
  driftX: number;
  riseY: number;
  /** Constant vertical offset by fan index, applied from the first frame. */
  lift: number;
  /** Final size in px, before the spawn punch. */
  size: number;
  crit: boolean;
  /** Ordinal among floats sharing this anchor at spawn — drives the fan. */
  fan: number;
}

/** How long a float lives. Crits linger, because they are the ones worth reading. */
const LIFE_MS = 1150;
const CRIT_LIFE_MS = 1450;
/** Two floats on one anchor inside this window are treated as one volley. */
const VOLLEY_MS = 900;
/** Above this many at once, the oldest are retired early — a chain into a pack
 *  can produce a dozen in one frame and a wall of numbers is not information. */
const MAX_LIVE = 26;

export class Floaters {
  private readonly root: HTMLElement;
  private readonly live: Float[] = [];
  /** Pooled, because a busy fight creates and destroys these constantly and
   *  every one is a style recalculation the moment it enters the document. */
  private readonly pool: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "floaters";
    parent.appendChild(this.root);
  }

  spawn(anchor: FloatAnchor, spec: FloatSpec): void {
    const now = performance.now();

    // Where in the volley this one lands. Counting only live floats on the
    // same anchor is what makes a cleave read as several hits rather than as
    // one number that happens to be thicker.
    let fan = 0;
    for (const f of this.live) {
      if (f.anchor === anchor && now - f.born < VOLLEY_MS) fan++;
    }

    const el = this.pool.pop() ?? document.createElement("div");
    const crit = !!spec.crit;
    el.className = `f k-${spec.kind}${crit ? " crit" : ""}`;
    el.style.color = spec.color ?? "";
    el.innerHTML = crit ? `<b>CRIT</b>${escapeText(spec.text)}` : escapeText(spec.text);

    // Size. The weight is the share of the victim's health this took, and it is
    // deliberately curved: the difference between 2% and 12% of a health bar is
    // worth showing, the difference between 60% and 70% is not.
    const weight = clamp01(spec.weight ?? 0.28);
    const base = spec.kind === "miss" ? 15 : spec.kind === "taken" ? 22 : 19;
    let size = base * (0.8 + Math.sqrt(weight) * 0.95);
    if (crit) size *= 1.3;
    // A number the player cannot read is worse than no number.
    size = Math.max(13, Math.min(52, size));

    // The arc. Alternating sides so a volley spreads rather than piles, and
    // widening with the fan index so the fifth is further out than the second.
    //
    // Except for text about YOU, which always goes left. The player is at the
    // centre of the screen and whatever they are fighting is a metre away, so
    // two anchors that close produce two columns of numbers in the same place —
    // and "how much am I taking" is the one reading that must not be searched
    // for. Giving it a lane of its own separates it by position as well as by
    // colour.
    const own = spec.kind === "taken" || spec.kind === "heal";
    const spread = Math.ceil(fan / 2);
    const side = own ? -1 : fan === 0 ? 0 : fan % 2 === 1 ? 1 : -1;
    const jitter = (Math.random() - 0.5) * 20;
    const driftX = own
      ? -(84 + spread * 22) + jitter * 0.5
      : side * (34 + spread * 28) + jitter;
    // Incoming damage rises less far: it spawns over the player, who is at the
    // centre of the screen and is the one thing the camera keeps framed, so a
    // tall arc walks it straight into the minimap.
    const riseY = (spec.kind === "taken" ? 46 : 62) + spread * 9 + Math.random() * 12;

    const f: Float = {
      el,
      anchor,
      headY: spec.headY ?? 2.0,
      // Staggered by position in the volley. A cleave hits five things on one
      // tick, and five numbers appearing on the same frame is a single event
      // however far apart they are placed — a sixteenth of a second between
      // them turns it into a sweep, which is what the skill actually is.
      // Capped: a chain into a crowded pack can produce twenty at once, and a
      // linear stagger would still be introducing numbers a second and a half
      // after the blow landed.
      born: now + Math.min(fan, 6) * 55,
      lifeMs: crit ? CRIT_LIFE_MS : LIFE_MS,
      driftX,
      riseY,
      lift: spread * 11,
      size,
      crit,
      fan,
    };

    el.style.fontSize = `${size.toFixed(1)}px`;
    // Placed before the first frame draws it, or it flashes at 0,0 for a frame
    // on the way to where it belongs.
    el.style.opacity = "0";
    this.root.appendChild(el);
    this.live.push(f);

    while (this.live.length > MAX_LIVE) this.retire(this.live.shift()!);
  }

  /**
   * Re-projects and advances every live float. Called once a frame from the
   * game loop, after the actors have moved and the camera has been placed —
   * projecting before either would leave the numbers one frame behind the
   * bodies they name, which is exactly the drift this system exists to remove.
   */
  update(project: (x: number, y: number, z: number) => { x: number; y: number } | null): void {
    const now = performance.now();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      if (now < f.born) {
        // Waiting its turn in the volley.
        f.el.style.opacity = "0";
        continue;
      }
      const t = (now - f.born) / f.lifeMs;
      if (t >= 1) {
        this.live.splice(i, 1);
        this.retire(f);
        continue;
      }

      const screen = project(f.anchor.x, f.anchor.y + f.headY, f.anchor.z);
      if (!screen) {
        // Behind the camera or off screen. Hidden rather than retired: the
        // camera swings back constantly and a number that vanished because the
        // view moved reads as a dropped hit.
        f.el.style.opacity = "0";
        continue;
      }

      // Rise decelerating, drift linear. The deceleration is what makes it read
      // as thrown off the body rather than as a label sliding up a screen.
      // Rise, plus a fixed lift by fan index. The rise starts at zero, so
      // without the lift a staggered volley would still begin stacked on one
      // point and only separate on the way up.
      const rise = f.riseY * (1 - (1 - t) * (1 - t)) + f.lift;
      // Most of the fan offset is applied immediately and the rest drifts in.
      // Easing the whole thing from zero would start a volley stacked on one
      // point, which is the exact frame a cleave into a pack most needs to be
      // readable — the separation has to exist before the motion does.
      const x = screen.x + f.driftX * (0.55 + 0.45 * t);
      const y = screen.y - rise;

      // The spawn punch: overshoot the size for the first fifth of the life,
      // which is the whole reason a crit registers as an event. Crits punch
      // harder and settle slower.
      const punchWindow = f.crit ? 0.22 : 0.14;
      let scale = 1;
      if (t < punchWindow) {
        const p = t / punchWindow;
        scale = (f.crit ? 1.55 : 1.28) - (f.crit ? 0.55 : 0.28) * easeOutBack(p);
      }

      // Fade only at the end, so the number is at full strength for most of the
      // time it is on screen. A linear fade from spawn spends half the life
      // being half-legible.
      const fade = t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38;

      f.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      f.el.style.opacity = fade.toFixed(3);
    }
  }

  /** Drops everything — used on defeat and on disconnect, where the numbers
   *  would otherwise outlive the fight they describe. */
  clear(): void {
    for (const f of this.live) this.retire(f);
    this.live.length = 0;
  }

  private retire(f: Float): void {
    f.el.remove();
    // Anchors are held by reference, so a pooled element must not keep a dead
    // monster's Actor alive through its own float.
    if (this.pool.length < 32) this.pool.push(f.el);
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutBack(p: number): number {
  const c = 1.70158;
  const q = p - 1;
  return 1 + (c + 1) * q * q * q + c * q * q;
}

/** Combat text is generated from numbers and fixed words, but it is written
 *  into `innerHTML` for the crit tag — so it is escaped rather than trusted. */
function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
