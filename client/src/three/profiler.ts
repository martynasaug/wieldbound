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
  /** Just this frame, so a hitch can name what was slow DURING it. */
  frameMs: number;
}

/**
 * A frame this long is not slowness, it is a stutter somebody felt.
 *
 * Three times a 60Hz refresh. Below that a frame is late; above it the picture
 * visibly stops.
 */
const HITCH_MS = 50;

/** How long a hitch is remembered, so a readout taken a moment later still
 *  shows that one happened. */
const HITCH_WINDOW_MS = 10000;

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
  /** A line under the title — the graphics level, so a reading is never
   *  ambiguous about which settings produced it. */
  private label = "";
  /** Timestamps of recent stutters, trimmed to `HITCH_WINDOW_MS`. */
  private hitches: number[] = [];
  /** The worst frame in the last ten seconds, which is what a player who says
   *  "it freezes sometimes" is describing — the per-window worst resets far too
   *  often to catch it. */
  private worstRecent = { ms: 0, at: 0 };
  private frameEnded = 0;
  private betweenMs = 0;
  private betweenWorst = 0;
  private betweenWorst_ = "";

  /**
   * Whether the page stopped being drawn for reasons that are not the game.
   *
   * rAF DOES NOT RUN while a tab is hidden, and it is throttled hard while the
   * window is not focused. So alt-tabbing, switching to another tab, or dragging
   * a DevTools window around produces an enormous gap between two animation
   * frames — indistinguishable, from inside, from a five-second stall.
   *
   * This matters because it was actively misleading the investigation: the
   * reports of "5065ms BETWEEN frames" and "3043ms BETWEEN frames" arrived in
   * the same sessions where the player was reading the console and taking
   * screenshots, and the attribution said almost none of our code ran in them —
   * which is exactly what a paused tab looks like AND exactly what a garbage
   * collection looks like. Several rounds were spent hunting an asset stall
   * that may never have existed.
   *
   * A gap that spans a visibility change is therefore not reported at all.
   */
  private sawHidden = false;

  constructor() {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.sawHidden = true;
    });
    window.addEventListener("blur", () => {
      this.sawHidden = true;
    });
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

  /**
   * Whole-frame timing. Call at the very top of the loop body.
   *
   * Runs whether or not the overlay is open, and that is the point: "it
   * sometimes freezes" was unmeasurable while the only instrument had to be
   * switched on and looked at during the half-second the freeze happened in.
   * Two `performance.now()` calls a frame is nothing, and in exchange every
   * stutter reports itself to the console with the section that caused it,
   * whether or not anybody was watching.
   */
  frameBegin(): void {
    const now = performance.now();
    // Everything that happened since the last frame ENDED: websocket messages
    // decoded and dispatched, promises resolving a loaded model, garbage
    // collection, the browser's own work. None of it is inside the loop and
    // none of it was visible to any measurement here — a 200ms websocket
    // handler between two frames does not lengthen either of them.
    this.betweenMs = this.frameEnded > 0 ? now - this.frameEnded : 0;
    this.frameStart = now;

    // WHAT RAN IN THE GAP, named. Sections are timed unconditionally now, so
    // anything that used a `begin`/`end` pair between two frames — a websocket
    // dispatch, a model being cloned, a loaded file being dressed — has already
    // accumulated into `frameMs` by the time this runs. Reading it BEFORE the
    // reset is the only chance to see it: a moment later it is zeroed and the
    // gap becomes anonymous again, which is what "not the render loop, network
    // decode or a model finishing loading or garbage collection" was reduced to
    // guessing at.
    //
    // Nothing at all having accumulated is itself the answer, and the useful
    // one: it means the pause was not our code — a garbage collection, or the
    // browser parsing a file inside a loader callback we do not own.
    this.betweenWorst_ = "";
    let worst = 0;
    for (const [label, sec] of this.sections) {
      if (sec.frameMs > worst) {
        worst = sec.frameMs;
        this.betweenWorst_ = `${label} ${sec.frameMs.toFixed(0)}ms`;
      }
    }
    // And cleared again, now that the gap has been read. Work done BETWEEN
    // frames must not also be counted as part of the frame that follows it —
    // leaving it in produced sections totalling more than the frame they were
    // supposedly inside, and a hitch line reading "rig:Monk 266.4ms, -747ms
    // outside the timed sections". A negative remainder is a diagnostic saying
    // it does not understand its own arithmetic.
    for (const sec of this.sections.values()) sec.frameMs = 0;
  }

  /** Whatever the owner wants shown alongside the timings — draw calls,
   *  triangles, resident geometries. Read once per frame by the caller because
   *  three.js resets some of these on every render. */
  setStats(stats: Record<string, number>): void {
    if (!this.on) return;
    this.stats = stats;
  }

  setLabel(label: string): void {
    if (!this.on) return;
    this.label = label;
  }

  /**
   * Sections are timed WHETHER OR NOT the overlay is open.
   *
   * They used to be gated on it, and that made every stutter report useless:
   * a hitch would fire, and the one thing it had to say — which subsystem was
   * slow during it — came out as "(sections not timed — press F3)", because
   * nobody has the overlay open at the moment a stutter surprises them. Two
   * `performance.now()` calls per section per frame is about twenty calls a
   * frame and does not register against a 15ms budget; having no idea what
   * caused a 235ms freeze costs entire sessions.
   */
  begin(label: string): void {
    let s = this.sections.get(label);
    if (!s) {
      s = { total: 0, worst: 0, calls: 0, startedAt: 0, frameMs: 0 };
      this.sections.set(label, s);
      this.order.push(label);
    }
    s.startedAt = performance.now();
  }

  end(label: string): void {
    const s = this.sections.get(label);
    if (!s || !s.startedAt) return;
    const ms = performance.now() - s.startedAt;
    s.startedAt = 0;
    s.total += ms;
    s.frameMs += ms;
    s.calls++;
    if (ms > s.worst) s.worst = ms;
  }

  /** Closes the frame, reports any stutter, and once per window rebuilds the
   *  readout. */
  frameEnd(): void {
    const now = performance.now();
    const ms = now - this.frameStart;
    this.frameEnded = now;
    if (this.betweenMs > this.betweenWorst) this.betweenWorst = this.betweenMs;

    // --- always on, overlay or not ------------------------------------------
    // The gap BEFORE this frame counts as a stutter too. A player feels the
    // picture stop; whether the browser was inside the loop or between two of
    // them at the time is a distinction only this file cares about.
    // A gap that spans the tab being hidden or the window losing focus is not
    // a stutter, it is the browser doing what it is supposed to. Cleared here
    // rather than on the visibility event itself, because the oversized gap
    // arrives on the frame AFTER focus comes back.
    if (this.sawHidden) {
      this.sawHidden = false;
      this.betweenMs = 0;
    }
    if (this.betweenMs >= HITCH_MS) {
      this.hitches.push(now);
      console.warn(
        `[hitch] ${this.betweenMs.toFixed(0)}ms BETWEEN frames — ` +
          (this.betweenWorst_
            ? `worst: ${this.betweenWorst_}`
            : "nothing of ours ran in it: a garbage collection, or a file " +
              "being parsed inside a loader callback."),
      );
    }
    if (ms >= HITCH_MS) {
      this.hitches.push(now);
      // Which subsystem was slow DURING the stutter, not on average. A hitch
      // and a steadily-heavy frame have completely different causes, and the
      // averages in the overlay cannot tell them apart — one bad frame in
      // three hundred moves a 500ms average by a rounding error.
      let worstLabel = "(no sections registered)";
      let worstMs = 0;
      for (const [label, sec] of this.sections) {
        if (sec.frameMs > worstMs) {
          worstMs = sec.frameMs;
          worstLabel = `${label} ${sec.frameMs.toFixed(1)}ms`;
        }
      }
      // Unaccounted time is itself a diagnosis: if the sections add up to far
      // less than the frame, the stall was not in the loop at all — it was
      // garbage collection, a texture upload, or a shader compile.
      let accounted = 0;
      for (const sec of this.sections.values()) accounted += sec.frameMs;
      console.warn(
        `[hitch] ${ms.toFixed(0)}ms frame — worst section: ${worstLabel}, ` +
          `${(ms - accounted).toFixed(0)}ms outside the timed sections`,
      );
    }
    while (this.hitches.length && now - this.hitches[0] > HITCH_WINDOW_MS) {
      this.hitches.shift();
    }
    if (ms > this.worstRecent.ms || now - this.worstRecent.at > HITCH_WINDOW_MS) {
      this.worstRecent = { ms, at: now };
    }

    // CLEARED HERE, NOT AT THE START OF THE NEXT FRAME. Reading these at
    // `frameBegin` and resetting them there meant the "what ran in the gap"
    // report was showing the PREVIOUS frame's leftovers — which is why a 3043ms
    // stall came back blaming "render 17ms", a number from work that had
    // finished before the gap even began. Zeroed at the end of the frame, so
    // anything that accumulates before the next one started genuinely ran in
    // between the two.
    for (const s of this.sections.values()) s.frameMs = 0;

    if (!this.on || !this.el) return;
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
      `F3 profiler — ${this.label}\n` +
      `  fps             ${fps.toFixed(1).padStart(8)}\n` +
      `  frame avg       ${avg.toFixed(2).padStart(8)}ms\n` +
      // The number that explains hitching. Called out rather than listed,
      // because a worst frame far above the average IS the complaint.
      `  frame WORST     ${this.frameWorst.toFixed(1).padStart(8)}ms\n` +
      // Over ten seconds rather than half of one. This is the line that answers
      // "it freezes sometimes", and the count beside it says how often.
      `  worst /10s      ${this.worstRecent.ms.toFixed(1).padStart(8)}ms\n` +
      `  stutters /10s   ${String(this.hitches.length).padStart(8)}\n` +
      // Time the loop never sees. High here and low everywhere else means the
      // cost is not in the game at all.
      `  between frames  ${this.betweenWorst.toFixed(1).padStart(8)}ms\n` +
      (statLines.length ? statLines.join("\n") + "\n" : "") +
      `  ---- sections ----\n` +
      rows.join("\n");

    this.frames = 0;
    this.frameTotal = 0;
    this.frameWorst = 0;
    this.betweenWorst = 0;
    this.windowStart = now;
    for (const s of this.sections.values()) {
      s.total = 0;
      s.worst = 0;
      s.calls = 0;
    }
  }
}

/**
 * The one profiler, shared.
 *
 * A module singleton rather than an instance owned by `Game`, because the most
 * interesting thing left to measure — decoding and dispatching websocket
 * messages — happens in `net/socket.ts`, which has no reference to the game and
 * should not grow one just to be timed. Everything else about it is unchanged;
 * `Game` uses this instead of constructing its own.
 */
export const profiler = new Profiler();
