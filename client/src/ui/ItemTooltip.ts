import { SECONDARY_STAT_LABEL, type ItemInstance, type ItemRarity } from "../../../shared/protocol-types";

const RARITY_HEX: Record<ItemRarity, string> = { common: "#9e9e9e", rare: "#42a5f5", epic: "#ab47bc" };
// Labels for the primary roll. Helm reads as a lesser chest piece and cape
// as a lesser pair of boots, which is what the numbers actually do — see
// gearArmor/gearEvasion in shared.
const SLOT_STAT_LABEL: Record<ItemInstance["slot"], string> = {
  weapon: "Bonus damage",
  armor: "Damage reduction",
  helm: "Damage reduction",
  cape: "Evasion",
  boots: "Evasion",
  ring: "Bonus damage",
};
const SECONDARY_STAT_SUFFIX: Record<ItemInstance["slot"], string> = {
  weapon: "%",
  armor: "%",
  helm: "%",
  cape: " px/s",
  boots: " px/s",
  ring: "%",
};

const el = document.getElementById("item-tooltip")!;

function attachTooltip(target: HTMLElement, renderContent: () => void): void {
  target.addEventListener("mouseenter", () => {
    renderContent();
    el.style.display = "block";
  });
  target.addEventListener("mousemove", (e) => {
    el.style.left = `${e.clientX + 16}px`;
    el.style.top = `${e.clientY + 16}px`;
  });
  target.addEventListener("mouseleave", () => {
    el.style.display = "none";
  });
}

export function attachItemTooltip(target: HTMLElement, item: ItemInstance): void {
  attachTooltip(target, () => {
    el.innerHTML = "";

    const title = document.createElement("div");
    title.className = "tt-title";
    title.textContent = `${item.rarity} ${item.slot}`;
    title.style.color = RARITY_HEX[item.rarity];
    el.appendChild(title);

    const statLine = document.createElement("div");
    statLine.className = "tt-line";
    statLine.textContent = `${SLOT_STAT_LABEL[item.slot]}: +${item.statValue}`;
    el.appendChild(statLine);

    if (item.bonusStatValue > 0) {
      const bonusLine = document.createElement("div");
      bonusLine.className = "tt-line";
      bonusLine.textContent = `${SECONDARY_STAT_LABEL[item.slot]}: +${item.bonusStatValue}${SECONDARY_STAT_SUFFIX[item.slot]}`;
      el.appendChild(bonusLine);
    }

    if (item.equipped) {
      const equippedLine = document.createElement("div");
      equippedLine.className = "tt-line";
      equippedLine.style.color = "#66bb6a";
      equippedLine.textContent = "Equipped";
      el.appendChild(equippedLine);
    }
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
