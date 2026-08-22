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

import { RAW_MATERIALS, type ConsumableId, type MaterialCost } from "./items.ts";
import type { GatherableResource } from "./protocol-types.ts";

// --- And he takes things in, which he did not before ------------------------
//
// "The Provisioner only sells, never buys" has been on the list for a while,
// and the obvious reading of it is wrong: a vendor who BUYS ITEMS is a second
// salvage, and a worse one. Taking a thing apart at the anvil gives you its
// materials AND teaches you to make it, which is the best loop in the item
// system and the one nobody finds on their own — so a counter that turns an
// unwanted sword into materials without the lesson is a shortcut past the
// lesson. There is a whole quest about this.
//
// What he takes is RAW MATERIAL, and that is a different trade entirely,
// because the shortage it answers is real and measurable. Summed over all 115
// items in the catalogue, and against what one sweep of every node in the world
// yields:
//
//                supply share    demand share    ratio
//     wood           49.8%          35.1%         1.42
//     ore            38.3%          56.0%         0.68
//     herb           11.9%           8.9%         1.33
//
// Ore is the bottleneck by about a factor of two against wood, and every
// player ends up with a pile of wood and herb they cannot spend and a shortage
// of the one thing everything is made of. That is the trade Oswyn is for.
//
// THE RATE IS STEEP ON PURPOSE, and this is the decision worth keeping. At
// anything near par the exchange would DELETE the bottleneck — and the
// bottleneck is the reason to walk out to the far rings where the rock is,
// which is the same reason the whole world is laid out as difficulty radiating
// from spawn. Four to one is a safety valve, not a strategy: it turns "I am
// twelve ore short of finishing this" into a walk to the shop, and turns
// "I will fund my smithing by chopping wood" into obviously bad arithmetic.
//
// One rate in one direction and the same rate in every other, because a table
// of six rates weighted by scarcity is six numbers to keep true against a
// catalogue that moves, and it buys nothing: nobody trades toward the thing
// they already have too much of, so the rate only ever runs one way in practice.
export const EXCHANGE_RATE = 4;

/** How much you must hand over to get `want` of something else. */
export function exchangeCost(want: number): number {
  return want * EXCHANGE_RATE;
}

/**
 * A batch, rather than a slider.
 *
 * The dialogue box is a list of rows and every other thing in it is one press
 * for one outcome. Ten is small enough that a level-1 character can afford one
 * and large enough that somebody finishing a band-5 reforge is not pressing it
 * fifty times.
 */
export const EXCHANGE_BATCH = 10;

export interface ExchangeOffer {
  /** Stable id, which is what the message carries. */
  id: string;
  from: GatherableResource;
  to: GatherableResource;
  give: number;
  get: number;
}

/**
 * The three you can pick up off the ground.
 *
 * Derived out of `RAW_MATERIALS` by dropping essence, because essence is raw
 * and is NOT gathered — it only comes off kills, which is the one rule holding
 * the top of the reforge ladder together. Typing the three out here instead
 * would be a fourth place that has to be told when a gatherable is added.
 */
export const EXCHANGEABLE = RAW_MATERIALS.filter(
  (m): m is GatherableResource => m !== "essence",
);

/**
 * Every ordered pair of the three gatherables. DERIVED rather than typed, so a
 * fourth gatherable cannot arrive with two of its six trades missing — which is
 * exactly the kind of gap that reads as "the shop is broken for herb".
 */
export const EXCHANGE_OFFERS: ExchangeOffer[] = ((): ExchangeOffer[] => {
  const out: ExchangeOffer[] = [];
  for (const from of EXCHANGEABLE) {
    for (const to of EXCHANGEABLE) {
      if (from === to) continue;
      out.push({
        id: `${from}-${to}`,
        from,
        to,
        give: exchangeCost(EXCHANGE_BATCH),
        get: EXCHANGE_BATCH,
      });
    }
  }
  return out;
})();

export function exchangeById(id: string): ExchangeOffer | null {
  return EXCHANGE_OFFERS.find((e) => e.id === id) ?? null;
}

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
