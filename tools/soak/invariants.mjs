// THINGS THAT MUST NEVER BE TRUE, CHECKED WHILE PLAYING.
//
// A soak that only watches counters finds leaks. It does not find a character
// with more health than its maximum, an item equipped that is not in the bag, or
// a position that has gone NaN — and those are the failures a player actually
// reports. This plays the game continuously and asserts a list of invariants
// several times a second, recording the first few violations of each kind with
// the state that produced them.
//
// WHY IT SAMPLES RATHER THAN HOOKS. Every one of these is a property of the
// state at rest, so it can be read from `__wieldbound` without instrumenting the
// game. The cost is that a violation lasting less than a sample interval is
// missed; the benefit is that the game under test is the game that ships.
//
// Headless: nothing here is timing-sensitive, so SwiftShader is fine and the
// backgrounding throttle cannot contaminate a boolean.

import { open, login, hotbarKeys, step, nearestMonster, keysToward } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const MINUTES = Number(process.argv[3] ?? 10);

const SPAWN = { x: 8000, y: 6000 };
// `PLAYER_ARRIVAL` in shared/town.ts: `at(150, 60)` from TOWN_CENTER, which is
// PLAYER_SPAWN. Where the server puts a defeated character.
const ARRIVAL = { x: SPAWN.x + Math.cos(Math.PI / 3) * 150, y: SPAWN.y + Math.sin(Math.PI / 3) * 150 };
const CAMPS = [
  [1320, 0], [1600, 45], [1900, 100], [1600, 135], [2000, 160], [1320, 180],
  [1900, 200], [1600, 225], [2450, 250], [1900, 280], [1600, 315], [2350, 310],
].map(([r, deg]) => {
  const a = (deg * Math.PI) / 180;
  return { x: SPAWN.x + Math.cos(a) * r, y: SPAWN.y + Math.sin(a) * r, r, deg };
});

/** Runs in the page. Returns a list of violated invariant names plus context. */
const CHECK = () => {
  const g = window.__wieldbound;
  const bad = [];
  const say = (name, detail) => bad.push({ name, detail });

  const { hp, maxHp, mana, maxMana, level, xp, playerX, playerY, items } = g;

  if (!Number.isFinite(playerX) || !Number.isFinite(playerY)) {
    say("position is not finite", `x=${playerX} y=${playerY}`);
  }
  if (playerX < 0 || playerX > 16000 || playerY < 0 || playerY > 12000) {
    say("position outside the world", `x=${Math.round(playerX)} y=${Math.round(playerY)}`);
  }
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp)) say("hp is not finite", `${hp}/${maxHp}`);
  else {
    // The bug M70 fixed twice: a gear change moves the ceiling and the current
    // value is left above it.
    if (hp > maxHp) say("hp above max", `${hp}/${maxHp} level=${level}`);
    if (hp < 0) say("hp below zero", `${hp}/${maxHp}`);
    if (maxHp <= 0) say("maxHp not positive", `${maxHp}`);
  }
  if (Number.isFinite(mana) && Number.isFinite(maxMana)) {
    if (mana > maxMana) say("mana above max", `${mana}/${maxMana}`);
    if (mana < 0) say("mana below zero", `${mana}/${maxMana}`);
  }
  if (!Number.isFinite(level) || level < 1) say("level invalid", `${level}`);
  if (!Number.isFinite(xp) || xp < 0) say("xp invalid", `${xp}`);

  if (Array.isArray(items)) {
    const ids = new Set();
    for (const it of items) {
      if (ids.has(it.id)) say("duplicate item id in bag", `${it.id} (${it.baseId})`);
      ids.add(it.id);
      if (!it.baseId) say("item with no baseId", JSON.stringify(it).slice(0, 80));
      if (it.equipped && !it.slot && !it.baseId) say("equipped item is incoherent", it.id);
    }
  }

  // NOT "a dead monster is still drawn". That was the first version of this and
  // it fired 86 times in three minutes against completely correct code: on death
  // the actor plays `die` and the CORPSE STAYS on the ground until the server
  // respawns it and `revive()` runs. Bodies lying where they fell is the design.
  let nanMonsters = 0;
  for (const v of g.monsters.values()) {
    const s = v.state;
    if (!s) continue;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) nanMonsters++;
    if (Number.isFinite(s.hp) && Number.isFinite(s.maxHp) && s.hp > s.maxHp) {
      say("monster hp above max", `${s.kind} ${s.hp}/${s.maxHp}`);
    }
  }
  if (nanMonsters) say("monster position not finite", `${nanMonsters} of them`);

  // Targeting a corpse, on the other hand, is genuinely wrong — the death
  // handler clears the lock for exactly that reason, so a lock that survives it
  // means the clearing was missed.
  if (g.lockedId) {
    const locked = g.monsters.get(g.lockedId);
    if (locked && (locked.dead || locked.state?.status !== "alive")) {
      say("locked onto a dead monster", `${g.lockedId} (${locked.kind})`);
    }
  }

  // THE WEAPON ON SCREEN MUST BE THE WEAPON EQUIPPED. Held meshes are named
  // `held_${baseId}`, so this is directly checkable, and it is the invariant
  // behind "weapons are displayed correctly after a swap". A rig rebuild is
  // asynchronous, so a mismatch is only reported once the actor is settled —
  // otherwise every swap would trip it for a frame.
  const equippedWeapon = Array.isArray(items)
    ? items.find((it) => it.equipped && it.slot === "weapon")
    : null;
  if (equippedWeapon && g.localActor?.loaded) {
    const held = [];
    g.localActor.root.traverse((o) => {
      if (o.name?.startsWith("held_")) held.push(o.name.slice(5));
    });
    // An offhand is legitimately a second held mesh, so this only asserts that
    // the equipped weapon is AMONG what is drawn, not that it is alone.
    if (held.length > 0 && !held.includes(equippedWeapon.baseId)) {
      say("held weapon is not the equipped weapon", `equipped=${equippedWeapon.baseId} drawn=[${held.join(",")}]`);
    }
  }

  // The renderer should not be holding an ever-growing pile of anything while
  // the actor count is flat. Reported, not asserted — the threshold is a
  // judgement and this file is for things that are simply wrong.
  const info = g.world.renderer.info;
  return {
    bad,
    snap: {
      hp: Math.round(hp),
      maxHp: Math.round(maxHp),
      level,
      monsters: g.monsters.size,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
    },
  };
};

