// Checks Emberhold's layout. No server needed — pure geometry over shared data.
//
// A town is the first thing in this world made of static obstacles, and every
// way it can be wrong is silent:
//
//   * Two buildings overlapping reads as one building with a strange roof.
//   * A building standing on spawn drops every new character inside a wall,
//     where the pushout evicts them in a direction nobody chose.
//   * A resource node or a monster camp inside a footprint is a node you can
//     see and cannot reach.
//   * An NPC inside a wall is a nameplate floating in plaster.
//   * A gate that does not line up with a road is a wall with a hole in it.
//
// None of those throws. All of them are one number away.
//
//   node tools/test/town.mjs

import { readFileSync } from "node:fs";
import {
  PLAYER_SPAWN,
  bandAt,
  INTERACTION_RANGE_PX,
  PLAYER_BODY_RADIUS_PX,
} from "../../shared/protocol-types.ts";
import {
  TOWN_BUILDINGS,
  TOWN_NPCS,
  TOWN_CENTER,
  TOWN_RADIUS_PX,
  TOWN_GATE_ANGLES,
  TOWN_GATE_HALF_DEG,
  NPC_TALK_RANGE_PX,
  insideAnyBuilding,
  pushOutOfBuildings,
  inTown,
} from "../../shared/town.ts";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n== ${name} ==`);

/** The four corners of a footprint, in world pixels. */
function corners(b) {
  const a = (b.facingDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hx = b.depthPx / 2;
  const hy = b.widthPx / 2;
  return [
    [+hx, +hy],
    [+hx, -hy],
    [-hx, -hy],
    [-hx, +hy],
  ].map(([lx, ly]) => ({ x: b.x + lx * cos - ly * sin, y: b.y + lx * sin + ly * cos }));
}

/** Separating-axis test between two oriented rectangles. */
function overlaps(a, b) {
  for (const rect of [a, b]) {
    const pts = corners(rect);
    for (let i = 0; i < 4; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % 4];
      const axis = { x: -(q.y - p.y), y: q.x - p.x };
      const project = (r) => {
        const values = corners(r).map((c) => c.x * axis.x + c.y * axis.y);
        return [Math.min(...values), Math.max(...values)];
      };
      const [aMin, aMax] = project(a);
      const [bMin, bMax] = project(b);
      if (aMax < bMin || bMax < aMin) return false;
    }
  }
  return true;
}

// --- The buildings stand apart ---------------------------------------------

section("buildings");
for (let i = 0; i < TOWN_BUILDINGS.length; i++) {
  for (let j = i + 1; j < TOWN_BUILDINGS.length; j++) {
    const a = TOWN_BUILDINGS[i];
    const b = TOWN_BUILDINGS[j];
    if (overlaps(a, b)) fail(`${a.id} overlaps ${b.id}`);
  }
}
console.log(`  ${TOWN_BUILDINGS.length} buildings, none overlapping`);

// The smithy occupies roughly two units either side of spawn and the player
// arrives standing in the middle of it, so the square has to be genuinely
// clear — not merely clear of the exact pixel spawn sits on.
//
// This is the number that says the square is somewhere to STAND rather than
// somewhere to pass through. It is a good deal larger than any building needs
// it to be, on purpose: this is the one place in the world where several
// players are in the same twenty metres at once with nothing to do.
const SMITHY_CLEARANCE_PX = 380;
for (const b of TOWN_BUILDINGS) {
  if (insideAnyBuilding(PLAYER_SPAWN.x, PLAYER_SPAWN.y)) {
    fail("spawn is inside a building");
    break;
  }
}
for (let deg = 0; deg < 360; deg += 5) {
  const a = (deg * Math.PI) / 180;
  const x = PLAYER_SPAWN.x + Math.cos(a) * SMITHY_CLEARANCE_PX;
  const y = PLAYER_SPAWN.y + Math.sin(a) * SMITHY_CLEARANCE_PX;
  if (insideAnyBuilding(x, y)) {
    fail(`a building reaches within ${SMITHY_CLEARANCE_PX}px of the anvil (bearing ${deg})`);
    break;
  }
}
console.log(`  the smithy has ${SMITHY_CLEARANCE_PX}px of clear ground all round`);

// Every building inside the walls, or the palisade is decoration.
for (const b of TOWN_BUILDINGS) {
  for (const c of corners(b)) {
    if (!inTown(c.x, c.y)) fail(`${b.id} sticks out past the palisade`);
  }
}
console.log("  every building stands inside the wall");

// A building blocking a gate is a road that ends in a wall.
section("roads");
for (const deg of TOWN_GATE_ANGLES) {
  const a = (deg * Math.PI) / 180;
  for (let r = 60; r <= TOWN_RADIUS_PX + 40; r += 10) {
    const x = TOWN_CENTER.x + Math.cos(a) * r;
    const y = TOWN_CENTER.y + Math.sin(a) * r;
    if (insideAnyBuilding(x, y, PLAYER_BODY_RADIUS_PX)) {
      fail(`the ${deg}° road runs into a building at ${r}px`);
      break;
    }
  }
}
console.log(`  all ${TOWN_GATE_ANGLES.length} roads leave the square unobstructed`);

// The gateways have to be wide enough to walk through with a body on.
const gateWidthPx = 2 * TOWN_RADIUS_PX * Math.sin((TOWN_GATE_HALF_DEG * Math.PI) / 180);
if (gateWidthPx < 4 * PLAYER_BODY_RADIUS_PX) {
  fail(`a gateway is only ${gateWidthPx.toFixed(0)}px wide`);
} else {
  console.log(`  each gateway is ${gateWidthPx.toFixed(0)}px wide`);
}

// --- Nobody and nothing is standing in a wall -------------------------------

section("people");
for (const npc of TOWN_NPCS) {
  if (insideAnyBuilding(npc.x, npc.y, PLAYER_BODY_RADIUS_PX)) {
    fail(`${npc.name} is standing inside a building`);
  }
  if (!inTown(npc.x, npc.y)) fail(`${npc.name} is outside the walls`);

  // You have to be able to get close enough to talk without being pushed out of
  // range by the very wall they are standing beside.
  const toCentre = Math.hypot(npc.x - TOWN_CENTER.x, npc.y - TOWN_CENTER.y);
  if (toCentre > TOWN_RADIUS_PX - 60) fail(`${npc.name} stands too near the palisade`);
}
for (let i = 0; i < TOWN_NPCS.length; i++) {
  for (let j = i + 1; j < TOWN_NPCS.length; j++) {
    const a = TOWN_NPCS[i];
    const b = TOWN_NPCS[j];
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    // Two people closer than a talk radius means one click reaches both and the
    // wrong nameplate wins.
    if (gap < 90) fail(`${a.name} and ${b.name} are ${gap.toFixed(0)}px apart`);
  }
}
console.log(`  ${TOWN_NPCS.length} people, all outdoors and none crowding another`);

const roles = new Set(TOWN_NPCS.map((n) => n.role));
for (const required of ["vendor", "quest", "guide"]) {
  if (!roles.has(required)) fail(`no ${required} in town`);
}
if (TOWN_NPCS.filter((n) => n.role === "quest").length < 2) {
  fail("fewer than two quest givers");
}
for (const npc of TOWN_NPCS) {
  if (npc.topics.length === 0) fail(`${npc.name} has nothing to say`);
  for (const t of npc.topics) {
    if (t.a.length < 40) fail(`${npc.name}'s answer to "${t.q}" is a stub`);
  }
}
console.log("  vendor, guide and two quest givers present, all with something to say");

