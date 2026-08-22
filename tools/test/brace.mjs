// Shield Wall, end to end, over a real socket.
//
// It granted the WRONG STATUS for the whole life of the skill. `useSkill` reads
// `skill.applies ?? "enraged"` — a default that is right for War Cry and wrong
// for everything else — and Shield Wall declared no `applies`, so pressing the
// warrior's survival cooldown handed out +35% damage DEALT while its own status
// row sat in the table with nothing able to reach it. The description said
// "Brace. Halves incoming damage briefly." The status blurb said "Braced.
// Incoming damage is halved." The only thing that disagreed was the effect.
//
// `tools/test/statuses.mjs` now catches that offline. What it cannot reach is
// whether the server actually PUTS the thing on you when you press the button,
// and whether the four paths that hurt a player all compose it — so this is the
// live half:
//
//     node tools/seed.mjs Bracer --level 40      (with the server stopped)
//     npm run dev:server
//     node tools/test/brace.mjs Bracer
import WebSocket from "ws";
import { PLAYER_SPAWN, SKILLS, STATUSES } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Bracer";
const NODE = "mace.shieldwall";
const PREREQ = "mace.bulwark";

const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
let items = [];
let statuses = [];
let lastResult = null;
let mana = 0;
const ranksByWeapon = {};
const points = {};
const maceRanks = () => ranksByWeapon.mace ?? {};
const problems = [];
const fail = (m) => problems.push(m);

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  // The bag arrives INSIDE `WELCOME` and there is no `ITEMS_UPDATE` at login —
  // reading only the latter leaves the list empty and the probe reports "no
  // mace in the bag" against a fully seeded character.
  if (msg.type === "WELCOME") {
    me = msg.payload;
    items = msg.payload.items ?? [];
  }
  if (msg.type === "ITEMS_UPDATE") items = msg.payload.items ?? items;
  if (msg.type === "STATUS_UPDATE") statuses = msg.payload.statuses ?? [];
  // The server answers every USE_SKILL whether it worked or not, and its own
  // `reason` is worth far more than any guess from out here.
  if (msg.type === "SKILL_RESULT") lastResult = msg.payload;
  if (msg.type === "MANA_UPDATE") mana = msg.payload.mana ?? mana;
  if (msg.type === "WELCOME") mana = msg.payload.mana ?? 0;
  // Assert the precondition rather than assuming it: a talent that did not
  // stick and a skill that does nothing look identical from out here.
  //
  // KEYED BY WEAPON, because `WEAPON_PROGRESS` is sent per family and every
  // one of the eight carries its own `ranks`. Storing them in one variable
  // means the last message to arrive wins, and seven of the eight are empty.
  if (msg.type === "WEAPON_PROGRESS") {
    ranksByWeapon[msg.payload.weaponType] = msg.payload.ranks ?? {};
    points[msg.payload.weaponType] = msg.payload.pointsAvailable;
  }
  if (msg.type === "STATE_SNAPSHOT" && me) {
    const self = msg.payload.players.find((p) => p.id === me.id);
    if (self) me = { ...me, x: self.x, y: self.y };
  }
});

/**
 * EQUIP_ITEM TOGGLES. Its payload is `{ itemId }` and nothing else — there is no
 * `equip: true` to ask for a direction, because taking a thing off is the same
 * gesture as putting it on (clicking the filled paperdoll slot). Sending it at
 * something already worn therefore UNEQUIPS it.
 *
 * The first version of this probe sent it blind every run, so alternate runs
 * fought bare-handed and the server answered `USE_SKILL` with "not learned for
 * this weapon" — which is perfectly true of the fist tree and looked exactly
 * like a talent that had failed to persist across a server restart.
 */
