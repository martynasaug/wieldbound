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
import { TOWN_PROPS, TOWN_BUILDINGS, propPosition } from "../../shared/town.ts";
import { riverPath, roadRiverCrossings, BRIDGE_HALF_SPAN_PX } from "../../shared/river.ts";
import { BASE_MOVE_SPEED_PX_PER_SEC } from "../../shared/protocol-types.ts";

/** Walking pace, taken from the game rather than guessed, so the leg clamp in
 *  `approach` stays correct if the game ever changes it. Gear and agility can
 *  only raise a character's real speed, which makes the clamp more
 *  conservative rather than less. */
const MOVE_PX_PER_SEC = BASE_MOVE_SPEED_PX_PER_SEC;

// OVERRIDABLE, because the dev server and a production build are not the same
// program to measure. `checkShaderErrors` is on under `vite dev` and off in a
// build (see World.ts), and it turned out to be 85% of the load's busiest
// 800ms — so a load profile taken against :5173 describes a machine no player
// runs. Point this at `vite preview` to profile what ships:
//
//   WB_CLIENT_URL=http://localhost:4173 node tools/soak/loadslice.mjs
export const CLIENT_URL = process.env.WB_CLIENT_URL ?? "http://localhost:5173";

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

// AND THE TOWN IS AN OBSTACLE TWICE, depending on which side of it you start.
//
// `gateWaypoint` handles LEAVING: you are inside, the destination is outside,
// so walk to a door. It does nothing for PASSING, where both ends are outside
// and the straight line happens to run through Emberhold — and `steerToward`
// cannot save that either, because it fans bearings over a 240px lookahead and
// the palisade is sixteen hundred pixels across. The bot walks into the wall
// and grinds.
//
// This showed up the moment the river routing started working. With the
// south-east wilds finally reachable, the next stop was the WEST wilds, and the
// line between them goes straight through the town: `wilds-west GAVE UP 2436px`
// having stopped dead against the eastern palisade.
//
// A door is the wrong answer here. Nobody walks in the front gate and out the
// back to get past a town, and routing that way needs the gate logic to know
// which door it came in by, which it deliberately does not. You walk AROUND.
// So: take the tangent to the palisade on whichever side is shorter, which is
// the path a person takes without thinking about it.

/** Distance from `c` to the segment `a`-`b`. */
function pointToSegment(c, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / lenSq)) : 0;
  return Math.hypot(c.x - (a.x + dx * t), c.y - (a.y + dy * t));
}

/** True when the straight line from `from` to `to` runs through the town but
 *  neither end is in it — the "passing through" case, not the "leaving" one. */
export function crossesTown(from, to) {
  if (insideTown(from) || insideTown(to)) return false;
  return pointToSegment(TOWN_CENTER, from, to) < TOWN_RADIUS_PX + 40;
}

/**
 * A point on the tangent to the palisade, on the shorter side.
 *
 * Two tangents leave any point outside a circle. Whichever ends up closer to
 * the destination is the way round, and aiming at the tangent POINT rather than
 * along the tangent line means the leg re-decides as the character rounds the
 * wall instead of committing to one long arc.
 */
export function skirtTown(from, to) {
  const R = TOWN_RADIUS_PX + 200;
  const dx = TOWN_CENTER.x - from.x;
  const dy = TOWN_CENTER.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= R) return to; // already inside the skirt; the gate logic owns this
  const base = Math.atan2(dy, dx);
  const spread = Math.acos(Math.min(1, R / d));
  // The tangent points, as bearings FROM the town centre.
  const options = [base + Math.PI - spread, base + Math.PI + spread].map((a) => ({
    x: TOWN_CENTER.x + Math.cos(a) * R,
    y: TOWN_CENTER.y + Math.sin(a) * R,
  }));
  let best = options[0];
  let bestCost = Infinity;
  for (const o of options) {
    const cost = Math.hypot(o.x - from.x, o.y - from.y) + Math.hypot(to.x - o.x, to.y - o.y);
    if (cost < bestCost) {
      bestCost = cost;
      best = o;
    }
  }
  return best;
}

