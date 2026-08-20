import type { ItemInstance } from "../../../shared/protocol-types";
import { itemDetails } from "./items";

const el = document.getElementById("item-tooltip")!;

const CURSOR_GAP = 16;

/**
 * Places the tooltip beside the cursor, flipping to the other side when it
 * would otherwise run off screen.
 *
 * Worth doing rather than always offsetting down-right: the bag lives in a
 * right-anchored rail, so the items whose tooltips matter most are the ones
 * closest to the edge the tooltip would overflow.
 */
function place(x: number, y: number): void {
  // Measured after the content is written, or this reads the previous item's box.
  const width = el.offsetWidth;
  const height = el.offsetHeight;

  let left = x + CURSOR_GAP;
  if (left + width > window.innerWidth - 8) left = x - CURSOR_GAP - width;
  left = Math.max(8, left);

  let top = y + CURSOR_GAP;
  if (top + height > window.innerHeight - 8) top = y - CURSOR_GAP - height;
  top = Math.max(8, top);

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function attachTooltip(target: HTMLElement, renderContent: () => void): void {
  target.addEventListener("mouseenter", (e) => {
    renderContent();
    el.style.display = "block";
    // Position immediately: mouseenter fires before any mousemove, so without
    // this the tooltip appears for one frame wherever it was last shown.
    place(e.clientX, e.clientY);
  });
  target.addEventListener("mousemove", (e) => place(e.clientX, e.clientY));
  target.addEventListener("mouseleave", () => {
    el.style.display = "none";
  });
}

/**
 * The whole of an item, in the order a player reads one: what it is, what
 * quality it is in, what it does, what was rolled onto it, and last the line
 * that is only there to be enjoyed.
 *
 * All of it comes out of `itemDetails`, so the tooltip cannot describe an item
 * differently from the bag slot it is hovering over.
 */
export function attachItemTooltip(
  target: HTMLElement,
  item: ItemInstance,
  equipped: ItemInstance[] = [],
  /** How many of this kind share the cell. Everything else the tooltip says
   *  describes the best-rolled one, which is the one a click would equip. */
  count = 1,
): void {
  attachTooltip(target, () => {
    const d = itemDetails(item, equipped);
    el.innerHTML = "";

    const title = document.createElement("div");
    title.className = "tt-title";
    title.textContent = d.name;
    title.style.color = d.color;
    el.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "tt-sub";
    sub.textContent = `${d.quality} · ${d.kind}${d.twoHanded ? " · two-handed" : ""}`;
    sub.style.color = d.color;
    el.appendChild(sub);

    // What it deals. On its own line and in the school's own colour, because a
    // player comparing two swords is now comparing two DIFFERENT questions —
    // which hits harder, and which one the thing they are walking towards
    // minds. Only weapons have it; a helm dealing frost would be a number that
    // never applies.
    if (d.school) {
      const school = document.createElement("div");
      school.className = "tt-school";
      school.textContent = `Deals ${d.school.name.toLowerCase()} damage`;
      school.style.color = d.school.color;
      el.appendChild(school);
    }

    // Said before the numbers, because it changes what the numbers mean: they
    // are the best of the pile, not the only ones in it.
    if (count > 1) {
      const stack = document.createElement("div");
      stack.className = "tt-line";
      stack.style.color = "#e2b04f";
      stack.textContent = `${count} in the bag — the best is shown`;
      el.appendChild(stack);
    }

    for (const line of d.stats) {
      const row = document.createElement("div");
      row.className = "tt-line";
      row.textContent = `${line.label}: ${line.value}`;
      el.appendChild(row);
    }

    // Affixes are set apart rather than listed with the rolls: they are the
    // part of an item that is not true of every copy of it.
    //
    // An etched one says so, because it is the one fact about an affix that is
    // not visible in what it does: a reforge will re-roll the line above it and
    // leave this one standing. An invisible difference is exactly what the
    // original "indistinguishable from a rolled one" call was protecting
    // against, and saying it here is how that stays true.
    for (const affix of d.affixes) {
      const row = document.createElement("div");
      row.className = affix.etched ? "tt-affix etched" : "tt-affix";
      row.textContent = affix.etched
        ? `${affix.label} — ${affix.value} · etched, survives the fire`
        : `${affix.label} — ${affix.value}`;
      el.appendChild(row);
    }

    // How it SWINGS, which no number in the rolls above expresses. A claymore
    // and an arming sword can roll identical bonus damage and play nothing
    // alike, and this is the only place that says so.
    if (d.feel.length) {
      const row = document.createElement("div");
      row.className = "tt-feel";
      row.textContent = d.feel.join(" · ");
      el.appendChild(row);
    }

    // Against what is already worn. Per number rather than as one verdict:
    // "better" is not a fact when an item trades damage for speed.
    if (d.comparison) {
      const head = document.createElement("div");
      head.className = "tt-cmp-head";
      head.textContent = `Compared with ${d.comparison.againstName}`;
      el.appendChild(head);
      // Said before the deltas, because it outranks every one of them: two
      // swords with identical rolls are not the same weapon if one of them is
      // the thing the camp you are walking into folds to.
      if (d.comparison.schoolChange) {
        const swap = document.createElement("div");
        swap.className = "tt-cmp school";
        swap.textContent =
          `${d.comparison.schoolChange.from} → ${d.comparison.schoolChange.to} damage`;
        swap.style.color = d.comparison.schoolChange.color;
        el.appendChild(swap);
      }
      if (d.comparison.deltas.length === 0) {
        const same = document.createElement("div");
        same.className = "tt-cmp";
        // "The same numbers" was a lie the moment a weapon had a school: two
        // items can roll identically and still answer different creatures.
        same.textContent = d.comparison.schoolChange
          ? "the same numbers otherwise"
          : "the same numbers";
        el.appendChild(same);
      }
      for (const delta of d.comparison.deltas) {
        const row = document.createElement("div");
        row.className = `tt-cmp ${delta.delta > 0 ? "up" : "down"}`;
        const sign = delta.delta > 0 ? "+" : "";
        row.textContent = `${sign}${delta.delta}${delta.suffix} ${delta.label.toLowerCase()}`;
        el.appendChild(row);
      }
    }

    if (item.equipped) {
      const equippedLine = document.createElement("div");
      equippedLine.className = "tt-line";
      equippedLine.style.color = "#7ed957";
      equippedLine.textContent = "Equipped";
      el.appendChild(equippedLine);
    }

    // Where one comes from, above the flavour and in its own colour, because it
    // is the one line here that is an instruction rather than a description —
    // everything above says what the item IS, and this says where to get
    // another. A signature reads differently on purpose: "the troll's own" is a
    // reason to go somewhere.
    if (d.source) {
      const source = document.createElement("div");
      source.className = "tt-source";
      source.textContent = d.source;
      el.appendChild(source);
    }

    const flavour = document.createElement("div");
    flavour.className = "tt-flavour";
    flavour.textContent = d.flavour;
    el.appendChild(flavour);
  });
}

export function attachMaterialTooltip(target: HTMLElement, label: string, amount: number): void {
  attachTooltip(target, () => {
    el.innerHTML = "";

    const title = document.createElement("div");
    title.className = "tt-title";
    title.textContent = label;
    title.style.color = "#e2b04f";
    el.appendChild(title);

    const line = document.createElement("div");
    line.className = "tt-line";
    line.textContent = `Quantity: ${amount}`;
    el.appendChild(line);
  });
}
