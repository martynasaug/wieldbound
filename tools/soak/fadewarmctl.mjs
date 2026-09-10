// CONTROL: does a BUILDING also compile on its first fade?
//
// The statue compiles one program the first time its material is flipped, even
// after being warmed. Before treating that as a fault in the new ornament warm,
// check something that `warmFadedOccluders` has always covered. If a building
// does the same, the statue is not special and the cause is elsewhere — the
// obvious candidate being the auto-quality switch a few seconds after load,
// which changes shadow settings and therefore every program's cache key.
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, process.argv[2] ?? "Player3619");
await new Promise((r) => setTimeout(r, 3500));
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__wieldbound;
  const flipAndDraw = (root) => {
    const mats = [...new Set([])];
    const found = [];
    root.traverse((o) => { if (o.isMesh && o.material) found.push(o.material); });
    const uniq = [...new Set(found)];
    const before = g.world.renderer.info.programs.length;
    const was = uniq.map((m) => [m.transparent, m.depthWrite]);
    for (const m of uniq) { m.transparent = true; m.depthWrite = false; }
    g.world.render();
    const after = g.world.renderer.info.programs.length;
    uniq.forEach((m, i) => { m.transparent = was[i][0]; m.depthWrite = was[i][1]; });
    g.world.render();
    return { materials: uniq.length, compiled: after - before };
  };
  g.world.render();
  return {
    quality: g.world.qualityLevel ?? g.qualityLevel ?? "?",
    building: flipAndDraw(g.town.buildings[0]),
    statue: flipAndDraw(g.town.ornaments[0]),
    anotherBuilding: flipAndDraw(g.town.buildings[1]),
  };
}), null, 1));
await browser.close();
