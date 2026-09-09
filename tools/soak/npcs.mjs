// EVERY TOWN NPC, TALKED TO AND PHOTOGRAPHED.
//
// `panels.mjs` covers the windows a key opens. Nothing covered the ones a
// PERSON opens: five NPCs in Emberhold — a guide, a vendor, two quest-givers
// and a flavour character — with dialogue, a shop and a forge behind them, and
// not one frame of any of it in this directory. A subsystem nobody has looked
// at is where the next visible bug is, on the evidence of this session: the
// three real faults so far all came out of frames rather than counters.
//
// Walks into talking range of each in turn — the range is a shared constant, so
// this cannot drift from the rule the game uses — opens the conversation, and
// captures it. No assertions; the point is pictures to examine.
//
//   node tools/soak/npcs.mjs Player3619 tools/soak/shots/npc
import { mkdirSync } from "node:fs";
import { open, login, approach } from "./driver.mjs";
import { TOWN_NPCS, NPC_TALK_RANGE_PX } from "../../shared/town.ts";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/npc";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: false, width: 1600, height: 900 });
await page.bringToFront();
await login(page, NAME);

// Where they actually are, from the running game rather than from the table:
// NPCs walk a beat around their post (`NPC_BEAT_RADIUS_PX`), so the authored
// coordinate is where they belong, not where they are.
const where = await page.evaluate(() =>
  [...window.__wieldbound.npcs.entries()].map(([id, n]) => ({ id, x: n.x, y: n.y, name: n.def?.name ?? id })),
);
console.log(`${where.length} NPCs in the world; the table names ${TOWN_NPCS.length}`);

for (const npc of where) {
  // Close enough that the game will let them answer, then a little closer, so a
  // beat step mid-approach does not push them back out of range.
  for (let i = 0; i < 30; i++) {
    const live = await page.evaluate((id) => {
      const g = window.__wieldbound;
      const n = g.npcs.get(id);
      return n ? { x: n.x, y: n.y, d: Math.hypot(n.x - g.playerX, n.y - g.playerY) } : null;
    }, npc.id);
    if (!live) break;
    if (live.d <= NPC_TALK_RANGE_PX * 0.6) break;
    await approach(page, live, 450);
  }

  // AND ONLY TALK IF THE GAME WOULD LET A PLAYER TALK. `talkTo` is what the
  // click handler calls AFTER checking range; calling it directly skips that
  // check, and the first run of this opened Warden Cabel's dialogue from 427px
  // when the range is 150 — a frame of a conversation no player could have
  // started, taken from too far away to see him in it.
  const reached = await page.evaluate((id) => {
    const g = window.__wieldbound;
    const n = g.npcs.get(id);
    return n ? Math.hypot(n.x - g.playerX, n.y - g.playerY) : null;
  }, npc.id);
  if (reached === null || reached > NPC_TALK_RANGE_PX) {
    const why = reached === null ? "gone" : `${reached.toFixed(0)}px, limit ${NPC_TALK_RANGE_PX}`;
    console.log(`  ${npc.id.padEnd(8)} ${npc.name.padEnd(14)} OUT OF RANGE (${why})`);
    continue;
  }

  const opened = await page.evaluate((id) => {
    const g = window.__wieldbound;
    const n = g.npcs.get(id);
    if (!n) return { ok: false, why: "gone" };
    const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
    g.talkTo(id);
    return { ok: !!g.dialogue?.openNpcId, why: `${d.toFixed(0)}px away`, open: g.dialogue?.openNpcId ?? null };
  }, npc.id);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/npc-${npc.id}.png` });
  console.log(`  ${npc.id.padEnd(8)} ${npc.name.padEnd(14)} ${opened.ok ? "talking" : "NO DIALOGUE"}  (${opened.why})`);

  // Take whatever the conversation offers — a shop, a forge, a quest — since
  // those windows are the half of this nobody has seen.
  const actions = await page.evaluate(() =>
    [...document.querySelectorAll(".dlg-option:not(.disabled)")].map((b) => b.textContent.trim()),
  );
  if (actions.length) console.log(`           offers: ${actions.join(" | ")}`);
  for (let i = 0; i < actions.length; i++) {
    const label = actions[i].replace(/[^a-z0-9]+/gi, "-").slice(0, 24).toLowerCase();
    const clicked = await page.evaluate((idx) => {
      const bs = [...document.querySelectorAll(".dlg-option:not(.disabled)")];
      if (!bs[idx]) return false;
      bs[idx].click();
      return true;
    }, i);
    if (!clicked) continue;
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/npc-${npc.id}-${i}-${label}.png` });
    // Back to the conversation for the next option.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.evaluate((id) => window.__wieldbound.talkTo(id), npc.id);
    await page.waitForTimeout(300);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

console.log(`\nshots in ${OUT}/`);
console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 5)) console.log("  ", e);
await browser.close();
