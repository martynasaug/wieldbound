// Every animation state the body can be in has to be bound AND played.
//
// M55.1 pooled twenty-five clips off five rigs — "every attack, cast, draw,
// punch, roll, pickup, death, hit reaction, idle, walk and run a person in this
// world can perform" — and the game bound six of them. `Roll` and `PickUp` sat
// in the library for ten phases and nothing ever asked for them, so a dash was
// a character sliding sideways in its running pose and taking a thing off the
// ground was walking over it.
//
// That failure is completely silent. A state nobody plays is not a bug, it is
// an absence, and an absence looks exactly like a decision.
//
// A SOURCE test, because the binding happens behind three.js and an FBX loader
// and Node can load neither — and because what actually went wrong is visible
// in the text: a name in a type union with no call site.
//
//   node tools/test/animation.mjs

import { readFileSync } from "node:fs";

let failures = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failures++;
};
const src = (p) => readFileSync(new URL(`../../client/src/three/${p}`, import.meta.url), "utf8");

const actor = src("Actor.ts");
const game = src("Game.ts");
const npcs = src("npcs.ts");

// --- The states ------------------------------------------------------------

console.log("== the states ==");
const union = actor.match(/export type ActorAnim =([\s\S]*?);/);
if (!union) {
  fail("could not find the ActorAnim union");
  process.exit(1);
}
const states = [...union[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
if (states.length === 0) fail("ActorAnim has no states in it");
console.log(`  ${states.length}: ${states.join(", ")}`);

// --- Every state is BOUND, twice over --------------------------------------
// Monsters and townspeople bind from `CLIP_PREFERENCES`; a player binds from
// `playerClipsFor`, because a player is the only actor whose animation set has
// to change without its model doing so. A state missing from either is a state
// that silently does nothing for half the things in the world.

const prefs = actor.match(/const CLIP_PREFERENCES[\s\S]*?\n};/);
const forPlayer = actor.match(/private playerClipsFor[\s\S]*?\n  }/);
if (!prefs) fail("could not find CLIP_PREFERENCES");
if (!forPlayer) fail("could not find playerClipsFor");

for (const state of states) {
  if (prefs && !new RegExp(`(^|\\s)${state}:`, "m").test(prefs[0])) {
    fail(`${state} has no row in CLIP_PREFERENCES — monsters and townspeople cannot enter it`);
  }
  if (forPlayer && !new RegExp(`case "${state}":`).test(forPlayer[0])) {
    fail(`${state} has no case in playerClipsFor — a player cannot enter it`);
  }
}
if (failures === 0) console.log("  every state binds for players and for everything else");

// --- And every state is PLAYED ---------------------------------------------
// The rule this suite exists for. `Roll` and `PickUp` were bound-able the whole
// time; what they were missing was a caller.

console.log("\n== who plays what ==");
const everywhere = game + npcs + actor;
for (const state of states) {
  const calls = [...everywhere.matchAll(new RegExp(`play\\(\\s*"${state}"`, "g"))].length;
  if (calls === 0) {
    fail(
      `nothing anywhere plays "${state}" — the clip is harvested, bound, and ` +
        `unreachable, which looks exactly like a decision not to have it`,
    );
  } else {
    console.log(`  ${state.padEnd(7)} ${calls} call site(s)`);
  }
}

// --- The two that were missing ---------------------------------------------
// Named outright, because they are the reason this file exists and a regression
// would be a silent return to sliding dashes and invisible pickups.

console.log("\n== the ones that were missing ==");
for (const [state, why] of [
  ["roll", "a dash was a character sliding sideways in its running pose"],
  ["pickup", "taking a thing off the ground was walking over it"],
]) {
  if (!states.includes(state)) fail(`${state} is not a state any more — ${why}`);
  else console.log(`  ${state}: present and played — ${why}`);
}

// A roll must survive being interrupted by movement, which is the one thing
// every other one-shot is deliberately cancelled by. Without this the clip
// plays for a single frame and the dash looks exactly as it did before.
if (!/currentAnim === "roll"/.test(actor)) {
  fail("nothing protects a roll from being cancelled by the movement it causes");
} else {
  console.log("  a roll survives the running it causes");
}

console.log(failures === 0 ? "\nOK — every state binds, and something plays it." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
