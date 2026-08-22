// What a camp does when nobody is standing in it, over a real socket.
//
// Every creature in this game stood on the exact pixel it spawned on, facing
// one way, for the life of the world. That is the same complaint Phase 54
// answered for the grass and Phase 51 for the townspeople — the thing that
// reads as alive is motion with intent — and it is invisible as a defect
// because nothing is wrong, there is simply nothing happening.
//
// Three things to check, and all three fail silently:
//
//   * a camp has to MOVE. Nothing throws when it does not.
//   * and it has to stay HOME. A wander with no leash is a camp that walks off
//     its own difficulty band over an afternoon, and the band is the entire
//     way this world is laid out.
//   * and a BOSS must not wander. The three things with a guaranteed drop are
//     what a player walks a long way to find, and one milling about is worth
//     less than one standing sentinel where the stories put it.
//
//     npm run dev:server
//     node tools/test/camps.mjs
import WebSocket from "ws";
import { MONSTER_STATS, MONSTER_WANDER_RADIUS_PX, PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Watcher${Math.floor(Math.random() * 90000)}`;
const WATCH_MS = 22000;
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
const first = new Map();
const last = new Map();
const drift = new Map();
const problems = [];
const fail = (m) => problems.push(m);

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") me = msg.payload;
  if (msg.type !== "STATE_SNAPSHOT") return;
  for (const m of msg.payload.monsters ?? []) {
    if (m.status !== "alive") continue;
    if (!first.has(m.id)) first.set(m.id, { x: m.x, y: m.y, kind: m.kind });
    const prev = last.get(m.id);
    if (prev) {
      const step = Math.hypot(m.x - prev.x, m.y - prev.y);
      // Ignore teleports (a respawn snapping home), which are not wandering.
      if (step < 60) drift.set(m.id, (drift.get(m.id) ?? 0) + step);
    }
    last.set(m.id, { x: m.x, y: m.y, kind: m.kind });
  }
});

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1500);
  // Stand at spawn and touch nothing. Anything that moves does so because it
  // wanted to — walking out to watch would put creatures in aggro and measure
  // a chase instead.
  for (let i = 0; i < 12; i++) {
    send({ type: "MOVE", payload: { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y } });
    await sleep(120);
  }
  console.log(`watching from spawn for ${WATCH_MS / 1000}s, touching nothing`);
  await sleep(WATCH_MS);

  const seen = [...first.keys()];
  if (seen.length === 0) { console.log("FAIL — no monsters in any snapshot"); process.exit(1); }

  const moved = seen.filter((id) => (drift.get(id) ?? 0) > 8);
  const bosses = seen.filter((id) => MONSTER_STATS[first.get(id).kind]?.guaranteedDrop);
  const ordinary = seen.filter((id) => !MONSTER_STATS[first.get(id).kind]?.guaranteedDrop);

  console.log(`  ${seen.length} creatures in view, ${moved.length} of them moved`);

  // Most of an untouched camp should have drifted. Not all — a monster part way
  // through a dwell has nothing to do — so this is a majority rather than a
  // sweep.
  const movedOrdinary = ordinary.filter((id) => (drift.get(id) ?? 0) > 8).length;
  if (ordinary.length > 0) {
    const share = movedOrdinary / ordinary.length;
    console.log(`  ${movedOrdinary}/${ordinary.length} ordinary creatures drifted (${(share * 100).toFixed(0)}%)`);
    if (share < 0.5) {
      fail(`only ${(share * 100).toFixed(0)}% of an untouched camp moved at all — it is still a shelf of props`);
    }
  }

  // And nothing walked off its post. The wander radius is the leash; anything
  // past it with slack has escaped the band it was placed in.
  let worst = 0;
  let worstKind = "";
  for (const id of seen) {
    const a = first.get(id);
    const b = last.get(id);
    const away = Math.hypot(b.x - a.x, b.y - a.y);
    if (away > worst) { worst = away; worstKind = a.kind; }
  }
  console.log(`  furthest anything got from where it started: ${worst.toFixed(0)}px (${worstKind}), leash is ${MONSTER_WANDER_RADIUS_PX}`);
  if (worst > MONSTER_WANDER_RADIUS_PX * 2.4) {
    fail(`a ${worstKind} got ${worst.toFixed(0)}px from its post — a wander with no leash walks a camp out of its own band`);
  }

  // A boss stands where the stories put it.
  for (const id of bosses) {
    const a = first.get(id);
    const b = last.get(id);
    const away = Math.hypot(b.x - a.x, b.y - a.y);
    if (away > 8) fail(`the ${a.kind} wandered ${away.toFixed(0)}px — a boss stands sentinel`);
  }
  console.log(`  ${bosses.length} boss(es) in view, all holding station`);

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — a camp is a place with animals in it." : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => { console.error("could not reach the server —", e.message); process.exit(1); });
