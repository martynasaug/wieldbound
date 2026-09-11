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
 * WHAT OSWYN IS FOR: THE THINGS YOU CANNOT MAKE YET.
 *
 * This list used to be band-1 gear, and the note here said the point was that
 * "buying is the expensive way to get something, so a player who has worked out
 * the anvil never comes back here". That is a coherent design — a crutch you
 * outgrow — and it had no moment to be useful in, because there was nothing to
 * outgrow. Band 1 needs no recipe (`isBasicRecipe`), a new character arrives
 * with enough wood and ore to forge on their first visit, and the Herald points
 * them at the anvil in the same sentence that mentions the shop. Measured in
 * M70.245: every line was 2.3x to 3.5x the forge cost for the SAME base at the
 * SAME fixed quality — `FORGE_OUTPUT_RARITY` and `SHOP_OUTPUT_RARITY` are both
 * "honed" — and priced through his own 4:1 exchange, forging won all eighteen
 * comparisons of six items against three currencies. There was no mix of
 * materials in which buying was correct.
 *
 * So the stock is now BAND 2, which is the one thing the anvil genuinely cannot
 * do for you: band 2 and up needs a recipe, and a recipe is learned by
 * SALVAGING one. That closes a loop the game already had and never used —
 * Cabel's own advice is "salvage a thing to learn to make it" — and turns the
 * shop into the entry fee for a tier rather than a worse copy of the anvil:
 *
 *     buy one (dear)  ->  wear it  ->  later break it open to learn it
 *                                  ->  forge the rest cheaply
 *
 * Which makes the price a real decision instead of a tax, and gives salvage a
 * job at exactly the level a player first has something worth salvaging.
 *
 * THE MARKUP. Band-2 gear forges for 14 wood and 32 ore once known. These sit at
 * roughly 1.6x that, so learning the recipe pays for itself on the second one,
 * and the mix varies per line: the bow and the shield are wood-heavy, the stave
 * wants herb, the mail wants ore. Which material you have decides what you can
 * afford first, which is the only thing that makes three gathering resources a
 * choice rather than three chores.
 *
 * THE CONSUMABLES ARE PRICED IN ORE ON PURPOSE. The workbench makes a potion
 * for 2 wood and 8 herb, so a shop selling one for wood and herb was the same
 * dead trade the gear was. Oswyn's do not cost herb at all — that is the thing
 * you are buying. Out in the field with no herb and a bag of ore, his counter
 * is the answer, and at home it never is.
 */
export const SHOP_STOCK: ShopEntry[] = [
  {
    id: "potion",
    kind: "consumable",
    ref: "potion" satisfies ConsumableId,
    cost: { wood: 8, ore: 26 },
    pitch: "Bitter, but it closes a wound. No herb in the price — that is what you are buying.",
  },
  {
    id: "draught",
    kind: "consumable",
    ref: "draught" satisfies ConsumableId,
    cost: { wood: 34, ore: 22 },
    pitch: "For the ones who throw light about. Costs you no herb either.",
  },
  {
    id: "tonic",
    kind: "consumable",
    ref: "tonic" satisfies ConsumableId,
    cost: { wood: 30, ore: 20 },
    pitch: "You will remember the fight more clearly. Still no leaves.",
  },
  {
    id: "falchion",
    kind: "item",
    ref: "falchion",
    cost: { wood: 26, ore: 54 },
    pitch: "Heavier than the watch issue, and it keeps its edge. You cannot make one yet.",
  },
  {
    id: "recurve",
    kind: "item",
    ref: "recurve",
    cost: { wood: 52, ore: 26 },
    pitch: "Laminated, not carved. Half the price of it is the wood it took.",
  },
  {
    id: "oakenstave",
    kind: "item",
    ref: "oakenstave",
    cost: { wood: 44, herb: 30 },
    pitch: "Seasoned, banded, and steeped in something I am not naming. Herb, not ore.",
  },
  {
    id: "scalemail",
    kind: "item",
    ref: "scalemail",
    cost: { wood: 24, ore: 58 },
    pitch: "Every scale riveted by hand. That is where the ore goes.",
  },
  {
    id: "travelboots",
    kind: "item",
    ref: "travelboots",
    cost: { wood: 22, ore: 46 },
    pitch: "Nailed soles. You will feel the difference on the third ring out.",
  },
  {
    id: "roundshield",
    kind: "item",
    ref: "roundshield",
    cost: { wood: 46, ore: 22 },
    pitch: "Limewood with an iron boss. Takes a blow the plank would split under.",
  },
];

export function shopEntry(id: string): ShopEntry | null {
  return SHOP_STOCK.find((e) => e.id === id) ?? null;
}

/** What quality a bought item arrives at. */
export const SHOP_OUTPUT_RARITY = "honed" as const;
