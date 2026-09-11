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

import { open, login, hotbarKeys, step, nearestMonster, keysToward, insideTown, gateWaypoint, approach } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const MINUTES = Number(process.argv[3] ?? 10);

const SPAWN = { x: 8000, y: 6000 };
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

  // THE ECONOMY. Nothing a player owns may go negative or stop being a number,
  // and nothing may quietly grow while they are asleep. These are cheap to check
  // and cover the whole of forge, salvage, refine, etch and craft from the one
  // place their results all land — which is a lot of untested surface for four
  // comparisons.
  const wallets = [
    ["wallet", g.wallet],
    ["runes", g.runes],
  ];
  for (const [label, bag] of wallets) {
    if (!bag || typeof bag !== "object") continue;
    for (const [key, value] of Object.entries(bag)) {
      if (!Number.isFinite(value)) say(`${label}.${key} is not finite`, String(value));
      else if (value < 0) say(`${label} went negative`, `${key}=${value}`);
      else if (!Number.isInteger(value)) say(`${label} is fractional`, `${key}=${value}`);
    }
  }
  if (Array.isArray(g.recipes)) {
    const seen = new Set();
    for (const r of g.recipes) {
      if (seen.has(r)) say("duplicate recipe learned", String(r));
      seen.add(r);
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
  // Deaths counted in the page, off the flag the defeat message sets — see the
  // note at the counter read below for why not from the aftermath. Held for
  // DEATH_HOLD_MS (1500) against this quarter-second tick, so no edge is missed.
  await page.evaluate(() => {
    const g = window.__wieldbound;
    window.__deaths = 0;
    let was = false;
    setInterval(() => {
      const dying = !!g.dying;
      if (dying && !was) window.__deaths++;
      was = dying;
    }, 250);
  });
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
  let blocked = 0;
  let travelled = 0;
  let salvages = 0;
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
      // Gate-aware AND obstacle-aware, from the shared driver — this file had
      // the gate half inline and still walked into the furniture.
      const moved = await approach(page, wp, 600, sign);
      travelled += moved;
      await check();
      if (moved < 25) {
        blocked++;
        sign = -sign;
      }
    }
    const fightUntil = Date.now() + 25000;
    while (Date.now() < fightUntil) {
      const t = await nearestMonster(page);
      if (t && t.d > 240) {
        travelled += await approach(page, t, 600);
        await check();
        continue;
      }
      swings++;
      // SALVAGE SOMETHING NOW AND THEN, so the economy checks above are checking
      // something. A bot that only swings never forges, salvages, refines or
      // etches, so every wallet invariant would pass by never being exercised —
      // the same "0 violations, 0 swings" trap the liveness check exists for,
      // one level down. It also keeps the bag from filling, which is what a
      // player does with a bag full of loot.
      if (swings % 25 === 0) {
        const result = await page.evaluate(() => {
          const g = window.__wieldbound;
          const { ITEM_BASES } = window.__wieldboundRules;
          // Never the equipped kit, and never the last of anything — salvage
          // refuses an equipped item and that refusal is not what is under test.
          const spare = g.items.find((it) => !it.equipped && ITEM_BASES[it.baseId]);
          if (!spare) return null;
          const before = { items: g.items.length, wallet: { ...g.wallet } };
          g.socket.sendSalvageItem(spare.id);
          return { id: spare.id, before };
        });
        if (result) {
          salvages++;
          await page.waitForTimeout(700);
          const after = await page.evaluate(
            (id) => {
              const g = window.__wieldbound;
              return {
                stillThere: g.items.some((it) => it.id === id),
                items: g.items.length,
                wallet: { ...g.wallet },
              };
            },
            result.id,
          );
          if (after.stillThere) {
            const rec = violations.get("salvaged item is still in the bag") ?? { count: 0, first: null, snap: null };
            rec.count++;
            rec.first ??= result.id;
            violations.set("salvaged item is still in the bag", rec);
          }
          // Taking something apart must not take materials away with it.
          for (const [k, v] of Object.entries(after.wallet)) {
            if (v < (result.before.wallet[k] ?? 0)) {
              const rec = violations.get("salvage reduced a material") ?? { count: 0, first: null, snap: null };
              rec.count++;
              rec.first ??= `${k}: ${result.before.wallet[k]} -> ${v}`;
              violations.set("salvage reduced a material", rec);
            }
          }
        }
      }
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
      // number of deaths.
      //
      // This used to read the aftermath instead: health risen to about half the
      // pool, within 400px of the arrival point. That is a good deal safer than
      // the plain "health went up" the sister harnesses used — it survived
      // potions, which those did not — but it is still describing a death by
      // what it leaves behind, and every clause is a fact about the respawn rule
      // that can be retuned. Half becomes two thirds, the arrival point moves,
      // and the counter quietly reads zero.
      //
      // The server says "defeated" on the wire and `dying` is the client
      // repeating it, so the rising edge is the event itself.
      deaths = await page.evaluate(() => window.__deaths ?? 0);
      lastHp = snap.hp;
    }

    if (Date.now() >= nextReport) {
      nextReport += 60000;
      const snap = await check();
      console.log(
        `t=${((Date.now() - t0) / 60000).toFixed(1)}m checks=${checks} swings=${swings} deaths=${deaths} ` +
          `blocked=${blocked} salvaged=${salvages} travelled=${Math.round(travelled)}px ` +
          `violations=${[...violations.values()].reduce((s, v) => s + v.count, 0)} ${JSON.stringify(snap)}`,
      );
    }
  }

  const minutes = (Date.now() - t0) / 60000;
  console.log(
    `\n=== ${checks} checks over ${minutes.toFixed(1)}m, ${swings} swings, ${deaths} deaths, ` +
      `${Math.round(travelled)}px travelled, ${blocked} blocked legs, ${salvages} salvaged ===`,
  );

  // DID THIS RUN ACTUALLY PLAY THE GAME? A soak that finds nothing because the
  // character was stuck against a fence reports exactly the same "no invariant
  // violations" as a soak that found nothing because the game is correct, and
  // the two are worth opposite amounts. One run really did sit in a corner for
  // seven of its eight minutes: swings frozen at 28, health pinned at 60/60,
  // the geometry count unchanged to the unit. Nothing about the violation list
  // hinted at it.
  //
  // So the run certifies itself or it does not. A character that fights and
  // travels is exercising the code these invariants describe; one that does
  // neither has tested nothing, whatever the violation count says.
  const swingsPerMin = swings / Math.max(minutes, 0.1);
  const pxPerMin = travelled / Math.max(minutes, 0.1);
  const void_ = swingsPerMin < 3 || pxPerMin < 2000;
  if (void_) {
    console.log(
      `\n*** RUN VOID — ${swingsPerMin.toFixed(1)} swings/min and ${Math.round(pxPerMin)}px/min travelled.\n` +
        "*** The character was stuck, not the game quiet. Findings below prove nothing either way.",
    );
  } else {
    console.log(`liveness ok: ${swingsPerMin.toFixed(1)} swings/min, ${Math.round(pxPerMin)}px/min`);
  }

  if (violations.size === 0) {
    console.log(void_ ? "no invariant violations (but see above)" : "no invariant violations");
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
