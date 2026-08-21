// Checks the six woods.
//
// The rule this file exists for is the one that made forests possible at all,
// and it is enforced against the REAL model lists rather than against a copy:
// the harvestable wood node is a round-crowned broadleaf and nothing else in
// the world may wear that silhouette. It is a rule about two arrays in two
// files that nothing in the engine keeps apart, its failure is silent, and the
// symptom — a player chopping at scenery — arrives as a vague complaint rather
// than as a bug report.
//
// Everything else here is the town test's prop rules moved out to the frontier:
// a wood standing over a monster camp, a wood swallowing a waystone the quest
// brief describes by its silhouette, a wood grown so far it reaches the ring a
// level-3 player fights in.
//
//   node tools/test/forests.mjs

import { readFileSync } from "node:fs";
import { PLAYER_SPAWN, WORLD_WIDTH, WORLD_HEIGHT } from "../../shared/protocol-types.ts";
import { TOWN_RADIUS_PX, TOWN_NAME, inTown } from "../../shared/town.ts";
import { placeNameAt } from "../../shared/places.ts";
import { LANDMARKS, landmarkPosition, LANDMARK_REACH_PX } from "../../shared/landmarks.ts";
import { roadPath } from "../../shared/road.ts";
import { riverPath, bridgeAt, RIVER_NAME } from "../../shared/river.ts";
import {
  FORESTS,
  FOREST_IDS,
  FOREST_MIN_EDGE_PX,
  FOREST_LANDMARK_CLEARANCE_PX,
  forestById,
  forestAt,
  forestStrengthAt,
  forestEdgeFromSpawn,
  forestInWorld,
} from "../../shared/forests.ts";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n== ${name} ==`);

const src = readFileSync(new URL("../../server/src/index.ts", import.meta.url), "utf8");
const at = (r, a) => ({
  x: PLAYER_SPAWN.x + Math.cos((a * Math.PI) / 180) * r,
  y: PLAYER_SPAWN.y + Math.sin((a * Math.PI) / 180) * r,
});
const camps = [...src.matchAll(/ringPack\(\s*"[^"]+",\s*"[^"]+",\s*(\d+),\s*(\d+)/g)].map((m) =>
  at(Number(m[1]), Number(m[2])),
);
const nodes = [];
for (const m of src.matchAll(/ringNodes\(\s*"[^"]+",\s*"[^"]+",\s*(\d+),\s*(\d+),\s*(\d+)/g)) {
  const [, radius, count, startDeg] = m.map(Number);
  for (let i = 0; i < count; i++) nodes.push(at(radius, startDeg + (360 / count) * i));
}
if (camps.length === 0 || nodes.length === 0) fail("could not read the server's world tables");

// --- The rule that makes any of this legal ------------------------------------

section("scenery does not look interactive");
{
  // Read out of the real files. A restated list would agree today and stop
  // agreeing the first time somebody adds a species to a wood.
  const gameSrc = readFileSync(new URL("../../client/src/three/Game.ts", import.meta.url), "utf8");
  const forestSrc = readFileSync(
    new URL("../../client/src/three/forest.ts", import.meta.url),
    "utf8",
  );
  const worldSrc = readFileSync(new URL("../../client/src/three/World.ts", import.meta.url), "utf8");

  const nodeBlock = gameSrc.match(/NODE_MODELS[\s\S]*?\n};/);
  if (!nodeBlock) {
    fail("could not find NODE_MODELS in Game.ts");
  } else {
    const nodeTrees = [...nodeBlock[0].matchAll(/"nature\/([A-Za-z_0-9]+)\.gltf"/g)].map(
      (m) => m[1],
    );
    const sceneryTrees = new Set(
      [...forestSrc.matchAll(/"nature\/([A-Za-z_0-9]+)\.gltf"/g)].map((m) => m[1]),
    );
    const treelineBlock = worldSrc.match(/const treeModels = \[[\s\S]*?\];/);
    if (treelineBlock) {
      for (const m of treelineBlock[0].matchAll(/"nature\/([A-Za-z_0-9]+)\.gltf"/g)) {
        sceneryTrees.add(m[1]);
      }
    } else {
      fail("could not find the treeline's model list in World.ts");
    }

    const nodeOnly = nodeTrees.filter((n) => n.startsWith("CommonTree") || n.startsWith("Pine"));
    const clash = nodeOnly.filter((n) => sceneryTrees.has(n));
    if (clash.length > 0) {
      fail(`the harvestable tree and the scenery share a silhouette: ${clash.join(", ")}`);
    } else {
      console.log(
        `  the wood node's ${nodeOnly.length} models appear in none of the ` +
          `${sceneryTrees.size} scenery models`,
      );
    }

    // And the other half of the rule: every wood tree is TALLER than any node
    // tree, so scale separates them even at a silhouette-only distance.
    const nodeHeights = gameSrc.match(/tree: \[([\d.]+), ([\d.]+)\]/);
    const tallestNode = nodeHeights ? Number(nodeHeights[2]) : null;
    const shortestScenery = Math.min(
      ...[...forestSrc.matchAll(/height: \[([\d.]+), ([\d.]+)\]/g)]
        .map((m) => Number(m[1]))
        // The undergrowth is knee-high on purpose and is not a tree.
        .filter((h) => h > 3),
    );
    if (tallestNode === null) {
      fail("could not read NODE_HEIGHTS.tree out of Game.ts");
    } else if (shortestScenery <= tallestNode) {
      fail(`a forest tree can be ${shortestScenery} units — no taller than a node's ${tallestNode}`);
    } else {
      console.log(
        `  and every forest tree starts at ${shortestScenery} units, above the node's ${tallestNode}`,
      );
    }
  }
}

