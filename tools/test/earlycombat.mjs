// HOW LONG THE FIRST FIGHT TAKES, AND HOW MUCH OF IT IS MISSING.
//
// A guided-opening run measured 363 attack presses for 6 kills — sixty presses
// to kill something with 15 HP. Two things make that number, and only one of
// them is supposed to: how hard a blow lands, and how often one lands at all.
//
// This prints the arithmetic at the levels a new player actually plays, so the
// early game can be tuned against numbers rather than against a feeling. It
// asserts the floor and reports the rest.
//
// THE PREVIOUS VERSION OF THIS FILE WAS A SECOND COMBAT FORMULA. It computed a
// blow as `max(1, avg - armour)` from `playerMinHit`/`playerMaxHit`, which is
// three rules out of date at once: it ignored the weapon's own damage feel (the
// broken dirk swings 1-3, not 1-4), the goblin's 15% physical resist, and the
// proportional armour floor M70.255 added. So it reported a goblin as 61.8
// swings for a level-1 character, and the handoff that followed asked whether
// goblin armour needed cutting on the strength of a number no fight in the game
// produces. Everything below now goes through `hitBandOf`, `resolveHit` and
// `swingIntervalOf` — the functions the server calls — with the dirk the
// server actually hands a new character (`db.ts`: dirk, broken, roll 0.5).
//
//   node tools/test/earlycombat.mjs
import {
  playerAccuracy,
  playerCritChance,
  MONSTER_STATS,
  STAT_POINTS_PER_LEVEL,
  critDamageMultiplier,
  doubleAttackChance,
  resolveHit,
} from "../../shared/protocol-types.ts";
import { ITEM_BASES, rollItem, hitBandOf, swingIntervalOf } from "../../shared/items.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};

const STARTER_RARITY = "broken";
const DIRK = { ...rollItem(ITEM_BASES.dirk, STARTER_RARITY, () => 0.5), id: "starter", equipped: true };
// A new character's Agility, and every level's points spent on the stat the
// weapon scales with — the fastest the opening can go without gear, which is
// the right side to err on for a ceiling.
const AGILITY = 1;
const powerAt = (level) => (level - 1) * STAT_POINTS_PER_LEVEL;

/**
 * The expected blow once it has landed, through the shipped `resolveHit`.
 *
 * Exact rather than sampled: `resolveHit` draws hit, crit, then the roll, so it
 * is handed a scripted sequence that forces the hit, fixes the crit branch and
 * walks the roll across a fine grid. Resist, rounding, the armour floor and the
 * crit multiplier all come from the game's own code in the game's own order.
 */
function expectedLandedDamage(kind, band) {
  const m = MONSTER_STATS[kind];
  const critChance = playerCritChance(AGILITY) / 100;
  const N = 2000;
  let total = 0;
  for (const crit of [true, false]) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const draws = [0, crit ? 0 : 0.9999, (i + 0.5) / N];
      sum += resolveHit(
        {
          attackerAccuracy: 1000,
          attackerMinHit: band.min,
          attackerMaxHit: band.max,
          attackerCritChance: crit ? 100 : 0,
          attackerCritMultiplier: critDamageMultiplier(STARTER_RARITY),
          defenderEvasion: 0,
          defenderArmor: m.armor,
          defenderResist: m.resist?.physical ?? 0,
        },
        () => draws.shift(),
      ).damage;
    }
    total += (crit ? critChance : 1 - critChance) * (sum / N);
  }
  return total;
}

function fight(kind, level) {
  const m = MONSTER_STATS[kind];
  const power = powerAt(level);
  const band = hitBandOf(DIRK, power, 0, 0);
  const hitChance = Math.max(5, Math.min(95, playerAccuracy(AGILITY) - m.evasion)) / 100;
  const perLanded = expectedLandedDamage(kind, band);
  const landed = m.maxHp / perLanded;
  // A double swing is its own attack in the same interval, so it divides the
  // presses rather than multiplying the blow.
  const swings = landed / hitChance / (1 + doubleAttackChance(AGILITY) / 100);
  // Battle power is its own progression and a new character has none.
  const intervalMs = swingIntervalOf(DIRK, STARTER_RARITY, 0, AGILITY);
  return {
    band: `${band.min}-${band.max}`,
    hitPercent: Math.round(hitChance * 100),
    perLanded: Math.round(perLanded * 100) / 100,
    landed: Math.round(landed * 10) / 10,
    swings: Math.round(swings * 10) / 10,
    intervalMs,
    seconds: Math.round((swings * intervalMs) / 100) / 10,
  };
}

