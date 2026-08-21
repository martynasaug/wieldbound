// Everything that lies on the ground has to lie on the ground you can SEE.
//
// This project has now had the same argument four times, one level down each
// time: the crossing (M54.1a), the feet (M55.3), the contact shade and the pool
// of light (M56.1), and the marks drawn on the floor (M59.1). Every one of them
// was two answers to "where is the ground", every one was found by a person
// walking into it, and none of them threw.
//
// There are exactly two ways to get it wrong and this suite checks both.
//
//   THE WRONG DATUM. `terrainHeight` is a smooth analytic field; the ground you
//   are looking at is that field sampled on a 1.63-unit grid and joined with
//   flat triangles, which rides ABOVE it wherever the land is concave. Anything
//   placed on the field and lifted a few centimetres is inside the hill.
//
//   NO DATUM AT ALL. Five skill shapes were drawn at a literal y = 0, which was
//   correct for exactly as long as the ground was a plane and has been wrong
//   since Phase 53 gave it relief.
//
// It is a SOURCE test, like `forests.mjs` reading the real model tables and
// `ambience.mjs` enforcing the rule its own first paragraph states. There is no
// way to import `indicators.ts` or `Game.ts` from Node — they pull in three.js —
// and the failure being guarded against is a call site reading the wrong name,
// which is visible in the text and invisible everywhere else.
//
//   node tools/test/ground.mjs