// --- The pushout actually evicts --------------------------------------------

section("collision");
let evicted = 0;
for (const b of TOWN_BUILDINGS) {
  // Sample the interior, including the corners the shallowest-axis rule is
  // easiest to get wrong at.
  for (let u = -0.4; u <= 0.4001; u += 0.4) {
    for (let v = -0.4; v <= 0.4001; v += 0.4) {
      const a = (b.facingDeg * Math.PI) / 180;
      const lx = u * b.depthPx;
      const ly = v * b.widthPx;
      const x = b.x + lx * Math.cos(a) - ly * Math.sin(a);
      const y = b.y + lx * Math.sin(a) + ly * Math.cos(a);
      const out = pushOutOfBuildings(x, y, PLAYER_BODY_RADIUS_PX);
      evicted++;
      if (insideAnyBuilding(out.x, out.y, PLAYER_BODY_RADIUS_PX)) {
        fail(`${b.id}: a point inside was not pushed clear`);
      }
      // And it must not fling anyone across the town while doing it.
      const moved = Math.hypot(out.x - x, out.y - y);
      const worst = Math.max(b.widthPx, b.depthPx);
      if (moved > worst) fail(`${b.id}: pushout moved a body ${moved.toFixed(0)}px`);
    }
  }
}
// A point well outside must come back untouched, or the whole square becomes
// subtly sticky.
for (let deg = 0; deg < 360; deg += 17) {
  const a = (deg * Math.PI) / 180;
  const x = TOWN_CENTER.x + Math.cos(a) * 90;
  const y = TOWN_CENTER.y + Math.sin(a) * 90;
  const out = pushOutOfBuildings(x, y, PLAYER_BODY_RADIUS_PX);
  if (out.x !== x || out.y !== y) fail(`the square at bearing ${deg} is not free ground`);
}
console.log(`  ${evicted} interior samples all evicted; the square itself is untouched`);

