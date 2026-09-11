// EVERY ITEM, AS THE GAME DRAWS IT, ON ONE PAGE PER SLOT.
//
// The preview page (`client/preview/`) already dresses real actors through the
// real `Actor.setAppearance`, sheet by sheet. This photographs the sheets whole,
// so the catalogue can be judged the way a player meets it — and so a remake can
// be put side by side with what it replaced.
//
//   node tools/soak/itemsheets.mjs [out] [sheet ...]
//
// Sheets: weapons, offhand, armour, full. Defaults to the first three.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "tools/soak/shots/items";
const SHEETS = process.argv.slice(3).length ? process.argv.slice(3) : ["weapons", "offhand", "armour"];
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
});

for (const sheet of SHEETS) {
  const page = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:5173/preview/?sheet=${sheet}`, { waitUntil: "networkidle" });
  // The sheet builds every actor asynchronously — models, gear and materials all
  // load and compile — and a screenshot on "networkidle" catches an empty grid.
  // Generous and fixed, because a probe that decides the page is "done" early
  // photographs bodies with nothing on them and calls it the catalogue.
  await page.waitForTimeout(sheet === "weapons" ? 22000 : 15000);
  const size = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
  await page.screenshot({ path: `${OUT}/${sheet}.png`, fullPage: true });
  console.log(`${sheet}: ${size.w}x${size.h} -> ${OUT}/${sheet}.png${errors.length ? `  !! ${errors[0].slice(0, 160)}` : ""}`);
  await page.close();
}
await browser.close();
