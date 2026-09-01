// DEATH AND RESPAWN, which nothing else here can reach.
//
// Every other harness in this directory drives a seeded endgame character, and
// that character does not die — 395 swings across fifteen minutes at level 133
// produced exactly zero deaths. So the entire defeat path has been running
// untested: the teleport home, the health it comes back with, the Weakened
// debuff, the experience penalty, the cancelled attack order and cast, and
// whether the game is still playable afterwards.
//
// A FRESH NAME IS THE FIXTURE. A character that has never logged in starts at
// level 1 with no gear, which is precisely what is needed and needs no seeding —
// `tools/seed.mjs` refuses an unknown name anyway. It walks to the nearest
// band-1 camp and stands in it.
//
// What is asserted is what `handlePlayerDeath` and `applyDamage` promise:
// respawn at PLAYER_ARRIVAL with floor(maxHp / 2), Weakened applied, experience
// not increased across the death, and the character able to move and fight after.

import { open, login, probe, step } from "./driver.mjs";

const NAME = process.argv[2] ?? `Faller${Math.floor(Math.random() * 100000)}`;
const SPAWN = { x: 8000, y: 6000 };
const ARRIVAL = {
  x: Math.round(SPAWN.x + Math.cos(Math.PI / 3) * 150),
  y: Math.round(SPAWN.y + Math.sin(Math.PI / 3) * 150),
};
// Band 1, the closest pack to town and the only one a level 1 can reach before
// something else finds them.
const CAMP = { x: SPAWN.x + 1320, y: SPAWN.y };

const SHOT_FELL = process.argv[3] ?? "death-fell.png";
const SHOT_ARRIVED = process.argv[4] ?? "death-arrived.png";
const SHOT_SETTLED = process.argv[5] ?? "death-settled.png";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const state = (page) =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    return {
      x: Math.round(g.playerX),
      y: Math.round(g.playerY),
      hp: Math.round(g.hp),
      maxHp: Math.round(g.maxHp),
      level: g.level,
      xp: g.xp,
      statuses: (g.statusBar?.active ?? []).map((s) => s.id ?? s.status ?? String(s)),
      casting: !!g.castingSkill,
    };
  });

