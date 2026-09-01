// A close-up of one piece of interface, on its own.
//
// A full 1280x800 frame shows the minimap about 180px across in a corner, which
// is not enough to judge how it looks. This screenshots a single element at a
// device scale factor, so the thing under review fills the picture.
//
//   node tools/soak/uishot.mjs Player3619 "#minimap" ./out/minimap.png
//
// The optional fourth argument walks somewhere first, because a map with nothing
// on it says nothing about how it displays things: "camp" heads for the nearest
// monsters, "town" heads for Emberhold.

import { open, login, step, nearestMonster, keysToward, insideTown, gateWaypoint } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const SELECTOR = process.argv[3] ?? "#minimap";
const OUT = process.argv[4] ?? "ui.png";
const GO = process.argv[5] ?? "";

const SPAWN = { x: 8000, y: 6000 };

const run = async () => {
  const { browser, page } = await open({ headless: true, width: 1600, height: 900 });
  await login(page, NAME);

  if (GO === "camp") {
    for (let i = 0; i < 40; i++) {
      const t = await nearestMonster(page);
      if (t && t.d < 260) break;
      const p = await page.evaluate(() => ({
        x: window.__wieldbound.playerX,
        y: window.__wieldbound.playerY,
      }));
      if (!t) { await step(page, ["w"], 700); continue; }
      const aim = insideTown(p) && !insideTown(t) ? gateWaypoint(p) : t;
      await step(page, keysToward(p, aim), 600);
    }
  } else if (GO === "town") {
    for (let i = 0; i < 60; i++) {
      const p = await page.evaluate(() => ({
        x: window.__wieldbound.playerX,
        y: window.__wieldbound.playerY,
      }));
      if (Math.hypot(p.x - SPAWN.x, p.y - SPAWN.y) < 260) break;
      await step(page, keysToward(p, SPAWN), 600);
    }
  }

  const where = await page.evaluate(() => ({
    x: Math.round(window.__wieldbound.playerX),
    y: Math.round(window.__wieldbound.playerY),
  }));
  const near = await nearestMonster(page);
  console.log(`at ${JSON.stringify(where)}, nearest monster ${near ? Math.round(near.d) + "px" : "none"}`);

  await page.waitForTimeout(900);
  const el = page.locator(SELECTOR);
  if ((await el.count()) === 0) {
    console.log(`no element matches ${SELECTOR}`);
    await browser.close();
    process.exit(1);
  }
  const box = await el.first().boundingBox();
  console.log(`${SELECTOR} is ${Math.round(box?.width ?? 0)}x${Math.round(box?.height ?? 0)}`);
  await el.first().screenshot({ path: OUT });
  console.log("wrote", OUT);
  console.log("console errors:", page.__errors.length);
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
