// WHERE THE SCALP CAP ACTUALLY IS, painted red.
//
//   node tools/soak/capshow.mjs
//
// The numbers say the cap reaches 0.021 above the skull and the rim shell only
// 0.0136, so the cap should hide it — and the render still shows a pale band
// over the crown. One of those two things is wrong and arithmetic has not
// settled which in three attempts, so the cap is simply coloured red and
// photographed. Whatever is pale in this shot is not the cap.
import { open, login } from "./driver.mjs";
import { writeFileSync } from "node:fs";

const HAIR = process.argv[2] ?? "shaggy";
const LIFT = Number(process.argv[3] ?? 0.25);
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, `Cap${Date.now() % 100000}`);
await page.waitForTimeout(2200);

// HANDED OVER, NOT CLOSED OVER. This callback runs in the BROWSER, where the
// harness constants do not exist -- referencing LIFT there put NaN in the
// camera position and the shot came back as a distant view of the whole
// courtyard. portrait.mjs carries a note about this exact mistake.
await page.evaluate(({ HAIR, LIFT }) => {
  const g = window.__wieldbound;
  const a = g.localActor;
  g.world.dayNight.freeze(0);
  a.setLook({ skin: "tan", build: "average", hair: HAIR, beard: "none", hairColor: "espresso" });
  a.heading = Math.PI;
  a.root.rotation.y = Math.PI;
  window.__bodyBox = () => {
    const actor = g.localActor;
    const V = actor.position.constructor;
    actor.root.updateMatrixWorld(true);
    let lo = null, hi = null;
    actor.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      if (!/PlayerBody|Face|look_/.test(o.name)) return;
      const p = o.geometry.attributes.position;
      const v = new V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (!lo) { lo = v.clone(); hi = v.clone(); } else { lo.min(v); hi.max(v); }
      }
    });
    return lo ? { lo, hi } : null;
  };
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => { g.__hold?.(); render(s, c); };
  g.__hold = () => {
    const box = window.__bodyBox();
    if (!box) return;
    const V = a.position.constructor;
    const height = box.hi.y - box.lo.y;
    const target = new V((box.lo.x + box.hi.x) / 2, box.lo.y + height * 0.9, (box.lo.z + box.hi.z) / 2);
    const f = a.heading + Math.PI;
    g.world.camera.position.set(target.x + Math.sin(f) * 1.5, target.y + height * LIFT, target.z + Math.cos(f) * 1.5);
    g.world.camera.lookAt(target);
  };
}, { HAIR, LIFT });

await page.waitForTimeout(2200);
const painted = await page.evaluate(() => {
  const a = window.__wieldbound.localActor;
  let found = 0;
  a.root.traverse((o) => {
    if (o.isMesh && o.name === "look_scalp") { o.material.color.setHex(0xff0000); found++; }
    if (o.isMesh && o.name === "look_hair") { o.material.color.setHex(0x00ff00); found++; }
    // EVERY head surface gets a colour, so nothing left on screen is
    // unaccounted for. Two rounds of this were spent guessing whether a tan
    // patch between locks was skin, a brow, or the cap in shadow.
    if (o.isMesh && o.name === "PlayerBody") { o.material.color.setHex(0x0044ff); found++; }
    if (o.isMesh && /^Face_/.test(o.name)) { o.material.color.setHex(0xff00ff); found++; }
  });
  return found;
});
console.log(`painted ${painted} meshes (scalp red, hair green, body blue, face magenta)`);
await page.waitForTimeout(600);
writeFileSync("tools/soak/shots/portrait/capshow.png", await page.screenshot({ clip: { x: 430, y: 120, width: 420, height: 420 } }));
console.log("-> tools/soak/shots/portrait/capshow.png");
await browser.close();
