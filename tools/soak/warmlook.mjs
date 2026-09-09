// DOES THE DEMAND-WARMED WORLD ACTUALLY LOOK RIGHT?
//
// `deferwarm.mjs` reports 7.0s to playable with a 17ms worst frame and no
// hitches, which is a large win arriving suspiciously clean. Every mechanism
// behind it mutates the live scene — hiding every top-level child, forcing
// visibility, switching off frustum culling, poking the shadow map — and every
// one of those is restored in a `finally` that has never been looked at with
// eyes. A missed restore does not show up as a slow frame. It shows up as the
// town missing, or the shadows gone, or a monster that never appears.
//
// So: same character, same place, both arms, screenshots to compare.
//
//   node tools/soak/warmlook.mjs
import { mkdirSync } from "node:fs";

const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const arm = async (defer) => {
  process.env.WB_CLIENT_URL = "http://localhost:5173" + (defer ? "/?deferwarm=1" : "");
  // Fresh module per arm: `CLIENT_URL` is read at import time.
  const mod = await import(`./driver.mjs?arm=${defer ? "defer" : "control"}`);
  const { browser, page } = await mod.open({ headless: false, width: 1280, height: 720 });
  await page.bringToFront();
  await mod.login(page, "Player3619");
  // Long enough for the deferred tail to have finished and for monsters to have
  // spawned and warm-drawn themselves.
  await page.waitForTimeout(Number(process.env.WB_SETTLE ?? 9000));
  const seen = await page.evaluate(() => {
    const g = window.__wieldbound;
    let alive = 0, drawn = 0;
    for (const v of g.monsters.values()) {
      if (v.state?.status === "alive") alive++;
      if (v.actor?.root?.visible) drawn++;
    }
    let sceneVisible = 0;
    for (const c of g.world.scene.children) if (c.visible) sceneVisible++;
    return {
      alive, drawn,
      sceneChildren: g.world.scene.children.length,
      sceneVisible,
      programs: g.world.renderer.info.programs.length,
      calls: g.world.renderer.info.render.calls,
      tris: g.world.renderer.info.render.triangles,
    };
  });
  const name = defer ? "demand" : "control";
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(
    `${name.padEnd(8)} monsters ${seen.drawn}/${seen.alive} drawn | ` +
      `scene children visible ${seen.sceneVisible}/${seen.sceneChildren} | ` +
      `${seen.programs} programs | ${seen.calls} draw calls | ${(seen.tris / 1000).toFixed(0)}k tris`,
  );
  console.log(`         errors: ${page.__errors.length}${page.__errors[0] ? " — " + page.__errors[0] : ""}`);
  await browser.close();
};

if (!process.argv.includes("--demand-only")) await arm(false);
await arm(true);
console.log(`\nscreenshots in ${OUT}/ — control.png and demand.png`);
