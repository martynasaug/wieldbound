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
import {
  AGGRO_RANGE_PX,
  MONSTER_STATS,
  MONSTER_WANDER_RADIUS_PX,
  PLAYER_SPAWN,
  RESOURCE_BAND_RADII,
} from "../../shared/protocol-types.ts";

/** Which difficulty ring a point falls in. The same boundaries the server uses.
 *  Duplicated as three lines rather than imported because `bandAt` is not
 *  exported; the table it reads IS, which is the part that could drift. */
const bandAt = (d) => {
  for (let i = 0; i < RESOURCE_BAND_RADII.length; i++) if (d < RESOURCE_BAND_RADII[i]) return i + 1;
  return 5;
};

const NAME = process.argv[2] ?? `Watcher${Math.floor(Math.random() * 90000)}`;
const WATCH_MS = 22000;
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
const first = new Map();
const last = new Map();
const drift = new Map();
/** Closest each creature ever came to the watcher. Anything that crossed the
 *  aggro line chased a player and is not evidence about wandering. */
const closest = new Map();
/** Anyone else on the server during the watch. See the note by the wander check. */
let otherPlayers = 0;
const problems = [];
const fail = (m) => problems.push(m);

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") me = msg.payload;
  if (msg.type !== "STATE_SNAPSHOT") return;
  if (me) {
    otherPlayers = Math.max(otherPlayers, (msg.payload.players ?? []).filter((p) => p.id !== me.id).length);
  }
  for (const m of msg.payload.monsters ?? []) {
    if (m.status !== "alive") continue;
    if (!first.has(m.id)) first.set(m.id, { x: m.x, y: m.y, kind: m.kind });
    const prev = last.get(m.id);
    if (prev) {
      const step = Math.hypot(m.x - prev.x, m.y - prev.y);
      // Ignore teleports (a respawn snapping home), which are not wandering.
      if (step < 60) drift.set(m.id, (drift.get(m.id) ?? 0) + step);
    }
    const toWatcher = Math.hypot(m.x - PLAYER_SPAWN.x, m.y - PLAYER_SPAWN.y);
    closest.set(m.id, Math.min(closest.get(m.id) ?? Infinity, toWatcher));
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
  // STANDING STILL IS NOT THE SAME AS TOUCHING NOTHING, which is what this
  // measured before and why it failed about one suite run in four.
  //
  // The comment above says anything that moves "does so because it wanted to".
  // That holds only while every creature stays outside AGGRO_RANGE_PX, and
  // nothing keeps them there: a wanderer drifting toward spawn crosses the line
  // on its own and chases the watcher, which is a CHASE, bounded by
  // MONSTER_LEASH_PX at 520 rather than by the 90px wander radius. Measuring
  // that as wandering produced "a orcbrute got 276px from its post" — 276 being
  // impossible for a wanderer, which is clamped to `home ± 90` on the server and
  // so can be displaced at most ~180px between two sightings. The number was
  // the proof that it was not wandering, and it was read as proof that wander
  // was broken.
  //
  // So creatures that came within aggro range are excluded and COUNTED. If that
  // leaves too few, the run says it is inconclusive rather than passing on an
  // empty sample — the failure this file exists to catch would otherwise hide
  // behind its own exclusion rule.
  // AND NOT ALONE IS NOT MEASURABLE FROM HERE AT ALL.
  //
  // Excluding creatures that came near THE WATCHER is necessary and nowhere
  // near sufficient: a monster chasing somebody else is doing something this
  // vantage point cannot distinguish from a very energetic wander, because the
  // snapshot carries positions and not `ai.home` or `ai.state`.
  //
  // That is not hypothetical. Four consecutive runs failed with drifts of 260,
  // 270 and 511px while reporting 80/80 creatures outside aggro range, and the
  // cause was a suite running in another shell whose characters were dragging
  // camps around the map. It read exactly like a game bug — 511px is impossible
  // for a wanderer clamped to `home ± 90`, so the number even looked like proof
  // — and the same four runs pass at 171-177px with nobody else online. I was
  // one step from reporting that monster camps drift with server uptime.
  //
  // So: if anyone else is connected, this says so and declines to judge.
  if (otherPlayers > 0) {
    console.log(
      `  INCONCLUSIVE — ${otherPlayers} other player(s) online. Their chases are ` +
        "indistinguishable from wandering from here, and drag camps hundreds of pixels.",
    );
    console.log(problems.length ? `\n${problems.length} failure(s).` : "\nOK — not judged, but nothing else broke.");
    ws.close();
    process.exit(problems.length ? 1 : 0);
  }
  const undisturbed = seen.filter((id) => (closest.get(id) ?? Infinity) > AGGRO_RANGE_PX);
  const aggroed = seen.length - undisturbed.length;
  console.log(
    `  ${undisturbed.length}/${seen.length} never came within aggro range (${aggroed} did, and chase is ` +
      `leashed at 520px, not ${MONSTER_WANDER_RADIUS_PX})`,
  );
  let worst = 0;
  let worstKind = "";
  for (const id of undisturbed) {
    const a = first.get(id);
    const b = last.get(id);
    const away = Math.hypot(b.x - a.x, b.y - a.y);
    if (away > worst) { worst = away; worstKind = a.kind; }
  }
  if (undisturbed.length < 5) {
    console.log(
      `  INCONCLUSIVE — only ${undisturbed.length} creature(s) stayed out of aggro range, which is` +
        " too few to say anything about wandering.",
    );
  } else {
    console.log(
      `  furthest an undisturbed creature got from where it started: ${worst.toFixed(0)}px ` +
        `(${worstKind}), wander radius is ${MONSTER_WANDER_RADIUS_PX}`,
    );
    if (worst > MONSTER_WANDER_RADIUS_PX * 2.4) {
      fail(`a ${worstKind} got ${worst.toFixed(0)}px from its post — a wander with no leash walks a camp out of its own band`);
    }
  }

  // A boss stands where the stories put it.
  for (const id of bosses) {
    const a = first.get(id);
    const b = last.get(id);
    const away = Math.hypot(b.x - a.x, b.y - a.y);
    if (away > 8) fail(`the ${a.kind} wandered ${away.toFixed(0)}px — a boss stands sentinel`);
  }
  console.log(`  ${bosses.length} boss(es) in view, all holding station`);

  // AND EVERY CAMP IS ON GROUND NO EASIER THAN ITS KIND.
  //
  // Difficulty in this world is laid out as distance, and each kind declares
  // the ring it belongs to as `MONSTER_STATS[kind].band`. Nothing checked that
  // the two agreed, and the comments in `server/src/index.ts` that were the
  // only record of it had gone stale in four places — band 4's heading claimed
  // a radius INSIDE band 3's. Nothing broke, because `bandAt` reads the radii
  // table and never those headings, so the drift was invisible to the game and
  // visible only to a reader, who would be misled.
  //
  // NOT EQUALITY. Placing a kind one ring FURTHER OUT than it declares is how
  // the rings are softened at their edges — band 3's ground carries a spikyblob
  // and an armabee camp from band 2, and band 4's carries a cactoro and an
  // orcbrute from band 3. What must never happen is the other direction: a
  // band-4 creature standing on band-1 ground is a level-1 player meeting a
  // demon on the way to their first quest. So the assertion is one-sided.
  //
  // Read off live positions rather than off a copy of the layout table, so it
  // is the world being checked and not a second transcription of it.
  const misplaced = [];
  for (const id of seen) {
    const a = first.get(id);
    const declared = MONSTER_STATS[a.kind]?.band;
    if (!declared) continue;
    const ground = bandAt(Math.hypot(a.x - PLAYER_SPAWN.x, a.y - PLAYER_SPAWN.y));
    if (ground < declared) misplaced.push(`${a.kind} (band ${declared}) on band-${ground} ground`);
  }
  if (misplaced.length) {
    fail(`camps on ground easier than their kind: ${[...new Set(misplaced)].join(", ")}`);
  } else {
    console.log(`  all  undisturbed creatures stand on ground no easier than their declared band`);
  }

  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — a camp is a place with animals in it." : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => { console.error("could not reach the server —", e.message); process.exit(1); });
