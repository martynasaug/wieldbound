// WHAT COLDHARROW COSTS TO DRAW.
//
//   node tools/soak/citycost.mjs [Name]
//
// Written after the city was reported unplayable — "you made the game lag and
// freeze like crazy" — which no test in `tools/test/` could have caught, since
// all of them are geometry over shared data and none of them render anything.
//
// The cause was two numbers nobody looked at. A lamp every 380px along four
// spokes and two rings is FIFTY-EIGHT street lamps, and `lantern()` gives each
// one a real `THREE.PointLight`; with the braziers that was sixty-six dynamic
// lights against Emberhold's six. Every lit fragment in the scene pays for every
// light in range, and three.js rebuilds the shader program whenever the count
// changes, so walking the city stalled on nearly every step. Separately the
// harbour ice was 257 individual shadow-casting meshes.
//
// Both are the kind of thing that is obvious the moment it is counted and
// invisible otherwise, so this counts them: draw calls, triangles, live shader
// programs, visible lights, and the actual frame time, sampled in open country,
// in Emberhold, and standing in Coldharrow.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach, unstick } from "./driver.mjs";
import { COLDHARROW, EMBERHOLD } from "../../shared/town.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Cost${Math.floor(Math.random() * 90000)}`;
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(2200);

const posOf = () =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

/**
 * One sample.
 *
 * FRAME TIME OVER A WINDOW, not a single reading. A stall from a shader
 * recompile is a 200ms frame in a sea of 16ms ones, so a mean hides it and only
 * the WORST frame in the window shows it at all — which is precisely the thing
 * being hunted here.
 */
const sample = (label) =>
  page.evaluate(
    (lbl) =>
      new Promise((resolve) => {
        const g = window.__wieldbound;
        const r = g.world.renderer;
        const frames = [];
        let last = performance.now();
        let n = 0;
        const tick = () => {
          const now = performance.now();
          frames.push(now - last);
          last = now;
          if (++n < 90) {
            requestAnimationFrame(tick);
            return;
          }
          let lights = 0;
          let visibleLights = 0;
          g.world.scene.traverse((o) => {
            if (!o.isLight) return;
            lights++;
            if (o.visible) visibleLights++;
          });
          const sorted = frames.slice(6).sort((a, b) => a - b);
          resolve({
            label: lbl,
            calls: r.info.render.calls,
            tris: r.info.render.triangles,
            programs: r.info.programs?.length ?? 0,
            geometries: r.info.memory.geometries,
            lights,
            visibleLights,
            median: sorted[Math.floor(sorted.length / 2)],
            worst: sorted[sorted.length - 1],
            p90: sorted[Math.floor(sorted.length * 0.9)],
          });
        };
        requestAnimationFrame(tick);
      }),
    label,
  );

const goTo = async (to, label, budget = 300) => {
  let best = Infinity;
  let stalled = 0;
  for (let i = 0; i < budget; i++) {
    const me = await posOf();
    const d = Math.hypot(to.x - me.x, to.y - me.y);
    if (d < 200) return true;
    if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
    if (stalled > 0 && stalled % 14 === 0) await unstick(page, 200);
    await approach(page, to, d > 900 ? 800 : 340);
  }
  console.log(`  !! never reached ${label}`);
  return false;
};

const rows = [];
const say = (r) => {
  rows.push(r);
  console.log(
    `  ${r.label.padEnd(22)} ${String(r.calls).padStart(5)} calls  ` +
      `${String(Math.round(r.tris / 1000)).padStart(5)}k tris  ` +
      `${String(r.programs).padStart(3)} prog  ` +
      `${String(r.visibleLights).padStart(3)}/${String(r.lights).padEnd(3)} lights  ` +
      `med ${r.median.toFixed(1)}ms  p90 ${r.p90.toFixed(1)}ms  worst ${r.worst.toFixed(1)}ms`,
  );
};

await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.2));
await page.waitForTimeout(600);
say(await sample("Emberhold, spawn"));

// Travel out, which also proves the lights of the town behind you go off.
const travelled = await page.evaluate(() => {
  const g = window.__wieldbound;
  if (!g.travelPanel?.knows?.("pinewardstone")) return false;
  g.socket.sendTravelTo("pinewardstone");
  return true;
});
if (!travelled) {
  console.log("  seed the character first: node tools/seed.mjs " + NAME);
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1600);
say(await sample("open country"));

const centre = COLDHARROW.center;
const at = (radiusPx, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: centre.x + Math.cos(a) * radiusPx, y: centre.y + Math.sin(a) * radiusPx };
};

if (await goTo(at(COLDHARROW.radiusPx + 300, 88), "outside the Landward Gate")) {
  say(await sample("outside the wall"));
}
if (await goTo(at(1900, 90), "inside the gate")) {
  say(await sample("Coldharrow, the spine"));
  writeFileSync(`${OUT}/cost-spine.png`, await page.screenshot());
}
if (await goTo(at(1340, 270), "the quay")) {
  say(await sample("Coldharrow, the quay"));
  writeFileSync(`${OUT}/cost-quay.png`, await page.screenshot());
}

const worst = rows.reduce((a, r) => (r.worst > a.worst ? r : a), rows[0]);
console.log(`\n  worst frame anywhere: ${worst.worst.toFixed(1)}ms at "${worst.label}"`);
console.log(`  (60Hz is 16.7ms. A stall is a shader recompile; a high median is fill or draw calls.)`);
if (errors.length) console.log("page errors:", errors.slice(0, 4));
await browser.close();