// THE RIVER IS THE SECOND OBSTACLE WITH A DOOR.
//
// `tour.mjs` reported `wilds-east  GAVE UP  2601px from the mark` on three runs
// out of three, always stopped at the water with "The Coldwater" under its feet.
// Nothing was broken: the stop is south-east of spawn, the tour reaches it after
// the frontier, and `river.ts` says in capitals that THE BRIDGE IS THE ONLY WAY
// ACROSS. The bot walked to the bank and pushed.
//
// This is exactly the case the gate logic already handles for the palisade —
// "the one obstacle with a door, and steering cannot find a door" — and
// `steerToward` fails at it for the same reason: it fans bearings looking for a
// clear line, and every bearing across a river is clear as far as the town
// geometry is concerned. A barrier with a single crossing has to be routed to,
// not steered around.
//
// The consequence of leaving it was not a failed harness, it was a blind spot:
// the whole south-east of the map went unphotographed on every tour, so
// anything wrong there could not be seen.

/** Inside this of the crossing you are on the bridge approach, not travelling
 *  to it, so aim straight across. Comfortably more than the deck plus its
 *  ramps (`BRIDGE_HALF_SPAN_PX` 320 plus `BRIDGE_RAMP_PX` 420 either side). */
const BRIDGE_APPROACH_PX = 620;

/** The river's y at a given x. The course is monotone in x by construction —
 *  `river.ts` relies on that for its own bucket index — so this is a lookup
 *  along the polyline rather than a nearest-point search. */
function riverYAt(x) {
  const path = riverPath();
  if (x <= path[0].x) return path[0].y;
  const last = path[path.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 1; i < path.length; i++) {
    if (path[i].x >= x) {
      const a = path[i - 1];
      const b = path[i];
      const span = b.x - a.x;
      return span === 0 ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / span;
    }
  }
  return last.y;
}

/** Which bank a point is on: -1 north of the water, +1 south of it. */
export function riverSide(p) {
  return p.y < riverYAt(p.x) ? -1 : 1;
}

/**
 * Where to aim when the water is between here and there.
 *
 * TWO STAGES, because one is not enough. Aiming straight at the far abutment
 * from anywhere cuts the corner and walks into the river, since nothing between
 * here and there is solid in the sense `pathClear` understands. So: walk to the
 * near abutment first, and only once standing on it aim past the far one.
 *
 * The far point is placed BEYOND the deck rather than on it. The side test
 * flips halfway across, and a leg that ends mid-span would hand control back to
 * a caller that now believes it has arrived — which aims at the destination and
 * walks off the parapet.
 */
export function bridgeWaypoint(from, to) {
  const crossing = roadRiverCrossings()[0];
  if (!crossing) return to;
  const a = (crossing.angleDeg * Math.PI) / 180;
  const reach = BRIDGE_HALF_SPAN_PX + 300;
  const ends = [
    { x: crossing.x + Math.cos(a) * reach, y: crossing.y + Math.sin(a) * reach },
    { x: crossing.x - Math.cos(a) * reach, y: crossing.y - Math.sin(a) * reach },
  ];
  const wantSide = riverSide(to);
  const far = ends.find((e) => riverSide(e) === wantSide) ?? ends[0];
  const near = ends.find((e) => e !== far) ?? ends[1];

  // STAGE ON THE DISTANCE TO THE CROSSING, NOT TO THE NEAR ABUTMENT, and that
  // distinction is the whole of the first attempt's bug. Keyed on the abutment,
  // a character standing 170px from the deck on the wrong bank was sent 449px
  // back down the road to "approach properly" before turning round — so the
  // northbound stops, which arrive at the bridge and then want to cross it,
  // walked away from the water and ran out of budget. `road-north` and
  // `frontier` both gave up at (7951, 2764), one hundred and seventy pixels
  // from the door.
  //
  // Anyone already within the approach is at the door and should just walk
  // through it. Staging is for arriving from somewhere else entirely — the
  // south-east wilds, where the bank is two thousand pixels of open ground away
  // from any part of the road.
  const toCrossing = Math.hypot(crossing.x - from.x, crossing.y - from.y);
  const toNear = Math.hypot(near.x - from.x, near.y - from.y);
  return toCrossing < BRIDGE_APPROACH_PX || toNear < 240 ? far : near;
}

