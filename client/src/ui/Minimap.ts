// The minimap.
//
// Renderer-agnostic like the rest of `ui/`: it is a 2D canvas fed a plain
// snapshot of positions once a frame, and knows nothing about three.js. That
// keeps it testable and means it would survive another renderer swap the way
// the DOM panels survived the last one.
//
// Everything the player might want to change is a setting, and every setting is
// persisted. A minimap is a thing people have strong habits about — some want it
// rotating with their facing, some find that nauseating; some want it large,
// some want the screen back — so the useful version is the configurable one
// rather than whichever default I happened to like.

import { iconSvg } from "./icons";

/** Where something is, in three.js world units (x east, z south). */
export interface Blip {
  x: number;
  z: number;
}

export interface MinimapMonster extends Blip {
  /** Drawn brighter, and ringed, when this is what you are fighting. */
  engaged?: boolean;
  /** Drawn as a hollow ring, for a monster you deliberately locked. */
  locked?: boolean;
  /** Dead monsters stay on the map, dimmed, until they respawn. */
  dead?: boolean;
  /**
   * This monster's AI has the local player as its target — same fact and
   * same reason as the nameplate's own "hunting" mark (M70.10). Ringed
   * only when NOT already `engaged`/`locked`, which is the one case this
   * adds a signal for at all: something coming for you from off-plate
   * range, before it is close enough to be worth a nameplate or a click.
   */
  targetingMe?: boolean;
}

export interface MinimapNode extends Blip {
  kind: "tree" | "rock" | "bush";
  depleted?: boolean;
}

export interface MinimapSnapshot {
  /** The local player. `facing` is a compass bearing in radians. */
  player: { x: number; z: number; facing: number };
  players: Blip[];
  monsters: MinimapMonster[];
  nodes: MinimapNode[];
  stations: Blip[];
  /**
   * Where you have been told to go.
   *
   * Almost always OFF the map — the nearest waystone is 1,560 server pixels
   * from spawn and the widest zoom shows about a third of that — which is
   * exactly why these are not blips. A dot that is only visible once you have
   * nearly arrived is a dot that helps at the one moment you no longer need it,
   * so a guide is clamped to the rim and drawn as an arrow pointing at the
   * thing, with how far it still is underneath.
   */
  guides: { x: number; z: number; label: string; distancePx: number }[];
  /** Loot on the ground, each carrying its quality's colour. */
  drops: { x: number; z: number; color: string }[];
  /** Half-extents of the playable rectangle, for the boundary outline. */
  bounds: { halfWidth: number; halfHeight: number };
  /**
   * What this place is called, or null out in open country.
   *
   * The only channel through which most of the names in this world reach the
   * player. Six woods, a river and a road have names that until now existed in
   * a table and in quest text; the map is where somebody looks to ask where
   * they are, so it is where the answer goes. Null is a real answer — see
   * shared/places.ts.
   */
  place: string | null;
}

export interface MinimapSettings {
  shape: "circle" | "square";
  /** Canvas edge length in CSS pixels. */
  size: number;
  /** World units from the centre to the edge. Smaller is more zoomed in. */
  range: number;
  /** Turn the map with the player, or keep north up. */
  rotate: boolean;
  showMonsters: boolean;
  showNodes: boolean;
  showPlayers: boolean;
  showStations: boolean;
  showDrops: boolean;
  showGuides: boolean;
  showGrid: boolean;
  showCoords: boolean;
  opacity: number;
}

const STORAGE_KEY = "wieldbound.minimap";

const DEFAULTS: MinimapSettings = {
  shape: "circle",
  size: 190,
  range: 46,
  rotate: false,
  showMonsters: true,
  showNodes: true,
  showPlayers: true,
  showStations: true,
  showDrops: true,
  showGuides: true,
  showGrid: true,
  showCoords: true,
  opacity: 1,
};

export const MIN_RANGE = 14;
export const MAX_RANGE = 180;
export const SIZES = [150, 190, 240, 300];

