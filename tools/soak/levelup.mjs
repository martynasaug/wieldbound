// WATCH A LEVEL-UP, FRAME BY FRAME.
//
// The whole of the current celebration is one billboard from the effects atlas
// (`holy`, 900ms) drawn at the character's chest, plus a toast, a log line and a
// sound. There is no pose, no build, and nothing that reads at a glance as "that
// character just became stronger" — the same sprite is used for a heal.
//
// This plays until the character levels, then captures a burst of frames across
// the effect's lifetime so it can be LOOKED AT rather than reasoned about from
// the source. A seeded endgame character levels roughly once a minute while
// fighting, so it does not take long.

import { open, login, hotbarKeys, step, nearestMonster, keysToward } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? ".";
const SHOTS = 8;
const SHOT_GAP_MS = 160;

const run = async () => {
  const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
  await login(page, NAME);
  const keys = await hotbarKeys(page);

  const levelNow = () => page.evaluate(() => window.__wieldbound.level);
  let level = await levelNow();
  console.log(`playing as ${NAME} at level ${level}, waiting for a level-up`);

  const deadline = Date.now() + 5 * 60000;
  let swings = 0;
  while (Date.now() < deadline) {
    const t = await nearestMonster(page);
    if (!t || t.d > 240) {
      const p = await page.evaluate(() => ({
        x: window.__wieldbound.playerX,
        y: window.__wieldbound.playerY,
      }));
      if (t) await step(page, keysToward(p, t), 500);
      else await step(page, ["w"], 600);
    } else {
      swings++;
      for (const k of keys) {
        await page.keyboard.press(k);
        await page.waitForTimeout(60);
        const next = await levelNow();
        if (next !== level) {
          // Caught it. Everything from here is the celebration.
          console.log(`\nlevel ${level} -> ${next}. capturing ${SHOTS} frames:`);
          for (let i = 0; i < SHOTS; i++) {
            await page.screenshot({ path: `${OUT}/levelup-${String(i).padStart(2, "0")}.png` });
            const state = await page.evaluate(() => {
              const g = window.__wieldbound;
              return {
                anim: g.localActor?.currentAnim ?? null,
                liveEffects: g.effects?.live?.length ?? -1,
              };
            });
            console.log(`  frame ${i} (+${i * SHOT_GAP_MS}ms): ${JSON.stringify(state)}`);
            await page.waitForTimeout(SHOT_GAP_MS);
          }
          console.log("\nconsole errors:", page.__errors.length);
          await browser.close();
          return;
        }
      }
    }
  }
  console.log(`no level-up in five minutes (swings=${swings}) — the fixture is wrong, not the game`);
  await browser.close();
  process.exit(1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
