// DOES A TRAIT ACTUALLY FIRE.
//
//   node tools/soak/traitfire.mjs [Name]
//
// `tools/test/drops.mjs` proves every off-hand names a rule and that the rule
// names a real status. It cannot prove the rule is CONNECTED — the four trigger
// points are lines in the server, and a trait wired to a call site that never
// runs is indistinguishable, from every table and every screenshot, from one
// that works. That was the whole reason statuses got their own harness.
//
// The Round Shield is the one trait-carrying item the shop stocks, which makes
// it the only one reachable without farming: `bulwarking` says a blow landing
// on you sometimes braces you. So this buys it, wears it, walks into something
// and stands there, and watches the player's own status list for `shielded`.
import { open, login, approach, nearestMonster, hotbarKeys } from "./driver.mjs";
import { ITEM_BASES, traitOf } from "../../shared/items.ts";

const NAME = process.argv[2] ?? `Trait${Math.floor(Math.random() * 90000)}`;
const BASE = ITEM_BASES.roundshield;
const TRAIT = traitOf(BASE);
const WANT = TRAIT.onStruck.status;

console.log(
  `${NAME}: ${BASE.name} carries ${TRAIT.name} — ` +
  `"${TRAIT.blurb}" (${WANT}, ${Math.round(TRAIT.onStruck.chance * 100)}% of blows taken)\n`,
);

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(1400);

// Materials handed over rather than gathered: the question is whether a trait
// fires, and twelve minutes at a rock answers nothing about that.
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.wallet.wood = 999;
  g.wallet.ore = 999;
  g.wallet.herb = 999;
});

const npc = await page.evaluate(() => {
  const g = window.__wieldbound;
  for (const [id, n] of g.npcs) if (n.def?.role === "vendor") return { id, x: n.x, y: n.y };
  return null;
});
if (!npc) {
  console.log("INCONCLUSIVE — no vendor found");
  await browser.close();
  process.exit(0);
}

// A seeded character already wears one (`node tools/seed.mjs <name>` grants it),
// which is the fast path. Otherwise buy it, which is the only other way to hold
// a trait-carrying off-hand without farming for it.
let owned = await page.evaluate(
  (bid) => window.__wieldbound.items.find((i) => i.baseId === bid)?.id ?? null,
  BASE.id,
);
if (owned) console.log("0. already in the bag (seeded)");
for (let i = 0; i < 140 && !owned; i++) {
  const to = await page.evaluate((n) => {
    const g = window.__wieldbound;
    return { x: n.x, y: n.y, d: Math.hypot(n.x - g.playerX, n.y - g.playerY) };
  }, npc);
  if (to.d <= 120) {
    await page.evaluate(
      ([id]) => window.__wieldbound.socket.sendBuyFromVendor(id, "roundshield"),
      [npc.id],
    );
    await page.waitForTimeout(900);
    owned = await page.evaluate(
      (bid) => window.__wieldbound.items.find((i) => i.baseId === bid)?.id ?? null,
      BASE.id,
    );
  }
  if (!owned) await approach(page, to, to.d > 200 ? 350 : 90);
}
if (!owned) {
  const last = await page.evaluate(() =>
    [...document.querySelectorAll("#combat-log div")].slice(-3).map((e) => e.textContent).join(" | "));
  const purse = await page.evaluate(() => ({ ...window.__wieldbound.wallet }));
  console.log(`INCONCLUSIVE — could not buy the shield. purse ${JSON.stringify(purse)}; log: ${last}`);
  await browser.close();
  process.exit(0);
}
console.log(`1. bought and holding ${owned}`);

// `sendEquipItem` TOGGLES. The seeded character already wears the shield, and
// sending it unconditionally took it off — after which the harness measured a
// bare off-hand for fifty-six blows and reported the trait as unwired.
let worn = await page.evaluate(
  (bid) => !!window.__wieldbound.items.find((i) => i.baseId === bid && i.equipped),
  BASE.id,
);
if (!worn) {
  await page.evaluate((iid) => window.__wieldbound.socket.sendEquipItem(iid), owned);
  await page.waitForTimeout(900);
  worn = await page.evaluate(
    (bid) => !!window.__wieldbound.items.find((i) => i.baseId === bid && i.equipped),
    BASE.id,
  );
}
console.log(`2. equipped: ${worn ? "yes" : "!! NO — the rest proves nothing"}`);

