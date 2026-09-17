// WHICH SHADER PROGRAMS GET BUILT LATE, AND WHAT THEY BELONG TO.
//
//   node tools/soak/newprograms.mjs [Name]
//
// `citycost.mjs` caught a 2,222ms frame on the approach to Coldharrow, with the
// live program count going 188 -> 195 across the same step. At the ~195ms a
// program costs on this hardware, seven of them IS that frame: it is a compile
// stall, not fill rate and not draw calls.
//
// What it does not say is WHICH seven, and that matters because the two
// candidates want opposite fixes. Either they are the harbour's new materials —
// the vertex-coloured ice sheet, the cracks, the plates, the yard — which were
// somehow missed by the load-time warm, or they are OLD materials being rebuilt
// because something changed a value in their cache key. `NUM_POINT_LIGHTS` is
// such a value, and `Town.update` now switches a settlement's lanterns on and
// off by distance, so crossing that threshold could be recompiling every
// material in view.
//
// Game.ts says outright that the way to tell is to ask three.js which material
// owns the program rather than to decode cache keys by eye, so this diffs
// `renderer.info.programs` around each leg and prints the new entries with
// their cache keys and owning material names.
import { open, login, approach, unstick } from "./driver.mjs";
import { COLDHARROW } from "../../shared/town.ts";

const NAME = process.argv[2] ?? `Prog${Math.floor(Math.random() * 90000)}`;

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(2400);

const posOf = () =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

// A snapshot of every live program, keyed so two runs can be differenced.
const snapshot = () =>
  page.evaluate(() => {
    const r = window.__wieldbound.world.renderer;
    const list = r.info.programs ?? [];
    return list.map((p) => p.cacheKey ?? "(no key)");
  });

// Every material in the scene, by program, so a new program can be named.
const ownerOf = (keys) =>
  page.evaluate((wanted) => {
    const g = window.__wieldbound;
    const r = g.world.renderer;
    const props = r.properties;
    const found = {};
    g.world.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        const prog = props.get(m)?.currentProgram;
        if (!prog) continue;
        const k = prog.cacheKey ?? "(no key)";
        if (!wanted.includes(k)) continue;
        found[k] = found[k] ?? [];
        const label = `${m.type}${m.name ? ` "${m.name}"` : ""}` +
          `${m.vertexColors ? " +vtxcol" : ""}${m.map ? " +map" : ""}` +
          `${m.transparent ? " +transparent" : ""} on ${o.name || o.type}`;
        if (!found[k].includes(label)) found[k].push(label);
      }
    });
    return found;
  }, keys);

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

let prev = await snapshot();
console.log(`\n  ${prev.length} programs live after load\n`);

const leg = async (label) => {
  const now = await snapshot();
  const fresh = now.filter((k) => !prev.includes(k));
  console.log(`  ${label}: ${now.length} programs (${fresh.length} new)`);
  if (fresh.length) {
    const owners = await ownerOf(fresh);
    for (const k of fresh) {
      const who = owners[k];
      console.log(`     + ${who ? who.join(" | ") : "(no live material owns it now)"}`);
      // The lights count is a #define, so it is worth showing when it moved.
      const m = /,(\d+),(\d+),(\d+),(\d+),/.exec(k);
      if (m) console.log(`       key fragment: ${m[0]}`);
    }
  }
  prev = now;
};

await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.2));
await page.waitForTimeout(700);
await leg("at spawn");

await page.evaluate(() => {
  const g = window.__wieldbound;
  if (g.travelPanel?.knows?.("pinewardstone")) g.socket.sendTravelTo("pinewardstone");
});
await page.waitForTimeout(1800);
await leg("after travelling north");

const centre = COLDHARROW.center;
const at = (radiusPx, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: centre.x + Math.cos(a) * radiusPx, y: centre.y + Math.sin(a) * radiusPx };
};

if (await goTo(at(COLDHARROW.radiusPx + 700, 88), "in sight of the wall")) {
  await leg("in sight of the wall");
}
if (await goTo(at(COLDHARROW.radiusPx + 200, 89), "at the gate")) {
  await leg("at the gate");
}
if (await goTo(at(1700, 90), "inside the city")) {
  await leg("inside the city");
}
if (await goTo(at(1340, 270), "the quay")) {
  await leg("the quay");
}

if (errors.length) console.log("page errors:", errors.slice(0, 4));
await browser.close();
