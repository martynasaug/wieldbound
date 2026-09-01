// Crop and magnify a region of a screenshot, so a small piece of interface can
// actually be judged instead of squinted at.
//
// Exists because an element screenshot clips to the element's own box, and the
// minimap's ornaments deliberately stand OUTSIDE the ring — so the only way to
// see them is to take the whole frame and cut the corner out of it.
//
//   node tools/soak/crop.mjs in.png out.png x y w h [scale]

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [inPath, outPath, x, y, w, h, scale = "3"] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: crop.mjs in.png out.png x y w h [scale]");
  process.exit(1);
}
const X = Number(x ?? 0);
const Y = Number(y ?? 0);
const W = Number(w ?? 300);
const H = Number(h ?? 300);

// A data URI, not a file:// URL: an <img> inside  is on an
// about:blank origin and will not load a local file, which produced a
// perfectly black crop and a minute spent wondering why.
const url = "data:image/png;base64," + readFileSync(resolve(inPath)).toString("base64");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: Number(scale),
});
await page.setContent(
  `<body style="margin:0;background:#0b0906;overflow:hidden">
     <img src="${url}" style="position:absolute;left:${-X}px;top:${-Y}px">
   </body>`,
);
await page.waitForTimeout(500);
await page.screenshot({ path: outPath });
await browser.close();
console.log(`cropped ${W}x${H} at (${X},${Y}) x${scale} -> ${outPath}`);
