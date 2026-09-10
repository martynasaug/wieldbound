// DO THE MONSTERS STAND ON THE GROUND?
//
// Thirteen kinds, each a separate model on a separate rig, and none of them has
// ever been checked individually for the most basic thing a creature can get
// wrong: whether its feet meet the terrain. A model floating a hand's breadth
// above the ground or sunk to the ankles is invisible in a fight — the eye is
// on the health bar — and obvious the moment you stand still and look.
//
// The weapon survey found two real faults this way and its lesson carries: the
// check that works is AGREEMENT AMONG PEERS. There is no absolute number for
// "correct" here — a slime is a blob and a ghost is supposed to hover — but
// thirteen creatures that all sit within a few centimetres of the terrain and
// one that sits twenty above it is a statement with no aesthetics in it.
//
// Measured as the gap between the lowest point of the creature's own geometry
// and the terrain height under it, in world units, where the character is about
// 1.8 tall.
//
// READ OFF THE KEEP-ALIVE RIGS, WHICH IS WHY THIS COVERS ALL THIRTEEN.
//
// The obvious way to do this is to go and find the creatures, and it does not
// work: kinds live in rings by distance, so a random walk meets band one and
// nothing else — four minutes gave five of thirteen and eight "not met".
// Biasing the walk outward across the boundaries took nine minutes to add ONE
// more. The far kinds are simply a long way off, and the movement budget means
// a bot has to walk every pixel of it.
//
// But every kind is already built at login. `Game.start` loads all thirteen
// monster models as actors so their shaders compile under the loading screen,
// and keeps them alive for the session — see `monsterShaderKeepAlive`, and
// M70.196 for why they are parked below the world rather than at the origin.
// Their geometry is the shipping geometry, seated exactly as a spawned one is,
// so the seat offset can be read off them without meeting a single monster.
//
// Thirteen of thirteen, from one login, in seconds.
//
// AND THE KEEP-ALIVE RIG AGREES WITH A SPAWNED MONSTER, WHICH IS THE ONLY
// REASON THIS SHORTCUT IS ALLOWED. Reading a convenient copy of a thing is
// worth nothing until the copy is shown to hold the property being read, so the
// two methods were run against each other on the six kinds the walker did
// manage to meet:
//
//     kind       walked    keep-alive
//     wolf       -0.001      -0.001
//     mushnub    +0.000      +0.000
//     goblin     +0.015      +0.015
//     (player)   -0.012      -0.015
//     orcbrute   +0.040      +0.027
//     armabee    +0.237      -0.001
//
// Three identical to the thousandth. The two that differ are the two that
// should: the walked orcbrute was mid-stride, and `Actor` lifts PER ANIMATION
// STATE — Walk carries its own 38mm — while a keep-alive rig only ever idles;
// and the armabee is a flyer, whose altitude is put on the actor's position in
// the world and is not a property of the model at all.
//
// So what this measures is each model's IDLE seat against its own origin. That
// is the right quantity for "is this model built wrong" and it is NOT the
// quantity "how high off the grass does this creature float in play".
//
//   node tools/soak/monsterstand.mjs Fighter
import { readFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { MONSTER_STATS } from "../../shared/protocol-types.ts";

// THE KIND -> MODEL TABLE IS READ OUT OF `Game.ts` AS TEXT, ON PURPOSE.
//
// `MONSTER_MODELS` is a module-private const in the client, and importing
// `Game.ts` from Node is not possible — it pulls in three.js, Vite asset URLs
// and the DOM. Copying the thirteen rows in here instead would rot the moment a
// model is swapped, and rot SILENTLY: a stale row simply stops matching, and
// the kind then reports as "not checked", which reads like a coverage gap
// rather than like a broken tool. Reading the real declaration keeps one
// source, and a rename is loud instead of quiet.
const gameSrc = new URL("../../client/src/three/Game.ts", import.meta.url);
const block = readFileSync(gameSrc, "utf8").match(/const MONSTER_MODELS[^{]*\{([\s\S]*?)\n\};/);
if (!block) {
  console.error("could not find the MONSTER_MODELS table in Game.ts — has it been renamed?");
  process.exit(1);
}
const MONSTER_MODELS = {};
for (const m of block[1].matchAll(/(\w+):\s*\{\s*model:\s*"([^"]+)"/g)) {
  MONSTER_MODELS[m[1]] = { model: m[2] };
}
if (Object.keys(MONSTER_MODELS).length !== Object.keys(MONSTER_STATS).length) {
  console.log(
    `note: parsed ${Object.keys(MONSTER_MODELS).length} model rows but the game has ` +
      `${Object.keys(MONSTER_STATS).length} kinds — the table below may be short.`,
  );
}

const NAME = process.argv[2] ?? "Fighter";

const { browser, page } = await open({ headless: true, width: 1000, height: 800 });
await login(page, NAME);
await page.waitForTimeout(1500);

const lowestOf = (root, actor) => {
  root.updateWorldMatrix(true, true);
  let lowest = Infinity;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (actor && (o.material === actor.silhouetteMaterial || o.material === actor.outlineMaterial)) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    for (const cx of [bb.min.x, bb.max.x])
      for (const cy of [bb.min.y, bb.max.y])
        for (const cz of [bb.min.z, bb.max.z]) {
          const e = o.matrixWorld.elements;
          const wy = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
          if (wy < lowest) lowest = wy;
        }
  });
  return lowest;
};

