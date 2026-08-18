import {
  INVENTORY_CAP,
  POTION_HEAL_AMOUNT,
  TONIC_XP_AMOUNT,
  sellValueFor,
  type GatherableResource,
  type ItemInstance,
  type ItemSlot,
} from "../../../shared/protocol-types";
import { attachItemTooltip, attachMaterialTooltip } from "./ItemTooltip";

const SLOT_ICON: Record<ItemSlot, string> = {
  weapon: "⚔️",
  helm: "⛑️",
  armor: "🛡️",
  cape: "🧣",
  boots: "👢",
  ring: "💍",
};
const MATERIAL_ICON: Record<GatherableResource, string> = { wood: "🪵", ore: "🪨", herb: "🌿" };
const MATERIAL_LABEL: Record<GatherableResource, string> = { wood: "Wood", ore: "Ore", herb: "Herb" };
const MATERIALS: GatherableResource[] = ["wood", "ore", "herb"];
type Filter = ItemSlot | "material" | "potion" | "all";

export class InventoryPanel {
  private overlay = document.getElementById("inventory-overlay")!;
  private grid = document.getElementById("inventory-grid")!;
  private closeButton = document.getElementById("inventory-close")!;
  private capacityEl = document.getElementById("inv-capacity")!;
  private tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".inv-tab"));
  private items: ItemInstance[] = [];
  private materials: Record<GatherableResource, number> = { wood: 0, ore: 0, herb: 0 };
  private potions = 0;
  private tonics = 0;
  private filter: Filter = "all";

  constructor(
    private readonly onEquip: (itemId: string) => void,
    private readonly onSell: (itemId: string) => void,
    private readonly onUsePotion: () => void,
    private readonly onUseTonic: () => void,
  ) {
    this.closeButton.addEventListener("click", () => this.close());
    for (const tab of this.tabButtons) {
      tab.addEventListener("click", () => {
        this.filter = (tab.dataset.filter as Filter) ?? "all";
        for (const t of this.tabButtons) t.classList.toggle("active", t === tab);
        this.render();
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

  setItems(items: ItemInstance[]): void {
    this.items = items;
    this.capacityEl.textContent = `(${items.length}/${INVENTORY_CAP})`;
    this.capacityEl.classList.toggle("inv-capacity-full", items.length >= INVENTORY_CAP);
    this.render();
  }

  setMaterials(wood: number, ore: number, herb: number): void {
    this.materials = { wood, ore, herb };
    this.render();
  }

  setPotions(potions: number): void {
    this.potions = potions;
    this.render();
  }

  setTonics(tonics: number): void {
    this.tonics = tonics;
    this.render();
  }

  private renderConsumableCard(icon: string, label: string, amount: number, tooltip: string, onUse: () => void): void {
    const card = document.createElement("div");
    card.className = "inv-item rarity-material";
    card.style.cursor = "pointer";

    const iconEl = document.createElement("div");
    iconEl.className = "inv-item-icon";
    iconEl.textContent = icon;
    card.appendChild(iconEl);

    const labelEl = document.createElement("div");
    labelEl.className = "inv-item-slot";
    labelEl.textContent = label;
    card.appendChild(labelEl);

    const qty = document.createElement("div");
    qty.className = "inv-item-qty";
    qty.textContent = `x${amount}`;
    card.appendChild(qty);

    card.addEventListener("click", onUse);
    attachMaterialTooltip(card, tooltip, amount);
    this.grid.appendChild(card);
  }

  private render(): void {
    this.grid.innerHTML = "";

    const showMaterials = this.filter === "all" || this.filter === "material";
    const materialEntries = showMaterials
      ? MATERIALS.filter((resource) => this.materials[resource] > 0)
      : [];
    const showConsumables = this.filter === "all" || this.filter === "potion";
    const showPotions = showConsumables && this.potions > 0;
    const showTonics = showConsumables && this.tonics > 0;
    const itemEntries =
      this.filter === "all"
        ? this.items
        : this.filter === "material" || this.filter === "potion"
          ? []
          : this.items.filter((item) => item.slot === this.filter);

    if (materialEntries.length === 0 && !showPotions && !showTonics && itemEntries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "inv-empty";
      empty.textContent =
        this.items.length === 0 &&
        this.materials.wood === 0 &&
        this.materials.ore === 0 &&
        this.materials.herb === 0 &&
        this.potions === 0 &&
        this.tonics === 0
          ? "No items yet — gather resources or fight monsters for loot."
          : "Nothing in this category.";
      this.grid.appendChild(empty);
      return;
    }

    if (showPotions) {
      this.renderConsumableCard(
        "🧪",
        "Potion",
        this.potions,
        `Health Potion — heals ${POTION_HEAL_AMOUNT} HP. Click to use.`,
        () => this.onUsePotion(),
      );
    }

    if (showTonics) {
      this.renderConsumableCard(
        "📜",
        "Tonic",
        this.tonics,
        `XP Tonic — grants ${TONIC_XP_AMOUNT} XP. Click to use.`,
        () => this.onUseTonic(),
      );
    }

    for (const resource of materialEntries) {
      const amount = this.materials[resource];
      const card = document.createElement("div");
      card.className = "inv-item rarity-material";

      const icon = document.createElement("div");
      icon.className = "inv-item-icon";
      icon.textContent = MATERIAL_ICON[resource];
      card.appendChild(icon);

      const label = document.createElement("div");
      label.className = "inv-item-slot";
      label.textContent = MATERIAL_LABEL[resource];
      card.appendChild(label);

      const qty = document.createElement("div");
      qty.className = "inv-item-qty";
      qty.textContent = `x${amount}`;
      card.appendChild(qty);

      attachMaterialTooltip(card, MATERIAL_LABEL[resource], amount);
      this.grid.appendChild(card);
    }

    for (const item of itemEntries) {
      const card = document.createElement("div");
      card.className = `inv-item rarity-${item.rarity}${item.equipped ? " equipped" : ""}`;

      const icon = document.createElement("div");
      icon.className = "inv-item-icon";
      icon.textContent = SLOT_ICON[item.slot];
      card.appendChild(icon);

      const slotLabel = document.createElement("div");
      slotLabel.className = "inv-item-slot";
      slotLabel.textContent = item.rarity;
      card.appendChild(slotLabel);

      if (!item.equipped) {
        card.addEventListener("click", () => this.onEquip(item.id));

        const sellBtn = document.createElement("button");
        sellBtn.className = "inv-item-sell";
        sellBtn.textContent = `${sellValueFor(item.rarity)}🪵`;
        sellBtn.title = "Sell for wood";
        sellBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onSell(item.id);
        });
        card.appendChild(sellBtn);
      }
      attachItemTooltip(card, item);

      this.grid.appendChild(card);
    }
  }
}
