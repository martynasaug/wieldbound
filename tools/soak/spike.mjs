// Is the thing spiking through the cap PART OF THE CAP, or the body showing
// through it? Shot twice, in two palettes. Helm geometry changes colour with
// the palette; skin does not.
//
// Camera numbers copied from `wearlook.mjs`, which frames a figure correctly.
// Two earlier attempts at a closer hold pointed at the sky and at a windowsill.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
const OUT = "tools/soak/shots/spike";
mkdirSync(OUT, { recursive: true });
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, `Spk${Date.now() % 100000}`);
await page.waitForTimeout(2600);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.localActor.setLook({ skin: "tan", build: "average", hair: "shaggy", beard: "none", hairColor: "black" });
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => { g.__h?.(); render(s, c); };
  g.__h = () => {
    const a = g.localActor, t = a.position.clone();
    t.y += 0.88;
    const f = a.heading;
    g.world.camera.position.set(t.x + Math.sin(f) * 3.5, t.y + 0.30, t.z + Math.cos(f) * 3.5);
    g.world.camera.lookAt(t);
  };
});
await page.waitForTimeout(1200);
for (const palette of ["steel", "crimson", "verdant"]) {
  await page.evaluate((palette) => {
    window.__wieldbound.localActor.setAppearance({
      layers: { helm: { style: "cap", rarity: "honed", palette } },
    });
  }, palette);
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    const a = window.__wieldbound.localActor;
    if (a.mixer) { a.mixer.stopAllAction(); const k = a.actions?.get("idle"); if (k) { k.reset().setEffectiveWeight(1).play(); k.time = 0.25; } a.mixer.update(0.0001); a.mixer.timeScale = 0; }
  });
  await page.waitForTimeout(300);
  writeFileSync(`${OUT}/${palette}.png`, await page.screenshot({ clip: { x: 560, y: 90, width: 180, height: 180 } }));
  console.log(palette);
}
await browser.close();