// --- Where the woods are -------------------------------------------------------

section("the frontier rule");
{
  for (const f of FORESTS) {
    const edge = forestEdgeFromSpawn(f);
    if (edge < FOREST_MIN_EDGE_PX) {
      fail(`${f.name}'s edge is ${edge.toFixed(0)}px from spawn, inside the ${FOREST_MIN_EDGE_PX}px frontier`);
    }
    if (!forestInWorld(f, 900)) fail(`${f.name} falls outside the map`);
  }
  console.log(
    `  ${FORESTS.length} woods, nearest edge ` +
      `${Math.min(...FORESTS.map(forestEdgeFromSpawn)).toFixed(0)}px from spawn`,
  );

  // The canopy field is what actually gets planted, and it reaches further than
  // the nominal radius because the edge is warped. So the district is checked
  // against the FIELD rather than against the discs.
  let inDistrict = 0;
  for (let r = 0; r <= 2820; r += 60) {
    for (let a = 0; a < 360; a += 2) {
      const p = at(r, a);
      if (forestStrengthAt(p.x, p.y) > 0) inDistrict++;
    }
  }
  if (inDistrict > 0) fail(`canopy reaches ${inDistrict} points inside Emberhold's district`);
  else console.log("  no canopy anywhere inside the five bands");

  if (forestStrengthAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y) > 0) fail("there is a wood on spawn");
  if (inTown(FORESTS[0].x, FORESTS[0].y)) fail("a wood is centred in Emberhold");
}

section("what the canopy keeps clear of");
{
  let campHits = 0;
  for (const c of camps) if (forestStrengthAt(c.x, c.y) > 0) campHits++;
  if (campHits > 0) fail(`${campHits} monster camps stand under a canopy`);
  else console.log(`  none of the ${camps.length} camps is in a wood`);

  let nodeHits = 0;
  for (const n of nodes) if (forestStrengthAt(n.x, n.y) > 0) nodeHits++;
  if (nodeHits > 0) fail(`${nodeHits} resource nodes stand under a canopy`);
  else console.log(`  none of the ${nodes.length} resource nodes is in a wood`);

  // A waystone is a monument raised in the open, and the quest that sends you
  // to one describes its SHAPE. A silhouette inside a wood is not a silhouette.
  for (const l of LANDMARKS) {
    const p = landmarkPosition(l);
    let worst = 0;
    for (let a = 0; a < 360; a += 10) {
      const q = {
        x: p.x + Math.cos((a * Math.PI) / 180) * FOREST_LANDMARK_CLEARANCE_PX,
        y: p.y + Math.sin((a * Math.PI) / 180) * FOREST_LANDMARK_CLEARANCE_PX,
      };
      worst = Math.max(worst, forestStrengthAt(q.x, q.y));
    }
    if (forestStrengthAt(p.x, p.y) > 0) fail(`${l.name} stands inside a wood`);
    else if (worst > 0.85) {
      fail(`${l.name} has closed canopy right up to its clearance ring`);
    }
  }
  console.log(`  every waystone keeps ${FOREST_LANDMARK_CLEARANCE_PX}px of open ground round it`);

  if (forestStrengthAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y - TOWN_RADIUS_PX) > 0) {
    fail("canopy reaches the palisade");
  }
}

// --- The woods have to be somewhere worth walking ------------------------------

section("the journey");
{
  // A wood nobody ever walks through is a texture on the minimap. The road is
  // the one route in this world everybody takes, so at least one wood has to be
  // ON it — and the whole point of Pinereach is that it is.
  const onRoad = new Set();
  for (const p of roadPath()) {
    const f = forestAt(p.x, p.y);
    if (f && forestStrengthAt(p.x, p.y) > 0) onRoad.add(f.id);
  }
  if (onRoad.size === 0) fail("the North Road does not pass through a single wood");
  else console.log(`  the road runs through ${[...onRoad].join(", ")}`);

  // And the river's banks should be wooded somewhere, or the two biggest
  // features in the frontier never meet.
  const onRiver = new Set();
  for (const p of riverPath()) {
    const f = forestAt(p.x, p.y);
    if (f) onRiver.add(f.id);
  }
  if (onRiver.size === 0) fail("the Coldwater runs through open ground for its whole length");
  else console.log(`  the Coldwater runs past ${[...onRiver].join(", ")}`);
}

