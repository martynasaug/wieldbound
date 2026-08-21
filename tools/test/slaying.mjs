// The slay objective, end to end, over a real socket.
//
// This is the one part of M58.1 that no offline suite can reach. The rule
// itself — "most of your damage decides what you killed it with" — was lifted
// into `shared/quests.ts` precisely so `tools/test/quests.mjs` could walk it,
// but the JOIN is here: that every damage path records what it was made of,
// that `awardKill` reads the right player's row before `clearThreat` wipes it,
// and that a `slay` counter therefore moves for one weapon and not another.
// Every one of those is a line in the server and none of them throws when it
// is wrong; the counter just sits there, which is indistinguishable from not
// having killed enough yet.
//
// It needs a live server and a seeded character:
//
//     node tools/seed.mjs Slayer --level 40     (with the server stopped)
//     node tools/quests-reset.mjs Slayer        (ditto, if it has been run before)
//     npm run dev:server
//     node tools/test/slaying.mjs Slayer
//
// Two phases, one weapon each, and what is asserted is the SIGN of the change
// rather than an exact count. That is the second version of this probe and the
// first one was wrong against a working game: this is an auto-battler, so an
// attack order stands until you walk away and a phase kills however many
// armabees it kills. "+1 per kill" is not something the probe is in a position
// to know. What the milestone claims is that one of these phases can move the
// counter and the other cannot, and that is what is measured.
import WebSocket from "ws";
import { TOWN_NPCS } from "../../shared/town.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Slayer";
const QUEST = "rule-armabee";
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null, items = [], quests = { active: [], completed: [] }, monsters = [], hp = 1;
let kills = 0, schools = [];
const herald = TOWN_NPCS.find((n) => n.id === "herald");

ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === "WELCOME") { me = m.payload; items = m.payload.items; }
  else if (m.type === "ITEMS_UPDATE") items = m.payload.items;
  else if (m.type === "QUEST_STATE") quests = m.payload;
  else if (m.type === "STATE_SNAPSHOT") {
    monsters = m.payload.monsters;
    const p = m.payload.players.find((p) => p.id === me?.id);
    if (p) hp = p.hp;
  } else if (m.type === "HP_UPDATE") hp = m.payload.hp;
  else if (m.type === "BATTLE_RESULT") {
    if (m.payload.monsterDefeated) kills++;
    if (m.payload.playerHit && m.payload.school && !schools.includes(m.payload.school)) {
      schools.push(m.payload.school);
    }
  }
});

const at = (r, a) => ({ x: PLAYER_SPAWN.x + Math.cos(a * Math.PI / 180) * r, y: PLAYER_SPAWN.y + Math.sin(a * Math.PI / 180) * r });
const goto = async (x, y, n = 4) => { for (let i = 0; i < n; i++) { send({ type: "MOVE", payload: { x, y } }); await sleep(120); } };
const count = () => quests.active.find((q) => q.id === QUEST)?.count ?? null;

async function equip(baseId) {
  const it = items.find((i) => i.baseId === baseId);
  if (!it) throw new Error(`no ${baseId} in the bag`);
  send({ type: "EQUIP_ITEM", payload: { itemId: it.id } });
  await sleep(800);
}

// Break off cleanly: walk right out of the camp and let the leash run, so a
// standing attack order cannot spill kills into the next phase.
async function disengage() {
  send({ type: "SET_TARGET", payload: { targetId: null } });
  const home = at(1150, 315);
  await goto(home.x, home.y, 12);
  await sleep(3000);
}

async function fightFor(ms, label) {
  const before = count();
  const killsBefore = kills;
  schools = [];
  const bee = at(1600, 315);
  await goto(bee.x, bee.y, 6);
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const target = monsters.find((m) => m.kind === "armabee" && m.status === "alive");
    if (target) {
      send({ type: "MOVE", payload: { x: target.x - 28, y: target.y } });
      send({ type: "SET_TARGET", payload: { targetId: target.id } });
      send({ type: "USE_ATTACK", payload: {} });
    }
    await sleep(240);
  }
  const dealt = [...schools];
  await disengage();
  const killed = kills - killsBefore;
  const moved = count() - before;
  console.log(
    `  ${label}: ${killed} armabee(s) killed dealing [${dealt.join(", ") || "nothing"}], ` +
      `counter ${before} -> ${count()} (${moved >= 0 ? "+" : ""}${moved})`,
  );
  return { killed, moved, dealt };
}

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1400);
  console.log(`logged in as ${NAME}, level ${me.level}`);

  // 1. The plumbing half: the Herald is a GUIDE and she has work now. The
  //    server never checked a role, and the client reads the quest table
  //    instead of one.
  await goto(herald.x, herald.y, 6);
  send({ type: "ACCEPT_QUEST", payload: { npcId: "herald", questId: QUEST } });
  await sleep(1000);
  if (count() === null) { console.log("FAIL — the Herald would not hand over the quest"); process.exit(1); }
  console.log(`took "${QUEST}" from a guide (role: ${herald.role}), counter at ${count()}`);

  // Frostbrand first, because it is two-handed and puts the shield away, which
  // is what leaves the off-hand free for the mace. Equipping the mace first
  // fails quietly: "you cannot hold it and an off-hand".
  await equip("frostbrand");
  await equip("thunderhead");
  console.log("holding Thunderhead — a mace made of storm, so its blows are lightning");
  const wrong = await fightFor(30000, "lightning");

  await equip("frostbrand");
  console.log("holding Frostbrand — a sword made of frost");
  const right = await fightFor(30000, "frost");

  const problems = [];
  if (wrong.killed === 0) problems.push("the lightning phase killed nothing, so it proved nothing");
  if (right.killed === 0) problems.push("the frost phase killed nothing, so it proved nothing");
  if (!wrong.dealt.includes("lightning")) problems.push(`the lightning phase dealt [${wrong.dealt}], not lightning`);
  if (!right.dealt.includes("frost")) problems.push(`the frost phase dealt [${right.dealt}], not frost`);
  if (wrong.moved !== 0) problems.push(`a lightning kill advanced a frost quest by ${wrong.moved}`);
  if (right.moved <= 0) problems.push("a frost kill did not advance a frost quest");
  for (const p of problems) console.log("FAIL — " + p);
  console.log(problems.length === 0
    ? "\nOK — the counter turns on the element and not on the kill."
    : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});
setTimeout(() => { console.log("timeout"); process.exit(1); }, 240000);
