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
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "../../shared/protocol-types.ts";
import {
  TOWN_BUILDINGS,
  TOWN_NPCS,
  TOWN_CENTER,
  TOWN_RADIUS_PX,
  TOWN_GATE_ANGLES,
  TOWN_GATE_HALF_DEG,
  TOWN_GATES,
  TOWN_PROPS,
  PLAYER_ARRIVAL,
  ROAD_HALF_WIDTH_PX,
  propById,
  propPosition,
  buildingWedge,
  BACK_LANE_PX,
  resolveTownCollision,
  inGateway,
  NPC_TALK_RANGE_PX,
  insideAnyBuilding,
  pushOutOfBuildings,
  inTown,
  STATUE_SIGHT_HALF_PX,
  NPC_BEAT_RADIUS_PX,
  NPC_TETHER_PX,
  npcPoseAt,
  npcBeatCycleMs,
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

// Every gateway has to be wide enough to walk through with a body on, and they
// are no longer all the same width — the north postern is narrower than the
// highway because the gap between the inn and the shop is where it had to go.
let gateWidthPx = Infinity;
for (const g of TOWN_GATES) {
  const w = 2 * TOWN_RADIUS_PX * Math.sin((g.halfDeg * Math.PI) / 180);
  if (w < 4 * PLAYER_BODY_RADIUS_PX) fail(`the ${g.name} is only ${w.toFixed(0)}px wide`);
  gateWidthPx = Math.min(gateWidthPx, w);
}
{
  console.log(`  ${TOWN_GATES.length} gateways, the narrowest ${gateWidthPx.toFixed(0)}px`);
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

// NOBODY STANDS BEHIND THE MONUMENT.
//
// The camera has one bearing and only its distance moves, so "behind the
// statue" is not a position a player can walk out of — it is a permanent
// property of a bearing. Somebody parked there is somebody you can neither see
// nor click, for the life of the world.
//
// It was originally written against a worse symptom: townspeople carried a
// through-walls silhouette, so the Herald standing 8px off the axis painted a
// solid blue mage down the middle of the monument at all hours. That is fixed
// at the source now — townspeople have no silhouette — because fixing it here
// would have meant this rule being RIGHT about perspective, and the honest
// version of the question turned out to be harder than it looks.
{
  const statue = propById("statue");
  if (!statue) fail("no statue in the prop table");
  else {
    const at = propPosition(statue);
    // OVER THE WHOLE ROUND, not just the post. This rule was written one
    // milestone ago against five people who could not move, and the day they
    // could it silently stopped covering the thing it exists for: the Herald's
    // first beat walked her back into the cone for a third of every round, and
    // the test that had just been written to catch exactly that said nothing,
    // because it was still only looking at where she starts.
    //
    // Deliberately CONSERVATIVE. Somebody far enough behind the monument is
    // drawn clear above its crown and is measurably fine — but the arithmetic
    // that says who is far enough turned out to be wrong when it was checked
    // against a real raycast, and the cost of leaving a narrow wedge of the
    // square empty is nothing at all. A rule that occasionally moves a
    // shopkeeper who did not need moving beats one that has to be right about
    // perspective.
    for (const npc of TOWN_NPCS) {
      const cycle = npcBeatCycleMs(npc);
      let worst = Infinity;
      let worstAt = 0;
      for (let t = 0; t <= (cycle || 1); t += cycle ? 60 : 1) {
        const pose = npcPoseAt(npc, t);
        if (pose.y >= at.y) continue; // -z is away from the camera
        const across = Math.abs(pose.x - at.x);
        if (across < worst) {
          worst = across;
          worstAt = t;
        }
      }
      if (worst < STATUE_SIGHT_HALF_PX) {
        const when = cycle ? ` ${(worstAt / 1000).toFixed(1)}s into their round` : "";
        fail(
          `${npc.name} passes behind the statue${when}, ${worst.toFixed(0)}px off its ` +
            `axis — their silhouette will be painted down it`,
        );
      }
    }
    console.log("  nobody's round takes them behind the monument");
  }
}

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

// --- The rounds people walk -------------------------------------------------
// Five people stood perfectly still for three phases, and the moment any of
// them moves every placement rule in this file gains a time axis. A stop two
// degrees out is a shopkeeper standing in a well; a leg two degrees out is one
// walking through the side of the inn, four seconds at a time, which is harder
// to catch by looking than a prop indoors because it is only wrong while it is
// happening.
//
// So every rule below is checked over the WHOLE cycle rather than at the stops:
// where somebody is at each stop is the easy half, and the legs between them
// are where the geometry actually goes wrong.

section("rounds");
{
  const walkers = TOWN_NPCS.filter((n) => n.beat && n.beat.length >= 2);
  if (walkers.length === 0) fail("nobody in Emberhold moves");

  const solid = TOWN_PROPS.filter((p) => p.blockRadiusPx > 0).map((p) => ({
    id: p.id,
    ...propPosition(p),
    r: p.blockRadiusPx,
  }));
  // A person is not a body the props collide with, so nothing in the engine
  // will ever stop them walking into the well. This margin is the only thing
  // that does.
  const PROP_CLEARANCE_PX = 8;

  for (const npc of walkers) {
    const cycle = npcBeatCycleMs(npc);
    if (cycle <= 0) {
      fail(`${npc.name}'s round takes no time at all`);
      continue;
    }

    // The first stop is their post, so a nameplate's home is where it has
    // always been and `x`/`y` never become a place nobody stands.
    const first = npc.beat[0];
    const home = npcPoseAt({ ...npc, beat: undefined }, 0);
    const firstPose = { x: home.x, y: home.y };
    {
      const a = (first.angleDeg * Math.PI) / 180;
      const fx = TOWN_CENTER.x + Math.cos(a) * first.radiusPx;
      const fy = TOWN_CENTER.y + Math.sin(a) * first.radiusPx;
      if (Math.hypot(fx - firstPose.x, fy - firstPose.y) > 1.5) {
        fail(`${npc.name}'s round does not start at their post`);
      }
    }

    for (const stop of npc.beat) {
      if (stop.dwellMs <= 0) fail(`${npc.name} has a stop they never stand at`);
    }

    // Walk the whole cycle. 60ms is finer than anybody moves in a frame at
    // 58px/s, so nothing thin can be stepped over.
    let standing = 0;
    let samples = 0;
    let strayed = 0;
    // Collected rather than reported as they are found: a leg through the well
    // is wrong at every one of the forty samples that cross it, and forty
    // identical lines bury the other four people underneath them.
    const hitProps = new Set();
    let throughBuilding = -1;
    let outside = false;
    for (let t = 0; t < cycle; t += 60) {
      samples++;
      const pose = npcPoseAt(npc, t);
      if (!pose.walking) standing++;

      const fromPost = Math.hypot(pose.x - npc.x, pose.y - npc.y);
      if (fromPost > NPC_BEAT_RADIUS_PX) strayed = Math.max(strayed, fromPost);
      if (throughBuilding < 0 && insideAnyBuilding(pose.x, pose.y, PLAYER_BODY_RADIUS_PX)) {
        throughBuilding = t;
      }
      if (!inTown(pose.x, pose.y)) outside = true;
      for (const s of solid) {
        if (Math.hypot(s.x - pose.x, s.y - pose.y) < s.r + PROP_CLEARANCE_PX) hitProps.add(s.id);
      }
    }
    if (throughBuilding >= 0) {
      fail(
        `${npc.name} walks through a building ${(throughBuilding / 1000).toFixed(1)}s ` +
          `into their round`,
      );
    }
    if (outside) fail(`${npc.name} walks outside the palisade`);
    for (const id of hitProps) fail(`${npc.name} walks through "${id}"`);
    if (strayed > 0) {
      // The tether is derived from this bound, so breaking it does not read as
      // "somebody wandered a bit" — it reads as a dialogue box closing itself
      // in the middle of a purchase.
      fail(
        `${npc.name} strays ${strayed.toFixed(0)}px from their post, past the ` +
          `${NPC_BEAT_RADIUS_PX}px the tether is built on`,
      );
    }

    // A town where everybody is permanently in motion is a parade, not a place
    // somebody lives. The stops are the point; the walking is punctuation.
    const standingShare = standing / samples;
    if (standingShare < 0.55) {
      fail(`${npc.name} is walking ${((1 - standingShare) * 100).toFixed(0)}% of the time`);
    }
    console.log(
      `  ${npc.name}: ${npc.beat.length} stops, ${(cycle / 1000).toFixed(0)}s round, ` +
        `standing ${(standingShare * 100).toFixed(0)}% of it`,
    );
  }

  // NOBODY WALKS THROUGH ANYBODY. The static version of this rule has been here
  // since Phase 49 — two people closer than a talk radius means one click
  // reaches both and the wrong nameplate wins — and it was checked at their
  // posts, which is now only one instant out of a thirty-second round.
  {
    const cycles = walkers.map((n) => npcBeatCycleMs(n));
    const span = Math.max(600000, ...cycles.map((c) => c * 4));
    let closest = Infinity;
    let who = "";
    for (let t = 0; t < span; t += 250) {
      const poses = TOWN_NPCS.map((n) => ({ n, p: npcPoseAt(n, t) }));
      for (let i = 0; i < poses.length; i++) {
        for (let j = i + 1; j < poses.length; j++) {
          const d = Math.hypot(poses[i].p.x - poses[j].p.x, poses[i].p.y - poses[j].p.y);
          if (d < closest) {
            closest = d;
            who = `${poses[i].n.name} and ${poses[j].n.name}`;
          }
        }
      }
    }
    if (closest < 90) fail(`${who} come within ${closest.toFixed(0)}px of each other`);
    else console.log(`  closest two people ever get: ${closest.toFixed(0)}px (${who})`);
  }

  // The round is a pure function of the clock, which is the entire reason
  // nothing is sent over the wire for it. If it were not, the shopkeeper the
  // client draws and the shopkeeper the server prices from would drift apart —
  // and the symptom of that is "the buy button does nothing", which is the
  // worst failure an interface has.
  for (const npc of walkers) {
    const cycle = npcBeatCycleMs(npc);
    const t = 12345;
    const a = npcPoseAt(npc, t);
    const b = npcPoseAt(npc, t);
    if (a.x !== b.x || a.y !== b.y || a.facingDeg !== b.facingDeg) {
      fail(`${npc.name}'s position is not a pure function of the clock`);
    }
    const wrapped = npcPoseAt(npc, t + cycle);
    if (Math.hypot(wrapped.x - a.x, wrapped.y - a.y) > 0.01) {
      fail(`${npc.name}'s round does not close — it is a path, not a loop`);
    }
  }
  console.log("  every round is a closed loop and a pure function of the clock");

  // The tether is a SUM, not a guess, and the whole point is that it is exactly
  // big enough. If it were smaller than this, a conversation opened at the very
  // edge of talk range would close itself the moment the other person set off.
  if (NPC_TETHER_PX < NPC_TALK_RANGE_PX + NPC_BEAT_RADIUS_PX) {
    fail("the tether is shorter than the talk range plus the beat — dialogues will drop");
  }
  console.log(
    `  tether ${NPC_TETHER_PX}px = talk ${NPC_TALK_RANGE_PX} + beat ${NPC_BEAT_RADIUS_PX}`,
  );
}

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
// Read from the shared constants, not typed. These were literals — 7200 and
// 5400 — and they were wrong within a minute of the world growing: eleven node
// rings "fell outside the world" while sitting comfortably inside it. A test
// that keeps its own copy of a number the game derives is a test that reports
// the copy going stale as a fault in the game.
const HALF_W = WORLD_WIDTH / 2;
const HALF_H = WORLD_HEIGHT / 2;
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

// --- Solid things you must not be able to walk through ----------------------
// The buildings were the only obstacles for one build, and everything else in
// the square — the palisade, the well, the market stall, the monument — was
// scenery you strolled straight through. Every failure below is silent, and
// several are worse than the thing they replaced: an obstacle blocking where it
// should not is an invisible wall in open paving, and one that closes around an
// NPC or the anvil makes a working system unreachable with nothing thrown.

section("solid things");
{
  const solidProps = TOWN_PROPS.filter((p) => p.blockRadiusPx > 0);
  console.log(
    `  ${solidProps.length} solid props, plus ${TOWN_BUILDINGS.length} buildings and the palisade`,
  );

  // Nothing may block ARRIVAL, or a new character materialises wedged.
  //
  // This used to test `PLAYER_SPAWN`, and testing that is what kept the middle
  // of the square empty for two milestones: the origin of every band in the
  // world was also the doormat, so the best spot in town was reserved for
  // nobody to stand on. The two are separate now — the statue holds the origin
  // and players land beside it — so the rule follows the one that is actually
  // about a person. Asserted in full beside the road corridor below.
  const atArrival = resolveTownCollision(PLAYER_ARRIVAL.x, PLAYER_ARRIVAL.y, PLAYER_BODY_RADIUS_PX);
  if (atArrival.x !== PLAYER_ARRIVAL.x || atArrival.y !== PLAYER_ARRIVAL.y) {
    fail("something solid is standing where players arrive");
  }

  // NOTHING SOLID MAY STAND INSIDE A BUILDING.
  //
  // Added with the back lane, which is the first dressing placed by BEARING
  // behind the houses rather than out in the open square — and a hay rick two
  // degrees off ends up in somebody's kitchen. The failure is silent from every
  // angle but one: the prop is drawn inside the walls, so unless you happen to
  // look at that building from the back you never see it, and the collision
  // circle just becomes an odd sticky patch indoors.
  for (const p of solidProps) {
    const at = propPosition(p);
    if (insideAnyBuilding(at.x, at.y)) {
      fail(`"${p.id}" is standing inside a building`);
    }
  }

  // And nothing solid may be outside the wall either — the belt runs out at the
  // palisade, and a beehive in the field is a beehive a slime walks through.
  for (const p of solidProps) {
    if (p.radiusPx > TOWN_RADIUS_PX) {
      fail(`"${p.id}" is outside the palisade at ${p.radiusPx}px`);
    }
  }

  // The forge has to stay reachable. This is the one that nearly shipped: the
  // smithy's props ring an empty middle, and a keep-out circle round it would
  // have held every player further off than INTERACTION_RANGE_PX — a bench that
  // looks like it has simply stopped working.
  const smithy = propById("smithy");
  if (!smithy) fail("no smithy in the prop table");
  else {
    const at = propPosition(smithy);
    let reachable = false;
    for (let deg = 0; deg < 360 && !reachable; deg += 10) {
      const a = (deg * Math.PI) / 180;
      const solved = resolveTownCollision(
        at.x + Math.cos(a) * (INTERACTION_RANGE_PX - 6),
        at.y + Math.sin(a) * (INTERACTION_RANGE_PX - 6),
        PLAYER_BODY_RADIUS_PX,
      );
      if (Math.hypot(solved.x - at.x, solved.y - at.y) <= INTERACTION_RANGE_PX) reachable = true;
    }
    if (!reachable) fail("you cannot stand close enough to the forge to use it");
    else console.log("  the forge can still be stood at");
  }

  // Every townsperson has to be approachable within talk range.
  for (const npc of TOWN_NPCS) {
    let ok = false;
    for (let deg = 0; deg < 360 && !ok; deg += 10) {
      const a = (deg * Math.PI) / 180;
      for (const reach of [40, 70, 110]) {
        const solved = resolveTownCollision(
          npc.x + Math.cos(a) * reach,
          npc.y + Math.sin(a) * reach,
          PLAYER_BODY_RADIUS_PX,
        );
        if (Math.hypot(solved.x - npc.x, solved.y - npc.y) <= NPC_TALK_RANGE_PX) {
          ok = true;
          break;
        }
      }
    }
    if (!ok) fail(`${npc.name} cannot be reached — something solid is round them`);
  }
  console.log("  every townsperson can be walked up to");

  // And nobody is standing INSIDE a prop, which reads as a bug even where it
  // blocks nothing.
  for (const npc of TOWN_NPCS) {
    for (const p of solidProps) {
      const at = propPosition(p);
      if (Math.hypot(npc.x - at.x, npc.y - at.y) < p.blockRadiusPx) {
        fail(`${npc.name} is standing inside "${p.id}"`);
      }
    }
  }

  // The road has to be walkable end to end, or a gate opens onto an obstacle.
  //
  // A CORRIDOR rather than a line, because the statue stands on the centre and
  // the road passes either side of it — which is what a square with a monument
  // in it has always looked like. The old rule walked the gate bearing exactly
  // and would have called that a blocked road; the honest question is whether
  // somebody can get from one gate to the other, not whether they can do it
  // without ever stepping off the centreline.
  //
  // The half-width is the DRAWN road's, shared with the client, so a corridor
  // that passes here is one a player can see themselves walking down.
  for (const gate of TOWN_GATE_ANGLES) {
    const a = (gate * Math.PI) / 180;
    // Across the road, at right angles to it.
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    for (let r = 0; r <= TOWN_RADIUS_PX + 120; r += 15) {
      let open = false;
      for (let lateral = -ROAD_HALF_WIDTH_PX; lateral <= ROAD_HALF_WIDTH_PX; lateral += 10) {
        const x = TOWN_CENTER.x + Math.cos(a) * r + nx * lateral;
        const y = TOWN_CENTER.y + Math.sin(a) * r + ny * lateral;
        const solved = resolveTownCollision(x, y, PLAYER_BODY_RADIUS_PX);
        if (Math.hypot(solved.x - x, solved.y - y) <= 1) {
          open = true;
          break;
        }
      }
      if (!open) {
        fail(`the ${gate}deg road is blocked right across at ${r}px`);
        break;
      }
    }
  }
  console.log(`  both roads run gate to gate, ${ROAD_HALF_WIDTH_PX * 2}px wide`);

  // And the island really is an island: the centre is solid, so the road has to
  // be going round it rather than through it. Without this the corridor rule
  // above would happily pass a town whose statue had quietly stopped colliding.
  {
    const solved = resolveTownCollision(TOWN_CENTER.x, TOWN_CENTER.y, PLAYER_BODY_RADIUS_PX);
    if (Math.hypot(solved.x - TOWN_CENTER.x, solved.y - TOWN_CENTER.y) < 1) {
      fail("the middle of the square is walk-through — the statue is not solid");
    } else {
      console.log("  the statue holds the centre");
    }
  }

  // Arrival is not the origin, and it must not be inside anything. This is the
  // rule the whole statue depends on: put something on the centre without
  // moving arrival and every player in the game materialises inside it.
  {
    const solved = resolveTownCollision(PLAYER_ARRIVAL.x, PLAYER_ARRIVAL.y, PLAYER_BODY_RADIUS_PX);
    const shifted = Math.hypot(solved.x - PLAYER_ARRIVAL.x, solved.y - PLAYER_ARRIVAL.y);
    if (shifted > 1) {
      fail(`players arrive inside something and are shoved ${shifted.toFixed(0)}px`);
    }
    const fromCentre = Math.hypot(
      PLAYER_ARRIVAL.x - TOWN_CENTER.x,
      PLAYER_ARRIVAL.y - TOWN_CENTER.y,
    );
    if (fromCentre > TOWN_RADIUS_PX * 0.5) {
      fail(`arrival is ${fromCentre.toFixed(0)}px out — that is not "the middle of town"`);
    }
    console.log(`  players arrive ${fromCentre.toFixed(0)}px from the centre, in the clear`);
  }

  // And the palisade genuinely stops you everywhere it is not a gateway.
  let stopped = 0;
  let leaks = 0;
  for (let deg = 0; deg < 360; deg += 3) {
    if (inGateway(deg)) continue;
    const a = (deg * Math.PI) / 180;
    const x = TOWN_CENTER.x + Math.cos(a) * TOWN_RADIUS_PX;
    const y = TOWN_CENTER.y + Math.sin(a) * TOWN_RADIUS_PX;
    const solved = resolveTownCollision(x, y, PLAYER_BODY_RADIUS_PX);
    const movedTo = Math.hypot(solved.x - TOWN_CENTER.x, solved.y - TOWN_CENTER.y);
    if (Math.abs(movedTo - TOWN_RADIUS_PX) < 1) leaks++;
    else stopped++;
  }
  if (leaks > 0) fail(`the palisade can be walked through at ${leaks} bearings`);
  else console.log(`  the palisade holds at all ${stopped} solid bearings`);

  for (const gate of TOWN_GATE_ANGLES) {
    const a = (gate * Math.PI) / 180;
    const x = TOWN_CENTER.x + Math.cos(a) * TOWN_RADIUS_PX;
    const y = TOWN_CENTER.y + Math.sin(a) * TOWN_RADIUS_PX;
    const solved = resolveTownCollision(x, y, PLAYER_BODY_RADIUS_PX);
    if (Math.hypot(solved.x - x, solved.y - y) > 1) fail(`the ${gate}deg gateway is shut`);
  }
  console.log("  both gateways are open");
}

// --- The back lane ----------------------------------------------------------
// A BACK YARD SAYS WHAT THE BUILDING IS, and every way of getting that wrong is
// silent from every angle except standing in the yard itself.
//
//   * A yard with nothing in it. The shop had none of its own props inside its
//     own width for two milestones, and "the chapel's back yard is the emptiest"
//     was reported from play about the building with the MOST things behind it —
//     because what was there was a washing line, and a washing line behind a
//     chapel is somebody else's laundry.
//   * A prop behind the wrong building. The second washing line is commented in
//     `town.ts` as "the two cottages' between them" and was typed at 84 and 96,
//     which is six degrees off the chapel; the cottages are at 135 and 330.
//     Bearings are DERIVED from the building now, so this can only fail if the
//     derivation is wrong — which is exactly why it is worth asserting.
//   * A prop placed, collided with, and never DRAWN. That one is the most
//     invisible of the three: a barrel that is not rendered looks exactly like a
//     barrel nobody asked for, while still being something you walk around.

section("the back lane");
{
  const back = TOWN_PROPS.filter((p) => p.behind);
  const byBuilding = new Map();
  for (const p of back) {
    if (!byBuilding.has(p.behind)) byBuilding.set(p.behind, []);
    byBuilding.get(p.behind).push(p);
  }

  const sep = (a, b) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

  for (const b of TOWN_BUILDINGS) {
    const mine = byBuilding.get(b.id) ?? [];
    if (mine.length === 0) {
      fail(`${b.id} has an empty back yard — nothing behind it says what it is`);
      continue;
    }
    const wedge = buildingWedge(b.id);
    for (const p of mine) {
      // A yard may spill past the corner of its house — a washing line does,
      // which is what the fractions past 1 in `behind()` are for — but not so
      // far that it is standing in the neighbour's ground.
      const off = sep(p.angleDeg, wedge.angleDeg) / wedge.halfDeg;
      if (off > 2) {
        fail(`${p.id} is ${off.toFixed(1)}x its building's own half-width from ${b.id}`);
      }
      // And whatever it spills into must not be somebody ELSE'S wedge.
      for (const other of TOWN_BUILDINGS) {
        if (other.id === b.id) continue;
        const w = buildingWedge(other.id);
        if (sep(p.angleDeg, w.angleDeg) <= w.halfDeg) {
          fail(`${p.id} belongs to ${b.id} and is standing behind ${other.id}`);
        }
      }
    }
    console.log(`  ${b.id}: ${mine.length} — ${mine.map((p) => p.id).join(", ")}`);
  }

  // EVERY YARD NEEDS SOMETHING OF ITS OWN, which is the actual content of "a
  // back yard says what the building is". Counting props does not say it: the
  // east cottage had a water butt and half a washing line, and both of those
  // are things two other buildings also have, so its yard was two objects that
  // could have belonged to anybody.
  //
  // A kind is the prop id with any trailing -a/-b/-1/-2 dropped, so the four
  // rain barrels are one kind and the two washing lines are one kind.
  // `-a`, `-b1` and `-2` all mean "another one of these". The first version
  // only stripped a bare letter or bare digits, so `laundry-b1` came back as a
  // kind of its own and the east cottage's half of a SHARED washing line
  // counted as something belonging to it alone — which is precisely the state
  // this check exists to catch. It passed the mutation it was written for.
  const kindOf = (id) => id.replace(/-(?:[a-z]\d*|\d+)$/, "");
  const owners = new Map();
  for (const p of back) {
    const k = kindOf(p.id);
    if (!owners.has(k)) owners.set(k, new Set());
    owners.get(k).add(p.behind);
  }
  for (const b of TOWN_BUILDINGS) {
    const mine = byBuilding.get(b.id) ?? [];
    const own = mine.filter((p) => owners.get(kindOf(p.id)).size === 1);
    if (own.length === 0) {
      fail(
        `${b.id}'s yard has nothing of its own — ` +
          `${mine.map((p) => kindOf(p.id)).join(", ")} all belong to other buildings too`,
      );
    }
  }

  // AND HALF OF THEM CANNOT BE SEEN AT ALL, which is the thing worth knowing
  // before anybody spends another milestone dressing one.
  //
  // This game has ONE camera bearing — it looks along -z and only its distance
  // moves — so "behind" is permanent, which is already why the monument has a
  // sight-line rule. A back yard is further from the centre than its building,
  // and for the three buildings on the up-screen half of the ring that puts the
  // yard behind its own house from every position a player can stand in.
  //
  // It is reported rather than failed: those yards are real, a player standing
  // in one sees it (the blocking building fades), and the collision has to be
  // right either way. What it means is that the three VISIBLE yards are the
  // ones the square reads by — and it is exactly why "the chapel's back yard is
  // the emptiest of the six" was reported from play about the building with the
  // most things behind it: of the three you can see, the chapel's held a
  // washing line and a barrel against a pell and a hayrick.
  const visible = [];
  const hidden = [];
  for (const b of TOWN_BUILDINGS) {
    const w = buildingWedge(b.id);
    (Math.sin((w.angleDeg * Math.PI) / 180) > 0 ? visible : hidden).push(b.id);
  }
  console.log(`  seen from the square: ${visible.join(", ")}`);
  console.log(`  behind their own building, permanently: ${hidden.join(", ")}`);
  if (visible.length === 0) fail("no back yard in town can be seen from the square");

  // Everything in the lane is either somebody's or deliberately the town's.
  const lane = TOWN_PROPS.filter((p) => p.radiusPx >= 640 && p.radiusPx <= 730);
  const communal = lane.filter((p) => !p.behind);
  console.log(`  ${communal.length} in the gaps, belonging to the town: ${communal.map((p) => p.id).join(", ")}`);
  if (BACK_LANE_PX < 600 || BACK_LANE_PX > TOWN_RADIUS_PX) {
    fail(`the back lane at ${BACK_LANE_PX} is not between the houses and the wall`);
  }

  // And every one of them is actually drawn. The client either names a prop
  // outright or sweeps a family of them by prefix, so both count.
  const client = readFileSync(new URL("../../client/src/three/town.ts", import.meta.url), "utf8");
  const named = new Set([...client.matchAll(/"([a-z][a-z0-9-]*)"/g)].map((m) => m[1]));
  const prefixes = [...client.matchAll(/startsWith\("([a-z][a-z0-9-]*)"\)/g)].map((m) => m[1]);
  const drawn = (id) => named.has(id) || prefixes.some((p) => id.startsWith(p));
  const missing = lane.filter((p) => !drawn(p.id));
  if (missing.length > 0) {
    fail(`placed and never drawn: ${missing.map((p) => p.id).join(", ")}`);
  } else {
    console.log(`  all ${lane.length} back-lane props are drawn by the client`);
  }
}

console.log(failures === 0 ? "\nOK — Emberhold still checks out." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
