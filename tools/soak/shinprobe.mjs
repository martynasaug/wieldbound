// Where the boot and the body's shin actually are, in world y.
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Shin${Date.now() % 100000}`);
await page.waitForTimeout(2400);
const rows = await page.evaluate(async () => {
  const a = window.__wieldbound.localActor;
  const out = [];
  const xf = (m, x, y, z) => m[1] * x + m[5] * y + m[9] * z + m[13];
  for (const boots of ["low", "tall", "plated", "wrapped"]) {
    a.setAppearance({ layers: { armor: { style: "leather", rarity: "honed", palette: "steel" }, boots: { style: boots, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1400));
    if (a.mixer) a.mixer.stopAllAction();
    a.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    a.root.updateMatrixWorld(true);
    let blo = Infinity, bhi = -Infinity, glo = Infinity, ghi = -Infinity;
    let body = null;
    a.root.traverse((o) => { if (!body && o.isSkinnedMesh && !/^worn_/.test(o.name)) body = o; });
    const bp = body.geometry.attributes.position, si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
    const bones = body.skeleton.bones.map((b) => b.name), bm = body.matrixWorld.elements;
    for (let i = 0; i < bp.count; i++) {
      let best = -1, bw = 0.5;
      for (const c of ["X", "Y", "Z", "W"]) { const w = sw[`get${c}`](i); if (w > bw) { bw = w; best = si[`get${c}`](i); } }
      if (best < 0 || !/^LowerLeg/.test(bones[best])) continue;
      const y = xf(bm, bp.getX(i), bp.getY(i), bp.getZ(i));
      blo = Math.min(blo, y); bhi = Math.max(bhi, y);
    }
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !/^(gear_|worn_)/.test(o.name) || seen.has(o.uuid)) return;
      seen.add(o.uuid);
      let bone = null;
      for (let q = o.parent; q; q = q.parent) if (q.isBone) { bone = q.name; break; }
      if (!bone || !/^LowerLeg/.test(bone)) return;
      const p = o.geometry.attributes.position, m = o.matrixWorld.elements;
      for (let i = 0; i < p.count; i++) {
        const y = xf(m, p.getX(i), p.getY(i), p.getZ(i));
        glo = Math.min(glo, y); ghi = Math.max(ghi, y);
      }
    });
    out.push(`${boots.padEnd(9)} body shin y[${blo.toFixed(3)},${bhi.toFixed(3)}]   boot y[${glo.toFixed(3)},${ghi.toFixed(3)}]`);
  }
  return out;
});
for (const r of rows) console.log(r);
await browser.close();
