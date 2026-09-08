// WHAT THE LOAD IS MADE OF, BY PHASE — AND WHAT EACH PHASE BUILDS.
//
// The load's own marks have always reported milliseconds. They also record a
// program count, and nobody had ever printed it, which is why the phase table
// could be read for a year without the answer being visible in it.
//
// It also breaks `buildTerrain` into its four stages, because the phase called
// `start` is everything from navigation to the end of the Game constructor and
// had never been broken down at all — the suspicion being that the 90k-vertex
// terrain loop was hiding in it.
//
//   node tools/soak/loadphases.mjs
//   WB_CLIENT_URL=http://localhost:4173 node tools/soak/loadphases.mjs   (a build)
//
// WHAT IT FOUND, so nobody re-runs it expecting news:
//
//     1617ms  +  0 programs  start
//     1326ms  +  2 programs  assets (decor, anims, kit, body, people)
//     1876ms  + 40 programs  warmUp(scene): compile the world
//     2325ms  + 35 programs  warmFadedOccluders
//     2171ms  + 51 programs  warmWholeScene
//
//   terrainVertices 39ms, terrainNormals 10ms, terrainPlane 8ms, material 1ms
//
// Terrain generation is 58ms of a ten-second load — ruled out, and the loop
// nobody wanted to touch turns out to be cheap. `start` creates NO programs,
// so its 1.6s is module parse plus WebGL context creation, and there is no
// shader work hiding in it.
//
// The whole load is 128 shader programs, and `loadslice.mjs` puts ~690ms of a
// PRODUCTION BUILD inside three's `onFirstUse` — the link-completion stall.
// That is with `checkShaderErrors` already off (the build bakes
// `checkShaderErrors=!1`; verified in the bundle), so it is the programs
// themselves, not the error queries. Program count is material count, which is
// the art decision recorded at length above `Game.warmFadedOccluders`.
//
// RUN IT FOCUSED. A Chromium window that is not in front throttles rAF to
// about 1Hz, and the "slowest frames" line then reports 1017ms frames that are
// the throttle rather than the game. The phase and program numbers survive it;
// the frame line does not.

import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: false, width: 1200, height: 700 });
await page.addInitScript(() => {
  window.__frames = [];
  let last = 0;
  const tick = (ts) => { if (last > 0) window.__frames.push({ dt: ts - last, at: ts }); last = ts; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
await login(page, "Fighter");
await page.waitForTimeout(600);
const out = await page.evaluate(() => {
  const rows = [];
  for (const [name, s] of window.__wieldboundProfiler.sections) {
    if (name.startsWith("build:")) rows.push({ name, total: s.total ?? s.ms ?? 0 });
  }
  return { rows, frames: window.__frames, phases: window.__wieldbound.loadPhases };
});
console.log("world construction, timed:");
for (const r of out.rows.sort((a,b)=>b.total-a.total)) console.log(`   ${r.total.toFixed(0).padStart(5)}ms  ${r.name}`);
console.log("\nphases (ms, and programs first created in each):");
for (const p of out.phases) console.log(`   ${p.ms.toFixed(0).padStart(5)}ms  +${String(p.added).padStart(3)} programs  ${p.name}`);
const slow = [...out.frames].sort((a,b)=>b.dt-a.dt).slice(0,4);
console.log("slowest frames:", slow.map(f=>`+${(f.at/1000).toFixed(1)}s ${f.dt.toFixed(0)}ms`).join("  "));
await browser.close();