// STEERING AROUND THINGS, RATHER THAN DISCOVERING THEM BY WALKING INTO THEM.
//
// Reported from watching a run: "your gameplay is running into a town fence and
// into building wall", and then "and running into town decoration objects".
// Both true. Every harness aimed straight at its destination and only reacted
// AFTER a leg failed — so the bot ground along the palisade, shouldered
// buildings and shoved benches for seconds at a time. It eventually got there,
// which is why the measurements were not obviously wrong, but a character
// scraping down a wall is not playing the game and anything measured while it
// does is measuring that instead.
//
// The obstacles are not a mystery: the town is built from `TOWN_PROPS` and
// `TOWN_BUILDINGS` in `shared/`, the same tables the collision resolver reads.
// So the bot can know where they are for the same reason the game does.
const OBSTACLES = [
  ...TOWN_PROPS.filter((p) => p.blockRadiusPx > 0).map((p) => {
    const at = propPosition(p);
    return { x: at.x, y: at.y, r: p.blockRadiusPx };
  }),
  // Buildings as circles. An overestimate — a rectangle's corner is further out
  // than its edge — and deliberately so: the cost of steering a little wide of a
  // wall is nothing, and the cost of clipping it is the grinding this exists to
  // remove.
  ...TOWN_BUILDINGS.map((b) => ({ x: b.x, y: b.y, r: Math.max(b.widthPx, b.depthPx) * 0.55 })),
];

/** Closest approach of a circle centre to a segment. */
function distanceToSegment(cx, cy, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / len2)) : 0;
  return Math.hypot(cx - (ax + vx * t), cy - (ay + vy * t));
}

/** Is the straight line from `from` to `to` clear of everything solid? */
function pathClear(from, to, pad) {
  for (const o of OBSTACLES) {
    if (distanceToSegment(o.x, o.y, from.x, from.y, to.x, to.y) < o.r + pad) return false;
  }
  return true;
}

/**
 * An aim point that heads toward `to` without walking through anything.
 *
 * Fans out from the direct bearing until it finds one that is clear for a
 * lookahead, which is the cheapest steering that actually works: the bot leans
 * around a bench a stride before reaching it instead of finding it with its
 * face. Falls back to the direct line when everything is blocked, so a bot
 * boxed in still tries rather than standing still.
 */
export function steerToward(from, to, lookaheadPx = 240, pad = 26) {
  const base = Math.atan2(to.y - from.y, to.x - from.x);
  const reach = Math.min(lookaheadPx, Math.hypot(to.x - from.x, to.y - from.y));
  for (const offset of [0, 18, -18, 36, -36, 54, -54, 74, -74, 96, -96, 120, -120]) {
    const a = base + (offset * Math.PI) / 180;
    const probe = { x: from.x + Math.cos(a) * reach, y: from.y + Math.sin(a) * reach };
    if (pathClear(from, probe, pad)) return probe;
  }
  return to;
}

/**
 * Get a wedged character moving again, whatever it is caught on.
 *
 * A single alternating sidestep cannot leave a corner, and a character saved
 * inside a building's footprint is worse than a corner: the server pushes it out
 * every tick while the client pushes it back in, and the net movement is two or
 * three pixels a second in whatever direction the argument happens to settle.
 * Observed on a seeded character parked against the palisade — every harness
 * pointed at it reported zero fights and a clean pass.
 *
 * So try every direction in turn and keep the one that actually goes somewhere.
 * Returns true if the character is loose.
 */
