// IS THE STATUE'S SEE-THROUGH VARIANT WARMED?
//
// `transparent` is part of a program's cache key, so the first time a material
// fades it compiles a second program — inside a frame, if nothing built it
// under the loading screen. That is the M70.144 failure class, and the statue
// is newly exposed to it: it loads ASYNCHRONOUSLY, so `warmFadedOccluders` may
// well have finished before `ornaments` had anything in it.
//
// Rather than try to stand in exactly the right place to make it fade, do what
// the fade does — flip the flag and draw once — and watch the program count.
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, process.argv[2] ?? "Player3619");
await new Promise((r) => setTimeout(r, 3500));
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__wieldbound;
  const statue = g.town.ornaments?.[0];
  if (!statue) return { error: "no statue" };
  // CONTROL FIRST. A plain render can compile something that has nothing to do
  // with the statue, and without this the run cannot tell "the fade variant was
  // missing" from "drawing a frame compiled something".
  const start = g.world.renderer.info.programs.length;
  g.world.render();
  const afterPlainRender = g.world.renderer.info.programs.length;
  const before = g.world.renderer.info.programs.length;
  const mats = [];
  statue.traverse((o) => { if (o.isMesh && o.material) mats.push(o.material); });
  const was = mats.map((m) => [m.transparent, m.depthWrite, m.opacity]);
  for (const m of mats) { m.transparent = true; m.depthWrite = false; m.opacity = 0.2; }
  g.world.render();
  const during = g.world.renderer.info.programs.length;
  mats.forEach((m, i) => { m.transparent = was[i][0]; m.depthWrite = was[i][1]; m.opacity = was[i][2]; });
  g.world.render();
  return {
    statueMaterials: new Set(mats).size,
    compiledByAPlainRender: afterPlainRender - start,
    programsBefore: before,
    programsAfterFading: during,
    compiledOnFirstFade: during - before,
  };
}), null, 1));
await browser.close();