const equip = async (baseId) => {
  const it = items.find((i) => i.baseId === baseId);
  if (!it) return false;
  if (it.equipped) return true;
  send({ type: "EQUIP_ITEM", payload: { itemId: it.id } });
  await sleep(700);
  return true;
};

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1600);
  console.log(`logged in as ${NAME}`);

  // A mace, because Shield Wall lives in the mace tree — which is itself the
  // point of this game: the cooldown you get is the one your hands earn.
  const mace = items.find((i) => i.weaponType === "mace");
  if (!mace) {
    console.log("FAIL — no mace in the bag; seed the character first");
    process.exit(1);
  }
  await equip(mace.baseId);
  const worn = items.find((i) => i.slot === "weapon" && i.equipped);
  if (worn?.weaponType !== "mace") {
    console.log(`FAIL — holding ${worn?.baseId ?? "nothing"}, not a mace`);
    process.exit(1);
  }
  console.log(`holding ${worn.baseId}, a ${worn.weaponType}`);

  // Buy the node and its prerequisite. The field is `nodeId`; sending
  // `talentId` is silently ignored, and what that looks like from here is
  // "Shield Wall applied no status" — which is indistinguishable from the bug
  // this probe exists to check.
  // Idempotent: a rank already bought is not bought again. Without this the
  // probe spends a talent point every run and a character eventually runs out,
  // which would read as the skill breaking.
  if (!(maceRanks()[PREREQ] > 0)) {
    send({ type: "LEARN_TALENT", payload: { nodeId: PREREQ } });
    await sleep(500);
  }
  if (!(maceRanks()[NODE] > 0)) {
    send({ type: "LEARN_TALENT", payload: { nodeId: NODE } });
    await sleep(800);
  }
  const ranks = maceRanks();
  if (!(ranks[NODE] > 0)) {
    console.log(
      `FAIL — could not learn ${NODE}; mace ranks are ` +
        `[${Object.keys(ranks).filter((k) => ranks[k] > 0).join(", ") || "none"}], ` +
        `${points.mace ?? "?"} point(s) available`,
    );
    process.exit(1);
  }
  console.log(`learned ${NODE} (${points.mace} point(s) left)`);

  // Somewhere quiet, so nothing is hitting us while we read the status.
  for (let i = 0; i < 40; i++) {
    send({ type: "MOVE", payload: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y } });
    await sleep(110);
  }
  await sleep(600);

  // WAIT FOR THE MANA. A mace is a warrior's weapon and the pool is small, so a
  // seeded character walking to spawn arrives without the 16 this costs. Firing
  // anyway gets `ok=false, not enough mana`, which is a perfectly correct answer
  // to a question the probe should not have been asking yet — assert the
  // precondition rather than assuming it.
  const cost = SKILLS.shieldwall.manaCost;
  for (let i = 0; i < 60 && mana < cost; i++) await sleep(1000);
  if (mana < cost) {
    console.log(`FAIL — only ${mana} mana after a minute, and Shield Wall costs ${cost}`);
    process.exit(1);
  }
  console.log(`  ${mana} mana, and it costs ${cost}`);

  const before = statuses.map((s) => s.id);
  send({ type: "USE_SKILL", payload: { skillId: "shieldwall" } });
  await sleep(1200);
  const after = statuses.map((s) => s.id);
  const gained = after.filter((s) => !before.includes(s));

  console.log(`  before: [${before.join(", ") || "nothing"}]`);
  console.log(`  after:  [${after.join(", ") || "nothing"}]`);
  console.log(
    `  server said: ${lastResult ? `ok=${lastResult.ok}${lastResult.reason ? ` (${lastResult.reason})` : ""}` : "nothing at all"}`,
  );

  if (gained.length === 0) {
    // The talent is asserted above, so by here it is the SKILL that did
    // nothing — either it was refused, or it applied something that cannot sit
    // on a player and `applyStatus` returned false without saying so.
    fail(
      `pressing Shield Wall applied no status at all (server: ` +
        `${lastResult ? `ok=${lastResult.ok}${lastResult.reason ? `, ${lastResult.reason}` : ""}` : "silent"})`,
    );
  } else if (gained.includes("enraged")) {
    fail(
      "Shield Wall applied `enraged` — the War Cry default. That is the original bug: " +
        "the survival cooldown grants +35% damage dealt instead of halving damage taken.",
    );
  } else if (!gained.includes("shielded")) {
    fail(`Shield Wall applied [${gained.join(", ")}], not \`shielded\``);
  } else {
    const def = STATUSES.shielded;
    console.log(
      `  Shield Wall grants \`shielded\` — ${def.blurb} ` +
        `(x${def.damageTakenMultiplier} for ${def.durationMs}ms)`,
    );
  }

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — the brace braces." : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => {
  console.error("could not reach the server —", e.message);
  process.exit(1);
});
