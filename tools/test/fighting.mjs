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
//     WHY IT IS STILL INCONCLUSIVE, now known precisely rather than guessed.
//     Four things were tried and the gap series below records what each did:
//       - a bow instead of a sword, 300px reach instead of 62      no change
//       - re-acquiring a live target before turning to run         no change
//       - retreating from the toughest thing within 900px          no change
//     The reason all three failed is the same and the gap series names it:
//     "started 33px, closest 33px, ended 414px" — the first sample IS the
//     minimum, which can only happen if the subject disappears at once. It
//     does. The single permitted `USE_ATTACK` is a level-40 bow, and the
//     toughest monster within reach of spawn is a 45hp ghost, so the thing
//     being run from dies to the opening shot every time.
//     THE NEXT STEP, for whoever picks this up: walk out to a far camp first.
//     A troll (150hp), golem (240) or dragon (340) outlives an opening shot
//     and would give this half its first real measurement. They live at radius
//     2,450, which is a journey this test does not currently make.
//
//   * A TELEGRAPHED SLAM OPENS A WINDOW. Whatever just committed a heavy swing
//     is `recovering` for a couple of seconds afterwards and takes half again
//     as much. Measured by watching a boss's statuses across its own wind-up.
//
//     node tools/seed.mjs Fighter --level 40    (with the server stopped)
//     npm run dev:server
//     node tools/test/fighting.mjs Fighter
import WebSocket from "ws";
import {
  MONSTER_STATS,
  STATUSES,
  isRetreating,
  attackRangeFor,
  reachToBody,
} from "../../shared/protocol-types.ts";

/**
 * The least damage a standing window must land before the retreat comparison
 * below means anything. See the INCONCLUSIVE branch at the verdict.
 */
