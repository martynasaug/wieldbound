// The Provisioner's counter, end to end, over a real socket.
//
// The rate, the batch and the six pairs are in `shared/shop.ts` and
// `tools/test/quests.mjs` walks them offline. What no offline suite can reach
// is the SERVER half, and every one of its failures is silent:
//
//   * the spend and the credit have to be one transaction. If `spendMaterials`
//     succeeds and `addMaterial` is never reached, the wallet simply goes down
//     and the player is left believing they misread a number.
//   * it has to REFUSE when the wallet does not cover it, rather than paying
//     out and going negative — which would be free material for anybody who
//     clicked while poor.
//   * it has to refuse from across the square, or the counter is something you
//     operate from the far gate.
//   * and it must not accept an offer id it did not write, because the rate
//     lives on the server precisely so a hand-written packet cannot name its
//     own terms.
//
// Needs a live server and any character:
//
//     npm run dev:server
//     node tools/test/counter.mjs [name]
import WebSocket from "ws";
import { NPC_TALK_RANGE_PX, TOWN_NPCS } from "../../shared/town.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";
import { EXCHANGE_OFFERS, EXCHANGE_RATE } from "../../shared/shop.ts";

const NAME = process.argv[2] ?? `Counter${Math.floor(Math.random() * 90000)}`;
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const oswyn = TOWN_NPCS.find((n) => n.id === "oswyn");
let me = null;
let wallet = {};
const problems = [];
const fail = (m) => problems.push(m);

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") me = msg.payload;
  if (msg.type === "MATERIALS_UPDATE") wallet = { ...wallet, ...msg.payload };
  if (msg.type === "STATE_SNAPSHOT" && me) {
    const self = msg.payload.players.find((p) => p.id === me.id);
    if (self) me = { ...me, x: self.x, y: self.y };
  }
});

/** Walk to a point and wait until we are actually there. */
async function goto(x, y) {
  for (let i = 0; i < 90; i++) {
    send({ type: "MOVE", payload: { x, y } });
    await sleep(120);
    if (me?.x !== undefined && Math.hypot(me.x - x, me.y - y) < 40) return true;
  }
  return false;
}

const held = (m) => wallet[m] ?? 0;

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1400);
  console.log(`logged in as ${NAME}`);

  const offer = EXCHANGE_OFFERS.find((o) => o.from === "wood" && o.to === "ore");

  // --- Out of range ---------------------------------------------------------
  // WALK AWAY FIRST, and check that it worked. A character's position is
  // persisted, so a second run of this probe starts standing exactly where the
  // first one left it — at the counter — and "nothing may happen at range"
  // quietly becomes "nothing may happen", which then fails against a working
  // game. Assert the precondition rather than assuming it; this is the same
  // lesson as projecting a subject before measuring it.
  await goto(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
  const away = Math.hypot((me?.x ?? 0) - oswyn.x, (me?.y ?? 0) - oswyn.y);
  if (away < NPC_TALK_RANGE_PX * 2) {
    fail(`could not get clear of the counter — ${away.toFixed(0)}px away, which is still in range`);
  } else {
    const beforeFar = { wood: held("wood"), ore: held("ore") };
    send({ type: "EXCHANGE_MATERIAL", payload: { npcId: "oswyn", offerId: offer.id } });
    await sleep(700);
    if (held("wood") !== beforeFar.wood || held("ore") !== beforeFar.ore) {
      fail("the counter worked from across the town");
    } else {
      console.log(`  refused from ${away.toFixed(0)}px away`);
    }
  }

  if (!(await goto(oswyn.x, oswyn.y))) {
    console.log("FAIL — could not walk to Oswyn");
    process.exit(1);
  }
  console.log(`  standing at ${oswyn.name}`);

  // --- Too poor -------------------------------------------------------------
  // A fresh character has nothing, so the first attempt must be refused
  // outright rather than paying out or going negative.
  if (held("wood") < offer.give) {
    const before = { wood: held("wood"), ore: held("ore") };
    send({ type: "EXCHANGE_MATERIAL", payload: { npcId: "oswyn", offerId: offer.id } });
    await sleep(700);
    if (held("wood") !== before.wood || held("ore") !== before.ore) {
      fail(`refused trade still moved the wallet: ${JSON.stringify(before)} -> ${JSON.stringify({ wood: held("wood"), ore: held("ore") })}`);
    } else if (held("wood") < 0 || held("ore") < 0) {
      fail("the wallet went negative");
    } else {
      console.log(`  refused with ${before.wood} wood against a price of ${offer.give}`);
    }
  }

  // --- A made-up offer ------------------------------------------------------
  const beforeFake = { wood: held("wood"), ore: held("ore") };
  send({ type: "EXCHANGE_MATERIAL", payload: { npcId: "oswyn", offerId: "wood-diamond" } });
  send({ type: "EXCHANGE_MATERIAL", payload: { npcId: "oswyn", offerId: "wood-essence" } });
  await sleep(700);
  if (held("wood") !== beforeFake.wood || held("ore") !== beforeFake.ore) {
    fail("the counter honoured an offer id it never wrote");
  } else {
    console.log("  refused an invented offer, and refused essence");
  }

  // --- A real trade ---------------------------------------------------------
  // Gathering enough wood over a socket would take minutes, so the wallet is
  // topped up the way the seed script does it — through the database, before
  // this point, if the caller wants the positive case. Without it the run still
  // proves every refusal above, which is the half that can lose you material.
  if (held("wood") >= offer.give) {
    const before = { wood: held("wood"), ore: held("ore") };
    send({ type: "EXCHANGE_MATERIAL", payload: { npcId: "oswyn", offerId: offer.id } });
    await sleep(900);
    const spent = before.wood - held("wood");
    const got = held("ore") - before.ore;
    console.log(`  traded: wood ${before.wood} -> ${held("wood")} (-${spent}), ore ${before.ore} -> ${held("ore")} (+${got})`);
    if (spent !== offer.give) fail(`spent ${spent}, expected ${offer.give}`);
    if (got !== offer.get) fail(`received ${got}, expected ${offer.get}`);
    if (spent / got !== EXCHANGE_RATE) fail(`traded at ${(spent / got).toFixed(2)}:1, not ${EXCHANGE_RATE}:1`);
  } else {
    console.log(`  (no positive case: ${held("wood")} wood, needs ${offer.give} — seed a character to cover it)`);
  }

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — the counter takes and gives, and refuses everything else." : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => {
  console.error("could not reach the server —", e.message);
  process.exit(1);
});
