// THE OPENING AS THE GAME TELLS YOU TO PLAY IT.
//
// `firstminutes.mjs` measures a new character who ignores every piece of
// guidance: it walks out and punches slimes, which at 45% accuracy for ~0.68
// damage a swing is 26 seconds per slime and 9 experience in six minutes. That
// number is real and it is not the early game, because the early game has
// instructions and that bot follows none of them.
//
// The Herald's "What should I do first?" says: take work from Cabel and Marda,
// both of which pay in materials; gather beyond the wall; then forge something
// at the anvil. So this does that, in order, and reports how long each step
// takes a character that has never logged in before.
//
// WHAT IT IS ACTUALLY ASKING. Not "is the opening fun" — a bot cannot answer
// that. It asks whether the guidance is FOLLOWABLE: whether a player doing
// exactly what they are told reaches a weapon, a level and a completed quest in
// a sane amount of time, or hits a wall the instructions do not mention. That
// is checkable, and M70.211 and M70.215 both found the instructions describing
// a world that had moved on, so it is worth checking.
//
// No assertions. It reports a timeline for a person to read.
//
//   node tools/soak/guidedopening.mjs Guided7 12
import { open, login, approach, step } from "./driver.mjs";
import { TOWN_NPCS, NPC_TALK_RANGE_PX } from "../../shared/town.ts";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Guided${Math.floor(Math.random() * 100000)}`;
const MINUTES = Number(process.argv[3] ?? 12);

const { browser, page } = await open({ headless: false, width: 1600, height: 900 });
await page.bringToFront();
const loadMs = await login(page, NAME);
const t0 = Date.now();
const mark = () => `+${((Date.now() - t0) / 60000).toFixed(1)}min`;

const state = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    return {
      level: g.level, xp: g.xp, hp: g.hp, maxHp: g.maxHp,
      wood: g.wallet?.wood ?? 0, ore: g.wallet?.ore ?? 0, herb: g.wallet?.herb ?? 0,
      items: g.items?.length ?? 0,
      weapon: g.items?.find?.((i) => i.slot === "weapon" && i.equipped)?.weaponType ?? "fists",
      x: g.playerX, y: g.playerY,
    };
  });

const start = await state();
console.log(`${NAME} arrives in ${(loadMs / 1000).toFixed(1)}s — level ${start.level}, ${start.items} items, ` +
  `wood ${start.wood} ore ${start.ore} herb ${start.herb}\n`);

/** Walk to a live position until inside `within`, giving up rather than hanging. */
const goTo = async (get, within, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    const at = await get();
    if (!at) return null;
    if (at.d <= within) return at;
    await approach(page, at, 500);
  }
  return null;
};

// --- 1. take the work, which is what the Herald says to do first -------------
const npcPos = (id) => () =>
  page.evaluate((npcId) => {
    const g = window.__wieldbound;
    const n = g.npcs.get(npcId);
    return n ? { x: n.x, y: n.y, d: Math.hypot(n.x - g.playerX, n.y - g.playerY) } : null;
  }, id);

const accepted = [];
for (const npc of TOWN_NPCS.filter((n) => n.role === "quest")) {
  const at = await goTo(npcPos(npc.id), NPC_TALK_RANGE_PX * 0.6);
  if (!at) {
    console.log(`${mark()}  could not reach ${npc.name}`);
    continue;
  }
  await page.evaluate((id) => window.__wieldbound.talkTo(id), npc.id);
  await page.waitForTimeout(600);
  // The quest row is the first option and carries its reward on the right; the
  // rest of the list is conversation. Clicking by position would break the
  // moment a topic is added, so it is found by having a reward attached.
  const took = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".dlg-option:not(.disabled)")];
    const quest = rows.find((r) => /xp/i.test(r.textContent ?? ""));
    if (!quest) return null;
    const label = quest.textContent.trim().slice(0, 60);
    quest.click();
    return label;
  });
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  if (took) {
    accepted.push(took);
    console.log(`${mark()}  took work from ${npc.name}: ${took}`);
  } else {
    console.log(`${mark()}  ${npc.name} offered nothing with a reward on it`);
  }
}

// --- 2. gather, which is the half the bot never did before -------------------
//
// Proximity, not a keypress: the server gathers from whatever available node is
// within INTERACTION_RANGE_PX of the player, on its own clock. So this is
// "stand still next to a bush", which is exactly what a player does.
const nearestNode = (kinds) => () =>
  page.evaluate((want) => {
    const g = window.__wieldbound;
    let best = null;
    for (const n of g.nodeStates?.values?.() ?? []) {
      if (n.status !== "available") continue;
      if (want.length && !want.includes(n.kind)) continue;
      const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
      if (!best || d < best.d) best = { x: n.x, y: n.y, d, kind: n.kind };
    }
    return best;
  }, kinds);

const gatherUntil = async (label, kinds, want, getter, capMs) => {
  const until = Date.now() + capMs;
  while (Date.now() < until) {
    const cur = await state();
    if (getter(cur) >= want) return true;
    const node = await goTo(nearestNode(kinds), INTERACTION_RANGE_PX * 0.7, 40);
    if (!node) return false;
    // STAND UNTIL IT IS SPENT, rather than for a fixed four seconds.
    //
    // The first version waited 4000ms and walked on. A gather takes 3000ms at
    // level 0 and the server only starts that clock once the player is already
    // standing there, so each visit bought about one tick and the rest of the
    // cycle was walking — 4 wood in four minutes, against 15 ore in three from
    // the identical code path. That gap is not the game: it is a bot that
    // spends most of its time in transit and then reports the result as a
    // gathering rate.
    //
    // Now it holds position while the node is still available and the wallet is
    // still moving, which is what a player does, and only walks when the node
    // is spent.
    let idle = 0;
    let held = getter(await state());
    while (idle < 3 && Date.now() < until) {
      await page.waitForTimeout(1500);
      const now = await state();
      if (getter(now) > held) {
        held = getter(now);
        idle = 0;
      } else {
        idle++;
      }
      const still = await page.evaluate(
        (n) => [...(window.__wieldbound.nodeStates?.values?.() ?? [])]
          .some((x) => Math.hypot(x.x - n.x, x.y - n.y) < 1 && x.status === "available"),
        node,
      );
      if (!still) break;
    }
  }
  return false;
};

const woodTarget = start.wood + 30;
const gotWood = await gatherUntil("wood", ["tree"], woodTarget, (s) => s.wood, 4 * 60000);
let s = await state();
console.log(`${mark()}  gathering wood: ${start.wood} -> ${s.wood} ${gotWood ? "(target met)" : "(gave up)"}`);

const oreTarget = 30;
const gotOre = await gatherUntil("ore", ["rock"], oreTarget, (s2) => s2.ore, 3 * 60000);
s = await state();
console.log(`${mark()}  gathering ore:  ${start.ore} -> ${s.ore} ${gotOre ? "(target met)" : "(gave up)"}`);

// --- 3. buy the blade the shop sells for exactly this moment -----------------
const oswyn = TOWN_NPCS.find((n) => n.role === "vendor");
const at = await goTo(npcPos(oswyn.id), NPC_TALK_RANGE_PX * 0.6);
if (at) {
  await page.evaluate((id) => window.__wieldbound.talkTo(id), oswyn.id);
  await page.waitForTimeout(600);
  const bought = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".dlg-option:not(.disabled)")]
      .find((r) => /buy .*blade/i.test(r.textContent ?? ""));
    if (!row) return null;
    const label = row.textContent.trim().slice(0, 50);
    row.click();
    return label;
  });
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  console.log(`${mark()}  ${bought ? `bought: ${bought}` : "could not afford or find a blade"}`);
  // And hold it, since buying a sword you never draw is not the point.
  await page.evaluate(() => {
    const g = window.__wieldbound;
    const w = g.items.find((i) => i.slot === "weapon" && !i.equipped);
    if (w) g.socket.sendEquipItem(w.id);
  });
  await page.waitForTimeout(1200);
}
s = await state();
console.log(`${mark()}  holding: ${s.weapon}`);

// --- 4. now fight, armed, and see what the opening actually costs ------------
const keys = await page.evaluate(() => window.__wieldbound.hotbar?.layout?.keys ?? []);
const dirs = [["w"], ["w", "d"], ["d"], ["s", "d"], ["s"], ["s", "a"], ["a"], ["w", "a"]];
const endAt = t0 + MINUTES * 60000;
let i = 0;
let lastLevel = s.level;
let swings = 0;
while (Date.now() < endAt) {
  const near = await page.evaluate(() => {
    const g = window.__wieldbound;
    let best = null;
    for (const v of g.monsters.values()) {
      const st = v.state;
      if (!st || st.status !== "alive") continue;
      const d = Math.hypot(st.x - g.playerX, st.y - g.playerY);
      if (!best || d < best.d) best = { x: st.x, y: st.y, d, kind: st.kind };
    }
    return best;
  });
  if (near && near.d < 400) {
    if (near.d > 55) await approach(page, near, 450);
    else if (keys.length) {
      swings++;
      await page.keyboard.press(keys[0]);
      await page.waitForTimeout(200);
    }
  } else {
    await step(page, dirs[i++ % dirs.length], 700);
  }
  const now = await state();
  if (now.level !== lastLevel) {
    console.log(`${mark()}  level ${lastLevel} -> ${now.level}   (${now.hp}/${now.maxHp} hp, holding ${now.weapon})`);
    lastLevel = now.level;
  }
}

const end = await state();
console.log(`\nafter ${MINUTES} minutes of following the advice:`);
console.log(`  level ${start.level} -> ${end.level}, holding ${end.weapon}, ${swings} swings`);
console.log(`  materials: wood ${end.wood}, ore ${end.ore}, herb ${end.herb}`);
console.log(`  quests taken: ${accepted.length ? accepted.join(" | ") : "none"}`);
console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 4)) console.log("  ", e);
await browser.close();
