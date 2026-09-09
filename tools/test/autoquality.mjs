// The graphics level adapting itself to the machine, walked without a browser.
//
// Same treatment as `pacing.mjs` and `shadowSchedule`: the rule is a pure
// function so the interesting cases — a fast display the frame cannot keep up
// with, a slow one it easily can, and the oscillation that a naive version of
// this would produce — can be run as arithmetic instead of as a play session.
import {
  autoQualityDecision, newAutoQuality, lowerCeiling, MAX_PLAUSIBLE_REFRESH_MS,
  AUTO_HOLD_MS, AUTO_SETTLE_MS, AUTO_UP_HEADROOM, QUALITY_ORDER,
} from "../../client/src/three/quality.ts";

const problems = [];
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) problems.push(what); };
// Every case below is about the STEADY state, so each starts already settled.
// The settle period itself is checked on its own at the end.
const settled = (level) => ({ ...newAutoQuality(level), startedAt: -1e6 });

// 1. A 144Hz display and a frame that costs 9ms. The pacer has already gone to
//    divisor 2 (72fps) — exactly the reading this feature exists for.
{
  let s = settled("high");
  const next = autoQualityDecision(s, { divisor: 2, costMs: 9, refreshMs: 6.94 }, AUTO_HOLD_MS + 1);
  check(next?.level === "balanced", "144Hz + a 9ms frame steps High down to Balanced");
}

// 2. And keeps going if that is still not enough.
{
  let s = { ...settled("balanced"), changedAt: 0 };
  const next = autoQualityDecision(s, { divisor: 2, costMs: 8, refreshMs: 6.94 }, AUTO_HOLD_MS + 1);
  check(next?.level === "performance", "still missing the budget steps Balanced down to Performance");
}

// 3. It stops at the bottom rather than falling off the end of the table.
{
  const s = settled("performance");
  const next = autoQualityDecision(s, { divisor: 3, costMs: 40, refreshMs: 6.94 }, AUTO_HOLD_MS + 1);
  check(next === null, "Performance is the floor — no level below it is invented");
}

// 4. A 60Hz display holding divisor 1 with room to spare climbs back up.
{
  const s = settled("balanced");
  const next = autoQualityDecision(s, { divisor: 1, costMs: 6, refreshMs: 16.67 }, AUTO_HOLD_MS + 1);
  check(next?.level === "high", "plenty of headroom at divisor 1 steps Balanced up to High");
}

// 5. Fitting the budget is NOT on its own a reason to step up. A frame at 90%
//    of budget is one monster away from missing it.
{
  const s = settled("balanced");
  const next = autoQualityDecision(s, { divisor: 1, costMs: 15, refreshMs: 16.67 }, AUTO_HOLD_MS + 1);
  check(next === null, "only just fitting the budget does not step up");
}

// 6. THE HOLD. Two decisions cannot land inside AUTO_HOLD_MS of each other,
//    or a camp coming into view would walk the level down three times in a
//    second and back up again once it was killed.
{
  const s = { ...settled("high"), changedAt: 1000 };
  check(autoQualityDecision(s, { divisor: 2, costMs: 9, refreshMs: 6.94 }, 1000 + AUTO_HOLD_MS - 1) === null,
    "a second change inside the hold window is refused");
  check(autoQualityDecision(s, { divisor: 2, costMs: 9, refreshMs: 6.94 }, 1000 + AUTO_HOLD_MS + 1) !== null,
    "and allowed once the hold has passed");
}

// 7. THE CEILING, which is the whole anti-oscillation argument. A machine that
//    steps up to High, fails to hold it and steps back down must not then
//    step up to High again forever.
{
  let s = settled("balanced");
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
  const s = { ...settled("high"), manual: true };
  check(autoQualityDecision(s, { divisor: 3, costMs: 40, refreshMs: 6.94 }, 1e9) === null,
    "pressing F4 stops adaptation for the session");
}

