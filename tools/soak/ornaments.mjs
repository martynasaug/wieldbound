// Renders the minimap once per ornament style, cropped and magnified, so the
// three can be compared instead of described.
//
//   node tools/soak/ornaments.mjs Player3619 ./out

import { open, login, step, nearestMonster, keysToward, insideTown, gateWaypoint } from "./driver.mjs";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? ".";
const STYLES = ["serpents", "ironwork", "both"];

const { browser, page } = await open({ headless: true, width: 1600, height: 900 });
await login(page, NAME);

// Somewhere with a bit of world behind the map, so the ornaments are seen
// against terrain rather than against a flat wall.
for (let i = 0; i < 30; i++) {
  const t = await nearestMonster(page);
  if (t && t.d < 400) break;
  const p = await page.evaluate(() => ({
    x: window.__wieldbound.playerX,
    y: window.__wieldbound.playerY,
  }));
  if (!t) { await step(page, ["w"], 700); continue; }
  const aim = insideTown(p) && !insideTown(t) ? gateWaypoint(p) : t;
  await step(page, keysToward(p, aim), 600);
}

for (const style of STYLES) {
  await page.evaluate((s) => window.__wieldbound.minimap.setOptions({ ornament: s }), style);
  await page.waitForTimeout(700);
  const full = `${OUT}/orn-${style}-full.png`;
  await page.screenshot({ path: full });

  // Crop the corner at 3x. Done in a second page rather than with an image
  // library because there is not one installed, and a browser is already here.
  const data = "data:image/png;base64," + readFileSync(full).toString("base64");
  const b2 = await chromium.launch({ headless: true });
  const p2 = await b2.newPage({ viewport: { width: 330, height: 310 }, deviceScaleFactor: 3 });
  await p2.setContent(
    `<body style="margin:0;background:#0b0906;overflow:hidden">
       <img src="${data}" style="position:absolute;left:-1262px;top:-4px"></body>`,
  );
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: `${OUT}/orn-${style}.png` });
  await b2.close();
  console.log(`${style} -> ${OUT}/orn-${style}.png`);
}

console.log("console errors:", page.__errors.length);
await browser.close();
