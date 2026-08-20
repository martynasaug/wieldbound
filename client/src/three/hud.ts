// The HUD, rebuilt as DOM.
//
// In the Phaser client this was drawn into the canvas, which meant text was
// rendered as canvas glyphs (the source of the tofu-emoji bug in Phase 38) and
// every element needed manual repositioning on resize. As DOM it inherits the
// gold/parchment theme the rest of the UI already uses, lays itself out, and
// stays crisp at any DPI.
//
// Nameplates are DOM too, positioned from projected world coordinates each
// frame — the standard MMO approach, and it keeps text out of the 3D pipeline
// entirely. Floating combat text used to live here as well; it grew its own
// per-frame anchoring and arc and moved to `floaters.ts`.

import { iconSvg } from "../ui/icons";

const STYLE = `
#hud3d { position: fixed; inset: 0; pointer-events: none; z-index: 5; font-family: Georgia, serif; }
/* --- The player's unit frame -------------------------------------------
   A portrait, a name plate and three bars, built in the same language as the
   character window's paperdoll: a lit bevel, a vignette behind the figure and
   a keyline inset from the frame edge. That window already established that
   ornament is cheap and does most of the work — this is the same forty lines
   of CSS applied to the thing the player looks at most.

   The frame publishes its own height as --unit-frame-bottom, and the target
   frame starts from there. It used to be a hardcoded top: 122px, which was
   correct until the world clock was added a row and quietly pushed the frame
   past it — the target frame then drew straight over the clock. Same fix as
   the minimap and the window rail: measure, publish, and let the neighbour
   read it. */
#hud3d .frame {
  position: absolute; left: 14px; top: 14px; width: 272px;
  display: flex; gap: 9px;
  background:
    radial-gradient(120% 100% at 0% 0%, rgba(255,214,140,.10), transparent 60%),
    linear-gradient(180deg, #3d2c18, #221809);
  border: 1px solid var(--gold, #d9a441);
  border-radius: 9px;
  padding: 9px 11px 8px;
  box-shadow: 0 6px 22px #000a, inset 0 1px 0 rgba(255,220,150,.16);
}
/* Keyline, inset from the border, so the frame has depth rather than one edge. */
#hud3d .frame::after {
  content: "";
  position: absolute; inset: 4px;
  border: 1px solid rgba(226,176,79,.20);
  border-radius: 6px;
  pointer-events: none;
}

/* --- portrait --- */
#hud3d .portrait {
  position: relative; flex: none;
  width: 52px; height: 52px;
  border-radius: 7px;
  background:
    radial-gradient(80% 70% at 50% 24%, #6a5028, #2a1d0d 70%),
    linear-gradient(180deg, #4a3720, #241a0e);
  border: 1px solid #7a5c2a;
  box-shadow: inset 0 1px 0 rgba(255,220,150,.18), inset 0 -8px 12px rgba(0,0,0,.55);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
#hud3d .portrait .icon {
  width: 34px; height: 34px;
  fill: var(--gold-bright, #ffd873);
  filter: drop-shadow(0 3px 5px rgba(0,0,0,.8));
}
/* The level rides the portrait's corner rather than sitting in the text row:
   it is an attribute of who you are, not another number in the stack. */
#hud3d .portrait .lvl {
  position: absolute; right: -1px; bottom: -1px;
  min-width: 17px; padding: 0 3px;
  background: linear-gradient(180deg, #5a4420, #33260f);
  border: 1px solid var(--gold, #d9a441);
  border-radius: 4px 0 5px 0;
  font: bold 10px/13px Georgia, serif;
  color: var(--gold-bright, #ffd873);
  text-align: center;
  text-shadow: 0 1px 1px #000;
}

#hud3d .frame .stack { flex: 1; min-width: 0; }
#hud3d .who { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
#hud3d .who .nm {
  color: var(--gold-bright, #ffd873);
  font: bold 14px Georgia, serif;
  letter-spacing: .02em;
  text-shadow: 0 1px 2px #000;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
#hud3d .who .lv { display: none; }

/* --- bars ---
   One shape for all three: a near-black trough, a gradient fill with a lit top
   edge, and quarter ticks drawn as a repeating gradient so they cost no
   elements. The colour is the only thing that differs, which is what makes
   three stacked bars read as one instrument rather than three widgets. */
#hud3d .bar {
  position: relative; height: 14px; margin-bottom: 4px;
  border-radius: 3px;
  background: linear-gradient(180deg, #150e05, #241a0c);
  border: 1px solid #6a5024;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0,0,0,.7);
}
#hud3d .bar:last-child { margin-bottom: 0; }
#hud3d .bar .fill {
  position: absolute; inset: 0; width: 0%;
  transition: width .18s ease-out;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.28), inset 0 -4px 6px rgba(0,0,0,.28);
}
#hud3d .bar::after {
  content: "";
  position: absolute; inset: 0;
  background: repeating-linear-gradient(
    90deg, transparent 0 calc(25% - 1px), rgba(0,0,0,.42) calc(25% - 1px) 25%);
  pointer-events: none;
}
#hud3d .bar .txt {
  position: relative; text-align: center;
  font: 10px/14px monospace;
  color: #fdf3dc;
  text-shadow: -1px 0 1px #000, 1px 0 1px #000, 0 1px 1px #000;
}
#hud3d .bar.hp .fill { background: linear-gradient(180deg, #7ada6a, #3d8f3d 60%, #2c6b2c); }
#hud3d .bar.mp .fill { background: linear-gradient(180deg, #79c2f5, #2b6ba8 60%, #1e4f80); }
/* XP is the one you are not watching mid-fight, so it is thinner and quieter. */
#hud3d .bar.xp { height: 9px; }
#hud3d .bar.xp .fill { background: linear-gradient(180deg, #f0cf70, #b48a26 60%, #8a6717); }
#hud3d .bar.xp .txt { font-size: 8px; line-height: 9px; color: #e8d9b0; }

/* --- the world clock ---
   Sits on the unit frame rather than anywhere new: it answers a question the
   player only asks while looking at the light, and a panel of its own for four
   characters would be furniture. */
#hud3d .clock {
  display: flex; align-items: center; gap: 5px;
  margin-top: 7px; padding-top: 6px;
  border-top: 1px solid rgba(226,176,79,.28);
  font: 11px monospace; color: #d9c39a;
}
#hud3d .clock .icon { width: 12px; height: 12px; fill: currentColor; flex: none; }
#hud3d .clock .phase { color: var(--gold, #d9a441); text-transform: capitalize; }
#hud3d .clock .time { margin-left: auto; color: #f5e7c8; letter-spacing: .04em; }

/* --- Nameplates ---------------------------------------------------------
   Four kinds, deliberately NOT styled alike. A field can hold a dozen of
   these at once, so the hierarchy has to do the work: an ordinary monster is
   bare text and a bar, an elite gets a real framed plate, a resource node is
   a small dim pill, and the workbench is a gold banner. Framing everything
   equally is what turns a populated camp into a wall of boxes.

   Everything is sized in em off the plate's own font-size, so the distance
   scaling below is one property rather than a dozen. */
#hud3d .plate {
  position: absolute;
  transform: translate(-50%, -100%);
  text-align: center;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1;
  transition: opacity .18s linear;
}
#hud3d .plate .pn {
  display: inline-flex; align-items: center; justify-content: center; gap: .34em;
  font: 1em/1.15 Georgia, serif;
  letter-spacing: .02em;
  color: #ffe9b8;
  /* A hard four-way outline rather than a soft shadow: these sit over grass,
     dirt, water and fire, and a blur only survives some of those. */
  text-shadow: -1px -1px 0 #150f04, 1px -1px 0 #150f04, -1px 1px 0 #150f04,
               1px 1px 0 #150f04, 0 2px 4px #000a;
}
#hud3d .plate .pn .icon { width: .95em; height: .95em; flex: none; }

/* Health. The trough is nearly black so the fill reads at any size, and the
   inner highlight is what stops it looking like a flat rectangle. */
#hud3d .plate .ph {
  position: relative;
  width: 5.2em; height: .52em;
  margin: .22em auto 0;
  background: #1a0a0a;
  border: 1px solid #0c0704;
  border-radius: 2px;
  overflow: hidden;
  box-shadow: 0 1px 2px #0009;
}
#hud3d .plate .ph i {
  position: absolute; inset: 0 auto 0 0;
  display: block; height: 100%;
  background: linear-gradient(180deg, #e46a6a, #a32626 60%, #7d1b1b);
  box-shadow: inset 0 1px 0 #ffffff33;
}
/* The ghost trails the real value, so a hit reads as a chunk taken rather
   than as a bar that is simply shorter than it was. */
#hud3d .plate .ph .ghost {
  background: #ffd9a0;
  opacity: .5;
  box-shadow: none;
  transition: width .45s ease-out .12s;
}
#hud3d .plate .ph .fill { transition: width .1s linear; }
/* Quarter ticks, drawn as a repeating gradient so they cost no elements. */
#hud3d .plate .ph::after {
  content: "";
  position: absolute; inset: 0;
  background: repeating-linear-gradient(
    90deg, transparent 0 calc(25% - 1px), #00000066 calc(25% - 1px) 25%);
  pointer-events: none;
}

/* The telegraph. Same information the target frame shows, put where the
   player is already looking — at the thing winding up to hit them. */
#hud3d .plate .pc {
  position: relative;
  width: 5.2em; height: .34em;
  margin: .16em auto 0;
  background: #1a1206;
  border: 1px solid #0c0704;
  border-radius: 2px;
  overflow: hidden;
  display: none;
}
#hud3d .plate .pc i {
  display: block; height: 100%; width: 0%;
  background: linear-gradient(180deg, #ffd06a, #e07a1f);
}
#hud3d .plate.casting .pc { display: block; }

/* --- difficulty ---------------------------------------------------------
   The name's colour is the band the monster belongs to, so how dangerous
   something is arrives before you are in range of it. */
#hud3d .plate.band-1 .pn { color: #cfd6c4; }
#hud3d .plate.band-2 .pn { color: #9fd97a; }
#hud3d .plate.band-3 .pn { color: #ffe27a; }
#hud3d .plate.band-4 .pn { color: #ffb05a; }
#hud3d .plate.band-5 .pn { color: #ff7a6a; }

/* --- elite --------------------------------------------------------------
   Only bosses get a frame. That is the whole point of the frame. */
#hud3d .plate-elite .pn {
  padding: .22em .6em;
  border-radius: .3em;
  background: linear-gradient(180deg, rgba(58,42,23,.92), rgba(28,20,10,.92));
  border: 1px solid var(--gold-dim, #8a6b2f);
  box-shadow: 0 2px 8px #000a, inset 0 1px 0 rgba(255,220,150,.16);
}
#hud3d .plate-elite .ph { width: 6.4em; height: .62em; }

/* --- engaged / locked ---------------------------------------------------
   Engaged is derived every frame and locked is a deliberate click, so they
   read differently: a warm glow you did not ask for, and hard brackets you
   did. Same split the target rings already make in the world. */
#hud3d .plate.engaged .pn { color: #fff3cf; }
#hud3d .plate.engaged .ph { box-shadow: 0 0 7px #ffb04a88, 0 1px 2px #0009; }
#hud3d .plate.engaged .ph i.fill { background: linear-gradient(180deg, #ff8a5c, #c2361f); }
#hud3d .plate.locked .pn::before,
#hud3d .plate.locked .pn::after {
  color: #fff0c8; font-weight: bold; opacity: .95;
}
#hud3d .plate.locked .pn::before { content: "‹"; }
#hud3d .plate.locked .pn::after { content: "›"; }

/* --- remote players ----------------------------------------------------- */
#hud3d .plate-player .pn { color: #9fd8ff; }

/* --- resource nodes -----------------------------------------------------
   Deliberately the quietest thing on screen. There are dozens of them and
   they are scenery you occasionally use, not things that need announcing. */
#hud3d .plate-node .pn {
  font-size: .88em;
  color: #d8cdb0;
  opacity: .82;
  padding: .12em .42em;
  border-radius: .8em;
  background: rgba(20,14,6,.42);
}
#hud3d .plate-node.dim .pn { opacity: .38; }

/* --- loot on the ground -------------------------------------------------
   Between an ordinary monster's bare text and a boss's framed plate: a drop
   gets a dark backing so it stays readable against grass, and takes its
   colour from the item's quality rather than from this stylesheet. */
#hud3d .plate-drop .pn {
  padding: .12em .5em;
  border-radius: .3em;
  background: rgba(14, 10, 5, .72);
  font-weight: bold;
  letter-spacing: .01em;
}
/* Reserved for somebody else, for now. Dimmed rather than hidden: knowing what
   fell is worth something even when you cannot take it yet, and it comes free
   in a moment anyway. */
#hud3d .plate-drop.dim .pn { opacity: .45; }

/* --- the workbench ------------------------------------------------------ */
#hud3d .plate-station .pn {
  color: #ffd873;
  padding: .2em .62em;
  border-radius: .3em;
  background: linear-gradient(180deg, rgba(58,42,23,.9), rgba(28,20,10,.9));
  border: 1px solid var(--gold-dim, #8a6b2f);
  box-shadow: 0 2px 8px #0009;
}

/* --- townspeople --------------------------------------------------------
   Two lines rather than one: a name and, under it, what they are for. A
   nameplate that says only "Oswyn Thale" tells a new player nothing they can
   act on, and the title is the entire reason to walk over.

   The "click to talk" tail appears only while you are close enough, which
   makes the plate itself the range indicator — otherwise the answer to "why
   does clicking him do nothing" is invisible. */
#hud3d .plate-npc .pn {
  color: #ffe6b0;
  padding: .18em .6em;
  border-radius: .3em;
  background: linear-gradient(180deg, rgba(46,34,20,.88), rgba(22,16,9,.88));
  border: 1px solid rgba(138,107,47,.85);
  box-shadow: 0 2px 8px #0009;
}
#hud3d .plate-npc .pt {
  display: block;
  margin-top: .18em;
  font-size: .82em;
  font-style: italic;
  color: #c2a97a;
  text-shadow: 0 1px 2px #000a;
}
#hud3d .plate-npc.engaged .pn { border-color: #ffd873; color: #fff3d2; }
#hud3d .plate-npc.engaged .pt { color: #ffd873; }
#hud3d .plate-npc.engaged .pt::after { content: " · click to talk"; }

#hud3d .toasts { position: absolute; left: 14px; bottom: 190px; display: flex; flex-direction: column; gap: 5px; }
#hud3d .toast {
  background: linear-gradient(#3a2a17, #241a0f); border: 1px solid var(--gold, #d9a441);
  border-radius: 5px; padding: 6px 10px; font-size: 12px; max-width: 330px;
  animation: hud3dToast 4s ease-out forwards;
}
@keyframes hud3dToast {
  0% { opacity: 0; transform: translateY(6px); }
  8%, 78% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-4px); }
}
`;

