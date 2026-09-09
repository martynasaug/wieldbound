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

import { open, login, hotbarKeys, step, nearestMonster, keysToward, approach } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? ".";
const SHOTS = 8;
const SHOT_GAP_MS = 160;

const run = async () => {
  const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
  await login(page, NAME);
  const keys = await hotbarKeys(page);

  // THE CLOCK HAS TO START AT THE CELEBRATION, NOT AT THE SCREENSHOT.
  //
  // The frames below were labelled "+0ms, +160ms, ..." from the moment the POLL
  // noticed the level change — and the poll runs after a keypress and a
  // `page.screenshot`, each costing hundreds of milliseconds. So "+0ms" landed
  // well after the effect had begun, the counts trailed off early, and it read
  // exactly like a celebration being cut short: `playLevelUpFx` runs for about
  // 980ms and looked dead by 480. It is not. Fired in isolation it lives the
  // full second, and the actor is never replaced under it.
  //
  // Wrapped from out here rather than stamped inside `Game.ts`, because this is
  // a question about the harness and ship code should not carry a timestamp for
  // it.
  await page.evaluate(() => {
    const g = window.__wieldbound;
    const orig = g.playLevelUpFx.bind(g);
    g.playLevelUpFx = () => {
      window.__lvfxAt = performance.now();
      return orig();
    };
  });

  const levelNow = () => page.evaluate(() => window.__wieldbound.level);
  let level = await levelNow();
  console.log(`playing as ${NAME} at level ${level}, waiting for a level-up`);

  const deadline = Date.now() + 5 * 60000;
  let swings = 0;
  while (Date.now() < deadline) {
    const t = await nearestMonster(page);
    if (!t || t.d > 240) {
      if (t) await approach(page, t, 500);
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
                sinceFx: window.__lvfxAt ? Math.round(performance.now() - window.__lvfxAt) : null,
                // BOTH POOLS, AND THE LEVEL-UP IS IN THE SECOND ONE. This read
                // only `effects.live` while `playLevelUpFx` builds its pillar,
                // flash and nova through `skillFx` — so the numbers printed here
                // described ambient hit sparks and said nothing whatever about the
                // celebration. They went 3, 4, 0 across the first 320ms of a 980ms
                // effect, which reads exactly like a burst that never fires.
                liveEffects: g.effects?.live?.length ?? -1,
                liveSkillFx: g.skillFx?.live?.length ?? -1,
                // THE ACTOR IDENTITY, because `playLevelUpFx` cancels its own
                // burst when `this.localActor` is no longer the actor it started
                // with — so a re-dress mid-celebration silently drops half of it.
                actor: (() => {
                  const a = g.localActor;
                  if (!a) return null;
                  if (!a.__tag) a.__tag = Math.random().toString(36).slice(2, 7);
                  return a.__tag;
                })(),
              };
            });
            console.log(`  frame ${i} (+${state.sinceFx ?? "?"}ms since the effect began): ${JSON.stringify(state)}`);
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
