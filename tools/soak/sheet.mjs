// A CONTACT SHEET, BECAUSE TWELVE FILES IS NOT A COMPARISON.
//
//   node tools/soak/sheet.mjs <dir> [out.png] [columns]
//
// Judging a set of art means seeing it together. Opening twelve PNGs one after
// another compares each one against MEMORY of the last, which is exactly how a
// hairstyle that sits two centimetres low goes unnoticed: alone it looks like
// hair, and only beside the others does the row of crowns stop lining up.
//
// The page is laid out in the browser and photographed, which keeps this to a
// dozen lines and needs no image library — the repo carries no decoder, and
// adding one to tile some PNGs would be the wrong trade.
import { chromium } from "playwright";
import { readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
// Windows paths are backslashed, and hand-rolling "file:///" + a string
// replacement is how the previous line got mangled into a syntax error.
import { pathToFileURL } from "node:url";

const DIR = process.argv[2] ?? "tools/soak/shots/faces";
const OUT = process.argv[3] ?? `${DIR}/_sheet.png`;
const COLS = Number(process.argv[4] ?? 4);

const files = readdirSync(DIR).filter((f) => f.endsWith(".png") && !f.startsWith("_")).sort();
if (!files.length) {
  console.error(`no PNGs in ${DIR}`);
  process.exit(1);
}

// RELATIVE PATHS FROM A REAL FILE, not absolute `file://` URLs on a page built
// with `setContent`. That page has an `about:blank` origin, and Chromium refuses
// to let it load `file://` subresources — the first sheet came out as twelve
// broken-image icons, which reads at a glance like twelve failed renders rather
// than one blocked origin. The sheet is written into the same directory as the
// tiles and navigated to, so the browser is on a file origin and the images are
// simply neighbours.
const cells = files
  .map((f) => {
    const label = f.replace(/\.png$/, "");
    return `<figure><img src="${f}"><figcaption>${label}</figcaption></figure>`;
  })
  .join("");

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 14px; background: #16151a; font: 13px/1.3 system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(${COLS}, max-content); gap: 10px; }
  figure { margin: 0; }
  img { display: block; border: 1px solid #3a3740; }
  figcaption { color: #ddd8e0; padding-top: 4px; text-align: center; }
</style><div class="grid">${cells}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const sheetHtml = resolve(DIR, "_sheet.html");
writeFileSync(sheetHtml, html);
await page.goto(pathToFileURL(sheetHtml).href);
// The images are separate loads; screenshotting before they decode gives a
// sheet of empty frames, which looks like twelve broken renders rather than one
// impatient harness.
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);
const grid = page.locator(".grid");
writeFileSync(OUT, await grid.screenshot());
console.log(`${files.length} tiles -> ${OUT}`);
await browser.close();
// The scaffolding is not an artefact anyone wants left in the shots folder.
unlinkSync(sheetHtml);
