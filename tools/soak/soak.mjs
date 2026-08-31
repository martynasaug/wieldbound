// A SOAK THAT ACTUALLY TRAVELS, with the geometry census riding along.
//
// The first run of `geoleak.mjs` fought 175 fights in three minutes and the
// geometry counter did not move once: flat at 334 for two and a half minutes.
// That is a real finding rather than a broken instrument, and it narrows the
// leak sharply -- whatever grows the counter, it is NOT combat, projectiles,
// floaters, gear swaps or monster death, because that run did all of those
// continuously in one camp and moved nothing.
//
// The runs that DID see growth toured the camps. So this one tours: the same
// twenty-one packs the server places, in polar order so the route is a ring
// rather than a set of crossings, fighting at each and censusing between laps.
// The question it exists to answer is the one M70.145 asked and could not
// afford: does lap three cost as much as lap one?
//
// THE CAMP TABLE IS COPIED, AND THAT IS A LIABILITY worth stating. The server
// builds these with `ringPack(prefix, kind, radius, angleDeg)` and this file
// repeats the radii and angles. If a camp moves, this tours empty ground and
// reports zero fights rather than failing -- so a run that reports far fewer
// fights than usual should be read as "the table drifted", not "the game got
// quieter".

import { open, login, probe, hotbarKeys, step, nearestMonster, keysToward } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const LAPS = Number(process.argv[3] ?? 3);
const FIGHT_MS = Number(process.argv[4] ?? 40000);

const SPAWN = { x: 8000, y: 6000 };

/** [radiusPx, angleDeg] for every pack, in the server's own order. */
const CAMPS = [
  [1320, 0], [1320, 90], [1320, 180], [1320, 270],
  [1600, 45], [1600, 135], [1600, 225], [1600, 315],
  [1900, 20], [1900, 100], [1900, 200], [1900, 280], [2000, 160], [2000, 340],
  [2350, 70], [2350, 190], [2350, 310], [2450, 130], [2450, 250],
  [2750, 140], [2750, 320],
]
  // Polar order, so consecutive waypoints are neighbours and the route is a
  // ring. Touring them in table order crosses the map twenty times and spends
  // the whole run walking.
  .sort((a, b) => a[1] - b[1])
  .map(([r, deg]) => {
    const a = (deg * Math.PI) / 180;
    return { x: SPAWN.x + Math.cos(a) * r, y: SPAWN.y + Math.sin(a) * r, r, deg };
  });

const INSTALL = () => {
  const g = window.__wieldbound;
  let proto = null;
  g.world.scene.traverse((o) => {
    if (proto || !o.geometry) return;
    let p = Object.getPrototypeOf(o.geometry);
    // Identified by what it OWNS, not by class name: esbuild's pre-bundle
    // renames the class to `_BufferGeometry`.
    while (p && !Object.prototype.hasOwnProperty.call(p, "setAttribute")) {
      p = Object.getPrototypeOf(p);
    }
    if (p) proto = p;
  });
  if (!proto) return { ok: false, why: "BufferGeometry.prototype not found" };

  const tracked = new Map();
  const origSetAttribute = proto.setAttribute;
  const origDispose = proto.dispose;
  proto.setAttribute = function (name, attr) {
    if (!this.__wbSeen) {
      this.__wbSeen = true;
      const stack = new Error().stack || "";
      tracked.set(this.uuid, {
        geo: this,
        stack: stack.split("\n").slice(2, 8).map((s) => s.trim()).join(" | "),
        type: this.type,
      });
    }
    return origSetAttribute.call(this, name, attr);
  };
  proto.dispose = function () {
    tracked.delete(this.uuid);
    return origDispose.call(this);
  };

  window.__wbGeo = () => {
    const scene = new Set();
    g.world.scene.traverse((o) => {
      if (o.geometry) scene.add(o.geometry.uuid);
    });
    const by = new Map();
    let held = 0;
    let detached = 0;
    for (const [uuid, rec] of tracked) {
      const geo = rec.geo;
      const isHeld = !!(geo._listeners && geo._listeners.dispose && geo._listeners.dispose.length > 0);
      if (!isHeld) continue;
      held++;
      const inScene = scene.has(uuid);
      if (!inScene) detached++;
      const k = (inScene ? "[scene]  " : "[DETACHED] ") + rec.type + "  " + rec.stack;
      by.set(k, (by.get(k) ?? 0) + 1);
    }
    return {
      rendererCount: g.world.renderer.info.memory.geometries,
      tracked: tracked.size,
      held,
      detached,
      groups: [...by.entries()].sort((a, b) => b[1] - a[1]),
    };
  };
  return { ok: true };
};

