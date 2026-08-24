const MAX_ENTRIES = 40;
const VISIBLE_FRESH = 8;
// How long a run of near-simultaneous hits stays open for the next one to
// join it. Short — this is not about a slow trickle of chip damage, it is
// about several independent attack timers (each monster runs its own, see
// `attackIntervalMs`) happening to land inside the same instant.
const HIT_GROUP_WINDOW_MS = 400;

export class CombatLog {
  private container = document.getElementById("combat-log")!;
  private openHit: { key: string; count: number; total: number; el: HTMLElement; endsAt: number } | null = null;

  push(text: string, color: string): void {
    // Anything routed through the plain path — a miss, a quest line, a crit
    // — ends whatever hit-group was accumulating. A crit in particular stays
    // its own line on purpose: merging it into a running count would bury
    // the one hit in a flurry that actually mattered.
    this.openHit = null;
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.style.color = color;
    entry.textContent = text;
    this.container.appendChild(entry);
    this.trim();
  }

  /**
   * Like `push`, but near-simultaneous calls sharing the same `key` grow one
   * line instead of each opening a new one.
   *
   * Reported from a pack fight: several monsters in melee contact each run
   * their own attack timer (`server/src/index.ts`'s per-monster
   * `attackIntervalMs`), so their hits land independently rather than on a
   * shared clock. The log used to print one raw "The X hits you for N" per
   * swing, and a real pack fight scrolled itself out of the visible window
   * before a player could read any single line. `floaters.ts` solved the
   * identical problem for the floating numbers (fan out, stagger, never
   * overlap); this is the log's own version of that fix.
   *
   * The FIRST hit in a group still names its attacker, because a lone hit is
   * attributable. Once a second hit joins within the window the line drops
   * the name and switches to a plain count — "The Wolf hits you 2 times"
   * would misattribute a Goblin's blow standing right next to it, and in a
   * real pack the whole point is that it is not always the same one thing
   * hitting you.
   */
  pushHit(key: string, label: string, verb: string, amount: number, color: string): void {
    const now = performance.now();
    if (this.openHit && this.openHit.key === key && now < this.openHit.endsAt) {
      this.openHit.count++;
      this.openHit.total += amount;
      this.openHit.endsAt = now + HIT_GROUP_WINDOW_MS;
      this.openHit.el.style.color = color;
      this.openHit.el.textContent = `Hit ${this.openHit.count} times for ${this.openHit.total}.`;
      this.container.scrollTop = this.container.scrollHeight;
      return;
    }
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.style.color = color;
    entry.textContent = `The ${label} ${verb} you for ${amount}.`;
    this.container.appendChild(entry);
    this.openHit = { key, count: 1, total: amount, el: entry, endsAt: now + HIT_GROUP_WINDOW_MS };
    this.trim();
  }

  private trim(): void {
    const entries = this.container.children;
    for (let i = 0; i < entries.length; i++) {
      entries[i].classList.toggle("log-fade", i < entries.length - VISIBLE_FRESH);
    }
    while (this.container.children.length > MAX_ENTRIES) {
      this.container.removeChild(this.container.firstChild!);
    }
    this.container.scrollTop = this.container.scrollHeight;
  }
}
