// CAN A RELIC ACTUALLY BE MADE?
//
// The chain is: kill the boss, take its trophy APART, and the trophy teaches a
// relic rather than teaching itself — then pay in essence, which cannot be
// gathered. Four tables point at each other to make that work (`MONSTER_LOOT`
// signature, `ItemBase.teaches`, `ItemBase.forge`, and the salvage path in
// db.ts), and `tools/test/relics.mjs` checks they agree on paper.
//
// Paper is not the same as the server doing it. What this drives:
//
//   1. the relic cannot be forged before the trophy is broken;
//   2. salvaging the trophy teaches the RELIC, not another trophy;
//   3. with the recipe and the essence, it forges.
//
// Materials are granted through `tools/seed.mjs` rather than by writing to
// `g.wallet`, which the server does not read — a probe that edited the client's
// copy and expected the server to believe it is how M70.246's first run failed.
//
//   node tools/seed.mjs <name> --level 20   (once, for the essence)
//   node tools/soak/relicloop.mjs <name>
import { DatabaseSync } from "node:sqlite";
import { open, login, approach } from "./driver.mjs";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";
import { ITEM_BASES, MONSTER_LOOT, forgeCost } from "../../shared/items.ts";

const NAME = process.argv[2] ?? "Relic1";

// Pick the chain off the tables, never a hand-written pair — the point is to
// follow the same pointers the game follows.
const chain = Object.entries(MONSTER_LOOT)
  .map(([kind, loot]) => ({ kind, sig: ITEM_BASES[loot.signature ?? ""] }))
  .filter((c) => c.sig?.teaches)
  .map((c) => ({ ...c, relic: ITEM_BASES[c.sig.teaches] }))[0];
if (!chain) { console.log("no boss signature teaches a relic"); process.exit(1); }
const cost = forgeCost(chain.relic);
console.log(`${chain.kind} drops ${chain.sig.name}, which teaches ${chain.relic.name}`);
console.log(`  ${chain.relic.name} costs ${JSON.stringify(cost)}\n`);

// Hand the character the trophy directly. Killing the boss is a different
// harness's job and a twenty-minute one; what is under test here is what
// happens to the trophy afterwards.
{
  const db = new DatabaseSync("server/data/wieldbound.db");
  const row = db.prepare("SELECT id FROM characters WHERE name = ?").get(NAME);
  if (!row) {
    console.log(`no character "${NAME}" — log in once, then run tools/seed.mjs ${NAME} --level 20`);
    process.exit(1);
  }
  db.prepare("DELETE FROM recipes WHERE characterId = ? AND baseId = ?").run(row.id, chain.relic.id);
  // And enough of everything to pay for it. `seed.mjs` is generous but not
  // relic-generous — the first run of this reached the bench and was told
  // "needs 200 wood, 80 ore, 90 herb, 30 essence, 8 wardweave", which is the
  // cost override working and the character simply being poor. What is under
  // test is the gate and the price, not the economy that funds them.
  db.prepare(
    "UPDATE characters SET wood = 900, ore = 900, herb = 900, essence = 200, ingot = 90, weave = 90 WHERE id = ?",
  ).run(row.id);
  db.prepare(
    "INSERT INTO items (id, characterId, baseId, slot, rarity, statValue, bonusStatValue, affixes, etched, equipped, createdAt, weaponType, style)" +
      " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    `trophy-${Date.now()}`, row.id, chain.sig.id, chain.sig.slot, "honed", 10, 4, "[]", "[]", 0, Date.now(),
    chain.sig.weaponType ?? null, chain.sig.style ?? null,
  );
  db.close();
}

const { browser, page } = await open({ headless: true, width: 1100, height: 720 });
await login(page, NAME);
await page.waitForTimeout(1400);

const bench = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    for (const [id, s] of g.stationStates ?? []) {
      return { id, x: s.x, y: s.y, d: Math.hypot(s.x - g.playerX, s.y - g.playerY) };
    }
    return null;
  });
const knows = (id) => page.evaluate((b) => (window.__wieldbound.recipes ?? []).includes(b), id);
const lastLine = () =>
  page.evaluate(() => [...document.querySelectorAll("#combat-log div")].slice(-1)[0]?.textContent ?? "");

/** Ask throughout the approach orbit; the server decides range. */
const tryForge = async (baseId) => {
  // "Asked" means the character was genuinely inside the interaction range at
  // some point, not "the last log line was not about distance". The first
  // version inferred it from the log and inherited the daily-bonus line, so a
  // run that never reached the bench reported the forge as REFUSED.
  let asked = false;
  for (let i = 0; i < 220; i++) {
    const at = await bench();
    if (!at) break;
    if (at.d <= INTERACTION_RANGE_PX * 1.5) {
      const before = await page.evaluate(() => window.__wieldbound.items.length);
      await page.evaluate(([sid, bid]) => window.__wieldbound.socket.sendForgeItem(sid, bid), [at.id, baseId]);
      await page.waitForTimeout(600);
      const line = await lastLine();
      if ((await page.evaluate(() => window.__wieldbound.items.length)) > before) return { made: true, line };
      if (at.d <= INTERACTION_RANGE_PX) asked = true;
    }
    await approach(page, at, at.d > 200 ? 350 : 90);
  }
  return { made: false, asked, line: await lastLine() };
};

// 1. Refused before the trophy is broken.
const first = await tryForge(chain.relic.id);
console.log(
  `1. forging it with no recipe: ` +
    (first.made
      ? "!! IT FORGED — the boss is decoration"
      : first.asked
        ? `refused — "${first.line}"`
        : "INCONCLUSIVE — never got in range to ask"),
);

// 2. The trophy teaches the relic.
const trophyId = await page.evaluate((bid) => {
  const g = window.__wieldbound;
  const it = g.items.find((i) => i.baseId === bid && !i.equipped);
  return it ? it.id : null;
}, chain.sig.id);
if (!trophyId) {
  console.log("2. !! the trophy is not in the bag");
} else {
  await page.evaluate((iid) => window.__wieldbound.socket.sendSalvageItem(iid), trophyId);
  await page.waitForTimeout(1100);
  const learnedRelic = await knows(chain.relic.id);
  const learnedItself = await knows(chain.sig.id);
  console.log(
    `2. salvaging ${chain.sig.name}: ` +
      (learnedRelic
        ? `taught ${chain.relic.name}${learnedItself ? " (and itself, which it should not)" : ""}`
        : "!! taught nothing — the trophy is a trophy and no more"),
  );
}

// 3. And now it forges.
if (await knows(chain.relic.id)) {
  const second = await tryForge(chain.relic.id);
  console.log(
    `3. forging it with the recipe: ` +
      (second.made ? `made — "${second.line}"` : `!! still refused — "${second.line}"`),
  );
}
await browser.close();
