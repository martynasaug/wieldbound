// Talking to somebody.
//
// Deliberately NOT a window in the right-hand rail. Every panel in the rail is
// something you keep open while you play — the bag, the sheet, the bench. A
// conversation is the opposite: it is modal in feeling if not in fact, it wants
// the middle of the screen, and it ends. Putting it in the rail would also mean
// it competes for width with the bag, and the one thing a dialogue box must
// never do is get evicted mid-sentence by an inventory.
//
// The panel knows nothing about vendors or quests. It renders a person, a
// paragraph and a list of things you may say; what those things DO is passed in
// as callbacks by whoever opened it. That is what lets the vendor and the quest
// givers use one box without this file growing a branch per role.

import type { TownNpc } from "../../../shared/town";
import { iconSvg } from "./icons";

export interface DialogueAction {
  label: string;
  /** Drawn in gold and listed first. The thing the NPC is FOR. */
  primary?: boolean;
  /** A short note under the label — a cost, a count, a warning. */
  note?: string;
  disabled?: boolean;
  onPick: () => void;
}

export class DialoguePanel {
  private readonly root = document.getElementById("dialogue-overlay")!;
  private readonly portrait = document.getElementById("dialogue-portrait")!;
  private readonly nameEl = document.getElementById("dialogue-name")!;
  private readonly titleEl = document.getElementById("dialogue-title")!;
  private readonly bodyEl = document.getElementById("dialogue-body")!;
  private readonly optionsEl = document.getElementById("dialogue-options")!;
  private readonly closeButton = document.getElementById("dialogue-close")!;

  private npc: TownNpc | null = null;
  private actions: DialogueAction[] = [];
  /** Called when the box closes for any reason, including walking away. */
  onClose: (() => void) | null = null;

  constructor() {
    this.closeButton.addEventListener("click", () => this.close());
    // Escape closes, like every other overlay. Registered here rather than in
    // Game's key handler so the panel owns its own dismissal — a conversation
    // that could only be ended by a key binding somewhere else is a conversation
    // that will one day be un-closeable.
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) {
        e.stopPropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains("open");
  }

  /** Who is being talked to, or null. Read every frame to close on walk-away. */
  get openNpcId(): string | null {
    return this.isOpen ? (this.npc?.id ?? null) : null;
  }

  open(npc: TownNpc, actions: DialogueAction[]): void {
    this.npc = npc;
    this.actions = actions;
    this.portrait.innerHTML = iconSvg(npc.icon);
    this.portrait.className = `dlg-portrait role-${npc.role}`;
    this.nameEl.textContent = npc.name;
    this.titleEl.textContent = npc.title;
    this.showGreeting();
    this.root.classList.add("open");
  }

  /** Re-renders the options without disturbing the text. For a purchase that
   *  changed what the player can afford, or a quest that has just been taken. */
  setActions(actions: DialogueAction[]): void {
    this.actions = actions;
    if (this.isOpen) this.renderOptions();
  }

  /** Replaces the spoken paragraph. Used when an action wants to say something
   *  back — "Taken. Come and see me when it is done." */
  say(text: string): void {
    this.bodyEl.textContent = text;
    this.renderOptions();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.remove("open");
    this.npc = null;
    this.onClose?.();
  }

  private showGreeting(): void {
    if (!this.npc) return;
    this.bodyEl.textContent = this.npc.greeting;
    this.renderOptions();
  }

  private renderOptions(): void {
    const npc = this.npc;
    if (!npc) return;
    this.optionsEl.innerHTML = "";

    // What they are for, first and in gold — then the small talk. A vendor whose
    // "show me your wares" is the fourth item in a list of anecdotes is a vendor
    // players stop visiting.
    for (const action of this.actions) {
      this.optionsEl.appendChild(
        this.optionRow(action.label, action.note, action.primary === true, action.disabled === true, () => {
          action.onPick();
        }),
      );
    }

    for (const topic of npc.topics) {
      this.optionsEl.appendChild(
        this.optionRow(topic.q, undefined, false, false, () => {
          this.bodyEl.textContent = topic.a;
          // The list is rebuilt rather than left alone so that "back" appears —
          // and so that any action whose availability changed while the player
          // was reading is redrawn honestly.
          this.renderOptions();
          this.optionsEl.prepend(
            this.optionRow("— Back", undefined, false, false, () => this.showGreeting()),
          );
        }),
      );
    }

    this.optionsEl.appendChild(
      this.optionRow("Goodbye.", undefined, false, false, () => this.close()),
    );
  }

  private optionRow(
    label: string,
    note: string | undefined,
    primary: boolean,
    disabled: boolean,
    onPick: () => void,
  ): HTMLElement {
    const row = document.createElement("button");
    row.className = "dlg-option" + (primary ? " primary" : "") + (disabled ? " disabled" : "");
    row.type = "button";

    const text = document.createElement("span");
    text.className = "dlg-option-label";
    text.textContent = label;
    row.appendChild(text);

    if (note) {
      const noteEl = document.createElement("span");
      noteEl.className = "dlg-option-note";
      noteEl.textContent = note;
      row.appendChild(noteEl);
    }

    if (disabled) row.disabled = true;
    else row.addEventListener("click", onPick);
    return row;
  }
}
