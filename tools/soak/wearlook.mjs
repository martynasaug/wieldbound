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

const ARMOR = ["leather", "chain", "plate", "robe", "scale", "brigandine"];
const HELM = ["cap", "hood", "full", "horned", "circlet"];
const BOOTS = ["low", "tall", "plated", "wrapped"];
const CAPE = ["cape", "cloak", "mantle", "tabard"];

const SLOTS = {
  bare: [null],
  armor: ARMOR,
  helm: HELM,
  boots: BOOTS,
  cape: CAPE,
};

const worn = (style) => (style ? { style, rarity: "honed", palette: "steel" } : undefined);
const pick = (list, i) => list[i % list.length];

// ITEMS WORN TOGETHER, WHICH IS HOW THEY ARE ACTUALLY WORN.
//
// Asked for after four rounds of single-slot fixes: "check how one equipped
// item looks with other equipped item at the same time." Every fault found so
// far has been a piece against the BODY; a piece against another PIECE has
// never once been looked at, and that is where a helm meets a collar, a cape
// meets a pauldron and a skirt meets a boot.
//
// Not the full cross product — six armours by five helms by four boots by four
// capes is four hundred and eighty outfits. These are the pairs that can
// actually collide, plus one full set per armour so every style is worn at
// least once alongside every other kind of thing.
const COMBOS = {
  // Every armour, fully dressed, cycling the other slots so all styles appear.
  sets: ARMOR.map((armor, i) => ({
    label: `${armor} + ${pick(HELM, i)} + ${pick(CAPE, i)} + ${pick(BOOTS, i)}`,
    layers: {
      armor: worn(armor), helm: worn(pick(HELM, i)),
      cape: worn(pick(CAPE, i)), boots: worn(pick(BOOTS, i)),
    },
  })),
  // THE NECK, where a helm's rim, an armour's collar and a cape's clasp all
  // land within a few units of each other.
  neck: ARMOR.map((armor) => ({
    label: `hood + ${armor}`,
    layers: { armor: worn(armor), helm: worn("hood") },
  })),
  // THE BACK AND SHOULDERS: a cape hangs from the torso and the armour has
  // pauldrons on the same bones.
  backs: [
    ...CAPE.map((cape) => ({
      label: `${cape} + chain`,
      layers: { armor: worn("chain"), cape: worn(cape) },
    })),
    // AND A TABARD OVER A GARMENT, which is the one pairing `overlap.mjs`
    // flags: a tabard is a panel worn ON the chest, so it shares space with
    // the chest piece by definition. The question a box cannot answer is
    // whether it is in FRONT of the plate or inside it.
    { label: "tabard + plate", layers: { armor: worn("plate"), cape: worn("tabard") } },
  ],
  // THE HEM AND THE SHIN: the plate skirt and the robe's gown reach the thigh,
  // and a tall boot comes up to meet them.
  check: [{ label: "plate + hood", layers: { armor: worn("plate"), helm: worn("hood") } }, { label: "robe + hood", layers: { armor: worn("robe"), helm: worn("hood") } }],
  hems: BOOTS.map((boots) => ({
    label: `${boots} + plate`,
    layers: { armor: worn("plate"), boots: worn(boots) },
  })),
};

const WANT = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [...Object.keys(SLOTS), ...Object.keys(COMBOS)];

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
  // A sheet is either one slot's styles, or a list of whole outfits.
  const single = SLOTS[slot];
  const outfits = single
    ? single.map((style) => ({
        label: style ?? "nothing worn",
        layers: style ? { [slot]: worn(style) } : {},
      }))
    : COMBOS[slot];
  if (!outfits) { console.log(`no slot or combo named ${slot}`); continue; }
  const rows = [];
  for (const outfit of outfits) {
    await page.evaluate((layers) => {
      // PALETTE STEEL, and never a green one. A profile shot of a VERDANT hood
      // was diagnosed for a whole round against a tree standing behind the
      // character. Steel appears nowhere in this scenery.
      window.__wieldbound.localActor.setAppearance({ layers });
    }, outfit.layers);
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
    rows.push({ style: outfit.label, tiles });
    console.log(`${slot.padEnd(7)} ${outfit.label}`);
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
