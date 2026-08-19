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
export function attachItemTooltip(target: HTMLElement, item: ItemInstance): void {
  attachTooltip(target, () => {
    const d = itemDetails(item);
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

    for (const line of d.stats) {
      const row = document.createElement("div");
      row.className = "tt-line";
      row.textContent = `${line.label}: ${line.value}`;
      el.appendChild(row);
    }

    // Affixes are set apart rather than listed with the rolls: they are the
    // part of an item that is not true of every copy of it.
    for (const affix of d.affixes) {
      const row = document.createElement("div");
      row.className = "tt-affix";
      row.textContent = `${affix.label} — ${affix.value}`;
      el.appendChild(row);
    }

    if (item.equipped) {
      const equippedLine = document.createElement("div");
      equippedLine.className = "tt-line";
      equippedLine.style.color = "#7ed957";
      equippedLine.textContent = "Equipped";
      el.appendChild(equippedLine);
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
