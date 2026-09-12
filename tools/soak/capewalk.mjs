// DOES THE CAPE MOVE WHEN THE CHARACTER DOES?
//
// Reported: capes "don't even have the cape animation when walking". A still
// plate cannot answer that — a cape at rest and a cape welded to the back look
// identical — so this photographs the SAME cape across successive frames of a
// run and puts them side by side. If the fall is stiff, every frame is the same
// picture; if it swings, the hem lags and settles.
//
// It also reports the numbers, because a swing of half a degree reads as
// nothing and looks like a bug: each link's rotation, and how far the hem
// travels between the first frame and the last.
//
//   node tools/soak/capewalk.mjs [style ...]
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";

const OUT = "tools/soak/shots/armour";
const STYLES = process.argv.slice(2).length ? process.argv.slice(2) : ["cape", "cloak"];
const PALETTE = { cape: "crimson", cloak: "wood", mantle: "silver", tabard: "verdant" };
const FRAMES = 5;
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Walk${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__walkHold?.();
    render(s, c);
  };
  const a = g.localActor;
  // Behind and a little to the side: a cape is a thing you see from behind.
  g.__walkHold = () => {
    const target = a.position.clone();
    target.y += 0.95;
    const f = a.heading + Math.PI * 0.82;
    g.world.camera.position.set(target.x + Math.sin(f) * 3.0, target.y + 0.45, target.z + Math.cos(f) * 3.0);
    g.world.camera.lookAt(target);
  };
});
await page.waitForTimeout(1500);

const rows = [];
for (const style of STYLES) {
  await page.evaluate(({ style, palette }) => {
    const a = window.__wieldbound.localActor;
    a.setAppearance({ layers: { cape: { style, rarity: "honed", palette } } });
  }, { style, palette: PALETTE[style] ?? "steel" });
  await page.waitForTimeout(1200);

  // MOVED, NOT MIMED. The swing is driven by how far the actor travels each
  // frame (see `Actor.lastSpeed`), so playing a run clip on the spot would
  // produce a perfectly still cape and a misleading picture. The actor is
  // walked along its heading by hand, one frame at a time.
  const tiles = [];
  const readings = [];
  for (let i = 0; i < FRAMES; i++) {
    const reading = await page.evaluate((step) => {
      const g = window.__wieldbound;
      const a = g.localActor;
      if (!a.__realPlay) {
        a.__realPlay = a.play.bind(a);
        a.play = () => {};
      }
      a.__realPlay("run", true);
      // Three metres a second, which is what running is here, applied as the
      // position change the cape reads.
      const dt = 1 / 30;
      a.root.position.x += Math.sin(a.heading) * 3.0 * dt;
      a.root.position.z += Math.cos(a.heading) * 3.0 * dt;
      a.position?.copy?.(a.root.position);
      a.update(dt);
      void step;
      return {
        speed: +(a.lastSpeed ?? 0).toFixed(2),
        swing: +(a.capeSwing ?? 0).toFixed(3),
        links: (a.capeLinks ?? []).map((j) => +j.rotation.x.toFixed(3)),
      };
    }, i);
    readings.push(reading);
    await page.waitForTimeout(120);
    tiles.push((await page.screenshot({ clip: { x: 470, y: 120, width: 340, height: 560 } })).toString("base64"));
  }

  console.log(`${style}:`);
  for (const [i, r] of readings.entries()) {
    console.log(`   frame ${i}  speed ${String(r.speed).padStart(5)}  lean ${String(r.swing).padStart(6)}  links ${JSON.stringify(r.links)}`);
  }
  rows.push({ label: `${style} — running, ${FRAMES} frames`, tiles });
}

const sheet = await page.evaluate(async (rows) => {
  const tileW = 220, tileH = 362, head = 28;
  const canvas = document.createElement("canvas");
  canvas.width = tileW * rows[0].tiles.length;
  canvas.height = rows.length * (tileH + head);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#15110d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [r, row] of rows.entries()) {
    const y0 = r * (tileH + head);
    for (const [k, data] of row.tiles.entries()) {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      ctx.drawImage(img, k * tileW, y0 + head, tileW, tileH);
    }
    ctx.fillStyle = "#f0dcaa";
    ctx.font = "16px Georgia";
    ctx.fillText(row.label, 6, y0 + 19);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}, rows);

writeFileSync(`${OUT}/capewalk.png`, Buffer.from(sheet, "base64"));
console.log(errors.length ? `page errors:\n  ${errors.slice(0, 3).join("\n  ")}` : "no page errors");
console.log(`sheet: ${OUT}/capewalk.png`);
await browser.close();
