// Hood on, hood hidden. If the post survives the hood being hidden, it is the
// body; if it vanishes, it is the hood mesh after all.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
const OUT = "tools/soak/shots/post";
mkdirSync(OUT, { recursive: true });
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, `Post${Date.now() % 100000}`);
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
  g.localActor.setAppearance({ layers: { helm: { style: "hood", rarity: "honed", palette: "steel" } } });
});
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const a = window.__wieldbound.localActor;
  if (a.mixer) { a.mixer.stopAllAction(); const k = a.actions?.get("idle"); if (k) { k.reset().setEffectiveWeight(1).play(); k.time = 0.25; } a.mixer.update(0.0001); a.mixer.timeScale = 0; }
});
for (const hide of [false, true]) {
  await page.evaluate((hide) => {
    window.__wieldbound.localActor.root.traverse((o) => {
      if (o.isMesh && /hood/i.test(o.name)) o.visible = !hide;
    });
  }, hide);
  await page.waitForTimeout(400);
  writeFileSync(`${OUT}/${hide ? "hood-hidden" : "hood-on"}.png`,
    await page.screenshot({ clip: { x: 540, y: 120, width: 220, height: 220 } }));
  console.log(hide ? "hood hidden" : "hood on");
}
await browser.close();
