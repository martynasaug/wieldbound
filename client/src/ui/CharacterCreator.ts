// THE CHARACTER CREATOR.
//
// Asked for: "A player gets to customize their character on the first login.
// Lets make a bunch of different face features, hair, colors and so on. Just
// like any game that has a character customization."
//
// IT RUNS INSIDE THE WORLD, NOT IN FRONT OF IT. The character being shaped is
// the real local actor, standing where the player arrived, lit by the real sun —
// so what you choose is exactly what you will walk out as, and there is no
// second renderer, second copy of the body or second lighting rig to disagree
// with the game. The creator only owns a panel and the camera.
//
// It knows nothing about geometry. Every option comes from `LOOK_OPTIONS` in
// `shared/look.ts`, so adding a hairstyle is a table row and a branch in
// `gear.ts`, and this file never changes.

import * as THREE from "three";

import {
  LOOK_CATEGORIES,
  lookOption,
  randomLook,
  type CharacterLook,
  type LookKey,
} from "../../../shared/look";

export interface CreatorHandlers {
  /** Every change, as it happens — the caller puts it on the character. */
  onChange: (look: CharacterLook) => void;
  /** The player is finished. */
  onDone: (look: CharacterLook) => void;
  /** A CSS colour for a skin tone swatch, which only the renderer can work out. */
  skinSwatch: (toneId: string) => string;
}

/** Anything with a position and a facing — the local actor, in practice. */
export interface CreatorSubject {
  readonly position: THREE.Vector3;
  /** Which way the body faces; forward is (sin, cos). See `Actor.heading`. */
  readonly heading: number;
}

const STYLE_ID = "wb-creator-style";

const CSS = `
#creator-root{position:fixed;inset:0;z-index:35;pointer-events:none;font-family:Georgia,"Times New Roman",serif;color:#eadcc0}
#creator-root .cc-panel{pointer-events:auto;position:absolute;left:24px;top:50%;transform:translateY(-50%);width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(32,24,16,.95),rgba(18,13,9,.95));border:1px solid var(--gold-dim,#8a6a30);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.55)}
#creator-root .cc-head{padding:16px 18px 10px}
#creator-root .cc-head h2{margin:0;font-size:21px;color:var(--gold-bright,#ffd873);letter-spacing:.02em}
#creator-root .cc-head p{margin:4px 0 0;font-size:12px;color:#a8977a}
#creator-root .cc-tabs{display:flex;gap:4px;padding:0 12px;flex-wrap:wrap}
#creator-root .cc-tab{flex:1 1 auto;padding:7px 6px;border:1px solid rgba(138,106,48,.5);border-bottom:none;border-radius:6px 6px 0 0;background:rgba(0,0,0,.25);color:#cbb994;font:inherit;font-size:13px;cursor:pointer}
#creator-root .cc-tab:hover{color:var(--gold-bright,#ffd873)}
#creator-root .cc-tab.active{background:rgba(226,176,79,.18);color:var(--gold-bright,#ffd873);border-color:var(--gold,#e2b04f)}
#creator-root .cc-body{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 4px;border-top:1px solid rgba(226,176,79,.35)}
#creator-root .cc-opt{margin-bottom:16px}
#creator-root .cc-label{display:flex;justify-content:space-between;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#a8977a;margin-bottom:7px}
#creator-root .cc-label b{font-weight:normal;text-transform:none;letter-spacing:0;color:#e2cfa6}
#creator-root .cc-step{display:flex;align-items:center;gap:8px}
#creator-root .cc-arrow{flex:none;width:36px;height:36px;border-radius:6px;border:1px solid var(--gold-dim,#8a6a30);background:rgba(0,0,0,.3);color:var(--gold,#e2b04f);font-size:18px;line-height:1;cursor:pointer}
#creator-root .cc-arrow:hover{border-color:var(--gold,#e2b04f);color:var(--gold-bright,#ffd873)}
#creator-root .cc-value{flex:1;text-align:center;font-size:15px;line-height:1.2}
#creator-root .cc-count{display:block;font-size:11px;color:#8d7d62}
#creator-root .cc-swatches{display:flex;flex-wrap:wrap;gap:7px}
#creator-root .cc-swatch{width:28px;height:28px;border-radius:50%;border:2px solid rgba(0,0,0,.65);box-shadow:0 0 0 1px rgba(226,176,79,.3);cursor:pointer;padding:0}
#creator-root .cc-swatch:hover{box-shadow:0 0 0 1px var(--gold,#e2b04f)}
#creator-root .cc-swatch.active{box-shadow:0 0 0 2px var(--gold-bright,#ffd873)}
#creator-root .cc-foot{display:flex;gap:8px;padding:12px 16px 16px;border-top:1px solid rgba(138,106,48,.4)}
#creator-root .cc-foot button{font:inherit;border-radius:6px;cursor:pointer;padding:9px 10px;font-size:13px}
#creator-root .cc-random,#creator-root .cc-reset{background:rgba(0,0,0,.3);border:1px solid var(--gold-dim,#8a6a30);color:#e2cfa6}
#creator-root .cc-random:hover,#creator-root .cc-reset:hover{border-color:var(--gold,#e2b04f)}
#creator-root .cc-done{flex:1;background:linear-gradient(180deg,var(--gold-bright,#ffd873),var(--gold,#e2b04f));border:1px solid #6d5222;color:#2a1c0a;font-weight:bold}
#creator-root .cc-done:hover{filter:brightness(1.08)}
#creator-root .cc-hint{position:absolute;right:24px;bottom:22px;font-size:13px;color:rgba(234,220,192,.75);text-shadow:0 1px 3px #000}
body.wb-creating #game-frame > :not(canvas):not(#window-rail){visibility:hidden}
body.wb-creating #window-rail{display:none}
@media (max-width:760px){
  #creator-root .cc-panel{left:8px;right:8px;top:auto;bottom:8px;transform:none;width:auto;max-height:50vh}
  #creator-root .cc-hint{display:none}
}
`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/** Where the camera sits for each framing, as distance and height above the feet. */
const FRAMING = {
  body: { distance: 3.5, height: 0.95 },
  face: { distance: 1.2, height: 1.62 },
};