// 9. No measurement, no decision.
{
  const s = settled("high");
  check(autoQualityDecision(s, { divisor: 1, costMs: 0, refreshMs: 0 }, 1e9) === null,
    "nothing is decided before the pacer has measured a refresh rate");
}

// 10. Sanity on the table itself, since the rule indexes it by rank.
check(QUALITY_ORDER.join(",") === "high,balanced,performance", "QUALITY_ORDER is best-to-worst, which the rule assumes");
check(AUTO_UP_HEADROOM > 0 && AUTO_UP_HEADROOM < 1, "the step-up headroom is a fraction of the budget");

// 11. THE SETTLE PERIOD. Nothing is decided while the game is still standing
//     up - rigs building and first-draw buffer uploads make those seconds look
//     far worse than the session actually is, and the first live run of this
//     feature stepped down to Performance and back up to Balanced because of it.
{
  const fresh = { ...newAutoQuality("high"), startedAt: 1000 };
  check(autoQualityDecision(fresh, { divisor: 2, costMs: 9, refreshMs: 6.94 }, 1000 + AUTO_SETTLE_MS - 1) === null,
    "no level change during the settle period, however bad it looks");
  check(autoQualityDecision(fresh, { divisor: 2, costMs: 9, refreshMs: 6.94 }, 1000 + AUTO_SETTLE_MS + AUTO_HOLD_MS + 1) !== null,
    "and adaptation begins once it has settled");
  check(autoQualityDecision(newAutoQuality("high"), { divisor: 2, costMs: 9, refreshMs: 6.94 }, 1e9) === null,
    "a controller that has never seen a frame decides nothing");
}

// 12. A THROTTLED WINDOW IS NOT A SLOW MACHINE.
//
//     Found in a combat screenshot, not by reasoning: the log read "Graphics
//     set to High to hold 1Hz". 1Hz is no display — it is Chromium throttling
//     frames in a window that is not in front — and the pacer reports it as a
//     one-second refresh, which turns the budget from 16.7ms into 1000ms. A
//     5ms frame then looks like it has enormous room and the level steps up.
//
//     The damage is on the way back: the frame no longer fits, the level steps
//     down, and `Game.adaptQuality` reads a down-after-up as proof the level
//     cannot be held, so `lowerCeiling` bars it for the whole session. Alt-tab
//     once and the machine is capped below what it can run.
{
  // Named apart from the `settled()` helper above rather than shadowing it.
  const state = { ...newAutoQuality("balanced"), startedAt: 0, changedAt: 0 };
  const late = AUTO_SETTLE_MS + AUTO_HOLD_MS + 1;
  // 1Hz, with a frame that would look gloriously cheap against that budget.
  check(
    autoQualityDecision(state, { divisor: 1, costMs: 5, refreshMs: 1000 }, late) === null,
    "a 1Hz 'refresh' decides nothing — that is a background window, not a monitor",
  );
  check(
    autoQualityDecision({ ...state, level: "high" }, { divisor: 2, costMs: 900, refreshMs: 1000 }, late) === null,
    "and it cannot force a step DOWN either, however unfit the frame looks",
  );
  // The boundary is generous on purpose: the slowest display anybody sells is
  // about 24Hz (42ms) and this rejects only past 100ms, so no real monitor can
  // trip it. A test that pinned it at 60Hz would pass while quietly making the
  // feature useless to anyone on a slow panel.
  check(
    autoQualityDecision(state, { divisor: 1, costMs: 5, refreshMs: 41.7 }, late) !== null,
    "a genuine 24Hz display still adapts — the guard rejects throttling, not slow panels",
  );
  check(
    MAX_PLAUSIBLE_REFRESH_MS > 42 && MAX_PLAUSIBLE_REFRESH_MS < 500,
    "the plausibility bound sits above every real display and well below a throttle",
  );
}

console.log(problems.length ? `\n${problems.length} failure(s).` : "\nOK — the level follows the machine, and stops when told to.");
process.exit(problems.length ? 1 : 0);
