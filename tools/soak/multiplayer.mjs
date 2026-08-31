// TWO CLIENTS IN ONE WORLD.
//
// Everything else in this directory drives a single client, which cannot see the
// half of the game that only exists between players: whether each sees the
// other at all, whether the position one client draws the other at matches where
// that client actually is, whether both agree about a monster they are hitting
// together, and whether either leaks or errors while the other is doing things
// to the same server state.
//
// WHAT "AGREE" HAS TO MEAN HERE, because the obvious assertion is wrong. The
// remote player is interpolated from snapshots and the local one is predicted
// forward, so the two positions are NEVER equal and demanding that they be would
// fail against a perfectly healthy game. What must hold is that the gap stays
// BOUNDED while both are moving — a desync shows up as a gap that grows without
// coming back, not as a gap that exists.
//
// Both characters are fresh names, so both are level 1 and neither can one-shot
// what they are standing in; that keeps them in the same place fighting the same
// things for the length of the run.

import { open, login, probe, hotbarKeys, step, nearestMonster, keysToward, insideTown, gateWaypoint } from "./driver.mjs";

const MINUTES = Number(process.argv[2] ?? 5);
const A_NAME = `Duo${Math.floor(Math.random() * 100000)}a`;
const B_NAME = `Duo${Math.floor(Math.random() * 100000)}b`;
// Band 1, close enough that two level 1s can reach it and survive a while.
const SPAWN = { x: 8000, y: 6000 };
const CAMP = { x: SPAWN.x + 1320, y: SPAWN.y };

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const me = (page) =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

/** What this client believes about everyone else. */
const view = (page) =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    const others = [];
    for (const [id, name] of g.playerNames) {
      if (id === g.playerId) continue;
      const motion = g.playerMotion.get(id);
      const hp = g.playerHp.get(id);
      others.push({
        id,
        name,
        x: motion ? Math.round(motion.x) : null,
        y: motion ? Math.round(motion.y) : null,
        hp: hp ? hp.hp : null,
        maxHp: hp ? hp.maxHp : null,
        hasActor: g.players.has(id),
        visible: !!g.players.get(id)?.root?.visible,
      });
    }
    const monsters = [];
    for (const [id, v] of g.monsters) {
      if (v.state?.status !== "alive") continue;
      monsters.push({ id, hp: v.state.hp, x: Math.round(v.state.x), y: Math.round(v.state.y) });
    }
    return { self: { x: Math.round(g.playerX), y: Math.round(g.playerY), name: g.playerName ?? null }, others, monsters };
  });

/** One leg of walking toward the camp, gate-aware. */
async function advance(page, sign) {
  const p = await me(page);
  if (Math.hypot(CAMP.x - p.x, CAMP.y - p.y) < 300) {
    await page.waitForTimeout(400);
    return sign;
  }
  const aim = insideTown(p) && !insideTown(CAMP) ? gateWaypoint(p) : CAMP;
  const dirs = keysToward(p, aim);
  const r = await step(page, dirs, 550);
  if (r.moved < 25) {
    await step(page, [sign > 0 ? "s" : "w"], 800);
    return -sign;
  }
  return sign;
}

