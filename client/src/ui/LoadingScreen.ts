// The gap between pressing Play and seeing a world.
//
// The client fetches around fifty models and twenty megabytes of texture before
// the first frame is worth looking at, and until now it did that behind a blank
// page. Nothing said the game was working, nothing said how much was left, and
// on a cold cache the honest reading of the screen was "it is broken".
//
// Two things fix that, and only one of them is this file. The other is in
// `Game.start`, which now runs the decor, the character and the socket at the
// same time rather than one after another — a progress bar over a serial load
// is a nicer way to wait for the same amount of time.
//
// What it shows is produced by the loader itself (see `onLoadProgress`), not by
// a hardcoded asset count: a constant would go stale the first time a model was
// added, and it could not know about the textures each model drags in behind
// it. The consequence is that the total GROWS while loading, so the percentage
// can move backwards early on. That is left visible rather than smoothed away,
// because a bar that only ever advances is a bar that has to lie at the end —
// and the bar is monotonic anyway (see `shown`), so what the player sees is a
// bar that slows down, not one that retreats.

import { onLoadProgress, type LoadProgress } from "../three/assets";
import { iconSvg } from "./icons";

const STYLE = `
#loading {
  position: fixed; inset: 0; z-index: 40;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 22px;
  background:
    radial-gradient(120% 90% at 50% 18%, rgba(255,214,140,.10), transparent 62%),
    linear-gradient(180deg, #1d1509, #0d0904);
  font-family: Georgia, serif;
  transition: opacity .45s ease-out;
}
#loading.gone { opacity: 0; pointer-events: none; }

#loading .mark { width: 62px; height: 62px; color: var(--gold, #d9a441); opacity: .92; }
#loading .mark svg { width: 100%; height: 100%; fill: currentColor;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,.8)); }
#loading .title {
  font-size: 30px; letter-spacing: .10em; color: var(--gold-bright, #ffd873);
  text-shadow: 0 2px 6px #000, 0 0 26px rgba(217,164,65,.25);
}
#loading .tag { margin-top: -14px; font-size: 13px; font-style: italic; color: #a08d68; }

/* Same trough, gradient and lit top edge as every bar in the unit frame — a
   loading bar that looked like something else would be the first thing the
   player saw and the only thing not in the game's language. */
#loading .bar {
  position: relative; width: min(430px, 62vw); height: 15px;
  border-radius: 3px;
  background: linear-gradient(180deg, #150e05, #241a0c);
  border: 1px solid #6a5024;
  overflow: hidden;
  box-shadow: inset 0 2px 4px rgba(0,0,0,.7), 0 4px 18px #000a;
}
#loading .bar i {
  position: absolute; inset: 0; width: 0%;
  background: linear-gradient(180deg, #f0c469, #b7802c);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.34), inset 0 -4px 6px rgba(0,0,0,.26);
  transition: width .35s ease-out;
}
/* A slow sheen, so a stall on one large file still reads as work in progress
   rather than as a frozen page. */
#loading .bar::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(100deg, transparent 35%, rgba(255,238,200,.22) 50%, transparent 65%);
  animation: loadSheen 1.9s linear infinite;
}
@keyframes loadSheen { from { transform: translateX(-100%); } to { transform: translateX(100%); } }

#loading .line {
  display: flex; gap: 12px; align-items: baseline;
  font-size: 12px; color: #9d8b68; letter-spacing: .04em;
  min-height: 1em;
}
#loading .line .what { color: #c9b47a; }
#loading .line .pct { color: var(--gold, #d9a441); font-variant-numeric: tabular-nums; }
#loading .hint {
  position: absolute; bottom: 34px;
  max-width: 460px; text-align: center;
  font-size: 12.5px; font-style: italic; color: #7d6c4f; line-height: 1.6;
}
`;

/**
 * Shown while the first load runs. One per session — it is created before the
 * game is and removed once the world is standing.
 */
export class LoadingScreen {
  private readonly el: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly what: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly unsubscribe: () => void;
  /** The bar never goes backwards: the total grows as work is discovered, and a
   *  bar that retreats reads as an error even when the number behind it is more
   *  honest than the one before. */
  private shown = 0;

