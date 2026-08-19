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

console.log(failures === 0 ? "\nOK — all body rules hold" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
