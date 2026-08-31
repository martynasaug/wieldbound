// WHAT THE LOAD COSTS, PHASE BY PHASE.
//
// HEADED ON PURPOSE, and this is the one measurement where that is right.
// Headless Chromium falls back to SwiftShader, which has no
// KHR_parallel_shader_compile, so every program links on the main thread and the
// load reads ~90s against ~28s on the real GPU. For frame timing the tradeoff
// runs the other way — a headed window throttles to about 1fps when it is not
// focused, manufacturing fake ~1000ms hitches — so use headless there.
//
// `Game.loadPhases` is the game's own timeline: what each phase cost and how
// many shader programs it added. The programs column is what turned "loading is
// slow" into "125 programs at a very steady ~195ms each".

import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const RUNS = Number(process.argv[3] ?? 1);

for (let run = 1; run <= RUNS; run++) {
  const { browser, page } = await open({ headless: false });
  const ms = await login(page, NAME);
  const phases = await page.evaluate(() => window.__wieldbound.loadPhases);
  const info = await page.evaluate(() => {
    const i = window.__wieldbound.world.renderer.info;
    return { programs: i.programs?.length ?? 0, geometries: i.memory.geometries, textures: i.memory.textures };
  });

  console.log(`\n=== run ${run}: login-to-playable ${(ms / 1000).toFixed(1)}s ===`);
  console.log("phase                          ms     programs  added");
  for (const p of phases) {
    console.log(
      `${p.name.padEnd(28)} ${String(Math.round(p.ms)).padStart(6)}  ${String(p.programs).padStart(8)}  ${String(p.added).padStart(5)}`,
    );
  }
  const total = phases.reduce((s, p) => s + p.ms, 0);
  const worst = [...phases].sort((a, b) => b.ms - a.ms).slice(0, 5);
  console.log(`total ${(total / 1000).toFixed(1)}s across ${phases.length} phases`);
  console.log("worst:", worst.map((p) => `${p.name} ${Math.round(p.ms)}ms`).join(", "));
  console.log("final:", JSON.stringify(info));
  console.log("console errors:", page.__errors.length);
  for (const e of page.__errors.slice(0, 5)) console.log("  ", e);
  await browser.close();
}
