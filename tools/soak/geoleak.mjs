// NAMING THE LEAKED GEOMETRIES INSTEAD OF COUNTING THEM.
//
// M70.146 established that `renderer.info.memory.geometries` climbs at a flat
// ~1.6/min over 44 minutes and never converges, while heap, DOM and programs
// are all flat or falling. A scene-walking census got as far as "detached but
// held", blamed the weapons monsters carry, and was wrong: fixing that
// ownership gap freed real resources and moved the soak rate not at all.
//
// The reason the scene census could not finish the job is that it can only see
// what the SCENE references. A leaked geometry is by definition one the scene
// has let go of and the renderer has not, so the leak lives exactly in that
// blind spot. This instrument looks at the renderer's set instead, and it can,
// because three.js registers every geometry it uploads by adding a 'dispose'
// listener to it (three.module.js, WebGLGeometries.get) and removes that
// listener again when the geometry is disposed. So:
//
//     renderer holds this geometry  ===  geometry._listeners.dispose is non-empty
//
// which is the same set `info.memory.geometries` counts, one by one rather than
// as a total. Pair that with a stack trace captured when the geometry was built
// and a leak stops being a number and becomes a line of code.
//
// VALIDATING THE INSTRUMENT BEFORE BELIEVING IT. The last session produced more
// broken measurements than broken game code, so this one checks itself: the
// geometries it can account for must track `info.memory.geometries` as the run
// goes on. If the two diverge the census is blind to part of the set and its
// answer is worth nothing, so that comparison is printed on every sample rather
// than buried.

import { open, login, probe, hotbarKeys, step, nearestMonster, keysToward } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const MINUTES = Number(process.argv[3] ?? 12);

/** Patches BufferGeometry so every geometry built from now on remembers where
 *  it was built, and forgets it when properly disposed. */
