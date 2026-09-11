// BARE HANDS, AND WHATEVER IS WORN ON THEM.
//
// Asked for: "Remove the gloves from player character model. Gloves (fists)
// should be another weapon type." This photographs the hands close up — the
// back of the right hand, the side of the forearm, the whole figure — across
// three skin tones, empty-handed or wearing a fist weapon, onto one sheet, so
// a cuff that still flares or a glove that floats off the knuckles is seen.
//
//   node tools/soak/hands.mjs [out] [fist-item-id ...]
//
// With no ids it shoots bare hands; each id adds a row wearing that item.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";

const OUT = process.argv[2] ?? "tools/soak/shots/hands";
const ITEMS = [null, ...process.argv.slice(3)];
const TONES = ["porcelain", "olive", "ebony"];
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Hands${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__handsHold?.();
    render(s, c);
  };
});
await page.waitForTimeout(1500);

// Close views aim at the right fist bone; the last is the whole figure.
const VIEWS = [
  { label: "back of hand", bone: "FistR", yaw: 0.9, dist: 0.75, lift: 0.15 },
  { label: "forearm", bone: "LowerArmR", yaw: Math.PI / 2, dist: 0.9, lift: 0.05 },
  { label: "figure", bone: null, yaw: 0.35, dist: 2.8, lift: 0.3 },
];

const rows = [];
for (const item of ITEMS) {
  for (const tone of TONES) {
    await page.evaluate(async ({ item, tone }) => {
      const g = window.__wieldbound;
      const a = g.localActor;
      a.setLook({ ...a.currentLook, skin: tone });
      a.setAppearance(item ? { weaponType: "fist", weaponRarity: "honed", weaponBaseId: item, layers: {} } : { layers: {} });
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
    }, { item, tone });
    await page.waitForTimeout(1200);
    const tiles = [];
    for (const view of VIEWS) {
      await page.evaluate((view) => {
        const g = window.__wieldbound;
        const a = g.localActor;
        g.__handsHold = () => {
          const target = a.position.clone();
          target.y += 1.0;
          if (view.bone) {
            a.root.traverse((o) => { if (o.isBone && o.name === view.bone) o.getWorldPosition(target); });
          }
          const f = a.heading + view.yaw;
          g.world.camera.position.set(target.x + Math.sin(f) * view.dist, target.y + view.lift, target.z + Math.cos(f) * view.dist);
          g.world.camera.lookAt(target);
        };
      }, view);
      await page.waitForTimeout(300);
      tiles.push((await page.screenshot({ clip: { x: 390, y: 150, width: 500, height: 500 } })).toString("base64"));
    }
    rows.push({ label: `${item ?? "bare hands"} — ${tone}`, tiles });
  }
}

const sheet = await page.evaluate(async (rows) => {
  const tile = 300, head = 24;
  const canvas = document.createElement("canvas");
  canvas.width = tile * rows[0].tiles.length;
  canvas.height = rows.length * (tile + head);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#15110d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [r, row] of rows.entries()) {
    const y0 = r * (tile + head);
    for (const [k, data] of row.tiles.entries()) {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      ctx.drawImage(img, k * tile, y0 + head, tile, tile);
    }
    ctx.fillStyle = "#f0dcaa";
    ctx.font = "14px Georgia";
    ctx.fillText(row.label, 6, y0 + 17);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}, rows);

const name = ITEMS.length > 1 ? `hands-${ITEMS.slice(1).join("-")}` : "hands";
writeFileSync(`${OUT}/${name}.png`, Buffer.from(sheet, "base64"));
console.log(errors.length ? `page errors:\n  ${errors.slice(0, 3).join("\n  ")}` : "no page errors");
console.log(`sheet: ${OUT}/${name}.png`);
await browser.close();
