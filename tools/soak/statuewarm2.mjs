// HOOK, OR MECHANISM? The statue still compiles a program the first time its
// material is flipped, despite a hook that is supposed to warm it on arrival.
// Do the warm by hand from the page: if that prevents the compile, the hook is
// not firing; if it does not, `warmUp` does not cover this object.
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, process.argv[2] ?? "Player3619");
await new Promise((r) => setTimeout(r, 3500));
console.log(JSON.stringify(await page.evaluate(async () => {
  const g = window.__wieldbound;
  const statue = g.town.ornaments?.[0];
  if (!statue) return { error: "no statue" };
  const mats = [];
  statue.traverse((o) => { if (o.isMesh && o.material) mats.push(o.material); });
  const uniq = [...new Set(mats)];
  const hookSet = typeof g.town.onOrnamentAdded === "function";

  const p0 = g.world.renderer.info.programs.length;
  // The warm, by hand: flip, compile against the real scene, restore.
  const was = uniq.map((m) => [m.transparent, m.depthWrite]);
  for (const m of uniq) { m.transparent = true; m.depthWrite = false; }
  await g.world.warmUp(statue);
  uniq.forEach((m, i) => { m.transparent = was[i][0]; m.depthWrite = was[i][1]; });
  const p1 = g.world.renderer.info.programs.length;

  // Now do what a fade does and see whether anything is left to build.
  for (const m of uniq) { m.transparent = true; m.depthWrite = false; m.opacity = 0.2; }
  g.world.render();
  const p2 = g.world.renderer.info.programs.length;
  uniq.forEach((m, i) => { m.transparent = was[i][0]; m.depthWrite = was[i][1]; m.opacity = 1; });
  g.world.render();

  return { hookSet, materials: uniq.length, compiledByManualWarm: p1 - p0, compiledByFadeAfterWarm: p2 - p1 };
}), null, 1));
await browser.close();
