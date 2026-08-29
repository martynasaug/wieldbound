// One window for every setting the game has.
//
// They were scattered across four places nobody would find in order: graphics
// on F4 (a bare keypress that cycles three levels and tells you afterwards),
// sound on M, the minimap behind a cog on the minimap itself, and the camera
// distance on the mouse wheel with no way to read or type a number. Three of
// those are undiscoverable unless somebody tells you, and the F4 one changes
// the most expensive thing in the frame.
//
// So this is a window in the same rail as Character, Inventory, Talents and
// the Leaderboard, opened the same way, built from the same markup. It does not
// own any of the settings — every row reads and writes whatever already stored
// it, so the minimap cog and this panel can both be open and cannot disagree.
import { QUALITY, QUALITY_ORDER, type QualityLevel } from "../three/quality";
import type { MinimapSettings } from "./Minimap";

export interface SettingsHooks {
  quality: () => QualityLevel;
  setQuality: (level: QualityLevel) => void;
  /** Whether the graphics level is still following the machine (M70.105). */
  autoQuality: () => boolean;
  setAutoQuality: (on: boolean) => void;
  muted: () => boolean;
  setMuted: (muted: boolean) => void;
  volume: () => number;
  setVolume: (v: number) => void;
  cameraDistance: () => number;
  setCameraDistance: (d: number) => void;
  cameraRange: () => { min: number; max: number };
  minimap: () => MinimapSettings;
  setMinimap: (patch: Partial<MinimapSettings>) => void;
}

/** What each key does, for the Controls section. Read-only: rebinding lives on
 *  the hotbar, where the key being bound is the thing you are looking at. */
const KEYS: [string, string][] = [
  ["W A S D", "Move"],
  ["1 – 0", "Use the action in that slot"],
  ["Tab", "Next target"],
  ["Esc", "Release a locked target"],
  ["C", "Character"],
  ["I", "Inventory"],
  ["K", "Talents"],
  ["L", "Leaderboard"],
  ["O", "Settings (this window)"],
  ["M", "Mute sound"],
  ["F3", "Frame profiler"],
  ["F4", "Cycle graphics quality"],
  ["Mouse wheel", "Zoom the camera"],
  ["Click a monster", "Lock onto it; click again to release"],
  ["Click a townsperson", "Talk"],
];

export class SettingsPanel {
  private readonly overlay = document.getElementById("settings-overlay")!;
  private readonly body = document.getElementById("settings-body")!;
  /** Rebuilt only while on screen, for the reason every other panel here does
   *  it: `ITEMS_UPDATE` used to redraw thirty bag cells nobody was looking at
   *  (M70.90), and this window has more rows than that one. */
  private stale = true;

  constructor(private readonly hooks: SettingsHooks) {
    document.getElementById("settings-close")?.addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains("open");
  }

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  open(): void {
    this.overlay.classList.add("open");
    this.render();
  }

  close(): void {
    this.overlay.classList.remove("open");
  }

  /** Something changed the settings from somewhere else — F4, the M key, the
   *  minimap's own cog. Redraw if anybody is looking. */
  refresh(): void {
    if (this.isOpen) this.render();
    else this.stale = true;
  }

