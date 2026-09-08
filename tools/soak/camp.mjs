// A WHOLE CAMP AT ONCE, WHICH IS THE UNIT COMBAT IS ACTUALLY FOUGHT IN.
//
// `weapons.mjs`, `skills.mjs` and the two balance models all measure one target
// at a time, and a camp is four: `ringPack` places them on `DIAMOND_OFFSETS`,
// seventy pixels from the centre, so the pack is about 140px across against an
// aggro range of 260. Three things follow that single-target testing cannot see,
// and all three are falsifiable:
//
//   1. STANDING IN THE MIDDLE SHOULD BRING ALL FOUR. Every member is inside
//      aggro range of the centre. If only the one being hit engages, a camp is
//      four duels rather than a fight.
//   2. AN AREA SKILL SHOULD CATCH THE PACK. Cleave's radius is 95 and the
//      members sit at 70, so from the centre it reaches all of them. A
//      "sweep every enemy around you" that lands on one is a single-target
//      skill with a misleading description.
//   3. THE CAMP SHOULD BE SURVIVABLE. Four at once is where the health
//      actually goes — every play session so far has left the character in the
//      low tens against a full bar, and none of them measured it.
//
//   node tools/soak/camp.mjs Fighter ./shots

import { open, login, approach, step } from "./driver.mjs";
import { AGGRO_RANGE_PX, SKILLS, MONSTER_STATS } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Fighter";
/** Optional: insist on one kind, for repeating a run against the same pack. */
const WANT_KIND = process.argv[4];
const OUT = process.argv[3] ?? ".";
/** The area skill to test the pack with, and the weapon that carries it. */
const AOE = { weapon: "sword", skill: "cleave", node: "sword.cleave" };

const TAP = () => {
  window.__skillResults = [];
  const OrigWS = window.WebSocket;
  window.WebSocket = function (...args) {
    const ws = new OrigWS(...args);
    ws.addEventListener("message", (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "SKILL_RESULT") window.__skillResults.push(m.payload);
      } catch {
        /* not ours */
      }
    });
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;
  Object.assign(window.WebSocket, OrigWS);
};

/** Everything the client knows about nearby monsters, and about us. */
const look = (page) =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    const mobs = [];
    for (const v of g.monsters.values()) {
      const s = v.state;
      if (!s || s.status !== "alive") continue;
      mobs.push({
        id: s.id,
        kind: s.kind,
        x: s.x,
        y: s.y,
        hp: s.hp,
        d: Math.hypot(s.x - g.playerX, s.y - g.playerY),
      });
    }
    return { mobs, hp: g.hp, maxHp: g.maxHp, at: { x: g.playerX, y: g.playerY } };
  });

const { browser, page } = await open({ headless: true, width: 1400, height: 800 });
await page.addInitScript(TAP);
await login(page, NAME);

// Hold the area weapon and make sure the skill is bought.
await page.evaluate(async (a) => {
  const g = window.__wieldbound;
  const held = g.items.find((i) => i.slot === "weapon" && i.equipped);
  if (!held || held.weaponType !== a.weapon) {
    const want = g.items.find((i) => i.slot === "weapon" && i.weaponType === a.weapon && !i.equipped);
    if (want) g.socket.sendEquipItem(want.id);
    await new Promise((r) => setTimeout(r, 1000));
  }
  g.socket.sendLearnTalent(a.node);
  await new Promise((r) => setTimeout(r, 500));
}, AOE);

// --- Find a pack -------------------------------------------------------------
// Four of one kind close together is a camp; anything looser is strays.
const findCamp = async () => {
  const { mobs } = await look(page);
  const byKind = {};
  for (const m of mobs) (byKind[m.kind] ??= []).push(m);
  let best = null;
  for (const group of Object.values(byKind)) {
    if (group.length < 3) continue;
    if (WANT_KIND && group[0].kind !== WANT_KIND) continue;
    const cx = group.reduce((a, m) => a + m.x, 0) / group.length;
    const cy = group.reduce((a, m) => a + m.y, 0) / group.length;
    const spread = Math.max(...group.map((m) => Math.hypot(m.x - cx, m.y - cy)));
    if (spread > 200) continue;
    // TOUGHEST FIRST, not nearest or largest. The first run found four slimes
    // at 15hp each and the character deleted the entire camp during the aggro
    // measurement — "0 of 4 closed on us (0 still alive)" is what a pack that
    // is already dead looks like, and it says nothing about aggro.
    const worth = group.length * (MONSTER_STATS[group[0].kind]?.maxHp ?? 0);
    if (!best || worth > best.worth) best = { members: group, x: cx, y: cy, spread, worth };
  }
  return best;
};

