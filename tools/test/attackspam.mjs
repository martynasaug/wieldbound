// SPAMMING THE ATTACK BUTTON MUST NOT KILL ANYTHING FASTER.
//
// The swing rate is a design number — `BATTLE_DURATION_MS` less what battle
// power and Agility take off it — and it is the thing that decides how fast the
// early game goes. If pressing the key faster produces more blows then that
// number is decoration and the real attack speed is however fast the player can
// tap.
//
// Tapping alone was already honest: `useDefaultAttack` refuses a swing while a
// recovery is pending, and this file's first useful run confirmed it — swings
// arrived 1263ms apart against a 1257ms cadence, pressed as fast as a socket
// allows.
//
// WHAT IS NOT SETTLED, and is written here rather than in a commit message
// because the next person will wonder. The tick used to delete the recovery
// clock whenever nothing was in reach, and a press with no clock set swings
// immediately in order to skip the melee wind-up — so on paper, stepping out of
// reach for one tick and back should have handed out a free blow per step. That
// deletion is gone now. But three probe designs failed to demonstrate the
// exploit against a build with it deliberately restored: stepping 150px away
// spends longer walking than the cooldown lasts, and stepping just past the
// edge does not work either, because the slime is chasing and closes the gap
// itself. So the hole is closed on the reasoning that the clock should be the
// clock, NOT on a measurement showing a player could use it.
//
// This asks the server directly, twice: as fast as the socket allows, and with
// a deliberate step out and back between presses. Neither may produce blows
// closer together than the cadence the server itself reports.
//
//     npm run dev:server
//     node tools/test/attackspam.mjs
import WebSocket from "ws";


const NAME = `Spam${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`;
const ws = new WebSocket("ws://localhost:8080");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
let monsters = [];
let swings = 0; // blows the server actually resolved against a monster
let swingAt = []; // when each one landed, so the GAPS can be read directly
let doubles = 0; // Agility can buy a second swing on one cooldown — not an exploit
let serverInterval = null; // the cadence the SERVER says it is using
const problems = [];

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") me = { ...msg.payload };
  // THE CADENCE COMES FROM THE SERVER, NOT FROM ARITHMETIC REPEATED HERE.
  // This file first rebuilt the interval out of BATTLE_DURATION_MS and the
  // Agility step, got 1975ms, and failed a run whose real cadence was 1265 —
  // because the starting weapon's own speed and rarity are in that number too.
  // A test that recomputes what it is testing is a second implementation to get
  // wrong, and it fails loudest exactly when someone retunes the thing on
  // purpose. ATTACK_STATE carries `intervalMs`; that is the subject.
  if (msg.type === "ATTACK_STATE") serverInterval = msg.payload.intervalMs;
  if (msg.type === "STATE_SNAPSHOT") {
    monsters = msg.payload.monsters.filter((m) => m.status === "alive");
    const self = msg.payload.players.find((p) => p.id === me?.id);
    if (self) { me.x = self.x; me.y = self.y; }
  }
  // A resolved swing arrives as BATTLE_RESULT, hit or miss; both consume
  // the recovery, so both count. Anything that did not resolve — "still
  // recovering", "nothing in reach" — is an ATTACK_STATE and is not a swing.
  if (msg.type === "BATTLE_RESULT") {
    const now = Date.now();
    // Two results in the same handful of milliseconds are one cooldown's double
    // swing, which `doubleAttackChance` grants on purpose. Counting them as two
    // presses beating the clock would report a designed feature as a fault.
    if (swingAt.length && now - swingAt[swingAt.length - 1] < 120) doubles++;
    else swings++;
    swingAt.push(now);
  }
});

const send = (type, payload) => ws.send(JSON.stringify({ type, payload }));

