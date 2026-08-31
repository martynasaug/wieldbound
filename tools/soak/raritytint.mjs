// Sharing geometry across rarities must NOT share the tint.
//
// `heldGeoCache` is keyed on the shape's own inputs, so a Worn recurve and a
// Honed recurve now hand out the SAME geometry. Materials are still built per
// rarity and cloned per wielder, so the colours must still differ — this checks
// that rather than assuming it, because "all my weapons went grey" is exactly
// the regression a geometry-sharing change would cause.

import { open, login } from "./driver.mjs";

const { browser, page } = await open({ headless: true });
await login(page, process.argv[2] ?? "Player3619");

const byBase = await page.evaluate(() => {
  const g = window.__wieldbound;
  const { ITEM_BASES } = window.__wieldboundRules;
  const out = {};
  for (const it of g.items) {
    if (ITEM_BASES[it.baseId]?.slot !== "weapon") continue;
    (out[it.baseId] ??= []).push({ id: it.id, rarity: it.rarity });
  }
  // Only bases owned at more than one rarity can answer the question.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => new Set(v.map((x) => x.rarity)).size > 1));
});

console.log("bases owned at multiple rarities:", Object.keys(byBase).join(", ") || "(none)");

for (const [baseId, list] of Object.entries(byBase)) {
  const seen = [];
  for (const { id, rarity } of list) {
    await page.evaluate((i) => window.__wieldbound.socket.sendEquipItem(i), id);
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => {
      const g = window.__wieldbound;
      let r = null;
      g.localActor.root.traverse((o) => {
        if (r || !o.name?.startsWith("held_")) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        r = {
          geo: o.geometry.uuid.slice(0, 8),
          verts: o.geometry.attributes.position.count,
          color: "#" + m.color.getHexString(),
          mat: m.uuid.slice(0, 8),
        };
      });
      return r;
    });
    seen.push({ rarity, ...info });
    console.log(`  ${baseId} ${String(rarity).padEnd(9)} geo=${info.geo} verts=${info.verts} color=${info.color} mat=${info.mat}`);
  }
  const geos = new Set(seen.map((s) => s.geo));
  const colors = new Set(seen.map((s) => s.color));
  console.log(
    `  -> ${geos.size === 1 ? "SHARED geometry (intended)" : `${geos.size} geometries (NOT shared)`}, ` +
      `${colors.size > 1 ? "distinct tints (correct)" : "*** ONE TINT FOR ALL RARITIES ***"}\n`,
  );
}

console.log("console errors:", page.__errors.length);
await browser.close();