let camp = null;
const hunt = Date.now() + 120000;
while (Date.now() < hunt && !camp) {
  camp = await findCamp();
  if (camp) break;
  await step(page, ["w"], 900);
}
if (!camp) {
  console.log("NOT RUN — no camp of three or more found. INCONCLUSIVE.");
  await browser.close();
  process.exit(0);
}
console.log(
  `found a camp of ${camp.members.length} ${camp.members[0].kind}, spread ${camp.spread.toFixed(0)}px ` +
    `(aggro range is ${AGGRO_RANGE_PX})`,
);

// Walk into the middle of it.
const closeUntil = Date.now() + 60000;
while (Date.now() < closeUntil) {
  const s = await look(page);
  if (Math.hypot(camp.x - s.at.x, camp.y - s.at.y) < 70) break;
  await approach(page, camp, 500);
}

const startHp = (await look(page)).hp;
const ids = new Set(camp.members.map((m) => m.id));

// --- 1. Does the pack engage? ------------------------------------------------
// Hit one and watch whether the rest come.
const before = await look(page);
const keys = await page.evaluate(() => window.__wieldbound.hotbar?.layout?.keys ?? []);
for (let i = 0; i < 14; i++) {
  await page.keyboard.press(keys[0]);
  await page.waitForTimeout(220);
}
const after = await look(page);
// ENGAGED MEANS "IN THE FIGHT", NOT "MOVED CLOSER". The first version counted
// members whose distance fell by 20px, and reported 1 of 3 trolls engaging — the
// other two were already standing in contact and so could not close any
// further. A pack that is on top of you is the most engaged it can be.
const CONTACT_PX = 120;
const engaged = after.mobs.filter((m) => ids.has(m.id) && m.d <= CONTACT_PX).length;
const closed = after.mobs.filter((m) => {
  if (!ids.has(m.id)) return false;
  const was = before.mobs.find((b) => b.id === m.id);
  return was && m.d < was.d - 20;
}).length;
const stillAlive = after.mobs.filter((m) => ids.has(m.id)).length;
console.log(
  `after swinging at one: ${engaged} of the ${stillAlive} still standing are in the fight ` +
    `(within ${CONTACT_PX}px), ${closed} walked in; ${camp.members.length - stillAlive} already dead`,
);

// --- 2. Does the area skill catch the pack? ----------------------------------
const skill = SKILLS[AOE.skill];
// COUNTED BEFORE THE CAST. Measuring afterwards counts the survivors, and a
// cleave that killed everything it touched then reports "0 inside its radius",
// which reads as a skill that hit nothing.
const inRadiusBefore = (await look(page)).mobs.filter((m) => m.d <= (SKILLS[AOE.skill]?.radiusPx ?? 95)).length;
const n0 = await page.evaluate(() => window.__skillResults.length);
await page.evaluate((s) => window.__wieldbound.socket.sendUseSkill(s), AOE.skill);
await page.waitForTimeout(1400);
const results = await page.evaluate((n) => window.__skillResults.slice(n), n0);
const r = results.find((x) => x.skillId === AOE.skill);
console.log(
  `${AOE.skill} (radius ${skill?.radiusPx ?? "?"}px): reached ${r?.hits?.length ?? 0} target(s) ` +
    `with ${inRadiusBefore} inside its radius when it went off — ${r?.ok ? "fired" : `refused: ${r?.reason ?? "no answer"}`}`,
);
await page.screenshot({ path: `${OUT}/camp-${camp.members[0].kind}.png` });

// --- 3. Can the camp be cleared, and at what cost? ---------------------------
const clearUntil = Date.now() + 90000;
let lowest = startHp;
while (Date.now() < clearUntil) {
  const s = await look(page);
  lowest = Math.min(lowest, s.hp);
  if (s.hp <= 0) break;
  if (!s.mobs.some((m) => ids.has(m.id))) break;
  const target = s.mobs.filter((m) => ids.has(m.id)).sort((a, b) => a.d - b.d)[0];
  if (target && target.d > 70) await approach(page, target, 400);
  else {
    await page.keyboard.press(keys[0]);
    await page.waitForTimeout(200);
  }
}
const end = await look(page);
const remaining = end.mobs.filter((m) => ids.has(m.id)).length;
console.log(
  `clearing it: ${camp.members.length - remaining}/${camp.members.length} down, ` +
    `health ${Math.round(startHp)} -> ${Math.round(end.hp)} of ${Math.round(end.maxHp)} ` +
    `(lowest ${Math.round(lowest)}, ${((1 - lowest / end.maxHp) * 100).toFixed(0)}% of the bar spent)`,
);

console.log("\nconsole errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 5)) console.log("  ", e);
await browser.close();
