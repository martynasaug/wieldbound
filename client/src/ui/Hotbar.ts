import { SKILLS, unlockedActives, type CharacterClass, type SkillId } from "../../../shared/protocol-types";

interface Slot {
  skillId: SkillId;
  button: HTMLButtonElement;
  curtain: HTMLElement;
  text: HTMLElement;
  readyAt: number;
}

/**
 * The skill bar: your class's unlocked actives, bound to keys 1..N.
 *
 * Rebuilt whenever class or level changes, because which skills exist is a
 * function of both — a level-20 mage has a different bar from a level-1 one,
 * and neither has anything in common with a warrior's.
 *
 * Cooldowns are tracked from the server's SKILL_RESULT rather than started
 * optimistically on keypress: the server decides whether a skill actually
 * fired (out of range, out of mana, still cooling down), so starting a local
 * cooldown on press would punish the player for attempts it rejected.
 */
export class Hotbar {
  private root = document.getElementById("hotbar")!;
  private slots = new Map<SkillId, Slot>();
  private order: SkillId[] = [];

  constructor(private readonly onUse: (skillId: SkillId) => void) {}

  /** Rebuilds the bar for a class/level. Cooldowns in flight are preserved. */
  setCharacter(characterClass: CharacterClass, level: number): void {
    const actives = unlockedActives(characterClass, level).map((s) => s.id);
    // Cheap identity check: if the same skills in the same order are already
    // shown, leave the DOM (and its running cooldown curtains) alone.
    if (actives.length === this.order.length && actives.every((id, i) => id === this.order[i])) return;

    const carried = new Map<SkillId, number>();
    for (const [id, slot] of this.slots) carried.set(id, slot.readyAt);

    this.order = actives;
    this.root.innerHTML = "";
    this.slots.clear();

    actives.forEach((skillId, index) => {
      const skill = SKILLS[skillId];
      const button = document.createElement("button");
      button.className = "skill-btn ready";
      const cost = skill.manaCost > 0 ? ` — ${skill.manaCost} mana` : "";
      button.title = `${skill.name} (${index + 1})${cost}\n${skill.description}`;
      button.textContent = skill.icon;

      const key = document.createElement("span");
      key.className = "skill-key";
      key.textContent = String(index + 1);
      button.appendChild(key);

      const curtain = document.createElement("div");
      curtain.className = "skill-cd";
      button.appendChild(curtain);

      const text = document.createElement("div");
      text.className = "skill-cd-text";
      button.appendChild(text);

      button.addEventListener("click", () => this.onUse(skillId));
      this.root.appendChild(button);
      this.slots.set(skillId, { skillId, button, curtain, text, readyAt: carried.get(skillId) ?? 0 });
    });
  }

  /** Key "1".."9" -> skill, so the scene doesn't need to know the layout. */
  skillForKey(key: string): SkillId | null {
    const index = Number.parseInt(key, 10) - 1;
    if (Number.isNaN(index)) return null;
    return this.order[index] ?? null;
  }

  isReady(skillId: SkillId): boolean {
    const slot = this.slots.get(skillId);
    return !slot || performance.now() >= slot.readyAt;
  }

  startCooldown(skillId: SkillId, durationMs: number): void {
    const slot = this.slots.get(skillId);
    if (!slot) return;
    slot.readyAt = performance.now() + durationMs;
  }

  /**
   * The shared cooldown after any cast. Applied as a floor across every slot
   * rather than tracked separately, so one `readyAt` per slot still answers
   * "can I press this", and a slot already on a longer cooldown is untouched.
   */
  startGlobalCooldown(durationMs: number): void {
    const until = performance.now() + durationMs;
    for (const slot of this.slots.values()) {
      if (slot.readyAt < until) slot.readyAt = until;
    }
  }

  /** Called every frame; drives the curtain height and the seconds text. */
  update(mana = Infinity): void {
    const now = performance.now();
    for (const slot of this.slots.values()) {
      const skill = SKILLS[slot.skillId];
      // Unaffordable reads the same as unavailable, so the bar answers "can
      // I press this" in one glance rather than two.
      slot.button.style.opacity = mana < skill.manaCost ? "0.45" : "1";

      const remaining = slot.readyAt - now;
      if (remaining <= 0) {
        if (!slot.button.classList.contains("ready")) {
          slot.button.classList.add("ready");
          slot.curtain.style.height = "0%";
          slot.text.textContent = "";
        }
        continue;
      }
      slot.button.classList.remove("ready");
      slot.curtain.style.height = `${Math.min(100, (remaining / skill.cooldownMs) * 100)}%`;
      slot.text.textContent = remaining > 1000 ? String(Math.ceil(remaining / 1000)) : "";
    }
  }
}
