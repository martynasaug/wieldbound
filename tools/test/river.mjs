// Checks the Coldwater and the bridge. No server needed — pure geometry.
//
// The river has exactly one gameplay property, and it is a claim about the
// whole map rather than about the water: the frontier north of it is reachable
// at one point and that point is on the road. Every failure mode of that claim
// is silent. A course that stopped short of the world edge would leave a way
// round it that nothing on screen would show. A bridge derived from the wrong
// intersection would stand in a field. A collision that pushed to the wrong
// bank would teleport a traveller back where they came from, once, on a bend.
//
//   node tools/test/river.mjs

import { readFileSync } from "node:fs";
import {
  PLAYER_SPAWN,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_BODY_RADIUS_PX,
} from "../../shared/protocol-types.ts";
import { TOWN_RADIUS_PX, inTown, insideAnyBuilding } from "../../shared/town.ts";
import { LANDMARKS, landmarkPosition, LANDMARK_REACH_PX } from "../../shared/landmarks.ts";
import { ROAD_HALF_WIDTH_PX, roadPath, distanceToRoad } from "../../shared/road.ts";
import {
  RIVER_WAYPOINTS,
  RIVER_HALF_WIDTH_PX,
  RIVER_CLEARANCE_PX,
  BRIDGE_HALF_SPAN_PX,
  BRIDGE_HALF_WIDTH_PX,
  BRIDGE_WALK_HALF_PX,
  BRIDGE_RAMP_PX,
  bridgeFrame,
  bridgePoint,
  riverPath,
  riverAt,
  distanceToRiver,
  roadRiverCrossings,
  bridgeAt,
  onBridge,
  inRiver,
  resolveRiverCollision,
} from "../../shared/river.ts";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n== ${name} ==`);

// The camps and node rings, read out of the server's own seeding rather than
// restated — the same rule the road and waystone tests keep. A copy agrees on
// the day it is written and stops agreeing the first time a camp moves.
const src = readFileSync(new URL("../../server/src/index.ts", import.meta.url), "utf8");
const at = (r, a) => ({
  x: PLAYER_SPAWN.x + Math.cos((a * Math.PI) / 180) * r,
  y: PLAYER_SPAWN.y + Math.sin((a * Math.PI) / 180) * r,
});
const camps = [...src.matchAll(/ringPack\(\s*"[^"]+",\s*"[^"]+",\s*(\d+),\s*(\d+)/g)].map((m) =>
  at(Number(m[1]), Number(m[2])),
);
const nodeRings = [...src.matchAll(/ringNodes\(\s*"[^"]+",\s*"[^"]+",\s*(\d+),\s*(\d+),\s*(\d+)/g)];
const nodes = [];
for (const m of nodeRings) {
  const [, radius, count, startDeg] = m.map(Number);
  for (let i = 0; i < count; i++) {
    nodes.push(at(radius, Number(startDeg) + (360 / count) * i));
  }
}
if (camps.length === 0 || nodes.length === 0) {
  fail("could not read the camp or node tables out of the server");
}

const path = riverPath();

// --- The course ---------------------------------------------------------------

section("the course");
{
  // It has to leave the map at both ends. A river that stopped at the boundary
  // would be a canal with two ends in a field, and — the part that actually
  // matters — a player who walked to the west edge could stroll round it.
  if (path[0].x > 0) fail(`the course starts inside the map at x=${path[0].x.toFixed(0)}`);
  if (path[path.length - 1].x < WORLD_WIDTH) {
    fail(`the course ends inside the map at x=${path[path.length - 1].x.toFixed(0)}`);
  }
  if (path[0].x <= 0 && path[path.length - 1].x >= WORLD_WIDTH) {
    console.log(
      `  ${RIVER_WAYPOINTS.length} waypoints, ${path.length} points, ` +
        `x ${path[0].x.toFixed(0)} to ${path[path.length - 1].x.toFixed(0)} — off the map at both ends`,
    );
  }

  // Monotone in x. Not a style rule: the fast distance query buckets by x and
  // assumes it, and a course that doubled back would answer some queries with
  // the wrong segment — which would show as a notch cut in one bank.
  let backwards = 0;
  for (let i = 1; i < path.length; i++) if (path[i].x <= path[i - 1].x) backwards++;
  if (backwards > 0) fail(`the course doubles back in x at ${backwards} points`);
  else console.log("  runs west to east without doubling back");

  // Inside the map top to bottom, with the banks and their blend.
  let outside = 0;
  for (const p of path) if (p.y < 600 || p.y > WORLD_HEIGHT - 600) outside++;
  if (outside > 0) fail(`${outside} points sit within 600px of the top or bottom edge`);
  else console.log("  stays clear of the north and south edges");
}

// --- The fast query agrees with the slow one ----------------------------------

section("the distance index");
{
  // The bucketed lookup is an optimisation, and an optimisation that is
  // occasionally wrong is worse than no optimisation at all — it would be wrong
  // in a few places, on a curve nobody is going to check by eye.
  const brute = (x, y) => {
    let best = Infinity;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq)) : 0;
      const d = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
      if (d < best) best = d;
    }
    return best;
  };
  let worst = 0;
  let checked = 0;
  for (let x = 0; x <= WORLD_WIDTH; x += 137) {
    for (let y = 1200; y <= 4600; y += 113) {
      const a = riverAt(x, y).distancePx;
      const b = brute(x, y);
      worst = Math.max(worst, Math.abs(a - b));
      checked++;
    }
  }
  if (worst > 0.001) fail(`the bucketed query is off by up to ${worst.toFixed(2)}px`);
  else console.log(`  agrees with a full polyline walk at all ${checked} probes`);
}

// --- What the water must not touch --------------------------------------------

section("what it keeps clear of");
{
  if (inTown(path[0].x, path[0].y)) fail("the course starts in Emberhold");
  let nearestTown = Infinity;
  for (const p of path) {
    nearestTown = Math.min(nearestTown, Math.hypot(p.x - PLAYER_SPAWN.x, p.y - PLAYER_SPAWN.y));
  }
  if (nearestTown < TOWN_RADIUS_PX + 1200) {
    fail(`the course comes within ${nearestTown.toFixed(0)}px of spawn`);
  } else {
    console.log(`  nearest approach to spawn is ${nearestTown.toFixed(0)}px`);
  }

  let tightCamp = Infinity;
  for (const c of camps) tightCamp = Math.min(tightCamp, distanceToRiver(c.x, c.y));
  if (tightCamp < RIVER_HALF_WIDTH_PX + RIVER_CLEARANCE_PX) {
    fail(`a monster camp sits ${tightCamp.toFixed(0)}px from the water`);
  } else {
    console.log(`  nearest camp is ${tightCamp.toFixed(0)}px from the centreline (${camps.length} checked)`);
  }

  let tightNode = Infinity;
  for (const n of nodes) tightNode = Math.min(tightNode, distanceToRiver(n.x, n.y));
  if (tightNode < RIVER_HALF_WIDTH_PX + RIVER_CLEARANCE_PX) {
    fail(`a resource node sits ${tightNode.toFixed(0)}px from the water — it would be unreachable`);
  } else {
    console.log(`  nearest node is ${tightNode.toFixed(0)}px from the centreline (${nodes.length} checked)`);
  }

  for (const l of LANDMARKS) {
    const p = landmarkPosition(l);
    const d = distanceToRiver(p.x, p.y);
    if (d < RIVER_HALF_WIDTH_PX + LANDMARK_REACH_PX) {
      fail(`${l.name} stands ${d.toFixed(0)}px from the water — its reach ring is in the river`);
    }
  }
  console.log("  every waystone's reach ring is on dry land");
}

// --- The bridge ---------------------------------------------------------------

section("the bridge");
{
  const crossings = roadRiverCrossings();
  if (crossings.length !== 1) {
    fail(`the road crosses the river ${crossings.length} times — it needs exactly one bridge`);
  } else {
    console.log("  the road meets the water exactly once");
  }

  const b = bridgeAt();
  if (!onBridge(b.x, b.y)) fail("the bridge does not contain its own centre");
  const offRoad = Math.min(
    ...roadPath().map((p) => Math.hypot(p.x - b.x, p.y - b.y)),
  );
  if (offRoad > 30) fail(`the bridge stands ${offRoad.toFixed(0)}px off the road`);
  else console.log(`  it stands on the road, at (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`);

  // The deck must clear the WATER with room to land on the bank either side.
  // It used to have to clear the whole cut, banks included, because there was
  // nothing to get you up the slope; the approach ramp lives in the height
  // field now, so the deck only has to be a bridge.
  const need = RIVER_HALF_WIDTH_PX + 120;
  if (BRIDGE_HALF_SPAN_PX < need) {
    fail(`the deck spans ${BRIDGE_HALF_SPAN_PX}px either side but the water and a landing need ${need}`);
  } else {
    console.log(
      `  the deck reaches ${BRIDGE_HALF_SPAN_PX}px either side — ` +
        `${BRIDGE_HALF_SPAN_PX - RIVER_HALF_WIDTH_PX}px of landing past the water`,
    );
  }
  if (BRIDGE_HALF_WIDTH_PX <= ROAD_HALF_WIDTH_PX) {
    fail("the deck is no wider than the road, so the parapets would stand in the ruts");
  }

  // Walking the road end to end must never put you in the water.
  let wet = 0;
  const road = roadPath();
  for (let i = 1; i < road.length; i++) {
    for (let s = 0; s < 8; s++) {
      const t = s / 8;
      const x = road[i - 1].x + (road[i].x - road[i - 1].x) * t;
      const y = road[i - 1].y + (road[i].y - road[i - 1].y) * t;
      if (inRiver(x, y, PLAYER_BODY_RADIUS_PX)) wet++;
    }
  }
  if (wet > 0) fail(`following the road puts you in the water at ${wet} points`);
  else console.log("  following the road end to end never gets your feet wet");

  // And the full WIDTH of the road, not just the line down the middle.
  let wetVerge = 0;
  for (let i = 1; i < road.length; i++) {
    const dx = road[i].x - road[i - 1].x;
    const dy = road[i].y - road[i - 1].y;
    const len = Math.hypot(dx, dy) || 1;
    for (const off of [-ROAD_HALF_WIDTH_PX, ROAD_HALF_WIDTH_PX]) {
      const x = road[i].x + (-dy / len) * off;
      const y = road[i].y + (dx / len) * off;
      if (inRiver(x, y, PLAYER_BODY_RADIUS_PX)) wetVerge++;
    }
  }
  if (wetVerge > 0) fail(`the road's verge is in the water at ${wetVerge} points`);
  else console.log("  and neither does its full width");
}

