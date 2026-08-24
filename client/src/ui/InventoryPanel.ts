import {
  INVENTORY_CAP,
  ITEM_SLOTS,
  POTION_HEAL_AMOUNT,
  RARITY_ORDER,
  TONIC_XP_AMOUNT,
  WEAPONS,
  rarityRank,
  type GatherableResource,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
} from "../../../shared/protocol-types";
import { attachItemTooltip, attachMaterialTooltip } from "./ItemTooltip";
import { iconEl, iconSvg } from "./icons";
import { isUpgrade, itemIcon, itemShortName, rarityColor, rarityGlows, SLOT_ICON } from "./items";
import {
  CONSUMABLES,
  CONSUMABLE_IDS,
  bagStacks,
  consumableSummary,
  itemScore,
  type BagStack,
  MATERIAL_ICON,
  MATERIAL_LABEL,
  MATERIALS,
  type Material,
} from "../../../shared/items";

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
 *
 * A CELL HOLDS A KIND, NOT AN INSTANCE. Six copies of one Worn dirk are one
 * cell with a six on it, because six pictures of the same thing is what the
 * player was being asked to read. What counts as "the same thing" is the item's
 * NAME — base, quality and affixes — so a Keen one and a Tempered one stack
 * apart, which is the line a player would draw anyway. See `bagStacks`.
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
  // Built from the shared list rather than written out, so a material added
  // there arrives here at zero instead of arriving as undefined.
  private materials: Record<Material, number> = Object.fromEntries(
    MATERIALS.map((m) => [m, 0]),
  ) as Record<Material, number>;
  private consumables: Record<string, number> = {};
  private potions = 0;
  private tonics = 0;
  // The shared `gated` cooldown (see `ConsumableDef.gated`), enforced
  // server-side since it existed but never shown here — a potion button
  // that had just gone on cooldown looked exactly like one that was ready,
  // and the only feedback was a toast AFTER clicking it too early.
  private gatedReadyAt = 0;
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  /** Player-chosen order, applied on top of arrival order. Not persisted: it is
   *  a way of tidying up, not a setting. */
  private sorted = false;

  constructor(
    private readonly onEquip: (itemId: string) => void,
    private readonly onSell: (itemId: string) => void,
    private readonly onUseConsumable: (id: string) => void,
    private readonly onSalvageMany: (itemIds: string[]) => void,
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

  setMaterials(m: Record<Material, number>): void {
    this.materials = m;
    this.renderFooter();
  }

  setConsumables(counts: Record<string, number>, cooldownRemainingMs = 0): void {
    this.consumables = counts;
    this.gatedReadyAt = performance.now() + cooldownRemainingMs;
    this.renderFooter();
    this.scheduleCooldownTick();
  }

  /**
   * Re-renders the footer once a second while a gated cooldown is running,
   * so the countdown on the button actually counts down rather than only
   * updating on the next unrelated server message — and stops on its own
   * the moment the cooldown clears, rather than ticking forever.
   */
  private scheduleCooldownTick(): void {
    if (this.cooldownTimer !== null) return;
    const remaining = this.gatedReadyAt - performance.now();
    if (remaining <= 0) return;
    this.cooldownTimer = setTimeout(() => {
      this.cooldownTimer = null;
      this.renderFooter();
      this.scheduleCooldownTick();
    }, Math.min(1000, Math.max(100, remaining)));
  }

  setPotions(potions: number): void {
    this.potions = potions;
    this.renderFooter();
  }

  setTonics(tonics: number): void {
    this.tonics = tonics;
    this.renderFooter();
  }

  /**
   * The cells, in the order they are drawn.
   *
   * Grouping happens in shared, because the server counts the same cells to
   * decide whether a drop fits — a second copy of the rule here is a second
   * thing that can disagree about whether the bag is full.
   */
  private ordered(): BagStack[] {
    const stacks = bagStacks(this.items);
    if (!this.sorted) return stacks;
    const slotOrder = new Map(ITEM_SLOTS.map((s, i) => [s, i]));
    return [...stacks].sort(
      (a, b) =>
        (slotOrder.get(a.best.slot) ?? 9) - (slotOrder.get(b.best.slot) ?? 9) ||
        rarityRank(b.best.rarity) - rarityRank(a.best.rarity) ||
        // Score rather than the raw primary roll: with a catalogue, two items
        // in one slot are no longer comparable on one number — a band-4 helm
        // with two affixes beats a band-5 one with none.
        itemScore(b.best) - itemScore(a.best),
    );
  }

  private render(): void {
    const bag = this.ordered();
    const carried = bag.reduce((n, s) => n + s.count, 0);
    // Cells over the count, because cells are what the cap is now measured in
    // — and the count is kept beside it, because "22 things in 14 slots" is the
    // whole of what stacking did and hiding it would make the bag look emptier
    // than it is.
    this.capacityEl.textContent =
      `${bag.length} / ${INVENTORY_CAP}` + (carried > bag.length ? ` (${carried} items)` : "");
    this.capacityEl.style.color = bag.length >= INVENTORY_CAP ? "#ef5350" : "";

    this.grid.innerHTML = "";
    for (let i = 0; i < INVENTORY_CAP; i++) {
      const stack = bag[i];
      const cell = document.createElement("div");
      cell.className = "bag-slot";
      if (!stack) {
        this.grid.appendChild(cell);
        continue;
      }
      // The best-rolled of the pile: it is the one a click equips, so it has to
      // be the one whose numbers the cell and its tooltip show.
      const item = stack.best;
      cell.classList.add("filled");
      const colour = rarityColor(item.rarity);
      cell.style.borderColor = colour;
      // The icon takes the same colour through currentColor, so one assignment
      // tints the border and the glyph together.
      cell.style.color = colour;
      // The top two qualities lift off the grid. Only those two, or the lift
      // stops meaning anything.
      if (rarityGlows(item.rarity)) cell.classList.add("lit");

      // A cell whose contents carry a cut rune. Etching does not change an
      // item's NAME, so two cells of the same thing sit side by side the moment
      // one of them has been paid for — and a bag that draws those identically
      // is a bag where the salvage button destroys the wrong pile. An edge
      // rather than a corner mark: all four corners are already spoken for, and
      // this is a property of the whole cell rather than a badge on it.
      if ((item.etched?.length ?? 0) > 0) cell.classList.add("etched");

      // The item's OWN icon, from the catalogue — a hood and a great helm are
      // both helms and should not be the same picture in a bag of thirty.
      const icon = iconEl(itemIcon(item) || SLOT_ICON[item.slot]);
      if (icon) cell.appendChild(icon);

      const qty = document.createElement("span");
      qty.className = "bag-qty";
      qty.textContent = String(item.statValue);
      cell.appendChild(qty);

      // How many are in the cell. Bottom left, because top left is where the
      // upgrade mark already lives and the two were drawn on top of each other
      // for exactly one screenshot. Absent at one: a "1" on every slot in the
      // bag is thirty characters that say nothing.
      if (stack.count > 1) {
        const count = document.createElement("span");
        count.className = "bag-count";
        count.textContent = `${stack.count}`;
        cell.appendChild(count);
      }

      // A mark for things that are straightforwardly better than what is worn.
      // Only when there is nothing to trade off — a mark that appears on
      // sidegrades is a mark players learn to ignore, and the tooltip is where
      // the honest per-number comparison lives.
      if (isUpgrade(item, this.items)) {
        const up = document.createElement("span");
        up.className = "bag-up";
        up.textContent = "▲";
        up.title = "Better than what you are wearing";
        cell.appendChild(up);
      }

      cell.addEventListener("click", () => this.onEquip(item.id));

      // Salvaging is the only irreversible thing in this window, so it never
      // shares a gesture with equipping: its own button, revealed on hover.
      const salvage = document.createElement("button");
      salvage.className = "bag-sell";
      salvage.innerHTML = iconSvg("salvage", "icon inline");
      // A cell is a kind, so its salvage button breaks down the kind. Safe
      // precisely because a stack is homogeneous by construction — everything
      // in it has the same name, so there is no "but I wanted to keep one of
      // those" hiding in the pile.
      salvage.title =
        stack.count > 1
          ? `Salvage all ${stack.count} ${itemShortName(item)} for materials`
          : `Salvage ${itemShortName(item)} for materials`;
      salvage.addEventListener("click", (e) => {
        e.stopPropagation();
        if (stack.count > 1) this.onSalvageMany(stack.items.map((i) => i.id));
        else this.onSell(item.id);
      });
      cell.appendChild(salvage);

      attachItemTooltip(cell, item, this.items, stack.count);
      this.grid.appendChild(cell);
    }
    this.renderFooter();
  }

  private renderFooter(): void {
    this.materialsEl.innerHTML = "";
    for (const resource of MATERIALS) {
      const el = document.createElement("div");
      el.className = "cur";
      el.innerHTML = `<span class="cur-icon">${iconSvg(MATERIAL_ICON[resource])}</span>${this.materials[resource]}`;
      attachMaterialTooltip(el, MATERIAL_LABEL[resource], this.materials[resource]);
      this.materialsEl.appendChild(el);
    }

    // Driven off the shared table, so adding a consumable is a row there and
    // nothing here. Empty stacks are drawn too — a button that vanishes when it
    // reaches zero is one the player has to remember exists.
    this.consumablesEl.innerHTML = "";
    for (const id of CONSUMABLE_IDS) {
      const def = CONSUMABLES[id];
      this.consumablesEl.appendChild(
        this.useButton(
          def.icon,
          this.consumables[id] ?? 0,
          `${def.name} — ${consumableSummary(def)}. ${def.blurb}`,
          () => this.onUseConsumable(id),
          def.gated ? Math.max(0, this.gatedReadyAt - performance.now()) : 0,
        ),
      );
    }
  }

  private useButton(
    icon: string,
    count: number,
    title: string,
    onUse: () => void,
    cooldownRemainingMs = 0,
  ): HTMLElement {
    const button = document.createElement("button");
    button.className = "use-btn";
    const onCooldown = cooldownRemainingMs > 0;
    // The count becomes the countdown while it's running — no new element
    // or style needed, and the existing `:disabled` dimming already says
    // "not usable" the same way an empty stack does.
    const badge = onCooldown ? `${Math.ceil(cooldownRemainingMs / 1000)}s` : String(count);
    button.innerHTML = `<span class="use-icon">${iconSvg(icon)}</span><b>${badge}</b>`;
    button.title = onCooldown
      ? `${title} Ready in ${Math.ceil(cooldownRemainingMs / 1000)}s.`
      : count > 0 ? `${title} Click to use.` : `${title} You have none.`;
    button.disabled = onCooldown || count <= 0;
    button.addEventListener("click", onUse);
    return button;
  }
}

/** Kept for the rarity legend the craft panel shares. */
export const RARITY_COLOURS = RARITY_ORDER.map((r) => rarityColor(r));
