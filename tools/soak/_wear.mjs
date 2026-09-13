// WEAR A GARMENT. Everything upstream is proven: the four costumes are cut, the
// loader is written, and binding a pack garment to this skeleton was shown to
// deform correctly. This is the first time one is actually worn. Throwaway.
import { open, login } from "./driver.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("tools/soak/shots/worn", { recursive: true });
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("error: " + m.text()); });
await login(page, `Wear${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.localActor.heading = Math.PI;
  g.localActor.root.rotation.y = Math.PI;
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => { g.__hold?.(); render(s, c); };
  window.__bodyBox = () => {
    const a = g.localActor; const V = a.position.constructor;
    a.root.updateMatrixWorld(true);
    let lo = null, hi = null;
    a.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      if (!/PlayerBody|Face|worn_/.test(o.name)) return;
      const p = o.geometry.attributes.position; const v = new V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (!lo) { lo = v.clone(); hi = v.clone(); } else { lo.min(v); hi.max(v); }
      }
    });
    return lo ? { lo, hi } : null;
  };
});
await page.waitForTimeout(3000);

const report = await page.evaluate(async () => {
  const { loadGarments, garment } = await import("/src/three/wardrobe.ts");
  await loadGarments();
  const a = window.__wieldbound.localActor;
  let body = null;
  a.root.traverse((o) => { if (!body && o.isSkinnedMesh && /PlayerBody/.test(o.name)) body = o; });
  if (!body) return { error: "no player body" };
  const SkinnedMesh = body.constructor;
  const out = {};
  for (const id of ["plate", "robe", "leather", "light"]) {
    const g = garment(id);
    out[id] = g
      ? { faces: (g.geometry.index ? g.geometry.index.count : g.geometry.attributes.position.count) / 3,
          material: g.material?.type ?? null, map: g.material?.map ? "yes" : "no" }
      : null;
  }
  const g = garment("plate");
  if (g) {
    const worn = new SkinnedMesh(g.geometry, g.material);
    worn.name = "worn_plate";
    worn.bind(body.skeleton, body.bindMatrix.clone());
    worn.bindMatrixInverse.copy(body.bindMatrixInverse);
    worn.frustumCulled = false;
    body.parent.add(worn);
    out.worn = true;
  }
  return out;
});
console.log(JSON.stringify(report));

for (const v of [
  { name: "worn_front", yaw: Math.PI, dist: 3.4, aim: 0.55 },
  { name: "worn_side", yaw: Math.PI * 0.5, dist: 3.4, aim: 0.55 },
]) {
  await page.evaluate((v) => {
    const g = window.__wieldbound; const a = g.localActor;
    g.__hold = () => {
      const box = window.__bodyBox(); if (!box) return;
      const V = a.position.constructor;
      const h = box.hi.y - box.lo.y;
      const t = new V((box.lo.x+box.hi.x)/2, box.lo.y + h * v.aim, (box.lo.z+box.hi.z)/2);
      const f = a.heading + v.yaw;
      g.world.camera.position.set(t.x + Math.sin(f)*v.dist, t.y + h*0.06, t.z + Math.cos(f)*v.dist);
      g.world.camera.lookAt(t);
    };
  }, v);
  await page.waitForTimeout(450);
  writeFileSync(`tools/soak/shots/worn/${v.name}.png`, await page.screenshot({ clip: { x: 380, y: 60, width: 520, height: 660 } }));
  console.log("wrote tools/soak/shots/worn/" + v.name + ".png");
}
console.log(errors.length ? "PAGE ERRORS: " + errors.slice(0, 4).join(" | ") : "no page errors");
await browser.close(); process.exit(0);
