// DOES A FULL BAG STILL FLOOD THE COMBAT LOG?
//
// The "Bag is full" warning lives inside a per-tick sweep over every drop on the
// ground. Untrottled, that is ten lines a second PER DROP the player is standing
// on, which is what filled the log in a captured frame and pushed everything
// else out of it.
//
// This plays a seeded character — whose bag is already over the cap, because
// `tools/seed.mjs` writes items straight to the database without asking the cap
// about it — kills things until loot is on the ground, stands on it, and counts
// how many warnings arrive per minute.

import { open, login, hotbarKeys, step, nearestMonster, approach } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const MINUTES = Number(process.argv[3] ?? 3);

const { browser, page } = await open({ headless: true });
await login(page, NAME);
const keys = await hotbarKeys(page);

// Count the warnings as they land in the combat log, by watching the log's own
// DOM rather than the wire: what matters is what the player is made to read.
await page.evaluate(() => {
  window.__bagWarn = 0;
  const seen = new WeakSet();
  window.__bagWatch = setInterval(() => {
    for (const el of document.querySelectorAll("#combat-log div, .combat-log div, #log div")) {
      if (seen.has(el)) continue;
      seen.add(el);
      if ((el.textContent ?? "").includes("Bag is full")) window.__bagWarn++;
    }
  }, 60);
});

// WALK TO A CAMP FIRST. The first version of this just looked for the nearest
// monster and reported `0 warnings, 0 swings` as a pass — a test that proves
// nothing while printing OK, which is the single most common failure in this
// directory and the reason every soak here carries a liveness check.
const SPAWN = { x: 8000, y: 6000 };
const CAMP = { x: SPAWN.x + 1320, y: SPAWN.y };
let sign = 1;
for (let i = 0; i < 60; i++) {
  const t = await nearestMonster(page);
  if (t && t.d < 240) break;
  if (!(await approach(page, t ?? CAMP, 600, sign))) sign = -sign;
}

const t0 = Date.now();
let swings = 0;
let maxDrops = 0;
while (Date.now() - t0 < MINUTES * 60000) {
  const t = await nearestMonster(page);
  if (t && t.d > 240) {
    await approach(page, t, 600);
    continue;
  }
  swings++;
  for (const k of keys) {
    await page.keyboard.press(k);
    await page.waitForTimeout(70);
  }
  // Stand still on whatever dropped, which is the case that spammed.
  await page.waitForTimeout(1200);
  maxDrops = Math.max(maxDrops, await page.evaluate(() => window.__wieldbound.dropStates?.length ?? 0));
}

const warns = await page.evaluate(() => {
  clearInterval(window.__bagWatch);
  return window.__bagWarn;
});
const mins = (Date.now() - t0) / 60000;
const perMin = warns / mins;
console.log(`${warns} "Bag is full" lines over ${mins.toFixed(1)}m = ${perMin.toFixed(1)}/min (swings=${swings})`);
// One every six seconds is the throttle's own ceiling: ten a minute, and only
// while actually standing on loot that cannot be picked up.
// THE PRECONDITION, ASSERTED. Zero warnings means nothing only if the run
// actually fought, dropped loot and stood on it with a full bag.
const lively = swings >= 5 && maxDrops > 0;
console.log(`precondition: swings=${swings} maxDropsSeen=${maxDrops}`);
if (!lively) {
  console.log("RUN VOID — never fought or never saw loot; this proves nothing either way");
  await browser.close();
  process.exit(1);
}
console.log(perMin <= 12 ? "OK — the warning is throttled" : "FAIL — still flooding the log");
console.log("console errors:", page.__errors.length);
await browser.close();
process.exit(perMin <= 12 ? 0 : 1);
