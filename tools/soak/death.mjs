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
    // THE TELEPORT IS THE TELL, and nothing else is.
    //
    // The first version of this also required `s.hp < before.hp + 1`, on the
    // assumption that dying lowers your health. It does the opposite from
    // outside: `applyDamage` never leaves hp at zero, it writes
    // floor(maxHp / 2) in the same call that reports the defeat, so health
    // JUMPS UP at the moment of death. That condition could never be true and
    // the probe walked back to the camp and died repeatedly for four minutes
    // while reporting that it never died — with `weakened` sitting in the
    // status list the whole time.
    //
    // A jump from beyond 500px to within 300px of the arrival point in one
    // sample is a teleport: a level 1 covers about 120px in the 600ms between
    // samples and cannot fake it.
    const nearArrival = Math.hypot(s.x - ARRIVAL.x, s.y - ARRIVAL.y) < 300;
    const wasFarFromTown = Math.hypot(before.x - ARRIVAL.x, before.y - ARRIVAL.y) > 500;
    if (nearArrival && wasFarFromTown) {
      died = { before, after: s };
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
      await page.waitForTimeout(700);
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

  const after = died.after;
  console.log(`\ndied: ${JSON.stringify(died.before)}\n  ->  ${JSON.stringify(after)}\n`);

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
