// Oswyn's stock.
//
// The game has no currency and is not getting one — the Provisioner says why
// out loud in his own dialogue, and it is a real design position rather than a
// joke: materials are already the thing every system in this game is priced in,
// and adding coin would mean every price in the smithy suddenly has a second,
// competing denomination beside it.
//
// So the shop is a second way to SPEND wood, ore and herb, and it answers a
// question the forge cannot. The forge needs a recipe, and a recipe comes from
// salvaging one of the thing — which is a fine loop and a terrible first ten
// minutes, because a brand-new character knows the twenty-one band-1 recipes
// and nothing else, and the ones they know need materials they have not
// gathered yet. Oswyn sells a handful of those same band-1 things at a markup.
// He is the floor under a bad start, not a shortcut past the smithy: everything
// he stocks, you could have made.
//
// Deliberately nothing past band 2. A vendor with good items in him is a vendor
// who replaces the world.

import type { ConsumableId, MaterialCost } from "./items.ts";

export interface ShopEntry {
  /** Stable id, which is what the buy message carries. */
  id: string;
  kind: "consumable" | "item";
  /** A consumable id, or a base item id from the catalogue. */
  ref: string;
  cost: MaterialCost;
  /** One line, in his voice, under the name. */
  pitch: string;
}

/**
 * The markup.
 *
 * A band-1 weapon forges for about 4 wood and 9 ore. Oswyn wants roughly three
 * times that, which is a real cost at level 1 — twelve gathers or so — without
 * being a wall. The point is that buying is the expensive way to get something,
 * so a player who has worked out the anvil never comes back here.
 */
export const SHOP_STOCK: ShopEntry[] = [
  {
    id: "potion",
    kind: "consumable",
    ref: "potion" satisfies ConsumableId,
    cost: { wood: 4, herb: 14 },
    pitch: "Bitter, but it closes a wound.",
  },
  {
    id: "draught",
    kind: "consumable",
    ref: "draught" satisfies ConsumableId,
    cost: { ore: 10, herb: 22 },
    pitch: "For the ones who throw light about.",
  },
  {
    id: "tonic",
    kind: "consumable",
    ref: "tonic" satisfies ConsumableId,
    cost: { ore: 8, herb: 20 },
    pitch: "You will remember the fight more clearly.",
  },
  {
    id: "recruitblade",
    kind: "item",
    ref: "recruitblade",
    cost: { wood: 14, ore: 28 },
    pitch: "Every guard in the watch started on one of these.",
  },
  {
    id: "hunterbow",
    kind: "item",
    ref: "hunterbow",
    cost: { wood: 30, ore: 12 },
    pitch: "Draws light. Kills at a distance, which is the point.",
  },
  {
    id: "apprenticestaff",
    kind: "item",
    ref: "apprenticestaff",
    cost: { wood: 26, herb: 16 },
    pitch: "Cut from a lightning-struck ash, or so I am told.",
  },
  {
    id: "leatherjerkin",
    kind: "item",
    ref: "leatherjerkin",
    cost: { wood: 12, ore: 24 },
    pitch: "It will not stop a troll. It will stop a slime.",
  },
  {
    id: "leatherboots",
    kind: "item",
    ref: "leatherboots",
    cost: { wood: 10, ore: 18 },
    pitch: "Walk further, come back with more.",
  },
  {
    id: "plankshield",
    kind: "item",
    ref: "plankshield",
    cost: { wood: 22, ore: 8 },
    pitch: "Wood. Honest about it.",
  },
];

export function shopEntry(id: string): ShopEntry | null {
  return SHOP_STOCK.find((e) => e.id === id) ?? null;
}

/** What quality a bought item arrives at. */
export const SHOP_OUTPUT_RARITY = "honed" as const;
