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

/**
 * The same file with its comments taken out.
 *
 * Needed because this suite greps for CALLS, and the first version of it failed
 * twice against a working game by matching the prose that explains the calls —
 * once on the sentence inside `maybeFlinch` describing what it does, and once
 * on a comment in `onHpUpdate` saying the reaction is no longer driven from
 * there. A ruler that reads comments is measuring the documentation.
 */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * The body of a named method, by COUNTING BRACES.
 *
 * The obvious `/name[\s\S]*?\n  }/` is wrong and quietly so: it is non-greedy,
 * so it stops at the first line that happens to be a closing brace at that
 * indent — which in `onHpUpdate` is well before the end. A mutation putting the
 * flinch back into it was applied, confirmed present in the file, and the suite
 * still passed. Counting is the only thing that actually knows where a function
 * ends.
 */
function bodyOf(source, name) {
  const at = source.indexOf(name);
  if (at < 0) return null;
  const open = source.indexOf("{", source.indexOf(")", at));
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

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
  ["cast", "all forty-three skills animated as your weapon's basic swing"],
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

// --- The hit reaction is GATED ---------------------------------------------
// The one-shot that acknowledges being hit is also a one-shot that INTERRUPTS,
// so an ungated one is a stun-lock wearing a courtesy's clothes. The player's
// was `play("hit")` on any HP decrease at all — measured at 3.1 a second for a
// burning character in a pack of three wolves, each one cancelling their swing.
//
// Neither call may be a bare `play("hit")` again.

console.log("\n== the hit reaction is gated ==");
{
  // Everything except `maybeFlinch`'s own body, which is the one place allowed
  // to play it — that IS the gate.
  const gameCode = code(game);
  const gate = bodyOf(gameCode, "private maybeFlinch") ?? "";
  const outsideGate = gameCode.replace(gate, "");
  const bare = [...outsideGate.matchAll(/\bplay\(\s*"hit"\s*\)/g)].length;
  if (bare > 0) {
    fail(
      `${bare} play("hit") call(s) outside maybeFlinch — a hit reaction interrupts, so an ` +
        `ungated one stun-locks whoever it is meant to be acknowledging`,
    );
  } else {
    console.log("  nothing plays it directly; every call goes through maybeFlinch");
  }

  if (!/private maybeFlinch/.test(gameCode)) {
    fail("there is no maybeFlinch — nothing is rate-limiting the hit reaction");
  }
  // A cooldown is the gate both sides share, and it is the whole fix for the
  // player. Without it the share threshold alone lets a level-1 character be
  // locked by a burn tick, which is 12% of fifty health.
  if (!/FLINCH_COOLDOWN_MS/.test(gameCode)) fail("the hit reaction has no cooldown");

  // And it must be driven from real BLOWS, not from HP deltas — that is what
  // keeps damage-over-time from staggering anybody, categorically rather than
  // by hoping a tick falls under a threshold.
  const hpUpdate = bodyOf(gameCode, "private onHpUpdate");
  if (!hpUpdate) fail("could not find onHpUpdate to check it");
  else if (/maybeFlinch|play\(\s*"hit"/.test(hpUpdate)) {
    fail(
      "onHpUpdate drives the hit reaction — that catches every damage-over-time " +
        "tick, and you do not stagger from a burn",
    );
  } else {
    console.log("  driven from blows, so a burn tick never staggers anybody");
  }
}

// --- A skill is posed by what it IS ----------------------------------------
// One `play("attack")` served all forty-three, so a sword user pressing Mend
// did a sword swing. The rule that replaced it lives in `shared/` and is
// derived, so the thing worth checking is the rule rather than a table.

console.log("\n== swung or cast ==");
{
  const { SKILLS, skillIsCast } = await import("../../shared/protocol-types.ts");
  const all = Object.values(SKILLS);

  // Nothing you do at arm's length may be cast — Execute and Cleave are things
  // you do with the object in your hand.
  for (const s of all) {
    if (s.kind === "mobility") continue;
    if (s.kind === "heal" || s.kind === "buff") continue;
    if (s.rangePx < 100 && skillIsCast(s, "sword")) {
      fail(`${s.id} lands at ${s.rangePx}px and is cast — that is a swing`);
    }
  }

  // A heal or a buff is never a swing, whatever is in your hands. Checked
  // across every family, because the pose reads the weapon too.
  for (const s of all) {
    if (s.kind !== "heal" && s.kind !== "buff") continue;
    for (const w of ["sword", "axe", "mace", "dagger", "bow", "staff", "wand", "fist"]) {
      if (!skillIsCast(s, w)) fail(`${s.id} is a ${s.kind} and is swung while holding a ${w}`);
    }
  }

  // A BOW IS ITS OWN DELIVERY. Archery must never be a spell cast — the draw is
  // the right animation and casting one to fire an arrow is the same mistake in
  // reverse.
  const archery = all.filter(
    (s) => s.kind !== "mobility" && s.kind !== "heal" && s.kind !== "buff" && s.rangePx >= 200,
  );
  for (const s of archery) {
    if (skillIsCast(s, "bow")) fail(`${s.id} is cast while holding a bow — a bow looses arrows`);
  }
  // And the same skills MUST be cast with a staff, or the weapon is not
  // changing anything and the rule is decoration.
  const differ = archery.filter((s) => skillIsCast(s, "staff") && !skillIsCast(s, "bow"));
  if (differ.length === 0) {
    fail("no skill poses differently for a bow than for a staff — the weapon is not being read");
  }

  // A mobility skill is neither: it rolls.
  for (const s of all) {
    if (s.kind === "mobility" && skillIsCast(s, "sword")) fail(`${s.id} is a dash and is cast`);
  }

  const cast = all.filter((s) => s.kind !== "mobility" && skillIsCast(s, "sword")).length;
  console.log(`  holding a sword: ${cast} cast, ${all.length - cast - 2} swung, 2 rolled`);
  console.log(`  ${differ.length} skill(s) a bow looses that a staff casts`);
}

console.log(failures === 0 ? "\nOK — every state binds, and something plays it." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