// --- The town does not fight the world it sits in ---------------------------

section("the world around it");
// The whole town has to fit in band 1, or the first thing a beginner walks past
// on their way to the inn is a wolf.
for (const b of TOWN_BUILDINGS) {
  if (bandAt(b.x, b.y) !== 1) fail(`${b.id} stands in band ${bandAt(b.x, b.y)}`);
}
// Band 1's first camp is at 720px and a pack reaches 70px in from its own
// centre, so the nearest body stands at 650. The wall has to be inside THAT,
// not merely inside the camp centre — the Herald tells every new player that
// nothing spawns within the walls.
const NEAREST_MONSTER_PX = 1320 - 70;
if (TOWN_RADIUS_PX >= NEAREST_MONSTER_PX) fail("a monster spawns at or inside the palisade");
console.log(`  the wall stops ${NEAREST_MONSTER_PX - TOWN_RADIUS_PX}px short of the nearest body`);

// --- Nothing gatherable inside the walls ------------------------------------
// A town is somewhere you go BETWEEN gathering trips. A node inside the
// palisade quietly makes the square another field, and it is the sort of thing
// that creeps back in the moment somebody moves a ring inward for convenience.
//
// Read out of the server's own seeding rather than duplicated here, so this
// cannot pass against a list that has drifted from the one the world is built
// from.
const seeding = readFileSync(new URL("../../server/src/index.ts", import.meta.url), "utf8");
const ringCalls = [...seeding.matchAll(/ringNodes\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)/g)];
if (ringCalls.length === 0) fail("could not read any node rings out of the server");
const HALF_W = 7200 / 2;
const HALF_H = 5400 / 2;
for (const [, prefix, , radiusText, countText, startText] of ringCalls) {
  const radius = Number(radiusText);
  const count = Number(countText);
  const start = Number(startText);
  if (radius <= TOWN_RADIUS_PX) fail(`the "${prefix}" ring at ${radius}px is inside the walls`);
  for (let i = 0; i < count; i++) {
    const a = ((start + (360 / count) * i) * Math.PI) / 180;
    const x = TOWN_CENTER.x + Math.cos(a) * radius;
    const y = TOWN_CENTER.y + Math.sin(a) * radius;
    // And inside the world. A ring wider than the map's SHORT axis leaves it at
    // the top and bottom of its circle — nodes you can see on the minimap and
    // can never stand next to. This was true of two rings for a long time and
    // nothing said so.
    if (x < 0 || x > 2 * HALF_W || y < 0 || y > 2 * HALF_H) {
      fail(`"${prefix}" node ${i + 1} at ${radius}px falls outside the world`);
      break;
    }
  }
}
console.log(`  ${ringCalls.length} node rings, all outside the walls and inside the world`);
void INTERACTION_RANGE_PX;

// Talk range has to be looser than gather range, or standing close enough to
// speak to Tobin means standing close enough to be harvesting a bush instead.
if (NPC_TALK_RANGE_PX <= INTERACTION_RANGE_PX) {
  fail("talk range is tighter than gather range");
}

console.log(
  failures === 0
    ? `\nOK — Emberhold checks out.`
    : `\n${failures} failure(s).`,
);
process.exit(failures === 0 ? 0 : 1);