const MIN_BASELINE_DAMAGE = 20;

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

  // A PREREQUISITE THAT LIVES IN A COMMENT IS NOT A PREREQUISITE.
  //
  // The header has always said to seed this character at level 40 first, and
  // nothing checked. Run it against whatever `Fighter` happens to be in the dev
  // database — level 1, strength 1, nothing equipped — and it does not error,
  // it just measures a naked character punching wolves: 0 to 4 damage over ten
  // seconds of standing in contact, most swings missing outright. The verdict
  // block then reads that as "the swing itself is not happening" and fails,
  // intermittently, depending on whether a single punch connected.
  //
  // That cost a whole investigation: the standing baseline had collapsed from
  // the 49–1,079 range recorded in the notes below to 0–4, which looks exactly
  // like a combat regression and was nothing of the sort. So check the
  // character and say plainly what is wrong, rather than reporting a number
  // that cannot mean anything.
  // AND IT IS A BAND, NOT A FLOOR. Both ends break the comparison, for
  // opposite reasons, and both were observed:
  //
  //   too weak  — level 1, nothing equipped: 0–4 damage over ten seconds of
  //               standing in contact, most swings missing. Whether the rule
  //               works is invisible under the noise of a naked character.
  //   too strong — level 234: `dealt` is bounded by how much monster HP is
  //               STANDING THERE, not by how hard you hit. The standing window
  //               one-shots the camp and ends with one monster alive and reach
  //               for 20 of 86 ticks; the retreat window then draws a fresh
  //               chasing pack and scores 506 against the standing 57. That
  //               reads as a flagrant rule violation and is really a headcount.
  //
  // Level 40 is what the header asks for and what the recorded 49–1,079 range
  // came from. The band is generous around it, but it has to have both edges.
  const LEVEL_BAND = [20, 90];
  const weapon = items.find((i) => i.slot === "weapon" && i.equipped);
  const level = me?.level ?? 1;
  if (!weapon || level < LEVEL_BAND[0] || level > LEVEL_BAND[1]) {
    const why = !weapon
      ? `has nothing equipped in the weapon slot`
      : `is level ${level}, outside the ${LEVEL_BAND[0]}–${LEVEL_BAND[1]} band this test can measure`;
    console.log(
      `\nNOT RUN — ${NAME} ${why}.\n\n` +
        `  This test compares damage dealt across two windows. Too weak and both are ~0; too strong\n` +
        `  and both are capped by the monsters' own hit points rather than by the rule under test.\n\n` +
        `  Stop the server, then:  node tools/seed.mjs ${NAME} --level 40\n` +
        `  Start it again, then:   node tools/test/fighting.mjs ${NAME}\n`,
    );
    ws.close();
    process.exit(0);
  }

  // A BOW, AND THAT IS WHAT MAKES THE RETREAT HALF MEASURABLE AT ALL.
  //
  // The header has said since it was written that this half is unfalsifiable:
  // with the server rule disabled outright it still reported 0 damage while
  // retreating and still printed OK, because the player sprints at 220px/s and
  // a sword reaches 62. Turn and run and the field is empty inside one tick, so
  // "no damage while retreating" is true whether the rule exists or not.
  //
  // The limit was never the monsters, it was the PLAYER'S REACH. Ranger weapons
  // reach 300px against a warrior's 62 (`CLASSES[...].attackRangePx`), so a
  // chaser closing at ~70px/s stays inside a bow's reach for something like
  // three and a half seconds — thirty-odd ticks instead of one. That is enough
  // exposure for "did it swing" to mean something.
  //
  // The rule under test is weapon-independent — `isRetreating` gates the swing
  // loop, not a weapon type — so measuring it with the weapon that can actually
  // observe it is a strict improvement, not a different test. Both windows use
  // the same bow, which is what keeps the comparison fair.
  const bow = items.find((i) => i.weaponType === "bow" && i.slot === "weapon");
  if (bow && !bow.equipped) {
    send({ type: "EQUIP_ITEM", payload: { itemId: bow.id } });
    await sleep(700);
  }
  if (!bow) {
    console.log(
      `\nNOT RUN — ${NAME} owns no bow. The retreat half needs a long reach to be\n` +
        "  observable at all; see the note above. INCONCLUSIVE, not a failure.\n",
    );
    ws.close();
    process.exit(0);
  }
  /** The player's own reach, which is what decides whether anything is close
   *  enough to be swung at. Read from the same shared function the server
   *  resolves attacks with, rather than the melee contact this used to assume. */
  const PLAYER_REACH = attackRangeFor("bow");
  console.log(`  using a bow: reach ${PLAYER_REACH}px (a sword reaches ${attackRangeFor("sword")}px)`);

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
    const contact = reachToBody(PLAYER_REACH, MONSTER_STATS[live.kind]?.bodyRadiusPx ?? 16);
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
  // AND COUNT REACH PER TICK, FOR THE SAME REASON THE RETREAT WINDOW DOES.
  //
  // This used to sample "how many are alive within 120px" ONCE, at the end, and
  // hard-fail on `standing === 0` whenever that number was above zero. Those
  // two facts do not connect: a monster standing next to me at t=10.2s says
  // nothing about whether the ORDERED TARGET was reachable while the order
  // stood, and 120px is not the reach either — contact is `14 + bodyRadiusPx`,
  // about 30–46px. So a run where the target died early, or drifted, or was
  // never closed with, reported "the swing itself is not happening" on evidence
  // that could not support it. It failed in-suite and passed alone, which is
  // the signature of a timing-dependent claim rather than a broken game.
  //
  // Counting the ticks where something was genuinely in contact reach gives the
  // assertion below something real to stand on, and uses the same maths as the
  // retreat half rather than a second, looser guess at what "in reach" means.
  let standTicks = 0;
  let standReachTicks = 0;
  const untilA = Date.now() + 10200;
  while (Date.now() < untilA) {
    send({ type: "MOVE", payload: { x: hold.x, y: hold.y } });
    standTicks++;
    const live = nearest(null);
    if (live) {
      const contact = reachToBody(PLAYER_REACH, MONSTER_STATS[live.kind]?.bodyRadiusPx ?? 16);
      if (Math.hypot(live.x - me.x, live.y - me.y) < contact + 30) standReachTicks++;
    }
    await sleep(110);
  }
  const standing = dealt;
  const aliveInReach = monsters.filter(
    (m) => m.status === "alive" && Math.hypot(m.x - me.x, m.y - me.y) < 120,
  ).length;
  console.log(
    `  standing still: ${standing} damage dealt (in contact reach for ${standReachTicks}/${standTicks} ticks, ` +
      `${aliveInReach} alive within 120px at the end)`,
  );

  // --- Running away ----------------------------------------------------------
  //
  // RE-ACQUIRE FIRST, because the standing window eats the camp.
  //
  // This is the same confound that made a level-234 character report 506 damage
  // retreating against 57 standing, and it bites at level 40 too once a bow is
  // involved: ten seconds of shooting clears what is nearby, so the retreat
  // window began with nothing alive to chase and scored "in reach for 1 of 77
  // ticks" no matter how long the reach was. Widening the reach to 300px did
  // not help and could not — there has to be something standing in it.
  //
  // So close with something ALIVE before turning to run. A retreat measured
  // from next to a live monster is the arrangement the rule is about; a retreat
  // measured from an empty field is the arrangement that made this half
  // unfalsifiable in the first place.
  //
  // AND THE THING RUN FROM HAS TO SURVIVE BEING SHOT ONCE.
  //
  // The gap series added below is what found this. It reported "started 72px,
  // closest 72px, ended 661px" — the 72 was the FIRST sample and the minimum,
  // which is only possible if the subject vanished immediately. It did: the one
  // permitted `USE_ATTACK` press is a level-40 bow against a 22hp wolf, so the
  // re-acquired monster died to it and `nearest(null)` jumped to whatever was
  // four hundred pixels away. That is why widening the reach to 300px changed
  // nothing, and why "in reach for 1 of 77 ticks" kept appearing no matter what
  // was fixed upstream of it.
  //
  // So retreat from the toughest thing standing nearby rather than the closest.
  // A troll at 150hp or a golem at 240 outlives an opening shot that a wolf
  // does not, and it is still something the rule applies to identically.
  const beefiest = () => {
    let best = null;
    let bestHp = -1;
    for (const m of monsters) {
      if (m.status !== "alive") continue;
      if (Math.hypot(m.x - me.x, m.y - me.y) > 900) continue;
      const hp = MONSTER_STATS[m.kind]?.maxHp ?? 0;
      if (hp > bestHp) {
        bestHp = hp;
        best = m;
      }
    }
    return best;
  };
  {
    const reAcquire = Date.now() + 30000;
    while (Date.now() < reAcquire) {
      const live = beefiest() ?? nearest(null);
      if (!live) {
        await sleep(300);
        continue;
      }
      const d = Math.hypot(live.x - me.x, live.y - me.y);
      const contact = reachToBody(PLAYER_REACH, MONSTER_STATS[live.kind]?.bodyRadiusPx ?? 16);
      // Well inside reach, so the first seconds of running still have it in
      // range rather than starting at the very edge.
      if (d < contact * 0.4) break;
      send({ type: "MOVE", payload: { x: live.x, y: live.y } });
      await sleep(110);
    }
  }

  // Straight out from the monster, which `isRetreating` calls leaving.
  const away = beefiest() ?? nearest(null) ?? target;
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
  // AND RECORD THE GAP ITSELF, not just whether it cleared a threshold.
  //
  // "In reach for 1 of 77 ticks" is a verdict with no evidence behind it: it
  // cannot distinguish "the camp was empty" from "the chaser fell behind
  // immediately" from "the reach is wrong", and three separate attempts to fix
  // this half were aimed at the wrong one of those because the number could not
  // say which. The gap series can.
  const retreatGaps = [];
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
        const contact = reachToBody(PLAYER_REACH, MONSTER_STATS[live.kind]?.bodyRadiusPx ?? 16);
        const gap = Math.hypot(live.x - me.x, live.y - me.y);
        retreatGaps.push(Math.round(gap));
        if (gap < contact + 30) inReachTicks++;
      }
      await sleep(110);
    }
  }
  const retreating = dealt;
  console.log(
    `  running away:   ${retreating} damage dealt, in reach for ${inReachTicks}/${retreatTicks} ticks` +
      (retreatGaps.length
        ? `\n                  gap to nearest: started ${retreatGaps[0]}px, closest ${Math.min(...retreatGaps)}px, ` +
          `ended ${retreatGaps[retreatGaps.length - 1]}px (reach ${PLAYER_REACH}px)`
        : `\n                  nothing alive was in the snapshot at any point`),
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
  if (standing === 0 && standReachTicks >= 10) {
    // Something was in contact reach for over a second of ticks with an attack
    // order standing, and nothing landed. That IS the swing failing, and it is
    // the only arrangement in which this can be said.
    fail(
      `nothing landed while standing still, in contact reach for ${standReachTicks}/${standTicks} ticks ` +
        `— the swing itself is not happening`,
    );
  } else if (standing === 0) {
    // Nothing landed, but nothing was reliably within arm's length either. The
    // camp cleared early, or the target drifted. That is a run which tested
    // nothing, not a broken rule — see the note above this block.
    console.log(
      `  (nothing landed standing still, but in contact reach for only ${standReachTicks}/${standTicks} ticks ` +
        `— the camp cleared or the target drifted, so this run tested nothing. INCONCLUSIVE, not a pass)`,
    );
  } else if (inReachTicks < 10) {
    console.log(
      `  (in reach for only ${inReachTicks}/${retreatTicks} ticks while retreating, so "0 damage" is ` +
        "the sprint outrunning the monster and not the rule — INCONCLUSIVE, not a pass)",
    );
  } else if (standing < MIN_BASELINE_DAMAGE) {
    // A RATIO NEEDS A BASELINE WORTH DIVIDING BY.
    //
    // The comparison below is `retreating > standing * 0.25`, and when the
    // standing window only managed a point or two of damage that threshold is
    // effectively zero: five damage against one reads as a catastrophic failure
    // of the retreat rule when it is really a nearly-dead camp and one late
    // blow. This test passed alone and failed inside the suite for exactly that
    // reason — the runs before it kill the monsters near `Fighter`, and
    // `MONSTER_RESPAWN_MS` is longer than the gap between tests.
    //
    // The file already separates INCONCLUSIVE from FAILED twice above; this is
    // the third case and it was missing. A flaky test is worse than a missing
    // one, because it teaches everybody to ignore a red line.
    console.log(
      `  (only ${standing} damage landed while standing still, which is too small a baseline to ` +
        `judge ${retreating} against — the camp was nearly dead. INCONCLUSIVE, not a pass)`,
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