const COLORS = {
  ground: "#3c4a24",
  groundEdge: "#2a3418",
  grid: "rgba(226,176,79,0.10)",
  bounds: "rgba(226,176,79,0.42)",
  tree: "#5f9a3e",
  rock: "#9a948a",
  bush: "#7fae4d",
  depleted: "#4a4636",
  monster: "#d8484a",
  monsterDead: "#5a3a3a",
  engaged: "#ff9a4a",
  player: "#6fc4ff",
  self: "#ffd873",
  station: "#e2b04f",
  guide: "#ffd873",
};

function loadSettings(): MinimapSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MinimapSettings>;
      // Merged over the defaults rather than trusted wholesale, so a stored
      // blob from an older version cannot leave a setting undefined.
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Corrupt or unavailable storage is not worth failing to draw a map over.
  }
  return { ...DEFAULTS };
}

export class Minimap {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly coordsEl: HTMLElement;
  private readonly placeEl: HTMLElement;
  private readonly zoomEl: HTMLElement;
  private readonly panel: HTMLElement;

  private settings: MinimapSettings = loadSettings();
  private snapshot: MinimapSnapshot | null = null;
  /** Device-pixel scale the backing store was last sized for. */
  private ratio = 1;
  /** Next time `setSnapshot` is allowed to actually redraw the canvas. */
  private nextDrawAt = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.id = "minimap";
    this.root.innerHTML = `
      <div class="mm-frame">
        <canvas class="mm-canvas"></canvas>
        <div class="mm-coords"></div>
      </div>
      <div class="mm-place"></div>
      <div class="mm-bar">
        <button class="mm-btn mm-out" title="Zoom out">−</button>
        <span class="mm-zoom">—</span>
        <button class="mm-btn mm-in" title="Zoom in">+</button>
        <button class="mm-btn mm-cog" title="Minimap settings"></button>
      </div>
      <div class="mm-panel"></div>
    `;
    parent.appendChild(this.root);

