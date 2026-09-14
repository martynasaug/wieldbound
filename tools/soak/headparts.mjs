// Every mesh on the actor, named, with its vertical span — so a thing poking
// through a helmet can be identified instead of guessed at.
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Head${Date.now() % 100000}`);
await page.waitForTimeout(2400);
await page.evaluate(() => window.__wieldbound.localActor.setLook(
  { skin: "tan", build: "average", hair: "shaggy", beard: "none", hairColor: "black" }));
await page.waitForTimeout(1500);
const rows = await page.evaluate(async () => {
  const a = window.__wieldbound.localActor;
  a.setAppearance({ layers: { helm: { style: "cap", rarity: "honed", palette: "steel" } } });
  await new Promise((r) => setTimeout(r, 1600));
  a.root.updateMatrixWorld(true);
  const out = [];
  a.root.traverse((o) => {
    const m = o;
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const p = m.geometry.attributes.position;
    const e = m.matrixWorld.elements;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const y = e[1] * p.getX(i) + e[5] * p.getY(i) + e[9] * p.getZ(i) + e[13];
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    // Only things up at head height.
    if (hi < 1.45) return;
    const parent = m.parent?.name || m.parent?.type || "?";
    out.push(`${(m.name || "(unnamed)").padEnd(22)} parent=${parent.padEnd(12)} y[${lo.toFixed(3)},${hi.toFixed(3)}] vis=${m.visible} tris=${(p.count / 3) | 0}`);
  });
  return out;
});
for (const r of rows) console.log(r);
await browser.close();
