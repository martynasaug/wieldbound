// EVERY WORN ITEM, ON THE BODY, FROM FOUR SIDES, BIG ENOUGH TO SEE.
//
//   node tools/soak/wearlook.mjs [slot ...]
//
// Told, after four rounds of fixing things by measurement: "ACTUALLY SEE HOW
// ITEMS SIT ON THE BODY, DON'T JUDGE FROM THE CODE ALONE."
//
// Correct, and the record backs it. A box test passed a helm with the temples
// through it. A ray test scored a hood at 29% on the head it was authored for.
// A registration matched a donor's depth ratio to the per-cent while the hood
// hung off the back of the skull. Every one of those numbers was right about
// what it measured and wrong about what was asked.
//
// The catalogue shoots front and back only, at a size where a bare patch at the
// armpit is four pixels. This shoots FOUR sides, close, and lays them out one
// row per style so a whole slot can be looked at in one picture — which is the
// only thing that has reliably found any of these faults.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { open, login } from "./driver.mjs";
import { HAIR_STYLE_IDS } from "../../shared/look.ts";

const OUT = "tools/soak/shots/wearlook";
mkdirSync(OUT, { recursive: true });

const SLOTS = {
  bare: [null],
  armor: ["leather", "chain", "plate", "robe", "scale", "brigandine"],
  helm: ["cap", "hood", "full", "horned", "circlet"],
  boots: ["low", "tall", "plated", "wrapped"],
  cape: ["cape", "cloak", "mantle", "tabard"],
};
const WANT = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SLOTS);

// Tall and narrow: a standing figure, head to heel, with no scenery to spare.
const SHOT = { x: 500, y: 60, width: 280, height: 660 };

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Look${Date.now() % 100000}`);
await page.waitForTimeout(2600);

// CHECKED AGAINST THE REAL LIST, not echoed back at itself.
//
// `catalogue.mjs` pinned `hair: "short"` and proved it had pinned by comparing
// the value to the value it had just set. `setLook` stores whatever it is
// handed, `HAIR_FILES` has no entry for "short", and so every review sheet this
// project has produced was shot on a BALD character — reported, repeatedly, as
// "spots of character skin", which is exactly what a bare skull looks like
// between two pauldrons.
const PINNED_LOOK = { skin: "tan", build: "average", hair: "shaggy", beard: "none", hairColor: "black" };
if (!HAIR_STYLE_IDS.includes(PINNED_LOOK.hair)) {
  console.error(
    `wearlook: hair "${PINNED_LOOK.hair}" is not a real style. ` +
    `Pick one of: ${HAIR_STYLE_IDS.join(", ")}`,
  );
  process.exit(1);
}

await page.evaluate((look) => {
  const g = window.__wieldbound;
  g.localActor.setLook(look);
  // Noon, so nothing is hidden in shade. Several earlier rounds were argued
  // about on shots taken at dusk.
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => { g.__lookHold?.(); render(s, c); };
}, PINNED_LOOK);
await page.waitForTimeout(1400);

// AND THE HAIR IS ON THE HEAD, which is the thing the id check cannot prove.
// A valid id whose file failed to load leaves the same bald skull.
{
  const strands = await page.evaluate(() => {
    const a = window.__wieldbound.localActor;
    const piece = a.lookPieces?.get?.("hair");
    return piece && piece.visible ? 1 : 0;
  });
  if (!strands) {
    console.error("wearlook: asked for hair and the body has none. Every shot would be of a bald head.");
    await browser.close();
    process.exit(1);
  }
}

const YAWS = [["front", 0], ["left", Math.PI / 2], ["back", Math.PI], ["right", -Math.PI / 2]];
const sheets = {};

for (const slot of WANT) {
  const styles = SLOTS[slot];
  if (!styles) { console.log(`no slot ${slot}`); continue; }
  const rows = [];
  for (const style of styles) {
    await page.evaluate(({ slot, style }) => {
      // PALETTE STEEL, and never a green one. A profile shot of a VERDANT hood
      // was diagnosed for a whole round against a tree standing behind the
      // character. Steel appears nowhere in this scenery.
      const a = window.__wieldbound.localActor;
      a.setAppearance({ layers: style ? { [slot]: { style, rarity: "honed", palette: "steel" } } : {} });
    }, { slot, style });
    await page.waitForTimeout(1600);
    const tiles = [];
    for (const [, yaw] of YAWS) {
      await page.evaluate((yaw) => {
        const g = window.__wieldbound;
        const a = g.localActor;
        if (a.mixer) {
          a.mixer.stopAllAction();
          const act = a.actions?.get("idle");
          if (act) { act.reset().setEffectiveWeight(1).play(); act.time = 0.25; }
          a.mixer.update(0.0001);
          a.mixer.timeScale = 0;
        }
        g.__lookHold = () => {
          const t = a.position.clone();
          t.y += 0.88;
          const f = a.heading + yaw;
          g.world.camera.position.set(t.x + Math.sin(f) * 3.5, t.y + 0.30, t.z + Math.cos(f) * 3.5);
          g.world.camera.lookAt(t);
        };
      }, yaw);
      await page.waitForTimeout(320);
      tiles.push((await page.screenshot({ clip: SHOT })).toString("base64"));
    }
    rows.push({ style, tiles });
    console.log(`${slot.padEnd(7)} ${style ?? "(nothing worn)"}`);
  }
  sheets[slot] = rows;
}
await browser.close();

// Laid out in a second browser, the way `catalogue.mjs` does it.
const shot = await chromium.launch({ headless: true });
for (const [slot, rows] of Object.entries(sheets)) {
  const p = await shot.newPage({ viewport: { width: 1200, height: 400 } });
  const html = `<style>
    body{margin:0;background:#14100c;font:13px ui-monospace,monospace;color:#d9c79a}
    .row{padding:6px 10px 14px}
    .name{padding:4px 0 6px;letter-spacing:.08em;text-transform:uppercase;color:#e5cfa0}
    .t{display:flex;gap:6px}
    img{display:block;width:280px;height:660px;image-rendering:auto}
    .lab{display:flex;gap:6px;color:#8d7c58;font-size:11px}
    .lab span{width:280px}
  </style>` + rows.map((r) => `
    <div class="row">
      <div class="name">${slot} — ${r.style ?? "nothing worn"}</div>
      <div class="t">${r.tiles.map((t) => `<img src="data:image/png;base64,${t}">`).join("")}</div>
      <div class="lab">${YAWS.map(([n]) => `<span>${n}</span>`).join("")}</div>
    </div>`).join("");
  await p.setContent(html);
  await p.waitForTimeout(400);
  const h = await p.evaluate(() => document.body.scrollHeight);
  await p.setViewportSize({ width: 1200, height: Math.min(h, 20000) });
  await p.screenshot({ path: `${OUT}/${slot}.png`, fullPage: true });
  console.log(`sheet ${OUT}/${slot}.png`);
  await p.close();
}
await shot.close();
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
