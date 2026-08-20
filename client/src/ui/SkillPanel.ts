import {
  MAX_WEAPON_LEVEL,
  SKILLS,
  TALENT_TIER_LEVELS,
  WEAPONS,
  canLearnTalent,
  describeRead,
  spentTalentPoints,
  talentPointsAtLevel,
  talentTree,
  type HotbarLayout,
  type TalentId,
  type TalentNode,
  type TalentRanks,
  type WeaponType,
} from "../../../shared/protocol-types";
import { beginBarDrag } from "./Hotbar";
import { iconSvg } from "./icons";

export interface WeaponProgressView {
  weaponType: WeaponType;
  level: number;
  intoLevel: number;
  needed: number;
  pointsSpent: number;
  pointsAvailable: number;
  ranks: TalentRanks;
  hotbar: HotbarLayout;
}

/**
 * The talent tree for the weapon in your hand.
 *
 * This replaced a reference sheet, and the difference is the whole point.
 * Skills used to unlock themselves by character level, which meant the panel
 * could only ever report what had already happened. Now weapon proficiency
 * hands you points and you decide where they go, so the panel is where the
 * character is actually built.
 *
 * It shows exactly one tree — the held weapon's — because that is the only one
 * in force. Switching weapons switches the tree, the talents and the skills
 * together, which is "you are whatever you're holding" applied to progression
 * rather than only to the hotbar.
 */
export class SkillPanel {
  private overlay = document.getElementById("skills-overlay")!;
  private list = document.getElementById("skills-list")!;
  private title = document.getElementById("skills-title")!;
  private closeButton = document.getElementById("skills-close")!;

  private weapon: WeaponType = "fist";
  private progress: WeaponProgressView | null = null;

  constructor(
    private readonly onLearn: (nodeId: TalentId) => void,
    private readonly onReset: (weapon: WeaponType) => void,
  ) {
    this.closeButton.addEventListener("click", () => this.close());
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

  setProgress(progress: WeaponProgressView): void {
    this.weapon = progress.weaponType;
    this.progress = progress;
    if (this.isOpen) this.render();
  }

  private render(): void {
    const weaponName = WEAPONS[this.weapon].name;
    const p = this.progress;
    const level = p?.level ?? 1;
    const available = p?.pointsAvailable ?? 0;
    const ranks = p?.ranks ?? {};

    this.title.innerHTML = `${iconSvg(WEAPONS[this.weapon].icon, "icon title-icon")}<span>${weaponName} — proficiency ${level}</span>`;

    this.list.innerHTML = "";

    // Header: where the points come from, so the tree is not a mystery economy.
    const header = document.createElement("div");
    header.className = "talent-header";
    const bar = level >= MAX_WEAPON_LEVEL ? 1 : (p ? p.intoLevel / Math.max(1, p.needed) : 0);
    header.innerHTML =
      `<div class="talent-xp"><div class="talent-xp-fill" style="width:${Math.round(bar * 100)}%"></div></div>` +
      `<div class="talent-points">` +
      `<b>${available}</b> point${available === 1 ? "" : "s"} to spend` +
      `<span>${level >= MAX_WEAPON_LEVEL ? "mastered" : `${p?.intoLevel ?? 0} / ${p?.needed ?? 0} to level ${level + 1}`}</span>` +
      `</div>`;
    const reset = document.createElement("button");
    reset.className = "talent-reset";
    reset.textContent = "Refund all";
    reset.disabled = (p?.pointsSpent ?? 0) === 0;
    reset.addEventListener("click", () => this.onReset(this.weapon));
    header.appendChild(reset);
    this.list.appendChild(header);

    // One block per tier, so the level gate is visible as structure rather than
    // as a message you only see after clicking something you cannot afford.
    const nodes = talentTree(this.weapon);
    const tiers = Math.max(...nodes.map((n) => n.tier)) + 1;
    for (let tier = 0; tier < tiers; tier++) {
      const need = TALENT_TIER_LEVELS[tier] ?? 1;
      const locked = level < need;

      const row = document.createElement("div");
      row.className = `talent-tier${locked ? " locked" : ""}`;

      const label = document.createElement("div");
      label.className = "talent-tier-label";
      label.textContent = locked ? `Proficiency ${need}` : `Tier ${tier + 1}`;
      row.appendChild(label);

      const grid = document.createElement("div");
      grid.className = "talent-grid";
      for (const node of nodes.filter((n) => n.tier === tier)) {
        grid.appendChild(this.renderNode(node, ranks, level));
      }
      row.appendChild(grid);
      this.list.appendChild(row);
    }
  }

  private renderNode(node: TalentNode, ranks: TalentRanks, level: number): HTMLElement {
    const rank = ranks[node.id] ?? 0;
    const verdict = canLearnTalent(this.weapon, ranks, node.id, level);
    const maxed = rank >= node.maxRank;

    const el = document.createElement("button");
    el.className = "talent-node";
    if (rank > 0) el.classList.add("learned");
    if (maxed) el.classList.add("maxed");
    if (!verdict.ok && !maxed) el.classList.add("unavailable");

    const skill = node.active ? SKILLS[node.active] : null;
    const cost = skill && skill.manaCost > 0 ? ` · ${skill.manaCost} mana` : "";
    const kindLabel = node.active ? `Skill${cost}` : "Passive";
    el.title = maxed
      ? `${node.name} — fully learned`
      : verdict.ok
        ? `${node.name} — click to learn`
        : `${node.name} — ${verdict.reason}`;

    el.innerHTML =
      `<span class="tn-icon">${iconSvg(node.icon)}</span>` +
      `<span class="tn-body">` +
      `<b>${node.name}</b>` +
      `<i>${kindLabel}</i>` +
      `<span class="tn-desc">${node.description}</span>` +
      // The condition, derived from the skill rather than restated in the
      // node's own prose — a hand-written "heavier against bleeding" is a
      // sentence that keeps saying so after the multiplier is retuned.
      (skill?.reads ? `<span class="tn-cond">${describeRead(skill.reads)}</span>` : "") +
      `</span>` +
      `<span class="tn-rank">${rank}/${node.maxRank}</span>`;

    el.addEventListener("click", () => {
      if (canLearnTalent(this.weapon, ranks, node.id, level).ok) this.onLearn(node.id);
    });

    // A learned skill is draggable onto the action bar. This is the only way
    // to fill the bar, so the panel that grants a skill is also where you pick
    // it up — rather than a separate spellbook listing the same thing twice.
    if (node.active && rank > 0) {
      el.classList.add("draggable");
      el.draggable = true;
      el.addEventListener("dragstart", () => beginBarDrag(node.active!));
      el.title += " — drag onto the action bar";
    }
    return el;
  }
}

/** Points available given a level and what has been spent — used by the HUD
 *  badge, which has no reason to know about the panel. */
export function unspentPoints(weapon: WeaponType, ranks: TalentRanks, level: number): number {
  return talentPointsAtLevel(level) - spentTalentPoints(weapon, ranks);
}
