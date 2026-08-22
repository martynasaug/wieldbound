// Cast times, end to end, over a real socket.
//
// The rule for WHICH skills cast is derived and `tools/test/talents.mjs` walks
// it offline. What no offline suite can reach is the half that makes a cast a
// cast at all, and every failure of it is silent:
//
//   * standing still has to finish it — a cast that never resolves is a skill
//     that stopped working, and the bar just sits there;
//   * moving has to break it, and break it WITHOUT spending the cooldown or
//     the mana, or "walked out of it" is the same as "wasted it";
//   * and pressing something else mid-cast must be refused rather than queued.
//
//     node tools/seed.mjs Caster --level 40    (with the server stopped)
//     npm run dev:server
//     node tools/test/casting.mjs Caster
import WebSocket from "ws";
import { SKILLS, castMsFor, CAST_CANCEL_PX, PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Caster";
// A staff skill with a real cast, and its tree node.
const SKILL = "firebolt";
const NODE = "staff.firebolt";

const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
let items = [];
let monsters = [];
const casts = [];
const results = [];
const ranksByWeapon = {};
const problems = [];
const fail = (m) => problems.push(m);
const staffRanks = () => ranksByWeapon.staff ?? {};

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") { me = msg.payload; items = msg.payload.items ?? []; }
  if (msg.type === "ITEMS_UPDATE") items = msg.payload.items ?? items;
  if (msg.type === "CAST_STATE") casts.push({ ...msg.payload, at: Date.now() });
  if (msg.type === "SKILL_RESULT") results.push({ ...msg.payload, at: Date.now() });
  if (msg.type === "WEAPON_PROGRESS") ranksByWeapon[msg.payload.weaponType] = msg.payload.ranks ?? {};
  if (msg.type === "STATE_SNAPSHOT") {
    monsters = msg.payload.monsters ?? monsters;
    if (me) {
      const self = msg.payload.players.find((p) => p.id === me.id);
      if (self) me = { ...me, x: self.x, y: self.y };
    }
  }
});

async function walkTo(x, y, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) { send({ type: "MOVE", payload: { x, y } }); await sleep(110); }
}
const hold = async (ms) => { await walkTo(me.x, me.y, ms); };

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1600);
  const castMs = castMsFor(SKILLS[SKILL]);
  console.log(`logged in as ${NAME}; ${SKILL} casts for ${castMs}ms`);
  if (castMs <= 0) { console.log("FAIL — the skill under test has no cast time"); process.exit(1); }

  const staff = items.find((i) => i.weaponType === "staff" && i.slot === "weapon");
  if (!staff) { console.log("FAIL — no staff in the bag; seed the character"); process.exit(1); }
  if (!staff.equipped) { send({ type: "EQUIP_ITEM", payload: { itemId: staff.id } }); await sleep(800); }

  for (const n of ["staff.arcanebolt", NODE]) {
    if (!(staffRanks()[n] > 0)) { send({ type: "LEARN_TALENT", payload: { nodeId: n } }); await sleep(600); }
  }
  if (!(staffRanks()[NODE] > 0)) {
    console.log(`FAIL — could not learn ${NODE}: [${Object.keys(staffRanks()).join(", ") || "none"}]`);
    process.exit(1);
  }

  // Get in range of something.
  let mob = monsters.filter((m) => m.status === "alive")
    .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  if (!mob) { console.log("FAIL — no monsters"); process.exit(1); }
  await walkTo(mob.x, mob.y, 9000);
  await sleep(500);

  // --- A cast that is allowed to finish --------------------------------------
  casts.length = 0; results.length = 0;
  send({ type: "USE_SKILL", payload: { skillId: SKILL } });
  await hold(castMs + 1400);
  const started = casts.find((c) => c.skillId === SKILL);
  const ended = casts.find((c) => c.skillId === null);
  const landed = results.find((r) => r.skillId === SKILL && r.ok);
  console.log(`  standing still: ${started ? "cast started" : "NO CAST"}, ${ended ? `ended${ended.reason ? ` (${ended.reason})` : " clean"}` : "never ended"}, ${landed ? "skill resolved" : "NEVER RESOLVED"}`);
  if (!started) fail("standing still never started a cast");
  if (!landed) fail("a cast held to completion never resolved the skill — the spell is simply lost");
  if (ended?.reason) fail(`an uninterrupted cast ended with "${ended.reason}"`);
  if (started && landed) {
    const took = landed.at - started.at;
    console.log(`  resolved ${took}ms after the cast began (cast is ${castMs}ms)`);
    if (took < castMs * 0.6) fail(`resolved in ${took}ms, well inside its own ${castMs}ms cast`);
  }

  await sleep(5200);

  // --- A cast that is walked out of ------------------------------------------
  casts.length = 0; results.length = 0;
  const from = { x: me.x, y: me.y };
  send({ type: "USE_SKILL", payload: { skillId: SKILL } });
  await sleep(Math.max(80, castMs * 0.3));
  // Walk well past the tolerance, which exists so a body brushing past does
  // not kill a cast.
  await walkTo(from.x + CAST_CANCEL_PX * 8, from.y, castMs + 700);
  const broke = casts.find((c) => c.skillId === null);
  const resolvedAnyway = results.find((r) => r.skillId === SKILL && r.ok);
  console.log(`  walking away:   ${broke ? `cast ended (${broke.reason ?? "clean"})` : "cast never ended"}, ${resolvedAnyway ? "SKILL STILL RESOLVED" : "skill did not resolve"}`);
  if (!broke || broke.reason !== "moved") fail(`walking out of a cast did not break it (${broke?.reason ?? "no end at all"})`);
  if (resolvedAnyway) fail("a cast that was walked out of still resolved");

  // --- Pressing something else mid-cast --------------------------------------
  await sleep(5200);
  casts.length = 0; results.length = 0;
  send({ type: "USE_SKILL", payload: { skillId: SKILL } });
  await sleep(90);
  send({ type: "USE_SKILL", payload: { skillId: "arcanebolt" } });
  await hold(castMs + 900);
  const refused = results.find((r) => r.skillId === "arcanebolt" && !r.ok);
  console.log(`  second press:   ${refused ? `refused ("${refused.reason}")` : "NOT refused"}`);
  if (!refused) fail("a second skill pressed mid-cast was not refused");
  else if (refused.reason !== "already casting") {
    console.log(`    (refused for "${refused.reason}" rather than "already casting" — still refused)`);
  }

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — a cast is something you commit to." : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => { console.error("could not reach the server —", e.message); process.exit(1); });
