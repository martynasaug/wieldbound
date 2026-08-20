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
//   ETCH     what do I want this to BE? A rune, drawn out of something you were
//            willing to destroy, cut over one of the affixes on something you
//            are keeping. The only way value moves between two items — every
//            other verb here turns one thing into materials or into a better
//            version of itself.
//
//   REFINE   what is this worth as STOCK? The fourth verb, and the only one
//            whose output is not something you wear. It is also the answer to
//            "what does the smithy do that is not about items": raw in, ingots
//            and wardweave out, for the far rings of the catalogue and the top
//            half of the ladder.
//
// Consumables stay where they were, at the top of Forge, because they are the
// one thing here that is still just a recipe. DRAW is not a tab either: it is
// the same gesture as salvage — destroy this — asked for a different output, so
// it sits directly under each salvage row where the trade is visible.

import {
  POTION_CRAFT_COST,
  POTION_HEAL_AMOUNT,
  TONIC_CRAFT_COST,
  TONIC_XP_AMOUNT,
  ITEM_SLOTS,
  PRIMARY_STAT_LABEL,
  SECONDARY_STAT_LABEL,
  SLOT_LABEL,
  type ItemInstance,
  type ItemSlot,
} from "../../../shared/protocol-types";
import {
  AFFIXES_BY_ID,
  ITEM_BASES,
  MATERIALS,
  MATERIAL_LABEL,
  affixSummary,
  canEtch,
  describeDropSources,
  drawableAffixes,
  etchCost,
  runeFitsWhat,
  canAfford,
  canChooseAffix,
  canForge,
  eligibleAffixes,
  describeCost,
  CONSUMABLES,
  CONSUMABLE_IDS,
  REFINE_IDS,
  REFINING,
  consumableSummary,
  forgeCost,
  forgePreview,
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

type Tab = "forge" | "refine" | "reforge" | "etch" | "salvage";

/** How many a batch button makes. Ten because refining is a bulk job and the
 *  wallet is measured in hundreds; the server pays for as many as it can and
 *  stops, so a button that asks for more than you can afford is not an error. */
const BATCH = 10;

interface ConsumableCost {
  wood: number;
  ore: number;
  herb: number;
}

export class CraftPanel {
  private overlay = document.getElementById("craft-overlay")!;
  private grid = document.getElementById("craft-grid")!;
  private closeButton = document.getElementById("craft-close")!;

  private materials: Record<Material, number> = Object.fromEntries(
    MATERIALS.map((m) => [m, 0]),
  ) as Record<Material, number>;
  private items: ItemInstance[] = [];
  /** Base ids this character has learned to forge. Band-1 recipes are known
   *  without being taught, so this is only what salvaging has added. */
  private recipes: string[] = [];
  /** Runes held, by affix id. Counters, like consumables. */
  private runes: Record<string, number> = {};
  private stationId: string | null = null;
  private tab: Tab = "forge";
  /** Which slot's shelf is open in Forge. Seventy-eight recipes in one
   *  column is a list nobody reads to the bottom of; one slot at a time is a
   *  shelf. */
  private slotFilter: ItemSlot = "weapon";
  /** Which rune the player has asked for, per item. Kept across re-renders so
   *  choosing one does not reset when the panel redraws on a materials update. */
  private readonly chosenAffix = new Map<string, string>();
  /** Which rune to cut, and which affix to cut it over, per item. Kept across
   *  re-renders for the same reason the reforge choice is: the panel redraws on
   *  every materials update, and losing a choice mid-decision is the kind of
   *  thing nobody reports and everybody notices. */
  private readonly chosenRune = new Map<string, string>();
  private readonly chosenOver = new Map<string, string>();
  /** Which affix to keep when drawing, per item. */
  private readonly chosenDraw = new Map<string, string>();

  constructor(
    private readonly onForge: (stationId: string, baseId: string) => void,
    private readonly onReforge: (stationId: string, itemId: string, affix?: string) => void,
    private readonly onSalvage: (itemId: string) => void,
    private readonly onSalvageMany: (itemIds: string[]) => void,
    private readonly onCraftConsumable: (stationId: string, id: string) => void,
    private readonly onRefine: (stationId: string, id: string, count: number) => void,
    private readonly onDraw: (stationId: string, itemId: string, affix: string) => void,
    private readonly onEtch: (
      stationId: string, itemId: string, affix: string, replacing: string,
    ) => void,
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

  setRunes(counts: Record<string, number>): void {
    this.runes = counts;
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
    else if (this.tab === "refine") this.renderRefine();
    else if (this.tab === "reforge") this.renderReforge();
    else if (this.tab === "etch") this.renderEtch();
    else this.renderSalvage();
  }

  private renderTabs(): void {
    const row = document.createElement("div");
    row.className = "smith-tabs";
    // Refine sits between Forge and Reforge because that is where it sits in
    // the loop: you refine to afford the far end of the first and the top half
    // of the second.
    const tabs: [Tab, string, string][] = [
      ["forge", "Forge", "forge"],
      ["refine", "Refine", "refine"],
      ["reforge", "Reforge", "reforge"],
      ["etch", "Etch", "etch"],
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
      // Named the way the cost line above it names them. `canAfford` returns
      // material IDS, and "need weave" beside "2 wardweave" reads as two
      // different things.
      el.textContent += `  (need ${short.map((m) => MATERIAL_LABEL[m].toLowerCase()).join(", ")})`;
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
    // From the same table the bag reads, so the two can never disagree about
    // what a Blue Draught costs or does.
    for (const id of CONSUMABLE_IDS) {
      const def = CONSUMABLES[id];
      const sub = this.costLine(def.cost);
      const what = document.createElement("div");
      what.className = "craft-row-step";
      what.textContent = consumableSummary(def);
      sub.prepend(what);
      this.row(
        def.icon,
        def.name,
        "#cbbb95",
        sub,
        "Craft",
        canAfford(def.cost, this.materials).ok && !!this.stationId,
        () => {
          if (this.stationId) this.onCraftConsumable(this.stationId, def.id);
        },
      );
    }

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
      sub.textContent = "Unknown — salvage one to learn it";
    } else {
      // What it makes, in the same shape the reforge rows use. The forge always
      // outputs Honed, so this is exactly the base's authored numbers — which
      // is the whole reason the catalogue is authored at Honed.
      const made = forgePreview(base);
      const line = document.createElement("div");
      line.className = "craft-row-step";
      line.textContent =
        `${PRIMARY_STAT_LABEL[base.slot]} ${made.statValue}` +
        ` · ${SECONDARY_STAT_LABEL[base.slot]} ${made.bonusStatValue}` +
        (base.twoHanded ? " · two-handed" : "");
      sub.prepend(line);
    }

    // WHERE TO FIND ONE. The locked rows are what make this list the closest
    // thing the game has to a catalogue of its own items, and until now they
    // said only that the player had never seen one — which is a rule, not a
    // lead. A locked row that names the creature carrying it turns the list
    // into somewhere to go, and it is the only place a boss's signature was
    // ever visible before the boss dropped it.
    const source = describeDropSources(base.id);
    if (source) {
      const where = document.createElement("div");
      where.className = "craft-row-where";
      where.textContent = source;
      sub.appendChild(where);
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

  // --- refine ---------------------------------------------------------------

  private renderRefine(): void {
    this.section("raw into stock");
    this.note(
      "Ingots and wardweave are made here and found nowhere. The far rings of " +
        "the catalogue want them, and so does the top half of the ladder. " +
        "Salvage never gives them back.",
    );

    for (const id of REFINE_IDS) {
      const def = REFINING[id];
      const sub = this.costLine(def.cost);

      // How many the wallet would actually stretch to, said before the cost
      // rather than discovered by clicking. The bench knows the answer and the
      // player would otherwise be doing four divisions in their head.
      const affordable = Math.min(
        ...MATERIALS.filter((m) => (def.cost[m] ?? 0) > 0).map((m) =>
          Math.floor((this.materials[m] ?? 0) / (def.cost[m] ?? 1)),
        ),
      );
      const held = document.createElement("div");
      held.className = "craft-row-step";
      held.textContent =
        `You hold ${this.materials[id] ?? 0} · ` +
        (affordable > 0 ? `enough raw for ${affordable}` : "not enough raw for one");
      sub.prepend(held);

      const blurb = document.createElement("div");
      blurb.className = "craft-row-step";
      blurb.textContent = def.blurb;
      sub.prepend(blurb);

      this.row(
        def.icon,
        def.name,
        "#cbbb95",
        sub,
        "Refine",
        affordable > 0 && !!this.stationId,
        () => {
          if (this.stationId) this.onRefine(this.stationId, def.id, 1);
        },
      );

      // A second button for a batch, because a hundred ore is three ingots and
      // nobody wants to click three times — and the server stops when the
      // wallet does, so asking for ten and getting four is a normal outcome
      // rather than a failed request.
      if (affordable > 1) {
        const many = Math.min(BATCH, affordable);
        const bulk = document.createElement("div");
        bulk.className = "craft-row-cost";
        bulk.textContent = `All at once: ${describeCost(
          Object.fromEntries(
            Object.entries(def.cost).map(([k, v]) => [k, (v ?? 0) * many]),
          ) as MaterialCost,
        )}`;
        this.row(
          def.icon,
          `${many} × ${def.name}`,
          "#a09079",
          bulk,
          `Refine ${many}`,
          !!this.stationId,
          () => {
            if (this.stationId) this.onRefine(this.stationId, def.id, many);
          },
        );
      }
    }
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

      // At the top two steps the player names one of the affixes, which is
      // what makes "Runed" mean somebody cut the marks in deliberately rather
      // than "the dice came up violet". Below that a reforge is still a
      // re-roll, so the climb turns from a gamble into a decision — a better
      // shape than either being true the whole way up.
      let chosen = this.chosenAffix.get(item.id);
      if (canChooseAffix(to)) {
        const options = eligibleAffixes(base);
        const picker = document.createElement("select");
        picker.className = "smith-rune";
        const none = document.createElement("option");
        none.value = "";
        none.textContent = "cut no rune — roll them all";
        picker.appendChild(none);
        for (const affix of options) {
          const opt = document.createElement("option");
          opt.value = affix.id;
          opt.textContent = `${affix.label} — ${affixSummary(affix, base.band)}`;
          if (affix.id === chosen) opt.selected = true;
          picker.appendChild(opt);
        }
        picker.addEventListener("change", () => {
          if (picker.value) this.chosenAffix.set(item.id, picker.value);
          else this.chosenAffix.delete(item.id);
          chosen = picker.value || undefined;
        });
        sub.appendChild(picker);
      }

      this.row(
        itemIcon(item),
        itemShortName(item) + (item.equipped ? " (worn)" : ""),
        rarityColor(item.rarity),
        sub,
        "Reforge",
        canAfford(cost, this.materials).ok && !!this.stationId,
        () => {
          if (this.stationId) {
            this.onReforge(this.stationId, item.id, this.chosenAffix.get(item.id));
          }
        },
      );
    }
  }

  // --- etch -----------------------------------------------------------------

  private renderEtch(): void {
    const held = Object.entries(this.runes).filter(([, n]) => n > 0);
    this.section("runes");
    if (held.length === 0) {
      this.note(
        "No runes. Draw one out of something in the Salvage tab: you keep one of " +
          "its affixes and lose everything else it was worth.",
      );
    } else {
      const stock = document.createElement("div");
      stock.className = "rune-stock";
      for (const [affixId, count] of held) {
        const affix = AFFIXES_BY_ID[affixId];
        if (!affix) continue;
        const chip = document.createElement("span");
        chip.className = "rune-chip";
        chip.innerHTML = `${iconSvg("etch")}${affix.label}<b>${count}</b>`;
        // The magnitude is not on the chip on purpose: an affix is worth what
        // the band of the item it lands on says it is, so a number here would
        // be a number for no particular item.
        chip.title = `${affix.label} — fits ${runeFitsWhat(affix)}, and is worth more the higher the band it lands on`;
        stock.appendChild(chip);
      }
      this.grid.appendChild(stock);
    }

    // Said once, up front, because it is the one ordering mistake this system
    // makes possible and it costs a rune. Reforging has always re-rolled
    // affixes; that rule did not change, but until now nothing the player owned
    // was worth losing to it.
    this.note("Reforging re-rolls every affix, etched or not. Take an item up the ladder first, then cut its runes.");

    this.section("cut a rune into something");
    const targets = this.items.filter((i) => (i.affixes?.length ?? 0) > 0);
    if (targets.length === 0) {
      this.note(
        "Nothing you own carries an affix to replace. Etching never ADDS one — " +
          "quality decides how many an item has, so reforge something up first.",
      );
      return;
    }

    for (const item of targets) {
      const base = itemBase(item.baseId);
      const cost = etchCost(item);
      const sub = this.costLine(cost);

      // Which runes could go on THIS item: held, eligible, and not already on
      // it. That triple is exactly `canEtch`, so the list a player reads and
      // the rule the server enforces cannot drift.
      const usable = held
        .map(([affixId]) => AFFIXES_BY_ID[affixId])
        .filter((a) => a && canEtch(item, a.id).ok);

      const carried = (item.affixes ?? []).map((a) => AFFIXES_BY_ID[a]).filter(Boolean);
      const has = document.createElement("div");
      has.className = "craft-row-step";
      has.textContent = `Carries ${carried.map((a) => a.label).join(", ")}`;
      sub.prepend(has);

      if (usable.length === 0) {
        // What WOULD fit, which is the only place in the game that says what an
        // item's affix pool even is. A player holding the wrong runes learns
        // what to go looking for instead of being told "no".
        const pool = eligibleAffixes(base)
          .filter((a) => !(item.affixes ?? []).includes(a.id))
          .slice(0, 6)
          .map((a) => a.label);
        const none = document.createElement("div");
        none.className = "craft-row-cost short";
        none.textContent = pool.length
          ? `No rune you hold fits. It would take ${pool.join(", ")}…`
          : "No rune you hold fits.";
        sub.replaceChildren(has, none);
        this.row(itemIcon(item), itemShortName(item), rarityColor(item.rarity), sub, "Etch", false, () => {});
        continue;
      }

      const key = `${item.id}`;
      // `||` for the same reason the draw picker uses it: an empty select value
      // is a stale list, not a choice.
      const chosenRune = this.chosenRune.get(key) || usable[0].id;
      const chosenOver = this.chosenOver.get(key) || carried[0].id;

      const pickRune = document.createElement("select");
      pickRune.className = "smith-rune";
      for (const affix of usable) {
        const opt = document.createElement("option");
        opt.value = affix.id;
        opt.textContent = `cut ${affix.label} — ${affixSummary(affix, base.band)}`;
        if (affix.id === chosenRune) opt.selected = true;
        pickRune.appendChild(opt);
      }
      pickRune.addEventListener("change", () => this.chosenRune.set(key, pickRune.value));
      sub.appendChild(pickRune);

      const pickOver = document.createElement("select");
      pickOver.className = "smith-rune";
      for (const affix of carried) {
        const opt = document.createElement("option");
        opt.value = affix.id;
        opt.textContent = `over ${affix.label} — ${affixSummary(affix, base.band)}`;
        if (affix.id === chosenOver) opt.selected = true;
        pickOver.appendChild(opt);
      }
      pickOver.addEventListener("change", () => this.chosenOver.set(key, pickOver.value));
      sub.appendChild(pickOver);

      this.row(
        itemIcon(item),
        itemShortName(item) + (item.equipped ? " (worn)" : ""),
        rarityColor(item.rarity),
        sub,
        "Etch",
        canAfford(cost, this.materials).ok && !!this.stationId,
        () => {
          if (!this.stationId) return;
          this.onEtch(
            this.stationId,
            item.id,
            this.chosenRune.get(key) || usable[0].id,
            this.chosenOver.get(key) || carried[0].id,
          );
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

      // DRAW sits under the salvage row rather than in a tab of its own,
      // because it is the same gesture — destroy this — asked for a different
      // output, and the two belong side by side precisely so the trade is
      // visible: materials and the recipe, or one rune and nothing else.
      const runes = drawableAffixes(item);
      if (runes.length === 0) continue;
      const base = itemBase(item.baseId);
      const key = `draw:${item.id}`;
      // `||` and not `??`: a select whose value is the empty string is a real
      // state — it is what a stale option list leaves behind — and `??` treats
      // it as a choice, which sends the server an affix nothing carries and
      // gets a silent refusal.
      const chosen = this.chosenDraw.get(key) || runes[0].id;

      const drawSub = document.createElement("div");
      drawSub.className = "craft-row-cost";
      drawSub.textContent = "No materials, and it teaches you nothing.";
      if (runes.length > 1) {
        const picker = document.createElement("select");
        picker.className = "smith-rune";
        for (const affix of runes) {
          const opt = document.createElement("option");
          opt.value = affix.id;
          // What it fits, beside what it does — drawing is irreversible and a
          // rune that goes nowhere you own is the one way this verb wastes an
          // item outright.
          opt.textContent = `keep ${affix.label} — ${affixSummary(affix, base.band)} · fits ${runeFitsWhat(affix)}`;
          if (affix.id === chosen) opt.selected = true;
          picker.appendChild(opt);
        }
        picker.addEventListener("change", () => this.chosenDraw.set(key, picker.value));
        drawSub.appendChild(picker);
      } else {
        const only = document.createElement("div");
        only.className = "craft-row-step";
        only.textContent =
          `Keeps ${runes[0].label} — ${affixSummary(runes[0], base.band)}` +
          ` · fits ${runeFitsWhat(runes[0])}`;
        drawSub.prepend(only);
      }
      this.row(
        "etch",
        `Draw a rune from ${itemShortName(item)}`,
        "#c0a6ff",
        drawSub,
        "Draw",
        !!this.stationId,
        () => {
          if (this.stationId) {
            this.onDraw(this.stationId, item.id, this.chosenDraw.get(key) || runes[0].id);
          }
        },
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