const me = (page) =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

const run = async () => {
  const { browser, page } = await open({ headless: true });
  await login(page, NAME);
  const keys = await hotbarKeys(page);
  console.log(`playing ${MINUTES}m as ${NAME}, checking invariants continuously`);

  const violations = new Map(); // name -> { count, first }
  let checks = 0;
  const check = async () => {
    const { bad, snap } = await page.evaluate(CHECK);
    checks++;
    for (const b of bad) {
      const rec = violations.get(b.name) ?? { count: 0, first: null, snap: null };
      rec.count++;
      if (!rec.first) {
        rec.first = b.detail;
        rec.snap = snap;
      }
      violations.set(b.name, rec);
    }
    return snap;
  };

  const t0 = Date.now();
  const endAt = t0 + MINUTES * 60000;
  let nextReport = t0 + 60000;
  let i = 0;
  let swings = 0;
  let deaths = 0;
  let lastHp = null;

  const first = await check();
  console.log("t=0.0m", JSON.stringify(first));

  while (Date.now() < endAt) {
    const wp = CAMPS[i++ % CAMPS.length];
    const travelUntil = Date.now() + 25000;
    let sign = 1;
    while (Date.now() < travelUntil) {
      const p = await me(page);
      if (Math.hypot(wp.x - p.x, wp.y - p.y) < 260) break;
      const dirs = keysToward(p, wp);
      const r = await step(page, dirs, 600);
      await check();
      if (r.moved < 25) {
        const perp = dirs.includes("w") || dirs.includes("s") ? [sign > 0 ? "d" : "a"] : [sign > 0 ? "s" : "w"];
        await step(page, perp, 900);
        sign = -sign;
      }
    }
    const fightUntil = Date.now() + 25000;
    while (Date.now() < fightUntil) {
      const t = await nearestMonster(page);
      if (t && t.d > 240) {
        const p = await me(page);
        await step(page, keysToward(p, t), 600);
        await check();
        continue;
      }
      swings++;
      const strafe = step(page, [swings % 2 ? "a" : "d"], 700);
      for (const k of keys) {
        await page.keyboard.press(k);
        await page.waitForTimeout(80);
      }
      await strafe;
      const snap = await check();
      // A death is worth counting: respawn is a path with its own bugs and a run
      // that never died has not tested it.
      //
      // NOT by watching for hp <= 0, which can never happen. `applyDamage` sets
      // the character straight back to `floor(maxHp / 2)` at PLAYER_ARRIVAL in
      // the same call that reports the defeat, so hp is never observed at zero
      // from outside — a counter watching for it reports `deaths=0` through any
      // number of deaths. The teleport is the visible part.
      if (lastHp !== null && snap.hp > lastHp && snap.hp <= Math.ceil(snap.maxHp / 2) + 1) {
        const p = await me(page);
        if (Math.hypot(p.x - ARRIVAL.x, p.y - ARRIVAL.y) < 400) deaths++;
      }
      lastHp = snap.hp;
    }

    if (Date.now() >= nextReport) {
      nextReport += 60000;
      const snap = await check();
      console.log(
        `t=${((Date.now() - t0) / 60000).toFixed(1)}m checks=${checks} swings=${swings} deaths=${deaths} ` +
          `violations=${[...violations.values()].reduce((s, v) => s + v.count, 0)} ${JSON.stringify(snap)}`,
      );
    }
  }

  console.log(`\n=== ${checks} checks over ${((Date.now() - t0) / 60000).toFixed(1)}m, ${swings} swings, ${deaths} deaths ===`);
  if (violations.size === 0) {
    console.log("no invariant violations");
  } else {
    for (const [name, rec] of [...violations.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`  ${String(rec.count).padStart(5)}x  ${name}`);
      console.log(`          first: ${rec.first}`);
      console.log(`          state: ${JSON.stringify(rec.snap)}`);
    }
  }
  console.log("console errors:", page.__errors.length);
  for (const e of page.__errors.slice(0, 10)) console.log("  ", e);
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