const EARLY = ["slime", "mushnub", "spikyblob", "goblin", "armabee"];
console.log("the starting dirk, every point in the weapon's stat, against bands 1 and 2:\n");
console.log("  monster    band  lvl  hits    hit%  per blow  landed  swings  time to kill");
for (const kind of EARLY) {
  for (const level of [1, 2, 3]) {
    const f = fight(kind, level);
    console.log(
      `  ${(level === 1 ? kind : "").padEnd(10)} ${String(level === 1 ? MONSTER_STATS[kind].band : "").padStart(4)}` +
        `  ${String(level).padStart(3)}  ${f.band.padEnd(6)} ${String(f.hitPercent).padStart(3)}%  ` +
        `${String(f.perLanded).padStart(8)}  ${String(f.landed).padStart(6)}  ${String(f.swings).padStart(6)}  ${f.seconds}s`,
    );
  }
}

console.log("\n1. a new player must land a clear majority of swings on the first monster");
{
  // THE FLOOR IS ABOUT LEGIBILITY, NOT DIFFICULTY. A slow fight teaches
  // patience; a fight where most swings do nothing teaches that the game is
  // broken, because a miss and a bug look identical when you have no numbers.
  // Two thirds is the line: it still misses often enough to notice, and it
  // never spends three swings in a row on nothing.
  const f = fight("slime", 1);
  check(
    "a level-1 character hits a slime at least 65% of the time",
    f.hitPercent >= 65,
    `it is ${f.hitPercent}% — accuracy ${playerAccuracy(AGILITY)} against ${MONSTER_STATS.slime.evasion} evasion`,
  );
  const g = fight("goblin", 1);
  check("and hits a goblin at least half the time", g.hitPercent >= 50, `it is ${g.hitPercent}%`);
}

console.log("\n2. the first fight is slow, but not interminable");
{
  // The other half of the same judgement. The ask is explicitly for a slow
  // opening, so this is a ceiling rather than a target — it exists to catch a
  // future change that makes the first monster take a minute.
  const f = fight("slime", 1);
  check("a slime dies inside 40 seconds", f.seconds <= 40, `it takes ${f.seconds}s (${f.swings} swings at ${f.intervalMs}ms)`);
  check("and takes more than a couple of swings, so the opening is not trivial", f.swings >= 4, `it takes ${f.swings} swings`);
}

console.log("\n3. the rings are a curve a player climbs, not a wall");
{
  // WHERE THE GOBLIN QUESTION ACTUALLY LIVES. A level-1 character is 1350px
  // from the nearest goblin and 20 XP — four slimes — from level 2, so what a
  // goblin costs at level 1 is not the number a player meets. The two that are:
  // everything in the ring you spawn in is killable at level 1 inside a minute,
  // and everything in the next ring is inside half a minute by level 3. The
  // first catches armour or resist added to a band-1 kind without looking at a
  // 1-3 weapon; the second catches the same done to band 2, which is the change
  // the goblin's numbers invite.
  for (const kind of EARLY.filter((k) => MONSTER_STATS[k].band === 1)) {
    const f = fight(kind, 1);
    check(`a level-1 character kills a ${kind} inside 60 seconds`, f.seconds <= 60, `it takes ${f.seconds}s (${f.landed} landed)`);
  }
  for (const kind of EARLY.filter((k) => MONSTER_STATS[k].band === 2)) {
    const f = fight(kind, 3);
    check(`a level-3 character kills a ${kind} inside 30 seconds`, f.seconds <= 30, `it takes ${f.seconds}s (${f.landed} landed)`);
  }
}

console.log("\n4. Agility still buys accuracy where it matters");
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
  check("and an Agility build is meaningfully better there", highAgility - lowAgility >= 20, `the gap is ${highAgility - lowAgility} points`);
}

console.log(failures === 0 ? "\nOK — the opening is slow without being opaque" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
