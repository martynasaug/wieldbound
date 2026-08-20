// What you are supposed to be doing, on screen.
//
// A tracker rather than a quest log, and the difference is the point: there is
// no panel to open, no tabs, no history. Three lines under the minimap saying
// what you took and how far along it is, and a line that turns gold when it is
// finished. A quest you have to open a window to remember is a quest you forget.
//
// It hides itself entirely when nothing is taken, because an empty panel
// labelled "Quests" is worse than no panel at all — it is a permanent piece of
// furniture advertising something the player is not doing.

import { QUESTS, objectiveLabel, questSatisfied } from "../../../shared/quests";
import { TOWN_NPCS } from "../../../shared/town";
import type { QuestProgressState } from "../../../shared/protocol-types";

const GIVER_NAMES = new Map(TOWN_NPCS.map((n) => [n.id, n.name]));

export class QuestTracker {
  private readonly root = document.getElementById("quest-tracker")!;
  private active: QuestProgressState[] = [];
  private completed: string[] = [];
  /** The last thing rendered, so an unchanged snapshot does not rebuild the DOM. */
  private lastKey = "";

  setState(active: QuestProgressState[], completed: string[]): void {
    this.active = active;
    this.completed = completed;
    this.render();
  }

  /** Quests taken and not yet handed back. Read by the dialogue box. */
  get activeQuests(): readonly QuestProgressState[] {
    return this.active;
  }

  get completedQuests(): readonly string[] {
    return this.completed;
  }

  /** How far along one quest is, or null if it is not taken. */
  progressOf(questId: string): number | null {
    return this.active.find((a) => a.id === questId)?.count ?? null;
  }

  // Where it sits vertically is CSS's problem, not this file's: the minimap
  // already publishes its own height as --minimap-bottom, and the tracker is
  // anchored to that. A setTop() here would be a second thing to keep in step
  // with a number the map is already broadcasting.

  private render(): void {
    // The quest state arrives on every kill that advances anything, and a
    // rebuild per kill is a rebuild per second in a camp.
    const key = this.active.map((a) => `${a.id}:${a.count}`).join("|");
    if (key === this.lastKey) return;
    this.lastKey = key;

    if (this.active.length === 0) {
      this.root.classList.remove("open");
      this.root.innerHTML = "";
      return;
    }

    const rows: string[] = ['<div class="qt-head">Work in hand</div>'];
    for (const entry of this.active) {
      const def = QUESTS.find((q) => q.id === entry.id);
      if (!def) continue;
      const done = questSatisfied(def, entry.count);
      const capped = Math.min(entry.count, def.objective.count);
      rows.push(
        `<div class="qt-row${done ? " done" : ""}">` +
          `<span class="qt-name">${def.name}</span>` +
          `<span class="qt-obj">${objectiveLabel(def.objective)} ${capped} / ${def.objective.count}</span>` +
          (done
            ? `<span class="qt-ready">return to ${GIVER_NAMES.get(def.giver) ?? def.giver}</span>`
            : "") +
          "</div>",
      );
    }
    this.root.innerHTML = rows.join("");
    this.root.classList.add("open");
  }
}
