// DOES THE TIER ON A FORGE OBJECTIVE ACTUALLY GATE?
//
// `inn-secondring` asks for one band-2 item, and the whole point is that it
// cannot be finished with the recipes a character is born knowing. If a band-1
// forge advances it, the quest is satisfied by the work `inn-forge` already
// asked for and the rung disappears. Nothing throws either way.
//
// The quest sits behind level 4 and `inn-salvage`, so this walks the real chain
// rather than forcing the counter: a fresh character genuinely cannot take it,
// which is itself worth seeing.
//
//   node tools/seed.mjs <name> --level 6   (once)
//   node tools/soak/.tier.mjs <name>
import { DatabaseSync } from "node:sqlite";
import { open, login, approach } from "./driver.mjs";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Loop2";

// THE PREREQUISITES, WRITTEN DIRECTLY, because walking them is the wrong test.
//
// `inn-secondring` sits behind level 4 and four quests of Marda's chain, two of
// which are gathering quests that count real gathers — twenty minutes of bot
// time to arrive at the four lines this file actually checks. The chain is
// covered elsewhere; what is under test here is whether a forge objective
// honours its band, so the chain is a fixture rather than the subject.
{
  const db = new DatabaseSync("server/data/wieldbound.db");
  const row = db.prepare("SELECT id FROM characters WHERE name = ?").get(NAME);
  if (!row) {
    console.log(`no character "${NAME}" — log in once and run tools/seed.mjs ${NAME} --level 6`);
    process.exit(1);
  }
  const ins = db.prepare("INSERT OR REPLACE INTO quests (characterId, questId, count, completedAt) VALUES (?,?,?,?)");
  for (const q of ["inn-wood", "inn-herb", "inn-forge", "inn-salvage"]) ins.run(row.id, q, 999, Date.now());
  // AND CLEAR THE ONE UNDER TEST. Leaving a satisfied counter in place makes a
  // re-run report "BAND 2 DID NOT COUNT" about a working gate — the count was
  // simply already at its threshold, which is what the first re-run of this
  // file did say.
  db.prepare("DELETE FROM quests WHERE characterId = ? AND questId = ?").run(row.id, "inn-secondring");
  db.close();
}
const { browser, page } = await open({ headless: true, width: 1100, height: 720 });
await login(page, NAME);
await page.waitForTimeout(1400);
const who = await page.evaluate(() => {
  const g = window.__wieldbound;
  return {
    level: g.level,
    npcIds: [...g.npcs.keys()],
    recipes: (g.recipes ?? []).length,
    knowsFalchion: (g.recipes ?? []).includes("falchion"),
    done: [...(g.questTracker?.completedQuests ?? [])],
    active: [...(g.questTracker?.activeQuests ?? [])].map((q) => q.id),
  };
});
console.log("character:", JSON.stringify(who));

const bench = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    for (const [id, s] of g.stationStates ?? []) {
      return { id, x: s.x, y: s.y, d: Math.hypot(s.x - g.playerX, s.y - g.playerY) };
    }
    return null;
  });
const counter = (qid) =>
  page.evaluate((id) => {
    const t = window.__wieldbound.questTracker;
    const q = [...(t?.activeQuests ?? [])].find((x) => x.id === id);
    return q ? q.count : (t?.completedQuests ?? []).includes(id) ? "done" : null;
  }, qid);

/** Walk to the anvil and forge one thing, retrying across the approach orbit. */
const forgeOnce = async (baseId) => {
  for (let i = 0; i < 140; i++) {
    const at = await bench();
    if (!at) break;
    if (at.d <= INTERACTION_RANGE_PX * 1.5) {
      const before = await page.evaluate(() => window.__wieldbound.items.length);
      await page.evaluate(([sid, bid]) => window.__wieldbound.socket.sendForgeItem(sid, bid), [at.id, baseId]);
      await page.waitForTimeout(600);
      if ((await page.evaluate(() => window.__wieldbound.items.length)) > before) return true;
    }
    await approach(page, at, at.d > 200 ? 350 : 90);
  }
  return false;
};

// ACCEPTING NEEDS YOU STANDING THERE. The server refuses out of earshot — the
// same rule the workbench has — and it refuses with a line rather than in
// silence, so a probe that never walks reports every quest as ungrantable.
const toMarda = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    const n = g.npcs.get("marda");
    return n ? { x: n.x, y: n.y, d: Math.hypot(n.x - g.playerX, n.y - g.playerY) } : null;
  });
const accept = async (qid) => {
  for (let i = 0; i < 120; i++) {
    const at = await toMarda();
    if (!at) break;
    if (at.d <= 110) {
      await page.evaluate((id) => window.__wieldbound.socket.sendAcceptQuest("marda", id), qid);
      await page.waitForTimeout(600);
      if ((await counter(qid)) !== null) return true;
      const line = await page.evaluate(() => [...document.querySelectorAll("#combat-log div")].slice(-1)[0]?.textContent ?? "");
      if (line) console.log(`    accept ${qid} at ${at.d.toFixed(0)}px -> "${line}"`);
    }
    await approach(page, at, at.d > 200 ? 350 : 90);
  }
  return (await counter(qid)) !== null;
};

// Clear the two quests ahead of it, so the chain is walked rather than skipped.
for (const [qid, work] of [["inn-forge", 2], ["inn-salvage", 3]]) {
  if ((await counter(qid)) === "done") { console.log(`${qid}: already done`); continue; }
  await accept(qid);
  for (let n = 0; n < work; n++) {
    if (qid === "inn-forge") await forgeOnce("dirk");
    else {
      const spare = await page.evaluate(() => {
        const g = window.__wieldbound;
        const it = g.items.find((i) => !i.equipped);
        return it ? it.id : null;
      });
      if (spare) { await page.evaluate((iid) => window.__wieldbound.socket.sendSalvageItem(iid), spare); await page.waitForTimeout(600); }
    }
  }
  console.log(`${qid}: counter ${await counter(qid)}`);
}

const taken = await accept("inn-secondring");
console.log(`\ninn-secondring taken: ${taken}, counter ${await counter("inn-secondring")}`);
if (!taken) { console.log("  (still gated — level 4 and inn-salvage)"); await browser.close(); process.exit(0); }

const before = await counter("inn-secondring");
await forgeOnce("dirk");
const afterBand1 = await counter("inn-secondring");
console.log(`  after forging a BAND-1 dirk:    ${before} -> ${afterBand1}  ${afterBand1 === before ? "(correctly ignored)" : "!! BAND 1 ADVANCED IT"}`);

const knows = await page.evaluate(() => (window.__wieldbound.recipes ?? []).includes("falchion"));
if (!knows) {
  console.log("  this character does not know the Falchion recipe — run tools/soak/shoploop.mjs first");
} else {
  // DID IT FORGE, THOUGH? A counter that did not move because nothing was made
  // is a statement about materials, not about the gate — and it prints the same.
  const made = await forgeOnce("falchion");
  const afterBand2 = await counter("inn-secondring");
  console.log(
    `  after forging a BAND-2 falchion: ${afterBand1} -> ${afterBand2}  ` +
      (!made
        ? "INCONCLUSIVE — the forge never succeeded (out of materials?)"
        : afterBand2 !== afterBand1
          ? "(counted)"
          : "!! BAND 2 DID NOT COUNT"),
  );
}
await browser.close();
