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
import { INTERACTION_RANGE_PX, xpToNextLevel, PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Guided${Math.floor(Math.random() * 100000)}`;
const MINUTES = Number(process.argv[3] ?? 12);

// HEADLESS, AND NOT AS A PREFERENCE.
//
// This is a long-run progression bot, which is precisely the case `driver.mjs`
// says must be headless: a headed Chromium that loses focus throttles rAF to
// about 1Hz, so a bot left running for ten minutes while the machine is used
// for anything else spends most of those minutes moving at one frame a second
// and reports the result as if it had played normally. Nothing here is a load
// measurement, so SwiftShader costs nothing that matters.
//
// It also stops a window appearing over whatever the person at the keyboard is
// doing. Twice a harness window was mistaken for the game misbehaving, which is
// a real cost to a tool whose whole job is to tell truth from artefact.
const { browser, page } = await open({ headless: true, width: 1600, height: 900 });
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

// WHY A GATHER PHASE FAILED, not merely that it did.
//
// "wood 20 -> 20 (gave up)" has at least three completely different causes and
// prints the same for all of them: the character never reached a tree, the
// server refused the order as out of range, or every gather was cancelled by
// something walking into reach. The third is a statement about the EARLY GAME —
// band-1 camps sit at 1320px and the inner tree ring at 1150 — and the other
// two are statements about the walk. Counting the endings tells them apart.
await page.evaluate(() => {
  const g = window.__wieldbound;
  window.__ends = { busy: 0, left: 0, refused: 0 };
  const proto = Object.getPrototypeOf(g);
  const orig = proto.noteGatherInterrupted;
  if (typeof orig === "function") {
    proto.noteGatherInterrupted = function patched(reason) {
      window.__ends[reason] = (window.__ends[reason] ?? 0) + 1;
      return orig.call(this, reason);
    };
  }
  // A refusal arrives as an INFO line rather than as a gather ending, since the
  // server never accepted the order in the first place.
  const push = g.combatLog.push.bind(g.combatLog);
  g.combatLog.push = (text, colour) => {
    if (typeof text === "string" && /too far away to gather/i.test(text)) window.__ends.refused++;
    return push(text, colour);
  };
});
const endsNow = () => page.evaluate(() => ({ ...window.__ends }));
let endsMark = await endsNow();
const endsSince = async () => {
  const now = await endsNow();
  const d = (k) => (now[k] ?? 0) - (endsMark[k] ?? 0);
  const line = `interrupted ${d("busy")}x by something in reach, ${d("left")}x by moving off, ${d("refused")}x refused as out of range`;
  endsMark = now;
  return line;
};

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
  const before = await page.evaluate(() =>
    [...(window.__wieldbound.questTracker?.activeQuests ?? [])].map((q) => q.id),
  );
  // The quest row is the first option and carries its reward on the right; the
  // rest of the list is conversation. Clicking by position would break the
  // moment a topic is added, so it is found by having a reward attached.
  const took = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".dlg-option:not(.disabled)")];
    const quest = rows.find((r) => /xp/i.test(r.textContent ?? ""));
    if (!quest) return null;
    // Title and reward are separate elements laid out left and right, so
    // `textContent` runs them together — the first run printed "Thin Them
    // Out40 xp · 25 wood", which reads like a broken quest name in the GAME
    // rather than two spans with no space between them in the PROBE.
    const parts = [...quest.children].map((c) => c.textContent.trim()).filter(Boolean);
    const label = (parts.length ? parts.join("  —  ") : quest.textContent.trim()).slice(0, 70);
    quest.click();
    return label;
  });
  await page.waitForTimeout(700);

  // CLICKING THE QUEST ROW DOES NOT TAKE THE QUEST. It shows you the brief and
  // offers a second row, "I'll do it." — read it, then commit — and that second
  // click is the accept. This file clicked the first row, pressed Escape, and
  // printed "took work from Warden Cabel". It had taken nothing. Every run this
  // harness has ever produced was of a character carrying no quests at all,
  // which makes it a measurement of the OPPOSITE of what it claims: the file
  // exists to play the opening as the Herald describes it, and step one of that
  // description never happened.
  const confirmed = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".dlg-option:not(.disabled)")];
    const yes = rows.find((r) => /i'?ll do it|accept|agreed/i.test(r.textContent ?? ""));
    if (!yes) return false;
    yes.click();
    return true;
  });
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");

  // AND THE TRACKER IS WHAT DECIDES WHETHER IT WORKED, not the fact that a
  // click was dispatched. A click that lands on nothing throws nothing, which
  // is exactly how the original fault stayed invisible through two runs and a
  // written-up report.
  const after = await page.evaluate(() =>
    [...(window.__wieldbound.questTracker?.activeQuests ?? [])].map((q) => q.id),
  );
  const gained = after.filter((id) => !before.includes(id));
  if (gained.length) {
    accepted.push(`${took} [${gained.join(",")}]`);
    console.log(`${mark()}  took work from ${npc.name}: ${took}`);
  } else if (took) {
    console.log(
      `${mark()}  !! clicked "${took}" at ${npc.name} but the quest log did not change` +
        (confirmed ? " even after confirming" : " — no confirm row was found"),
    );
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
      if (!best || d < best.d) best = { x: n.x, y: n.y, d, kind: n.kind, id: n.id };
    }
    return best;
  }, kinds);

const gatherUntil = async (label, kinds, want, getter, capMs) => {
  const until = Date.now() + capMs;
  while (Date.now() < until) {
    const cur = await state();
    if (getter(cur) >= want) return true;
    // NOTHING AVAILABLE IS NOT THE SAME AS NOTHING LEFT.
    //
    // This returned false the moment `nearestNode` came back empty, and the
    // first run of this phase duly reported "gathering wood: 20 -> 32 (gave
    // up)" after forty-eight seconds — which reads like a world that runs out
    // of trees. It is not. `GATHER_RESPAWN_MS` is 8000, so a bot that has just
    // stripped the cluster it is standing in sees every nearby node in the
    // "spent" state for the next eight seconds, and there is no state of the
    // world in which that means "give up and go home". A player waits.
    //
    // So an empty look now waits and looks again, and only the phase cap ends
    // the phase. What "gave up" means afterwards is "the cap expired", which is
    // a statement about rate, and that is the thing this phase is for.
    let node = null;
    for (let wait = 0; wait < 6 && !node; wait++) {
      node = await goTo(nearestNode(kinds), INTERACTION_RANGE_PX * 0.7, 40);
      if (!node) {
        if (Date.now() >= until) return false;
        await page.waitForTimeout(2500);
      }
    }
    if (!node) return false;
    // AND ASK FOR IT.
    //
    // Standing next to a node harvested it until M70.230, which made gathering
    // something the player chooses — so a phase that only walks now measures a
    // character standing beside a tree for four minutes and reports "gave up",
    // which would read as the ground having stopped paying. The order is placed
    // on arrival and re-placed each time round the loop, because it ends when
    // the node is spent and again if anything walks into reach.
    await page.evaluate((id) => window.__wieldbound.socket.sendGather(id), node.id);
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
const gotWood = await gatherUntil("wood", ["tree"], woodTarget, (s) => s.wood, 2.5 * 60000);
let s = await state();
console.log(`${mark()}  gathering wood: ${start.wood} -> ${s.wood} ${gotWood ? "(target met)" : "(gave up)"}`);
console.log(`      ${await endsSince()}`);

const oreTarget = 30;
const gotOre = await gatherUntil("ore", ["rock"], oreTarget, (s2) => s2.ore, 2 * 60000);
s = await state();
console.log(`${mark()}  gathering ore:  ${start.ore} -> ${s.ore} ${gotOre ? "(target met)" : "(gave up)"}`);
console.log(`      ${await endsSince()}`);

// HERB, BECAUSE ONE OF THE TWO QUESTS IS PAID IN IT AND THIS BOT NEVER PICKED
// ANY. Marda's work wants 30 ore and 25 herb; a new character arrives with 20
// and 15. The first run gathered wood and ore, ended on herb 15 — exactly what
// it started with — and reported the opening as if it had followed the advice
// through. It had not: the phase for the material the quest actually asks for
// did not exist, so "did the guidance lead to a finished quest" was never being
// asked. A missing phase is a harsher lie than a wrong number, because there is
// nothing in the output to disbelieve.
const herbTarget = 25;
const gotHerb = await gatherUntil("herb", ["bush"], herbTarget, (s2) => s2.herb, 2 * 60000);
s = await state();
console.log(`${mark()}  gathering herb: ${start.herb} -> ${s.herb} ${gotHerb ? "(target met)" : "(gave up)"}`);
console.log(`      ${await endsSince()}`);

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
//
// COUNT WHAT DIES, IN THE PAGE, ON THE PAGE'S OWN CLOCK. Counting kills from
// out here means polling `monsters` between keypresses and hoping a corpse is
// still in the map when the poll lands; a monster that spawns, dies and is
// swept between two polls is invisible. A tick installed in the page watches
// every id it has seen alive and notices the ones that stop being alive.
await page.evaluate(() => {
  const g = window.__wieldbound;
  const alive = new Set();
  window.__kills = 0;
  setInterval(() => {
    for (const [id, v] of g.monsters) {
      const st = v.state;
      if (!st) continue;
      const near = Math.hypot(st.x - g.playerX, st.y - g.playerY) < 300;
      if (st.status === "alive" && near) alive.add(id);
      else if (st.status !== "alive" && alive.delete(id)) window.__kills++;
    }
  }, 250);
});
// THE HOTBAR IS PER WEAPON, AND THIS RUNS RIGHT AFTER BUYING ONE.
//
// Read once, immediately after the shop step swapped a dagger for a sword, this
// came back EMPTY — the layout for the new weapon had not been installed yet —
// and the fight phase then pressed nothing for six and a half minutes and
// reported "0 attack presses, 0 monsters died". Which is true, and is a
// statement about the probe: a bot that never pressed attack has measured
// nothing about combat, and the summary looked exactly like a character that
// could not kill anything.
//
// So it waits for a layout, and falls back to the default binding rather than
// silently doing nothing.
let keys = [];
for (let i = 0; i < 20 && keys.length === 0; i++) {
  keys = await page.evaluate(() => window.__wieldbound.hotbar?.layout?.keys ?? []);
  if (keys.length === 0) await page.waitForTimeout(300);
}
if (keys.length === 0) {
  console.log(`${mark()}  !! the hotbar reported no keys — falling back to "1"`);
  keys = ["1"];
}
// HUNTING, NOT CIRCLING. `driver.mjs` writes down the trap this fell into:
// "walking a fixed N/E/S/W rotation in equal legs is a CLOSED LOOP — it comes
// back to where it started and never leaves town, which looks like exploring
// right up until you plot it." That is precisely what this phase did, and the
// consequence was not a small one: the fight phase ran for seven minutes and
// produced sixteen real swings, because the character spent almost all of it
// walking a circle inside the walls where nothing spawns. The output said
// "129 swings" — those are KEYPRESSES at five a second against a 1595ms swing
// cooldown — and "level 1 -> 1", and both readings are about the walker.
//
// So the heading persists and turns by an angle that does not divide the
// circle, and while the character is still near the spawn it is pushed
// outward, because the monsters are outside and the town is not a hunting
// ground. Turning only when a leg is blocked or fruitless keeps it travelling
// in a straight line, which is the only thing that covers distance.
const KEYS_FOR = (angle) => {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const keys = [];
  if (dy < -0.38) keys.push("w");
  if (dy > 0.38) keys.push("s");
  if (dx > 0.38) keys.push("d");
  if (dx < -0.38) keys.push("a");
  return keys.length ? keys : ["w"];
};
let heading = Math.random() * Math.PI * 2;
// THE FIGHT PHASE CAN BE STARVED BY THE PHASES IN FRONT OF IT, and until this
// was recorded there was nothing in the output to say so. The gather caps are
// four minutes, three and three; with the quests and the shop that is nearly
// eleven of a twelve-minute budget, so `endAt` can already be in the past by
// the time the character draws its weapon. The summary would still print
// "level 1 -> 1" — a report about a fight that never got the chance to happen,
// indistinguishable from a fight that happened and went badly.
const fightFrom = Date.now();
const endAt = t0 + MINUTES * 60000;
let i = 0;
let lastLevel = s.level;
let swings = 0;
// SURVIVING THE WAY THE GAME EXPECTS, because otherwise the health figure this
// run reports is a statement about a bot and not about the early game.
//
// Earlier runs reached level 2 on 28/80 and level 3 on 3/90, and that was
// flagged as possibly too punishing. It measures nothing: this bot fought
// continuously, never drank, and never broke off. The game's own answer to low
// health is one of two things, and it does neither.
//
//   * A POTION. A new character has one from the daily bonus and Cabel's work
//     pays two more.
//   * DISENGAGING. Regen is out-of-combat only and deliberately so — "left Mend
//     without a job" is the note in the server tick — at 1 HP per five seconds
//     for a starting character, which is 12 a minute against a 70 HP pool.
//
// So it drinks when it can and retreats when it cannot, and counts both. What
// the run can then say is whether a new player following the advice DIES, which
// is the actual question.
let deaths = 0;
let potionsDrunk = 0;
let retreats = 0;
let lastHp = (await state()).hp;
const survive = async (s) => {
  if (s.hp > s.maxHp * 0.35) return false;
  // ASK, THEN CHECK WHETHER IT WORKED, rather than looking for a count.
  //
  // The Game keeps no potion field — `POTIONS_UPDATE` goes straight into the
  // inventory panel — so a probe that reads `g.potions` finds undefined and
  // concludes there is nothing to drink. That is exactly what the first run of
  // this did: "0 potion(s) drunk" with potions in the bag, which turns the
  // retreat count into a measurement of a character that refused to heal.
  //
  // The server ignores a drink it cannot honour, so asking blind costs nothing
  // and the health afterwards is the only answer that cannot be misread.
  const before = s.hp;
  await page.evaluate(() => window.__wieldbound.socket.sendUseConsumable("potion"));
  await page.waitForTimeout(700);
  if ((await state()).hp > before + 5) {
    potionsDrunk++;
    return true;
  }
  // Nothing to drink: walk away from whatever is hitting us and wait for the
  // out-of-combat clock plus regen. Capped, because standing still healing for
  // the rest of the run measures nothing either.
  retreats++;
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    const now = await state();
    if (now.hp > now.maxHp * 0.7) break;
    if (now.hp <= 0) break;
    const away = await page.evaluate(() => {
      const g = window.__wieldbound;
      let best = null;
      for (const v of g.monsters.values()) {
        const st = v.state;
        if (!st || st.status !== "alive") continue;
        const d = Math.hypot(st.x - g.playerX, st.y - g.playerY);
        if (!best || d < best.d) best = { x: st.x, y: st.y, d };
      }
      if (!best) return null;
      // A point directly away from it, well past the leash.
      const dx = g.playerX - best.x;
      const dy = g.playerY - best.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: g.playerX + (dx / len) * 700, y: g.playerY + (dy / len) * 700, d: 0 };
    });
    if (away) await approach(page, away, 500);
    else await page.waitForTimeout(1000);
  }
  return true;
};

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
  // HUNT, RATHER THAN WANDER AND HOPE.
  //
  // The threshold was 400px: anything further away and the bot went back to
  // walking a heading. But the client knows about monsters far beyond that, and
  // after the gathering phases the character is out at the herb ring with the
  // band-1 camps behind it — so "wander outward and see what turns up" walks
  // AWAY from everything. Two consecutive runs reported "0 attack presses, 0
  // monsters died" over three and seven minutes, which reads as a character
  // that cannot kill anything and is really a character that never met one.
  //
  // If the client knows where something alive is, walk to it. That is what a
  // player does, and it is the only way this phase measures combat at all.
  // Health first, before deciding to fight. A character at a tenth of its pool
  // walking into another slime is not playing the game as designed.
  const health = await state();
  // A DEATH shows up as the pool jumping back up on its own — respawning is the
  // only thing that refills it, since regen is a point every five seconds.
  if (health.hp > lastHp + 15) deaths++;
  lastHp = health.hp;
  if (await survive(health)) continue;

  if (near) {
    if (near.d > 55) await approach(page, near, 450);
    else if (keys.length) {
      swings++;
      await page.keyboard.press(keys[0]);
      await page.waitForTimeout(200);
    }
  } else {
    // Push outward while still in sight of the spawn, otherwise hold the
    // heading. 2.3 radians is the turn: it is not a divisor of 2*pi, so a
    // string of turns never closes back on itself.
    const here = await state();
    const out = Math.atan2(here.y - PLAYER_SPAWN.y, here.x - PLAYER_SPAWN.x);
    const fromSpawn = Math.hypot(here.x - PLAYER_SPAWN.x, here.y - PLAYER_SPAWN.y);
    if (fromSpawn < 900) heading = out + (Math.random() - 0.5) * 0.8;
    const leg = await step(page, KEYS_FOR(heading), 700);
    if (leg.moved < 20) heading += 2.3;
    if (++i % 8 === 0) heading += 2.3;
  }
  const now = await state();
  if (now.level !== lastLevel) {
    console.log(`${mark()}  level ${lastLevel} -> ${now.level}   (${now.hp}/${now.maxHp} hp, holding ${now.weapon})`);
    lastLevel = now.level;
  }
}

const kills = await page.evaluate(() => window.__kills ?? 0);
const end = await state();
console.log(`\nafter ${MINUTES} minutes of following the advice:`);
// XP, NOT JUST LEVEL. The first run of this said "level 1 -> 1" and stopped
// there, which cannot be read: a character four experience short of level two
// and a character that killed nothing at all print the same line, and those are
// completely different reports about the opening. Level 2 costs 20 — four
// slimes — so the interesting number is always the one underneath the level.
console.log(
  `  level ${start.level} -> ${end.level} (${end.xp} xp into it, ${xpToNextLevel(end.level)} needed), ` +
    `holding ${end.weapon}`,
);
const fightMin = (Date.now() - fightFrom) / 60000;
console.log(
  `  ${swings} attack presses, ${kills} monsters died within reach, ` +
    `over ${fightMin.toFixed(1)}min of fighting`,
);
console.log(
  `  survival: ${deaths} death(s), ${potionsDrunk} potion(s) drunk, ${retreats} retreat(s) to heal`,
);
if (fightMin < 2) {
  console.log(
    "  !! the gathering phases used almost the whole budget, so the level and kill " +
      "figures above say nothing about combat. Give it more minutes.",
  );
}
console.log(`  materials: wood ${end.wood}, ore ${end.ore}, herb ${end.herb}`);
console.log(`  quests taken: ${accepted.length ? accepted.join(" | ") : "none"}`);
// AND WHERE THOSE QUESTS ACTUALLY GOT TO, which is the question the whole file
// exists to answer and which it was not printing. "Took two quests" and
// "finished neither of them" are different reports about the opening.
const quests = await page.evaluate(() => {
  const t = window.__wieldbound.questTracker;
  return {
    active: [...(t?.activeQuests ?? [])].map((q) => ({ id: q.id, count: q.count })),
    done: [...(t?.completedQuests ?? [])],
  };
});
for (const q of quests.active) console.log(`    still running: ${q.id} at ${JSON.stringify(q.count)}`);
console.log(`    completed: ${quests.done.length ? quests.done.join(", ") : "none"}`);
console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 4)) console.log("  ", e);
await browser.close();
