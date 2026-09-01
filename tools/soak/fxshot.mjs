// LOOK AT ONE EFFECT, ON ITS OWN.
//
// Catching a level-up in real play gives you a frame with a dead Golem, four
// crit numbers, three loot labels and a bag-full warning in it, and the thing
// you are trying to judge is somewhere underneath. The first attempt at this
// produced exactly that and was worth nothing.
//
// So walk somewhere quiet and fire the effect deliberately. `__wieldbound` is
// the whole Game, and TypeScript's `private` is a compile-time fiction, so the
// same method the level-up path calls can be called directly with nothing else
// happening on screen.
//
//   node tools/soak/fxshot.mjs Player3619 playLevelUpFx ./out

import { open, login, step, nearestMonster } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const METHOD = process.argv[3] ?? "playLevelUpFx";
const OUT = process.argv[4] ?? ".";
const SHOTS = 10;
const GAP_MS = 110;

const run = async () => {
  const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
  await login(page, NAME);

  // Get clear of anything that fights back, so the frame has one thing in it.
  for (let i = 0; i < 30; i++) {
    const t = await nearestMonster(page);
    if (!t || t.d > 1400) break;
    await step(page, ["w"], 700);
  }
  const where = await page.evaluate(() => ({
    x: Math.round(window.__wieldbound.playerX),
    y: Math.round(window.__wieldbound.playerY),
  }));
  const near = await nearestMonster(page);
  console.log(`at ${JSON.stringify(where)}, nearest monster ${near ? Math.round(near.d) + "px" : "none"}`);

  // Let the dust settle so nothing else is mid-animation.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${METHOD}-before.png` });

  const ok = await page.evaluate((m) => {
    const g = window.__wieldbound;
    if (typeof g[m] !== "function") return false;
    g[m]();
    return true;
  }, METHOD);
  if (!ok) {
    console.log(`no such method: ${METHOD}`);
    await browser.close();
    process.exit(1);
  }

  // NO SLEEP BETWEEN SHOTS, AND THE REAL ELAPSED TIME RECORDED.
  //
  // A `waitForTimeout(110)` between captures implies the frames are 110ms apart.
  // They are not: a headless screenshot costs several hundred milliseconds on
  // its own, so a "frame 4 (+440ms)" label was really somewhere past a second
  // and a half — well after the effect had finished. Two captures of the same
  // empty ground were compared as if they were 300ms apart.
  //
  // The screenshots pace themselves; what matters is saying WHEN each one
  // actually happened, so a frame can be matched to the phase it belongs to.
  const t0 = Date.now();
  for (let i = 0; i < SHOTS; i++) {
    const at = Date.now() - t0;
    await page.screenshot({ path: `${OUT}/${METHOD}-${String(i).padStart(2, "0")}.png` });
    console.log(`  frame ${String(i).padStart(2, "0")} taken at +${at}ms`);
  }
  console.log(`captured ${SHOTS} frames of ${METHOD}`);
  console.log("console errors:", page.__errors.length);
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
