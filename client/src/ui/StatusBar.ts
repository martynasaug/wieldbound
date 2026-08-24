/**
 * The row of running effects — what is helping you and what is being done to
 * you, at a glance.
 *
 * Until this existed the game had four timed effects and no way to see any of
 * them. War Cry announced itself with a corner toast that faded in two seconds
 * and then you simply hit harder for another six with nothing on screen saying
 * so; dying left you Weakened for twenty seconds, which the combat log
 * mentioned once. "Why am I doing less damage" had no answer anywhere.
 *
 * THREE THINGS SEPARATE A BUFF FROM A DEBUFF, because one is not enough.
 * Colour alone fails for the eighth of players who cannot tell green from red,
 * and position alone fails the moment a row is empty:
 *
 *   POSITION — buffs on the left, debuffs on the right, always, so a glance at
 *   a corner is enough and the two never trade places as they come and go.
 *   SHAPE — a buff sits in a rounded frame and a debuff in a hard-cornered one
 *   with a notched top, so the silhouette differs at any size and in any
 *   palette.
 *   MOTION — the sweep on a buff drains clockwise like a cooldown; a debuff
 *   also PULSES in its last two seconds, because the thing you want to know
 *   about a debuff is when it stops.
 *
 * The timer is drawn as a conic sweep over the icon rather than as a number.
 * Digits at this size are unreadable at a glance and a player does not need to
 * know a buff has 4.2 seconds left — they need to know it is nearly gone.
 */
import { STATUSES, statusDef, type ActiveStatus, type StatusId } from "../../../shared/protocol-types";
import { iconSvg } from "./icons";
import { attachTextTooltip } from "./ItemTooltip";
import { statusEffectLines } from "../../../shared/items";

/** Under two seconds is "about to go", which is when a debuff starts pulsing
 *  and when a buff is worth re-casting. */
const URGENT_MS = 2000;

export class StatusBar {
  private readonly root: HTMLElement;
  private readonly buffs: HTMLElement;
  private readonly debuffs: HTMLElement;
  /** Live cells by status id, so a running effect keeps its DOM node and its
   *  sweep animates smoothly instead of being rebuilt sixty times a second. */
  private readonly cells = new Map<StatusId, { el: HTMLElement; sweep: HTMLElement; endsAt: number }>();
  private current: ActiveStatus[] = [];
  /** Last published height, so the CSS variable is written on change only. */
  private lastHeight = -1;

  constructor() {
    this.root = document.getElementById("status-bar")!;
    this.buffs = document.getElementById("status-buffs")!;
    this.debuffs = document.getElementById("status-debuffs")!;
  }

  /**
   * The whole list, as the server sees it.
   *
   * Rebuilds only what changed. The naive version — clear the row and redraw —
   * restarts every CSS animation on every message, which makes an unrelated
   * buff landing visibly stutter the debuff beside it.
   */
  set(statuses: ActiveStatus[]): void {
    this.current = statuses;
    const seen = new Set<StatusId>();

    for (const status of statuses) {
      const def = statusDef(status.id);
      if (!def) continue;
      seen.add(status.id);
      const existing = this.cells.get(status.id);
      if (existing) {
        existing.endsAt = status.endsAt;
        continue;
      }
      this.cells.set(status.id, this.build(status, def.kind));
    }

    for (const [id, cell] of [...this.cells]) {
      if (seen.has(id)) continue;
      cell.el.remove();
      this.cells.delete(id);
    }

    // The row disappears entirely when nothing is running. An empty frame
    // sitting under the unit frame is furniture that says nothing.
    this.root.classList.toggle("shown", this.cells.size > 0);
    this.publishHeight();
  }

  /**
   * Tells the target frame how tall this is.
   *
   * The same measured chain the unit frame already publishes into, rather than
   * a pixel offset chosen by looking at one screenshot: the frame above
   * publishes its bottom, this publishes its height, and the frame below starts
   * past both. Everything here appears and disappears independently, so any
   * fixed number is wrong in at least one of the four combinations — and it is
   * wrong INVISIBLY, since the markup is correct either way and only the pixels
   * overlap.
   */
  private publishHeight(): void {
    const height = this.cells.size > 0
      ? Math.round(this.root.getBoundingClientRect().height) + 8
      : 0;
    if (height === this.lastHeight) return;
    this.lastHeight = height;
    document.documentElement.style.setProperty("--status-row-height", `${height}px`);
  }

  private build(status: ActiveStatus, kind: "buff" | "debuff"): {
    el: HTMLElement;
    sweep: HTMLElement;
    endsAt: number;
  } {
    const def = STATUSES[status.id];
    const el = document.createElement("div");
    el.className = `status-cell ${kind}`;

    const sweep = document.createElement("div");
    sweep.className = "status-sweep";
    el.appendChild(sweep);

    const icon = document.createElement("span");
    icon.className = "status-icon";
    icon.innerHTML = iconSvg(def.icon, "icon");
    el.appendChild(icon);

    // Says what it is, whether it is helping, BY HOW MUCH, and last the line
    // that is only there to be read. The WORD is there because the shape and
    // the colour are both things somebody might not be reading, and a tooltip
    // is the one place there is room to be unambiguous — which is the same
    // argument for the numbers: `blurb` is written to say the shape of an
    // effect and not its size, so on its own it cannot tell a 10% slow from
    // Chilled's 60%.
    attachTextTooltip(el, () => ({
      title: def.name,
      tag: kind === "buff" ? "Helping you" : "Being done to you",
      tagColor: kind === "buff" ? "#8fd15a" : "#ff7a6a",
      lines: statusEffectLines(def),
      body: def.blurb,
    }));

    (kind === "buff" ? this.buffs : this.debuffs).appendChild(el);
    return { el, sweep, endsAt: status.endsAt };
  }

  /**
   * Drains the sweeps.
   *
   * Driven from the render loop rather than from a CSS transition per cell,
   * because the duration is known only at runtime and a status can be REFRESHED
   * — a second War Cry pushes the end time out, and a keyframe animation would
   * have to be torn down and rebuilt to notice.
   *
   * `serverNow` rather than the local clock: end times are the server's, and a
   * client whose clock is a second off would show every effect ending early.
   */
  update(serverNow: number): void {
    for (const [id, cell] of this.cells) {
      const def = STATUSES[id];
      const remaining = cell.endsAt - serverNow;
      const fraction = Math.max(0, Math.min(1, remaining / def.durationMs));
      // A conic sweep that empties clockwise. The unfilled part is what is
      // gone, so a nearly-expired effect is a nearly-empty circle.
      cell.sweep.style.background =
        `conic-gradient(rgba(0,0,0,.62) ${(1 - fraction) * 360}deg, transparent 0deg)`;
      cell.el.classList.toggle("urgent", remaining <= URGENT_MS && remaining > 0);
    }
  }

  /** What is running, for anything that wants to ask — the character sheet
   *  shows a buff's contribution beside the gear's. */
  get active(): ActiveStatus[] {
    return this.current;
  }
}
