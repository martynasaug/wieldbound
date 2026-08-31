// CYCLING GRAPHICS QUALITY, REPEATEDLY, WHILE PLAYING.
//
// This is the path M70.148's fix most affects and the one with the worst history.
// `setQuality` warms the new level by compiling the WHOLE SCENE — the call that
// once produced a 15,087ms frame, and the call whose unguarded readiness poll
// was hanging the loading screen until `compileSafely` replaced it. A change to
// that poll deserves to be exercised on the path that hammers it rather than
// only on the one that runs once at startup.
//
// Switching quality also rebuilds and re-materials a good deal of the world, so
// doing it thirty times in a row is a reasonable leak probe as well: if
// anything is allocated per switch and never freed, thirty switches will show a
// slope that one switch cannot.
//
// Deliberately switched WHILE FIGHTING, because the note in `setQuality` says
// the actors standing there when the switch happens are most of the cost, and a
// test that switches in an empty field is testing the cheap case.

import { open, login, probe, hotbarKeys, step, nearestMonster, keysToward } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const SWITCHES = Number(process.argv[3] ?? 24);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const run = async () => {
  const { browser, page } = await open({ headless: true });
  await login(page, NAME);
  const keys = await hotbarKeys(page);

  // Get next to something, so every switch happens with actors on screen.
  for (let i = 0; i < 25; i++) {
    const t = await nearestMonster(page);
    if (t && t.d < 300) break;
    const p = await page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));
    if (!t) break;
    await step(page, keysToward(p, t), 700);
  }

  const before = await probe(page);
  console.log("before:", JSON.stringify(before));

  const seen = new Set();
  const slow = [];
  for (let i = 0; i < SWITCHES; i++) {
    // Fight through the switch rather than standing still for it.
    if (keys[0]) await page.keyboard.press(keys[0]);
    const t0 = Date.now();
    const level = await page.evaluate(() => {
      const q = window.__wieldbound.world.cycleQuality();
      return q.level ?? q.label ?? String(q);
    });
    // `setQuality` kicks off an asynchronous warm and `render` holds the last
    // frame while it runs, so the switch is not finished when the call returns.
    // Wait for the game to be drawing again before switching a second time —
    // otherwise this measures how fast a loop can call a function.
    await page.waitForFunction(() => !window.__wieldbound.world.qualityWarm, null, { timeout: 30000 });
    const ms = Date.now() - t0;
    seen.add(String(level));
    if (ms > 3000) slow.push(`${level} took ${ms}ms`);
    await step(page, [i % 2 ? "a" : "d"], 400);
  }

  const after = await probe(page);
  console.log("after: ", JSON.stringify(after));

  check("cycled through more than one level", seen.size > 1, `levels seen: ${[...seen].join(", ")}`);
  check("no switch took longer than three seconds", slow.length === 0, slow.slice(0, 4).join("; "));
  check("still rendering", after.drawCalls > 0, `drawCalls=${after.drawCalls}`);
  check("no console errors", page.__errors.length === 0, page.__errors.slice(0, 3).join(" | "));
  // Programs legitimately grow the first time each level is compiled, then must
  // stop: every level has been seen several times over by the end of the run.
  check(
    "shader programs are not still climbing after 24 switches",
    after.programs - before.programs < 220,
    `${before.programs} -> ${after.programs}`,
  );
  check(
    "geometry did not grow per switch",
    after.geometries - before.geometries < SWITCHES,
    `${before.geometries} -> ${after.geometries} over ${SWITCHES} switches`,
  );

  console.log(`\n${failures === 0 ? "OK — quality switching survives being hammered" : `${failures} FAILURE(S)`}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