// --- The one way across --------------------------------------------------------

section("the only crossing");
{
  // The claim: away from the bridge, the water is solid for the whole width of
  // the world. Sampled along the course rather than along a latitude, because
  // the course meanders and a latitude would miss it.
  const b = bridgeAt();
  let leaks = 0;
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    if (Math.hypot(p.x - b.x, p.y - b.y) < BRIDGE_HALF_SPAN_PX * 1.6) continue;
    if (!inRiver(p.x, p.y, PLAYER_BODY_RADIUS_PX)) leaks++;
  }
  if (leaks > 0) fail(`the water is walkable at ${leaks} points away from the bridge`);
  else console.log("  the water is solid for its whole length except at the bridge");

  // And the bridge really is a hole in it.
  if (inRiver(b.x, b.y, PLAYER_BODY_RADIUS_PX)) fail("the bridge is not a hole in the water");
  else console.log("  and the bridge is a hole in it");
}

// --- Being pushed out ----------------------------------------------------------

section("wading in");
{
  // Never across. Somebody who walks in from the south bank comes back out on
  // the south bank — the same rule the palisade keeps, and the failure it
  // prevents is a traveller being flung to the far side of the map by touching
  // the water on a bend.
  let flung = 0;
  let stuck = 0;
  let moved = 0;
  for (let i = 4; i < path.length - 4; i += 3) {
    const p = path[i];
    const dx = path[i + 1].x - path[i - 1].x;
    const dy = path[i + 1].y - path[i - 1].y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (const side of [-1, 1]) {
      // Twenty pixels in from the centreline on one side: properly in the
      // water, and unambiguously on one bank.
      const x = p.x + nx * 20 * side;
      const y = p.y + ny * 20 * side;
      if (!inRiver(x, y, PLAYER_BODY_RADIUS_PX)) continue;
      const out = resolveRiverCollision(x, y, PLAYER_BODY_RADIUS_PX);
      if (inRiver(out.x, out.y, PLAYER_BODY_RADIUS_PX)) stuck++;
      moved++;
      // Which side did it come out on? Project onto the same normal.
      const sign = Math.sign((out.x - p.x) * nx + (out.y - p.y) * ny);
      if (sign !== side) flung++;
    }
  }
  if (moved === 0) fail("no probe ended up in the water — the test is not testing anything");
  if (stuck > 0) fail(`${stuck} of ${moved} probes were still in the water after one resolve`);
  else console.log(`  all ${moved} probes were pushed clear in one step`);
  if (flung > 0) fail(`${flung} probes were pushed to the OPPOSITE bank`);
  else console.log("  and every one of them came out on the bank it went in from");

  // Idempotent. A resolve that keeps moving a body that is already clear is a
  // body that vibrates on the bank.
  let drift = 0;
  for (let i = 4; i < path.length - 4; i += 7) {
    const p = path[i];
    const once = resolveRiverCollision(p.x, p.y + 400, PLAYER_BODY_RADIUS_PX);
    const twice = resolveRiverCollision(once.x, once.y, PLAYER_BODY_RADIUS_PX);
    if (Math.hypot(twice.x - once.x, twice.y - once.y) > 0.01) drift++;
  }
  if (drift > 0) fail(`resolving twice moves the body again at ${drift} points`);
  else console.log("  resolving a body that is already clear does nothing");

  // Standing on the deck must not push you off it.
  const b = bridgeAt();
  const kept = resolveRiverCollision(b.x, b.y, PLAYER_BODY_RADIUS_PX);
  if (Math.hypot(kept.x - b.x, kept.y - b.y) > 0.01) fail("the collision shoves you off the bridge");
  else console.log("  and standing on the bridge leaves you where you are");
}

