// A REUSABLE PLAYWRIGHT DRIVER FOR WIELDBOUND, kept in the repo on purpose.
//
// Every soak harness before this one lived in a scratchpad directory, and when
// the work moved to another machine none of it came along — the next session
// spent its first hour rebuilding a driver instead of chasing the bug. The
// browser binary cannot be committed; the knowledge of how to drive the game
// can be, and that was always the expensive half.
//
// WHAT THIS FILE KNOWS THAT COST TIME TO LEARN, each one a run that produced a
// confident and wrong number before the cause was found:
//
//  - A canvas click does NOT blur the login input, and `bindInput` ignores
//    every keydown whose target is an INPUT. Without an explicit blur, every
//    movement key is silently swallowed and the bot stands still for the whole
//    run while reporting that it pressed thousands of keys.
//  - Stuck detection has to compare position BEFORE and AFTER a move. Sampling
//    only afterwards makes a moving character look motionless, which sent one
//    run detouring past every camp it was supposed to fight in.
//  - Walking a fixed N/E/S/W rotation in equal legs is a CLOSED LOOP. It comes
//    back to where it started and never leaves town, which looks like exploring
//    right up until you plot it.
//  - Headed Chromium throttles to about 1fps when its window is not focused,
//    which manufactures fake ~1000ms hitches. Use headless for anything timed
//    over a long run; use headed only for load timing, where headless's
//    SwiftShader (no KHR_parallel_shader_compile) is the bigger distortion.
//  - Hotbar keys are DATA (`hotbar.layout.keys`), not fixed to 1..9. Read them.
//
// TypeScript's `private` is a compile-time fiction, so `__wieldbound` exposes
// the whole Game to a probe: `playerX`, `playerY`, `monsters`, `hotbar` are all
// readable at runtime and none of them need a debug hook added to ship code.

import { chromium } from "playwright";

export const CLIENT_URL = "http://localhost:5173";

/** Opens a browser and returns { browser, page }. Headless by default; see the
 *  note above for the one case where that is the wrong choice. */
export async function open({ headless = true, width = 1600, height = 900 } = {}) {
  const browser = await chromium.launch({
    headless,
    args: [
      // SwiftShader is the headless default and it is fine for anything that
      // counts objects. It is NOT fine for load timing, because it has no
      // parallel shader compile — that measurement needs `headless: false`.
      "--use-gl=angle",
      "--enable-unsafe-swiftshader",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
    ],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 300)));
  page.__errors = errors;
  return { browser, page };
}

/** Logs in as `name` and waits for the world to actually be running. */
export async function login(page, name, { timeout = 180000 } = {}) {
  const t0 = Date.now();
  await page.goto(CLIENT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#name-input", { timeout: 30000 });
  await page.fill("#name-input", name);
  await page.click("#play-button");
  // WAIT FOR THE LOADING SCREEN TO GO, and nothing weaker.
  //
  // `running` is set at the TOP of `start()`, before a single asset is loaded,
  // so waiting on it returns in about three seconds with an empty scene. The
  // obvious repair — wait for `localActor` and a scene's worth of uploaded
  // geometry — is better and still wrong: it lands partway through the load,
  // while the world is still being warmed. Two measurements were quietly ruined
  // by that. A load-time run reported 6.4s and three phases, because it stopped
  // the clock in the middle of the sequence. And a gear probe drove twenty-five
  // weapon swaps into a client that was still loading, then saved a screenshot
  // of the LOADING SCREEN — which, as it happens, is how the swap crash was
  // found, but by luck rather than design.
  //
  // `LoadingScreen.finish` removes its own element, so its absence is the
  // game's own statement that the load is over. Nothing here has to guess.
  await page.waitForFunction(
    () => {
      const g = window.__wieldbound;
      const root = document.getElementById("game-root");
      return (
        !!g &&
        !!g.running &&
        !!g.localActor &&
        !!root &&
        getComputedStyle(root).display !== "none" &&
        !document.getElementById("loading")
      );
    },
    null,
    { timeout },
  );
  // THE BLUR THAT MAKES EVERY KEYPRESS AFTER THIS POINT COUNT. See the header.
  await page.evaluate(() => document.activeElement?.blur?.());
  return Date.now() - t0;
}

/** Everything a sample wants to know, in one round trip. */
export async function probe(page) {
  return page.evaluate(() => {
    const g = window.__wieldbound;
    const info = g.world.renderer.info;
    let alive = 0;
    let nearest = Infinity;
    for (const v of g.monsters.values()) {
      if (v.state?.status !== "alive") continue;
      alive++;
      const d = Math.hypot(v.state.x - g.playerX, v.state.y - g.playerY);
      if (d < nearest) nearest = d;
    }
    return {
      x: Math.round(g.playerX),
      y: Math.round(g.playerY),
      hp: Math.round(g.hp ?? -1),
      level: g.level ?? -1,
      aliveMonsters: alive,
      nearestMonsterPx: Number.isFinite(nearest) ? Math.round(nearest) : -1,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      heapMB: performance.memory
        ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)
        : -1,
      domNodes: document.getElementsByTagName("*").length,
    };
  });
}