export class CharacterCreator {
  private look: CharacterLook;
  private readonly initial: CharacterLook;
  private readonly root = document.createElement("div");
  private readonly panel: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly body: HTMLElement;
  private tab: string = LOOK_CATEGORIES[0].id;
  /** Turn of the camera around the character, added to the way they face. */
  private yaw = 0;
  /** 0 frames the whole figure, 1 the face. Eased towards `zoomTarget`. */
  private zoom = 0;
  private zoomTarget = 0;
  private dragX: number | null = null;
  private closed = false;
  private readonly unbind: (() => void)[] = [];
  private readonly target = new THREE.Vector3();

  constructor(initial: CharacterLook, private readonly handlers: CreatorHandlers) {
    this.initial = { ...initial };
    this.look = { ...initial };
    injectStyle();

    this.root.id = "creator-root";
    this.root.innerHTML = `
      <div class="cc-panel">
        <div class="cc-head">
          <h2>Shape your character</h2>
          <p>Everyone in Emberhold will know you by this.</p>
        </div>
        <div class="cc-tabs"></div>
        <div class="cc-body"></div>
        <div class="cc-foot">
          <button class="cc-random" title="A whole new look">Randomize</button>
          <button class="cc-reset" title="Back to where you started">Reset</button>
          <button class="cc-done">Enter the world</button>
        </div>
      </div>
      <div class="cc-hint">Drag to turn · scroll to zoom</div>`;
    this.panel = this.root.querySelector(".cc-panel")!;
    this.tabs = this.root.querySelector(".cc-tabs")!;
    this.body = this.root.querySelector(".cc-body")!;

    this.root.querySelector(".cc-random")!.addEventListener("click", () => this.replace(randomLook()));
    this.root.querySelector(".cc-reset")!.addEventListener("click", () => this.replace({ ...this.initial }));
    this.root.querySelector(".cc-done")!.addEventListener("click", () => this.finish());

    document.body.appendChild(this.root);
    document.body.classList.add("wb-creating");
    this.bindDrag();
    this.setTab(this.tab);
  }

  get current(): CharacterLook {
    return { ...this.look };
  }

  /** Change one field, as a click on the panel would. Exposed for tests. */
  set(key: LookKey, id: string): void {
    const option = lookOption(key);
    if (!option.choices.some((c) => c.id === id)) return;
    this.look = { ...this.look, [key]: id } as CharacterLook;
    this.handlers.onChange(this.current);
    this.renderBody();
  }

  setTab(id: string): void {
    const category = LOOK_CATEGORIES.find((c) => c.id === id) ?? LOOK_CATEGORIES[0];
    this.tab = category.id;
    this.zoomTarget = category.focus === "face" ? 1 : 0;
    this.renderTabs();
    this.renderBody();
  }