// Screen area the unit frames occupy. Nameplates falling inside it are
// suppressed, because they are world-anchored and the frames are not — so
// anything behind them drew straight over the player's own health.
//
// Measured rather than hardcoded. It was `{ w: 300, h: 130 }`, which stopped
// covering the frames the moment the world clock added a row and the target
// frame grew a portrait — and the failure is a label drawn over your own HP
// bar, which reads as a rendering glitch rather than as a stale constant.
const HUD_FRAME_RECT = { w: 300, h: 130 };

/** Which nameplate treatment something gets. */
export type PlateKind = "monster" | "player" | "node" | "station" | "drop" | "npc";

export interface PlateSpec {
  kind: PlateKind;
  name: string;
  hp?: number;
  maxHp?: number;
  /** 1..5 difficulty band. Colours the name, so danger arrives before range. */
  band?: number;
  /** Bosses only. The one thing that gets a framed plate. */
  elite?: boolean;
  /** What you are fighting this instant, derived every frame. */
  engaged?: boolean;
  /** What you deliberately clicked. Gets brackets rather than a glow. */
  locked?: boolean;
  /** 0..1 telegraph progress, or undefined when nothing is winding up. */
  windup?: number;
  /** Distance from the camera in world units. Drives fade and stacking order. */
  distance?: number;
  /** A depleted resource node. */
  dim?: boolean;
  /** Icon key drawn left of the name. */
  icon?: string;
  /** A second, smaller line under the name. Townspeople use it for their title. */
  subtitle?: string;
  /** Overrides the name's colour. Drops use it to carry their quality, which is
   *  the one fact a player needs to read about loot from across a field. */
  tint?: string;
}

