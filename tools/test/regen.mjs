// HOW LONG DOES IT TAKE TO GET BACK ON YOUR FEET?
//
// Regen is out-of-combat only, which is a deliberate and good rule: it is what
// makes disengaging a decision and what gives Mend a job. That rule is also
// what makes the RATE expensive, because every point of it is paid for in
// standing still, and standing still is the one thing a player cannot enjoy.
//
// The fault this guards against is not a wrong number, it is a wrong SHAPE.
// The rate was flat — one point every five seconds, twelve a minute, whatever
// your health pool — while `maxHpForLevel` grows by ten a level forever. So
// recovery got strictly worse the longer someone played: 5.8 minutes from empty
// at level 1, 8.3 at level 2, 25.0 at level 20. Nothing throws, no test failed,
// and the only symptom is that the game gets more tedious as you succeed at it.
//
// So this asserts the property rather than the constant: time to recover must
// not climb with level. Retune `HP_REGEN_FRACTION` freely; make healing scale
// worse than the pool again and this says so.
//
//   node tools/test/regen.mjs
import {
  regenAmountForVitality,
  maxHpForLevel,
  HP_REGEN_FRACTION,
} from "../../shared/protocol-types.ts";

const HP_REGEN_INTERVAL_MS = 5000; // server tick cadence; see index.ts
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) { failures++; console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
};

/** Minutes to refill an empty pool at a given level and vitality. */
const minutesToFull = (level, vitality) => {
  const pool = maxHpForLevel(level, vitality);
  const perTick = regenAmountForVitality(vitality, pool);
  return (pool / perTick) * (HP_REGEN_INTERVAL_MS / 1000) / 60;
};

const LEVELS = [1, 2, 5, 10, 20, 40, 80];
console.log(`fraction ${HP_REGEN_FRACTION}, tick ${HP_REGEN_INTERVAL_MS}ms\n`);
console.log("level   pool   per tick   minutes from empty");
const times = [];
for (const lvl of LEVELS) {
  const pool = maxHpForLevel(lvl, 1);
  const per = regenAmountForVitality(1, pool);
  const mins = minutesToFull(lvl, 1);
  times.push(mins);
  console.log(`${String(lvl).padStart(5)}  ${String(pool).padStart(5)}  ${String(per).padStart(8)}   ${mins.toFixed(1)}`);
}

// THE SHAPE: recovery must not get worse as the character grows. A little drift
// from rounding a fraction to whole points is expected and fine; a trend is not.
const worst = Math.max(...times);
const first = times[0];
check(
  "recovery does not get worse with level",
  worst <= first * 1.35,
  `level 1 takes ${first.toFixed(1)} min and the worst level takes ${worst.toFixed(1)} min`,
);

// AND IT IS STILL A COST. Regen that refills a pool in seconds would delete the
// reason the out-of-combat rule exists — this guards the other direction.
check(
  "disengaging still costs real time",
  Math.min(...times) >= 1.5,
  `fastest full recovery is ${Math.min(...times).toFixed(1)} min, which is not a decision`,
);

// NOTHING GOT SLOWER than the flat rate it replaced, which is what makes this
// safe to ship against existing characters.
for (const lvl of LEVELS) {
  for (const vit of [0, 1, 8, 24, 60]) {
    const pool = maxHpForLevel(lvl, vit);
    const flat = Math.min(5, 1 + Math.floor(vit / 8));
    check(
      `level ${lvl} vitality ${vit} is not slower than the old flat rate`,
      regenAmountForVitality(vit, pool) >= flat,
      `${regenAmountForVitality(vit, pool)} per tick against the old ${flat}`,
    );
  }
}

// VITALITY STILL BUYS SOMETHING. It is a floor under the fraction, so at low
// levels it must still raise the rate — otherwise the stat quietly stops
// mattering for regen and its description becomes a lie.
const poolLow = maxHpForLevel(1, 0);
const poolHigh = maxHpForLevel(1, 40);
check(
  "vitality still raises the rate",
  regenAmountForVitality(40, poolHigh) > regenAmountForVitality(0, poolLow),
  `vit 40 gives ${regenAmountForVitality(40, poolHigh)}, vit 0 gives ${regenAmountForVitality(0, poolLow)}`,
);

console.log(failures === 0 ? "\nOK — getting back up costs the same at every level" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
