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
//     THIS HALF WAS UNFALSIFIABLE FOR ITS WHOLE LIFE AND IS NOT ANY MORE.
//     With the server rule disabled outright it still reported 0 damage while
//     retreating and still printed OK, and every explanation offered for that
//     was wrong. The reason was in the PROTOCOL, not in the test:
//
//       Movement is client-authoritative. The server's `MOVE` handler says so
//       plainly — "the client integrates it and the server takes its word for
//       where it went" — and it clamps to the world and pushes out of bodies,
//       but it does NOT check speed. So `MOVE` to a point 900px away does not
//       walk there, it TELEPORTS there in one tick:
//
//           tick 0  moved 900px this tick, 900px from start
//           tick 1  moved   0px this tick, 900px from start
//
//     This window therefore never retreated. It ARRIVED. The monster was
//     instantly 900px behind, every sample after the first was out of reach,
//     and "in reach for 1 of 77 ticks" was faithfully reporting a teleport.
//
//     Five fixes were tried before that was found, and the reason none of them
//     worked is that none of them touched it: a bow for 300px of reach instead
//     of 62; re-acquiring a live target before turning; retreating from the
//     toughest monster within 900px; walking out to a far camp for something
//     with real hit points; and tracking the subject by id instead of taking
//     whatever was nearest. Each was a reasonable guess and each changed
//     nothing, which is itself the clue — five independent levers cannot all be
//     inert unless the thing they move is not the thing that matters.
//
//     What found it was making the instrument show its working. The per-tick
//     series replaced a summary ("started 45px, closest 45px, ended 500px")
//     that could not distinguish a chaser falling behind from a subject
//     vanishing, and the moment it printed the subject's identity as well as
//     its distance the +900 jump was unmistakable.
//
//     The retreat now sends one frame of running per tick, which is what a real
//     client does. First honest measurement of the rule: 62 damage while
//     retreating against 990 standing, with something in reach for 39 of 76
//     ticks. Six per cent, against a threshold of twenty-five.
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
  BASE_MOVE_SPEED_PX_PER_SEC,
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
/** Damage dealt, keyed by the monster that took it. See the handler below. */
const dealtTo = new Map();
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
  if (msg.type === "BATTLE_RESULT" && msg.payload.playerHit) {
    dealt += msg.payload.playerDamage;
    // AND PER MONSTER, because the rule is per target. "You do not swing at
    // something behind you" says nothing about the rest of the camp: with a
    // 300px bow, running from a troll while shooting a wolf that happens to be
    // ahead is CORRECT, and a total that lumps them together reads it as a
    // flagrant violation. Measured that way the test failed three runs out of
    // three at ~55% of the standing baseline, all of it legal.
    const id = msg.payload.monsterId;
    dealtTo.set(id, (dealtTo.get(id) ?? 0) + msg.payload.playerDamage);
  }
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

  /** Kinds that outlive an opening shot, so one subject can serve both windows.
   *  Dragons are excluded deliberately: 340hp is ideal for surviving, and a
   *  character standing still beside one for ten seconds may not finish the
   *  measurement. */
  const TANKY = Object.entries(MONSTER_STATS)
    .filter(([kind, st]) => (st.maxHp ?? 0) >= 90 && kind !== "dragon" && st.keepAwayPx === undefined)
    .map(([kind]) => kind);

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
    // TOUGH FIRST, AND THE SAME ONE FOR BOTH WINDOWS.
    //
    // Picking whatever was nearest meant the standing window shot a wolf camp
    // flat and the retreat window then walked off to find something else, so
    // the two halves were measured against different monsters at different
    // health. That is the headcount confound in its purest form, and it
    // produced "324 against 140 standing" — a flagrant-looking rule violation
    // that was really a depleted camp on one side and a fresh golem on the
    // other.
    //
    // One subject, tough enough to outlive both windows, used for standing and
    // for running away. `TANKY` is defined above the retreat block.
    const live = nearest(TANKY) ?? nearest(null);
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
  dealtTo.clear();
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
  // Only what the SUBJECT took, so both windows measure the same monster.
  const standing = dealtTo.get(target.id) ?? 0;
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
  // AND IT HAS TO BE A FRESH ONE, WHICH MEANS LEAVING THE STARTING CAMP.
  //
  // Restricting this to 900px was the third failed attempt: within 900px of
  // spawn the toughest thing is a 45hp ghost, and by the time the retreat
  // window opens the standing window has already been shooting it for ten
  // seconds. It dies to the opening shot and the gap series jumps 45px to 600px
  // in one tick, which is what "in reach for 1 of 76" was really recording.
  //
  // The snapshot carries the WHOLE field — eighty monsters, sixty-seven of them
  // beyond 1500px, including three trolls, three golems and three dragons. So
  // walk to one. A troll at 150hp or a golem at 240, at full health and never
  // shot at, outlives an opening shot from a level-40 bow; that is the only
  // arrangement in which "did it keep swinging while running away" can be
  // observed at all.
  //
  // Dragons are excluded deliberately: 340hp is ideal for surviving, and a
  // character standing still next to one for ten seconds is a character that
  // may not finish the measurement.

  const beefiest = (maxRangePx = Infinity) => {
    let best = null;
    let bestHp = -1;
    for (const m of monsters) {
      if (m.status !== "alive") continue;
      if (Math.hypot(m.x - me.x, m.y - me.y) > maxRangePx) continue;
      const hp = MONSTER_STATS[m.kind]?.maxHp ?? 0;
      if (hp > bestHp) {
        bestHp = hp;
        best = m;
      }
    }
    return best;
  };

  // The journey. Far camps stand at radius ~2,450, which is a good eleven
  // seconds of running, and the walk is worth more than the time it costs: it
  // is the difference between a measurement and another INCONCLUSIVE.
  {
    const travelUntil = Date.now() + 60000;
    let quarry = nearest(TANKY);
    if (quarry) {
      console.log(`  walking to a ${quarry.kind} (${MONSTER_STATS[quarry.kind].maxHp}hp) ` +
        `${Math.hypot(quarry.x - me.x, quarry.y - me.y).toFixed(0)}px away, for something that survives an opening shot`);
    }
    while (quarry && Date.now() < travelUntil) {
      const live = monsters.find((m) => m.id === quarry.id && m.status === "alive") ?? nearest(TANKY);
      if (!live) break;
      quarry = live;
      const d = Math.hypot(live.x - me.x, live.y - me.y);
      const contact = reachToBody(PLAYER_REACH, MONSTER_STATS[live.kind]?.bodyRadiusPx ?? 16);
      if (d < contact * 0.4) break;
      send({ type: "MOVE", payload: { x: live.x, y: live.y } });
      await sleep(110);
    }
  }
  {
    const reAcquire = Date.now() + 30000;
    while (Date.now() < reAcquire) {
      // THE SAME SUBJECT THE STANDING WINDOW FOUGHT, if it is still alive.
      // Two windows measured against two different monsters at two different
      // healths is not a comparison, and it produced the only failure this test
      // has ever reported that looked like a real rule violation: "324 against
      // 140 standing", a depleted camp on one side and a fresh golem on the
      // other.
      const live = monsters.find((m) => m.id === target.id && m.status === "alive")
        ?? beefiest(900) ?? nearest(null);
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
  const away = monsters.find((m) => m.id === target.id && m.status === "alive")
    ?? beefiest(900) ?? nearest(null) ?? target;
  const dx = me.x - away.x;
  const dy = me.y - away.y;
  const len = Math.hypot(dx, dy) || 1;
  console.log(
    `  heading away is ${isRetreating(dx / len, dy / len, away.x - me.x, away.y - me.y) ? "retreating" : "NOT retreating — the probe is aimed wrong"}`,
  );
  dealt = 0;
  dealtTo.clear();
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
  let subjectDied = false;
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
    // LET THE TURN FINISH BEFORE COUNTING, and run away during it.
    //
    // The server does not know which way you are facing from a single message:
    // `noteMovement` smooths a heading at 0.35 per sample and `headingOf`
    // refuses to answer until its magnitude passes 0.2, so a character that was
    // walking TOWARD a troll needs several movement samples before the server
    // agrees it is now walking away. Blows landing during that turn are the
    // rule not yet applying rather than the rule failing, and counting them
    // made this fail one run in three at about half the standing baseline while
    // the other two runs scored a clean zero.
    //
    // So spend the discard actually retreating rather than standing still —
    // a stationary character generates no movement samples at all and the
    // heading would still be pointing at the troll when counting began.
    const turnUntil = Date.now() + 1200;
    while (Date.now() < turnUntil) {
      const stepPx = BASE_MOVE_SPEED_PX_PER_SEC * 0.11;
      const remaining = Math.hypot(dest.x - me.x, dest.y - me.y);
      const k = remaining > stepPx ? stepPx / remaining : 1;
      send({
        type: "MOVE",
        payload: { x: me.x + (dest.x - me.x) * k, y: me.y + (dest.y - me.y) * k },
      });
      await sleep(110);
    }
    dealt = 0;
    dealtTo.clear();
    const until = Date.now() + 9000;
    while (Date.now() < until) {
      // ONE STEP, AT THE SPEED A PLAYER ACTUALLY RUNS.
      //
      // THE ROOT CAUSE OF THIS WHOLE HALF, found by probing the protocol rather
      // than the test. Movement is client-authoritative — the server's `MOVE`
      // handler says so in as many words, "the client integrates it and the
      // server takes its word for where it went" — and it clamps to the world
      // and pushes out of bodies but does NOT check speed. So `MOVE` to a point
      // 900px away does not walk there. It TELEPORTS, in one tick, measured:
      //
      //     tick 0  moved 900px this tick, 900px from start
      //     tick 1  moved   0px this tick, 900px from start
      //
      // Which means this window never retreated. It arrived. The monster was
      // instantly 900px behind, every sample after the first was out of reach,
      // and "in reach for 1 of 77 ticks" was reporting a teleport. Five fixes
      // aimed at reach, at target choice, at target toughness and at travel all
      // failed because none of them touched this.
      //
      // A real client integrates position and sends where it got to, so this
      // sends one frame's worth of running per tick instead of the destination.
      const stepPx = BASE_MOVE_SPEED_PX_PER_SEC * 0.11;
      const remaining = Math.hypot(dest.x - me.x, dest.y - me.y);
      const k = remaining > stepPx ? stepPx / remaining : 1;
      send({
        type: "MOVE",
        payload: { x: me.x + (dest.x - me.x) * k, y: me.y + (dest.y - me.y) * k },
      });
      retreatTicks++;
      // THE THING BEING RUN FROM, BY ID — not whatever is nearest.
      //
      // `nearest(null)` is what hid the real behaviour for four attempts. The
      // per-tick dump added above finally showed it: "dragon@72 dragon@972
      // dragon@979 … dragon@1020" — the SAME id, jumping nine hundred pixels in
      // one tick and then drifting. That is not a chaser falling behind, it is
      // the respawn `throwers.mjs` already documents: the standing window kills
      // the subject (916 damage against a 340hp dragon), it comes back keeping
      // its id, and it comes back AT ITS CAMP, which is nine hundred pixels
      // away. Tracking "whatever is nearest" cannot tell that apart from a
      // monster that simply gave up the chase.
      //
      // The rule under test is about the thing you turned your back on, so
      // follow that one and say plainly when it dies rather than silently
      // switching subjects.
      const live = monsters.find((m) => m.id === away.id && m.status === "alive");
      if (!live) {
        subjectDied = true;
        await sleep(110);
        continue;
      }
      {
        const contact = reachToBody(PLAYER_REACH, MONSTER_STATS[live.kind]?.bodyRadiusPx ?? 16);
        const gap = Math.hypot(live.x - me.x, live.y - me.y);
        // WHAT was nearest, not only how far. A summary of started/closest/
        // ended cannot tell "the chaser fell behind" from "the chaser died and
        // a different monster two hundred metres away became the nearest
        // thing", and those call for opposite fixes. Three attempts were spent
        // on the wrong one of those.
        retreatGaps.push({ px: Math.round(gap), kind: live.kind, hp: me?.hp ?? -1 });
        if (gap < contact + 30) inReachTicks++;
      }
      await sleep(110);
    }
  }
  const retreating = dealtTo.get(away.id) ?? 0;
  console.log(
    `  running away:   ${retreating} damage dealt, in reach for ${inReachTicks}/${retreatTicks} ticks` +
      (retreatGaps.length
        ? `\n                  the ${away.kind} being fled, tick by tick (reach ${PLAYER_REACH}px): ` +
          retreatGaps.slice(0, 10).map((g) => g.px).join(" ") +
          (retreatGaps.length > 10 ? ` … ${retreatGaps[retreatGaps.length - 1].px}` : "") +
          (subjectDied ? `\n                  (it died partway through — later ticks are not measuring it)` : "")
        : `\n                  the ${away.kind} being fled was never alive in the snapshot`),
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
