// The enrage phase: a boss under its own threshold gets more dangerous rather
// than running, the opposite low-health answer from a goblin's `fleeThreshold`.
//
// Needs no server: `isEnraged`/`enragedWindupMs`/`enragedIntervalMs` are pure
// functions of hp/maxHp and the shared table, the same reasoning that keeps
// class derived from equipped gear rather than cached — and it is exactly
// that "derived, not broadcast" property this file exists to hold true, on
// top of the design rules the bestiary itself is supposed to follow.
//
//   node tools/test/enrage.mjs

import {
  MONSTER_STATS,
  isEnraged,
  enragedWindupMs,
  enragedIntervalMs,
} from "../../shared/protocol-types.ts";

let failures = 0;
const fail = (msg) => {
  console.log(`  FAIL  ${msg}`);
  failures++;
};

console.log("1. the pure functions themselves");
{
  // No threshold set: never enraged, whatever the hp fraction.
  if (isEnraged(1, 100, undefined)) fail("a kind with no threshold reported enraged");
  if (isEnraged(0, 100, undefined)) fail("even at zero hp, no threshold means never enraged");

  // Right at the boundary and on both sides of it.
  if (!isEnraged(30, 100, 0.3)) fail("hp/maxHp exactly at the threshold should count as enraged (<=)");
  if (isEnraged(31, 100, 0.3)) fail("one hp above the threshold should not be enraged yet");
  if (!isEnraged(29, 100, 0.3)) fail("one hp below the threshold should be enraged");
  if (!isEnraged(0, 100, 0.3)) fail("dead-but-not-yet-removed (0 hp) should still read as enraged");

  // A monster with 0 maxHp cannot divide sanely — must fail closed, not throw
  // or report enraged on garbage input.
  if (isEnraged(0, 0, 0.3)) fail("zero maxHp should read as not-enraged rather than NaN-enraged");

  // Scaling: undefined scale is a no-op regardless of the enraged flag; a real
  // scale only applies once actually enraged.
  if (enragedWindupMs(900, false, 0.7) !== 900) fail("not enraged should leave windupMs untouched even with a scale set");
  if (enragedWindupMs(900, true, undefined) !== 900) fail("enraged with no scale configured should leave windupMs untouched");
  if (enragedWindupMs(900, true, 0.7) !== 630) fail("enraged with a 0.7 scale should shorten 900ms to 630");
  if (enragedIntervalMs(3000, false, 0.8) !== 3000) fail("not enraged should leave attackIntervalMs untouched");
  if (enragedIntervalMs(3000, true, 0.8) !== 2400) fail("enraged with a 0.8 scale should shorten 3000ms to 2400");
}

console.log("2. which kinds get it, and why");
{
  for (const [kind, stats] of Object.entries(MONSTER_STATS)) {
    const hasEnrage = stats.enrageThreshold !== undefined;
    const isBoss = stats.guaranteedDrop === true;
    // The design rule this table is written under (see the field's own
    // comment): reserved for the guaranteed-drop kinds, nothing else. A kind
    // gaining one without also being a boss — or a boss quietly missing one —
    // is exactly the kind of drift a table this large accumulates silently.
    if (hasEnrage && !isBoss) fail(`${kind} has an enrage threshold but is not a guaranteed-drop boss`);
    if (isBoss && !hasEnrage) fail(`${kind} is a guaranteed-drop boss with no enrage threshold`);
  }
}

console.log("3. the numbers stay sane wherever they are set");
{
  // A minimum a player can still physically react to and step out of — this
  // project's own bar elsewhere for "readable," since the troll's enraged
  // wind-up (630ms) was deliberately picked to land AT the dragon's own base
  // wind-up (950ms's neighbourhood) rather than below every wind-up in the
  // game.
  const MIN_READABLE_WINDUP_MS = 400;
  for (const [kind, stats] of Object.entries(MONSTER_STATS)) {
    if (stats.enrageThreshold === undefined) continue;
    if (stats.enrageThreshold <= 0 || stats.enrageThreshold >= 1) {
      fail(`${kind}'s enrageThreshold ${stats.enrageThreshold} is not a fraction strictly between 0 and 1`);
    }
    if (stats.enrageWindupScale !== undefined) {
      if (stats.enrageWindupScale <= 0 || stats.enrageWindupScale >= 1) {
        fail(`${kind}'s enrageWindupScale ${stats.enrageWindupScale} should shorten the wind-up (0, 1), not lengthen or zero it`);
      }
      if (stats.windupMs !== undefined) {
        const enraged = stats.windupMs * stats.enrageWindupScale;
        if (enraged < MIN_READABLE_WINDUP_MS) {
          fail(`${kind}'s enraged wind-up (${enraged}ms) is under the ${MIN_READABLE_WINDUP_MS}ms readability floor`);
        }
      }
    }
    if (stats.enrageIntervalScale !== undefined) {
      if (stats.enrageIntervalScale <= 0 || stats.enrageIntervalScale >= 1) {
        fail(`${kind}'s enrageIntervalScale ${stats.enrageIntervalScale} should shorten the cycle (0, 1), not lengthen or zero it`);
      }
    }
  }
}

if (failures === 0) {
  console.log("\nOK — the enrage phase is derived, sane, and reserved for bosses");
} else {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
