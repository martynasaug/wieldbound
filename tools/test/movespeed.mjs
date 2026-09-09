// MOVE SPEED IS A STAT, AND THE SERVER ENFORCES IT.
//
// Two things are checked here and they are the two halves of the same change.
//
//   * THE STAT COMPOSES. Move speed has real sources — boots rarity, agility,
//     the `fleet` and `stag` affixes, three matched sets and three talent lines
//     — and until now nothing added them up in one place. The client did it
//     inline in two spots with DIFFERENT arguments, so the character sheet
//     summed everything while the code that actually moved the character passed
//     `null` for boots and no passives at all. Every one of those sources was
//     decorative: the sheet promised movement the game did not give.
//
//   * AND THE SERVER CAN NOW CHECK IT. That was impossible before for a plain
//     reason — `movePxPerSec` was only ever called in the client, so the side
//     that had to validate a step had no idea what a legal step was. Movement
//     is client-authoritative on purpose, but "takes its word for where it
//     went" had no opinion about how FAR, and one MOVE crossed the map:
//
//         at (10439, 4081), MOVE to 900px east
//           tick 0  moved 900px this tick, 900px from start
//
//     which deletes the bridge as the only crossing and the road as the safe
//     way through. It is also why `fighting.mjs` could never measure its
//     retreat rule: that window teleported rather than ran.
//
//     node tools/test/movespeed.mjs Closer
import WebSocket from "ws";
import {
  moveSpeedFor,
  BASE_MOVE_SPEED_PX_PER_SEC,
  MIN_MOVE_SPEED_PX_PER_SEC,
  AGILITY_MOVE_STEP_PX_PER_SEC,
} from "../../shared/protocol-types.ts";
import { ITEM_BASES, rollItem, gearPassives } from "../../shared/items.ts";