const INSTALL = () => {
  const g = window.__wieldbound;
  // BufferGeometry.prototype is not exported anywhere a probe can reach, so it
  // is found by walking up from a geometry that already exists in the scene.
  //
  // NOT BY CLASS NAME. The first version of this looked for a constructor named
  // "BufferGeometry" and never found one: esbuild's dep pre-bundle renames the
  // class to `_BufferGeometry`, so the chain reads
  // `_BufferGeometry -> EventDispatcher -> Object`. Identify it by what it OWNS
  // instead, which no bundler rewrites: the prototype that declares
  // `setAttribute` is BufferGeometry's, whatever the minifier decided to call it.
  let proto = null;
  g.world.scene.traverse((o) => {
    if (proto || !o.geometry) return;
    let p = Object.getPrototypeOf(o.geometry);
    while (p && !Object.prototype.hasOwnProperty.call(p, "setAttribute")) {
      p = Object.getPrototypeOf(p);
    }
    if (p) proto = p;
  });
  if (!proto) return { ok: false, why: "BufferGeometry.prototype not found" };

  // uuid -> { geo, stack, type }. This holds the geometry OBJECT, deliberately:
  // a detached geometry cannot be inspected through a scene walk, which is the
  // whole reason the previous census could not finish. It is an instrument-side
  // leak, correct for a diagnostic run and unacceptable in ship code.
  const tracked = new Map();
  const origSetAttribute = proto.setAttribute;
  const origDispose = proto.dispose;

  // setAttribute rather than the constructor: a constructor cannot be patched
  // after the fact, and every geometry that will ever be drawn gets at least a
  // position attribute -- including the ones clone() and copy() produce, which
  // is where two of the three gear paths live.
  proto.setAttribute = function (name, attr) {
    if (!this.__wbSeen) {
      this.__wbSeen = true;
      const stack = new Error().stack || "";
      tracked.set(this.uuid, {
        geo: this,
        // Drop the "Error" line and this patch's own frame.
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

  window.__wbGeo = {
    census() {
      const scene = new Set();
      g.world.scene.traverse((o) => {
        if (o.geometry) scene.add(o.geometry.uuid);
      });
      const rows = [];
      for (const [uuid, rec] of tracked) {
        const geo = rec.geo;
        const held = !!(geo._listeners && geo._listeners.dispose && geo._listeners.dispose.length > 0);
        rows.push({ uuid, stack: rec.stack, type: rec.type, held, inScene: scene.has(uuid) });
      }
      return rows;
    },
  };
  return { ok: true };
};

const CENSUS = () => {
  const g = window.__wieldbound;
  const rows = window.__wbGeo.census();
  const heldDetached = rows.filter((r) => r.held && !r.inScene);
  const heldInScene = rows.filter((r) => r.held && r.inScene);
  const group = (list) => {
    const by = new Map();
    for (const r of list) {
      const k = r.type + "  " + r.stack;
      by.set(k, (by.get(k) ?? 0) + 1);
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
  return {
    rendererCount: g.world.renderer.info.memory.geometries,
    trackedTotal: rows.length,
    heldTotal: heldDetached.length + heldInScene.length,
    heldDetached: heldDetached.length,
    heldInScene: heldInScene.length,
    detachedGroups: group(heldDetached),
    heldGroups: group([...heldDetached, ...heldInScene]),
  };
};

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
  console.log("hotbar keys:", JSON.stringify(keys));

  const t0 = Date.now();
  const endAt = t0 + MINUTES * 60000;
  let nextSample = t0 + 30000;
  let fights = 0;
  let blocked = 0;
  let sidestepSign = 1;

  const first = await probe(page);
  const baseGeo = first.geometries;
  console.log("t=0.0m", JSON.stringify(first));

  while (Date.now() < endAt) {
    const target = await nearestMonster(page);
    if (!target) {
      await step(page, ["w"], 800);
    } else if (target.d > 220) {
      const me = await page.evaluate(() => ({
        x: window.__wieldbound.playerX,
        y: window.__wieldbound.playerY,
      }));
      const dirs = keysToward(me, target);
      const r = await step(page, dirs, 700);
      // BLOCKED, NOT WALKING. A fence, a tree or a building absorbs the whole
      // leg and the naive loop pushes into it forever. Slide along it instead,
      // alternating sides so a corner cannot trap the bot in a two-step cycle.
      if (r.moved < 25) {
        blocked++;
        const perp =
          dirs.includes("w") || dirs.includes("s")
            ? [sidestepSign > 0 ? "d" : "a"]
            : [sidestepSign > 0 ? "s" : "w"];
        await step(page, perp, 900);
        sidestepSign = -sidestepSign;
      }
    } else {
      fights++;
      // FIGHTING WHILE MOVING, because standing still for the duration of a
      // fight hides exactly the stalls a soak is looking for.
      const strafe = step(page, [fights % 2 ? "a" : "d"], 900);
      for (const k of keys) {
        await page.keyboard.press(k);
        await page.waitForTimeout(90);
      }
      await strafe;
    }

    if (Date.now() >= nextSample) {
      nextSample += 30000;
      const p = await probe(page);
      const c = await page.evaluate(CENSUS);
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      // `accounted` is the self-check: renderer growth the census can name,
      // against renderer growth that actually happened. They must agree.
      console.log(
        `t=${mins}m fights=${fights} blocked=${blocked} geo=${p.geometries}(+${p.geometries - baseGeo}) ` +
          `tex=${p.textures} prog=${p.programs} heap=${p.heapMB} dom=${p.domNodes} alive=${p.aliveMonsters} ` +
          `| held=${c.heldTotal} detached=${c.heldDetached} tracked=${c.trackedTotal} ` +
          `accounted=${c.heldTotal}/${p.geometries - baseGeo}`,
      );
    }
  }

  const last = await probe(page);
  const c = await page.evaluate(CENSUS);
  console.log("\n=== FINAL ===");
  console.log(JSON.stringify(last));
  console.log(`fights=${fights} blocked=${blocked} geoDelta=${last.geometries - baseGeo}`);
  console.log(
    `renderer=${c.rendererCount} trackedSinceInstall=${c.trackedTotal} ` +
      `held=${c.heldTotal} heldDetached=${c.heldDetached} heldInScene=${c.heldInScene}`,
  );
  console.log("\n=== RENDERER-HELD AND DETACHED FROM THE SCENE, BY CREATION SITE ===");
  for (const [k, n] of c.detachedGroups) console.log(`${String(n).padStart(4)}  ${k}`);
  console.log("\n=== ALL RENDERER-HELD SINCE INSTALL, BY CREATION SITE ===");
  for (const [k, n] of c.heldGroups) console.log(`${String(n).padStart(4)}  ${k}`);
  console.log("\nconsole errors:", page.__errors.length);
  for (const e of page.__errors.slice(0, 8)) console.log("  ", e);
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
