// THE ECONOMY, WHICH NOTHING CHECKED.
//
// `shared/shop.ts` is the one module with a table of prices in it and it had no
// test of any kind. The failures it can produce are all quiet ones:
//
//   * a stock entry whose `ref` no longer names anything. The catalogue moves —
//     bases get renamed and rebalanced — and a shop row pointing at a base that
//     is gone is a line in Oswyn's list that takes your materials and gives you
//     nothing, or refuses with no explanation. Nothing else in the codebase
//     joins those two tables.
//   * a trade that is worth doing in a circle. Six ordered pairs, one rate: if
//     the rate ever drops to 1, wood -> ore -> wood is free and the gathering
//     loop the whole early game rests on stops mattering.
//   * a starter shop that quietly stocks something no starter can afford or
//     use, which is what a band-5 base slipping into this list would be.
//
// Arithmetic over the shared tables, so no server and no browser.
//
//   node tools/test/shop.mjs
import { EXCHANGE_RATE, EXCHANGE_BATCH, EXCHANGE_OFFERS, EXCHANGEABLE, SHOP_STOCK, SHOP_OUTPUT_RARITY, exchangeById, exchangeCost, shopEntry } from "../../shared/shop.ts";
import { ITEM_BASES, CONSUMABLES, isBasicRecipe, forgeCost } from "../../shared/items.ts";
import { RARITIES } from "../../shared/protocol-types.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

section("1. every row points at something that exists");
{
  for (const e of SHOP_STOCK) {
    if (e.kind === "item") {
      check(`${e.id} names a real base`, !!ITEM_BASES[e.ref], `ref "${e.ref}" is not in the catalogue`);
    } else {
      check(`${e.id} names a real consumable`, !!CONSUMABLES[e.ref], `ref "${e.ref}" is not a consumable`);
    }
    check(`${e.id} costs something`, Object.values(e.cost).some((n) => n > 0), "a free item is not a shop");
    check(`${e.id} has a pitch`, typeof e.pitch === "string" && e.pitch.length > 0);
    check(`${e.id} is reachable by id`, shopEntry(e.id) === e);
  }
  const ids = SHOP_STOCK.map((e) => e.id);
  check("stock ids are unique", new Set(ids).size === ids.length, ids.join(","));
  check("the quality bought items arrive at is a real rarity", !!RARITIES[SHOP_OUTPUT_RARITY], SHOP_OUTPUT_RARITY);
  console.log(`  ${SHOP_STOCK.length} rows, all resolving, sold at "${SHOP_OUTPUT_RARITY}"`);
}

section("2. the shop sells what the anvil cannot");
{
  // THIS USED TO ASSERT BAND 1, and the reasoning was that buying should be the
  // expensive way to get starter gear. It held for two years of commits and
  // described dead content: band 1 needs no recipe, a new character can afford
  // to forge on their first visit, and both routes hand back the same fixed
  // "honed" quality — so every line was a strictly worse copy of the anvil.
  // M70.245 measured it across three currencies and forging won all eighteen
  // comparisons. A shop nobody should ever use is not a shop.
  //
  // The rule now is the one that gives him a job: he stocks the tier you cannot
  // make yet. Band 2 needs a recipe, a recipe comes from SALVAGING one, so the
  // price buys ACCESS and the second one is cheap. Each clause below is a
  // separate way that could quietly stop being true.
  for (const e of SHOP_STOCK.filter((x) => x.kind === "item")) {
    const base = ITEM_BASES[e.ref];
    if (!base) continue;
    check(`${e.id} is band 2`, base.band === 2, `band ${base.band} — band 1 is free at the anvil`);
    // The load-bearing one. If a line ever becomes forgeable without a recipe,
    // it is dead stock again and nothing else here would notice.
    check(
      `${e.id} cannot simply be forged`,
      !isBasicRecipe(base.id),
      "a basic recipe needs no shop",
    );
    // And it must stay dearer than making it, or learning the recipe is
    // pointless and salvage loses the job this change gave it.
    const fc = forgeCost(base);
    const total = (c) => (c.wood ?? 0) + (c.ore ?? 0) + (c.herb ?? 0);
    check(
      `${e.id} costs more than forging it`,
      total(e.cost) > total(fc),
      `${total(e.cost)} bought against ${total(fc)} forged`,
    );
  }
  console.log(
    `  ${SHOP_STOCK.filter((x) => x.kind === "item").length} gear rows, all band 2, all needing a recipe`,
  );
}

