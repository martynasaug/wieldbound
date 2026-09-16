// Is the nose material in bodyMaterials, and does its map differ from the body's?
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Nose${Date.now() % 100000}`);
await page.waitForTimeout(2400);
await page.evaluate(() => window.__wieldbound.localActor.setLook(
  { skin: "tan", build: "average", hair: "shaggy", beard: "none", hairColor: "black" }));
await page.waitForTimeout(1600);
const out = await page.evaluate(() => {
  const a = window.__wieldbound.localActor;
  const rows = [];
  let body = null, nose = null;
  a.root.traverse((o) => {
    if (o.isSkinnedMesh && !body && !/^worn_/.test(o.name)) body = o;
    if (o.isMesh && o.name === "Face_nose") nose = o;
  });
  const bm = body && (Array.isArray(body.material) ? body.material[0] : body.material);
  const nm = nose && (Array.isArray(nose.material) ? nose.material[0] : nose.material);
  rows.push(`bodyMaterials tracked: ${a.bodyMaterials ? a.bodyMaterials.length : "n/a"}`);
  rows.push(`body map uuid: ${bm?.map?.uuid ?? "none"}`);
  rows.push(`nose map uuid: ${nm?.map?.uuid ?? "none"}`);
  rows.push(`same map: ${bm?.map === nm?.map}`);
  rows.push(`nose in bodyMaterials: ${a.bodyMaterials ? a.bodyMaterials.includes(nm) : "n/a"}`);
  rows.push(`litMaterials has nose: ${a.litMaterials ? a.litMaterials.some((e) => e.mat === nm) : "n/a"}`);
  return rows;
});
for (const r of out) console.log(r);
await browser.close();