export async function unstick(page, minPx = 120) {
  const dirs = [["w"], ["d"], ["s"], ["a"], ["w", "d"], ["s", "d"], ["s", "a"], ["w", "a"]];
  for (const d of dirs) {
    const r = await step(page, d, 1600);
    if (r.moved >= minPx) return true;
  }
  return false;
}

/**
 * One leg of walking toward a target, gate-aware and unstick-aware.
 *
 * FACTORED OUT BECAUSE IT WAS LEARNED TWICE. Every harness here has to leave
 * town through a gate and slide along whatever it walks into, and a harness that
 * forgets either one does not fail — it quietly does nothing and reports a pass.
 * `bagspam.mjs` was written without it, walked a character standing inside the
 * palisade straight at a monster outside it, and reported "0 warnings, 0 swings"
 * as a clean result.
 *
 * Returns how far the character actually moved, so the caller can tell walking
 * from shoving a fence.
 */
export async function approach(page, target, ms = 600, sign = 1) {
  const p = await page.evaluate(() => ({
    x: window.__wieldbound.playerX,
    y: window.__wieldbound.playerY,
  }));
  // The two barriers with doors first, in the order they are met — steering
  // cannot find a door, so both have to be routed to. The palisade comes first
  // because the town sits south of the water: leaving through a gate and then
  // crossing at the bridge is the order a player walks it, and re-deciding
  // every leg means the chain needs no state.
  //
  // Then steer around whatever furniture is on the way.
  const gated = insideTown(p) && !insideTown(target)
    ? gateWaypoint(p)
    : riverSide(p) !== riverSide(target)
      ? bridgeWaypoint(p, target)
      : crossesTown(p, target)
        ? skirtTown(p, target)
        : target;
  const aim = steerToward(p, gated);
  const dirs = keysToward(p, aim);
  // NEVER STEP FURTHER THAN HALF THE REMAINING DISTANCE.
  //
  // A fixed leg overshoots once the target is closer than the leg is long, and
  // because movement is EIGHT-WAY the return trip cannot retrace the same line
  // — so the character orbits instead of arriving. Logged against a bush, the
  // last legs of an approach read 40, 60, 38, 56, 35, 53, 34, 50px: converging
  // to about 35 and bouncing straight back out past 50, forever.
  //
  // That is not a near-miss. `INTERACTION_RANGE_PX` is 40, so every sample on
  // the way out is refused, and a harness that samples on the wrong beat
  // reports "Too far away to gather that" while standing beside the thing. Two
  // probes and part of a guided-opening run were spent on that before it was
  // measured: it looked like trees and bushes being ungatherable while rocks
  // worked, which is a very convincing shape for a game bug.
  //
  // Halving keeps the approach geometric — it always closes, never overshoots,
  // and the floor stops the last few pixels taking a hundred legs.
  const remaining = Math.hypot(target.x - p.x, target.y - p.y);
  const legMs = Math.max(45, Math.min(ms, (remaining / MOVE_PX_PER_SEC) * 1000 * 0.35));
  const r = await step(page, dirs, legMs);
  // STUCK IS RELATIVE TO HOW FAR THIS LEG WAS EVER GOING TO GO.
  //
  // The flat 25px threshold below assumed a leg of several hundred milliseconds.
  // Once the clamp above shortens the last legs of an approach to 45ms — about
  // ten pixels — every one of them looks wedged, and the sidestep-then-unstick
  // escalation fires on a character that is arriving perfectly well. Logged: it
  // closed to 29px and was then thrown to 228px by its own rescue.
  const expected = (legMs / 1000) * MOVE_PX_PER_SEC;
  if (r.moved < Math.min(25, expected * 0.4)) {
    const perp =
      dirs.includes("w") || dirs.includes("s")
        ? [sign > 0 ? "d" : "a"]
        : [sign > 0 ? "s" : "w"];
    const side = await step(page, perp, 900);
    // Sidestepping failed too, so this is not a wall being brushed — it is a
    // wedge. Escalate rather than spending the rest of the run at three pixels
    // a second, which is what every harness pointed at a stuck character did.
    if (side.moved < 25) await unstick(page);
  }
  return r.moved;
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