/**
 * Plates start shrinking past this and are gone by FADE_END.
 *
 * Without it a crowded field is unreadable: thirty labels at identical size,
 * all overlapping, none of them telling you which is near. Scaling with
 * distance restores the depth cue the projection threw away.
 */
const PLATE_FULL_SIZE_UNTIL = 16;
const PLATE_FADE_END = 62;
const PLATE_MIN_SCALE = 0.66;

/** Per-plate state that has to persist between frames. */
interface PlateState {
  el: HTMLElement;
  nameEl: HTMLElement;
  barEl: HTMLElement;
  fillEl: HTMLElement;
  ghostEl: HTMLElement;
  castEl: HTMLElement;
  castFillEl: HTMLElement;
  /** Last name written, so the DOM is not touched sixty times a second. */
  name: string;
  icon: string;
  cls: string;
  /** Last colour written. Same reasoning as the name. */
  tint?: string;
  /** Highest recent health fraction, for the damage ghost to drain from. */
  ghost: number;
  ghostAt: number;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly xpText: HTMLElement;
  private readonly mpFill: HTMLElement;
  private readonly mpText: HTMLElement;
  private readonly toastHost: HTMLElement;
  private readonly frameEl: HTMLElement;
  private readonly portraitEl: HTMLElement;
  private readonly levelBadge: HTMLElement;
  private lastPortrait = "";
  /** Last published frame height, so the CSS variable is written only on change. */
  private lastFrameHeight = 0;
  /** Live bottom edge of the unit frames, refreshed by syncLayout. */
  private framesBottom = HUD_FRAME_RECT.h;
  /** Looked up once: it lives in index.html and is never replaced. */
  private readonly targetFrameEl = document.getElementById("target-frame");
  private readonly clockIcon: HTMLElement;
  private readonly clockPhase: HTMLElement;
  private readonly clockTime: HTMLElement;
  private lastClockIcon = "";

