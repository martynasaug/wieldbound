import { CLASSES, SKILLS, skillsForClass, type CharacterClass } from "../../../shared/protocol-types";

/**
 * The skill tree: everything your class will ever learn, in unlock order,
 * with what you already have separated from what you don't.
 *
 * Skills unlock purely by level rather than by spending points. The game
 * already has a point economy (attributes) and a second one competing with
 * it would make both feel thin — so this panel is a reference sheet and a
 * progress tracker rather than a shop.
 */
export class SkillPanel {
  private overlay = document.getElementById("skills-overlay")!;
  private list = document.getElementById("skills-list")!;
  private title = document.getElementById("skills-title")!;
  private closeButton = document.getElementById("skills-close")!;
  private characterClass: CharacterClass = "warrior";
  private level = 1;

  constructor() {
    this.closeButton.addEventListener("click", () => this.close());
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains("open");
  }

  open(): void {
    this.overlay.classList.add("open");
    this.render();
  }

  close(): void {
    this.overlay.classList.remove("open");
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  setCharacter(characterClass: CharacterClass, level: number): void {
    this.characterClass = characterClass;
    this.level = level;
    if (this.isOpen) this.render();
  }

  private render(): void {
    const def = CLASSES[this.characterClass];
    this.title.textContent = `${def.icon} ${def.name} — Level ${this.level}`;
    this.list.innerHTML = "";

    for (const skill of skillsForClass(this.characterClass)) {
      const unlocked = skill.unlockLevel <= this.level;
      const row = document.createElement("div");
      row.className = `skill-row${unlocked ? "" : " locked"}`;

      const icon = document.createElement("div");
      icon.className = "sk-icon";
      icon.textContent = skill.icon;
      row.appendChild(icon);

      const main = document.createElement("div");
      main.className = "sk-main";

      const name = document.createElement("div");
      name.className = "sk-name";
      name.textContent = skill.name;
      main.appendChild(name);

      const desc = document.createElement("div");
      desc.className = "sk-desc";
      desc.textContent = skill.description;
      main.appendChild(desc);

      const meta = document.createElement("div");
      meta.className = "sk-meta";
      const tag = document.createElement("span");
      if (!unlocked) {
        tag.className = "sk-tag locked";
        tag.textContent = `Unlocks at level ${skill.unlockLevel}`;
      } else if (skill.kind === "passive") {
        tag.className = "sk-tag passive";
        tag.textContent = "Passive — always on";
      } else {
        tag.className = "sk-tag active";
        tag.textContent = "Active";
      }
      meta.appendChild(tag);

      // Only actives have numbers worth showing; a passive's effect is
      // already stated in its description.
      if (skill.kind !== "passive") {
        const bits: string[] = [`${(skill.cooldownMs / 1000).toFixed(0)}s cooldown`];
        if (skill.manaCost > 0) bits.push(`${skill.manaCost} mana`);
        if (skill.rangePx > 0) bits.push(`${skill.rangePx}px range`);
        if (skill.radiusPx > 0) bits.push(`${skill.radiusPx}px radius`);
        if (skill.chainTargets) bits.push(`${skill.chainTargets} targets`);
        meta.appendChild(document.createTextNode(bits.join("  ·  ")));
      }
      main.appendChild(meta);
      row.appendChild(main);
      this.list.appendChild(row);
    }

    void SKILLS;
  }
}
