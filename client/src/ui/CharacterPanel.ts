import { ITEM_SLOTS } from "../../../shared/protocol-types";
import type { AttributeName, ItemInstance, ItemRarity, ItemSlot } from "../../../shared/protocol-types";

const RARITY_HEX: Record<ItemRarity, string> = { common: "#9e9e9e", rare: "#42a5f5", epic: "#ab47bc" };
// Driven off the shared slot list rather than a copy, so the next slot to be
// added shows up here as soon as its markup exists.
const SLOTS: readonly ItemSlot[] = ITEM_SLOTS;
// Intelligence is spendable like the rest — it was missing from this list,
// which quietly made a mage's own primary attribute the one stat no one
// could put a point into.
const ATTRS: AttributeName[] = ["strength", "agility", "vitality", "intelligence"];

export interface CharacterStats {
  moveSpeedPxPerSec: number;
  xpBonusPercent: number;
  gatherTimeSec: number;
  battleTimeSec: number;
  minHit: number;
  maxHit: number;
  accuracy: number;
  critChance: number;
  critDamagePercent: number;
  armor: number;
  evasion: number;
  doubleAttackPercent: number;
  hpRegen: number;
}

export interface Attributes {
  strength: number;
  agility: number;
  vitality: number;
  intelligence: number;
  statPoints: number;
}


export class CharacterPanel {
  private overlay = document.getElementById("character-overlay")!;
  private closeButton = document.getElementById("character-close")!;
  private dockBadge = document.getElementById("dock-character-badge")!;
  private nameLabel = document.getElementById("char-name-label")!;
  private levelLabel = document.getElementById("char-level-label")!;
  // Looked up by slot name rather than listed one-by-one: the markup already
  // carries `data-slot`, so a hand-written map here is a second copy of the
  // slot list that can only ever fall behind the first.
  private equipSlotBoxEls = Object.fromEntries(
    SLOTS.map((slot) => [slot, document.querySelector(`.equip-slot[data-slot="${slot}"]`)!]),
  ) as Record<ItemSlot, HTMLElement>;
  private equipRarityEls = Object.fromEntries(
    SLOTS.map((slot) => [slot, document.querySelector(`.equip-slot[data-slot="${slot}"] .equip-rarity`)!]),
  ) as Record<ItemSlot, HTMLElement>;
  private statMoveEl = document.getElementById("stat-move")!;
  private statXpBonusEl = document.getElementById("stat-xpbonus")!;
  private statGatherEl = document.getElementById("stat-gather")!;
  private statBattleEl = document.getElementById("stat-battle")!;
  private statHitEl = document.getElementById("stat-hit")!;
  private statAccuracyEl = document.getElementById("stat-accuracy")!;
  private statCritChanceEl = document.getElementById("stat-crit-chance")!;
  private statCritDamageEl = document.getElementById("stat-crit-damage")!;
  private statArmorEl = document.getElementById("stat-armor")!;
  private statEvasionEl = document.getElementById("stat-evasion")!;
  private statDoubleAttackEl = document.getElementById("stat-double-attack")!;
  private statHpRegenEl = document.getElementById("stat-hp-regen")!;
  private attrPointsEl = document.getElementById("attr-points")!;
  private attrValueEls: Record<AttributeName, HTMLElement> = {
    strength: document.getElementById("attr-strength")!,
    agility: document.getElementById("attr-agility")!,
    vitality: document.getElementById("attr-vitality")!,
    intelligence: document.getElementById("attr-intelligence")!,
  };
  private attrButtons: Record<AttributeName, HTMLButtonElement> = {
    strength: document.querySelector('.attr-plus[data-stat="strength"]')!,
    agility: document.querySelector('.attr-plus[data-stat="agility"]')!,
    vitality: document.querySelector('.attr-plus[data-stat="vitality"]')!,
    intelligence: document.querySelector('.attr-plus[data-stat="intelligence"]')!,
  };

  constructor(private readonly onAllocate: (stat: AttributeName) => void) {
    this.closeButton.addEventListener("click", () => this.close());
    for (const stat of ATTRS) {
      this.attrButtons[stat].addEventListener("click", () => this.onAllocate(stat));
    }
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains("open");
  }

  open(): void {
    this.overlay.classList.add("open");
  }

  close(): void {
    this.overlay.classList.remove("open");
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  setIdentity(name: string, level: number): void {
    this.nameLabel.textContent = name;
    this.levelLabel.textContent = String(level);
  }

  // Takes the item list and finds what is worn, rather than being handed a
  // per-slot summary the caller has to assemble — that summary was a third
  // place the slot list lived, and it had to be extended by hand every time
  // a slot was added.
  setEquipped(items: ItemInstance[]): void {
    for (const slot of SLOTS) {
      const worn = items.find((item) => item.equipped && item.slot === slot);
      const label = worn ? (slot === "weapon" && worn.weaponType ? `${worn.rarity} ${worn.weaponType}` : worn.rarity) : "None";
      const rarityEl = this.equipRarityEls[slot];
      rarityEl.textContent = label;
      rarityEl.style.color = worn ? RARITY_HEX[worn.rarity] : "#9e9e9e";
      this.equipSlotBoxEls[slot].style.borderColor = worn ? RARITY_HEX[worn.rarity] : "#444";
    }
  }

  setStats(stats: CharacterStats): void {
    this.statMoveEl.textContent = `${Math.round(stats.moveSpeedPxPerSec)} px/s`;
    this.statXpBonusEl.textContent = `+${stats.xpBonusPercent}%`;
    this.statGatherEl.textContent = `${stats.gatherTimeSec.toFixed(1)}s`;
    this.statBattleEl.textContent = `${stats.battleTimeSec.toFixed(1)}s`;
    this.statHitEl.textContent = `${stats.minHit}-${stats.maxHit}`;
    this.statAccuracyEl.textContent = `${stats.accuracy}%`;
    this.statCritChanceEl.textContent = `${stats.critChance}%`;
    this.statCritDamageEl.textContent = `${stats.critDamagePercent}%`;
    this.statArmorEl.textContent = String(stats.armor);
    this.statEvasionEl.textContent = String(stats.evasion);
    this.statDoubleAttackEl.textContent = `${stats.doubleAttackPercent}%`;
    this.statHpRegenEl.textContent = `${stats.hpRegen} hp/5s`;
  }

  setAttributes(attrs: Attributes): void {
    this.attrPointsEl.textContent = String(attrs.statPoints);
    for (const stat of ATTRS) {
      this.attrValueEls[stat].textContent = String(attrs[stat]);
      this.attrButtons[stat].disabled = attrs.statPoints <= 0;
    }
    this.dockBadge.textContent = String(attrs.statPoints);
    this.dockBadge.classList.toggle("show", attrs.statPoints > 0);
  }
}