  private readonly plates = new Map<string, PlateState>();
  private seenThisFrame = new Set<string>();

  constructor(parent: HTMLElement) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "hud3d";
    this.root.innerHTML = `
      <div class="frame">
        <div class="portrait"><span class="pi"></span><span class="lvl">1</span></div>
        <div class="stack">
          <div class="who"><span class="nm">—</span><span class="lv">Lv 1</span></div>
          <div class="bar hp"><div class="fill"></div><div class="txt">0/0</div></div>
          <div class="bar mp"><div class="fill"></div><div class="txt">0/0</div></div>
          <div class="bar xp"><div class="fill"></div><div class="txt">0/0</div></div>
          <div class="clock"><span class="ci"></span><span class="phase">—</span><span class="time">--:--</span></div>
        </div>
      </div>
      <div class="toasts"></div>
    `;
    parent.appendChild(this.root);

    this.nameEl = this.root.querySelector(".who .nm")!;
    this.levelEl = this.root.querySelector(".who .lv")!;
    this.hpFill = this.root.querySelector(".bar.hp .fill")!;
    this.hpText = this.root.querySelector(".bar.hp .txt")!;
    this.xpFill = this.root.querySelector(".bar.xp .fill")!;
    this.xpText = this.root.querySelector(".bar.xp .txt")!;
    this.mpFill = this.root.querySelector(".bar.mp .fill")!;
    this.mpText = this.root.querySelector(".bar.mp .txt")!;
    this.toastHost = this.root.querySelector(".toasts")!;
    this.frameEl = this.root.querySelector(".frame")!;
    this.portraitEl = this.root.querySelector(".portrait .pi")!;
    this.levelBadge = this.root.querySelector(".portrait .lvl")!;
    this.clockIcon = this.root.querySelector(".clock .ci")!;
    this.clockPhase = this.root.querySelector(".clock .phase")!;
    this.clockTime = this.root.querySelector(".clock .time")!;
  }

  /**
   * The hour, its name, and a sun or a moon.
   *
   * Called every frame, so the icon is only rewritten when it actually changes
   * — swapping innerHTML sixty times a second to draw the same glyph is the
   * kind of thing that never shows up in a profile until it does.
   */
  setClock(phase: string, time: string, daytime: boolean): void {
    this.clockPhase.textContent = phase;
    this.clockTime.textContent = time;
    const want = daytime ? "sun" : "moon";
    if (want !== this.lastClockIcon) {
      this.lastClockIcon = want;
      this.clockIcon.innerHTML = iconSvg(want, "icon");
    }
  }

  setIdentity(name: string, level: number): void {
    this.nameEl.textContent = name;
    this.levelEl.textContent = `Lv ${level}`;
    this.levelBadge.textContent = String(level);
  }

  /**
   * The portrait's figure, which is the class the equipped weapon implies.
   *
   * Rewritten only when it changes: this is called on every equip and the icon
   * is the same one nine times out of ten.
   */
  setPortrait(cls: string): void {
    if (cls === this.lastPortrait) return;
    this.lastPortrait = cls;
    this.portraitEl.innerHTML = iconSvg(`class-${cls}`, "icon");
  }

  /**
   * Publishes the frame's height so the target frame can sit under it.
   *
   * The target frame used to carry a hardcoded `top: 122px`, which was right
   * until the world clock added a row and pushed the unit frame past it — and
   * then the two overlapped, with the target frame drawing over the clock.
   * Measuring and publishing is the same fix the minimap and the window rail
   * already use, and it survives anything else being added to either.
   */
  syncLayout(): void {
    const height = Math.round(this.frameEl.getBoundingClientRect().height);
    if (height === 0) return;

    // 14px is the frame's own top offset; 8 is the gap between the two.
    const targetTop = 14 + height + 8;
    // Only the CSS write is guarded. The exclusion zone below has to be
    // recomputed every call regardless, because the target frame appears and
    // disappears without the player frame's height changing at all.
    if (height !== this.lastFrameHeight) {
      this.lastFrameHeight = height;
      document.documentElement.style.setProperty("--unit-frame-bottom", `${targetTop}px`);
    }

    // The nameplate exclusion zone reaches to the bottom of whichever frames
    // are showing, so it grows with them instead of being a number that goes
    // stale the next time either one gains a row.
    const target = this.targetFrameEl;
    const showing = target?.classList.contains("shown") ?? false;
    const targetHeight = showing ? Math.round(target!.getBoundingClientRect().height) : 0;
    this.framesBottom = (showing ? targetTop + targetHeight : 14 + height) + 6;
  }

  setHp(hp: number, maxHp: number): void {
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.hpFill.style.width = `${ratio * 100}%`;
    this.hpText.textContent = `${Math.max(0, Math.round(hp))}/${Math.round(maxHp)}`;
    // Threshold colours carry meaning, so they stay explicit rather than being
    // folded into the gradient.
    this.hpFill.style.background =
      ratio > 0.5
        ? "linear-gradient(#5fc45f, #3d8f3d)"
        : ratio > 0.25
          ? "linear-gradient(#e0c454, #a8901f)"
          : "linear-gradient(#d85252, #9e2f2f)";
  }

  setMana(mana: number, maxMana: number): void {
    const ratio = maxMana > 0 ? Math.max(0, Math.min(1, mana / maxMana)) : 0;
    this.mpFill.style.width = `${ratio * 100}%`;
    this.mpText.textContent = `${Math.round(mana)}/${Math.round(maxMana)}`;
  }

  setXp(xp: number, needed: number, level: number): void {
    const ratio = needed > 0 ? Math.max(0, Math.min(1, xp / needed)) : 0;
    this.xpFill.style.width = `${ratio * 100}%`;
    this.xpText.textContent = `XP ${Math.round(xp)}/${Math.round(needed)}`;
    this.levelEl.textContent = `Lv ${level}`;
  }

  toast(text: string, color = "#f3e3c4"): void {
    const el = document.createElement("div");
    el.className = "toast";
    el.style.color = color;
    el.textContent = text;
    this.toastHost.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // --- nameplates: call begin, then plate() per visible actor, then end ---

  beginPlates(): void {
    this.seenThisFrame.clear();
  }

  plate(id: string, screen: { x: number; y: number } | null, spec: PlateSpec): void {
    if (!screen) return;
    // Nameplates are world-anchored and the unit frame is not, so anything
    // behind the frame drew straight over the player's own health. Suppress
    // rather than reposition: a label yanked away from the thing it names is
    // worse than a label that briefly is not there.
    if (screen.x < HUD_FRAME_RECT.w && screen.y < this.framesBottom) return;
    this.seenThisFrame.add(id);

    let st = this.plates.get(id);
    if (!st) {
      const el = document.createElement("div");
      el.className = "plate";
      el.innerHTML =
        '<div class="pn"></div>' +
        '<div class="ph"><i class="ghost"></i><i class="fill"></i></div>' +
        '<div class="pc"><i></i></div>';
      this.root.appendChild(el);
      st = {
        el,
        nameEl: el.querySelector(".pn") as HTMLElement,
        barEl: el.querySelector(".ph") as HTMLElement,
        fillEl: el.querySelector(".ph .fill") as HTMLElement,
        ghostEl: el.querySelector(".ph .ghost") as HTMLElement,
        castEl: el.querySelector(".pc") as HTMLElement,
        castFillEl: el.querySelector(".pc i") as HTMLElement,
        name: "",
        icon: "",
        cls: "",
        tint: undefined,
        ghost: 1,
        ghostAt: 0,
      };
      this.plates.set(id, st);
    }

    const distance = spec.distance ?? 0;
    // Linear from full size to the floor, then a fade over the last stretch.
    const t = Math.max(0, Math.min(1, (distance - PLATE_FULL_SIZE_UNTIL) / (PLATE_FADE_END - PLATE_FULL_SIZE_UNTIL)));
    const scale = 1 - (1 - PLATE_MIN_SCALE) * t;
    st.el.style.left = `${screen.x}px`;
    st.el.style.top = `${screen.y}px`;
    st.el.style.fontSize = `${(11 * scale).toFixed(2)}px`;
    st.el.style.opacity = String(t > 0.92 ? Math.max(0, (1 - t) / 0.08) : 1);
    // Nearer plates draw over farther ones, which is the other half of the
    // depth cue — without it two overlapping labels stack in map order.
    st.el.style.zIndex = String(Math.max(1, Math.round(2000 - distance * 20)));

    // The class list is rebuilt as one string and only written when it changes:
    // this runs for every plate every frame, and classList thrashing here was
    // measurably the most expensive thing the HUD did.
    const cls =
      "plate plate-" + spec.kind +
      (spec.band ? " band-" + spec.band : "") +
      (spec.elite ? " plate-elite" : "") +
      (spec.engaged ? " engaged" : "") +
      (spec.locked ? " locked" : "") +
      (spec.dim ? " dim" : "") +
      (spec.windup !== undefined ? " casting" : "");
    if (cls !== st.cls) {
      st.cls = cls;
      st.el.className = cls;
    }

    const icon = spec.icon ?? "";
    // The subtitle is folded into the same comparison rather than tracked
    // separately: this runs for every plate every frame, and the whole point of
    // the guard is that the DOM is not touched when nothing has changed.
    const name = spec.subtitle ? `${spec.name}\u0000${spec.subtitle}` : spec.name;
    if (st.name !== name || st.icon !== icon) {
      st.name = name;
      st.icon = icon;
      st.nameEl.innerHTML =
        (icon ? iconSvg(icon, "icon") : "") +
        `<span>${spec.name}</span>` +
        (spec.subtitle ? `<i class="pt">${spec.subtitle}</i>` : "");
    }
    // Written only on change, like the name and the class list: this runs for
    // every plate every frame, and assigning an unchanged colour sixty times a
    // second is one of the cheapest things in the HUD to get wrong.
    if (spec.tint !== st.tint) {
      st.tint = spec.tint;
      st.nameEl.style.color = spec.tint ?? "";
    }

    if (spec.maxHp && spec.maxHp > 0 && spec.hp !== undefined) {
      st.barEl.style.display = "";
      const fraction = Math.max(0, Math.min(1, spec.hp / spec.maxHp));
      st.fillEl.style.width = `${fraction * 100}%`;

      // The ghost holds the old value briefly, then drains to the new one. It
      // only ever falls: healing should not leave a pale bar behind it.
      const now = performance.now();
      if (fraction > st.ghost || now - st.ghostAt > 520) {
        st.ghost = fraction;
        st.ghostAt = now;
        st.ghostEl.style.width = `${fraction * 100}%`;
      }
    } else {
      st.barEl.style.display = "none";
    }

    if (spec.windup !== undefined) {
      st.castFillEl.style.width = `${Math.max(0, Math.min(1, spec.windup)) * 100}%`;
    }
  }

  endPlates(): void {
    for (const [id, st] of this.plates) {
      if (!this.seenThisFrame.has(id)) {
        st.el.remove();
        this.plates.delete(id);
      }
    }
  }
}
