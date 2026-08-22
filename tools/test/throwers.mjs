// A creature that fights at a distance, over a real socket.
//
// Twelve of the thirteen kinds walked into contact and swung, so every fight in
// the game had the same shape: it runs at you and you stand there. Three of them
// throw now — and the two ways that goes wrong are both silent.
//
//   * it has to actually HOLD ITS DISTANCE. A thrower that closes to contact
//     anyway is just a melee monster with a long tooltip.
//   * and it has to still be CATCHABLE. A thing that backpedals as fast as you
//     advance is a thing you can never reach, which is worse than the
//     melee-only world it replaced — so the test walks at one and measures
//     whether the gap actually closes.
//
//     node tools/seed.mjs Closer --level 40    (with the server stopped)
//     npm run dev:server
//     node tools/test/throwers.mjs Closer
import WebSocket from "ws";
import {
  MONSTER_STATS,
  BASE_MOVE_SPEED_PX_PER_SEC,
  ATTACK_ORDER_LAPSE_MS,
} from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Closer";
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
let monsters = [];
const problems = [];
const fail = (m) => problems.push(m);

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") me = msg.payload;
  if (msg.type === "STATE_SNAPSHOT") {
    monsters = msg.payload.monsters ?? monsters;
    if (me) {
      const self = msg.payload.players.find((p) => p.id === me.id);
      if (self) me = { ...me, x: self.x, y: self.y };
    }
  }
});

const THROWERS = Object.entries(MONSTER_STATS)
  .filter(([, s]) => s.keepAwayPx !== undefined)
  .map(([k]) => k);

const find = (kind) => monsters.find((m) => m.kind === kind && m.status === "alive");
const gapTo = (m) => Math.hypot(m.x - me.x, m.y - me.y);

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1600);
  console.log(`logged in as ${NAME}; throwers are ${THROWERS.join(", ")}`);

  // WALK AWAY AND LET ANY STANDING ATTACK ORDER LAPSE FIRST.
  //
  // An order outlives a moment out of reach on purpose, and a character logs in
  // exactly where the last run left it — which here was next to the creature it
  // had been fighting. The first version of this probe measured a settled gap
  // of 448px and blamed the AI for fleeing; what it had actually measured was
  // the cactoro dying to a leftover attack order and its replacement snapping
  // back to a spawn point four hundred pixels away.
  const start = { x: me.x, y: me.y };
  for (let i = 0; i < 40; i++) {
    send({ type: "MOVE", payload: { x: start.x + 700, y: start.y + 700 } });
    await sleep(110);
  }
  await sleep(ATTACK_ORDER_LAPSE_MS + 600);

  let target = null;
  for (const kind of THROWERS) {
    const m = find(kind);
    if (m && (!target || gapTo(m) < gapTo(target))) target = m;
  }
  if (!target) { console.log("FAIL — no thrower in the snapshot"); process.exit(1); }
  // Walk to just outside its reach and stop there, so what follows measures
  // where IT decides to stand rather than where the probe happened to be.
  for (let i = 0; i < 70; i++) {
    const m = monsters.find((x) => x.id === target.id) ?? target;
    if (gapTo(m) <= MONSTER_STATS[target.kind].attackRangePx * 1.15) break;
    send({ type: "MOVE", payload: { x: m.x, y: m.y } });
    await sleep(120);
  }
  const stats = MONSTER_STATS[target.kind];
  console.log(`walking at a ${target.kind} (holds at ${stats.keepAwayPx}px, reaches ${stats.attackRangePx}px)`);

  // --- Where it CHOOSES to stand --------------------------------------------
  //
  // Measured while standing still, and the first version of this probe got it
  // backwards: it walked at the creature the whole time and then complained
  // that the gap reached contact. Of course it did — the player advances at
  // 220px/s and a cactoro gives ground at 62, so chasing one down is exactly
  // what is SUPPOSED to happen. What a thrower promises is where it stands
  // when you are not chasing it, which is a different measurement entirely.
  //
  // So: hold position and let it come to you.
  const anchor = { x: me.x, y: me.y };
  const held = [];
  const untilHold = Date.now() + 14000;
  while (Date.now() < untilHold) {
    send({ type: "MOVE", payload: { x: anchor.x, y: anchor.y } });
    await sleep(140);
    const live = monsters.find((x) => x.id === target.id);
    // A monster that died and respawned keeps its id and snaps home, which
    // reads from out here as an enormous, instant retreat. Drop the run rather
    // than average a teleport into the answer.
    if (!live || live.status !== "alive") {
      console.log("  (it died mid-measurement — nothing to conclude)");
      process.exit(0);
    }
    held.push(gapTo(live));
  }
  if (held.length < 20) { console.log(`FAIL — only ${held.length} samples; it probably died`); process.exit(1); }
  const settledMean = held.slice(-25).reduce((a, b) => a + b, 0) / Math.min(25, held.length);
  console.log(`  standing still, it settled at a mean of ${settledMean.toFixed(0)}px`);

  // A melee monster walks into contact. A thrower does not.
  const contact = stats.bodyRadiusPx + 30;
  if (settledMean <= contact) {
    fail(
      `it settled at ${settledMean.toFixed(0)}px, which is contact — it is a melee monster ` +
        `with a long tooltip`,
    );
  }
  // And it must settle somewhere it can actually shoot from, rather than
  // drifting to the edge of aggro and stopping the fight.
  if (settledMean > stats.attackRangePx) {
    fail(
      `it settled at ${settledMean.toFixed(0)}px but only reaches ${stats.attackRangePx}px — ` +
        `it is fleeing rather than fighting`,
    );
  }

  // --- And it can still be run down -----------------------------------------
  const gaps = [];
  const until = Date.now() + 12000;
  while (Date.now() < until) {
    const m = monsters.find((x) => x.id === target.id);
    if (!m || m.status !== "alive") break;
    send({ type: "MOVE", payload: { x: m.x, y: m.y } });
    await sleep(140);
    const live = monsters.find((x) => x.id === target.id);
    if (live && live.status === "alive") gaps.push(gapTo(live));
  }
  if (gaps.length < 10) { console.log("FAIL — it died before the chase could be measured"); process.exit(1); }
  const opening = gaps.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const chased = Math.min(...gaps);
  console.log(`  chasing it: ${opening.toFixed(0)}px -> ${chased.toFixed(0)}px at your ${BASE_MOVE_SPEED_PX_PER_SEC}px/s`);
  if (chased >= opening) {
    fail(`walking straight at it for twelve seconds closed nothing — it cannot be caught`);
  }

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — it keeps its distance, and you can still run it down." : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => { console.error("could not reach the server —", e.message); process.exit(1); });
