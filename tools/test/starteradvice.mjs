// DOES THE GAME'S OWN ADVICE MATCH THE GROUND IT DESCRIBES?
//
// The Herald's "What should I do first?" is the single piece of guidance a new
// player is pointed at, and it said: "Gather from the bushes here in the square
// and the trees outside the wall." There are no bushes in the square. There are
// no gatherable nodes inside the walls at all — 82 nodes exist and the nearest
// is at 1000px, 200 beyond the 800px palisade — while the square holds twenty
// plant-shaped DECORATIONS, eight gardens on the 735px ring plus the door
// planters. So a new player followed the one instruction they had, walked to
// the greenery in front of them, got nothing, and was told nothing else.
//
// It was true once. `ringNodes` in the server records the bushes being moved
// inside the square and then out again to 1000, deliberately: "a town is
// somewhere you go BETWEEN gathering trips; a bush growing between the anvil
// and the inn quietly makes the square another field." The advice was left
// behind by that decision, and so was the comment above the placement, which
// still described the middle step and contradicted the one under it.
//
// NOTHING COULD HAVE CAUGHT THAT. The text lives in `shared/town.ts`, the nodes
// are built in the server, and no test read both. This does, over a socket,
// because node placement is not shared code and cannot be imported.
//
//     npm run dev:server
//     node tools/test/starteradvice.mjs
import WebSocket from "ws";
import { TOWN_CENTER, TOWN_RADIUS_PX, TOWN_NPCS } from "../../shared/town.ts";
import { MONSTER_STATS } from "../../shared/protocol-types.ts";

const problems = [];
const fail = (m) => problems.push(m);
const ws = new WebSocket("ws://localhost:8080");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let nodes = null;
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "STATE_SNAPSHOT" && msg.payload.nodes) nodes = msg.payload.nodes;
});

ws.on("open", async () => {
  ws.send(JSON.stringify({ type: "HELLO", payload: { clientVersion: "0.0.1", name: `Advice${Math.floor(Math.random() * 90000)}` } }));
  for (let i = 0; i < 40 && !nodes; i++) await sleep(150);
  if (!nodes) {
    console.log("FAIL — no snapshot carried resource nodes; nothing to compare the advice against");
    process.exit(1);
  }

  const dist = (n) => Math.hypot(n.x - TOWN_CENTER.x, n.y - TOWN_CENTER.y);
  const inside = nodes.filter((n) => dist(n) <= TOWN_RADIUS_PX);
  const nearest = Math.round(Math.min(...nodes.map(dist)));
  console.log(`${nodes.length} resource nodes; ${inside.length} inside the ${TOWN_RADIUS_PX}px walls; nearest at ${nearest}px`);

  // Every line any NPC says, so this keeps working when the advice moves or a
  // second character starts giving directions.
  const said = JSON.stringify(TOWN_NPCS).toLowerCase();

  // The claim under test is narrow and checkable: nobody may tell a player to
  // gather IN TOWN while nothing gatherable is in town. Phrased as the two
  // wordings that would do it rather than as a general reading of English —
  // a test that tried to understand the sentence would be a worse test.
  const promisesTownGathering =
    /gather[^.]{0,80}(in the square|here in the square|inside the wall)/.test(said) ||
    /(bushes|trees)[^.]{0,40}(here in the square|in the square)/.test(said);

  if (inside.length === 0 && promisesTownGathering) {
    fail(
      "an NPC sends new players to gather inside the town and there is nothing gatherable there — " +
        `nearest node is ${nearest}px from the centre, the walls are at ${TOWN_RADIUS_PX}px`,
    );
  }
  console.log(
    inside.length === 0
      ? `  nothing gatherable inside the walls, and no NPC claims otherwise: ${!promisesTownGathering}`
      : `  ${inside.length} gatherable inside the walls, so the square is fair game to mention`,
  );

  // And the other direction, so this cannot be satisfied by deleting the advice
  // altogether: somebody has to tell a new player where materials come from.
  const mentionsGathering = /gather/.test(said);
  if (!mentionsGathering) fail("no NPC mentions gathering at all — a new player is told nothing about materials");

  // --- and the other claim the town makes about the world ---------------------
  //
  // The Herald describes the rings by naming what lives in them: "slimes and
  // mushnubs within shouting distance, goblins and blobs past that, then wolves
  // and orcs, then trolls and demons, and at the far edge a golem and a dragon."
  // That is a statement about `MONSTER_STATS[kind].band`, written in prose, in a
  // different file from the table it describes. Rebalance a creature into
  // another ring and the Herald starts misdirecting people.
  //
  // Checked as ORDER rather than by parsing the sentence: whatever creatures a
  // distance-ordering line names, their bands must not go backwards as the line
  // goes on. That survives rewording, and it does not need to understand
  // English.
  //
  // SCOPED TO THE LINE THAT MAKES THE CLAIM, which the first version was not: it
  // searched all NPC text at once, picked up a wolf mentioned three thousand
  // characters away in an unrelated answer, and reported the table and the prose
  // as disagreeing when they never had.
  const lines = [];
  const walk = (o) => {
    if (typeof o === "string") lines.push(o);
    else if (o && typeof o === "object") for (const v of Object.values(o)) walk(v);
  };
  walk(TOWN_NPCS);
  const ordering = lines.filter((l) => /further you go|past that|at the far edge/i.test(l));
  if (ordering.length === 0) fail("no NPC describes the rings any more — the geography is unexplained");
  for (const line of ordering) {
    const low = line.toLowerCase();
    // Only creatures whose kind appears literally. Plurals and nicknames
    // ("blobs", "orcs") are deliberately not decoded — a partial list still
    // catches a reordering, and guessing at English would make this fragile in
    // exchange for nothing.
    const named = Object.keys(MONSTER_STATS)
      .map((kind) => ({ kind, band: MONSTER_STATS[kind].band, at: low.indexOf(kind) }))
      .filter((h) => h.at >= 0)
      .sort((a, b) => a.at - b.at);
    for (let i = 1; i < named.length; i++) {
      if (named[i].band < named[i - 1].band) {
        fail(
          `an NPC lists creatures by distance but ${named[i].kind} (band ${named[i].band}) comes ` +
            `after ${named[i - 1].kind} (band ${named[i - 1].band}): "${line.slice(0, 90)}…"`,
        );
      }
    }
    if (named.length >= 2) {
      console.log(`  ring line checks out: ${named.map((h) => `${h.kind}(b${h.band})`).join(" -> ")}`);
    }
  }

  console.log(problems.length ? `\n${problems.length} failure(s).` : "\nOK — the advice describes the world it is given in");
  for (const p of problems) console.log(`  FAIL  ${p}`);
  ws.close();
  process.exit(problems.length ? 1 : 0);
});