  /** Accept the look as it stands. */
  finish(): void {
    if (this.closed) return;
    const look = this.current;
    this.close();
    this.handlers.onDone(look);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const off of this.unbind) off();
    this.root.remove();
    document.body.classList.remove("wb-creating");
  }

  /**
   * Put the camera on the character. Called every frame after the game's own
   * follow, which still runs so the sun and its shadow keep tracking the player.
   */
  frameCamera(camera: THREE.PerspectiveCamera, subject: CreatorSubject, dtSeconds: number): void {
    this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dtSeconds * 6);
    const distance = FRAMING.body.distance + (FRAMING.face.distance - FRAMING.body.distance) * this.zoom;
    const height = FRAMING.body.height + (FRAMING.face.height - FRAMING.body.height) * this.zoom;
    const facing = subject.heading + this.yaw;
    const toCamera = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const right = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));

    this.target.set(subject.position.x, subject.position.y + height, subject.position.z);
    // KEEP THE CHARACTER CLEAR OF THE PANEL. Beside it on a wide screen, above it
    // on a narrow one, by moving what the camera looks at rather than the body.
    // The look target is the centre of the screen, so moving it to the camera's
    // LEFT is what puts the character on the right, clear of the panel.
    if (window.innerWidth > 760) this.target.addScaledVector(right, -distance * 0.3);
    else this.target.y -= distance * 0.22;

    camera.position.copy(this.target).addScaledVector(toCamera, distance);
    camera.position.y += 0.1 + 0.3 * (1 - this.zoom);
    camera.lookAt(this.target);
  }

  private replace(look: CharacterLook): void {
    this.look = { ...look };
    this.handlers.onChange(this.current);
    this.renderBody();
  }

  private renderTabs(): void {
    this.tabs.innerHTML = "";
    // One group needs no tab row; it would be a button that does nothing.
    this.tabs.style.display = LOOK_CATEGORIES.length < 2 ? "none" : "";
    for (const category of LOOK_CATEGORIES) {
      const button = document.createElement("button");
      button.className = "cc-tab" + (category.id === this.tab ? " active" : "");
      button.textContent = category.label;
      button.dataset.tab = category.id;
      button.addEventListener("click", () => this.setTab(category.id));
      this.tabs.appendChild(button);
    }
  }

  private renderBody(): void {
    const scroll = this.body.scrollTop;
    this.body.innerHTML = "";
    const category = LOOK_CATEGORIES.find((c) => c.id === this.tab) ?? LOOK_CATEGORIES[0];
    for (const key of category.keys) {
      const option = lookOption(key);
      const selected = this.look[key];
      const index = Math.max(0, option.choices.findIndex((c) => c.id === selected));
      const choice = option.choices[index];

      const row = document.createElement("div");
      row.className = "cc-opt";
      row.dataset.key = key;
      const label = document.createElement("div");
      label.className = "cc-label";
      label.innerHTML = `<span></span><b></b>`;
      label.querySelector("span")!.textContent = option.label;
      label.querySelector("b")!.textContent = option.kind === "color" ? choice.label : "";
      row.appendChild(label);

      if (option.kind === "style") {
        const step = document.createElement("div");
        step.className = "cc-step";
        const prev = document.createElement("button");
        prev.className = "cc-arrow cc-prev";
        prev.textContent = "‹";
        prev.title = "Previous";
        const next = document.createElement("button");
        next.className = "cc-arrow cc-next";
        next.textContent = "›";
        next.title = "Next";
        const valueEl = document.createElement("div");
        valueEl.className = "cc-value";
        valueEl.textContent = choice.label;
        const count = document.createElement("span");
        count.className = "cc-count";
        count.textContent = `${index + 1} of ${option.choices.length}`;
        valueEl.appendChild(count);
        const n = option.choices.length;
        prev.addEventListener("click", () => this.set(key, option.choices[(index - 1 + n) % n].id));
        next.addEventListener("click", () => this.set(key, option.choices[(index + 1) % n].id));
        step.append(prev, valueEl, next);
        row.appendChild(step);
      } else {
        const swatches = document.createElement("div");
        swatches.className = "cc-swatches";
        for (const c of option.choices) {
          const swatch = document.createElement("button");
          swatch.className = "cc-swatch" + (c.id === selected ? " active" : "");
          swatch.title = c.label;
          swatch.dataset.id = c.id;
          swatch.style.background =
            key === "skin"
              ? this.handlers.skinSwatch(c.id)
              : `#${(c.hex ?? 0xffffff).toString(16).padStart(6, "0")}`;
          swatch.addEventListener("click", () => this.set(key, c.id));
          swatches.appendChild(swatch);
        }
        row.appendChild(swatches);
      }
      this.body.appendChild(row);
    }
    this.body.scrollTop = scroll;
  }

  /** Drag anywhere off the panel to turn the camera; wheel to zoom between figure and face. */
  private bindDrag(): void {
    const onPanel = (e: Event) => this.panel.contains(e.target as Node);
    const down = (e: PointerEvent) => {
      if (onPanel(e)) return;
      this.dragX = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (this.dragX === null) return;
      this.yaw -= (e.clientX - this.dragX) * 0.008;
      this.dragX = e.clientX;
    };
    const up = () => {
      this.dragX = null;
    };
    const wheel = (e: WheelEvent) => {
      if (onPanel(e)) return;
      this.zoomTarget = Math.min(1, Math.max(0, this.zoomTarget - Math.sign(e.deltaY) * 0.25));
    };
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("wheel", wheel, { passive: true });
    this.unbind.push(
      () => window.removeEventListener("pointerdown", down),
      () => window.removeEventListener("pointermove", move),
      () => window.removeEventListener("pointerup", up),
      () => window.removeEventListener("wheel", wheel),
    );
  }
}
