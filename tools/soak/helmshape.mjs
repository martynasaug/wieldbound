// IS THE HELM A HEAD, OR A BOX?
//
// The M70.236 tour frames show the player with a featureless teal block where a
// head should be — wider than their own shoulders and about as tall as the
// torso — standing next to Elsbet Vane, who at the same scale has a face, hair
// and normal proportions. That is either the helm mesh drawn far too large, or
// the body's own head, and a screenshot cannot tell the two apart.
//
// So: measure the head slot's world bounding box with the helm on and with it
// off, and photograph both. A helm should sit ON a head, so its box should be
// comparable to the head it covers — not to the whole character.
//
//   node tools/soak/helmshape.mjs Player3619 tools/soak/shots/helm
import { mkdirSync } from "node:fs";
import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/helm";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);

// Fixed light and a close camera, so the two frames differ only by the helm.
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.world.setCameraDistance(4.2);
});
await new Promise((r) => setTimeout(r, 2500));

/** The local actor's own meshes, boxed in world space, grouped by name. */
const shape = () => page.evaluate(() => {
  const g = window.__wieldbound;
  const root = g.localActor.root;
  root.updateMatrixWorld(true);
  const rows = [];
  root.traverse((o) => {
    const geo = o.geometry;
    if (!o.isMesh || !geo) return;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return;
    const m = o.matrixWorld.elements;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? bb.max.x : bb.min.x;
      const y = i & 2 ? bb.max.y : bb.min.y;
      const z = i & 4 ? bb.max.z : bb.min.z;
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      lo[0] = Math.min(lo[0], wx); hi[0] = Math.max(hi[0], wx);
      lo[1] = Math.min(lo[1], wy); hi[1] = Math.max(hi[1], wy);
      lo[2] = Math.min(lo[2], wz); hi[2] = Math.max(hi[2], wz);
    }
    rows.push({
      name: o.name || "(unnamed)",
      w: +(hi[0] - lo[0]).toFixed(2),
      h: +(hi[1] - lo[1]).toFixed(2),
      d: +(hi[2] - lo[2]).toFixed(2),
      top: +hi[1].toFixed(2),
      bottom: +lo[1].toFixed(2),
    });
  });
  return rows;
});

const helmOf = (rows) => rows.filter((r) => /helm|crown|hood|cap|head/i.test(r.name));
const biggest = (rows) => [...rows].sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d).slice(0, 6);

const withHelm = await shape();
await page.screenshot({ path: `${OUT}/with-helm.png` });

const removed = await page.evaluate(() => {
  const g = window.__wieldbound;
  const helm = g.items.find((i) => i.equipped && i.slot === "helm");
  if (!helm) return null;
  g.socket.sendUnequipItem ? g.socket.sendUnequipItem(helm.id) : g.socket.sendEquipItem(helm.id);
  return helm.baseId;
});
await new Promise((r) => setTimeout(r, 3500));
const without = await shape();
await page.screenshot({ path: `${OUT}/no-helm.png` });

console.log(`helm: ${removed ?? "(none equipped)"}\n`);
console.log("WITH THE HELM ON, the six largest meshes on the character:");
for (const r of biggest(withHelm)) {
  console.log(`  ${r.name.padEnd(26)} ${String(r.w).padStart(5)}w ${String(r.h).padStart(5)}h ${String(r.d).padStart(5)}d   top ${r.top}`);
}
console.log("\nAFTER TAKING IT OFF:");
for (const r of biggest(without)) {
  console.log(`  ${r.name.padEnd(26)} ${String(r.w).padStart(5)}w ${String(r.h).padStart(5)}h ${String(r.d).padStart(5)}d   top ${r.top}`);
}

const hOn = helmOf(withHelm);
const hOff = helmOf(without);
console.log(`\nhead-slot meshes: ${hOn.length} with the helm, ${hOff.length} without`);
for (const r of hOn) console.log(`  on:  ${r.name} ${r.w}w ${r.h}h ${r.d}d  spans y ${r.bottom} to ${r.top}`);
for (const r of hOff) console.log(`  off: ${r.name} ${r.w}w ${r.h}h ${r.d}d  spans y ${r.bottom} to ${r.top}`);

const tallest = Math.max(...withHelm.map((r) => r.top));
console.log(`\ncharacter total height with the helm: ${tallest.toFixed(2)}`);

// PUT IT BACK. The first version left the helm off, so the NEXT run measured a
// bare head under the heading "with the helm on" and reported the piece missing
// entirely — which read as "the new style renders nothing" when the style was
// fine and the character was simply undressed by the run before it.
if (removed) {
  await page.evaluate((baseId) => {
    const g = window.__wieldbound;
    const helm = g.items.find((i) => !i.equipped && i.baseId === baseId);
    if (helm) g.socket.sendEquipItem(helm.id);
  }, removed);
  await new Promise((r) => setTimeout(r, 2500));
  const back = await page.evaluate(() => !!window.__wieldbound.items.find((i) => i.equipped && i.slot === "helm"));
  console.log(`helm put back on: ${back}`);
}
await browser.close();
