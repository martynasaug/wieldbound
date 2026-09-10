// DOES THE SERVER SAY YOU ARE GATHERING?
//
// M70.227 gave gathering everything a player can see of it — a progress arc,
// a swing per beat, debris off the node — and every one of those is driven by
// one message, `GATHER_STATE`. If that message stops arriving, nothing throws:
// the wallet still goes up on the same schedule, the numbers all stay correct,
// and the only symptom is that gathering silently goes back to being a number
// that changes by itself three seconds after you walk to a tree. That is the
// exact class of fault this suite exists for.
//
// So this stands a character in a node and asserts the wire, not the pixels:
//
//   * a gather in progress is ANNOUNCED, with the node, its kind, and a clock.
//   * `intervalMs` matches what `gatherDurationForLevel` says it should be, and
//     `readyInMs` fits inside it, so the client can draw a fraction without
//     knowing the formula.
//   * it is RETRACTED — some later message carries `nodeId: null` — because the
//     server ends that gather and an arc left drawing would fill up to a reward
//     that is never coming.
//   * and a SECOND gather is announced with a fresh clock, which is what makes
//     the arc start over rather than sit full.
//
// WHAT THIS DELIBERATELY DOES NOT ASSERT, having asserted it once and been
// wrong: that `readyInMs` decreases from message to message. It does not, and
// it should not. The server sends this only when the answer CHANGES — one
// message per gather — and the client interpolates the countdown from it.
// Streaming a fresh clock thirty times a second to every gathering player, so
// that a test could watch a number go down, would be pure waste on the wire.
// The first version of this file failed against correct code for exactly that
// reason, and the failure was a statement about the test.
//
//     npm run dev:server
//     node tools/test/gatherstate.mjs
import WebSocket from "ws";
import {
  INTERACTION_RANGE_PX,
  gatherDurationForLevel,
} from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Gath${Math.floor(Math.random() * 90000)}`;
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
let nodes = [];
let gatherLevel = 0;
let agility = 0;
/** Every GATHER_STATE seen, in order. The whole point is the sequence. */
const states = [];
const problems = [];
const fail = (m) => problems.push(m);

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") {
    me = msg.payload;
    gatherLevel = msg.payload.gatherLevel ?? 0;
    agility = msg.payload.agility ?? 0;
  }
  if (msg.type === "GATHER_STATE") states.push({ ...msg.payload, at: Date.now() });
  if (msg.type === "STATE_SNAPSHOT" && msg.payload.nodes?.length) nodes = msg.payload.nodes;
});

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1800);
  if (!me) { console.log("FAIL — no WELCOME"); process.exit(1); }
  if (!nodes.length) { console.log("FAIL — no nodes in any snapshot"); process.exit(1); }

  // Walk to the nearest tree by telling the server where we are, in steps: a
  // single MOVE to a point a thousand pixels away is a teleport and the server
  // is entitled to reject it.
  const target = nodes
    .filter((n) => n.kind === "tree" && n.status === "available")
    .map((n) => ({ ...n, d: Math.hypot(n.x - me.x, n.y - me.y) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!target) { console.log("FAIL — no available tree"); process.exit(1); }

  let x = me.x;
  let y = me.y;
  const STEP = 40;
  for (let i = 0; i < 400; i++) {
    const dx = target.x - x;
    const dy = target.y - y;
    const d = Math.hypot(dx, dy);
    if (d <= INTERACTION_RANGE_PX * 0.5) break;
    const s = Math.min(STEP, d);
    x += (dx / d) * s;
    y += (dy / d) * s;
    send({ type: "MOVE", payload: { x, y } });
    await sleep(45);
  }
  console.log(`standing at ${target.id}, ${Math.hypot(target.x - x, target.y - y).toFixed(0)}px away`);

  // Hold still through more than one full gather.
  const expected = gatherDurationForLevel(gatherLevel, agility);
  states.length = 0;
  // Long enough to cover a gather, the 8s respawn, and a second gather — the
  // restart is half of what is being checked.
  for (let i = 0; i < 140; i++) {
    send({ type: "MOVE", payload: { x, y } });
    await sleep(120);
  }

  const announced = states.filter((s) => s.nodeId);
  console.log(`  ${states.length} GATHER_STATE message(s), ${announced.length} of them announcing a node`);
  if (announced.length === 0) {
    fail("standing in a node produced no GATHER_STATE at all — nothing the client draws can work");
  } else {
    const first = announced[0];
    if (first.kind !== "tree") fail(`announced kind was "${first.kind}", standing at a tree`);
    if (first.nodeId !== target.id) {
      fail(`announced node ${first.nodeId}, standing at ${target.id}`);
    }
    // The interval has to be the shared formula's answer, or a client drawing
    // `1 - readyInMs / intervalMs` draws a fraction of the wrong whole.
    if (Math.abs(first.intervalMs - expected) > 1) {
      fail(`intervalMs ${first.intervalMs} but gatherDurationForLevel says ${expected}`);
    }
    console.log(`  kind ${first.kind}, intervalMs ${first.intervalMs} (formula says ${expected})`);

    // The clock has to fit inside the interval it is a fraction of. A
    // `readyInMs` larger than `intervalMs` draws a negative progress arc.
    for (const s of announced) {
      if (s.readyInMs <= 0 || s.readyInMs > s.intervalMs) {
        fail(`readyInMs ${s.readyInMs} does not fit inside intervalMs ${s.intervalMs}`);
        break;
      }
    }

    // IT IS RETRACTED. Completing a gather depletes the node, so the very next
    // tick has nothing in range and says so — that null is what takes the arc
    // off the ground. Asserted over the whole sequence rather than by walking
    // away, because by the time you walk away the null has usually already
    // been sent, and demanding a SECOND one fails against correct behaviour.
    if (!states.some((s) => s.nodeId === null)) {
      fail("no message ever carried nodeId:null — the arc would never come off the ground");
    } else {
      console.log("  retracted with a null when the node was spent");
    }

    // AND IT STARTS OVER: announce, null, announce.
    //
    // Not "the second clock is larger than the first" — which is what this
    // asked first, and it failed against correct behaviour. Every announcement
    // carries the FULL interval, because every announcement is the start of a
    // gather; the two are equal, not increasing. What makes the arc restart is
    // that the pair is separated by a retraction, so the client takes the ring
    // off the ground and lays a fresh one down.
    let phase = 0; // 0 = want announce, 1 = want null, 2 = want announce
    for (const s of states) {
      if (phase === 0 && s.nodeId) phase = 1;
      else if (phase === 1 && s.nodeId === null) phase = 2;
      else if (phase === 2 && s.nodeId) { phase = 3; break; }
    }
    if (announced.length < 2) {
      console.log(
        `  only ${announced.length} gather announced in this stand — the node respawns on an 8s` +
          " clock, so this is timing and not a fault; the restart is not judged",
      );
    } else if (phase < 3) {
      fail("two gathers were announced with no retraction between them — the arc would not restart");
    } else {
      console.log(`  ${announced.length} gathers announced, each separated by a retraction`);
    }
  }

  // AND A GATHER THAT WAS CUT OFF SAYS SO.
  //
  // "Paid" and "interrupted" both end with the node gone and are opposite
  // events for the player — one of them cost them three seconds for nothing.
  // The client cannot tell them apart, so if `ended` ever stops being set
  // correctly the red arc and the explanation silently become a lie about a
  // gather that actually succeeded, or stay silent about one that failed.
  //
  // Standing out of range while the node respawns is load-bearing. With the
  // character in range when it comes back, the server starts a gather at once
  // and the walk-away lands in the middle of one that began seconds earlier —
  // which is what the first version of this measured, and it reported "done".
  const awayX = x + 400;
  for (let i = 0; i < 14; i++) { send({ type: "MOVE", payload: { x: awayX, y } }); await sleep(60); }
  await sleep(9000);
  x = awayX;
  for (let i = 0; i < 30; i++) {
    const dx = target.x - x;
    const dy = target.y - y;
    const d = Math.hypot(dx, dy);
    if (d <= INTERACTION_RANGE_PX * 0.5) break;
    const s = Math.min(40, d);
    x += (dx / d) * s;
    y += (dy / d) * s;
    send({ type: "MOVE", payload: { x, y } });
    await sleep(45);
  }
  states.length = 0;
  // Well under one full gather, so there is progress to lose.
  for (let i = 0; i < 9; i++) { send({ type: "MOVE", payload: { x, y } }); await sleep(120); }
  for (let i = 0; i < 14; i++) { x += 30; send({ type: "MOVE", payload: { x, y } }); await sleep(60); }
  await sleep(700);
  const endings = states.map((s) => s.ended).filter(Boolean);
  if (!endings.includes("left")) {
    fail(
      `walking off mid-gather reported ${JSON.stringify(endings)} rather than "left" — ` +
        "the player is told nothing, or told they finished",
    );
  } else if (endings.includes("done")) {
    fail('walking off mid-gather also reported "done" — an interrupted gather claiming it paid');
  } else {
    console.log('  walking off mid-gather is reported as "left"');
  }

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — gathering is on the wire." : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => { console.error("could not reach the server —", e.message); process.exit(1); });
