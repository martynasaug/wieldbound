// How an item is presented, in one place.
//
// The rarity palette existed FOUR times before the catalogue arrived — the bag,
// the character window, the workbench and the tooltip each carried their own
// `{ common: "#9e9e9e", rare: ... }`, and the 3D gear tinting carried a fifth
// as hex numbers. That is the same failure mode as helm and cape rolling stats
// nothing read: a value duplicated per call site is a value that drifts, and
// nobody notices until two panels disagree about what colour Runed is.
//
// So there is one source now, and it is `RARITIES` in shared — the same table
// the server rolls from. Everything below is a thin read of it plus the
// formatting each surface needs.

import {
  PRIMARY_STAT_LABEL,
  RARITIES,
  SECONDARY_STAT_LABEL,
  SLOT_LABEL,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
} from "../../../shared/protocol-types";
import {
  AFFIXES_BY_ID,
  affixSummary,
  feelNotes,
  itemBase,
  itemName,
  itemScore,
  itemShortName,
} from "../../../shared/items";
import { iconSvg } from "./icons";

export function rarityColor(rarity: ItemRarity): string {
  return RARITIES[rarity]?.color ?? RARITIES.honed.color;
}

export function rarityName(rarity: ItemRarity): string {
  return RARITIES[rarity]?.name ?? "";
}

/** Whether this quality gets the extra lift — a glow everything has says nothing. */
export function rarityGlows(rarity: ItemRarity): boolean {
  return !!RARITIES[rarity]?.glow;
}

/** The icon key for an item, from its base. */
export function itemIcon(item: Pick<ItemInstance, "baseId">): string {
  return itemBase(item.baseId).icon;
}

export function itemIconSvg(item: Pick<ItemInstance, "baseId">, className = "icon"): string {
  return iconSvg(itemIcon(item), className);
}

/** Units for the secondary roll, which is a percentage on most slots and a
 *  speed on the two that carry you. */
const SECONDARY_SUFFIX: Record<ItemSlot, string> = {
  weapon: "%",
  offhand: "%",
  armor: "%",
  helm: "%",
  cape: " px/s",
  boots: " px/s",
  ring: "%",
};

export { itemName, itemShortName };

export interface ItemLine {
  label: string;
  value: string;
}

/** The two rolled numbers, labelled by what they actually do. */
export function itemStatLines(item: ItemInstance): ItemLine[] {
  const lines: ItemLine[] = [];
  if (item.statValue > 0) {
    lines.push({ label: PRIMARY_STAT_LABEL[item.slot], value: `+${item.statValue}` });
  }
  if (item.bonusStatValue > 0) {
    lines.push({
      label: SECONDARY_STAT_LABEL[item.slot],
      value: `+${item.bonusStatValue}${SECONDARY_SUFFIX[item.slot]}`,
    });
  }
  return lines;
}

/** One line per affix, reading as what it gives rather than as its name. */
export function itemAffixLines(item: ItemInstance): ItemLine[] {
  const base = itemBase(item.baseId);
  return (item.affixes ?? [])
    .map((id) => AFFIXES_BY_ID[id])
    .filter(Boolean)
    .map((affix) => ({ label: affix.label, value: affixSummary(affix, base.band) }));
}

/**
 * How this item compares with what is already worn in its slot.
 *
 * The one question a bag is actually asked — "is this better than mine?" — and
 * until now the player answered it by opening two tooltips and doing the
 * subtraction themselves. Reported per number rather than as one verdict,
 * because "better" is not a fact: a claymore is more damage and less speed, and
 * which of those wins is the player's call.
 */
export interface ItemComparison {
  /** Positive means the hovered item is ahead. */
  deltas: { label: string; delta: number; suffix: string }[];
  /** Crude overall ordering, for the one-word summary. */
  scoreDelta: number;
  againstName: string;
}

export function compareToEquipped(
  item: ItemInstance,
  equipped: ItemInstance[],
): ItemComparison | null {
  const worn = equipped.find((i) => i.equipped && i.slot === item.slot);
  // Nothing to compare against, or it IS the thing being compared against.
  if (!worn || worn.id === item.id) return null;

  const deltas: ItemComparison["deltas"] = [];
  if (item.statValue !== worn.statValue) {
    deltas.push({
      label: PRIMARY_STAT_LABEL[item.slot],
      delta: item.statValue - worn.statValue,
      suffix: "",
    });
  }
  if (item.bonusStatValue !== worn.bonusStatValue) {
    deltas.push({
      label: SECONDARY_STAT_LABEL[item.slot],
      delta: item.bonusStatValue - worn.bonusStatValue,
      suffix: SECONDARY_SUFFIX[item.slot],
    });
  }
  return {
    deltas,
    scoreDelta: itemScore(item) - itemScore(worn),
    againstName: itemShortName(worn),
  };
}

/** Everything a tooltip needs, assembled once so every surface agrees. */
export function itemDetails(item: ItemInstance, equipped: ItemInstance[] = []): {
  name: string;
  color: string;
  quality: string;
  kind: string;
  band: number;
  flavour: string;
  stats: ItemLine[];
  affixes: ItemLine[];
  feel: string[];
  twoHanded: boolean;
  comparison: ItemComparison | null;
} {
  const base = itemBase(item.baseId);
  return {
    name: itemShortName(item),
    color: rarityColor(item.rarity),
    quality: rarityName(item.rarity),
    kind: item.weaponType
      ? `${item.weaponType[0].toUpperCase()}${item.weaponType.slice(1)}`
      : SLOT_LABEL[item.slot],
    band: base.band,
    flavour: base.flavour,
    stats: itemStatLines(item),
    affixes: itemAffixLines(item),
    // Read off the same multipliers combat resolves with, so a rebalance cannot
    // leave an item describing itself wrongly.
    feel: feelNotes(item),
    twoHanded: !!base.twoHanded,
    comparison: compareToEquipped(item, equipped),
  };
}

/** Slot icons, for empty paperdoll and bag slots. */
export const SLOT_ICON: Record<ItemSlot, string> = {
  weapon: "slot-weapon",
  offhand: "slot-offhand",
  helm: "slot-helm",
  armor: "slot-armor",
  cape: "slot-cape",
  boots: "slot-boots",
  ring: "slot-ring",
};

export { SLOT_LABEL };
