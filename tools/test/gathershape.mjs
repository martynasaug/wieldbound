// THE SHAPE OF A GATHER: SOLID NODES, REACHABLE NODES, AND A SWING YOU SEE.
//
// Three rules that are cheap to hold and expensive to notice broken, all of
// them newly load-bearing:
//
//   1. Nodes are SOLID now. Collision holds the player a body-radius clear of
//      the centre, so a node sized for how it looks can put itself outside its
//      own interaction range — a bush too fat to pick. That failure is silent
//      and total: the node simply never responds.
//   2. The gather duration and the animation have to agree. The reward may not
//      land mid-stroke, or the character pays out while still winding up.
//   3. Levelling gathering must keep buying time, because that is the entire
//      reward for it, and more material tiers are coming that gate on it.
//
//   node tools/test/gathershape.mjs
import {
  NODE_BODY_RADIUS_PX,
  gatherRangeToNode,
  PLAYER_BODY_RADIUS_PX,
  INTERACTION_RANGE_PX,
  GATHER_DURATION_MS,
  GATHER_DURATION_FLOOR_MS,
  GATHER_LEVEL_STEP_MS,
  gatherDurationForLevel,
  separationFor,
} from "../../shared/protocol-types.ts";

// `GatherFx.STROKE_MS` is client-only, so it is read out of the source rather
// than imported — the same approach `hints.mjs` and `protocol.mjs` take to
// their subjects, and for the same reason: the alternative is a second copy of
// the number here, silently drifting.
import { readFileSync } from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const gatherFxSource = readFileSync(path.join(root, "client/src/three/gatherfx.ts"), "utf8");
const STROKE_MS = Number(gatherFxSource.match(/STROKE_MS\s*=\s*(\d+)/)?.[1] ?? NaN);
const MIN_BEATS = Number(gatherFxSource.match(/MIN_BEATS\s*=\s*(\d+)/)?.[1] ?? NaN);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

section("1. every node can be reached while being solid");
{
  check("the stroke length was found in gatherfx.ts", Number.isFinite(STROKE_MS));
  for (const [kind, radius] of Object.entries(NODE_BODY_RADIUS_PX)) {
    // Collision stops the player here and no closer.
    const closest = separationFor(radius, PLAYER_BODY_RADIUS_PX);
    const allowed = gatherRangeToNode(kind);
    const margin = allowed - closest;
    console.log(`  ${kind.padEnd(5)} radius ${radius}: closest approach ${closest}px, gather allowed to ${allowed}px (${margin}px of room)`);
    check(
      `a ${kind} can be gathered from as close as collision permits`,
      margin > 0,
      `collision holds the player at ${closest}px but gathering stops at ${allowed}px — the node is unreachable`,
    );
    // And not merely by a pixel: the player has to be able to stand somewhere
    // comfortable rather than on one exact ring.
    check(
      `and with room to stand, not on a knife edge`,
      margin >= 20,
      `only ${margin}px between the collision shell and the range limit`,
    );
  }
}

section("2. a node is never wider than its own reach");
{
  // The rule behind the margin above, stated on its own so a future node kind
  // gets the reason and not just the failure.
  for (const [kind, radius] of Object.entries(NODE_BODY_RADIUS_PX)) {
    check(
      `${kind} is not so wide that its surface range is a formality`,
      radius < INTERACTION_RANGE_PX,
      `radius ${radius} against an interaction range of ${INTERACTION_RANGE_PX}`,
    );
  }
}

section("3. the reward never lands mid-swing");
{
  // The floor is the fast end of gathering, so it is the case that breaks: if a
  // gather can finish inside one stroke, the character pays out while still
  // winding up and the motion never completes.
  check(
    "even the fastest gather fits a whole stroke of the animation",
    GATHER_DURATION_FLOOR_MS >= STROKE_MS,
    `the floor is ${GATHER_DURATION_FLOOR_MS}ms against a ${STROKE_MS}ms stroke`,
  );
  // And the slow end has enough strokes to read as work rather than as one
  // swing and a wait.
  const beatsAtZero = Math.round(GATHER_DURATION_MS / STROKE_MS);
  console.log(`  a level-0 gather is ${GATHER_DURATION_MS}ms — about ${beatsAtZero} strokes`);
  check(
    "a fresh character's gather is several strokes long",
    beatsAtZero >= MIN_BEATS,
    `${beatsAtZero} strokes`,
  );
}

section("4. gather levels keep buying time");
{
  // The entire reward for levelling gathering is speed. If the floor arrives
  // after two levels then every level after the second pays nothing, which is
  // what the old 3000/500 pair did by level seven — and material tiers gated on
  // gather level are coming, so the ladder has to stay worth climbing.
  const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const times = levels.map((l) => gatherDurationForLevel(l));
  console.log(`  by level: ${times.map((t, i) => `${i}:${t}`).join("  ")}`);
  const firstFloored = times.findIndex((t) => t === GATHER_DURATION_FLOOR_MS);
  check(
    "levelling still pays at level 5",
    times[5] > GATHER_DURATION_FLOOR_MS,
    `level 5 is already at the floor of ${GATHER_DURATION_FLOOR_MS}ms`,
  );
  check(
    "a level always takes real time off until the floor",
    times.every((t, i) => i === 0 || t < times[i - 1] || t === GATHER_DURATION_FLOOR_MS),
    "some level bought nothing",
  );
  console.log(
    firstFloored === -1
      ? "  the floor is not reached inside 8 levels"
      : `  the floor is reached at level ${firstFloored}`,
  );
  check(
    "one level is a share of the gather worth noticing",
    GATHER_LEVEL_STEP_MS / GATHER_DURATION_MS >= 0.05,
    `a level saves ${Math.round((GATHER_LEVEL_STEP_MS / GATHER_DURATION_MS) * 100)}% of a gather`,
  );
}

console.log(failures === 0 ? "\nOK — nodes are solid, reachable, and worth levelling" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