// Walk into the nearest thing and stand in it. `onStruck` needs blows TAKEN, so
// this deliberately does not fight back beyond staying alive.
let seen = 0;
let blows = 0;
let hpWas = await page.evaluate(() => window.__wieldbound.hp);
for (let i = 0; i < 500 && seen === 0; i++) {
  const m = await nearestMonster(page);
  if (!m) { await approach(page, { x: 2600, y: 2600 }, 400); continue; }
  if (m.d > 70) { await approach(page, m, m.d > 250 ? 350 : 110); continue; }
  await page.waitForTimeout(220);
  const now = await page.evaluate((want) => {
    const g = window.__wieldbound;
    const mine = g.statusBar?.active ?? [];
    return {
      hp: g.hp,
      has: [...mine].some((s) => (s.id ?? s) === want),
      all: [...mine].map((s) => s.id ?? s),
    };
  }, WANT);
  if (now.hp < hpWas) blows++;
  hpWas = now.hp;
  if (now.has) {
    seen++;
    console.log(`3. ${WANT} appeared after ~${blows} blows taken — statuses: ${now.all.join(", ")}`);
  }
  // Do not die measuring this.
  if (now.hp < 25) {
    await approach(page, { x: 2600, y: 2600 }, 900);
    await page.waitForTimeout(2500);
    hpWas = await page.evaluate(() => window.__wieldbound.hp);
  }
}
if (!seen) {
  console.log(
    `3. ${WANT} NEVER appeared in ${blows} blows taken` +
    (blows < 15 ? " — but too few blows landed to call it" : " — the trigger is not wired"),
  );
}

// --- and the other direction: what YOUR blows leave on the thing you hit -----
//
// `onStruck` and `onHit` go through different call sites and sync differently —
// a monster's statuses ride out on its own snapshot, a player's have to be
// pushed — so proving one says nothing about the other. Thunderhead is the
// seeded weapon that carries an `onHit`, which makes this reachable too.
// Whatever in the bag happens to carry one, rather than a named item: the seed
// scales its kit to the character's level, so hard-coding Thunderhead meant the
// section quietly went inconclusive on any seed below band 5.
const bag = await page.evaluate(() =>
  window.__wieldbound.items.map((i) => ({ id: i.id, baseId: i.baseId, equipped: i.equipped })));
// onHit OR onCrit: both go through `fireStrikeTraits`, which is the thing
// under test, and which of the two a seeded bag happens to contain depends on
// the band it was scaled to.
const striker = bag.find((i) => {
  const t = traitOf(ITEM_BASES[i.baseId] ?? {});
  return t?.onHit || t?.onCrit;
});
const WEAPON = striker ? ITEM_BASES[striker.baseId] : null;
const WTRAIT = WEAPON ? traitOf(WEAPON) : null;
const held = striker?.id ?? null;
if (!held) {
  console.log(
    "4. INCONCLUSIVE — nothing in the bag carries a trait that marks what it hits." +
    " Seed a kit first: node tools/seed.mjs <name>",
  );
} else {
  const already = await page.evaluate(
    (bid) => !!window.__wieldbound.items.find((i) => i.baseId === bid && i.equipped),
    WEAPON.id,
  );
  if (!already) {
    await page.evaluate((iid) => window.__wieldbound.socket.sendEquipItem(iid), held);
    await page.waitForTimeout(900);
  }
  const want = (WTRAIT.onHit ?? WTRAIT.onCrit).status;
  console.log(
    `4. carrying ${WEAPON.name} — ${WTRAIT.name}, ${want} on ` +
    (WTRAIT.onHit
      ? `${Math.round(WTRAIT.onHit.chance * 100)}% of hits`
      : "every critical hit"),
  );
  const keys = await hotbarKeys(page);
  let landed = 0;
  let swings = 0;
  for (let i = 0; i < 400 && landed === 0; i++) {
    const m = await nearestMonster(page);
    if (!m) { await approach(page, { x: 2600, y: 2600 }, 400); continue; }
    if (m.d > 70) { await approach(page, m, m.d > 250 ? 350 : 110); continue; }
    if (keys[0]) { await page.keyboard.press(keys[0]); swings++; }
    await page.waitForTimeout(260);
    const on = await page.evaluate((w) => {
      const g = window.__wieldbound;
      const out = [];
      for (const [, v] of g.monsters) {
        if (v.state?.status !== "alive") continue;
        for (const st of v.state.statuses ?? []) out.push(st.id ?? st);
      }
      return { has: out.includes(w), all: [...new Set(out)] };
    }, want);
    if (on.has) {
      landed++;
      console.log(`5. ${want} is on a monster after ~${swings} swings — seen: ${on.all.join(", ")}`);
    }
  }
  if (!landed) {
    console.log(
      `5. ${want} never appeared on anything in ${swings} swings` +
      (swings < 20 ? " — too few swings to call it" : " — the onHit trigger is not wired"),
    );
  }
}

if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