const me = (page) =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

/** Walks to a waypoint, sliding along whatever it runs into. Gives up rather
 *  than pushing a fence forever -- a leg that cannot be walked is a fact to
 *  report, not a reason to stall the run. */
async function travelTo(page, wp, budgetMs) {
  const until = Date.now() + budgetMs;
  let sign = 1;
  let blocked = 0;
  while (Date.now() < until) {
    const p = await me(page);
    const d = Math.hypot(wp.x - p.x, wp.y - p.y);
    if (d < 260) return { arrived: true, blocked };
    const dirs = keysToward(p, wp);
    const r = await step(page, dirs, 650);
    if (r.moved < 25) {
      blocked++;
      const perp =
        dirs.includes("w") || dirs.includes("s")
          ? [sign > 0 ? "d" : "a"]
          : [sign > 0 ? "s" : "w"];
      await step(page, perp, 1000);
      sign = -sign;
    }
  }
  return { arrived: false, blocked };
}

/** Fights whatever is here for `ms`, moving the whole time. */
async function fightHere(page, keys, ms) {
  const until = Date.now() + ms;
  let swings = 0;
  while (Date.now() < until) {
    const t = await nearestMonster(page);
    if (t && t.d > 240) {
      const p = await me(page);
      await step(page, keysToward(p, t), 600);
      continue;
    }
    swings++;
    const strafe = step(page, [swings % 2 ? "a" : "d"], 800);
    for (const k of keys) {
      await page.keyboard.press(k);
      await page.waitForTimeout(80);
    }
    await strafe;
  }
  return swings;
}

const run = async () => {
  const { browser, page } = await open({ headless: true });
  const loadMs = await login(page, NAME);
  console.log(`login ${(loadMs / 1000).toFixed(1)}s`);
  const installed = await page.evaluate(INSTALL);
  console.log("tracker:", JSON.stringify(installed));
  if (!installed.ok) {
    await browser.close();
    process.exit(1);
  }
  const keys = await hotbarKeys(page);
  const t0 = Date.now();
  const base = await probe(page);
  console.log("t=0.0m", JSON.stringify(base));

  const lapMarks = [];
  let swings = 0;
  let blocked = 0;
  let arrived = 0;

  for (let lap = 1; lap <= LAPS; lap++) {
    for (const wp of CAMPS) {
      const t = await travelTo(page, wp, 45000);
      blocked += t.blocked;
      if (t.arrived) arrived++;
      swings += await fightHere(page, keys, FIGHT_MS);
      const p = await probe(page);
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(
        `t=${mins}m lap=${lap} camp=${wp.r}@${wp.deg} ${t.arrived ? "ok" : "GAVE UP"} ` +
          `geo=${p.geometries}(+${p.geometries - base.geometries}) tex=${p.textures} ` +
          `prog=${p.programs} heap=${p.heapMB} dom=${p.domNodes} alive=${p.aliveMonsters} ` +
          `swings=${swings} blocked=${blocked}`,
      );
    }
    const p = await probe(page);
    lapMarks.push({ lap, at: (Date.now() - t0) / 60000, geo: p.geometries, tex: p.textures, heap: p.heapMB });
    console.log(`--- LAP ${lap} END  geo=${p.geometries} tex=${p.textures} heap=${p.heapMB}`);
  }

  console.log("\n=== LAP COSTS (the whole point: does lap N cost as much as lap 1?) ===");
  let prevGeo = base.geometries;
  let prevTex = base.textures;
  for (const m of lapMarks) {
    console.log(
      `lap ${m.lap}  +${m.geo - prevGeo} geometries  +${m.tex - prevTex} textures  ` +
        `(cumulative ${m.geo - base.geometries} / ${m.tex - base.textures}, at ${m.at.toFixed(1)}m)`,
    );
    prevGeo = m.geo;
    prevTex = m.tex;
  }

  const c = await page.evaluate(() => window.__wbGeo());
  console.log(
    `\nrenderer=${c.rendererCount} trackedSinceInstall=${c.tracked} held=${c.held} detached=${c.detached}`,
  );
  console.log("\n=== RENDERER-HELD GEOMETRY CREATED SINCE LOGIN, BY SITE ===");
  for (const [k, n] of c.groups.slice(0, 20)) console.log(`${String(n).padStart(4)}  ${k}`);
  console.log(`\narrivedCamps=${arrived}/${LAPS * CAMPS.length} swings=${swings} blocked=${blocked}`);
  console.log("console errors:", page.__errors.length);
  for (const e of page.__errors.slice(0, 10)) console.log("  ", e);
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