  private render(): void {
    this.stale = false;
    this.body.innerHTML = "";

    // --- graphics ---------------------------------------------------------
    this.section("Graphics");
    const level = this.hooks.quality();
    this.choice(
      "Quality",
      QUALITY_ORDER.map((l) => ({ id: l, label: QUALITY[l].label })),
      level,
      (id) => {
        // Choosing by hand is the same statement F4 makes: the player has an
        // opinion now, so adaptation stops.
        this.hooks.setAutoQuality(false);
        this.hooks.setQuality(id as QualityLevel);
        this.render();
      },
    );
    this.note(this.describe(level));
    this.check(
      "Adapt to this machine",
      this.hooks.autoQuality(),
      (on) => {
        this.hooks.setAutoQuality(on);
        this.render();
      },
      "Lowers the level if the frame cannot keep up with your display, and " +
        "raises it again when there is room. Choosing a level by hand turns this off.",
    );

    // --- sound ------------------------------------------------------------
    this.section("Sound");
    this.check("Muted", this.hooks.muted(), (on) => {
      this.hooks.setMuted(on);
      this.render();
    });
    this.slider("Volume", this.hooks.volume(), 0, 1, 0.05, (v) => this.hooks.setVolume(v),
      (v) => `${Math.round(v * 100)}%`);

    // --- camera -----------------------------------------------------------
    this.section("Camera");
    const range = this.hooks.cameraRange();
    this.slider(
      "Distance", this.hooks.cameraDistance(), range.min, range.max, 0.5,
      (v) => this.hooks.setCameraDistance(v),
      (v) => v.toFixed(1),
      "The mouse wheel does the same thing.",
    );

    // --- minimap ----------------------------------------------------------
    const mm = this.hooks.minimap();
    this.section("Minimap");
    this.choice("Shape", [{ id: "circle", label: "Circle" }, { id: "square", label: "Square" }],
      mm.shape, (id) => { this.hooks.setMinimap({ shape: id as "circle" | "square" }); this.render(); });
    this.slider("Size", mm.size, 120, 260, 10, (v) => this.hooks.setMinimap({ size: v }), (v) => `${v}px`);
    this.slider("Zoom", mm.range, 20, 160, 5, (v) => this.hooks.setMinimap({ range: v }),
      (v) => `${v}u`, "World units from the middle to the edge. Smaller is closer in.");
    this.slider("Opacity", mm.opacity, 0.2, 1, 0.05, (v) => this.hooks.setMinimap({ opacity: v }),
      (v) => `${Math.round(v * 100)}%`);
    this.check("Turn with the player", mm.rotate, (on) => this.hooks.setMinimap({ rotate: on }));
    for (const [key, label] of [
      ["showMonsters", "Show monsters"], ["showPlayers", "Show players"],
      ["showNodes", "Show resources"], ["showStations", "Show the forge"],
      ["showDrops", "Show loot"], ["showGuides", "Show quest arrows"],
      ["showGrid", "Show the grid"], ["showCoords", "Show coordinates"],
    ] as [keyof MinimapSettings, string][]) {
      this.check(label, mm[key] as boolean, (on) => this.hooks.setMinimap({ [key]: on } as Partial<MinimapSettings>));
    }

    // --- controls ---------------------------------------------------------
    this.section("Controls");
    for (const [key, what] of KEYS) {
      const row = document.createElement("div");
      row.className = "set-row set-keyrow";
      row.innerHTML = `<span class="set-key">${key}</span><span class="set-keywhat">${what}</span>`;
      this.body.appendChild(row);
    }
  }

  /** What this level actually costs, in the terms the player can see. */
  private describe(level: QualityLevel): string {
    const q = QUALITY[level];
    const parts = [
      q.shadows ? `shadows at ${q.shadowMapSize}` : "no shadows",
      q.coverShadows ? "grass casts shadows" : "grass casts none",
      `up to ${q.pixelRatioCap}x pixel density`,
      q.antialias ? "smoothed edges" : "no edge smoothing",
    ];
    return parts.join(" · ");
  }

  private section(title: string): void {
    const el = document.createElement("div");
    el.className = "set-section";
    el.textContent = title;
    this.body.appendChild(el);
  }

  private note(text: string): void {
    const el = document.createElement("div");
    el.className = "set-note";
    el.textContent = text;
    this.body.appendChild(el);
  }

  private row(label: string, control: HTMLElement, hint?: string): void {
    const row = document.createElement("div");
    row.className = "set-row";
    const name = document.createElement("span");
    name.className = "set-label";
    name.textContent = label;
    row.append(name, control);
    this.body.appendChild(row);
    if (hint) this.note(hint);
  }

  private choice(
    label: string,
    options: { id: string; label: string }[],
    current: string,
    pick: (id: string) => void,
  ): void {
    const group = document.createElement("div");
    group.className = "set-choice";
    for (const o of options) {
      const b = document.createElement("button");
      b.textContent = o.label;
      b.classList.toggle("active", o.id === current);
      b.addEventListener("click", () => pick(o.id));
      group.appendChild(b);
    }
    this.row(label, group);
  }

  private check(label: string, on: boolean, set: (on: boolean) => void, hint?: string): void {
    const b = document.createElement("button");
    b.className = "set-check";
    b.classList.toggle("on", on);
    b.textContent = on ? "On" : "Off";
    b.addEventListener("click", () => {
      const next = !b.classList.contains("on");
      b.classList.toggle("on", next);
      b.textContent = next ? "On" : "Off";
      set(next);
    });
    this.row(label, b, hint);
  }

  private slider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    set: (v: number) => void,
    format: (v: number) => string,
    hint?: string,
  ): void {
    const wrap = document.createElement("div");
    wrap.className = "set-slider";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const out = document.createElement("span");
    out.className = "set-value";
    out.textContent = format(value);
    // `input` rather than `change`, so dragging a volume slider is audible
    // while it is being dragged rather than only when it is let go.
    input.addEventListener("input", () => {
      const v = Number(input.value);
      out.textContent = format(v);
      set(v);
    });
    wrap.append(input, out);
    this.row(label, wrap, hint);
  }
}
