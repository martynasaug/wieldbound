import {
  POTION_CRAFT_COST,
  POTION_HEAL_AMOUNT,
  TONIC_CRAFT_COST,
  TONIC_XP_AMOUNT,
  RARITY_ORDER,
  ITEM_SLOTS,
  WEAPON_TYPES,
  WEAPONS,
  CLASSES,
  classForWeapon,
  craftCostFor,
  type ItemRarity,
  type ItemSlot,
  type WeaponType,
} from "../../../shared/protocol-types";
import { iconSvg } from "./icons";

interface ConsumableCost {
  wood: number;
  ore: number;
  herb: number;
}

const SLOTS: readonly ItemSlot[] = ITEM_SLOTS;
const RARITY_HEX: Record<ItemRarity, string> = { common: "#9e9e9e", rare: "#42a5f5", epic: "#ab47bc" };

export class CraftPanel {
  private overlay = document.getElementById("craft-overlay")!;
  private grid = document.getElementById("craft-grid")!;
  private closeButton = document.getElementById("craft-close")!;
  private wood = 0;
  private ore = 0;
  private herb = 0;
  private stationId: string | null = null;
  // The workbench is where changing class is a deliberate act rather than
  // something a loot drop does to you: you pick the family, then the tier.
  // Defaults to what you already wield so the common case — upgrading — does
  // not re-class you by accident.
  private weaponType: WeaponType = "sword";

  constructor(
    private readonly onCraft: (stationId: string, slot: ItemSlot, rarity: ItemRarity, weaponType?: WeaponType) => void,
    private readonly onCraftPotion: (stationId: string) => void,
    private readonly onCraftTonic: (stationId: string) => void,
  ) {
    this.closeButton.addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains("open");
  }

  open(stationId: string): void {
    this.stationId = stationId;
    this.overlay.classList.add("open");
    this.render();
  }

  close(): void {
    this.overlay.classList.remove("open");
    this.stationId = null;
  }

  // Called whenever equipment changes, so opening the bench pre-selects the
  // family you are actually holding. Fists have no recipe, so an unarmed
  // character falls back to the sword — the entry-level pick.
  setEquippedWeapon(type: WeaponType | undefined): void {
    this.weaponType = type && type !== "fist" ? type : "sword";
    if (this.isOpen) this.render();
  }

  setResources(wood: number, ore: number, herb: number): void {
    this.wood = wood;
    this.ore = ore;
    this.herb = herb;
    if (this.isOpen) this.render();
  }

  private renderConsumableRow(name: string, color: string, cost: ConsumableCost, onCraft: () => void): void {
    const affordable = this.wood >= cost.wood && this.ore >= cost.ore && this.herb >= cost.herb;
    const row = document.createElement("div");
    row.className = "craft-row";
    const info = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "craft-row-name";
    nameEl.textContent = name;
    nameEl.style.color = color;
    const costLine = document.createElement("div");
    costLine.className = "craft-row-cost";
    const costParts = [
      cost.herb > 0 ? `${cost.herb} herb` : null,
      cost.wood > 0 ? `${cost.wood} wood` : null,
      cost.ore > 0 ? `${cost.ore} ore` : null,
    ].filter(Boolean);
    costLine.textContent = costParts.join(", ");
    info.appendChild(nameEl);
    info.appendChild(costLine);
    const button = document.createElement("button");
    button.textContent = "Craft";
    button.disabled = !affordable;
    button.addEventListener("click", onCraft);
    row.appendChild(info);
    row.appendChild(button);
    this.grid.appendChild(row);
  }

  // Family buttons, each labelled with the class it would make you — the
  // whole point being that this choice is the class choice, so it should not
  // be possible to make it without seeing that.
  private renderWeaponPicker(): void {
    const row = document.createElement("div");
    row.className = "craft-weapon-picker";
    for (const type of WEAPON_TYPES) {
      const def = WEAPONS[type];
      const button = document.createElement("button");
      button.className = "craft-weapon-btn";
      button.classList.toggle("active", type === this.weaponType);
      button.innerHTML = `<span class="cw-icon">${iconSvg(def.icon)}</span><span class="cw-name">${def.name}</span>`;
      button.title = `${def.name} — ${CLASSES[classForWeapon(type)].name}`;
      button.addEventListener("click", () => {
        this.weaponType = type;
        this.render();
      });
      row.appendChild(button);
    }
    const note = document.createElement("div");
    note.className = "craft-weapon-note";
    note.textContent = `Equipping a ${WEAPONS[this.weaponType].name.toLowerCase()} makes you a ${CLASSES[classForWeapon(this.weaponType)].name}.`;
    this.grid.appendChild(row);
    this.grid.appendChild(note);
  }

  private render(): void {
    this.grid.innerHTML = "";

    const consumableTitle = document.createElement("div");
    consumableTitle.className = "craft-section-title";
    consumableTitle.textContent = "consumable";
    this.grid.appendChild(consumableTitle);

    this.renderConsumableRow(`Health Potion (+${POTION_HEAL_AMOUNT} HP)`, "#7ed957", POTION_CRAFT_COST, () => {
      if (this.stationId) this.onCraftPotion(this.stationId);
    });
    this.renderConsumableRow(`XP Tonic (+${TONIC_XP_AMOUNT} XP)`, "#ffd873", TONIC_CRAFT_COST, () => {
      if (this.stationId) this.onCraftTonic(this.stationId);
    });

    for (const slot of SLOTS) {
      const sectionTitle = document.createElement("div");
      sectionTitle.className = "craft-section-title";
      sectionTitle.textContent = slot;
      this.grid.appendChild(sectionTitle);

      // One family picker rather than 7 families x 3 tiers of rows: the tier
      // rows below re-render against whichever family is selected.
      if (slot === "weapon") this.renderWeaponPicker();

      for (const rarity of RARITY_ORDER) {
        const cost = craftCostFor(slot, rarity);
        const affordable = this.wood >= cost.wood && this.ore >= cost.ore;

        const row = document.createElement("div");
        row.className = "craft-row";

        const info = document.createElement("div");
        const name = document.createElement("div");
        name.className = "craft-row-name";
        name.textContent = rarity;
        name.style.color = RARITY_HEX[rarity];
        const costLine = document.createElement("div");
        costLine.className = "craft-row-cost";
        costLine.textContent = `${cost.wood} wood, ${cost.ore} ore`;
        info.appendChild(name);
        info.appendChild(costLine);

        if (slot === "weapon") {
          const family = document.createElement("span");
          family.className = "craft-row-family";
          family.textContent = ` ${WEAPONS[this.weaponType].name}`;
          name.appendChild(family);
        }

        const button = document.createElement("button");
        button.textContent = "Craft";
        button.disabled = !affordable;
        button.addEventListener("click", () => {
          if (!this.stationId) return;
          this.onCraft(this.stationId, slot, rarity, slot === "weapon" ? this.weaponType : undefined);
        });

        row.appendChild(info);
        row.appendChild(button);
        this.grid.appendChild(row);
      }
    }
  }
}
