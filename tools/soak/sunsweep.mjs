// WHICH HOUR ACTUALLY LIGHTS A FACE.
//
//   node tools/soak/sunsweep.mjs
//
// `portrait.mjs` picked its default hour by reasoning about `daynight.ts`'s sun
// formula, and the reasoning was sound and the faces still came out black. The
// note in that file already records one round of this — t = 0.5 backlights the
// front views — and 0.30 was derived as the fix, but every front portrait taken
// since has been of a face in shadow. Art cannot be judged in the dark, and I
// have twice started blaming geometry for what turned out to be a light.
//
// So this stops deriving and MEASURES: the same shot at a dozen hours, scored
// by how bright the face region actually comes out. The answer goes back into
// `portrait.mjs` as its default.
import { open, login } from "./driver.mjs";

const HOURS = [0.0, 0.08, 0.16, 0.24, 0.32, 0.40, 0.5, 0.58, 0.66, 0.74, 0.82, 0.92];

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, `Sun${Date.now() % 100000}`);
await page.waitForTimeout(2500);

await page.evaluate(() => {
  const g = window.__wieldbound;
  const a = g.localActor;
  a.setLook({ skin: "tan", build: "average", hair: "swept", beard: "full", hairColor: "espresso" });
  a.heading = Math.PI;
  a.root.rotation.y = Math.PI;
  window.__bodyBox = () => {
    const actor = g.localActor;
    const V = actor.position.constructor;
    actor.root.updateMatrixWorld(true);
    let lo = null, hi = null;
    actor.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      if (!/PlayerBody|Face|Garment|look_/.test(o.name)) return;
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
    const target = new V((box.lo.x + box.hi.x) / 2, box.lo.y + height * 0.88, (box.lo.z + box.hi.z) / 2);
    const f = a.heading + Math.PI;
    g.world.camera.position.set(target.x + Math.sin(f) * 2.0, target.y + height * 0.03, target.z + Math.cos(f) * 2.0);
    g.world.camera.lookAt(target);
  };
});

console.log("hour   face luminance");

// READ OUT OF THE FRAMEBUFFER, not out of a screenshot. A PNG would need a
// decoder this repo does not carry, and adding a dependency to answer one
// question about lighting is the wrong trade.
//
// INSIDE THE FRAME, WHICH IS THE WHOLE TRICK. Called between frames this
// returns a buffer of zeros — the drawing buffer is not preserved after the
// frame is presented — and the first version of this harness duly reported
// every hour of the day as pitch black, which I came within one step of
// reading as "the character is unlit at all hours". It has to run while the
// frame is still current, so it hangs off the render hook.
await page.evaluate(() => {
  const g = window.__wieldbound;
  const gl = g.world.renderer.getContext();
  const sample = () => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    // The middle of the head only. Scored over the whole frame this would
    // measure the courtyard, which is lit at every hour, and would pick the
    // brightest BACKGROUND — the exact mistake that leaves a subject in
    // silhouette.
    const bw = Math.round(w * 0.14), bh = Math.round(h * 0.22);
    const bx = Math.round(w * 0.5 - bw / 2), by = Math.round(h * 0.52);
    const buf = new Uint8Array(bw * bh * 4);
    gl.readPixels(bx, by, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 4) sum += 0.299*buf[i] + 0.587*buf[i+1] + 0.114*buf[i+2];
    return sum / (buf.length / 4);
  };
  // The aim hook already runs every frame; this rides along after the draw.
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__hold?.();
    render(s, c);
    window.__lastLuma = sample();
  };
  window.__faceLuma = () => window.__lastLuma ?? 0;
});

const scores = [];
for (const hour of HOURS) {
  await page.evaluate((h) => window.__wieldbound.world.dayNight.freeze(h), hour);
  await page.waitForTimeout(420);
  const mean = await page.evaluate(() => window.__faceLuma());
  scores.push([hour, mean]);
  console.log(`${hour.toFixed(2)}   ${mean.toFixed(1)}`);
}
scores.sort((a, b) => b[1] - a[1]);
console.log(`\nbrightest: hour ${scores[0][0]} at ${scores[0][1].toFixed(1)}`);
await browser.close();
