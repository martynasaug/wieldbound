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
import { ITEM_BASES, CONSUMABLES } from "../../shared/items.ts";
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

section("2. a starter shop stocks starter things");
{
  // Oswyn is the first vendor a level 1 character meets and his whole pitch is
  // that buying is the expensive way to get band-1 gear. A higher band arriving
  // in this list would be unaffordable at the level it is offered and would
  // undercut the anvil at the level it is not.
  for (const e of SHOP_STOCK.filter((x) => x.kind === "item")) {
    const band = ITEM_BASES[e.ref]?.band ?? 1;
    check(`${e.id} is band 1`, band === 1, `band ${band} in the starter shop`);
  }
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
