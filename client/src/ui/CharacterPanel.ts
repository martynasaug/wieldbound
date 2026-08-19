import {
  ITEM_SLOTS,
  MAX_WEAPON_LEVEL,
  WEAPONS,
  classForWeapon,
  statAdviceFor,
  type AttributeName,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
  type WeaponType,
} from "../../../shared/protocol-types";
import { attachItemTooltip } from "./ItemTooltip";
import { iconEl, iconSvg } from "./icons";

const RARITY_HEX: Record<ItemRarity, string> = { common: "#9e9e9e", rare: "#42a5f5", epic: "#ab47bc" };
// Driven off the shared slot list rather than a copy, so the next slot to be
// added shows up here without anyone remembering to add it.
const SLOT_ICON: Record<ItemSlot, string> = {
  weapon: "slot-weapon",
  helm: "slot-helm",
  armor: "slot-armor",
  cape: "slot-cape",
  boots: "slot-boots",
  ring: "slot-ring",
};
const ATTRS: AttributeName[] = ["strength", "agility", "vitality", "intelligence"];
// Deliberately a figure rather than a weapon: the weapon name is written
// directly underneath, and repeating it as the portrait wastes the one place
// in the window that could show WHO you are rather than what you carry.
const CLASS_ART: Record<string, string> = {
  adventurer: "class-adventurer",
  warrior: "class-warrior",
  ranger: "class-ranger",
  mage: "class-mage",
};

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

/**
 * The character sheet: a paperdoll flanked by equipment, then attributes and
 * statistics behind tabs.
 *
 * The old version stacked six labelled boxes, twelve statistics and four
 * attribute rows into one column, which meant the thing a player opens this
 * window for — "what am I wearing and is this upgrade better" — was competing
 * for space with numbers they read once. The doll answers the first question
 * without reading anything; the tabs stop the second from crowding it out.
 */
export class CharacterPanel {
  private overlay = document.getElementById("character-overlay")!;
  private closeButton = document.getElementById("character-close")!;
  private nameEl = document.getElementById("char-name-label")!;
  private levelEl = document.getElementById("char-level-label")!;
  private classEl = document.getElementById("char-class-label")!;
  private dollArt = document.getElementById("doll-art")!;
  private dollWeapon = document.getElementById("doll-weapon")!;
  private dollProf = document.getElementById("doll-prof")!;
  private dollPower = document.getElementById("doll-power")!;
  private dockBadge = document.getElementById("dock-character-badge")!;

  private gearSlots = new Map<ItemSlot, HTMLElement>();
  private statEls: Record<string, HTMLElement> = {};

  private attrPointsEl = document.getElementById("attr-points")!;
  private attrAdviceEl = document.getElementById("attr-advice")!;
  private attrValueEls = {} as Record<AttributeName, HTMLElement>;
  private attrNoteEls = {} as Record<AttributeName, HTMLElement>;
  private attrRows = {} as Record<AttributeName, HTMLElement>;
  private attrButtons = {} as Record<AttributeName, HTMLButtonElement>;

  private weapon: WeaponType | undefined = undefined;

