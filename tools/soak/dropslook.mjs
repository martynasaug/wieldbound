// WHAT THE NEW RULES ACTUALLY LOOK LIKE ON A TOOLTIP.
//
//   node tools/soak/dropslook.mjs [out-dir]
//
// `tools/test/drops.mjs` proves the ceiling holds and that every off-hand has a
// rule. It cannot tell whether a player would ever FIND OUT — the whole design
// is two new lines of text on a hover, and two lines of text can be the wrong
// colour, clipped by the panel, stacked on top of the quality line, or simply
// absent because a CSS class was never styled. Every one of those looks exactly
// like a working build from the data side.
//
// So this puts one of each interesting case in the bag and photographs the
// hover: a plain item that stops at Tempered, a scarce one already sitting at
// its ceiling, an off-hand with its rule, and a fabled weapon with both.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { ITEM_BASES, rollItem, maxRarityFor, scarcityOf, traitOf } from "../../shared/items.ts";

const OUT = process.argv[2] ?? "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

let seed = 3;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// One of each case the tooltip now has to say something different about.
const CASES = [
  ["common-midway", "ironcap", "worn"],
  ["common-capped", "ironcap", "tempered"],
  ["scarce-capped", "longsword", "forged"],
  ["offhand-trait", "stormlantern", "honed"],
  ["fabled-topped", "claymore", "enchanted"],
];

const items = CASES.map(([label, baseId, rarity], i) => {
  const base = ITEM_BASES[baseId];
  if (!base) throw new Error(`no base ${baseId}`);
  console.log(
    `  ${label.padEnd(15)} ${base.name.padEnd(22)} ${scarcityOf(base).padEnd(7)}` +
    ` cap ${maxRarityFor(base).padEnd(10)} ${traitOf(base)?.name ?? "—"}`,
  );
  return { id: `look-${i}`, equipped: false, ...rollItem(base, rarity, rand) };
});

const { browser, page } = await open({ headless: true, width: 1400, height: 950 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Drop${Date.now() % 100000}`);
await page.waitForTimeout(1200);

// Straight into the panel rather than through the server. The subject under
// review is the tooltip, and a real drop of an Enchanted claymore is now, by
// design, something you would have to kill about twelve thousand things for.
await page.evaluate((list) => {
  const g = window.__wieldbound;
  g.inventoryPanel.setItems(list);
  if (!g.inventoryPanel.isOpen) g.inventoryPanel.toggle();
}, items);
await page.waitForTimeout(600);

const cells = await page.$$(".bag-slot");
console.log(`\n  ${cells.length} bag cells found`);

for (let i = 0; i < CASES.length && i < cells.length; i++) {
  await cells[i].hover();
  await page.waitForTimeout(350);
  const tip = await page.$("#item-tooltip");
  const box = await tip.boundingBox();
  const shown = await page.evaluate(() => {
    const el = document.getElementById("item-tooltip");
    if (!el || getComputedStyle(el).display === "none") return null;
    const read = (sel) => {
      const n = el.querySelector(sel);
      return n ? { text: n.textContent, color: getComputedStyle(n).color } : null;
    };
    return {
      title: read(".tt-title"),
      sub: read(".tt-sub"),
      scarcity: read(".tt-scarcity"),
      traitHead: read(".tt-trait-head"),
      trait: read(".tt-trait"),
      // Clipping is the failure a screenshot of the panel would hide, because
      // the tooltip would simply look shorter than it is.
      clipped: el.scrollHeight > el.clientHeight + 1,
    };
  });
  const name = CASES[i][0];
  if (!shown) {
    console.log(`  ${name.padEnd(15)} NO TOOLTIP`);
    continue;
  }
  writeFileSync(`${OUT}/drops-${name}.png`, await page.screenshot({
    clip: {
      x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8),
      width: Math.min(box.width + 16, 1400), height: Math.min(box.height + 16, 950),
    },
  }));
  console.log(`  ${name.padEnd(15)} ${shown.title?.text}`);
  console.log(`  ${"".padEnd(15)}   ${shown.sub?.text}`);
  console.log(`  ${"".padEnd(15)}   ${shown.scarcity?.text ?? "NO SCARCITY LINE"} [${shown.scarcity?.color ?? "-"}]`);
  console.log(`  ${"".padEnd(15)}   ${shown.traitHead ? `${shown.traitHead.text}: ${shown.trait?.text}` : "(no trait)"}`);
  if (shown.clipped) console.log(`  ${"".padEnd(15)}   CLIPPED`);
}

console.log(`\n  shots: ${OUT}/drops-*.png`);
// --- and what the forge says about the ones it will not take ----------------
//
// The ceiling's one hard surface. A capped item simply VANISHES from the
// reforge list, and a missing row reads as a bug rather than as a rule - which
// is the failure the note exists to prevent, and which only a look can confirm.
await page.evaluate((list) => {
  const g = window.__wieldbound;
  if (g.inventoryPanel.isOpen) g.inventoryPanel.toggle();
  g.craftPanel.setItems(list);
  g.craftPanel.tab = "reforge";
  g.craftPanel.open("probe");
}, items);
await page.waitForTimeout(700);
const forge = await page.evaluate(() => ({
  notes: [...document.querySelectorAll(".smith-note")].map((n) => n.textContent),
  rows: [...document.querySelectorAll(".craft-row-step")].map((n) => n.textContent).slice(0, 8),
}));
console.log("");
console.log("  forge, reforge tab:");
for (const n of forge.notes) console.log(`    note: ${n}`);
for (const r of forge.rows) console.log(`    row:  ${r}`);
const panel = await page.$("#craft-panel");
if (panel) writeFileSync(`${OUT}/drops-forge.png`, await panel.screenshot());

if (errors.length) console.log("  page errors:", errors.slice(0, 3));
await browser.close();
