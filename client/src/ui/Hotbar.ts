import {
  HOTBAR_SLOTS,
  SKILLS,
  defaultAttackFor,
  emptyHotbar,
  normalizeHotbar,
  type HotbarEntry,
  type HotbarLayout,
  type SkillId,
  type WeaponType,
} from "../../../shared/protocol-types";

export const ATTACK_SLOT = "attack";
export type BarAction = typeof ATTACK_SLOT | SkillId;

interface Slot {
  index: number;
  button: HTMLButtonElement;
  icon: HTMLElement;
  keyLabel: HTMLElement;
  curtain: HTMLElement;
  text: HTMLElement;
}

/** What a drag is carrying, whether it began on the bar or in the talent panel. */
interface BarDrag {
  entry: HotbarEntry;
  /** Slot it came from, or -1 when dragged in from outside the bar. */
  from: number;
}

let activeDrag: BarDrag | null = null;

/** Called by the talent panel to start dragging a learned skill onto the bar. */
export function beginBarDrag(entry: HotbarEntry): void {
  activeDrag = entry ? { entry, from: -1 } : null;
}

/**
 * The action bar — ten slots the player owns.
 *
 * It used to be generated: every unlocked skill in tree order, keys assigned by
 * position. That meant there was no such thing as *your* layout, and learning a
 * talent could shuffle everything one slot to the right and retrain your hands
 * for you. Now the layout is stored per weapon and only the player changes it —
 * drag to place or reorder, right-click to clear, click a key label to rebind.
 *
 * Per weapon because the skills are: a bar that survived a weapon swap would be
 * full of things you cannot cast.
 *
 * Cooldowns are keyed by ACTION rather than by slot, so moving a skill does not
 * reset the cooldown it is already on — and they are started from the server's
 * SKILL_RESULT rather than optimistically on keypress, because the server
 * decides whether a skill actually fired.
 */
export class Hotbar {
  private root = document.getElementById("hotbar")!;
  private configButton = document.getElementById("hotbar-config") as HTMLButtonElement;
  private slots: Slot[] = [];
  private layout: HotbarLayout = emptyHotbar();
  private weapon: WeaponType | undefined = undefined;

  private readyAt = new Map<BarAction, number>();
  private windowMs = new Map<BarAction, number>();

  private editing = false;
  private rebinding: number | null = null;

  constructor(
    private readonly onUse: (action: BarAction) => void,
    private readonly onLayoutChanged: (weapon: WeaponType | undefined, layout: HotbarLayout) => void,
  ) {
    this.buildSlots();
    this.configButton.addEventListener("click", () => this.setEditing(!this.editing));
    // Captured, so the key being bound cannot also fire the action it is being
    // bound to on its way past.
    window.addEventListener("keydown", (e) => this.captureRebind(e), true);
  }

