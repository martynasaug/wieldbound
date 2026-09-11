// HOW LONG THE FIRST FIGHT TAKES, AND HOW MUCH OF IT IS MISSING.
//
// A guided-opening run measured 363 attack presses for 6 kills — sixty presses
// to kill something with 15 HP. Two things make that number, and only one of
// them is supposed to: how hard a blow lands, and how often one lands at all.
//
// A new character starts at Agility 1, so `playerAccuracy` is 50 + 2 = 52.
// Against a slime's 5 evasion that is a 47% hit chance, and against a goblin's
// 15 it is 37%. The first monster in the game dodges more than half of what a
// new player throws at it, which reads as a broken weapon rather than as a
// difficulty curve — a slow fight is a design choice, a fight you cannot tell
// you are winning is not.
//
// This prints the arithmetic at the levels a new player actually plays, so the
// early game can be tuned against numbers rather than against a feeling. It
// asserts the floor and reports the rest.
//
//   node tools/test/earlycombat.mjs
import {
  playerAccuracy,
  playerCritChance,
  playerMinHit,
  playerMaxHit,
  MONSTER_STATS,
  playerAttackIntervalMs,
  critDamageMultiplier,
} from "../../shared/protocol-types.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};

/**
 * A fight, on average, ignoring monster damage: how long to take one down.
 *
 * Averages rather than a simulation on purpose. A simulation would need a seed
 * and would answer a slightly different question every run; the expected number
 * of swings is exact, and it is the number a player feels as "this takes
 * forever".
 */
function fight(kind, { agility, power, weaponSpeed = 1, weaponDamage = 1 }) {
  const m = MONSTER_STATS[kind];
  const accuracy = playerAccuracy(agility);
  const hitChance = Math.max(5, Math.min(95, accuracy - m.evasion)) / 100;
  const crit = playerCritChance(agility) / 100;
  const min = Math.round(playerMinHit(power) * weaponDamage);
  const max = Math.round(playerMaxHit(power, 0) * weaponDamage);
  // Armour is subtracted per blow, so it bites hardest on the smallest hits —
  // which is exactly the early game.
  const avgRaw = (min + max) / 2;
  const avgHit = Math.max(1, avgRaw - m.armor);
  const withCrit = avgHit * (1 - crit) + avgHit * critDamageMultiplier(null) * crit;
  const perSwing = withCrit * hitChance;
  const swings = m.maxHp / perSwing;
  // THE SHIPPED FUNCTION, NOT A COPY OF IT. This rebuilt the interval out of
  // BATTLE_DURATION_MS and the two step constants, which is a second
  // implementation to keep in step with the first — and `attackspam.mjs` had
  // already been caught failing a run because its own copy of this arithmetic
  // was 700ms out. The starting weapon is unenchanted, so the rarity argument
  // is null.
  const intervalMs = Math.round(playerAttackIntervalMs(null, power, agility) * weaponSpeed);
  return {
    hitPercent: Math.round(hitChance * 100),
    avgHit: Math.round(avgHit * 10) / 10,
    swings: Math.round(swings * 10) / 10,
    intervalMs,
    seconds: Math.round((swings * intervalMs) / 100) / 10,
  };
}

// The dagger a character starts with: `mods.speed` 0.9, no damage modifier.
const STARTER = { agility: 1, power: 0, weaponSpeed: 0.9 };

console.log("a brand-new character (Agility 1, starting dagger) against the first monsters:\n");
console.log("  monster   hit%   avg hit   swings   interval   time to kill");
for (const kind of ["slime", "goblin"]) {
  const f = fight(kind, STARTER);
  console.log(
    `  ${kind.padEnd(9)} ${String(f.hitPercent).padStart(3)}%   ${String(f.avgHit).padStart(6)}   ` +
      `${String(f.swings).padStart(6)}   ${String(f.intervalMs).padStart(6)}ms   ${f.seconds}s`,
  );
}

console.log("\n1. a new player must land a clear majority of swings on the first monster");
{
  // THE FLOOR IS ABOUT LEGIBILITY, NOT DIFFICULTY. A slow fight teaches
  // patience; a fight where most swings do nothing teaches that the game is
  // broken, because a miss and a bug look identical when you have no numbers.
  // Two thirds is the line: it still misses often enough to notice, and it
  // never spends three swings in a row on nothing.
  const f = fight("slime", STARTER);
  check(
    "a level-1 character hits a slime at least 65% of the time",
    f.hitPercent >= 65,
    `it is ${f.hitPercent}% — accuracy ${playerAccuracy(1)} against ${MONSTER_STATS.slime.evasion} evasion`,
  );
  const g = fight("goblin", STARTER);
  check(
    "and hits a goblin at least half the time",
    g.hitPercent >= 50,
    `it is ${g.hitPercent}%`,
  );
}

console.log("\n2. the first fight is slow, but not interminable");
{
  // The other half of the same judgement. The ask is explicitly for a slow
  // opening, so this is a ceiling rather than a target — it exists to catch a
  // future change that makes the first monster take a minute.
  const f = fight("slime", STARTER);
  check(
    "a slime dies inside 40 seconds",
    f.seconds <= 40,
    `it takes ${f.seconds}s (${f.swings} swings at ${f.intervalMs}ms)`,
  );
  check(
    "and takes more than a couple of swings, so the opening is not trivial",
    f.swings >= 4,
    `it takes ${f.swings} swings`,
  );
}

console.log("\n3. Agility still buys accuracy where it matters");
{
  // Raising the floor must not flatten the stat. The ghost is the one monster
  // built around accuracy — its own note says 38 evasion is there to "answer
  // accuracy rather than damage" — so a low-Agility build must still feel it.
  const lowAgility = Math.max(5, Math.min(95, playerAccuracy(10) - MONSTER_STATS.ghost.evasion));
  const highAgility = Math.max(5, Math.min(95, playerAccuracy(30) - MONSTER_STATS.ghost.evasion));
  console.log(`  against the ghost: Agility 10 hits ${lowAgility}%, Agility 30 hits ${highAgility}%`);
  check(
    "a low-Agility build still struggles against the ghost",
    lowAgility <= 60,
    `it hits ${lowAgility}% — the ghost has stopped asking the question it exists to ask`,
  );
  check(
    "and an Agility build is meaningfully better there",
    highAgility - lowAgility >= 20,
    `the gap is ${highAgility - lowAgility} points`,
  );
}

console.log(failures === 0 ? "\nOK — the opening is slow without being opaque" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
