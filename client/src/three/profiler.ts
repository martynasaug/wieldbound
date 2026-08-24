// A FRAME BUDGET YOU CAN READ.
//
// "The game is lagging/freezing a lot" is a report nothing in this codebase
// could answer. The render loop runs about thirty subsystems per frame — actors,
// npcs, plates, minimap, indicators, day/night, road, river, ambience, mist —
// and every one of them was added for a good reason and none of them has ever
// been timed. Optimising by reading that list and picking the one that LOOKS
// expensive is how you spend a day making the cheap thing cheaper.
//
// So this measures instead. It is deliberately a development instrument and not
// a setting: off by default, toggled with F3, and costing one boolean test per
// section while it is off.
//
// It reports two different kinds of slow, because they have different causes and
// different fixes:
//
//   AVERAGE frame time is throughput — too much work every frame. Shows up as a
//   low steady FPS, and is fixed by doing less (fewer draw calls, a smaller
//   shadow map, a cheaper pixel ratio).
//
//   WORST frame time over the window is a STALL — a garbage collection, a model
//   decode, a shader compile. Shows up as the freezing and hitching a player
//   actually complains about, and averages hide it completely: sixty frames at
//   8ms and one at 400ms is a visible lurch and a perfectly respectable 22ms
//   average.

const WINDOW_MS = 500;

interface Section {
  total: number;
  worst: number;
  calls: number;
  startedAt: number;
}

export class Profiler {
  private on = false;
  private el: HTMLElement | null = null;
  private sections = new Map<string, Section>();
  private order: string[] = [];
  private frames = 0;
  private frameTotal = 0;
  private frameWorst = 0;
  private frameStart = 0;
  private windowStart = 0;
  /** Filled in by the owner each window, so the profiler needs no reference to
   *  the renderer and cannot keep one alive. */
  private stats: Record<string, number> = {};

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "F3") {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  get enabled(): boolean {
    return this.on;
  }

  toggle(): void {
    this.on = !this.on;
    if (!this.on) {
      this.el?.remove();
      this.el = null;
      this.sections.clear();
      this.order = [];
      return;
    }
    const el = document.createElement("div");
    el.id = "profiler";
    // Inline rather than in the stylesheet: this is an instrument, and it should
    // not be possible to break the game's own CSS by adding one.
    el.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:9999;font:11px/1.45 ui-monospace,Consolas,monospace;" +
      "background:rgba(8,10,14,.86);color:#d8e2ea;padding:8px 10px;border:1px solid #2b3644;" +
      "border-radius:6px;white-space:pre;pointer-events:none;min-width:250px";
    document.body.appendChild(el);
    this.el = el;
    this.windowStart = performance.now();
  }

  /** Whole-frame timing. Call at the very top of the loop body. */
  frameBegin(): void {
    if (!this.on) return;
    this.frameStart = performance.now();
  }

  /** Whatever the owner wants shown alongside the timings — draw calls,
   *  triangles, resident geometries. Read once per frame by the caller because
   *  three.js resets some of these on every render. */
  setStats(stats: Record<string, number>): void {
    if (!this.on) return;
    this.stats = stats;
  }

  begin(label: string): void {
    if (!this.on) return;
    let s = this.sections.get(label);
    if (!s) {
      s = { total: 0, worst: 0, calls: 0, startedAt: 0 };
      this.sections.set(label, s);
      this.order.push(label);
    }
    s.startedAt = performance.now();
  }

  end(label: string): void {
    if (!this.on) return;
    const s = this.sections.get(label);
    if (!s || !s.startedAt) return;
    const ms = performance.now() - s.startedAt;
    s.startedAt = 0;
    s.total += ms;
    s.calls++;
    if (ms > s.worst) s.worst = ms;
  }

  /** Closes the frame and, once per window, rebuilds the readout. */
  frameEnd(): void {
    if (!this.on || !this.el) return;
    const now = performance.now();
    const ms = now - this.frameStart;
    this.frames++;
    this.frameTotal += ms;
    if (ms > this.frameWorst) this.frameWorst = ms;

    if (now - this.windowStart < WINDOW_MS) return;
    const elapsed = now - this.windowStart;
    const fps = (this.frames * 1000) / elapsed;
    const avg = this.frameTotal / Math.max(1, this.frames);

    // Sorted by what they cost, because the list is thirty long and the only
    // question anybody opens this to ask is which three are the problem.
    const rows = this.order
      .map((label) => ({ label, s: this.sections.get(label)! }))
      .filter((r) => r.s.calls > 0)
      .sort((a, b) => b.s.total - a.s.total)
      .slice(0, 12)
      .map((r) => {
        const per = r.s.total / Math.max(1, this.frames);
        return `  ${r.label.padEnd(15).slice(0, 15)} ${per.toFixed(2).padStart(6)}ms ` +
          `${("max " + r.s.worst.toFixed(1)).padStart(9)}`;
      });

    const statLines = Object.entries(this.stats).map(
      ([k, v]) => `  ${k.padEnd(15)} ${String(Math.round(v)).padStart(8)}`,
    );

    this.el.textContent =
      `F3 profiler\n` +
      `  fps             ${fps.toFixed(1).padStart(8)}\n` +
      `  frame avg       ${avg.toFixed(2).padStart(8)}ms\n` +
      // The number that explains hitching. Called out rather than listed,
      // because a worst frame far above the average IS the complaint.
      `  frame WORST     ${this.frameWorst.toFixed(1).padStart(8)}ms\n` +
      (statLines.length ? statLines.join("\n") + "\n" : "") +
      `  ---- sections ----\n` +
      rows.join("\n");

    this.frames = 0;
    this.frameTotal = 0;
    this.frameWorst = 0;
    this.windowStart = now;
    for (const s of this.sections.values()) {
      s.total = 0;
      s.worst = 0;
      s.calls = 0;
    }
  }
}
