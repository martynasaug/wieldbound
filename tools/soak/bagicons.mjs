// WHAT THE BAG ACTUALLY LOOKS LIKE WITH THE CATALOGUE IN IT.
//
//   node tools/soak/bagicons.mjs [out.png]
//
// Added because "they all look the same" has now been reported twice about two
// different surfaces, and both times the answer turned on LOOKING at the
// surface rather than at the data behind it. `tools/test/itemicons.mjs` proves
// every item names a distinct picture; it cannot tell whether those pictures
// read as different things at 32 pixels, which is the size a bag draws them.
//
// So this fills the bag with one of everything held and photographs the panel.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

const OUT = process.argv[2] ?? "tools/soak/shots/bagicons.png";
mkdirSync(dirname(OUT), { recursive: true });

const held = Object.values(ITEM_BASES)
  .filter((b) => b.slot === "weapon" || b.slot === "offhand")
  .sort((a, b) => (a.weaponType ?? "zz").localeCompare(b.weaponType ?? "zz") || a.band - b.band);

const { browser, page } = await open({ headless: true, width: 1400, height: 950 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Bag${Date.now() % 100000}`);
await page.waitForTimeout(1500);

// THE PANEL IS NOT THE POINT, THE GLYPHS ARE. Filling a real bag means the cap,
// the server round trip and a scroll box; the icons are the thing under review,
// so they are drawn straight onto a grid built from the same module the panel
// uses. What this cannot catch is a layout fault in the bag itself — that is
// what the bag's own screenshots are for.
const grid = await page.evaluate((items) => {
  const icons = window.__wieldboundIcons;
  if (!icons) return { error: "no icon module on the debug handle" };
  const wrap = document.createElement("div");
  wrap.id = "icon-grid";
  wrap.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#14110d;padding:18px;" +
    "display:grid;grid-template-columns:repeat(10,1fr);gap:10px;overflow:auto;" +
    "font:11px/1.3 system-ui,sans-serif;color:#cbbf9d";
  let drawn = 0;
  for (const it of items) {
    const path = icons[it.icon];
    const cell = document.createElement("div");
    cell.style.cssText = "text-align:center";
    cell.innerHTML =
      `<svg viewBox="0 0 512 512" width="46" height="46" fill="currentColor"` +
      ` style="color:${it.tint}"><path d="${path ?? ""}"/></svg>` +
      `<div style="opacity:.75">${it.name}</div>`;
    if (path) drawn++;
    wrap.append(cell);
  }
  document.body.append(wrap);
  return { drawn, total: items.length };
}, held.map((b) => ({
  name: b.name,
  icon: b.icon,
  tint: { 1: "#9aa3ad", 2: "#8fb48a", 3: "#8aa6d6", 4: "#b99ad6", 5: "#d6b06a" }[b.band],
})));

if (grid.error) {
  console.log(grid.error);
} else {
  await page.waitForTimeout(400);
  const el = await page.$("#icon-grid");
  writeFileSync(OUT, await el.screenshot());
  console.log(`${grid.drawn} of ${grid.total} held items drew a glyph`);
  console.log(`sheet: ${OUT}`);
}
if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
