// DOES THE CHARACTER MOVE AS FAST AS THE GAME SAYS IT DOES?
//
// Two numbers have to agree and they are computed on opposite sides of a
// socket: the client integrates position at its own `moveSpeed()`, and the
// server clamps each step against its own `moveSpeedOf()`. Both now call the
// shared `moveSpeedFor`, which is what makes them agree — and this checks that
// they still do, because the failure mode is silent and nasty. A server that
// computes a slower speed than the client rubber-bands honest players, and it
// bites the FASTEST characters first: the ones with the boots and the talents,
// which is to say the ones who earned the speed.
//
// This is also the regression that was actually shipped, not a hypothetical.
// Before `moveSpeedFor` existed, the client had TWO of these — the character
// sheet summed boots rarity and every passive while the code that moved the
// character passed neither — so a geared character ran 21-25% slower than its
// own sheet claimed. Nothing noticed for as long as those talents have existed,
// because nobody ever compared the promise with the walking.
//
//   node tools/soak/movecheck.mjs Player3619 Fighter Closer

import { open, login, step } from "./driver.mjs";

const NAMES = process.argv.slice(2);
const names = NAMES.length ? NAMES : ["Player3619"];

/** Below this, the server is clamping a client that is playing honestly. */
const MIN_RATIO = 0.9;
/** Above this, the client is outrunning what the game thinks it should. */
const MAX_RATIO = 1.15;

let problems = 0;
for (const name of names) {
  const { browser, page } = await open({ headless: true, width: 1000, height: 700 });
  try {
    await login(page, name);
    const computed = await page.evaluate(() => window.__wieldbound.moveSpeed());
    // Four directions, best of. Any one of them can be short because the
    // character walked into town furniture or a monster, and a floor on the
    // best is the question being asked; a floor on the average is a question
    // about where this character happens to be standing.
    let best = 0;
    for (const dirs of [["d"], ["a"], ["w"], ["s"]]) {
      const r = await step(page, dirs, 3000);
      best = Math.max(best, r.moved / 3);
    }
    const ratio = best / computed;
    const verdict =
      ratio < MIN_RATIO
        ? "SLOWER than it should be — the server is clamping honest play"
        : ratio > MAX_RATIO
          ? "FASTER than it should be — the client is outrunning its own stat"
          : "agrees";
    console.log(
      `${name.padEnd(12)} sheet ${computed.toFixed(0).padStart(4)} px/s, ` +
        `walked ${best.toFixed(0).padStart(4)} px/s  ${(ratio * 100).toFixed(0)}%  ${verdict}`,
    );
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) problems++;
  } finally {
    await browser.close();
  }
}

console.log(
  problems === 0
    ? "\nOK — every character walks at the speed its own stats promise."
    : `\n${problems} character(s) do not move at the speed the game claims.`,
);
process.exit(problems === 0 ? 0 : 1);
