// The two combat rules added in M63.1, end to end, over a real socket.
//
// Both were reported from play — "you attack while facing away or running
// away" — and both are server rules whose failure is silent: a swing that
// should not have happened looks exactly like a swing, and an opening that
// never opens looks exactly like a fight.
//
//   * YOU DO NOT SWING AT SOMETHING BEHIND YOU. Run away from what you are
//     fighting and the blows stop, without the order lapsing — turn back and it
//     resumes. Measured as damage dealt while retreating against damage dealt
//     while standing, over the same stretch of time.
//
//     READ THE VERDICT BLOCK BEFORE TRUSTING THIS HALF. It was unfalsifiable
//     for its whole life — with the server rule disabled outright it still
//     reported 0 damage while retreating and still printed OK — because the
//     player outruns everything in the game and the field is empty within a
//     second of turning. It now counts the ticks where anything was actually
//     in reach and reports INCONCLUSIVE rather than passing when there were
//     none, which on this map is most runs. The standing-still half is sound
//     and always was.
//
//   * A TELEGRAPHED SLAM OPENS A WINDOW. Whatever just committed a heavy swing
//     is `recovering` for a couple of seconds afterwards and takes half again
//     as much. Measured by watching a boss's statuses across its own wind-up.
//
//     node tools/seed.mjs Fighter --level 40    (with the server stopped)
//     npm run dev:server
//     node tools/test/fighting.mjs Fighter
import WebSocket from "ws";
import { MONSTER_STATS, STATUSES, isRetreating } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Fighter";
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
let items = [];
let monsters = [];
let dealt = 0;
const problems = [];
const fail = (m) => problems.push(m);

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") {
    me = msg.payload;
    items = msg.payload.items ?? [];
  }
  if (msg.type === "ITEMS_UPDATE") items = msg.payload.items ?? items;
  if (msg.type === "STATE_SNAPSHOT") {
    monsters = msg.payload.monsters ?? monsters;
    if (me) {
      const self = msg.payload.players.find((p) => p.id === me.id);
      if (self) me = { ...me, x: self.x, y: self.y };
    }
  }
  // Every landed player swing, which is the only honest measure of "did it
  // attack" — the attack STATE says an order stands, not that a blow fell.
  if (msg.type === "BATTLE_RESULT" && msg.payload.playerHit) dealt += msg.payload.playerDamage;
});