// --- The parapets ---------------------------------------------------------------

section("you cannot walk off the bridge");
{
  // THE BUG THIS SECTION EXISTS FOR. The deck used to be a rectangle where the
  // river's collision simply did not apply, which is most of a bridge and not
  // the important part: the sides were open, and the only thing between a
  // traveller and the water was the fact that the deck happened to be drawn
  // there. Walking off the edge put you in the channel with a bridge overhead.
  const b = bridgeAt();
  let leaked = 0;
  let clamped = 0;
  for (let s = -0.95; s <= 0.95; s += 0.05) {
    const along = s * BRIDGE_HALF_SPAN_PX;
    for (const side of [-1, 1]) {
      // Well outside the rail, but still over the deck.
      const p = bridgePoint(along, side * (BRIDGE_WALK_HALF_PX + 14));
      const out = resolveRiverCollision(p.x, p.y, PLAYER_BODY_RADIUS_PX);
      const f = bridgeFrame(out.x, out.y);
      if (Math.abs(f.across) > BRIDGE_WALK_HALF_PX - PLAYER_BODY_RADIUS_PX + 0.01) leaked++;
      else clamped++;
      // And it must not have thrown them to the other side of the deck.
      if (Math.sign(f.across) !== side && Math.abs(f.across) > 1) leaked++;
    }
  }
  if (leaked > 0) fail(`${leaked} probes got past the parapet`);
  else console.log(`  all ${clamped} probes were held between the rails, on their own side`);

  // Walking straight down the middle must never be touched, or the bridge
  // would feel like a corridor that shoves you.
  let nudged = 0;
  for (let s = -1; s <= 1; s += 0.02) {
    const p = bridgePoint(s * BRIDGE_HALF_SPAN_PX, 0);
    const out = resolveRiverCollision(p.x, p.y, PLAYER_BODY_RADIUS_PX);
    if (Math.hypot(out.x - p.x, out.y - p.y) > 0.01) nudged++;
  }
  if (nudged > 0) fail(`the middle of the deck pushes a body at ${nudged} points`);
  else console.log("  and the middle of the deck never touches you");

  // THE CLEAR SPAN HAS TO FIT THE ROAD, and the road is not straight. The
  // bridge's frame is the road's tangent at the one point where the two curves
  // cross; over eight hundred pixels of span the road goes on bending away from
  // it, so the widest its verge reaches is NOT its own half width. Measured off
  // the real curve rather than assumed, because the alternative is a wheel rut
  // through the parapet that nobody sees until they walk it.
  let widest = 0;
  const road = roadPath();
  for (let i = 1; i < road.length; i++) {
    const dx = road[i].x - road[i - 1].x;
    const dy = road[i].y - road[i - 1].y;
    const len = Math.hypot(dx, dy) || 1;
    for (const off of [-ROAD_HALF_WIDTH_PX, 0, ROAD_HALF_WIDTH_PX]) {
      const x = road[i].x + (-dy / len) * off;
      const y = road[i].y + (dx / len) * off;
      const f = bridgeFrame(x, y);
      if (Math.abs(f.along) > BRIDGE_HALF_SPAN_PX) continue;
      widest = Math.max(widest, Math.abs(f.across));
    }
  }
  if (BRIDGE_WALK_HALF_PX < widest) {
    fail(
      `the road reaches ${widest.toFixed(0)}px across the bridge's frame but the clear span is ` +
        `only ${BRIDGE_WALK_HALF_PX}px — the outside rut goes through the parapet`,
    );
  } else {
    console.log(
      `  the clear span is ${BRIDGE_WALK_HALF_PX}px and the road reaches ${widest.toFixed(0)}px across it`,
    );
  }
  if (BRIDGE_WALK_HALF_PX >= BRIDGE_HALF_WIDTH_PX) {
    fail("there is no room outside the walkable strip for the parapets to stand in");
  }
}

