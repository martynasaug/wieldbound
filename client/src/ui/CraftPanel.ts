// The smithy.
//
// The old workbench had one verb and no decisions in it: pick a slot, pick a
// tier, pay wood and ore, receive an anonymous item. It was a way of buying
// loot rolls, and the only choice was how much to spend.
//
// There are three verbs now, and each is a different question — which is why
// they are three tabs rather than three buttons on one list:
//
//   FORGE    what do I want to own? A catalogue of named things, gated by
//            level so the bench cannot outrun the world you have walked into.
//            Always comes out Honed, the baseline the catalogue is authored at.
//
//   REFORGE  which ONE of these do I invest in? Every item in the bag with the
//            cost of its next step up the ladder. Steeply superlinear, so the
//            answer is one item and not all six.
//
//   SALVAGE  what is this worth in parts? Where everything you have outgrown
//            goes, and the reason a Broken drop is worth picking up.
//
// Consumables stay where they were, at the top of Forge, because they are the
// one thing here that is still just a recipe.

import {
  POTION_CRAFT_COST,
  POTION_HEAL_AMOUNT,
  TONIC_CRAFT_COST,
  TONIC_XP_AMOUNT,
  ITEM_SLOTS,
  SLOT_LABEL,
  type ItemInstance,
  type ItemSlot,
} from "../../../shared/protocol-types";
import {
  ITEM_BASES,
  MATERIALS,
  canAfford,
  canForge,
  describeCost,
  forgeCost,
  itemBase,
  nextRarity,
  reforgeCost,
  reforgePreview,
  salvageYield,
  type ItemBase,
  type Material,
  type MaterialCost,
} from "../../../shared/items";
import { iconSvg } from "./icons";
import { itemIcon, itemShortName, rarityColor, rarityName } from "./items";

type Tab = "forge" | "reforge" | "salvage";

interface ConsumableCost {
  wood: number;
  ore: number;
  herb: number;
}

export class CraftPanel {
  private overlay = document.getElementById("craft-overlay")!;
  private grid = document.getElementById("craft-grid")!;
  private closeButton = document.getElementById("craft-close")!;

  private materials: Record<Material, number> = { wood: 0, ore: 0, herb: 0, essence: 0 };
  private items: ItemInstance[] = [];
  /** Base ids this character has learned to forge. Band-1 recipes are known
   *  without being taught, so this is only what salvaging has added. */
  private recipes: string[] = [];
  private stationId: string | null = null;
  private tab: Tab = "forge";
  /** Which slot's shelf is open in Forge. Seventy-eight recipes in one
   *  column is a list nobody reads to the bottom of; one slot at a time is a
   *  shelf. */
  private slotFilter: ItemSlot = "weapon";