// --- The table itself ----------------------------------------------------------

section("the table");
{
  const seen = new Set();
  for (const f of FORESTS) {
    if (seen.has(f.id)) fail(`two woods share the id "${f.id}"`);
    seen.add(f.id);
    if (forestById(f.id) !== f) fail(`forestById("${f.id}") does not find it`);
    if (!f.name || f.name.length < 4) fail(`${f.id} has no name`);
    if (!f.blurb || f.blurb.length < 60) fail(`${f.id} has no blurb worth reading`);
    if (f.perBlock <= 0) fail(`${f.id} has no trees in it`);
  }
  if (FOREST_IDS.length !== FORESTS.length) fail("FOREST_IDS is out of step with FORESTS");

  // Two woods that overlap heavily read as one wood with two names, which makes
  // both names worthless.
  for (let i = 0; i < FORESTS.length; i++) {
    for (let j = i + 1; j < FORESTS.length; j++) {
      const a = FORESTS[i];
      const b = FORESTS[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < (a.radiusPx + b.radiusPx) * 0.92) {
        fail(`${a.name} and ${b.name} overlap — ${d.toFixed(0)}px apart`);
      }
    }
  }
  console.log(`  ${FORESTS.length} woods, all named, all distinct, none overlapping`);

  // How much of the world is wooded. A regression guard rather than a rule: the
  // number is only wrong when somebody doubles a radius without meaning to, and
  // then it is wrong by a lot.
  let hits = 0;
  let total = 0;
  for (let x = 0; x < WORLD_WIDTH; x += 100) {
    for (let y = 0; y < WORLD_HEIGHT; y += 100) {
      total++;
      if (forestStrengthAt(x, y) > 0.05) hits++;
    }
  }
  const pct = (100 * hits) / total;
  if (pct < 8 || pct > 40) fail(`${pct.toFixed(1)}% of the world is wooded — outside the 8–40% band`);
  else console.log(`  ${pct.toFixed(1)}% of the map is under canopy`);

  // The edge has to be ragged, or a wood is a disc and reads as one. Measured
  // rather than asserted by eye: sweep the bearing round each wood and look at
  // the spread of where the canopy actually ends.
  for (const f of FORESTS) {
    let min = Infinity;
    let max = 0;
    for (let a = 0; a < 360; a += 6) {
      const dx = Math.cos((a * Math.PI) / 180);
      const dy = Math.sin((a * Math.PI) / 180);
      let edge = 0;
      for (let r = f.radiusPx * 1.3; r > 0; r -= f.radiusPx * 0.02) {
        if (forestStrengthAt(f.x + dx * r, f.y + dy * r) > 0.15) {
          edge = r;
          break;
        }
      }
      min = Math.min(min, edge);
      max = Math.max(max, edge);
    }
    const spread = (max - min) / f.radiusPx;
    if (spread < 0.2) fail(`${f.name}'s outline varies by only ${(spread * 100).toFixed(0)}% — it is a disc`);
  }
  console.log("  every outline is ragged rather than circular");
}

// --- The names actually reach somebody -----------------------------------------

section("where you are");
{
  // A wood with a name nothing ever says is a texture with a comment on it.
  // `placeNameAt` is the one channel, so every name in the table has to come
  // out of it somewhere.
  const named = new Set();
  for (let x = 0; x < WORLD_WIDTH; x += 90) {
    for (let y = 0; y < WORLD_HEIGHT; y += 90) {
      const n = placeNameAt(x, y);
      if (n) named.add(n);
    }
  }
  for (const f of FORESTS) {
    if (!named.has(f.name)) fail(`${f.name} is never reported as a place`);
  }
  for (const want of [TOWN_NAME, RIVER_NAME, "The North Road"]) {
    if (!named.has(want)) fail(`"${want}" is never reported as a place`);
  }
  console.log(`  ${named.size} named places reachable, including all ${FORESTS.length} woods`);

  // And most of the map is NOT anywhere, which is what makes the rest mean
  // something.
  let anywhere = 0;
  let total = 0;
  for (let x = 0; x < WORLD_WIDTH; x += 200) {
    for (let y = 0; y < WORLD_HEIGHT; y += 200) {
      total++;
      if (placeNameAt(x, y)) anywhere++;
    }
  }
  const pct = (100 * anywhere) / total;
  if (pct > 45) fail(`${pct.toFixed(0)}% of the world has a name — the names stop being places`);
  else console.log(`  ${pct.toFixed(0)}% of the world is somewhere; the rest is open country`);

  // The most specific true thing wins. Standing on the bridge is not "in
  // Pinereach" and not "on the North Road".
  const b = bridgeAt();
  const onIt = placeNameAt(b.x, b.y);
  if (!onIt || !onIt.includes("Bridge")) fail(`standing on the bridge reports "${onIt}"`);
  else console.log(`  standing on the bridge says "${onIt}"`);
  if (placeNameAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y) !== TOWN_NAME) {
    fail("spawn does not report Emberhold");
  }
}

console.log(failures === 0 ? "\nOK — the woods check out." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