const rows = await page.evaluate((lowestSrc) => {
  const lowestOf = eval(`(${lowestSrc})`);
  const g = window.__wieldbound;
  const out = [];
  for (const root of g.monsterShaderKeepAlive ?? []) {
    const names = [];
    root.traverse((o) => { if (o.name) names.push(o.name); });
    const low = lowestOf(root, null);
    if (!Number.isFinite(low)) continue;
    out.push({ names, gap: low - root.position.y });
  }
  const me = g.localActor;
  if (me?.root) {
    const low = lowestOf(me.root, me);
    if (Number.isFinite(low)) out.push({ names: ["(player)"], gap: low - me.root.position.y });
  }
  return out;
}, lowestOf.toString());
await browser.close();
// Name each rig by matching the model file it was built from against the mesh
// names inside it — the rigs are anonymous groups, but a monster model always
// carries its own name on a node ("Dragon", "Goleling_Evolved").
//
// EXACT FIRST, THEN A NORMALISED PREFIX — because the artists did not agree
// with the filenames. Five of the thirteen carry a node named close to but not
// equal to their file: `Dog.gltf` holds "Dog_Blob", `GreenBlob.gltf` holds
// "Green_Blob", `Dragon_Evolved.gltf` holds "Dragon". Exact matching alone left
// those five as "(unmatched)" and the summary line then said "8 of 13 kinds
// measured", which is a false coverage report: all thirteen rigs WERE measured
// and eight of them were merely named.
//
// Ambiguity is refused rather than guessed. Two kinds share the Orc family —
// `Orc.gltf` and `Orc_Skull.gltf` — and a loose prefix rule would happily hand
// "Orc" to both.
const stem = (path) => path.split("/").pop().replace(/\.(gltf|glb|fbx)$/i, "");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const named = rows.map((r) => {
  if (r.names[0] === "(player)") return { kind: "(player)", gap: r.gap };
  const entries = Object.entries(MONSTER_MODELS);
  let hits = entries.filter(([, spec]) => r.names.some((n) => n === stem(spec.model)));
  if (hits.length !== 1) {
    hits = entries.filter(([, spec]) =>
      r.names.some((n) => {
        const a = norm(n);
        const b = norm(stem(spec.model));
        return a.length > 2 && b.length > 2 && (a.startsWith(b) || b.startsWith(a));
      }),
    );
  }
  const why = hits.length > 1 ? "ambiguous" : "unmatched";
  return {
    kind: hits.length === 1 ? hits[0][0] : `(${why}: ${r.names.slice(0, 3).join("/")})`,
    gap: r.gap,
  };
});
named.sort((a, b) => a.gap - b.gap);

const kinds = named.filter((r) => !r.kind.startsWith("("));
console.log(`${kinds.length} of ${Object.keys(MONSTER_STATS).length} kinds measured\n`);
console.log("idle seat: lowest vertex of the model, relative to the model's own origin.");
console.log("a flyer's altitude is on its actor's position, not in here — see the header.\n");
console.log("kind          seat offset");
for (const r of named) {
  console.log(`  ${r.kind.padEnd(13)} ${r.gap >= 0 ? "+" : ""}${r.gap.toFixed(3)}`);
}

const missing = Object.keys(MONSTER_STATS).filter((k) => !kinds.some((r) => r.kind === k));
if (missing.length) console.log(`\nnot matched to a rig, so not checked: ${missing.join(", ")}`);

if (kinds.length > 2) {
  const gaps = kinds.map((r) => r.gap);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  // A flyer is SUPPOSED to hang above its own origin, so a spread alone proves
  // nothing; what would be a fault is a walker sitting where the flyers do, or
  // a creature below its origin, which is a model buried in the ground.
  const sunk = kinds.filter((r) => r.gap < -0.05);
  console.log(
    `\nspread across kinds: ${spread.toFixed(3)} world units` +
      (sunk.length ? `\nSUNK BELOW THEIR OWN ORIGIN: ${sunk.map((r) => r.kind).join(", ")}` : "\nnone sits below its own origin"),
  );
}
