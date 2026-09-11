// IS OSWYN'S GEAR EVER WORTH BUYING?
//
// The anvil makes every one of his six items — all band 1, so no recipe — for 4
// wood and 8 ore, and both routes hand back a HONED item: `FORGE_OUTPUT_RARITY`
// and `SHOP_OUTPUT_RARITY` are both fixed at "honed", so it is not even a
// gamble you might win. His prices are 2.3x to 3.5x higher by raw total.
//
// That looks like dead content, and the first version of this concluded exactly
// that. It is not the whole story: his prices are in DIFFERENT CURRENCIES. The
// Apprentice's Staff costs wood and HERB where forging it costs wood and ORE,
// and Oswyn also runs a 4:1 exchange. So for a player rich in one material and
// short another, buying can be the cheaper route even at a higher headline
// price.
//
// This prices both routes in a single currency to find out, using the exchange
// rate the game actually charges — the only honest common denominator there is.
//
// THE NICHE DOES NOT EXIST EITHER. Forging wins all EIGHTEEN comparisons: six
// items against three currencies. Even the Apprentice's Staff, the one item
// priced in herb rather than ore, costs 120 herb-equivalent to buy against 48
// to forge. There is no player state — no mix of materials held, no level, no
// recipe knowledge — in which buying his gear is correct.
//
// RECORDED RATHER THAN ACTED ON. What a shop is FOR is a design decision with
// several good answers (stock things the anvil cannot make; drop the gear and
// leave Oswyn his exchange, which IS a real service nothing else offers; price
// below the anvil and give up on crafting). The band-1 rule in
// `tools/test/shop.mjs` shows the price gap was deliberate, so the gap is not
// the bug — the missing compensation for it is. See PLAN M70.245.
import { SHOP_STOCK, SHOP_OUTPUT_RARITY, EXCHANGE_RATE } from "../../shared/shop.ts";
import { ITEM_BASES, forgeCost, isBasicRecipe, FORGE_OUTPUT_RARITY } from "../../shared/items.ts";

console.log(`forge output ${FORGE_OUTPUT_RARITY}, shop output ${SHOP_OUTPUT_RARITY}, exchange ${EXCHANGE_RATE}:1\n`);

/** What a basket costs if every material has to be bought with one of them. */
const inTermsOf = (cost, unit) => {
  let total = 0;
  for (const k of ["wood", "ore", "herb"]) {
    const n = cost[k] ?? 0;
    if (!n) continue;
    total += k === unit ? n : n * EXCHANGE_RATE;
  }
  return total;
};

console.log("item                 shop cost          forge cost        cheapest route, priced in each material");
for (const e of SHOP_STOCK) {
  if (e.kind !== "item") continue;
  const base = ITEM_BASES[e.ref];
  if (!base) continue;
  const fc = forgeCost(base);
  const show = (c) => ["wood", "ore", "herb"].filter((k) => c[k]).map((k) => `${c[k]}${k[0]}`).join("+");
  const verdicts = [];
  for (const unit of ["wood", "ore", "herb"]) {
    const shop = inTermsOf(e.cost, unit);
    const forge = inTermsOf(fc, unit);
    verdicts.push(`${unit}: ${shop < forge ? "SHOP" : "forge"} (${shop} vs ${forge})`);
  }
  console.log(
    `  ${base.name.padEnd(19)} ${show(e.cost).padEnd(18)} ${show(fc).padEnd(17)} ${verdicts.join("  ")}`,
  );
  if (!isBasicRecipe(base.id)) console.log("       (needs a recipe, so the anvil is not an option yet)");
}

console.log(
  "\nRead the three columns as: if the ONLY material you have is this one, which route is cheaper?",
);