const NAME = process.argv[2] ?? "Closer";
const problems = [];
const fail = (m) => problems.push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- The stat, as arithmetic -------------------------------------------------
// No server needed: these are the compositions a future skill will rely on.
{
  const base = moveSpeedFor({});
  if (base !== BASE_MOVE_SPEED_PX_PER_SEC) {
    fail(`a character with nothing moves at ${base}, not the base ${BASE_MOVE_SPEED_PX_PER_SEC}`);
  }

  const withAgility = moveSpeedFor({ agility: 10 });
  if (withAgility !== base + 10 * AGILITY_MOVE_STEP_PX_PER_SEC) {
    fail(`agility does not reach move speed: 10 agility gave ${withAgility} against ${base}`);
  }

  // Flat sources total, wherever they come from. `gearBonus` is the boots/cape
  // secondary roll; `moveSpeedBonus` is affixes, matched sets and talents,
  // which all arrive in the same bag on purpose.
  const flat = moveSpeedFor({ gearBonus: 7, passives: { moveSpeedBonus: 13 } });
  if (flat !== base + 20) fail(`flat sources do not sum: expected ${base + 20}, got ${flat}`);

  // THE PERCENTAGE CHANNEL, which nothing pays into yet and which the future
  // skills are the reason for. It must apply AFTER the flat sources, or a
  // sprint is worth more to a slow character than a fast one — backwards.
  const percentOnly = moveSpeedFor({ passives: { moveSpeedPercent: 50 } });
  if (percentOnly !== base * 1.5) {
    fail(`+50% gave ${percentOnly}, expected ${base * 1.5}`);
  }
  const both = moveSpeedFor({ gearBonus: 80, passives: { moveSpeedPercent: 50 } });
  if (both !== (base + 80) * 1.5) {
    fail(`percent must apply after flat: expected ${(base + 80) * 1.5}, got ${both}`);
  }
  if (both <= percentOnly) {
    fail(`a sprint must reward boots rather than flatten them: ${both} vs ${percentOnly}`);
  }

  // AND AN ACTUAL ITEM REACHES IT, which is the end of the wiring rather than
  // the middle. `of Quickening` is the first thing in the game to pay into the
  // percentage channel, and it has to travel affix -> `gearPassives` ->
  // `moveSpeedFor` without any of those three knowing about the others. That
  // is the whole reason affixes, set bonuses and talents share one bag.
  {
    const bootsBases = Object.values(ITEM_BASES).filter((b) => b && b.slot === "boots");
    const base = bootsBases.find((b) => (b.band ?? 1) >= 3);
    if (!base) {
      fail("no boots base at band 3 or above, so `of Quickening` can never roll");
    } else {
      const boots = rollItem(base, "enchanted", () => 0.5, "quickening");
      if (!(boots.affixes ?? []).includes("quickening")) {
        fail(`forging with chosenAffix "quickening" produced ${(boots.affixes ?? []).join(",")}`);
      }
      const gp = gearPassives({ boots });
      if (!gp.moveSpeedPercent) {
        fail("an item carrying `of Quickening` contributes no moveSpeedPercent");
      }
      const bare = moveSpeedFor({ agility: 26, bootsRarity: "enchanted" });
      const shod = moveSpeedFor({ agility: 26, bootsRarity: "enchanted", passives: gp });
      if (shod <= bare) {
        fail(`equipping \`of Quickening\` did not change speed: ${bare} -> ${shod}`);
      }
      console.log(
        `an item reaches it: ${base.id} of Quickening (+${gp.moveSpeedPercent}%) ` +
          `takes ${bare} px/s to ${shod} px/s`,
      );
    }
  }

  // A SLOW MULTIPLIES, WHERE AN AFFIX ADDS, and it has to be last.
  //
  // `moveMultiplier` is one of the status effects that deliberately has no
  // `PassiveBonus` vocabulary, because chilled is 0.4 on whoever wears it —
  // that is what a snare is for, and good boots should not shrug it off the way
  // they would a flat penalty. It was applied to MONSTERS ONLY until M70.181, so
  // three kinds inflicted a slow on the player that did nothing at all: troll
  // 0.5, cactoro 0.65, ghost 0.4, while chilled's own tooltip read "moving at a
  // fraction of its usual pace".
  {
    const fast = moveSpeedFor({ gearBonus: 100, passives: { moveSpeedPercent: 25 } });
    const chilled = moveSpeedFor({
      gearBonus: 100,
      passives: { moveSpeedPercent: 25 },
      statusMultiplier: 0.4,
    });
    if (chilled !== Math.round(fast * 0.4)) {
      fail(`a 0.4x slow on ${fast} gave ${chilled}, expected ${Math.round(fast * 0.4)}`);
    }
    // Last, so it bites the speed you actually had rather than the base.
    const slowBase = moveSpeedFor({ statusMultiplier: 0.4 });
    if (chilled <= slowBase) {
      fail(`a slow must scale the speed you built, not flatten it: ${chilled} vs ${slowBase}`);
    }
    console.log(`a slow multiplies last: ${fast} px/s chilled to ${chilled} px/s (0.4x)`);
  }

  // And a snare can slow but never strand.
  const snared = moveSpeedFor({ passives: { moveSpeedPercent: -95 } });
  if (snared !== MIN_MOVE_SPEED_PX_PER_SEC) {
    fail(`-95% should floor at ${MIN_MOVE_SPEED_PX_PER_SEC}, got ${snared}`);
  }
  console.log(
    `stat composes: base ${base}, +10 agility ${withAgility}, flat+20 ${flat}, ` +
      `+50% ${percentOnly}, both ${both}, snared ${snared}`,
  );
}

// --- The budget, over a real socket -----------------------------------------
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
let me = null;
/** A single snapshot step larger than this is a teleport, not travel: the
 *  budget allows roughly 640px/s and snapshots arrive many times a second. */