const run = async () => {
  const { browser, page } = await open({ headless: true });
  await login(page, NAME);
  const start = await state(page);
  console.log(`logged in as ${NAME}: ${JSON.stringify(start)}`);
  check("starts at level 1 with no seeded gear", start.level === 1, `level=${start.level}`);

  // Walk east to the band-1 camp and stand in it until something kills us.
  console.log(`\nwalking to the band-1 camp at (${CAMP.x}, ${CAMP.y}) and standing in it`);
  const deadline = Date.now() + 240000;
  let died = null;
  let before = start;
  let sign = 1;
  while (Date.now() < deadline && !died) {
    const s = await state(page);
    // THE HEALTH JUMP IS THE TELL NOW, not the teleport.
    //
    // Two revisions here, both worth keeping. The first required health to FALL
    // at the moment of death; it does the opposite from outside, because
    // `applyDamage` writes floor(maxHp / 2) in the same call that reports the
    // defeat, so a death looks like a heal. That version walked back into the
    // camp and died repeatedly for four minutes while reporting no deaths.
    //
    // The second keyed on the teleport home, which worked until the teleport
    // stopped being instant: the body now lies where it fell for
    // `DEATH_HOLD_MS` before arriving. The defeat itself is the health jump, and
    // that is what the sequence below is timed from.
    // EXACTLY half, and a big step. `s.hp > before.hp && s.hp <= half` was the
    // first attempt and it was too loose the moment the sampling got fast
    // enough to be accurate: passive regeneration ticks a few points at a time,
    // so at 120ms intervals it caught a heal from 10 to 12 and reported a death
    // with no Weakened status and 12/60 health. `applyDamage` writes precisely
    // `floor(maxHp / 2)`, and no regen tick moves five points at once.
    const jumped = s.hp === Math.floor(s.maxHp / 2) && s.hp - before.hp >= 5;
    const wasFarFromTown = Math.hypot(before.x - ARRIVAL.x, before.y - ARRIVAL.y) > 500;
    if (jumped && wasFarFromTown) {
      const diedAt = Date.now();
      const fellAt = { x: s.x, y: s.y };
      // WHERE IS THE BODY DURING THE FALL? This is the whole fix: it must still
      // be out in the field, not standing on the respawn tile in town.
      await page.screenshot({ path: SHOT_FELL });
      const duringFall = await state(page);
      // Then wait for the arrival and time it.
      let arrived = null;
      while (Date.now() - diedAt < 6000) {
        const now = await state(page);
        if (Math.hypot(now.x - ARRIVAL.x, now.y - ARRIVAL.y) < 300) {
          arrived = { at: Date.now() - diedAt, state: now };
          break;
        }
        await page.waitForTimeout(100);
      }
      await page.screenshot({ path: SHOT_ARRIVED });
      // AND ONE AFTER THE DUST SETTLES. The arrival shot is taken on the frame
      // the position first reads as home, which is the frame of the `snapTo` —
      // the camera has not caught up and the actor may still be in its fallen
      // pose. A character that never stands back up, or never reappears at all,
      // would look exactly like that in a single frame and is worth ruling out.
      await page.waitForTimeout(1500);
      await page.screenshot({ path: SHOT_SETTLED });
      const settled = await page.evaluate(() => {
        const g = window.__wieldbound;
        const a = g.localActor;
        return {
          visible: !!a?.root?.visible,
          anim: a?.currentAnim ?? null,
          actorX: a ? Math.round(a.position.x) : null,
          actorZ: a ? Math.round(a.position.z) : null,
          camX: Math.round(g.world.camera.position.x),
          camZ: Math.round(g.world.camera.position.z),
        };
      });
      died = { before, after: s, fellAt, duringFall, arrived, settled };
      break;
    }
    const dx = CAMP.x - s.x;
    const dy = CAMP.y - s.y;
    const dirs = [];
    if (Math.abs(dx) > 60) dirs.push(dx > 0 ? "d" : "a");
    if (Math.abs(dy) > 60) dirs.push(dy > 0 ? "s" : "w");
    if (dirs.length === 0) {
      // Standing in the camp. Do nothing and let it happen — no attacking, so
      // the fight is as one-sided as possible.
      //
      // SAMPLED FAST, because the moment of death is the zero point for timing
      // the fall. At 700ms between samples the defeat was noticed up to 700ms
      // late and a 1500ms hold measured as 977ms — a failing assertion about a
      // working game, which is the wrong way round.
      await page.waitForTimeout(120);
    } else {
      const r = await step(page, dirs, 600);
      if (r.moved < 20) {
        await step(page, [sign > 0 ? "s" : "w"], 800);
        sign = -sign;
      }
    }
    before = s;
  }

  if (!died) {
    console.log("\nFAIL — never died within four minutes; the fixture is wrong, not the game");
    console.log("last:", JSON.stringify(await state(page)));
    await browser.close();
    process.exit(1);
  }

  const after = died.arrived?.state ?? died.after;
  console.log(`\ndied at (${died.fellAt.x}, ${died.fellAt.y})`);
  console.log(`during the fall: ${JSON.stringify(died.duringFall)}`);
  console.log(`arrived: ${died.arrived ? `${died.arrived.at}ms later, ${JSON.stringify(died.arrived.state)}` : "NEVER"}\n`);

  // THE SEQUENCE, which is the thing that was wrong. The body must still be out
  // where it was killed while the death animation plays, and only then appear at
  // the arrival point. Before this, both happened on the same frame and the
  // death animation played standing on the respawn tile in town.
  const fellFromTown = Math.hypot(died.duringFall.x - ARRIVAL.x, died.duringFall.y - ARRIVAL.y);
  check(
    "the body stays where it fell during the death animation",
    fellFromTown > 500,
    `${Math.round(fellFromTown)}px from the arrival point while dying`,
  );
  check("it does arrive eventually", !!died.arrived, died.arrived ? "" : "never reached the arrival point");
  check(
    "the fall lasts about as long as the hold",
    !!died.arrived && died.arrived.at >= 1000 && died.arrived.at <= 4000,
    `${died.arrived?.at ?? "-"}ms between the defeat and the arrival`,
  );

  check(
    "respawns at the arrival point",
    Math.hypot(after.x - ARRIVAL.x, after.y - ARRIVAL.y) < 300,
    `at (${after.x}, ${after.y}), arrival is (${ARRIVAL.x}, ${ARRIVAL.y})`,
  );
  check(
    "comes back on half health",
    after.hp === Math.floor(after.maxHp / 2),
    `${after.hp}/${after.maxHp}, expected ${Math.floor(after.maxHp / 2)}`,
  );
  check("health is not above the maximum", after.hp <= after.maxHp, `${after.hp}/${after.maxHp}`);
  check(
    "is Weakened",
    after.statuses.some((s) => String(s).toLowerCase().includes("weak")),
    `statuses=[${after.statuses.join(",")}]`,
  );
  console.log(`settled: ${JSON.stringify(died.settled)}`);
  check("the character is visible again after respawning", died.settled.visible, JSON.stringify(died.settled));
  check("it is not stuck in the death pose", died.settled.anim !== "die", `anim=${died.settled.anim}`);
  check("no cast survives the death", !after.casting);
  check(
    "experience did not increase across the death",
    after.xp <= died.before.xp,
    `${died.before.xp} -> ${after.xp}`,
  );

  // And the half that matters most: is it still a game afterwards?
  const moved = await step(page, ["w"], 1200);
  check("can still move after respawning", moved.moved > 30, `moved ${moved.moved.toFixed(0)}px`);
  const late = await probe(page);
  check("world still rendering", late.drawCalls > 0, `drawCalls=${late.drawCalls}`);
  check("no console errors", page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));

  console.log(`\n${failures === 0 ? "OK — death and respawn behave" : `${failures} FAILURE(S)`}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
