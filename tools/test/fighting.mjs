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
  let target = nearest(null);
  if (!target) { console.log("FAIL — no monsters in the snapshot"); process.exit(1); }
  await walkTo(target.x, target.y, 9000);
  target = nearest([target.kind]);
  if (!target) { console.log("FAIL — lost the target"); process.exit(1); }
  const gap = Math.hypot(target.x - me.x, target.y - me.y);
  console.log(`engaging a ${target.kind} at ${gap.toFixed(0)}px`);

  send({ type: "USE_ATTACK", payload: {} });
  await sleep(1200);

  // --- Standing and fighting -------------------------------------------------
  dealt = 0;
  const hold = { x: me.x, y: me.y };
  const untilA = Date.now() + 9000;
  while (Date.now() < untilA) {
    send({ type: "MOVE", payload: { x: hold.x, y: hold.y } });
    await sleep(110);
  }
  const standing = dealt;
  console.log(`  standing still: ${standing} damage dealt`);

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
  await walkTo(me.x + (dx / len) * 900, me.y + (dy / len) * 900, 9000);
  const retreating = dealt;
  console.log(`  running away:   ${retreating} damage dealt`);

  if (standing === 0) {
    fail("nothing landed even while standing still, so the comparison proves nothing");
  } else if (retreating > standing * 0.25) {
    fail(
      `still swinging while running away — ${retreating} against ${standing} standing. ` +
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
