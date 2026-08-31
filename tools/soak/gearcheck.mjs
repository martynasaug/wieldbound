// Does the gear still DRAW after the geometry cache was re-keyed?
//
// The fix makes every rarity of a weapon share one geometry. If that sharing is
// wrong, the failure mode is a weapon that renders as nothing — and a blank mesh
// produces no console error at all, so a clean log proves nothing here. This
// swaps through every weapon in the bag, checks the held meshes really have
// vertex data, and takes a picture to be looked at.

import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "gear.png";

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);

// Every weapon the character owns, so the swap path is exercised rather than
// whatever happened to be equipped.
const weapons = await page.evaluate(() => {
  const g = window.__wieldbound;
  const { ITEM_BASES } = window.__wieldboundRules;
  return g.items
    .filter((it) => ITEM_BASES[it.baseId]?.slot === "weapon")
    .map((it) => ({ id: it.id, baseId: it.baseId, rarity: it.rarity }));
});
console.log(`weapons in bag: ${weapons.length}`);

const results = [];
for (const w of weapons) {
  // `sendEquipItem`, not a hand-rolled `send({type:"EQUIP"})`. The message is
  // `EQUIP_ITEM`, and the server drops anything else silently — which made the
  // first version of this report identical vertex counts for a bow, a spear and
  // a scythe, because nothing had ever swapped.
  await page.evaluate((id) => window.__wieldbound.socket.sendEquipItem(id), w.id);
  await page.waitForTimeout(1200);
  const held = await page.evaluate(() => {
    const g = window.__wieldbound;
    const out = [];
    g.localActor.root.traverse((o) => {
      if (!o.name?.startsWith("held_")) return;
      const pos = o.geometry?.attributes?.position;
      out.push({
        name: o.name,
        verts: pos ? pos.count : 0,
        visible: o.visible,
        // A disposed geometry keeps its attribute arrays in JS but loses its
        // renderer registration, which is the tell this check exists for.
        registered: !!(o.geometry?._listeners?.dispose?.length > 0),
      });
    });
    return out;
  });
  results.push({ ...w, held });
  const bad = held.filter((h) => h.verts === 0);
  console.log(
    `${w.baseId.padEnd(16)} ${String(w.rarity).padEnd(10)} held=${held.length} ` +
      `verts=[${held.map((h) => h.verts).join(",")}]${bad.length ? "  *** EMPTY ***" : ""}`,
  );
}

const empty = results.filter((r) => r.held.some((h) => h.verts === 0) || r.held.length === 0);
const unregistered = results.filter((r) => r.held.some((h) => !h.registered));
console.log(`\nweapons with no drawable held mesh: ${empty.length}`);
console.log(`held meshes whose geometry is not renderer-registered: ${unregistered.length}`);
console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 5)) console.log("  ", e);

await page.screenshot({ path: OUT });
console.log("wrote", OUT);
await browser.close();
