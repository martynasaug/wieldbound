import {
  ITEM_SLOTS,
  MAX_WEAPON_LEVEL,
  WEAPONS,
  classForWeapon,
  equippedBySlot,
  statAdviceFor,
  type AttributeName,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
  type WeaponType,
} from "../../../shared/protocol-types";
import { attachItemTooltip } from "./ItemTooltip";
import { iconEl, iconSvg } from "./icons";

// Rarity colours, slot icons and item names all come from one place now — see
// ui/items.ts. Four panels each carrying their own copy of the palette is how
// two of them came to disagree about what colour a tier was.
import { SLOT_ICON, describeBonus, itemIcon, itemShortName, rarityColor } from "./items";
import type { PassiveBonus } from "../../../shared/protocol-types";
import { activeSets } from "../../../shared/items";
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
  /** Last item list seen, so the figure can name what is actually in the hand. */
  private equipped: ItemInstance[] = [];
  private setsEl = document.getElementById("doll-sets")!;
  private sourcesEl = document.getElementById("stat-sources")!;

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
    this.refreshWeaponName();
    this.dollProf.textContent =
      proficiency === null
        ? ""
        : proficiency >= MAX_WEAPON_LEVEL
          ? "Mastered"
          : `Proficiency ${proficiency}`;
    this.setStatAdvice(weapon);
  }

  /**
   * The weapon by NAME, not by family: "Bloodclaim Claymore" is what the player
   * chose to carry, and "Sword" is a category they never picked.
   *
   * Called from both `setWeapon` and `setEquipped` because either can arrive
   * first — the family comes with the weapon-progress message and the item list
   * with the inventory one, and neither is ordered with respect to the other.
   */
  private refreshWeaponName(): void {
    const held = this.equipped.find((i) => i.equipped && i.slot === "weapon");
    this.dollWeapon.textContent = held
      ? itemShortName(held)
      : this.weapon
        ? WEAPONS[this.weapon].name
        : "Unarmed";
  }

  /**
   * Matched gear, under the figure.
   *
   * Unreached tiers are drawn too, greyed: "three of five Blackglass" is only
   * useful if the player can see what the fifth would buy. Nothing here is
   * reported until they are one piece away, or a character wearing one of
   * everything gets a list of twelve materials, which is not information.
   */
  private renderSets(): void {
    const sets = activeSets(equippedBySlot(this.equipped));
    this.setsEl.innerHTML = "";
    for (const set of sets) {
      const box = document.createElement("div");
      box.className = "doll-set";

      const name = document.createElement("div");
      name.className = "doll-set-name";
      name.innerHTML = `${set.name} <b>${set.count} worn</b>`;
      box.appendChild(name);

      for (const tier of set.tiers) {
        const row = document.createElement("div");
        row.className = `doll-set-tier${tier.active ? " on" : ""}`;
        row.textContent = `${tier.need}: ${describeBonus(tier.bonus)}`;
        box.appendChild(row);
      }
      this.setsEl.appendChild(box);
    }
  }

  setEquipped(items: ItemInstance[]): void {
    this.equipped = items;
    this.refreshWeaponName();
    this.renderSets();
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
      el.style.borderColor = rarityColor(item.rarity);
      el.style.color = rarityColor(item.rarity);
      el.classList.add("filled");
      // The item's own icon: a hood and a great helm are both helms and should
      // not be the same picture on the figure.
      const icon = iconEl(itemIcon(item) || SLOT_ICON[slot]);
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

  /**
   * Where the numbers on this tab come from.
   *
   * Four systems feed them — the rolled numbers on gear, the affixes on that
   * gear, matched sets, and the weapon's talents — and a single total cannot
   * say which is doing the work or which one would move if the player changed
   * something. Each source lists only what it actually contributes: a row of
   * zeroes is worse than no row, because it has to be read before it can be
   * dismissed.
   */
  setSources(sources: { name: string; bonus: PassiveBonus }[]): void {
    this.sourcesEl.innerHTML = "";
    let any = false;
    for (const source of sources) {
      const text = describeBonus(source.bonus);
      if (!text) continue;
      any = true;
      const box = document.createElement("div");
      box.className = "src";
      const name = document.createElement("div");
      name.className = "src-name";
      name.textContent = source.name;
      const body = document.createElement("div");
      body.className = "src-body";
      body.textContent = text;
      box.appendChild(name);
      box.appendChild(body);
      this.sourcesEl.appendChild(box);
    }
    if (!any) {
      const none = document.createElement("div");
      none.className = "src-none";
      none.textContent =
        "Nothing yet. Gear, the affixes on it, matched materials and your weapon's talents all show up here.";
      this.sourcesEl.appendChild(none);
    }
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
