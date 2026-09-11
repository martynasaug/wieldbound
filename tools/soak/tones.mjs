// EVERY SKIN TONE, SIDE BY SIDE.
//
// The tones were tuned one character at a time, and one at a time they looked
// fine. Side by side in the creator, porcelain and fair were grey statues; the
// first fix made them the same orange. Neither was visible without the whole
// palette on one sheet, so this writes two: the full figure and the face.
//
// JUDGE THE SHEET, not the numbers. The question is whether each tile reads as
// a person's skin and whether neighbours differ, and only a picture answers it.
//
//   node tools/soak/tones.mjs [out]
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { SKIN_TONE_IDS } from "../../shared/look.ts";

const OUT = process.argv[2] ?? "tools/soak/shots/tones";
mkdirSync(OUT, { recursive: true });

// The creator frames for a widescreen window; the crops are measured against
// 1280x800 and mean nothing at any other size.
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, `Tones${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.openCreator();
});
await page.waitForTimeout(1500);

const FRAMINGS = [
  ["body", 0, { x: 760, y: 150, width: 380, height: 540 }],
  ["face", 1, { x: 700, y: 110, width: 500, height: 640 }],
];

for (const [framing, zoom, clip] of FRAMINGS) {
  const tiles = [];
  for (const tone of SKIN_TONE_IDS) {
    await page.evaluate(({ tone, zoom }) => {
      const c = window.__wieldbound.creator;
      c.set("skin", tone);
      c.zoomTarget = zoom;
      c.zoom = zoom;
    }, { tone, zoom });
    await page.waitForTimeout(700);
    tiles.push({ label: tone, data: (await page.screenshot({ clip })).toString("base64") });
  }
  // Stitched in the page, which has a canvas, rather than pulling in an image library.
  const sheet = await page.evaluate(async (tiles) => {
    const w = 200, h = 290, cols = 4;
    const canvas = document.createElement("canvas");
    canvas.width = cols * w;
    canvas.height = Math.ceil(tiles.length / cols) * h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1b140e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [i, t] of tiles.entries()) {
      const img = new Image();
      img.src = `data:image/png;base64,${t.data}`;
      await img.decode();
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      ctx.drawImage(img, x, y, w, 266);
      ctx.fillStyle = "#f0dcaa";
      ctx.font = "15px Georgia";
      ctx.fillText(t.label, x + 6, y + 284);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, tiles);
  writeFileSync(`${OUT}/tones-${framing}.png`, Buffer.from(sheet, "base64"));
  console.log(`${OUT}/tones-${framing}.png`);
}
await browser.close();