    this.canvas = this.root.querySelector(".mm-canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.coordsEl = this.root.querySelector(".mm-coords")!;
    this.placeEl = this.root.querySelector(".mm-place")!;
    this.zoomEl = this.root.querySelector(".mm-zoom")!;
    this.panel = this.root.querySelector(".mm-panel")!;
    (this.root.querySelector(".mm-cog") as HTMLElement).innerHTML = iconSvg("settings");

    this.root.querySelector(".mm-out")!.addEventListener("click", () => this.zoom(1.3));
    this.root.querySelector(".mm-in")!.addEventListener("click", () => this.zoom(1 / 1.3));
    this.root.querySelector(".mm-cog")!.addEventListener("click", () => {
      this.panel.classList.toggle("open");
    });

    // The wheel zooms the map, and must not also zoom the camera behind it.
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.zoom(e.deltaY > 0 ? 1.18 : 1 / 1.18);
      },
      { passive: false },
    );

    this.buildPanel();
    this.applySettings();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Not being able to remember a preference is not worth an exception.
    }
  }

  private zoom(factor: number): void {
    this.settings.range = Math.round(
      Math.max(MIN_RANGE, Math.min(MAX_RANGE, this.settings.range * factor)),
    );
    this.save();
    this.applySettings();
  }

  /** Builds the settings popover from the settings themselves. */
  private buildPanel(): void {
    const toggles: [keyof MinimapSettings, string][] = [
      ["showMonsters", "Monsters"],
      ["showNodes", "Resources"],
      ["showPlayers", "Players"],
      ["showStations", "Workbench"],
      ["showDrops", "Loot"],
      ["showGuides", "Objectives"],
      ["showGrid", "Grid"],
      ["showCoords", "Coordinates"],
      ["rotate", "Rotate with facing"],
    ];

    const rows: string[] = [`<div class="mm-panel-title">Minimap</div>`];
    for (const [key, label] of toggles) {
      rows.push(
        `<label class="mm-row"><input type="checkbox" data-key="${key}"><span>${label}</span></label>`,
      );
    }
    rows.push(`<div class="mm-panel-sep"></div>`);
    rows.push(
      `<div class="mm-row mm-row-inline"><span>Shape</span>` +
        `<span class="mm-seg" data-seg="shape">` +
        `<button data-value="circle">Circle</button><button data-value="square">Square</button>` +
        `</span></div>`,
    );
    rows.push(
      `<div class="mm-row mm-row-inline"><span>Size</span>` +
        `<span class="mm-seg" data-seg="size">` +
        SIZES.map((s, i) => `<button data-value="${s}">${["S", "M", "L", "XL"][i]}</button>`).join("") +
        `</span></div>`,
    );
    rows.push(
      `<label class="mm-row mm-row-inline"><span>Opacity</span>` +
        `<input type="range" min="30" max="100" step="5" data-key="opacity"></label>`,
    );
    rows.push(`<button class="mm-reset">Reset to defaults</button>`);
    this.panel.innerHTML = rows.join("");

    for (const input of Array.from(this.panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) {
      input.addEventListener("change", () => {
        (this.settings as unknown as Record<string, boolean>)[input.dataset.key!] = input.checked;
        this.save();
        this.applySettings();
      });
    }

    const opacity = this.panel.querySelector<HTMLInputElement>('input[data-key="opacity"]')!;
    opacity.addEventListener("input", () => {
      this.settings.opacity = Number(opacity.value) / 100;
      this.save();
      this.applySettings();
    });

    for (const seg of Array.from(this.panel.querySelectorAll<HTMLElement>(".mm-seg"))) {
      const key = seg.dataset.seg as "shape" | "size";
      for (const button of Array.from(seg.querySelectorAll("button"))) {
        button.addEventListener("click", () => {
          const value = button.dataset.value!;
          if (key === "size") this.settings.size = Number(value);
          else this.settings.shape = value as "circle" | "square";
          this.save();
          this.applySettings();
        });
      }
    }

    this.panel.querySelector(".mm-reset")!.addEventListener("click", () => {
      this.settings = { ...DEFAULTS };
      this.save();
      this.applySettings();
    });
  }

  /** Pushes the current settings into the DOM and resizes the canvas. */
  private applySettings(): void {
    const s = this.settings;

    for (const input of Array.from(this.panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) {
      input.checked = Boolean((this.settings as unknown as Record<string, boolean>)[input.dataset.key!]);
    }
    const opacity = this.panel.querySelector<HTMLInputElement>('input[data-key="opacity"]');
    if (opacity) opacity.value = String(Math.round(s.opacity * 100));

    for (const seg of Array.from(this.panel.querySelectorAll<HTMLElement>(".mm-seg"))) {
      const key = seg.dataset.seg as "shape" | "size";
      const current = key === "size" ? String(s.size) : s.shape;
      for (const button of Array.from(seg.querySelectorAll("button"))) {
        button.classList.toggle("active", button.dataset.value === current);
      }
    }

    this.root.classList.toggle("mm-square", s.shape === "square");
    this.root.style.opacity = String(s.opacity);
    this.coordsEl.style.display = s.showCoords ? "block" : "none";
    this.zoomEl.textContent = `${s.range}u`;

    // The backing store is sized in device pixels and the element in CSS
    // pixels, or the whole map is soft on any display past 1x.
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${s.size}px`;
    this.canvas.style.height = `${s.size}px`;
    this.canvas.width = Math.round(s.size * this.ratio);
    this.canvas.height = Math.round(s.size * this.ratio);

    // The window rail is told how much room the map takes, so the two can never
    // overlap however large the player makes it. Setting a variable rather than
    // reaching into the rail keeps this from having to know the rail exists.
    // 58 is the zoom bar and the frame's own margins; 18 is the place line,
    // which is ALWAYS that tall even when it is empty. Reserving the row rather
    // than collapsing it is the point: the readout goes blank every time you
    // walk out of a wood, and a rail that stepped up and down as you crossed a
    // treeline would be the most distracting thing on the screen.
    document.documentElement.style.setProperty("--minimap-bottom", `${s.size + 58 + 18}px`);

    this.draw();
  }

  /**
   * An objective marker: an arrow at the rim when it is off the map, a ring
   * when it is on it, and the remaining distance either way.
   *
   * Clamped rather than clipped, and the two shapes are the whole design. A
   * marker that vanished at the edge would be useless for the case it exists
   * for — every waystone is further away than the widest zoom reaches — and one
   * that stayed an arrow after you arrived would be pointing at your own feet.
   * Switching to a ring at the moment it comes on the map is the map saying
   * "you can see it now".
   */
  private drawGuide(
    ctx: CanvasRenderingContext2D,
    at: [number, number],
    half: number,
    shape: "circle" | "square",
    guide: { label: string; distancePx: number },
  ): void {
    let [px, py] = at;
    const dx = px - half;
    const dy = py - half;
    // The rim, minus room for the arrowhead and the label under it.
    const rim = half - 16;
    const dist = Math.hypot(dx, dy);
    const offMap =
      shape === "circle" ? dist > rim : Math.abs(dx) > rim || Math.abs(dy) > rim;

    if (offMap) {
      // Scaled onto the rim along the same bearing, so the arrow points at the
      // real thing rather than at the nearest corner.
      const k =
        shape === "circle"
          ? rim / (dist || 1)
          : rim / Math.max(Math.abs(dx), Math.abs(dy), 1);
      px = half + dx * k;
      py = half + dy * k;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
      ctx.fillStyle = COLORS.guide;
      ctx.beginPath();
      ctx.moveTo(0, -6.5);
      ctx.lineTo(5, 4);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.strokeStyle = COLORS.guide;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.guide;
      ctx.fill();
    }

    // Rounded to the nearest ten so it is not a slot machine while you walk.
    const label = `${Math.round(guide.distancePx / 10) * 10}`;
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(label, px + 1, py + 8);
    ctx.fillStyle = COLORS.guide;
    ctx.fillText(label, px, py + 7);
  }

  /**
   * Replaces the world state the map draws. Called once a frame — but the
   * canvas itself is a Canvas2D redraw (grid, every node/station/monster dot,
   * a `fillText` label per guide arrow), and a corner overview map doesn't
   * need that redone 60 to 144 times a second to read as live. Throttled to
   * 20Hz: the snapshot is kept current every call so nothing reads stale
   * data, only the actual `draw()` — the expensive part — is rationed.
   */
  setSnapshot(snapshot: MinimapSnapshot): void {
    this.snapshot = snapshot;
    const now = performance.now();
    if (now < this.nextDrawAt) return;
    this.nextDrawAt = now + 50;
    this.draw();
  }

  private draw(): void {
    const s = this.settings;
    const ctx = this.ctx;
    const size = s.size;
    const half = size / 2;

    ctx.save();
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Clip to the frame first, so nothing has to be range-checked while drawing.
    ctx.beginPath();
    if (s.shape === "circle") ctx.arc(half, half, half, 0, Math.PI * 2);
    else ctx.rect(0, 0, size, size);
    ctx.clip();

    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, size, size);

    const snap = this.snapshot;
    if (!snap) {
      ctx.restore();
      return;
    }

    // World units to map pixels.
    const scale = half / s.range;
    // North-up unless the player asked otherwise. Rotating means turning the
    // world the opposite way to the facing, so the player's nose stays up.
    const angle = s.rotate ? -snap.player.facing : 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const project = (x: number, z: number): [number, number] => {
      const dx = (x - snap.player.x) * scale;
      const dz = (z - snap.player.z) * scale;
      return [half + dx * cos - dz * sin, half + dx * sin + dz * cos];
    };

    if (s.showGrid) this.drawGrid(ctx, snap, project, scale, size);
    this.drawBounds(ctx, snap, project);

    if (s.showNodes) {
      for (const n of snap.nodes) {
        const [px, py] = project(n.x, n.z);
        this.dot(ctx, px, py, 2.4, n.depleted ? COLORS.depleted : COLORS[n.kind]);
      }
    }

    if (s.showStations) {
      for (const st of snap.stations) {
        const [px, py] = project(st.x, st.z);
        this.diamond(ctx, px, py, 4.6, COLORS.station);
      }
    }

    // Drawn above the nodes and below the monsters: loot is worth walking to
    // and is not worth walking INTO something for. Each takes the item's own
    // quality colour, which is the same colour its plate and its bag slot use —
    // so a violet dot at the edge of the map means the same thing everywhere.
    if (s.showDrops) {
      for (const d of snap.drops) {
        const [px, py] = project(d.x, d.z);
        this.diamond(ctx, px, py, 3.2, d.color);
      }
    }

    if (s.showGuides) {
      for (const g of snap.guides) this.drawGuide(ctx, project(g.x, g.z), half, s.shape, g);
    }

    if (s.showMonsters) {
      for (const m of snap.monsters) {
        const [px, py] = project(m.x, m.z);
        if (m.dead) {
          this.dot(ctx, px, py, 2, COLORS.monsterDead);
          continue;
        }
        this.dot(ctx, px, py, m.engaged ? 3.4 : 2.8, m.engaged ? COLORS.engaged : COLORS.monster);
        if (m.locked || m.engaged) {
          ctx.strokeStyle = m.locked ? "#fff0c8" : COLORS.engaged;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(px, py, 5.6, 0, Math.PI * 2);
          ctx.stroke();
        } else if (m.targetingMe) {
          // Same red the nameplate's own hunting mark uses, reserved for
          // exactly the case neither ring above already covers.
          ctx.strokeStyle = "#ff5a4a";
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(px, py, 5.6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    if (s.showPlayers) {
      for (const p of snap.players) {
        const [px, py] = project(p.x, p.z);
        this.dot(ctx, px, py, 3, COLORS.player);
      }
    }

    // The player last, so nothing can be drawn over them.
    this.drawSelf(ctx, half, half, s.rotate ? 0 : snap.player.facing);

    ctx.restore();

    if (s.showCoords) {
      this.coordsEl.textContent = `${Math.round(snap.player.x)}, ${Math.round(snap.player.z)}`;
    }
    // Assigned rather than compared first: setting textContent to the value it
    // already holds does not dirty the DOM, so the guard would buy nothing and
    // cost a branch on every frame the map redraws.
    this.placeEl.textContent = snap.place ?? "";
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    snap: MinimapSnapshot,
    project: (x: number, z: number) => [number, number],
    scale: number,
    size: number,
  ): void {
    // Grid spacing adapts to the zoom, so it stays a readable handful of lines
    // rather than a solid wash when zoomed out or two lines when zoomed in.
    const target = 40; // pixels between lines, roughly
    const step = Math.max(5, Math.round(target / scale / 5) * 5);
    const range = this.settings.range;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const startX = Math.floor((snap.player.x - range) / step) * step;
    const endX = snap.player.x + range;
    for (let x = startX; x <= endX; x += step) {
      const [ax, ay] = project(x, snap.player.z - range * 1.5);
      const [bx, by] = project(x, snap.player.z + range * 1.5);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    const startZ = Math.floor((snap.player.z - range) / step) * step;
    const endZ = snap.player.z + range;
    for (let z = startZ; z <= endZ; z += step) {
      const [ax, ay] = project(snap.player.x - range * 1.5, z);
      const [bx, by] = project(snap.player.x + range * 1.5, z);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    void size;
  }

  /** The edge of the playable rectangle — the one thing that is not relative. */
  private drawBounds(
    ctx: CanvasRenderingContext2D,
    snap: MinimapSnapshot,
    project: (x: number, z: number) => [number, number],
  ): void {
    const { halfWidth, halfHeight } = snap.bounds;
    const corners: [number, number][] = [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight],
    ];
    ctx.strokeStyle = COLORS.bounds;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    corners.forEach(([x, z], i) => {
      const [px, py] = project(x, z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  }

  private dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  /** An arrowhead, so the player can see which way they are pointing. */
  private drawSelf(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(facing);
    ctx.fillStyle = COLORS.self;
    ctx.strokeStyle = "#2a1f0a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