/** The hotbar's actual bound keys, attack first. Never assume 1..9. */
export async function hotbarKeys(page) {
  return page.evaluate(() => {
    const g = window.__wieldbound;
    const keys = g.hotbar?.layout?.keys ?? [];
    return keys.filter((k) => typeof k === "string" && k.length > 0);
  });
}

/** Holds a direction for `ms`, then reports how far the character ACTUALLY
 *  travelled — which is the only way to tell walking from shoving a fence. */
export async function step(page, keys, ms) {
  const before = await page.evaluate(() => {
    const g = window.__wieldbound;
    return { x: g.playerX, y: g.playerY };
  });
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
  const after = await page.evaluate(() => {
    const g = window.__wieldbound;
    return { x: g.playerX, y: g.playerY };
  });
  return { moved: Math.hypot(after.x - before.x, after.y - before.y), ...after };
}

/** Where the nearest living monster is, in server pixels, or null. */
export async function nearestMonster(page) {
  return page.evaluate(() => {
    const g = window.__wieldbound;
    let best = null;
    let bestD = Infinity;
    for (const v of g.monsters.values()) {
      if (v.state?.status !== "alive") continue;
      const d = Math.hypot(v.state.x - g.playerX, v.state.y - g.playerY);
      if (d < bestD) {
        bestD = d;
        best = { x: v.state.x, y: v.state.y, d, kind: v.state.kind };
      }
    }
    return best;
  });
}

// THE TOWN HAS A WALL, AND IT HAS THREE DOORS.
//
// `TOWN_RADIUS_PX` is 800 and `TOWN_GATES` cuts openings at 0, 180 and 256
// degrees. A bot that walks straight at its destination from inside the
// palisade pushes at whichever wall segment lies between, forever. A level 1
// starting at the arrival point did exactly that for seven of an eight-minute
// run — 65 blocked legs, 21px/s average, and a report of "no invariant
// violations" that meant nothing at all.
//
// The endgame character never showed this because it is always already outside.
// Anything that starts a fresh character has to leave through a gate.
export const TOWN_CENTER = { x: 8000, y: 6000 };
export const TOWN_RADIUS_PX = 800;
const GATE_ANGLES_DEG = [0, 180, 256];

/** True while the point is inside the palisade (with a little margin). */
export function insideTown(p) {
  return Math.hypot(p.x - TOWN_CENTER.x, p.y - TOWN_CENTER.y) < TOWN_RADIUS_PX + 60;
}

/** A point just outside the gate nearest `from`'s current bearing. */
export function gateWaypoint(from) {
  const bearing = (Math.atan2(from.y - TOWN_CENTER.y, from.x - TOWN_CENTER.x) * 180) / Math.PI;
  let best = GATE_ANGLES_DEG[0];
  let bestDelta = Infinity;
  for (const g of GATE_ANGLES_DEG) {
    const delta = Math.abs(((g - bearing + 540) % 360) - 180);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = g;
    }
  }
  const a = (best * Math.PI) / 180;
  // Well clear of the opening, so the next leg does not immediately re-enter.
  return {
    x: TOWN_CENTER.x + Math.cos(a) * (TOWN_RADIUS_PX + 260),
    y: TOWN_CENTER.y + Math.sin(a) * (TOWN_RADIUS_PX + 260),
  };
}

/** The WASD keys that point from the player toward (x, y). */
export function keysToward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const out = [];
  // Server +y is south, and "s" walks south, so the sign is direct.
  if (Math.abs(dx) > 40) out.push(dx > 0 ? "d" : "a");
  if (Math.abs(dy) > 40) out.push(dy > 0 ? "s" : "w");
  return out.length ? out : ["w"];
}
