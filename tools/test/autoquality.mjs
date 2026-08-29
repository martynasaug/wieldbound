// The graphics level adapting itself to the machine, walked without a browser.
//
// Same treatment as `pacing.mjs` and `shadowSchedule`: the rule is a pure
// function so the interesting cases — a fast display the frame cannot keep up
// with, a slow one it easily can, and the oscillation that a naive version of
// this would produce — can be run as arithmetic instead of as a play session.
import {
  autoQualityDecision, newAutoQuality, lowerCeiling,
  AUTO_HOLD_MS, AUTO_UP_HEADROOM, QUALITY_ORDER,
} from "../../client/src/three/quality.ts";

const problems = [];
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) problems.push(what); };

// 1. A 144Hz display and a frame that costs 9ms. The pacer has already gone to
//    divisor 2 (72fps) — exactly the reading this feature exists for.
{
  let s = newAutoQuality("high");
  const next = autoQualityDecision(s, { divisor: 2, costMs: 9, refreshMs: 6.94 }, AUTO_HOLD_MS + 1);
  check(next?.level === "balanced", "144Hz + a 9ms frame steps High down to Balanced");
}

// 2. And keeps going if that is still not enough.
{
  let s = { ...newAutoQuality("balanced"), changedAt: 0 };
  const next = autoQualityDecision(s, { divisor: 2, costMs: 8, refreshMs: 6.94 }, AUTO_HOLD_MS + 1);
  check(next?.level === "performance", "still missing the budget steps Balanced down to Performance");
}

// 3. It stops at the bottom rather than falling off the end of the table.
{
  const s = newAutoQuality("performance");
  const next = autoQualityDecision(s, { divisor: 3, costMs: 40, refreshMs: 6.94 }, AUTO_HOLD_MS + 1);
  check(next === null, "Performance is the floor — no level below it is invented");
}

// 4. A 60Hz display holding divisor 1 with room to spare climbs back up.
{
  const s = newAutoQuality("balanced");
  const next = autoQualityDecision(s, { divisor: 1, costMs: 6, refreshMs: 16.67 }, AUTO_HOLD_MS + 1);
  check(next?.level === "high", "plenty of headroom at divisor 1 steps Balanced up to High");
}

// 5. Fitting the budget is NOT on its own a reason to step up. A frame at 90%
//    of budget is one monster away from missing it.
{
  const s = newAutoQuality("balanced");
  const next = autoQualityDecision(s, { divisor: 1, costMs: 15, refreshMs: 16.67 }, AUTO_HOLD_MS + 1);
  check(next === null, "only just fitting the budget does not step up");
}

// 6. THE HOLD. Two decisions cannot land inside AUTO_HOLD_MS of each other,
//    or a camp coming into view would walk the level down three times in a
//    second and back up again once it was killed.
{
  const s = { ...newAutoQuality("high"), changedAt: 1000 };
  check(autoQualityDecision(s, { divisor: 2, costMs: 9, refreshMs: 6.94 }, 1000 + AUTO_HOLD_MS - 1) === null,
    "a second change inside the hold window is refused");
  check(autoQualityDecision(s, { divisor: 2, costMs: 9, refreshMs: 6.94 }, 1000 + AUTO_HOLD_MS + 1) !== null,
    "and allowed once the hold has passed");
}

// 7. THE CEILING, which is the whole anti-oscillation argument. A machine that
//    steps up to High, fails to hold it and steps back down must not then
//    step up to High again forever.
{
  let s = newAutoQuality("balanced");
  const up = autoQualityDecision(s, { divisor: 1, costMs: 6, refreshMs: 16.67 }, AUTO_HOLD_MS + 1);
  s = up;
  const down = autoQualityDecision(s, { divisor: 2, costMs: 20, refreshMs: 16.67 }, 2 * AUTO_HOLD_MS + 2);
  s = lowerCeiling(down, "high");
  const again = autoQualityDecision(s, { divisor: 1, costMs: 6, refreshMs: 16.67 }, 4 * AUTO_HOLD_MS + 3);
  check(up?.level === "high" && down?.level === "balanced", "a level that cannot be held is stepped back down");
  check(again === null, "and the ceiling stops it being tried a second time");
}

// 8. The player's own choice is final.
{
  const s = { ...newAutoQuality("high"), manual: true };
  check(autoQualityDecision(s, { divisor: 3, costMs: 40, refreshMs: 6.94 }, 1e9) === null,
    "pressing F4 stops adaptation for the session");
}

// 9. No measurement, no decision.
{
  const s = newAutoQuality("high");
  check(autoQualityDecision(s, { divisor: 1, costMs: 0, refreshMs: 0 }, 1e9) === null,
    "nothing is decided before the pacer has measured a refresh rate");
}

// 10. Sanity on the table itself, since the rule indexes it by rank.
check(QUALITY_ORDER.join(",") === "high,balanced,performance", "QUALITY_ORDER is best-to-worst, which the rule assumes");
check(AUTO_UP_HEADROOM > 0 && AUTO_UP_HEADROOM < 1, "the step-up headroom is a fraction of the budget");

console.log(problems.length ? `\n${problems.length} failure(s).` : "\nOK — the level follows the machine, and stops when told to.");
process.exit(problems.length ? 1 : 0);
