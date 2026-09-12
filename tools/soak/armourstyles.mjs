// EVERY ARMOUR STYLE, ONE AT A TIME, ON THE REAL CHARACTER.
//
// The preview sheet dresses whole outfits, which is the wrong question for
// "does this piece fit": a chest that has sunk into the ribs looks much the
// same as one that is merely dark, next to a helm and boots. This equips ONE
// style in ONE slot on an otherwise bare body and photographs it from the
// front, the side and behind, so a piece that is inside the body, floating off
// it, or the same shape as its neighbour has nowhere to hide.
//
//   node tools/soak/armourstyles.mjs [out] [slot|style ...]
//
// With no filter it shoots all nineteen styles. `ARMOUR_BIG=1` doubles the
// tiles for a closer look at one or two.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { GEAR_STYLES } from "../../shared/protocol-types.ts";

const OUT = process.argv[2] ?? "tools/soak/shots/armour";
const FILTER = process.argv.slice(3);
const BIG = process.env.ARMOUR_BIG === "1";
mkdirSync(OUT, { recursive: true });

// Which slot each style belongs to — the same grouping `GEAR_STYLES` is written
// in, named here because the shared list is a flat array of strings.
const SLOT_OF = {
  leather: "armor", chain: "armor", plate: "armor", robe: "armor", scale: "armor", brigandine: "armor",
  cap: "helm", hood: "helm", full: "helm", horned: "helm", circlet: "helm",
  low: "boots", tall: "boots", plated: "boots", wrapped: "boots",
  cape: "cape", cloak: "cape", mantle: "cape", tabard: "cape",
};

// A style is a SHAPE and a palette is what it is made of, so a style sheet has
// to pick one to photograph. These are the palette each style's most
// representative catalogue item uses, so the plate looks like something a
// player would actually find.
const PALETTE_OF = {
  leather: "wood", chain: "steel", plate: "steel", robe: "bone", scale: "bronze", brigandine: "crimson",
  cap: "iron", hood: "wood", full: "steel", horned: "bone", circlet: "gold",
  low: "wood", tall: "wood", plated: "steel", wrapped: "bone",
  cape: "crimson", cloak: "wood", mantle: "silver", tabard: "verdant",
};

const styles = GEAR_STYLES.filter(
  (s) => !FILTER.length || FILTER.includes(s) || FILTER.includes(SLOT_OF[s]),
);
if (!styles.length) {
  console.error(`nothing matches ${FILTER.join(", ")}`);
  process.exit(1);
}

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`error: ${m.text()}`);
});
await login(page, `Armour${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__armourHold?.();
    render(s, c);
  };
});
await page.waitForTimeout(1500);

// Front, side and BACK: a cape is only itself from behind, and a chest piece
// that stops at the ribs is only obvious in profile.
const VIEWS = [
  { label: "front", yaw: 0 },
  { label: "side", yaw: Math.PI / 2 },
  { label: "back", yaw: Math.PI },
];

const rows = [];
for (const style of styles) {
  const slot = SLOT_OF[style];
  await page.evaluate(({ slot, style, palette }) => {
    const a = window.__wieldbound.localActor;
    // One piece, nothing else: no weapon, no other layer.
    //
    // WITH A PALETTE, or every plate is a lie. Worn gear is painted from the
    // item's palette now, and a layer with none falls back to steel — so this
    // harness cheerfully photographed seventeen items as grey and I read the
    // greyness as the palette change having failed.
    a.setAppearance({ layers: { [slot]: { style, rarity: "honed", palette } } });
    if (!a.__realPlay) {
      a.__realPlay = a.play.bind(a);
      a.play = () => {};
    }
    a.mixer.stopAllAction();
    a.mixer.timeScale = 1;
    a.__realPlay("idle", true);
    const action = a.actions.get("idle");
    if (action) {
      a.mixer.stopAllAction();
      action.reset().setEffectiveWeight(1).play();
      action.time = 0.2;
    }
    a.mixer.update(0.0001);
    a.mixer.timeScale = 0;
  }, { slot, style, palette: PALETTE_OF[style] ?? "steel" });
  await page.waitForTimeout(1100);

  const tiles = [];
  for (const view of VIEWS) {
    await page.evaluate((view) => {
      const g = window.__wieldbound;
      const a = g.localActor;
      g.__armourHold = () => {
        const target = a.position.clone();
        // WHOLE FIGURE, HEAD TO BOOT. The first run framed the chest at 2.4m
        // and cut the head off half the tiles — which is no way to judge a helm.
        target.y += 0.9;
        const f = a.heading + view.yaw;
        g.world.camera.position.set(target.x + Math.sin(f) * 3.4, target.y + 0.35, target.z + Math.cos(f) * 3.4);
        g.world.camera.lookAt(target);
      };
    }, view);
    await page.waitForTimeout(300);
    tiles.push((await page.screenshot({ clip: { x: 490, y: 130, width: 300, height: 540 } })).toString("base64"));
  }
  console.log(`${slot.padEnd(6)} ${style}`);
  rows.push({ label: `${slot}: ${style}`, tiles });
}

const sheet = await page.evaluate(async ({ rows, big }) => {
  const tileW = big ? 400 : 220, tileH = big ? 620 : 341, head = 26;
  const perRow = big ? 1 : 2;
  const cellW = tileW * rows[0].tiles.length + 10;
  const canvas = document.createElement("canvas");
  canvas.width = perRow * cellW;
  canvas.height = Math.ceil(rows.length / perRow) * (tileH + head);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#15110d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, row] of rows.entries()) {
    const x0 = (i % perRow) * cellW;
    const y0 = Math.floor(i / perRow) * (tileH + head);
    for (const [k, data] of row.tiles.entries()) {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      ctx.drawImage(img, x0 + k * tileW, y0 + head, tileW, tileH);
    }
    ctx.fillStyle = "#f0dcaa";
    ctx.font = "15px Georgia";
    ctx.fillText(row.label, x0 + 6, y0 + 18);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}, { rows, big: BIG });

const name = FILTER.length ? `armour-${FILTER.join("-")}` : "armour";
writeFileSync(`${OUT}/${name}.png`, Buffer.from(sheet, "base64"));
console.log(errors.length ? `page errors:\n  ${errors.slice(0, 3).join("\n  ")}` : "no page errors");
console.log(`sheet: ${OUT}/${name}.png`);
await browser.close();