ws.on("open", async () => {
  send("HELLO", { clientVersion: "0.0.1", name: NAME });
  await sleep(2500);
  if (!me) {
    console.log("INCONCLUSIVE — never got a WELCOME, so nothing was measured");
    ws.close();
    process.exit(0);
  }

  const chosen = monsters.find((m) => m.kind === "slime");
  if (!chosen) {
    console.log("INCONCLUSIVE — no slime alive to swing at");
    ws.close();
    process.exit(0);
  }
  /** Wherever that slime is now — it wanders, and MOVE is a destination order. */
  const live = () => monsters.find((m) => m.id === chosen.id) ?? null;
  const gap = () => {
    const m = live();
    return m && me ? Math.hypot(m.x - me.x, m.y - me.y) : Infinity;
  };

  // ARRIVE FIRST, AND PROVE IT.
  //
  // MOVE is an order to walk, not a teleport, and the first version of this
  // measured six seconds of pressing while the character was still crossing the
  // field. It reported "0 swings" and I nearly read that as the spam being
  // refused — a pass, from a probe that had not reached the monster. Zero is
  // what BOTH a perfect fix and a completely broken test look like.
  const closeIn = async (ms = 12000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const m = live();
      if (!m) return false;
      if (gap() <= 34) return true;
      send("MOVE", { x: m.x, y: m.y });
      await sleep(250);
    }
    return gap() <= 34;
  };
  if (!(await closeIn())) {
    console.log(`INCONCLUSIVE — never got within reach of the slime (${Math.round(gap())}px away)`);
    ws.close();
    process.exit(0);
  }

  send("USE_ATTACK", {});
  await sleep(600);
  const interval = serverInterval;
  if (!interval) {
    console.log("INCONCLUSIVE — the server never reported an attack interval");
    ws.close();
    process.exit(0);
  }

  const measure = async (label, minReachPercent, betweenPresses) => {
    swings = 0;
    doubles = 0;
    swingAt = [];
    const windowMs = 8000;
    const started = Date.now();
    let inReach = 0;
    let samples = 0;
    while (Date.now() - started < windowMs) {
      send("USE_ATTACK", {});
      samples++;
      if (gap() <= 42) inReach++;
      await betweenPresses();
    }
    await sleep(400);
    const elapsed = Date.now() - started;
    // HOW MUCH OF THE WINDOW WAS SPENT IN RANGE. A low swing count is only good
    // news if the character was standing next to the thing the whole time; if
    // it spent the window out of reach then the count says nothing at all, and
    // saying so is the difference between a test and a decoration.
    const reachPercent = Math.round((inReach / Math.max(1, samples)) * 100);
    if (reachPercent < minReachPercent) {
      console.log(`  ${label.padEnd(28)} INCONCLUSIVE — in reach for only ${reachPercent}% of the window`);
      return null;
    }
    // The wind-up skip is worth one extra blow at the start of an engagement,
    // which is deliberate, so the allowance is the clock plus one.
    const allowed = Math.floor(elapsed / interval) + 1;
    // THE GAPS, NOT JUST THE COUNT. A count can be argued with — the window may
    // open mid-cooldown, a double swing lands two results — but the shortest gap
    // between two separate swings is the attack speed, stated plainly.
    const gaps = [];
    for (let i = 1; i < swingAt.length; i++) {
      const d = swingAt[i] - swingAt[i - 1];
      if (d >= 120) gaps.push(d);
    }
    const shortest = gaps.length ? Math.min(...gaps) : null;
    console.log(
      `  ${label.padEnd(28)} ${swings} swing(s) in ${(elapsed / 1000).toFixed(1)}s (at most ${allowed})` +
        `${doubles ? `, plus ${doubles} double swing(s)` : ""}` +
        `${shortest === null ? "" : `, shortest gap ${shortest}ms`}`,
    );
    if (shortest !== null && shortest < interval * 0.8) {
      problems.push(`${label}: two swings ${shortest}ms apart, against a ${interval}ms cadence`);
    }
    if (swings > allowed) {
      problems.push(`${label}: ${swings} swings where the clock allows ${allowed}`);
    }
    return swings;
  };

  console.log(`${NAME}, swinging at a slime. The server reports its cadence as ${interval}ms:\n`);
  const plain = await measure("pressing as fast as possible", 50, () => sleep(40));

  // AND THE ONE THAT USED TO WORK: press, step out of reach, step back, press.
  // A slime's reach is 42px and melee is about the same, so 150px away is
  // comfortably out and one move order each way is a single tick.
  await sleep(2500); // let the order lapse so both runs start clean
  // A floor of 20 rather than 50: this one is SUPPOSED to spend half its time
  // out of reach, and requiring otherwise would rule out the only technique
  // being tested. It still has to be next to the monster sometimes, or there
  // was never an opportunity to swing.
  // JUST PAST THE EDGE, NOT ACROSS THE FIELD.
  //
  // The first version stepped 150px away, which at walking speed is the better
  // part of a second in each direction — so it spent the window out of reach
  // (13%) and swung LESS, and the probe reported a pass against a build with
  // the hole deliberately reopened. A technique nobody can perform is not a
  // technique, and a probe that cannot perform it is not evidence.
  //
  // Melee reach is about 46px. Out to 62 and back to 30 is roughly 32px each
  // way — a sixth of a second of walking — which is what flickering at the edge
  // of range actually looks like.
  const step = await measure("pressing while stepping out", 15, async () => {
    const m = live();
    if (!m) return sleep(120);
    send("MOVE", { x: m.x - 62, y: m.y });
    await sleep(170);
    send("MOVE", { x: m.x - 30, y: m.y });
    await sleep(170);
  });

  if (plain !== null && step !== null && step > plain * 1.5) {
    problems.push(
      `stepping out between presses produced ${step} swings against ${plain} standing still` +
        " — leaving reach is still cancelling the recovery",
    );
  }

  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — the clock decides the swing rate, not the keyboard" : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => {
  console.error("could not reach the server —", e.message);
  process.exit(1);
});
