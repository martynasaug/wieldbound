// WHAT A WORN GARMENT IS ACTUALLY MADE OF, in the running game.
//
//   node tools/soak/garmentmat.mjs
//
// The Wizard's robe renders vivid blue and gold; the Warrior's plate and the
// Ranger's leather come out nearly black. The donors are steel grey and teal
// green (`tools/art/body_shot.py`), and all four garment files carry their own
// atlas with metalness 0 and no base-colour factor — so the colour is being lost
// somewhere between the file and the frame, and guessing which end has now cost
// two renders. Rendering the GLB alone in Blender did not settle it either: the
// data is Z-up and Blender's glTF importer assumes Y-up, so that shot was of a
// model lying on its back, lit edge-on, and dark for reasons of its own.
//
// This asks the material the game is actually drawing with.
import { open, login } from "./driver.mjs";

const STYLES = ["robe", "plate", "leather", "chain"];

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Gmt${Date.now() % 100000}`);
await page.waitForTimeout(2200);

const rows = await page.evaluate(async (styles) => {
  const g = window.__wieldbound;
  const a = g.localActor;
  const out = [];

  for (const style of styles) {
    a.setAppearance({ layers: { armor: { style, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1300));

    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (!/^worn_/.test(o.name)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (seen.has(m.uuid)) continue;
        seen.add(m.uuid);
        // THE MAP'S OWN PIXELS, averaged, so "has a texture" is distinguished
        // from "has a texture that is nearly black". A material can carry a map
        // and still draw dark if the atlas region it samples is dark.
        let painted = "?";
        const img = m.map?.image;
        if (img?.width) {
          try {
            const c = document.createElement("canvas");
            c.width = 48; c.height = 48;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0, 48, 48);
            const d = ctx.getImageData(0, 0, 48, 48).data;
            let r = 0, gg = 0, b = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
            const h = (v) => Math.round(v / n).toString(16).padStart(2, "0");
            painted = n ? "#" + h(r) + h(gg) + h(b) : "?";
          } catch { painted = "blocked"; }
        }
        out.push(
          `${style.padEnd(9)} ${o.name.padEnd(16)} color #${m.color?.getHexString() ?? "??????"}` +
            ` map ${m.map ? "yes" : "NO "} atlas ${painted}` +
            ` metal ${(m.metalness ?? -1).toFixed(2)} rough ${(m.roughness ?? -1).toFixed(2)}` +
            ` space ${m.map?.colorSpace ?? "-"} flipY ${m.map?.flipY}`,
        );
      }
    });
    if (!seen.size) out.push(`${style.padEnd(9)} (no worn_ mesh — not a garment)`);
  }
  return out;
}, STYLES);

for (const r of rows) console.log(r);
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
