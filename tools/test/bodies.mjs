// Checks the body-collision rules against every monster kind and every weapon.
//
// Body radii are hand-tuned numbers chosen to match the models the client
// draws, and they sit in the middle of two invariants that are easy to break by
// nudging one of them:
//
//   1. You must be able to hit what you are touching. If a body were wider than
//      your reach, walking up to it would push you out of your own attack range
//      and melee against that kind would silently stop working.
//   2. It must be able to hit you back. A monster whose reach is shorter than
//      the distance the two bodies force between them would walk up, stop, and
//      stand there harmlessly forever.
//
// Neither shows up as an error — the fight just quietly does nothing — so they
// are worth asserting rather than discovering. Needs no server: it is pure
// arithmetic over the shared rules.
//
//   node tools/test/bodies.mjs

import {
  AGGRO_RANGE_PX,
  BASE_MOVE_SPEED_PX_PER_SEC,
  MONSTER_STATS,
  PLAYER_BODY_RADIUS_PX,
  WEAPON_TYPES,
  attackRangeFor,
  resolveBodyCollision,
  separationFor,
} from "../../shared/protocol-types.ts";

// Melee needs slack, not merely a positive number: the server's copy of where
// you are standing lags the client's by up to a send interval, so a margin of a
// pixel or two is the same as none. Eight is comfortably past that.
const MIN_REACH_MARGIN_PX = 8;

let failures = 0;
const fail = (msg) => {
  console.log(`  FAIL  ${msg}`);
  failures++;
};

const kinds = Object.keys(MONSTER_STATS);
// Fists are a real weapon family and the shortest reach in the game, so they
// are the case that actually binds.
const weapons = [undefined, ...WEAPON_TYPES];

console.log(`player radius ${PLAYER_BODY_RADIUS_PX}px, ${kinds.length} monster kinds\n`);

console.log("1. every weapon reaches past every body");
for (const kind of kinds) {
  const contact = separationFor(PLAYER_BODY_RADIUS_PX, MONSTER_STATS[kind].bodyRadiusPx);
  let worst = Infinity;
  let worstWeapon = null;
  for (const weapon of weapons) {
    const margin = attackRangeFor(weapon) - contact;
    if (margin < worst) {
      worst = margin;
      worstWeapon = weapon ?? "fist";
    }
    if (margin < MIN_REACH_MARGIN_PX) {
      fail(
        `${kind}: ${weapon ?? "fist"} reaches ${attackRangeFor(weapon)}px against contact ${contact}px ` +
          `— ${margin}px of slack, needs ${MIN_REACH_MARGIN_PX}px`,
      );
    }
  }
  console.log(
    `  ${kind.padEnd(10)} contact ${String(contact).padStart(3)}px  tightest ${String(worstWeapon).padEnd(7)} +${worst}px`,
  );
}

console.log("\n2. every monster reaches back");
for (const kind of kinds) {
  const stats = MONSTER_STATS[kind];
  const contact = separationFor(PLAYER_BODY_RADIUS_PX, stats.bodyRadiusPx);
  const margin = stats.attackRangePx - contact;
  if (margin < 0) {
    fail(`${kind}: reach ${stats.attackRangePx}px is shorter than contact ${contact}px — it could never land a blow`);
  } else {
    console.log(`  ${kind.padEnd(10)} reach ${String(stats.attackRangePx).padStart(3)}px vs contact ${String(contact).padStart(3)}px  +${margin}px`);
  }
}

console.log("\n3. resolveBodyCollision always separates");
{
  const bodies = [
    { x: 100, y: 100, radiusPx: 30 },
    { x: 140, y: 100, radiusPx: 30 },
    { x: 120, y: 130, radiusPx: 20 },
  ];
  const starts = [
    ["dead centre of one body", 100, 100],
    ["between two bodies", 120, 100],
    ["in the middle of all three", 120, 110],
    ["already clear", 400, 400],
  ];
  for (const [label, x, y] of starts) {
    const out = resolveBodyCollision(x, y, PLAYER_BODY_RADIUS_PX, bodies);
    let worst = 0;
    for (const b of bodies) {
      const need = separationFor(PLAYER_BODY_RADIUS_PX, b.radiusPx);
      const overlap = need - Math.hypot(out.x - b.x, out.y - b.y);
      if (overlap > worst) worst = overlap;
    }
    if (!Number.isFinite(out.x) || !Number.isFinite(out.y)) {
      fail(`${label}: produced a non-finite position`);
    } else if (worst > 0.001) {
      fail(`${label}: still ${worst.toFixed(2)}px inside a body`);
    } else {
      console.log(`  ${label.padEnd(28)} -> (${out.x.toFixed(1)}, ${out.y.toFixed(1)})  clear`);
    }
  }
}

// --- Things that throw ------------------------------------------------------
// Twelve of the thirteen kinds walked into contact and swung, so every fight in
// the game had the same shape. Three of them fight at a distance now, and every
// way that goes wrong makes the game WORSE than the melee-only version it
// replaced — so the rules are worth stating out loud.

console.log("\n== things that throw ==");
{
  const throwers = Object.entries(MONSTER_STATS).filter(([, s]) => s.keepAwayPx !== undefined);
  if (throwers.length === 0) fail("nothing in the bestiary fights at a distance");

  for (const [kind, s] of throwers) {
    // THE ONE THAT MATTERS. A creature that backpedals as fast as you advance
    // is a creature you can never reach, and that is not a fight, it is a
    // chore. Closing the gap has to work; what it costs is the hits on the way.
    const backpedal = s.speedPxPerSec * (s.backpedalPace ?? 0.5);
    if (backpedal >= BASE_MOVE_SPEED_PX_PER_SEC) {
      fail(
        `a ${kind} gives ground at ${backpedal.toFixed(0)}px/s against a player's ` +
          `${BASE_MOVE_SPEED_PX_PER_SEC} — you could never catch it`,
      );
    }
    if ((s.backpedalPace ?? 0.5) >= 1) fail(`${kind} backpedals as fast as it chases`);

    // It has to be able to reach you from where it chooses to stand, or it
    // holds a distance it cannot shoot from and the fight simply stops.
    if (s.attackRangePx <= s.keepAwayPx) {
      fail(`${kind} holds at ${s.keepAwayPx}px but only reaches ${s.attackRangePx}px`);
    }

    // And it must not out-range its own aggro, or it shoots people who have no
    // idea it has noticed them.
    if (s.attackRangePx > AGGRO_RANGE_PX) {
      fail(`${kind} reaches ${s.attackRangePx}px but only notices you at ${AGGRO_RANGE_PX}px`);
    }

    console.log(
      `  ${kind.padEnd(9)} reaches ${String(s.attackRangePx).padStart(3)}px, holds ${String(s.keepAwayPx).padStart(3)}px, ` +
        `gives ground at ${backpedal.toFixed(0)}px/s against your ${BASE_MOVE_SPEED_PX_PER_SEC}`,
    );
  }

  // And most of the bestiary must stay melee. A world where everything kites is
  // a world with one fight in it, which is this complaint inverted.
  const total = Object.keys(MONSTER_STATS).length;
  if (throwers.length > total / 2) {
    fail(`${throwers.length} of ${total} kinds fight at range — closing the gap has stopped being a change of pace`);
  }
  console.log(`  ${throwers.length} throw, ${total - throwers.length} still walk in and swing`);
}

console.log(failures === 0 ? "\nOK — all body rules hold" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
