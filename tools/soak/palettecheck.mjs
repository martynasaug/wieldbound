// DOES A WORN PIECE ACTUALLY TAKE ITS ITEM'S PALETTE?
//
// Reported: armour "blended in with the body". The cause was that worn gear was
// painted from four hard-coded colours instead of the item's palette, the way a
// weapon always has been. This proves the fix from the other end: it equips
// real catalogue ITEMS that share a shape and differ in material — Plate Mail
// against Gilded Plate, Scale Mail against Blackglass Mail — and prints the
// colour each piece resolves to. Same shape, different colours, or the change
// did nothing.
//
//   node tools/soak/palettecheck.mjs [itemId ...]
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

// Pairs that share a SHAPE and differ in material, which is the whole question:
// plate in steel against plate in gold, scale in bronze against scale in
// obsidian, leather in bronze against leather in verdant, robe in wood against
// robe in frost.
const DEFAULT = [
  "platemail", "gildedplate", "scalemail", "blackglassmail", "dragonscale",
  "leatherjerkin", "wardenjerkin", "travellerrags", "rimerobe", "stormmail",
];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Pal${Date.now() % 100000}`);
await page.waitForTimeout(1400);

console.log("item                       style        palette    pieces  colours");
for (const id of ids) {
  const base = ITEM_BASES[id];
  if (!base) {
    console.log(`${id.padEnd(26)} — not in the catalogue`);
    continue;
  }
  const out = await page.evaluate(async ({ id, slot, style, palette }) => {
    const a = window.__wieldbound.localActor;
    a.setAppearance({ layers: { [slot]: { style, rarity: "honed", palette } } });
    await new Promise((r) => setTimeout(r, 1100));
    const colours = new Set();
    let pieces = 0;
    a.root.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith(`gear_${slot}_${style}`)) return;
      pieces++;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m?.color) colours.add(`#${m.color.getHexString()}`);
      }
    });
    void id;
    return { pieces, colours: [...colours] };
  }, { id, slot: base.slot, style: base.style, palette: base.art.palette });

  console.log(
    `${base.name.padEnd(26)} ${String(base.style).padEnd(12)} ${String(base.art.palette).padEnd(10)}` +
      ` ${String(out.pieces).padStart(6)}  ${out.colours.join(" ")}`,
  );
}
await browser.close();
