// BUY IT, LEARN IT, MAKE IT: THE LOOP M70.246 GAVE OSWYN.
//
// His shelf now holds band-2 gear, which the anvil refuses without a recipe,
// and a recipe is learned by SALVAGING one. That is supposed to turn his price
// from a tax into an entry fee:
//
//     forge it        -> refused, no recipe
//     buy one         -> dear
//     salvage it      -> the recipe is learned
//     forge it again  -> cheap, forever
//
// Four claims, none of which a price table can prove. This drives all four
// against the live server, because the failure modes are all silent: a shop
// that sells something already forgeable is back to being dead stock, and a
// salvage that teaches nothing leaves the price a pure loss.
//
//   node tools/soak/shoploop.mjs Loop1
import { open, login, approach } from "./driver.mjs";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";
import { SHOP_STOCK } from "../../shared/shop.ts";
import { ITEM_BASES, forgeCost } from "../../shared/items.ts";

const NAME = process.argv[2] ?? `Loop${Math.floor(Math.random() * 90000)}`;
const gear = SHOP_STOCK.find((e) => e.kind === "item");
const base = ITEM_BASES[gear.ref];
const cost = forgeCost(base);

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await page.waitForTimeout(1200);

// Enough of everything that the test is about RULES, not about gathering. The
// question here is whether the recipe gate works, and a bot spending twelve
// minutes at a rock answers nothing about that.
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.wallet.wood = 999;
  g.wallet.ore = 999;
  g.wallet.herb = 999;
});

const bench = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    for (const [id, s] of g.stationStates ?? []) {
      return { id, x: s.x, y: s.y, d: Math.hypot(s.x - g.playerX, s.y - g.playerY) };
    }
    return null;
  });

const info = () =>
  page.evaluate(() => [...document.querySelectorAll("#combat-log div")].slice(-1).map((e) => e.textContent)[0] ?? "");

console.log(`${NAME}: testing the loop on ${base.name} (band ${base.band}, forges for ${cost.wood} wood + ${cost.ore} ore)\n`);

// 1. THE ANVIL REFUSES IT. Asked from in range, repeatedly, the way the forge
//    harness does — the server decides range, and a refusal for the wrong
//    reason would read exactly like a refusal for the right one.
// "Not refused" and "never asked from close enough" are different answers and
// the first version of this printed the same line for both. `asked` records
// that the server actually took the question.
let at = null;
let refusal = "";
let asked = false;
let madeIt = false;
for (let i = 0; i < 140; i++) {
  at = await bench();
  if (!at) break;
  if (at.d <= INTERACTION_RANGE_PX * 1.5) {
    const before = await page.evaluate(() => window.__wieldbound.items.length);
    await page.evaluate(([sid, bid]) => window.__wieldbound.socket.sendForgeItem(sid, bid), [at.id, base.id]);
    await page.waitForTimeout(500);
    const line = await info();
    if ((await page.evaluate(() => window.__wieldbound.items.length)) > before) { madeIt = true; break; }
    if (/salvage one to learn/i.test(line)) { refusal = line; asked = true; break; }
    if (!/too far/i.test(line)) asked = true;
  }
  await approach(page, at, at.d > 200 ? 350 : 90);
}
console.log(
  `1. forging it unknown: ` +
    (madeIt
      ? "!! IT FORGED — the shop is selling what the anvil already gives"
      : refusal
        ? `refused — "${refusal}"`
        : asked
          ? "!! asked and got neither an item nor the recipe refusal"
          : "INCONCLUSIVE — never got in range to ask"),
);

// 2. BUYING IT WORKS.
const npc = await page.evaluate(() => {
  const g = window.__wieldbound;
  for (const [id, n] of g.npcs) if (n.def?.role === "vendor") return { id, x: n.x, y: n.y };
  return null;
});
let bought = false;
if (npc) {
  for (let i = 0; i < 140; i++) {
    const to = await page.evaluate((n) => {
      const g = window.__wieldbound;
      return { x: n.x, y: n.y, d: Math.hypot(n.x - g.playerX, n.y - g.playerY) };
    }, npc);
    if (to.d <= 120) {
      const before = await page.evaluate(() => window.__wieldbound.items.length);
      await page.evaluate(
        ([id, sid]) => window.__wieldbound.socket.sendBuyFromVendor(id, sid),
        [npc.id, gear.id],
      );
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => window.__wieldbound.items.length);
      if (after > before) { bought = true; break; }
    }
    await approach(page, to, to.d > 200 ? 350 : 90);
  }
}
console.log(
  `2. buying it: ` +
    (bought
      ? "bought"
      : !npc
        ? "INCONCLUSIVE — no vendor NPC found"
        : `!! not bought; last line was "${await info()}"`),
);

// 3 and 4 only mean anything if 2 worked.
if (bought) {
  const owned = await page.evaluate((bid) => {
    const g = window.__wieldbound;
    const it = g.items.find((i) => i.baseId === bid);
    return it ? it.id : null;
  }, base.id);
  await page.evaluate((iid) => window.__wieldbound.socket.sendSalvageItem(iid), owned);
  await page.waitForTimeout(1000);
  const learned = await page.evaluate((bid) => (window.__wieldbound.recipes ?? []).includes(bid), base.id);
  console.log(`3. salvaging it: ${learned ? "the recipe is learned" : "!! taught nothing, so the price bought one item and no future"}`);

  if (learned) {
    let forged = false;
    for (let i = 0; i < 140; i++) {
      at = await bench();
      if (!at) break;
      if (at.d <= INTERACTION_RANGE_PX * 1.5) {
        const before = await page.evaluate(() => window.__wieldbound.items.length);
        await page.evaluate(([sid, bid]) => window.__wieldbound.socket.sendForgeItem(sid, bid), [at.id, base.id]);
        await page.waitForTimeout(700);
        if ((await page.evaluate(() => window.__wieldbound.items.length)) > before) { forged = true; break; }
      }
      await approach(page, at, at.d > 200 ? 350 : 90);
    }
    console.log(`4. forging it known: ${forged ? `forged for ${cost.wood} wood + ${cost.ore} ore` : "!! still refused after learning it"}`);
  }
}
await browser.close();
