import {
  INVENTORY_CAP,
  ITEM_SLOTS,
  POTION_HEAL_AMOUNT,
  RARITY_ORDER,
  TONIC_XP_AMOUNT,
  WEAPONS,
  rarityRank,
  sellValueFor,
  type GatherableResource,
  type ItemInstance,
  type ItemRarity,
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
const RARITY_HEX: Record<ItemRarity, string> = { common: "#9e9e9e", rare: "#42a5f5", epic: "#ab47bc" };
const MATERIAL_ICON: Record<GatherableResource, string> = { wood: "🪵", ore: "🪨", herb: "🌿" };
const MATERIAL_LABEL: Record<GatherableResource, string> = { wood: "Wood", ore: "Ore", herb: "Herb" };
const MATERIALS: GatherableResource[] = ["wood", "ore", "herb"];

/**
 * The bag: a fixed grid of slots, with materials and consumables in their own
 * row underneath.
 *
 * Three things changed from the old panel, and all three were the same problem.
 * It drew only the cards it had, so the grid reflowed every time anything was
 * looted and items moved under the cursor. Materials and potions sat in the
 * grid alongside gear, competing for the space the gear needed. And nine filter
 * tabs existed to manage a mess that a fixed grid plus a sort button does not
 * have.
 *
 * Now every one of the thirty slots is drawn whether or not it holds anything,
 * so the third slot is always the third slot; materials and consumables live in
 * a footer, because they are counters rather than objects; and Sort is one
 * button instead of nine tabs.
 */
export class InventoryPanel {
  private overlay = document.getElementById("inventory-overlay")!;
  private grid = document.getElementById("inventory-grid")!;
  private closeButton = document.getElementById("inventory-close")!;
  private sortButton = document.getElementById("inv-sort")!;
  private capacityEl = document.getElementById("inv-capacity")!;
  private materialsEl = document.getElementById("inv-materials")!;
  private consumablesEl = document.getElementById("inv-consumables")!;

  private items: ItemInstance[] = [];
  private materials: Record<GatherableResource, number> = { wood: 0, ore: 0, herb: 0 };
  private potions = 0;
  private tonics = 0;
  /** Player-chosen order, applied on top of arrival order. Not persisted: it is
   *  a way of tidying up, not a setting. */
  private sorted = false;

  constructor(
    private readonly onEquip: (itemId: string) => void,
    private readonly onSell: (itemId: string) => void,
    private readonly onUsePotion: () => void,
    private readonly onUseTonic: () => void,
  ) {
    this.closeButton.addEventListener("click", () => this.close());
    this.sortButton.addEventListener("click", () => {
      this.sorted = !this.sorted;
      this.render();
    });
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
    this.render();
  }

  setMaterials(wood: number, ore: number, herb: number): void {
    this.materials = { wood, ore, herb };
    this.renderFooter();
  }

  setPotions(potions: number): void {
    this.potions = potions;
    this.renderFooter();
  }

  setTonics(tonics: number): void {
    this.tonics = tonics;
    this.renderFooter();
  }

  private ordered(): ItemInstance[] {
    const bag = this.items.filter((i) => !i.equipped);
    if (!this.sorted) return bag;
    const slotOrder = new Map(ITEM_SLOTS.map((s, i) => [s, i]));
    return [...bag].sort(
      (a, b) =>
        (slotOrder.get(a.slot) ?? 9) - (slotOrder.get(b.slot) ?? 9) ||
        rarityRank(b.rarity) - rarityRank(a.rarity) ||
        b.statValue - a.statValue,
    );
  }

  private render(): void {
    const bag = this.ordered();
    this.capacityEl.textContent = `${bag.length} / ${INVENTORY_CAP}`;
    this.capacityEl.style.color = bag.length >= INVENTORY_CAP ? "#ef5350" : "";

    this.grid.innerHTML = "";
    for (let i = 0; i < INVENTORY_CAP; i++) {
      const item = bag[i];
      const cell = document.createElement("div");
      cell.className = "bag-slot";
      if (!item) {
        this.grid.appendChild(cell);
        continue;
      }
      cell.classList.add("filled");
      cell.style.borderColor = RARITY_HEX[item.rarity];

      const icon = document.createElement("span");
      icon.textContent =
        item.slot === "weapon" && item.weaponType ? WEAPONS[item.weaponType].icon : SLOT_ICON[item.slot];
      cell.appendChild(icon);

      const qty = document.createElement("span");
      qty.className = "bag-qty";
      qty.textContent = String(item.statValue);
      cell.appendChild(qty);

      cell.addEventListener("click", () => this.onEquip(item.id));

      // Selling is the only irreversible thing in this window, so it never
      // shares a gesture with equipping: its own button, its own price on it.
      const sell = document.createElement("button");
      sell.className = "bag-sell";
      sell.textContent = `${sellValueFor(item.rarity)}🪵`;
      sell.title = `Sell for ${sellValueFor(item.rarity)} wood`;
      sell.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onSell(item.id);
      });
      cell.appendChild(sell);

      attachItemTooltip(cell, item);
      this.grid.appendChild(cell);
    }
    this.renderFooter();
  }

  private renderFooter(): void {
    this.materialsEl.innerHTML = "";
    for (const resource of MATERIALS) {
      const el = document.createElement("div");
      el.className = "cur";
      el.innerHTML = `<span class="cur-icon">${MATERIAL_ICON[resource]}</span>${this.materials[resource]}`;
      attachMaterialTooltip(el, MATERIAL_LABEL[resource], this.materials[resource]);
      this.materialsEl.appendChild(el);
    }

    this.consumablesEl.innerHTML = "";
    this.consumablesEl.appendChild(
      this.useButton("🧪", this.potions, `Health Potion — heals ${POTION_HEAL_AMOUNT} HP.`, () =>
        this.onUsePotion(),
      ),
    );
    this.consumablesEl.appendChild(
      this.useButton("📜", this.tonics, `XP Tonic — grants ${TONIC_XP_AMOUNT} XP.`, () =>
        this.onUseTonic(),
      ),
    );
  }

  private useButton(icon: string, count: number, title: string, onUse: () => void): HTMLElement {
    const button = document.createElement("button");
    button.className = "use-btn";
    button.innerHTML = `<span>${icon}</span><b>${count}</b>`;
    button.title = count > 0 ? `${title} Click to use.` : `${title} You have none.`;
    button.disabled = count <= 0;
    button.addEventListener("click", onUse);
    return button;
  }
}

/** Kept for the rarity legend the craft panel shares. */
export const RARITY_COLOURS = RARITY_ORDER.map((r) => RARITY_HEX[r]);
