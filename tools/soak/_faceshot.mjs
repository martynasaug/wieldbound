import { open, login } from "./driver.mjs";
import { writeFileSync } from "node:fs";
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("error: " + m.text()); });
await login(page, `Face${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.localActor.setLook({ skin: "tan", build: "average", hair: "short", beard: "none", hairColor: "brown" });
  g.localActor.heading = Math.PI;
  g.localActor.root.rotation.y = Math.PI;
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => { g.__hold?.(); render(s, c); };
});
await page.waitForTimeout(3500);
const info = await page.evaluate(() => {
  const a = window.__wieldbound.localActor;
  const meshes = [];
  a.root.traverse((o) => { if (o.isMesh) meshes.push(o.name || "(unnamed)"); });
  return { meshes: [...new Set(meshes)] };
});
console.log("MESHES " + info.meshes.join(" "));
for (const v of [
  { name: "face_front", yaw: Math.PI, dist: 1.15, aim: 1.5 },
  { name: "face_body", yaw: Math.PI, dist: 3.2, aim: 0.95 },
]) {
  await page.evaluate((v) => {
    const g = window.__wieldbound; const a = g.localActor;
    g.__hold = () => {
      const t = a.position.clone(); t.y += v.aim;
      const f = a.heading + v.yaw;
      g.world.camera.position.set(t.x + Math.sin(f) * v.dist, t.y + 0.12, t.z + Math.cos(f) * v.dist);
      g.world.camera.lookAt(t);
    };
  }, v);
  await page.waitForTimeout(450);
  writeFileSync(`tools/soak/shots/${v.name}.png`, await page.screenshot({ clip: { x: 380, y: 60, width: 520, height: 660 } }));
  console.log("wrote tools/soak/shots/" + v.name + ".png");
}
console.log(errors.length ? "PAGE ERRORS: " + errors.slice(0, 4).join(" | ") : "no page errors");
await browser.close(); process.exit(0);
