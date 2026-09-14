// THE HOOD IN PROFILE — the view that caught what four rounds of boxes missed.
//
//   node tools/soak/hoodside.mjs
//
// The catalogue shoots worn items front and back only, and a hood's whole
// question is a profile one: is the cloth AROUND the skull, or beside it? The
// bounding-box tests said "around" through four wrong builds, because this is a
// hooded CLOAK whose box is mostly the drape down the back.
//
// Camera numbers lifted verbatim from `catalogue.mjs`, which frames a character
// correctly; the only change is the yaw.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";

const OUT = "tools/soak/shots/hoodside";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Hood${Date.now() % 100000}`);
await page.waitForTimeout(2400);

await page.evaluate(() => {
  const g = window.__wieldbound;
  g.localActor.setLook({ skin: "tan", build: "average", hair: "short", beard: "none", hairColor: "black" });
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => { g.__catHold?.(); render(s, c); };
  g.localActor.setAppearance({ layers: { helm: { style: "hood", rarity: "honed", palette: "crimson" } } });
});
await page.waitForTimeout(1800);
await page.evaluate(() => {
  const a = window.__wieldbound.localActor;
  if (a.mixer) {
    a.mixer.stopAllAction();
    const act = a.actions?.get("idle");
    if (act) { act.reset().setEffectiveWeight(1).play(); act.time = 0.25; }
    a.mixer.update(0.0001);
    a.mixer.timeScale = 0;
  }
});

for (const [name, yaw] of [["front", 0], ["side", Math.PI / 2], ["back", Math.PI]]) {
  await page.evaluate((yaw) => {
    const g = window.__wieldbound;
    const a = g.localActor;
    g.__catHold = () => {
      const target = a.position.clone();
      target.y += 0.9;
      const f = a.heading + yaw;
      g.world.camera.position.set(target.x + Math.sin(f) * 3.2, target.y + 0.3, target.z + Math.cos(f) * 3.2);
      g.world.camera.lookAt(target);
    };
  }, yaw);
  await page.waitForTimeout(400);
  writeFileSync(`${OUT}/${name}.png`,
    await page.screenshot({ clip: { x: 500, y: 140, width: 280, height: 300 } }));
  console.log(name);
}

if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
console.log(`shots in ${OUT}/`);
await browser.close();