  constructor(
    private readonly onForge: (stationId: string, baseId: string) => void,
    private readonly onReforge: (stationId: string, itemId: string) => void,
    private readonly onSalvage: (itemId: string) => void,
    private readonly onSalvageMany: (itemIds: string[]) => void,
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

  setMaterials(m: Record<Material, number>): void {
    this.materials = m;
    if (this.isOpen) this.render();
  }

  setItems(items: ItemInstance[]): void {
    this.items = items;
    if (this.isOpen) this.render();
  }

  setRecipes(known: string[]): void {
    this.recipes = known;
    if (this.isOpen) this.render();
  }

  /** Opening the bench lands on the shelf for what you are holding. */
  setEquippedWeapon(_type: unknown): void {
    // Kept for the caller's sake; the shelf now defaults to weapons anyway.
  }

  // --- rendering ------------------------------------------------------------

  private render(): void {
    this.grid.innerHTML = "";
    this.renderTabs();
    this.renderWallet();
    if (this.tab === "forge") this.renderForge();
    else if (this.tab === "reforge") this.renderReforge();
    else this.renderSalvage();
  }

  private renderTabs(): void {
    const row = document.createElement("div");
    row.className = "smith-tabs";
    const tabs: [Tab, string, string][] = [
      ["forge", "Forge", "forge"],
      ["reforge", "Reforge", "reforge"],
      ["salvage", "Salvage", "salvage"],
    ];
    for (const [id, label, icon] of tabs) {
      const b = document.createElement("button");
      b.className = "smith-tab";
      b.classList.toggle("active", this.tab === id);
      b.innerHTML = `${iconSvg(icon)}<span>${label}</span>`;
      b.addEventListener("click", () => {
        this.tab = id;
        this.render();
      });
      row.appendChild(b);
    }
    this.grid.appendChild(row);
  }

  /** The wallet, always visible: every verb here spends from it. */
  private renderWallet(): void {
    const row = document.createElement("div");
    row.className = "smith-wallet";
    for (const m of MATERIALS) {
      const cell = document.createElement("span");
      cell.className = "smith-mat";
      cell.innerHTML = `${iconSvg(m === "essence" ? "essence" : m)}${this.materials[m] ?? 0}`;
      cell.title = m;
      row.appendChild(cell);
    }
    this.grid.appendChild(row);
  }

  private costLine(cost: MaterialCost): HTMLElement {
    const el = document.createElement("div");
    el.className = "craft-row-cost";
    el.textContent = describeCost(cost);
    // Each shortfall is named rather than the whole line greying out, because
    // "you cannot afford this" is much less useful than "you need essence".
    const short = canAfford(cost, this.materials).missing;
    if (short.length) {
      el.classList.add("short");
      el.textContent += `  (need ${short.join(", ")})`;
    }
    return el;
  }

  private row(
    icon: string,
    name: string,
    colour: string,
    sub: HTMLElement,
    action: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const row = document.createElement("div");
    row.className = "craft-row";

    const glyph = document.createElement("span");
    glyph.className = "craft-row-icon";
    glyph.innerHTML = iconSvg(icon);
    glyph.style.color = colour;
    row.appendChild(glyph);

    const info = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "craft-row-name";
    nameEl.textContent = name;
    nameEl.style.color = colour;
    info.appendChild(nameEl);
    info.appendChild(sub);
    row.appendChild(info);

    const button = document.createElement("button");
    button.textContent = action;
    button.disabled = !enabled;
    button.addEventListener("click", onClick);
    row.appendChild(button);

    this.grid.appendChild(row);
  }

  // --- forge ----------------------------------------------------------------

  private renderForge(): void {
    this.section("consumables");
    this.renderConsumable(`Health Potion (+${POTION_HEAL_AMOUNT} HP)`, "#7ed957", POTION_CRAFT_COST, () => {
      if (this.stationId) this.onCraftPotion(this.stationId);
    });
    this.renderConsumable(`XP Tonic (+${TONIC_XP_AMOUNT} XP)`, "#ffd873", TONIC_CRAFT_COST, () => {
      if (this.stationId) this.onCraftTonic(this.stationId);
    });

    // One shelf at a time. Seventy-eight recipes in one column is a list
    // nobody reads to the bottom of.
    const shelves = document.createElement("div");
    shelves.className = "smith-shelves";
    for (const slot of ITEM_SLOTS) {
      const b = document.createElement("button");
      b.className = "smith-shelf";
      b.classList.toggle("active", this.slotFilter === slot);
      b.textContent = SLOT_LABEL[slot];
      b.addEventListener("click", () => {
        this.slotFilter = slot;
        this.render();
      });
      shelves.appendChild(b);
    }
    this.grid.appendChild(shelves);

    const known = new Set(this.recipes);
    const all = Object.values(ITEM_BASES)
      .filter((b) => b.slot === this.slotFilter)
      .sort((a, b) => a.band - b.band || a.name.localeCompare(b.name));
    const available = all.filter((b) => canForge(b, known).ok);
    const locked = all.filter((b) => !canForge(b, known).ok);

    this.section(`${SLOT_LABEL[this.slotFilter]} — ${available.length} of ${all.length} known`);
    for (const base of available) this.renderForgeRow(base, true);
    if (locked.length) {
      // Shown rather than hidden, because "salvage one to learn it" is the
      // single rule of this system and a player who never sees a locked row
      // never discovers it. The list is also the closest thing the game has to
      // a bestiary of its own items.
      this.section(`${locked.length} not yet learned — salvage one to learn it`);
      for (const base of locked) this.renderForgeRow(base, false);
    }
  }

  private renderForgeRow(base: ItemBase, unlocked: boolean): void {
    const cost = forgeCost(base);
    const sub = unlocked ? this.costLine(cost) : document.createElement("div");
    if (!unlocked) {
      sub.className = "craft-row-cost short";
      sub.textContent = `Unknown — salvage one to learn it (band ${base.band})`;
    }
    this.row(
      base.icon,
      base.name,
      unlocked ? "#dfe6e4" : "#6f6a62",
      sub,
      "Forge",
      unlocked && canAfford(cost, this.materials).ok && !!this.stationId,
      () => {
        if (this.stationId) this.onForge(this.stationId, base.id);
      },
    );
  }

  // --- reforge --------------------------------------------------------------

  private renderReforge(): void {
    const ladder = this.items.filter((i) => nextRarity(i.rarity) !== null);
    this.section("one step up the ladder");
    if (ladder.length === 0) {
      this.note("Nothing to reforge. Everything you own is already Enchanted, or you own nothing.");
      return;
    }
    for (const item of ladder) {
      const base = itemBase(item.baseId);
      const to = nextRarity(item.rarity)!;
      const cost = reforgeCost(base, item.rarity);
      if (!cost) continue;

      const sub = this.costLine(cost);

      // What it becomes, so the decision can be made without arithmetic. The
      // numbers are exact; the affixes are not previewable because reforging
      // re-rolls them, so this says how MANY there will be rather than
      // pretending to know which.
      const preview = reforgePreview(item);
      if (preview) {
        const gain = document.createElement("div");
        gain.className = "craft-row-step";
        const parts = [
          `${item.statValue} → ${preview.statValue}`,
          preview.affixCount !== preview.losingAffixes
            ? `${preview.losingAffixes} → ${preview.affixCount} affixes`
            : `${preview.affixCount} affix${preview.affixCount === 1 ? "" : "es"}, re-rolled`,
        ];
        gain.textContent = parts.join(" · ");
        sub.prepend(gain);
      }

      const step = document.createElement("div");
      step.className = "craft-row-step";
      step.innerHTML =
        `<span style="color:${rarityColor(item.rarity)}">${rarityName(item.rarity)}</span>` +
        ` → <span style="color:${rarityColor(to)}">${rarityName(to)}</span>`;
      sub.prepend(step);

      this.row(
        itemIcon(item),
        itemShortName(item) + (item.equipped ? " (worn)" : ""),
        rarityColor(item.rarity),
        sub,
        "Reforge",
        canAfford(cost, this.materials).ok && !!this.stationId,
        () => {
          if (this.stationId) this.onReforge(this.stationId, item.id);
        },
      );
    }
  }

  // --- salvage --------------------------------------------------------------

  private renderSalvage(): void {
    // Worn items are excluded: salvaging the thing you are holding is never
    // what anyone meant, and a confirmation dialogue for it would be a
    // dialogue nobody reads.
    const bag = this.items.filter((i) => !i.equipped);
    this.section("break down for materials");
    if (bag.length === 0) {
      this.note("Nothing spare in the bag. Equipped items cannot be salvaged.");
      return;
    }

    // One button for the bottom of the ladder. The bag holds thirty and loot is
    // frequent, so clearing out Broken and Worn one row at a time is a chore
    // the game invented for itself. Deliberately stops there: anything Honed or
    // better is a real item and deserves a deliberate click, and a "salvage
    // everything" button would eventually cost somebody an Enchanted.
    const junk = bag.filter((i) => i.rarity === "broken" || i.rarity === "worn");
    if (junk.length > 0) {
      const yielded: MaterialCost = {};
      for (const item of junk) {
        for (const [k, v] of Object.entries(salvageYield(item))) {
          yielded[k as Material] = (yielded[k as Material] ?? 0) + (v ?? 0);
        }
      }
      const sub = document.createElement("div");
      sub.className = "craft-row-cost";
      sub.textContent = `Returns ${describeCost(yielded)}`;
      this.row(
        "salvage",
        `Break down ${junk.length} Broken and Worn`,
        "#a09079",
        sub,
        "Salvage all",
        true,
        () => this.onSalvageMany(junk.map((i) => i.id)),
      );
    }
    for (const item of bag) {
      const yielded = salvageYield(item);
      const sub = document.createElement("div");
      sub.className = "craft-row-cost";
      sub.textContent = `Returns ${describeCost(yielded)}`;
      this.row(
        itemIcon(item),
        itemShortName(item),
        rarityColor(item.rarity),
        sub,
        "Salvage",
        true,
        () => this.onSalvage(item.id),
      );
    }
  }

  // --- shared bits ----------------------------------------------------------

  private section(title: string): void {
    const el = document.createElement("div");
    el.className = "craft-section-title";
    el.textContent = title;
    this.grid.appendChild(el);
  }

  private note(text: string): void {
    const el = document.createElement("div");
    el.className = "smith-note";
    el.textContent = text;
    this.grid.appendChild(el);
  }

  private renderConsumable(
    name: string,
    color: string,
    cost: ConsumableCost,
    onCraft: () => void,
  ): void {
    const affordable =
      this.materials.wood >= cost.wood &&
      this.materials.ore >= cost.ore &&
      this.materials.herb >= cost.herb;
    this.row(
      name.startsWith("Health") ? "potion" : "tonic",
      name,
      color,
      this.costLine(cost),
      "Craft",
      affordable && !!this.stationId,
      onCraft,
    );
  }
}