import { readFileSync } from "node:fs";
import {
  surfaceHeight,
  terrainHeight,
  toWorldX,
  toWorldZ,
} from "../../client/src/three/heightfield.ts";
import { PLAYER_SPAWN, RESOURCE_BAND_RADII } from "../../shared/protocol-types.ts";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n== ${name} ==`);
const src = (p) => readFileSync(new URL(`../../client/src/three/${p}`, import.meta.url), "utf8");

const USES_TERRAIN = /\bterrainHeight\s*\(/;
const USES_SURFACE = /\bsurfaceHeight\s*\(/;

// --- Who must stand on the drawn surface, and who may not --------------------
//
// The allow-list is the interesting half. `terrainHeight` is not a bug — it is
// the right answer for two specific things, and both say so in their own files.
// What makes this a test rather than a style rule is that every exception has to
// carry a REASON, so the next person to reach for the smooth field has to
// justify it here rather than in a diff nobody reads.

section("the datum");

const MUST_USE_SURFACE = {
  "indicators.ts": "the rings you select, reach and dodge by lie flat on the floor",
  "npcs.ts": "townspeople stand where players stand",
  "contact.ts": "the shade under a body is on the ground the body is on",
  "presence.ts": "and so is the pool of light",
  "road.ts": "the ribbon IS the ground, and disagreeing with it is how a bridge got walked through",
};

const MAY_USE_TERRAIN = {
  // Both of these are documented at length in their own files.
  "ambience.ts": "a dragonfly over the Coldwater belongs over the WATER, not over the bridge deck",
  "mist.ts": "mist lies in the channel, not on the planks above it",
  // Rooted scenery: a plant grows OUT of the ground, so a few centimetres under
  // the drawn mesh is what rooted looks like rather than a fault.
  "scatter.ts": "a plant is rooted, and being slightly sunk is what rooted looks like",
  "forest.ts": "and so is a tree",
  "waystones.ts": "a standing stone is set INTO the ground, which is why it is standing",
  "LoginBackdrop.ts": "the title screen has its own miniature terrain and no drawn mesh to agree with",
};

for (const [file, why] of Object.entries(MUST_USE_SURFACE)) {
  const text = src(file);
  const terrain = USES_TERRAIN.test(text);
  const surface = USES_SURFACE.test(text);
  if (terrain) fail(`${file} reads terrainHeight — ${why}`);
  if (!surface) fail(`${file} never reads surfaceHeight — ${why}`);
  if (!terrain && surface) console.log(`  ${file}: surfaceHeight — ${why}`);
}

// And an exception that has stopped being needed should be retired rather than
// left standing as permission nobody is using.
for (const [file, why] of Object.entries(MAY_USE_TERRAIN)) {
  if (!USES_TERRAIN.test(src(file))) {
    console.log(`  ${file}: no longer reads terrainHeight — this exception can be retired (${why})`);
  }
}
console.log(`  ${Object.keys(MAY_USE_TERRAIN).length} documented exceptions, each with a reason`);

// --- Nothing is drawn at sea level ------------------------------------------

section("sea level");
{
  const game = src("Game.ts");
  // A skill shape taking a literal 0 for its Y. This is the exact defect, in
  // the exact form it had: `this.skillFx.nova(at.x, 0, at.z, ...)`.
  const calls = [...game.matchAll(/this\.skillFx\.(nova|ground|cone|pillar|rain)\(([\s\S]*?)\);/g)];
  for (const m of calls) {
    const args = m[2].replace(/\s+/g, " ");
    if (/,\s*0\s*,/.test(args)) fail(`skillFx.${m[1]} is still drawn at a literal y = 0`);
  }
  if (calls.length < 5) {
    fail(`only ${calls.length} ground-shaped skill effects found — expected at least 5`);
  } else if (failures === 0) {
    console.log(`  ${calls.length} ground-shaped skill effects, every one of them given a height`);
  }
}

// --- And the rule is load-bearing, which is the half that keeps it honest ----
//
// Every assertion above is vacuous if the two height functions happen to agree.
// They do not, and the size of the disagreement is the whole reason any of this
// matters — so it is measured rather than asserted from memory. If the terrain
// mesh ever became fine enough that the gap closed, this section fails and
// somebody gets to delete the rule on purpose rather than by accident.

section("why it matters");
const CX = toWorldX(PLAYER_SPAWN.x);
const CZ = toWorldZ(PLAYER_SPAWN.y);
const OUTER = RESOURCE_BAND_RADII[RESOURCE_BAND_RADII.length - 1] / 40;
{
  let n = 0;
  let above = 0;
  let worstGap = 0;
  let offSeaLevel = 0;
  let deepOffSeaLevel = 0;
  for (let r = 3; r <= OUTER; r += 1.5) {
    for (let a = 0; a < 360; a += 3) {
      const x = CX + Math.cos((a * Math.PI) / 180) * r;
      const z = CZ + Math.sin((a * Math.PI) / 180) * r;
      const drawn = surfaceHeight(x, z);
      const field = terrainHeight(x, z);
      n++;
      const gap = drawn - field;
      if (gap > 0.001) above++;
      worstGap = Math.max(worstGap, gap);
      if (Math.abs(drawn) > 0.5) offSeaLevel++;
      if (Math.abs(drawn) > 1.0) deepOffSeaLevel++;
    }
  }

  const abovePct = (100 * above) / n;
  const offPct = (100 * offSeaLevel) / n;
  console.log(
    `  the drawn ground rides above the field across ${abovePct.toFixed(1)}% of the play area, ` +
      `by up to ${worstGap.toFixed(3)} units`,
  );
  console.log(
    `  and sits more than 0.5 units off sea level across ${offPct.toFixed(1)}%, ` +
      `more than 1.0 across ${((100 * deepOffSeaLevel) / n).toFixed(1)}% (a character is 1.8 tall)`,
  );
  if (abovePct < 5) fail("the drawn ground barely differs from the field — the datum rule is vacuous");
  if (worstGap < 0.05) fail(`the worst gap is ${worstGap.toFixed(3)} — too small to matter`);
  if (offPct < 10) fail("the ground is nearly flat — the sea-level rule is vacuous");
}

// --- A flat quad is a chord, and at these radii a tilt does not save it ------
//
// This is the measurement that chose per-vertex placement over the single tilt
// the contact shade uses, and it is here so that "simplifying" the rings back to
// a tilted quad fails loudly instead of quietly re-burying the telegraph.

section("a flat mark on ground that is not flat");
{
  const MAX_SLOPE = 1.2;

  const worstOn = (x, z, radius, mode) => {
    const centre = surfaceHeight(x, z);
    const w = radius * 2;
    const gx = Math.max(
      -MAX_SLOPE,
      Math.min(MAX_SLOPE, (surfaceHeight(x + radius, z) - surfaceHeight(x - radius, z)) / w),
    );
    const gz = Math.max(
      -MAX_SLOPE,
      Math.min(MAX_SLOPE, (surfaceHeight(x, z + radius) - surfaceHeight(x, z - radius)) / w),
    );
    let worst = 0;
    for (let a = 0; a < 360; a += 10) {
      const dx = Math.cos((a * Math.PI) / 180) * radius;
      const dz = Math.sin((a * Math.PI) / 180) * radius;
      const ground = surfaceHeight(x + dx, z + dz);
      const drawn = mode === "flat" ? centre : mode === "tilt" ? centre + gx * dx + gz * dz : ground;
      worst = Math.max(worst, ground - drawn);
    }
    return worst;
  };

  const percentile = (values, p) => {
    const s = [...values].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };

  const sweep = (radius, mode) => {
    const v = [];
    for (let r = 3; r <= OUTER; r += 2.2) {
      for (let a = 0; a < 360; a += 7) {
        v.push(worstOn(CX + Math.cos((a * Math.PI) / 180) * r, CZ + Math.sin((a * Math.PI) / 180) * r, radius, mode));
      }
    }
    return v;
  };

  // The radii the game actually draws: a target ring round a body, a slam
  // telegraph, and a caster's reach.
  const tilts = {};
  for (const [name, radius] of [
    ["a target ring", 0.6],
    ["a slam telegraph", 2.5],
    ["a caster's reach", 5.0],
  ]) {
    const f95 = percentile(sweep(radius, "flat"), 0.95);
    const t95 = percentile(sweep(radius, "tilt"), 0.95);
    const o95 = percentile(sweep(radius, "follow"), 0.95);
    tilts[radius] = t95;
    console.log(
      `  ${name} (r=${radius}): buried at p95 — flat ${f95.toFixed(3)}, tilted ${t95.toFixed(3)}, ` +
        `on the ground ${o95.toFixed(3)}`,
    );
    // Following the ground has to be exact, or the vertices are not on it.
    if (o95 > 0.001) fail(`${name} laid per-vertex is still ${o95.toFixed(3)} buried`);
    // And the cheap option has to be genuinely worse, or the expensive one is
    // not worth its cost and this decision should be revisited rather than kept.
    if (f95 <= 0.05) fail(`${name} drawn flat is only ${f95.toFixed(3)} buried — a flat quad would do`);
  }

  // The one that decided it: a tilt is enough for something small and is not
  // enough for something big. If that ever stops being true, the contact
  // shade's single tilt and these rings should be reconsidered together.
  console.log(
    `  a single tilt: ${tilts[0.6].toFixed(3)} buried at r=0.6, ${tilts[5.0].toFixed(3)} at r=5.0`,
  );
  if (tilts[5.0] < tilts[0.6] * 4) {
    fail("a tilt is now as good on a wide ring as on a narrow one — per-vertex may no longer be needed");
  }
}

console.log(failures === 0 ? "\nOK — everything on the ground is on the ground." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
