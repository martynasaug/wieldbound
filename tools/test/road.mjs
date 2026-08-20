// Checks the North Road. No server needed — pure geometry over shared data.
//
// The road has exactly one gameplay property and it is the reason it exists:
// following it gets you from Emberhold to the frontier without a fight. That is
// a claim about distance from four monster camps along four kilometres of
// curve, which is not something anybody can eyeball, and it fails silently —
// a road that clips a wolf pack's aggro looks completely correct and is a
// journey that cannot be made.
//
// Everything else here is the same family of silent fault the town and the
// waystones already have tests for: a road through a building, a torch inside a
// tree, a route that stops short of where it claims to go.
//
//   node tools/test/road.mjs

import { readFileSync } from "node:fs";
import {
  PLAYER_SPAWN,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  bandAt,
} from "../../shared/protocol-types.ts";
import {
  TOWN_RADIUS_PX,
  TOWN_GATES,
  insideAnyBuilding,
  inGateway,
  inTown,
} from "../../shared/town.ts";
import { LANDMARKS, landmarkPosition, LANDMARK_REACH_PX } from "../../shared/landmarks.ts";
import {
  NORTH_ROAD_WAYPOINTS,
  NORTH_TOWN_SITE,
  NORTH_TOWN_NAME,
  ROAD_HALF_WIDTH_PX,
  ROAD_CAMP_CLEARANCE_PX,
  ROAD_NODE_CLEARANCE_PX,
  ROAD_TORCH_SPACING_PX,
  roadPath,
  roadLengthPx,
  roadTorches,
  distanceToRoad,
} from "../../shared/road.ts";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n== ${name} ==`);

// The camps and node rings, read out of the server's own seeding rather than
// restated. A copy agrees the day it is written; this test exists precisely for
// the day somebody moves a camp.
const src = readFileSync(new URL("../../server/src/index.ts", import.meta.url), "utf8");
const at = (r, a) => ({
  x: PLAYER_SPAWN.x + Math.cos((a * Math.PI) / 180) * r,
  y: PLAYER_SPAWN.y + Math.sin((a * Math.PI) / 180) * r,
});
const camps = [
  ...src.matchAll(/ringPack\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)/g),
].map((m) => ({ id: m[1], kind: m[2], ...at(+m[3], +m[4]) }));
const nodes = [];
for (const m of src.matchAll(
  /ringNodes\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)/g,
)) {
  const [, prefix, , radius, count, start] = m;
  for (let i = 0; i < +count; i++) {
    nodes.push({ id: `${prefix}-${i + 1}`, ...at(+radius, +start + (360 / +count) * i) });
  }
}
if (camps.length === 0 || nodes.length === 0) fail("could not read the camps or nodes");

const path = roadPath();

// --- It goes where it says it goes ------------------------------------------

section("the route");
{
  if (path.length < 40) fail(`the road is only ${path.length} points long`);

  const start = path[0];
  const end = path[path.length - 1];
  const fromCentre = Math.hypot(start.x - PLAYER_SPAWN.x, start.y - PLAYER_SPAWN.y);
  if (Math.abs(fromCentre - TOWN_RADIUS_PX) > 2) {
    fail(`the road starts ${fromCentre.toFixed(0)}px out, not at the wall (${TOWN_RADIUS_PX})`);
  }

  // It has to leave through an actual opening, or it is a road to a fence.
  const startBearing =
    (Math.atan2(start.y - PLAYER_SPAWN.y, start.x - PLAYER_SPAWN.x) * 180) / Math.PI;
  if (!inGateway(startBearing)) {
    fail(`the road leaves on bearing ${startBearing.toFixed(0)}, which is not a gateway`);
  } else {
    const gate = TOWN_GATES.reduce((best, g) => {
      const d = Math.abs(((startBearing - g.angleDeg + 540) % 360) - 180);
      const bd = Math.abs(((startBearing - best.angleDeg + 540) % 360) - 180);
      return d < bd ? g : best;
    });
    console.log(`  leaves by the ${gate.name} on bearing ${startBearing.toFixed(0)}`);
  }

  if (Math.hypot(end.x - NORTH_TOWN_SITE.x, end.y - NORTH_TOWN_SITE.y) > 2) {
    fail("the road does not end at the town site");
  }

  // Inside the world, with room for the town that is going to stand there.
  const margin = 600;
  if (
    NORTH_TOWN_SITE.x < margin ||
    NORTH_TOWN_SITE.x > WORLD_WIDTH - margin ||
    NORTH_TOWN_SITE.y < margin ||
    NORTH_TOWN_SITE.y > WORLD_HEIGHT - margin
  ) {
    fail(`${NORTH_TOWN_NAME} has no room between it and the edge of the world`);
  }

  const len = roadLengthPx();
  // A road you cross in ten seconds is a courtyard. This is the one number that
  // says the world got bigger in a way a player can feel.
  if (len < 3000) fail(`the road is only ${len.toFixed(0)}px — that is not a journey`);
  console.log(
    `  ${NORTH_TOWN_NAME} is ${len.toFixed(0)}px away (${(len / 40).toFixed(0)} units), ` +
      `band ${bandAt(NORTH_TOWN_SITE.x, NORTH_TOWN_SITE.y)} ground`,
  );

  // Monotonically outward is NOT required — it bends — but it must not double
  // back, or the drawn ribbon folds over itself.
  let backtracks = 0;
  for (let i = 2; i < path.length; i++) {
    const ax = path[i - 1].x - path[i - 2].x;
    const ay = path[i - 1].y - path[i - 2].y;
    const bx = path[i].x - path[i - 1].x;
    const by = path[i].y - path[i - 1].y;
    if (ax * bx + ay * by < 0) backtracks++;
  }
  if (backtracks > 0) fail(`the road doubles back on itself at ${backtracks} points`);
}

// --- The road is the safe way through ----------------------------------------

section("what it passes");
{
  let worstCamp = { d: Infinity, id: "" };
  let worstNode = { d: Infinity, id: "" };
  let insideTown = 0;
  let insideBuilding = 0;

  for (const p of path) {
    for (const c of camps) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < worstCamp.d) worstCamp = { d, id: c.id };
    }
    for (const n of nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < worstNode.d) worstNode = { d, id: n.id };
    }
    if (insideAnyBuilding(p.x, p.y)) insideBuilding++;
    // Only the very first point may touch the wall; the rest is open country.
    if (p !== path[0] && inTown(p.x, p.y)) insideTown++;
  }

  if (insideBuilding > 0) fail(`the road runs through a building at ${insideBuilding} points`);
  if (insideTown > 0) fail(`the road doubles back inside the palisade at ${insideTown} points`);

  if (worstCamp.d < ROAD_CAMP_CLEARANCE_PX) {
    fail(
      `the road passes ${worstCamp.d.toFixed(0)}px from the "${worstCamp.id}" pack — ` +
        `inside its aggro, so following it is a fight`,
    );
  } else {
    console.log(
      `  nearest pack: ${worstCamp.id} at ${worstCamp.d.toFixed(0)}px ` +
        `(clearance ${ROAD_CAMP_CLEARANCE_PX})`,
    );
  }

  if (worstNode.d < ROAD_NODE_CLEARANCE_PX) {
    fail(`node "${worstNode.id}" stands ${worstNode.d.toFixed(0)}px from the centreline`);
  } else {
    console.log(`  nearest node: ${worstNode.id} at ${worstNode.d.toFixed(0)}px`);
  }

  // And it must not run over a waystone, which would put a five-metre monolith
  // in the carriageway.
  for (const l of LANDMARKS) {
    const p = landmarkPosition(l);
    const d = distanceToRoad(p.x, p.y);
    if (d < LANDMARK_REACH_PX) fail(`"${l.name}" stands ${d.toFixed(0)}px from the road`);
  }
}

// --- The torches --------------------------------------------------------------

section("the torches");
{
  const torches = roadTorches();
  if (torches.length < 8) fail(`only ${torches.length} torches on ${roadLengthPx().toFixed(0)}px`);

  // Every one has to stand BESIDE the road, not in it — they are solid-looking
  // posts and a player walking the road at night should not be weaving.
  let minOff = Infinity;
  let maxOff = 0;
  for (const t of torches) {
    const d = distanceToRoad(t.x, t.y);
    minOff = Math.min(minOff, d);
    maxOff = Math.max(maxOff, d);
    if (d < ROAD_HALF_WIDTH_PX * 0.6) {
      fail(`a torch stands ${d.toFixed(0)}px from the centreline — that is in the road`);
    }
    if (insideAnyBuilding(t.x, t.y)) fail("a torch stands inside a building");
    if (t.x < 0 || t.x > WORLD_WIDTH || t.y < 0 || t.y > WORLD_HEIGHT) {
      fail("a torch stands outside the world");
    }
  }
  console.log(`  ${torches.length} torches, ${minOff.toFixed(0)}–${maxOff.toFixed(0)}px off the centreline`);

  // Evenly spaced ALONG the curve. The failure this catches is subtle and would
  // look fine in a screenshot taken on a straight: sampling the spline by index
  // instead of by arc length bunches the lights up on the bends, which is
  // exactly where a traveller needs to see where the road goes next.
  let worstGap = 0;
  let bestGap = Infinity;
  for (let i = 1; i < torches.length; i++) {
    const g = Math.hypot(torches[i].x - torches[i - 1].x, torches[i].y - torches[i - 1].y);
    worstGap = Math.max(worstGap, g);
    bestGap = Math.min(bestGap, g);
  }
  // Generous, because they alternate sides — consecutive torches are a spacing
  // apart along the road and a further offset across it.
  const expected = Math.hypot(ROAD_TORCH_SPACING_PX, 2 * 82);
  if (worstGap > expected * 1.35 || bestGap < expected * 0.65) {
    fail(`torch spacing runs ${bestGap.toFixed(0)}–${worstGap.toFixed(0)}px, expected ~${expected.toFixed(0)}`);
  } else {
    console.log(`  spacing ${bestGap.toFixed(0)}–${worstGap.toFixed(0)}px, even along the curve`);
  }

  // Both sides used, or it is a row of lights rather than a lit road.
  const left = torches.filter((t) => t.side === -1).length;
  if (left === 0 || left === torches.length) fail("every torch is on the same side");
}

// --- The corridor a body can actually walk -----------------------------------

section("the walk");
{
  // Sample across the full width at every point: the centreline being clear is
  // not the same as the road being clear, and the thing a player follows is the
  // track, not the line down the middle of it.
  let blocked = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (const off of [-ROAD_HALF_WIDTH_PX, 0, ROAD_HALF_WIDTH_PX]) {
      const x = path[i].x + nx * off;
      const y = path[i].y + ny * off;
      if (insideAnyBuilding(x, y, 14)) blocked++;
    }
  }
  if (blocked > 0) fail(`the road's full width is blocked at ${blocked} samples`);
  else console.log(`  the full ${ROAD_HALF_WIDTH_PX * 2}px width is walkable end to end`);

  // The waypoints are the thing a person edits, so say what they cost.
  console.log(`  ${NORTH_ROAD_WAYPOINTS.length} waypoints, ${path.length} points after smoothing`);
}

console.log(failures === 0 ? "\nOK — the North Road checks out." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
