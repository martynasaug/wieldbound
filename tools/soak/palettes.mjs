// ONE STYLE, EVERY PALETTE — does an item look like the item it is?
//
//   node tools/soak/palettes.mjs [style] [out]
//
// `armourstyles.mjs` photographs one style in ONE palette, which answers "does
// this piece fit" and cannot answer "does a Gilded Plate look different from a
// Blackened one". For most of the catalogue that question had an obvious yes —
// procedural items are built from named materials and `repaint` hands each one a
// colour. For the three garment styles it had a silent no: a costume is one
// painted surface with no seams to hand a colour to, so `robe`, `plate` and
// `leather` rendered identically across all thirteen palettes and nobody had
// looked.
//
// The character stands still and only the palette changes, so any difference in
// the picture is the palette and nothing else.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";

const STYLE = process.argv[2] ?? "plate";
const OUT = process.argv[3] ?? "tools/soak/shots/palettes";
mkdirSync(OUT, { recursive: true });

const SLOT_OF = {
  leather: "armor", chain: "armor", plate: "armor", robe: "armor", scale: "armor", brigandine: "armor",
  cap: "helm", hood: "helm", full: "helm", horned: "helm", circlet: "helm",
  low: "boots", tall: "boots", plated: "boots", wrapped: "boots",
  cape: "cape", cloak: "cape", mantle: "cape", tabard: "cape",
};
const slot = SLOT_OF[STYLE];
if (!slot) {
  console.error(`no such style ${STYLE}`);
  process.exit(1);
}

// A spread across the wheel rather than all thirteen: if these six do not
// differ, thirteen will not either, and six fits on a sheet you can read.
const PALETTES = ["steel", "gold", "crimson", "verdant", "obsidian", "frost"];

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await login(page, `Pal${Date.now() % 100000}`);

await page.evaluate((hour) => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(hour);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => { g.__hold?.(); render(s, c); };
  const a = g.localActor;
  g.__hold = () => {
    const target = a.position.clone();
    target.y += 0.85;
    // FRONT, matching armourstyles: heading + PI was its BACK view, and the
    // first run of this harness compared six palettes from behind.
    const f = a.heading;
    g.world.camera.position.set(target.x + Math.sin(f) * 3.5, target.y + 0.35, target.z + Math.cos(f) * 3.5);
    g.world.camera.lookAt(target);
  };
  // Held still: the idle animation would move the cloth between shots and every
  // pair would differ for a reason that is not the palette.
  if (!a.__realPlay) {
    a.__realPlay = a.play.bind(a);
    a.play = () => {};
  }
  a.mixer.stopAllAction();
  a.__realPlay("idle", true);
  const action = a.actions.get("idle");
  if (action) {
    a.mixer.stopAllAction();
    action.reset().setEffectiveWeight(1).play();
    action.time = 0.2;
  }
  a.mixer.update(0.0001);
  a.mixer.timeScale = 0;
// HANDED OVER, not closed over: this callback runs in the browser.
}, 0.45);
await page.waitForTimeout(1600);

const tiles = [];
for (const palette of PALETTES) {
  await page.evaluate(({ slot, style, palette }) => {
    window.__wieldbound.localActor.setAppearance({
      layers: { [slot]: { style, rarity: "honed", palette } },
    });
  }, { slot, style: STYLE, palette });
  // A garment's atlas is recoloured on a canvas the first time a palette is
  // worn, so the first frame after a change can still be the old texture.
  await page.waitForTimeout(1400);
  tiles.push({ palette, data: (await page.screenshot({ clip: { x: 500, y: 120, width: 290, height: 560 } })).toString("base64") });
  console.log(`${STYLE} ${palette}`);
}

const sheet = await page.evaluate(async ({ tiles, style }) => {
  const w = 290, h = 560, head = 24;
  const canvas = document.createElement("canvas");
  canvas.width = w * tiles.length;
  canvas.height = h + head;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#15110d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, tile] of tiles.entries()) {
    const img = new Image();
    img.src = `data:image/png;base64,${tile.data}`;
    await img.decode();
    ctx.drawImage(img, i * w, head, w, h);
    ctx.fillStyle = "#f0dcaa";
    ctx.font = "14px Georgia";
    ctx.fillText(`${style}: ${tile.palette}`, i * w + 6, 17);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}, { tiles, style: STYLE });

writeFileSync(`${OUT}/${STYLE}.png`, Buffer.from(sheet, "base64"));
console.log(errors.length ? `errors: ${errors.slice(0, 3).join(" | ")}` : "no page errors");
console.log(`sheet: ${OUT}/${STYLE}.png`);
await browser.close();