const run = async () => {
  const a = await open({ headless: true });
  const b = await open({ headless: true });
  await login(a.page, A_NAME);
  await login(b.page, B_NAME);
  console.log(`two clients up: ${A_NAME} and ${B_NAME}`);

  const keysA = await hotbarKeys(a.page);
  const keysB = await hotbarKeys(b.page);

  const t0 = Date.now();
  const endAt = t0 + MINUTES * 60000;
  let signA = 1;
  let signB = -1;
  let sawEachOther = false;
  let maxGapA = 0;
  let maxGapB = 0;
  let gapSamples = 0;
  let monsterAgreementChecks = 0;
  let monsterDisagreements = 0;
  let swings = 0;

  while (Date.now() < endAt) {
    // Both walk and fight at the same time, which is the point: a desync that
    // only appears while both are moving is the one worth finding.
    [signA, signB] = await Promise.all([advance(a.page, signA), advance(b.page, signB)]);

    const [ta, tb] = await Promise.all([nearestMonster(a.page), nearestMonster(b.page)]);
    if (ta && ta.d < 260) {
      swings++;
      for (const k of keysA.slice(0, 3)) await a.page.keyboard.press(k);
    }
    if (tb && tb.d < 260) {
      swings++;
      for (const k of keysB.slice(0, 3)) await b.page.keyboard.press(k);
    }

    const [va, vb] = await Promise.all([view(a.page), view(b.page)]);
    const aSeesB = va.others.find((o) => o.name === B_NAME);
    const bSeesA = vb.others.find((o) => o.name === A_NAME);
    if (aSeesB && bSeesA) {
      sawEachOther = true;
      // How far each client's drawing of the other is from where that other
      // client actually thinks it is. Interpolation makes this non-zero always.
      gapSamples++;
      maxGapA = Math.max(maxGapA, Math.hypot(aSeesB.x - vb.self.x, aSeesB.y - vb.self.y));
      maxGapB = Math.max(maxGapB, Math.hypot(bSeesA.x - va.self.x, bSeesA.y - va.self.y));
    }

    // A monster both clients can see should have the same health in both.
    const bById = new Map(vb.monsters.map((m) => [m.id, m]));
    for (const m of va.monsters) {
      const other = bById.get(m.id);
      if (!other) continue;
      monsterAgreementChecks++;
      if (Math.abs(m.hp - other.hp) > 0) monsterDisagreements++;
    }
  }

  const [va, vb] = await Promise.all([view(a.page), view(b.page)]);
  const [pa, pb] = await Promise.all([probe(a.page), probe(b.page)]);
  console.log(`\nA sees: ${JSON.stringify(va.others)}`);
  console.log(`B sees: ${JSON.stringify(vb.others)}\n`);

  check("each client sees the other", sawEachOther);
  check(
    "A drew an actor for B",
    va.others.some((o) => o.name === B_NAME && o.hasActor),
    JSON.stringify(va.others.map((o) => ({ n: o.name, actor: o.hasActor }))),
  );
  check(
    "B drew an actor for A",
    vb.others.some((o) => o.name === A_NAME && o.hasActor),
    JSON.stringify(vb.others.map((o) => ({ n: o.name, actor: o.hasActor }))),
  );
  // A generous bound. Interpolation plus a snapshot interval is worth a couple
  // of hundred pixels; a desync is worth thousands and does not come back.
  check("A's view of B stayed bounded", maxGapA < 900, `worst gap ${Math.round(maxGapA)}px over ${gapSamples} samples`);
  check("B's view of A stayed bounded", maxGapB < 900, `worst gap ${Math.round(maxGapB)}px over ${gapSamples} samples`);
  check(
    "both clients agree on shared monster health",
    monsterDisagreements / Math.max(monsterAgreementChecks, 1) < 0.25,
    `${monsterDisagreements} disagreements in ${monsterAgreementChecks} comparisons`,
  );
  check("A has no console errors", a.page.__errors.length === 0, a.page.__errors.slice(0, 2).join(" | "));
  check("B has no console errors", b.page.__errors.length === 0, b.page.__errors.slice(0, 2).join(" | "));
  check("both still rendering", pa.drawCalls > 0 && pb.drawCalls > 0, `A=${pa.drawCalls} B=${pb.drawCalls}`);
  // Liveness, the same rule the other soaks follow: a run where nothing happened
  // certifies nothing.
  check("the run actually played", swings > 10 && gapSamples > 20, `swings=${swings} gapSamples=${gapSamples}`);

  console.log(`\nA: ${JSON.stringify(pa)}`);
  console.log(`B: ${JSON.stringify(pb)}`);
  console.log(`\n${failures === 0 ? "OK — two clients share one world" : `${failures} FAILURE(S)`}`);
  await a.browser.close();
  await b.browser.close();
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
