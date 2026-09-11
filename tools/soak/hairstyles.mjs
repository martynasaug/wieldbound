// EVERY HAIRSTYLE, IN THE GAME, FROM EVERY SIDE.
//
// `tools/art/hair.py` renders each style in Blender, and those renders are how
// the shapes were judged — but they are not the game. This logs a character in,
// opens the creator on the REAL actor, and photographs each style as the game
// draws it: hung off the Head bone beside the beard, under the game's own
// lights, outline and camera. One contact sheet, one row per style, four views
// per row, so a style that sits wrong on the head is seen, not assumed.
//
//   node tools/soak/hairstyles.mjs [out]
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { HAIR_STYLE_IDS } from "../../shared/look.ts";

const OUT = process.argv[2] ?? "tools/soak/shots/hairstyles";
mkdirSync(OUT, { recursive: true });

// A colour that reads against the Monk's tan skin and the grey background, so
// the SHAPE is what the sheet shows.
const COLOR = "auburn";
const VIEWS = [
  ["front", 0],
  ["three-quarter", 0.8],
  ["side", Math.PI / 2],
  ["back", Math.PI],
];

// The creator frames for a widescreen window; the crop is measured at 1280x800.
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Styles${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.openCreator();
});
await page.waitForTimeout(1500);

const rows = [];
for (const style of HAIR_STYLE_IDS) {
  await page.evaluate(({ style, color }) => {
    const c = window.__wieldbound.creator;
    c.set("hair", style);
    c.set("hairColor", color);
    c.setTab("hair");
    c.zoomTarget = 0.85;
    c.zoom = 0.85;
  }, { style, color: COLOR });
  // The GLB loads on first use; wait until the mesh is actually on the head.
  await page.waitForFunction(
    (style) => {
      let found = false;
      window.__wieldbound.localActor.root.traverse((o) => { if (o.name === "look_hair") found = true; });
      return style === "none" ? !found : found;
    },
    style,
    { timeout: 15000 },
  ).catch(() => {});
  const worn = await page.evaluate(() => {
    let tris = 0;
    window.__wieldbound.localActor.root.traverse((o) => {
      if (o.name === "look_hair") tris = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    });
    return tris;
  });
  const tiles = [];
  for (const [, yaw] of VIEWS) {
    await page.evaluate((yaw) => { window.__wieldbound.creator.yaw = yaw; }, yaw);
    await page.waitForTimeout(450);
    tiles.push((await page.screenshot({ clip: { x: 720, y: 80, width: 460, height: 560 } })).toString("base64"));
  }
  rows.push({ style, tiles });
  console.log(`${style.padEnd(9)} ${worn ? `${worn} triangles on the head` : "no hair mesh"}`);
}

const sheet = await page.evaluate(async ({ rows, views }) => {
  const w = 230, h = 280, label = 22;
  const canvas = document.createElement("canvas");
  canvas.width = views.length * w;
  canvas.height = rows.length * (h + label);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1b140e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "15px Georgia";
  for (const [r, row] of rows.entries()) {
    const y = r * (h + label);
    for (const [c, data] of row.tiles.entries()) {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      ctx.drawImage(img, c * w, y + label, w, h);
    }
    ctx.fillStyle = "#f0dcaa";
    ctx.fillText(`${row.style}  —  ${views.join(" · ")}`, 6, y + 16);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}, { rows, views: VIEWS.map(([v]) => v) });

writeFileSync(`${OUT}/hairstyles.png`, Buffer.from(sheet, "base64"));
console.log(errors.length ? `page errors:\n  ${errors.join("\n  ")}` : "no page errors");
console.log(`sheet: ${OUT}/hairstyles.png`);
await browser.close();