  constructor(private readonly onAllocate: (stat: AttributeName) => void) {
    this.closeButton.addEventListener("click", () => this.close());

    for (const slot of ITEM_SLOTS) {
      const el = document.querySelector<HTMLElement>(`.gear-slot[data-slot="${slot}"]`);
      if (el) this.gearSlots.set(slot, el);
    }
    for (const id of [
      "move", "xpbonus", "gather", "battle", "hit", "accuracy",
      "crit-chance", "crit-damage", "armor", "evasion", "double-attack", "hp-regen",
    ]) {
      const el = document.getElementById(`stat-${id}`);
      if (el) this.statEls[id] = el;
    }
    for (const stat of ATTRS) {
      this.attrValueEls[stat] = document.getElementById(`attr-${stat}`)!;
      this.attrNoteEls[stat] = document.querySelector(`[data-stat-note="${stat}"]`)!;
      this.attrRows[stat] = document.querySelector(`.attr-row[data-stat="${stat}"]`)!;
      this.attrButtons[stat] = document.querySelector(`.attr-plus[data-stat="${stat}"]`)!;
      this.attrButtons[stat].addEventListener("click", () => this.onAllocate(stat));
    }

    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".char-tab"));
    const bodies = Array.from(document.querySelectorAll<HTMLElement>(".char-tabbody"));
    for (const tab of tabs) {
      tab.addEventListener("click", () => {
        for (const t of tabs) t.classList.toggle("active", t === tab);
        for (const b of bodies) b.classList.toggle("hidden", b.dataset.tab !== tab.dataset.tab);
      });
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
    this.nameEl.textContent = name;
    this.levelEl.textContent = String(level);
  }

  /** The figure in the middle: what you are, what you hold, how far along it. */
  setWeapon(weapon: WeaponType | undefined, proficiency: number | null): void {
    this.weapon = weapon;
    const cls = classForWeapon(weapon);
    this.classEl.textContent = cls.charAt(0).toUpperCase() + cls.slice(1);
    this.dollArt.innerHTML = iconSvg(CLASS_ART[cls] ?? "class-adventurer", "icon");
    this.dollWeapon.textContent = weapon ? WEAPONS[weapon].name : "Unarmed";
    this.dollProf.textContent =
      proficiency === null
        ? ""
        : proficiency >= MAX_WEAPON_LEVEL
          ? "Mastered"
          : `Proficiency ${proficiency}`;
    this.setStatAdvice(weapon);
  }

  setEquipped(items: ItemInstance[]): void {
    for (const slot of ITEM_SLOTS) {
      const el = this.gearSlots.get(slot);
      if (!el) continue;
      const item = items.find((i) => i.slot === slot && i.equipped);
      el.innerHTML = "";
      if (!item) {
        el.style.borderColor = "#5a441f";
        el.style.removeProperty("color");
        el.classList.remove("filled");
        const ghost = document.createElement("span");
        ghost.className = "gear-empty";
        ghost.innerHTML = iconSvg(SLOT_ICON[slot]);
        el.appendChild(ghost);
        el.title = `${slot} — empty`;
        continue;
      }
      // The border carries the rarity and `currentColor` lets the glow follow
      // it, so one assignment lights the whole slot.
      el.style.borderColor = RARITY_HEX[item.rarity];
      el.style.color = RARITY_HEX[item.rarity];
      el.classList.add("filled");
      const icon = iconEl(
        item.slot === "weapon" && item.weaponType ? WEAPONS[item.weaponType].icon : SLOT_ICON[slot],
      );
      if (icon) el.appendChild(icon);
      const lvl = document.createElement("span");
      lvl.className = "gear-lvl";
      lvl.textContent = String(item.statValue);
      el.appendChild(lvl);
      el.title = "";
      attachItemTooltip(el, item);
    }

    // One number for "how good is my gear", summed from the rolls the combat
    // formulas actually read. It answers the question the window is opened for
    // — did that drop help — without reading six tooltips.
    const power = items
      .filter((i) => i.equipped)
      .reduce((total, i) => total + i.statValue + i.bonusStatValue, 0);
    this.dollPower.textContent = String(Math.round(power));
  }

  setStats(stats: CharacterStats): void {
    const set = (id: string, value: string) => {
      const el = this.statEls[id];
      if (el) el.textContent = value;
    };
    set("move", `${Math.round(stats.moveSpeedPxPerSec)} px/s`);
    set("xpbonus", `+${Math.round(stats.xpBonusPercent * 100)}%`);
    set("gather", `${stats.gatherTimeSec.toFixed(1)}s`);
    set("battle", `${stats.battleTimeSec.toFixed(2)}s`);
    set("hit", `${stats.minHit}-${stats.maxHit}`);
    set("accuracy", `${stats.accuracy}%`);
    set("crit-chance", `${stats.critChance}%`);
    set("crit-damage", `${stats.critDamagePercent}%`);
    set("armor", String(stats.armor));
    set("evasion", String(stats.evasion));
    set("double-attack", `${stats.doubleAttackPercent}%`);
    set("hp-regen", `${stats.hpRegen} hp/5s`);
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

  /**
   * Marks which attributes the weapon in hand actually wants.
   *
   * Stat points are permanent and there are four places to put them, so spending
   * them blind was the one part of building a character the game never
   * explained — and the right answer genuinely changes with the weapon, since
   * that is what decides which attribute multiplies your damage.
   */
  setStatAdvice(weapon: WeaponType | undefined): void {
    const advice = statAdviceFor(weapon);
    const name = WEAPONS[weapon ?? "fist"].name;
    this.attrAdviceEl.innerHTML = `<b>${name}:</b> ${advice.why}`;
    const labels = ["primary", "useful", "situational", "wasted"];
    advice.order.forEach((stat, i) => {
      const row = this.attrRows[stat];
      row.classList.toggle("attr-primary", i === 0);
      row.classList.toggle("attr-minor", i >= 2);
      this.attrNoteEls[stat].textContent = labels[i] ?? "";
    });
  }
}