const TELEPORT_PX = 400;
let teleported = false;
let died = false;

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") me = msg.payload;
  if (msg.type === "STATE_SNAPSHOT" && me) {
    const self = msg.payload.players.find((p) => p.id === me.id);
    if (self) {
      // A RESPAWN IS NOT A RUN, and this test could not tell the difference.
      //
      // It tracked x/y and nothing else, so a character killed mid-burst and
      // snapped back to the spawn tile measured as an enormous distance
      // travelled — which is exactly the shape of the failure this file exists
      // to catch, and indistinguishable from it in the output. One suite run
      // reported the spam arm covering 2700px against 778px and then passed
      // four times at ~770px, including straight after a cold server restart;
      // the character walks in and out of camps for the length of the test and
      // nothing was watching its health.
      //
      // No snapshot step can legitimately exceed a few dozen pixels — the
      // budget allows about 640px/s and snapshots are far more frequent than
      // once a second — so a jump this large is a teleport by definition.
      const jump = Math.hypot(self.x - me.x, self.y - me.y);
      if (jump > TELEPORT_PX) teleported = true;
      if (self.hp <= 0 || (me.hp !== undefined && self.hp > me.hp && jump > TELEPORT_PX)) died = true;
      me = { ...me, x: self.x, y: self.y, hp: self.hp, maxHp: self.maxHp };
    }
  }
});

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1800);

  // THE CHEAT. One message, a long way. This is the exact probe that found the
  // hole, and it must now go nowhere near as far as it asks.
  const start = { x: me.x, y: me.y };
  send({ type: "MOVE", payload: { x: start.x + 900, y: start.y } });
  await sleep(260);
  const jumped = Math.hypot(me.x - start.x, me.y - start.y);
  console.log(`one MOVE asking for 900px moved ${jumped.toFixed(0)}px`);
  if (jumped > 200) {
    fail(`a single MOVE crossed ${jumped.toFixed(0)}px — the speed budget is not being applied`);
  }

  // THE SPAM, which is the case the whole design turns on.
  //
  // The first version of the budget gave every message a time allowance plus a
  // flat forty pixels of slack, and the slack was PER MESSAGE — so a client
  // that sent a hundred a second collected four thousand pixels a second,
  // fifteen times a legal run, while never once exceeding its per-message
  // budget. A rule a client beats by talking faster is not a rule. The
  // allowance now accrues into a bucket, so distance over an interval is
  // bounded by that interval however many messages carry it.
  // MEASURED AS AN A/B, because the absolute number cannot be checked from out
  // here. The first version compared distance against `moveSpeedFor({})` — the
  // BASE speed — and flagged a pass as a failure, because the character under
  // test has boots, agility and talents and legitimately runs at about 318px/s.
  // This test does not know a character's equipment and should not have to.
  //
  // The actual question is not "how far" but "does talking faster get you
  // further", and that answers itself: run the same window twice, once at a
  // sane message rate and once at twenty times that rate, both asking to be
  // teleported. Under a bucket the two distances match, because the allowance
  // came from the clock. Under a per-message handout the fast one wins by the
  // ratio of the message counts.
  // ALTERNATING DIRECTION, because this test walks the character it runs as.
  // Every burst used to push east, so three bursts plus the honest walk carried
  // it a couple of thousand pixels in one line and eventually into something
  // solid — in the suite it reported 0px travelled and blamed the budget for
  // rubber-banding when the character was simply wedged. Going out and back
  // keeps it in the ground it started on.
  let dir = 1;
  const burst = async (gapMs, label) => {
    dir = -dir;
    teleported = false;
    died = false;
    const from = { x: me.x, y: me.y };
    const windowMs = 1200;
    const until = Date.now() + windowMs;
    let sent = 0;
    while (Date.now() < until) {
      send({ type: "MOVE", payload: { x: me.x + 500 * dir, y: me.y } });
      sent++;
      await sleep(gapMs);
    }
    const sendingMs = Date.now() - (until - windowMs);
    await sleep(260);
    const px = Math.hypot(me.x - from.x, me.y - from.y);
    // THE RATE, NOT JUST THE DISTANCE. The A/B answers "does talking faster get
    // you further", which is the property, and says nothing about whether a
    // number is sane on its own — so an outlier is uninterpretable after the
    // fact. One suite run reported 2700px against the other arm's 778px and
    // then passed four times in a row at ~770px each, including immediately
    // after a cold server restart; with no rate printed there was nothing to
    // reason from about what the server had granted.
    //
    // Both arms cover the same wall-clock window by construction (the loop is
    // `while (Date.now() < until)`), so px/s is directly comparable between
    // them and against the character's real speed — about 318px/s here, doubled
    // by MOVE_SPEED_TOLERANCE, which is why a healthy arm lands near 640px/s.
    console.log(
      `  ${label.padEnd(12)} ${String(sent).padStart(4)} MOVEs asking 500px each -> ${px.toFixed(0)}px` +
        ` over ${sendingMs}ms (${((px / sendingMs) * 1000).toFixed(0)}px/s)`,
    );
    return px;
  };
  console.log(`spam, same 1200ms window at two message rates:`);
  // 25ms, not 100ms. At a 100ms gap the slow arm banks more credit than the cap
  // holds and forfeits the excess, so it loses ground for a reason that has
  // nothing to do with the property under test — the ratio sat at 1.17-1.26
  // against a 1.4 threshold and tipped over under suite load. Both arms now
  // drain continuously, and only the message COUNT differs.
  // RETRIED RATHER THAN BELIEVED IF THE CHARACTER WAS MOVED BY SOMETHING ELSE.
  // A death and respawn snaps it to the spawn tile, which measures as thousands
  // of pixels of travel and is indistinguishable in the output from the budget
  // being beaten. Three attempts, then say so rather than report the number.
  const measure = async (gapMs, label) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const px = await burst(gapMs, label);
      if (!teleported && !died) return px;
      console.log(`    (${label} was ${died ? "killed" : "teleported"} mid-burst — attempt ${attempt} discarded)`);
      await sleep(1200);
    }
    console.log(`    !! ${label} could not complete a clean burst; not judged`);
    return null;
  };
  const slowRate = await measure(25, "1 per 25ms");
  const fastRate = await measure(5, "1 per 5ms");
  if (slowRate === null || fastRate === null) {
    console.log("  INCONCLUSIVE — the spam comparison needs two clean bursts.");
  } else if (fastRate > slowRate * 1.4) {
    fail(
      `talking faster travelled further — ${fastRate.toFixed(0)}px against ${slowRate.toFixed(0)}px. ` +
        `The allowance is being paid per message rather than per second.`,
    );
  }

  // THE HONEST CLIENT, which must be untouched. One frame of running per tick,
  // which is what the real client sends, over a couple of seconds.
  // Integrating ITS OWN position, which is what the real client does — it does
  // not read the server's position back each frame. The first version of this
  // check stepped from `me`, so snapshot lag made it ask for half of what it
  // meant to and it looked like the budget was eating an honest client.
  const before = { x: me.x, y: me.y };
  const local = { x: me.x, y: me.y };
  const stepPx = BASE_MOVE_SPEED_PX_PER_SEC * 0.1;
  let asked = 0;
  for (let i = 0; i < 20; i++) {
    local.x += stepPx * -dir;
    send({ type: "MOVE", payload: { x: local.x, y: local.y } });
    asked += stepPx;
    await sleep(100);
  }
  const travelled = Math.hypot(me.x - before.x, me.y - before.y);
  console.log(`honest stepping asked for ${asked.toFixed(0)}px and travelled ${travelled.toFixed(0)}px`);
  // Generous: monsters, town furniture and the world edge can all legitimately
  // stop a walk short, so this only catches the budget eating an honest client.
  if (travelled < 5) {
    // NOTHING MOVED AT ALL, which is a wedged character and not a tight budget.
    // Distinguishing those is the difference between a real finding and an hour
    // spent on the wrong one: the in-suite failure that prompted this said "an
    // honest client asking for 440px only moved 0px — the budget is too tight",
    // and the budget had nothing to do with it.
    console.log(
      "  (it did not move at all — wedged against something, not clamped." +
        " Nothing here is about the speed budget. INCONCLUSIVE.)",
    );
  } else if (travelled < asked * 0.5) {
    fail(
      `an honest client asking for ${asked.toFixed(0)}px only moved ${travelled.toFixed(0)}px — ` +
        `the budget is too tight and would rubber-band real play`,
    );
  }

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(
    problems.length === 0
      ? "\nOK — move speed is one stat, and the server holds you to it."
      : `\n${problems.length} failure(s).`,
  );
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => {
  console.error("could not reach the server —", e.message);
  process.exit(1);
});