section("the approach");
{
  // The ramp has to be long enough to be a slope rather than a step. The deck
  // sits about two units above the water, so a 220px approach is a grade near
  // one in three — steep for a road and right for a timber bridge somebody
  // built out of what was to hand.
  if (BRIDGE_RAMP_PX < 120) fail(`a ${BRIDGE_RAMP_PX}px approach is a step, not a ramp`);
  else console.log(`  ${BRIDGE_RAMP_PX}px of earth approach at each end`);

  // And the road has to still BE the road through it — no camp or building may
  // sit where the causeway goes.
  const b = bridgeAt();
  let blocked = 0;
  for (const dir of [-1, 1]) {
    for (let t = 0; t <= 1; t += 0.05) {
      const p = bridgePoint(dir * (BRIDGE_HALF_SPAN_PX + t * BRIDGE_RAMP_PX), 0);
      if (insideAnyBuilding(p.x, p.y, 14)) blocked++;
      if (distanceToRoad(p.x, p.y) > ROAD_HALF_WIDTH_PX) blocked++;
    }
  }
  if (blocked > 0) fail(`the approach leaves the road or hits a building at ${blocked} samples`);
  else console.log("  and both approaches stay on the road");
}

console.log(failures === 0 ? "\nOK — the Coldwater checks out." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
