// EVERY ITEM IN THE CATALOGUE, EQUIPPED, ON THE CHARACTER.
//
// Asked for: "Show me what every item looks equipped." Not the preview grid —
// that stands items in a row on their own, which answers "what is this shape"
// and not "what does a player see". This equips each base item in its own slot,
// alone, and photographs the character wearing or holding it.
//
//   node tools/soak/catalogue.mjs [out] [slot|family ...]
//
// Two tiles per item: held things front and side (a blade is edge-on from one
// of them), worn things front and back (a cape is only itself from behind).
// One sheet per slot, because ninety items on one canvas is unreadable.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

const OUT = process.argv[2] ?? "tools/soak/shots/catalogue";
const FILTER = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });

// Rings are genuinely invisible when worn; everything else shows.
const WORN = new Set(["armor", "helm", "boots", "cape"]);
const bases = Object.values(ITEM_BASES).filter(
  (b) => (b.slot === "weapon" || b.slot === "offhand" || WORN.has(b.slot)),
);
const wanted = bases.filter(
  (b) => !FILTER.length || FILTER.includes(b.slot) || FILTER.includes(b.weaponType ?? "") || FILTER.includes(b.id),
);
if (!wanted.length) {
  console.error(`nothing matches ${FILTER.join(", ")}`);
  process.exit(1);
}

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`error: ${m.text()}`);
});
await login(page, `Cat${Date.now() % 100000}`);
// THE SAME BODY EVERY TIME, or two plates cannot be compared. This logs in as
// `Cat<clock>`, a new name each run, and `defaultLookFor` derives the skin tone
// from a hash OF THE NAME over eight tones spanning lightness 0.24 to 0.72. Two
// plates shot an hour apart came out on a dark character standing in shade and a
// pale one in open sun, which flattered the second and made the change look
// bigger than it was. Gear is judged AGAINST a body; if the body moves, nothing
// in the picture means anything. Pinned to the same look the art bench uses
// (`tools/soak/artcheck.mjs`), so a plate and a measurement describe one figure.
const PINNED_LOOK = { skin: "tan", build: "average", hair: "short", beard: "none", hairColor: "black" };
await page.evaluate((look) => {
  const g = window.__wieldbound;
  g.localActor.setLook(look);
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__catHold?.();
    render(s, c);
  };
}, PINNED_LOOK);
await page.waitForTimeout(1500);

// And prove it took: `setLook` returns early if the actor has no identity or no
// loaded instance yet, so asking for a look is not the same as wearing one.
{
  const got = await page.evaluate(() => window.__wieldbound.localActor.currentLook);
  const wrong = !got || Object.entries(PINNED_LOOK).some(([k, v]) => got[k] !== v);
  if (wrong) {
    console.error(`catalogue: the look did not pin — asked for ${JSON.stringify(PINNED_LOOK)},` +
      ` got ${JSON.stringify(got)}. Plates shot on different bodies cannot be compared.`);
    await browser.close();
    process.exit(1);
  }
  console.log(`body pinned: ${Object.entries(PINNED_LOOK).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

const groups = new Map();
for (const base of wanted) {
  const worn = WORN.has(base.slot);
  await page.evaluate(({ base, worn }) => {
    const a = window.__wieldbound.localActor;
    // Alone in its slot, so nothing else in the picture is doing the work.
    if (worn) {
      a.setAppearance({ layers: { [base.slot]: { style: base.style, rarity: "honed", palette: base.palette } } });
    } else if (base.slot === "offhand") {
      a.setAppearance({ offhandBaseId: base.id, offhandRarity: "honed", layers: {} });
    } else {
      a.setAppearance({ weaponType: base.weaponType, weaponRarity: "honed", weaponBaseId: base.id, layers: {} });
    }
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
      action.time = 0.25;
    }
    a.mixer.update(0.0001);
    a.mixer.timeScale = 0;
  }, {
    base: {
      id: base.id, slot: base.slot, style: base.style ?? null,
      weaponType: base.weaponType ?? null, palette: base.art.palette,
    },
    worn,
  });
  await page.waitForTimeout(1000);

  const tiles = [];
  for (const yaw of worn ? [0, Math.PI] : [0, Math.PI / 2]) {
    await page.evaluate((yaw) => {
      const g = window.__wieldbound;
      const a = g.localActor;
      g.__catHold = () => {
        const target = a.position.clone();
        target.y += 0.9;
        const f = a.heading + yaw;
        g.world.camera.position.set(target.x + Math.sin(f) * 3.2, target.y + 0.3, target.z + Math.cos(f) * 3.2);
        g.world.camera.lookAt(target);
      };
    }, yaw);
    await page.waitForTimeout(260);
    tiles.push((await page.screenshot({ clip: { x: 500, y: 140, width: 280, height: 520 } })).toString("base64"));
  }

  const key = base.slot === "weapon" ? `weapon-${base.weaponType}` : base.slot;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    label: base.name,
    note: base.slot === "weapon" || base.slot === "offhand" ? `band ${base.band}` : `${base.style} · band ${base.band}`,
    tiles,
  });
  console.log(`${key.padEnd(14)} ${base.name}`);
}

for (const [key, rows] of groups) {
  const sheet = await page.evaluate(async ({ rows, key }) => {
    const tileW = 200, tileH = 371, head = 30, perRow = 3;
    const cellW = tileW * 2 + 12;
    const canvas = document.createElement("canvas");
    canvas.width = perRow * cellW;
    canvas.height = 40 + Math.ceil(rows.length / perRow) * (tileH + head);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#15110d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f0dcaa";
    ctx.font = "22px Georgia";
    ctx.fillText(key.replace("-", ": "), 10, 28);
    for (const [i, row] of rows.entries()) {
      const x0 = (i % perRow) * cellW;
      const y0 = 40 + Math.floor(i / perRow) * (tileH + head);
      for (const [k, data] of row.tiles.entries()) {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        ctx.drawImage(img, x0 + k * tileW, y0 + head, tileW, tileH);
      }
      ctx.fillStyle = "#f0dcaa";
      ctx.font = "15px Georgia";
      ctx.fillText(row.label, x0 + 6, y0 + 17);
      ctx.fillStyle = "#b8a684";
      ctx.font = "12px monospace";
      ctx.fillText(row.note, x0 + 6, y0 + 29);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, { rows, key });
  writeFileSync(`${OUT}/${key}.png`, Buffer.from(sheet, "base64"));
  console.log(`sheet: ${OUT}/${key}.png  (${rows.length} items)`);
}

console.log(errors.length ? `page errors:\n  ${errors.slice(0, 3).join("\n  ")}` : "no page errors");
await browser.close();