  private buildSlots(): void {
    this.root.innerHTML = "";
    this.slots = [];
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const button = document.createElement("button");
      button.className = "skill-btn slot-empty";

      const icon = document.createElement("span");
      icon.className = "bar-icon";
      button.appendChild(icon);

      const keyLabel = document.createElement("span");
      keyLabel.className = "skill-key";
      button.appendChild(keyLabel);

      const curtain = document.createElement("div");
      curtain.className = "skill-cd";
      button.appendChild(curtain);

      const text = document.createElement("div");
      text.className = "skill-cd-text";
      button.appendChild(text);

      button.addEventListener("click", (e) => {
        if (this.editing && e.target === keyLabel) {
          this.startRebind(i);
          return;
        }
        const entry = this.layout.slots[i];
        if (entry) this.onUse(entry as BarAction);
      });
      // Right-click clears. Destructive, but instantly undone by dragging the
      // skill back, so it needs no confirmation step.
      button.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!this.layout.slots[i]) return;
        this.layout.slots[i] = null;
        this.commit();
      });

      button.draggable = true;
      button.addEventListener("dragstart", () => {
        activeDrag = { entry: this.layout.slots[i], from: i };
      });
      button.addEventListener("dragover", (e) => {
        if (!activeDrag) return;
        e.preventDefault();
        button.classList.add("drop-target");
      });
      button.addEventListener("dragleave", () => button.classList.remove("drop-target"));
      button.addEventListener("drop", (e) => {
        e.preventDefault();
        button.classList.remove("drop-target");
        this.drop(i);
      });

      this.root.appendChild(button);
      this.slots.push({ index: i, button, icon, keyLabel, curtain, text });
    }
  }

  /** Resolves a drop: a swap when it came from the bar, a placement otherwise. */
  private drop(target: number): void {
    const drag = activeDrag;
    activeDrag = null;
    if (!drag || !drag.entry) return;
    if (drag.from >= 0) {
      const moved = this.layout.slots[drag.from];
      this.layout.slots[drag.from] = this.layout.slots[target];
      this.layout.slots[target] = moved;
    } else {
      // Dragged in from the talent panel. Any other copy is cleared first: one
      // action in two slots shares a cooldown and only wastes a button.
      const existing = this.layout.slots.indexOf(drag.entry);
      if (existing >= 0) this.layout.slots[existing] = null;
      this.layout.slots[target] = drag.entry;
    }
    this.commit();
  }

  private startRebind(index: number): void {
    this.rebinding = index;
    this.render();
  }

  private captureRebind(e: KeyboardEvent): void {
    if (this.rebinding === null) return;
    e.preventDefault();
    e.stopPropagation();
    const key = e.key.toLowerCase();
    const index = this.rebinding;
    this.rebinding = null;
    if (key === "escape") {
      this.render();
      return;
    }
    // A key belongs to one slot; pressing it here is the player saying they want
    // it moved, so it is taken from whichever slot had it.
    const clash = this.layout.keys.indexOf(key);
    if (clash >= 0 && clash !== index) this.layout.keys[clash] = "";
    this.layout.keys[index] = key;
    this.commit();
  }

  private commit(): void {
    this.layout = normalizeHotbar(this.layout);
    this.render();
    this.onLayoutChanged(this.weapon, this.layout);
  }

  setEditing(editing: boolean): void {
    this.editing = editing;
    this.rebinding = null;
    this.root.classList.toggle("editing", editing);
    this.configButton.classList.toggle("editing", editing);
    this.render();
  }

  /** Applies the server's stored layout for the weapon in hand. */
  setLayout(weapon: WeaponType | undefined, layout: HotbarLayout): void {
    this.weapon = weapon;
    this.layout = normalizeHotbar(layout);
    this.render();
  }

  /** Key -> action, so the scene does not need to know the layout. */
  skillForKey(key: string): BarAction | null {
    const index = this.layout.keys.indexOf(key);
    if (index < 0) return null;
    return (this.layout.slots[index] as BarAction) ?? null;
  }

  /** True while a pending rebind should swallow key presses. */
  get isRebinding(): boolean {
    return this.rebinding !== null;
  }

  startCooldown(skillId: SkillId, durationMs: number): void {
    this.readyAt.set(skillId, performance.now() + durationMs);
    this.windowMs.set(skillId, SKILLS[skillId].cooldownMs);
  }

  /**
   * The swing clock, straight from the server. Drives the attack slot's curtain,
   * which is what makes weapon speed legible; `attacking` lights the border that
   * says an attack order is standing.
   */
  setAttackState(attacking: boolean, readyInMs: number, intervalMs: number): void {
    this.readyAt.set(ATTACK_SLOT, performance.now() + Math.max(0, readyInMs));
    this.windowMs.set(ATTACK_SLOT, Math.max(1, intervalMs));
    for (const slot of this.slots) {
      slot.button.classList.toggle(
        "engaged",
        attacking && this.layout.slots[slot.index] === ATTACK_SLOT,
      );
    }
  }

  /**
   * The shared cooldown after any cast, applied as a floor across every skill
   * rather than tracked separately — so one `readyAt` per action still answers
   * "can I press this", and anything on a longer cooldown is untouched.
   *
   * The default attack is exempt. Its clock is the weapon's swing timer, which
   * the global cooldown never governed: auto-attacks were not GCD-gated, and
   * putting the manual press under it would make pressing your own attack worse
   * than ignoring it.
   */
  startGlobalCooldown(durationMs: number): void {
    const until = performance.now() + durationMs;
    for (const entry of this.layout.slots) {
      if (!entry || entry === ATTACK_SLOT) continue;
      if ((this.readyAt.get(entry) ?? 0) < until) this.readyAt.set(entry, until);
    }
  }

  private render(): void {
    for (const slot of this.slots) {
      const entry = this.layout.slots[slot.index];
      const key = this.layout.keys[slot.index];
      slot.button.classList.toggle("slot-empty", !entry);
      slot.button.classList.toggle("skill-attack", entry === ATTACK_SLOT);

      slot.keyLabel.textContent = this.rebinding === slot.index ? "?" : key || "-";
      slot.keyLabel.classList.toggle("rebinding", this.rebinding === slot.index);

      if (!entry) {
        slot.icon.textContent = "";
        slot.button.title = this.editing ? "Empty — drag a skill here from the talent panel (K)" : "";
        continue;
      }
      if (entry === ATTACK_SLOT) {
        const attack = defaultAttackFor(this.weapon);
        slot.icon.textContent = attack.icon;
        slot.button.title = `${attack.name} (${key || "unbound"})\n${attack.description}`;
      } else {
        const skill = SKILLS[entry];
        const cost = skill.manaCost > 0 ? ` — ${skill.manaCost} mana` : "";
        slot.icon.textContent = skill.icon;
        slot.button.title = `${skill.name} (${key || "unbound"})${cost}\n${skill.description}`;
      }
    }
  }

  /** Called every frame; drives the curtain height and the seconds text. */
  update(mana = Infinity): void {
    const now = performance.now();
    for (const slot of this.slots) {
      const entry = this.layout.slots[slot.index];
      if (!entry) {
        slot.curtain.style.height = "0%";
        slot.text.textContent = "";
        continue;
      }
      const cost = entry === ATTACK_SLOT ? 0 : SKILLS[entry].manaCost;
      slot.button.style.opacity = mana < cost ? "0.45" : "1";

      const remaining = (this.readyAt.get(entry) ?? 0) - now;
      if (remaining <= 0) {
        if (!slot.button.classList.contains("ready")) {
          slot.button.classList.add("ready");
          slot.curtain.style.height = "0%";
          slot.text.textContent = "";
        }
        continue;
      }
      slot.button.classList.remove("ready");
      const span = this.windowMs.get(entry) ?? 1000;
      slot.curtain.style.height = `${Math.min(100, (remaining / span) * 100)}%`;
      // A swing is a second or two, so counting it in whole seconds would read
      // "1" for most of it. Skills, which run to double figures, keep the count.
      const countdown = entry !== ATTACK_SLOT && remaining > 1000;
      slot.text.textContent = countdown ? String(Math.ceil(remaining / 1000)) : "";
    }
  }
}
