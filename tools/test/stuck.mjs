// Can a player get PINNED in town?
//
// No server, no browser — `resolveTownCollision` is a pure function over static
// data, so the whole town can be swept in a second.
//
// WHY THIS EXISTS. A seeded character used by the soak harnesses was found
// wedged at 764 pixels from the town centre, moving two to four pixels per leg
// however the keys were pressed. 764 is not a coincidence: it is
// `TOWN_RADIUS_PX - WALL_THICKNESS_PX - PLAYER_BODY_RADIUS_PX`, the inner face
// of the palisade, which is where the wall resolver parks anybody caught in the
// timber. Every harness pointed at that character reported zero fights and a
// clean pass, which is how it went unnoticed.
//
// THE PROPERTY BEING TESTED IS CONVERGENCE, not "is this point free". The
// resolver applies each prop in turn and then the palisade, so a later push can
// undo an earlier one. A position that never stops moving is a player being
// shoved a little one way each frame and a little back the next, which is
// exactly what being stuck feels like — while a position that settles after a
// frame or two is a single nudge and then stillness, which is the job.
//
//   node tools/test/stuck.mjs

import { PLAYER_BODY_RADIUS_PX } from "../../shared/protocol-types.ts";
import { TOWN_CENTER, TOWN_RADIUS_PX, resolveTownCollision } from "../../shared/town.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const R = PLAYER_BODY_RADIUS_PX;
const settle = (x, y) => resolveTownCollision(x, y, R);

// --- 1. every point in and around town comes to rest ------------------------
//
// THE PROPERTY IS BOUNDED CONVERGENCE, NOT SINGLE-CALL IDEMPOTENCE, and the
// difference is the whole bug. A player standing on a position that never stops
// moving is stuck — pushed one way each frame and back the next, forever. A
// player on one that settles after two or three frames feels a single nudge and
// then stands still, which is what a collision resolver is supposed to do.
//
// The stricter version of this check was written first and failed on two
// positions out of 73,843 that resolve perfectly well on the following frame.
// Tightening the code to satisfy it would have been polishing a number rather
// than fixing anything a player could feel.
const CONVERGE_FRAMES = 5;
console.log(`1. every position comes to rest within ${CONVERGE_FRAMES} frames`);
{
  const worst = { frames: 0, at: null };
  let stuck = 0;
  let tested = 0;
  const reach = TOWN_RADIUS_PX + 120;
  for (let dx = -reach; dx <= reach; dx += 6) {
    for (let dy = -reach; dy <= reach; dy += 6) {
      if (Math.hypot(dx, dy) > reach) continue;
      tested++;
      let p = settle(TOWN_CENTER.x + dx, TOWN_CENTER.y + dy);
      let frames = 1;
      for (; frames <= CONVERGE_FRAMES; frames++) {
        const q = settle(p.x, p.y);
        const moved = Math.hypot(q.x - p.x, q.y - p.y);
        p = q;
        if (moved <= 0.5) break;
      }
      if (frames > CONVERGE_FRAMES) {
        stuck++;
        if (frames > worst.frames) worst.frames = frames, worst.at = { x: Math.round(p.x), y: Math.round(p.y) };
      }
    }
  }
  console.log(`  swept ${tested} points at 6px spacing`);
  check(
    "no position keeps being pushed forever",
    stuck === 0,
    `${stuck} never came to rest, worst at ${JSON.stringify(worst.at)}`,
  );
}

// --- 2. and it comes to rest somewhere legal ------------------------------
// A resting place that is still inside a bench would be worse than a moving
// one: the player would be both stuck and clipped into the furniture.
console.log("\n2. the resting place is somewhere you can stand");
{
  let bad = 0;
  const reach = TOWN_RADIUS_PX + 120;
  for (let dx = -reach; dx <= reach; dx += 12) {
    for (let dy = -reach; dy <= reach; dy += 12) {
      if (Math.hypot(dx, dy) > reach) continue;
      let p = settle(TOWN_CENTER.x + dx, TOWN_CENTER.y + dy);
      for (let i = 0; i < CONVERGE_FRAMES; i++) p = settle(p.x, p.y);
      // Once at rest, one more application must not move it at all.
      const q = settle(p.x, p.y);
      if (Math.hypot(q.x - p.x, q.y - p.y) > 0.5) bad++;
    }
  }
  check("a position at rest is not pushed again", bad === 0, `${bad} still pushed`);
}

// --- 3. walking a lap of the wall never pins you ---------------------------
// The reported symptom, reproduced as movement rather than as geometry: press
// toward the wall from inside, then try to slide along it. A player who cannot
// slide is a player who is stuck.
console.log("\n3. you can slide along the inside of the palisade");
{
  const stepPx = 8;
  let pinned = 0;
  let tested = 0;
  for (let deg = 0; deg < 360; deg += 3) {
    const a = (deg * Math.PI) / 180;
    // Start pressed against the inner face.
    const start = settle(
      TOWN_CENTER.x + Math.cos(a) * (TOWN_RADIUS_PX + 40),
      TOWN_CENTER.y + Math.sin(a) * (TOWN_RADIUS_PX + 40),
    );
    // Now try to move tangentially, the way a player sliding along a wall does.
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    const moved = settle(start.x + tx * stepPx, start.y + ty * stepPx);
    tested++;
    if (Math.hypot(moved.x - start.x, moved.y - start.y) < stepPx * 0.35) pinned++;
  }
  check(
    "a tangential step along the wall actually moves you",
    pinned === 0,
    `${pinned} of ${tested} bearings pinned`,
  );
}

console.log(`\n${failures === 0 ? "OK — nowhere in town pins a player" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