section("2b. his consumables are the herb-free route");
{
  // The same fault the gear had: the bench makes a potion for 2 wood and 8 herb,
  // so a shop charging wood and herb for one was a worse copy of the bench. What
  // he sells now is the ABSENCE of herb — out in the field with a bag of ore and
  // no leaves, his counter is the answer. That only works while his prices
  // genuinely contain no herb and the bench's genuinely do.
  for (const e of SHOP_STOCK.filter((x) => x.kind === "consumable")) {
    const def = CONSUMABLES[e.ref];
    if (!def) continue;
    check(`${e.id} costs no herb`, !e.cost.herb, `${e.cost.herb} herb is the thing you came here to avoid`);
    check(
      `${e.id} is otherwise craftable with herb`,
      (def.cost.herb ?? 0) > 0,
      "the bench does not want herb for it either, so buying saves nothing",
    );
  }
  console.log(`  ${SHOP_STOCK.filter((x) => x.kind === "consumable").length} consumable rows, none priced in herb`);
}

section("3. trading cannot be done in a circle");
{
  check(`the rate is above 1`, EXCHANGE_RATE > 1, `${EXCHANGE_RATE} would make a round trip free`);
  check("giving costs more than getting", exchangeCost(EXCHANGE_BATCH) > EXCHANGE_BATCH,
    `${exchangeCost(EXCHANGE_BATCH)} for ${EXCHANGE_BATCH}`);
  // The real statement: go out and come back, and you must be poorer. Anything
  // else is a printing press.
  const out = EXCHANGE_BATCH;
  const paid = exchangeCost(out);
  const backPaid = exchangeCost(out);
  check(
    "a round trip loses material",
    backPaid > out,
    `paying ${paid} to get ${out}, then ${backPaid} to get ${out} back`,
  );
  console.log(`  ${EXCHANGE_RATE}:1 — ${paid} buys ${out}, and buying back costs ${backPaid}`);
}

section("4. every pair of gatherables can be traded, both ways");
{
  const expected = EXCHANGEABLE.length * (EXCHANGEABLE.length - 1);
  check(`there are ${expected} offers`, EXCHANGE_OFFERS.length === expected, String(EXCHANGE_OFFERS.length));
  for (const from of EXCHANGEABLE) {
    for (const to of EXCHANGEABLE) {
      if (from === to) continue;
      const offer = EXCHANGE_OFFERS.find((o) => o.from === from && o.to === to);
      check(`${from} -> ${to} exists`, !!offer);
      if (offer) {
        check(`${from} -> ${to} is reachable by id`, exchangeById(offer.id) === offer, offer.id);
        check(`${from} -> ${to} charges the rate`, offer.give === offer.get * EXCHANGE_RATE,
          `give ${offer.give} get ${offer.get}`);
      }
    }
  }
  // Essence is the one raw material that is NOT gathered — it only comes off
  // kills, and that is what holds the top of the reforge ladder together. If it
  // ever became tradeable the ladder could be bought.
  check("essence cannot be traded for", !EXCHANGE_OFFERS.some((o) => o.to === "essence" || o.from === "essence"),
    EXCHANGE_OFFERS.map((o) => o.id).join(","));
  const ids = EXCHANGE_OFFERS.map((o) => o.id);
  check("offer ids are unique", new Set(ids).size === ids.length);
  console.log(`  ${EXCHANGE_OFFERS.length} offers across ${EXCHANGEABLE.join(", ")}`);
}

console.log(failures === 0 ? "\nOK — the shop sells real things at a real price" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