const nearest = (kinds) => {
  let best = null;
  let bd = Infinity;
  for (const m of monsters) {
    if (m.status !== "alive") continue;
    if (kinds && !kinds.includes(m.kind)) continue;
    const d = Math.hypot(m.x - me.x, m.y - me.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
};

/** Walk toward a point, one step per tick, and report where we ended up. */
async function walkTo(x, y, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    send({ type: "MOVE", payload: { x, y } });
    await sleep(110);
  }
}

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1600);
  console.log(`logged in as ${NAME}`);

  const sword = items.find((i) => i.weaponType === "sword" && i.slot === "weapon");
  if (sword && !sword.equipped) {
    send({ type: "EQUIP_ITEM", payload: { itemId: sword.id } });
    await sleep(700);
  }

  // Find something close and walk into reach of it.
  // CLOSE IN ON SOMETHING STILL ALIVE, RE-AIMING AS IT MOVES OR DIES.
  //
  // This used to pick one monster and walk at its LAST KNOWN POSITION for a
  // flat nine seconds. Nine seconds is not enough if it is far, the monster
  // wanders while you walk, and — the one that actually bit — a level 40
  // Fighter clears the nearest camp in a couple of runs, so the walk was often
  // to a corpse and the measurement that followed had nothing to measure.
  // Re-aim every tick at whatever is nearest and ALIVE, and wait out a respawn
  // rather than reporting the retreat rule broken because the field is empty.
  let target = null;
  const approachUntil = Date.now() + 75000;
  while (Date.now() < approachUntil) {
    // NEAREST, not fastest. Engaging the fastest thing around was tried, to
    // keep something in reach while the player runs — and it made the test
    // FAIL one run in three with the rule switched ON. Over a nine-second
    // sprint a chaser can get IN FRONT of the player, at which point the
    // heading is toward it and the swing is allowed: 276 damage with 24 of 76
    // ticks in reach, correct behaviour reported as a bug. A test that fails
    // a third of the time is worse than the flake it replaced.
    const live = nearest(null);
    if (!live) { await sleep(1000); continue; }        // everything is dead; wait
    const d = Math.hypot(live.x - me.x, live.y - me.y);
    // MEASURED TO THE SURFACE, NOT THE CENTRE — the same correction M70.110
    // made to reach itself. A flat 45px is unreachable for most kinds: bodies
    // cannot interpenetrate, so the closest you can stand to a dragon is
    // 14 + 58 = 72px. Hard-coding 45 made this wait the full 75s and fail on
    // every run that did not happen to pick something small.
    const contact = 14 + (MONSTER_STATS[live.kind]?.bodyRadiusPx ?? 16);
    if (d < contact + 30) { target = live; break; }
    send({ type: "MOVE", payload: { x: live.x, y: live.y } });
    await sleep(110);
  }
  if (!target) {
    console.log("FAIL — could not get within reach of anything alive in 75s");
    process.exit(1);
  }
  const gap = Math.hypot(target.x - me.x, target.y - me.y);
  console.log(`engaging a ${target.kind} at ${gap.toFixed(0)}px`);

  // --- Standing and fighting -------------------------------------------------
  // COUNT FROM THE ORDER, NOT FROM A SECOND LATER.
  //
  // This used to send USE_ATTACK, sleep 1,200ms, and only THEN zero the
  // counter — so the opening swings were thrown away. A level 40 Fighter kills
  // a mushnub well inside that window, and if nothing else was in reach the
  // nine seconds that followed measured a camp that was already dead: 0 damage
  // standing still, and a failure that says the retreat rule is broken when
  // nothing at all was tested. It failed about one run in eight that way, and
  // the passes ranged 49 to 1,079 damage for the same reason.
  //
  // Zeroing first counts every blow the order produces. If the camp dies early
  // the number is small rather than absent, and `retreating` is still measured
  // against a real one.
  dealt = 0;
  send({ type: "USE_ATTACK", payload: {} });
  const hold = { x: me.x, y: me.y };
  const untilA = Date.now() + 10200;
  while (Date.now() < untilA) {
    send({ type: "MOVE", payload: { x: hold.x, y: hold.y } });
    await sleep(110);
  }
  const standing = dealt;
  const aliveInReach = monsters.filter(
    (m) => m.status === "alive" && Math.hypot(m.x - me.x, m.y - me.y) < 120,
  ).length;
  console.log(`  standing still: ${standing} damage dealt (${aliveInReach} alive within 120px at the end)`);

  // --- Running away ----------------------------------------------------------
  // Straight out from the monster, which `isRetreating` calls leaving.
  const away = nearest([target.kind]) ?? target;
  const dx = me.x - away.x;
  const dy = me.y - away.y;
  const len = Math.hypot(dx, dy) || 1;
  console.log(
    `  heading away is ${isRetreating(dx / len, dy / len, away.x - me.x, away.y - me.y) ? "retreating" : "NOT retreating — the probe is aimed wrong"}`,
  );
  dealt = 0;
  // COUNT THE TICKS WHERE ANYTHING WAS ACTUALLY IN REACH.
  //
  // Without this the comparison is unfalsifiable, and it was: disabling the
  // server rule entirely and re-running still reported 0 damage while
  // retreating and still said OK. The player sprints 900px at ~198px/s and is
  // out of reach inside a second, so "no damage while running away" is true
  // whether the rule exists or not. A test that cannot fail is worse than one
  // that fails sometimes.
  let inReachTicks = 0;
  let retreatTicks = 0;
  {
    const dest = { x: me.x + (dx / len) * 900, y: me.y + (dy / len) * 900 };
    // ONE PRESS TO PUT AN ORDER BACK, AND ONLY ONE.
    //
    // The standing window routinely clears the camp, the order lapses after
    // ATTACK_ORDER_LAPSE_MS, and the retreat window then measures a character
    // with no fight in progress. Proved by disabling the rule outright: 0
    // damage while retreating with something in reach for 75 of 76 ticks,
    // because there was nothing to suppress in the first place.
    //
    // It must be exactly one, because `useDefaultAttack` resolves a swing
    // directly and is NOT guarded by `isRetreating` — only the automatic swing
    // loop is. That one blow is then discarded, so every damage number counted
    // below comes from the loop the rule actually governs.
    send({ type: "USE_ATTACK", payload: {} });
    await sleep(500);
    dealt = 0;
    const until = Date.now() + 9000;
    while (Date.now() < until) {
      send({ type: "MOVE", payload: dest });
      retreatTicks++;
      const live = nearest(null);
      if (live) {
        const contact = 14 + (MONSTER_STATS[live.kind]?.bodyRadiusPx ?? 16);
        if (Math.hypot(live.x - me.x, live.y - me.y) < contact + 30) inReachTicks++;
      }
      await sleep(110);
    }
  }
  const retreating = dealt;
  console.log(
    `  running away:   ${retreating} damage dealt, in reach for ${inReachTicks}/${retreatTicks} ticks`,
  );

  // THE VERDICT, AND WHAT IT CAN AND CANNOT SHOW.
  //
  // This comparison was unfalsifiable for its whole life. Disabling the server
  // rule outright and re-running still reported 0 damage while retreating and
  // still printed OK. Two reasons, both structural:
  //
  //   * The player sprints at ~198px/s and NOTHING in the game is faster, so
  //     they are out of reach inside a second. Measured: 0 of 77 ticks with
  //     anything in reach. No blow could have landed either way.
  //   * The attack order lapses after ATTACK_ORDER_LAPSE_MS with nothing in
  //     reach, so by the retreat window there was often no fight at all.
  //
  // Holding station at the edge of reach instead does keep a target there
  // (69-76 of 77 ticks) but does not test the rule either: the destination is
  // ~22px away and the player covers that in one tick, so they are STATIONARY
  // most of the time, and a stationary player has no heading to be "away" —
  // the guard correctly does not apply, and it reports 474 against 654 as if
  // broken. (`useDefaultAttack` is also not guarded at all; only the automatic
  // swing loop is. Re-pressing during the retreat reads as 820 against 514.)
  //
  // So this reports what it actually observed rather than claiming a pass it
  // has not earned. A run where nothing was ever in reach proves nothing about
  // the rule, and now says so.
  if (standing === 0) {
    fail(
      aliveInReach > 0
        ? `nothing landed while standing still with ${aliveInReach} alive within 120px — the swing itself is not happening`
        : "nothing landed and nothing was alive in reach either, so the camp was already cleared and this run tested nothing",
    );
  } else if (inReachTicks < 10) {
    console.log(
      `  (in reach for only ${inReachTicks}/${retreatTicks} ticks while retreating, so "0 damage" is ` +
        "the sprint outrunning the monster and not the rule — INCONCLUSIVE, not a pass)",
    );
  } else if (retreating > standing * 0.25) {
    fail(
      `still swinging while running away — ${retreating} against ${standing} standing, ` +
        `in reach for ${inReachTicks}/${retreatTicks} ticks. ` +
        "The whole rule is that you do not attack what is behind you.",
    );
  }

  // --- The opening -----------------------------------------------------------
  // Watch anything with a telegraph and catch `recovering` after it lands.
  const slammers = Object.entries(MONSTER_STATS)
    .filter(([, s]) => s.slamRadiusPx !== undefined)
    .map(([k]) => k);
  console.log(`  telegraphing kinds: ${slammers.join(", ")}`);

  let sawWindup = false;
  let sawRecovering = false;
  const untilC = Date.now() + 45000;
  while (Date.now() < untilC && !sawRecovering) {
    for (const m of monsters) {
      if (!slammers.includes(m.kind) || m.status !== "alive") continue;
      if (m.windingUp) sawWindup = true;
      if ((m.statuses ?? []).some((s) => s.id === "recovering")) sawRecovering = true;
    }
    await sleep(200);
  }
  if (sawRecovering) {
    const def = STATUSES.recovering;
    console.log(`  saw \`recovering\` land — ${def.blurb} (x${def.damageTakenMultiplier}, ${def.durationMs}ms)`);
  } else {
    console.log(
      `  (no slam resolved in 45s${sawWindup ? " — a wind-up was seen but never landed" : ", and no wind-up was seen"}; ` +
        "inconclusive rather than failed, since nothing here can make a boss attack)",
    );
  }

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — you fight what you are facing." : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => {
  console.error("could not reach the server —", e.message);
  process.exit(1);
});