  constructor(parent: HTMLElement, hint: string) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.el = document.createElement("div");
    this.el.id = "loading";
    this.el.innerHTML = `
      <div class="mark">${iconSvg("class-adventurer")}</div>
      <div class="title">WIELDBOUND</div>
      <div class="tag">You are whatever you're holding.</div>
      <div class="bar"><i></i></div>
      <div class="line"><span class="what">preparing</span><span class="pct">0%</span></div>
      <div class="hint"></div>
    `;
    parent.appendChild(this.el);

    this.fill = this.el.querySelector(".bar i")!;
    this.what = this.el.querySelector(".what")!;
    this.pct = this.el.querySelector(".pct")!;
    (this.el.querySelector(".hint") as HTMLElement).textContent = hint;

    this.unsubscribe = onLoadProgress((p) => this.render(p));
  }

  private render(p: LoadProgress): void {
    if (p.total === 0) return;
    const ratio = Math.min(1, p.done / p.total);
    this.shown = Math.max(this.shown, ratio);
    this.fill.style.width = `${(this.shown * 100).toFixed(1)}%`;
    this.pct.textContent = `${Math.round(this.shown * 100)}%`;
    this.what.textContent = phaseFor(p.label);
  }

  /** Fills the bar, then fades out and removes itself. */
  finish(): void {
    this.unsubscribe();
    this.fill.style.width = "100%";
    this.pct.textContent = "100%";
    this.what.textContent = "ready";
    // A beat at 100% before the fade. Snapping the screen away the instant the
    // last byte lands makes a long load feel like it ended in a glitch.
    window.setTimeout(() => {
      this.el.classList.add("gone");
      window.setTimeout(() => this.el.remove(), 500);
    }, 160);
  }
}

/**
 * What the file currently being fetched means.
 *
 * The raw name is the honest thing and it is the wrong thing to show: nobody
 * pressed Play to read `nature/Pebble_Square_2.gltf`. The exact name is still on
 * `__wieldboundLoad` for anyone diagnosing a stuck load — this line is for the
 * person waiting, and what they want to know is which part of the world is
 * being built.
 */
function phaseFor(label: string): string {
  if (!label) return "preparing";
  if (/^(grass|dirt)_/.test(label)) return "laying the ground";
  if (/^nature\/(CommonTree|Pine|TwistedTree|DeadTree|Bush)/.test(label)) return "raising the treeline";
  if (label.startsWith("nature/")) return "scattering the field";
  if (label.startsWith("props/")) return "building the smithy";
  if (/^(Warrior|Ranger|Wizard|Monk|Rogue|Cleric)/.test(label)) return "dressing your character";
  // The character rigs are FBX and their textures are loose PNGs; everything
  // else at the models root is a creature from the monsters pack.
  if (label.endsWith("_Texture.png") || label.endsWith(".png")) return "dressing your character";
  if (label.endsWith(".gltf")) return "waking the camps";
  return "loading";
}

/**
 * Something to read while waiting. Drawn from what the game actually does, so
 * the wait teaches the one rule a new player most needs and cannot guess:
 * there is no class picker.
 */
export const LOADING_HINTS = [
  "There is no class selection. Pick up a sword and you fight as a Warrior; drop it for a staff and you are a Mage, mid-fight.",
  "Every weapon has its own talent tree, and its own levels. Drawing a staff for the first time really does start that tree at zero.",
  "Difficulty radiates from the smithy at the world's centre. Walking further out is the progression.",
  "A troll winds up before it slams. That is a mechanic you answer by moving, not by out-healing.",
  "Monsters attack whoever has hurt them most — and the same table decides who the experience belongs to.",
  "Bare-handed you are an Adventurer: weak, but a real archetype with its own tree rather than a broken state.",
  "A golem's armour subtracts from every hit, so a fast weapon does nothing to it. Bring something heavy.",
  "Your action bar is yours. Drag skills where you want them, rebind any key, and the layout is remembered per weapon.",
  "A full day passes in twenty-four minutes. Night is only light and colour — for now.",
];

export function randomHint(): string {
  return LOADING_HINTS[Math.floor(Math.random() * LOADING_HINTS.length)];
}
