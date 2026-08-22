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

// --- A conditional you can see ----------------------------------------------
// Eight skills READ a status rather than applying one, for up to 140% more
// damage. Playing them means knowing the condition is met AT THE MOMENT OF
// PRESSING, and the only feedback used to arrive afterwards — an amber flash on
// a hit you had already committed. The bar lights the slot now.
//
// Both halves fail silently: a skill whose condition nothing in the game can
// produce is a skill that never lights, and a bar that is never told the
// statuses lights nothing at all.

console.log("\n== a conditional you can see ==");
{
  const { SKILLS, STATUSES, statusGroupIds, readCovers } = await import(
    "../../shared/protocol-types.ts"
  );
  const hotbar = readFileSync(new URL("../../client/src/ui/Hotbar.ts", import.meta.url), "utf8");

  const readers = Object.values(SKILLS).filter((s) => s.reads);
  if (readers.length === 0) fail("no skill reads a status any more");

  // Everything anything in the game can put on a body.
  const producible = new Set(Object.values(SKILLS).map((s) => s.applies).filter(Boolean));
  for (const id of ["weakened", "enraged", "recovering"]) producible.add(id);
  for (const m of Object.values(
    (await import("../../shared/protocol-types.ts")).MONSTER_STATS,
  )) {
    if (m.inflicts?.status) producible.add(m.inflicts.status);
  }

  for (const s of readers) {
    // What would satisfy it.
    const candidates = s.reads.any
      ? s.reads.any
      : s.reads.group
        ? statusGroupIds(s.reads.group)
        : Object.keys(STATUSES);
    const reachable = candidates.filter((c) => producible.has(c));
    if (reachable.length === 0) {
      fail(
        `${s.id} reads [${candidates.join(", ")}] and nothing in the game can apply any of ` +
          `them — the slot will never light and the bonus can never be spent`,
      );
    }
    // And whatever it reads must be able to sit on what it targets, or the
    // condition is unreachable for a second reason.
    for (const c of reachable) {
      if (!readCovers(s.reads, c)) fail(`${s.id} does not actually cover ${c}`);
    }
  }
  console.log(`  ${readers.length} skills read a status, every one of them reachable`);

  // The bar has to be TOLD, and it has to look at the right place: a self-read
  // checks your own statuses and a target-read checks the target's. Getting
  // that backwards lights every slot at the wrong moment.
  if (!/setConditions/.test(hotbar)) fail("the hotbar is never told what conditions are met");
  if (!/findRead/.test(hotbar)) fail("the hotbar does not use findRead to decide — it is guessing");
  if (!/read\.on === "self"/.test(hotbar)) {
    fail("the hotbar does not separate a self-read from a target-read");
  }
  const game = readFileSync(new URL("../../client/src/three/Game.ts", import.meta.url), "utf8");
  // Anchored on the RECEIVER, because a bare `setConditions\(` still matches
  // `noop_setConditions(` — which is exactly how the mutation for this check
  // slipped past it the first time it was written.
  if (!/\bhotbar\.setConditions\(/.test(game)) {
    fail("nothing ever calls hotbar.setConditions — the bar lights nothing");
  }
  console.log("  the bar is told every frame, and reads self and target separately");
}

// --- A skill has to LOOK like a skill ---------------------------------------
// Every skill draws the school's impact burst on whatever it lands on — and so
// does an ordinary auto-attack. So a skill whose only visual is that burst is
// one the player cannot tell they pressed, which for a 140% multiplier is a
// problem: Backstab, Exploit, Gut Punch, Concuss, Stagger and Expose all looked
// exactly like a swing.
//
// `shape: "none"` is still legitimate — for anything RANGED, because M64.1 gave
// those a real projectile that leaves your hands, and for a dash, which is a
// roll and a change of position. What may not happen is a melee skill drawing
// nothing of its own.

console.log("\n== a skill looks like a skill ==");
{
  const { SKILLS, CAST_RANGE_FLOOR_PX } = await import("../../shared/protocol-types.ts");
  const skillfx = readFileSync(new URL("../../client/src/three/skillfx.ts", import.meta.url), "utf8");
  const table = skillfx.match(/export const SKILL_FX[\s\S]*?\n\};/);
  if (!table) fail("could not find SKILL_FX");
  const shapeOf = Object.fromEntries(
    [...(table?.[0] ?? "").matchAll(/^\s+(\w+):\s*\{\s*shape:\s*"(\w+)"/gm)].map((m) => [m[1], m[2]]),
  );

  let silent = 0;
  for (const s of Object.values(SKILLS)) {
    const shape = shapeOf[s.id];
    if (!shape) {
      fail(`${s.id} has no entry in SKILL_FX at all`);
      continue;
    }
    if (shape !== "none") continue;
    // Ranged draws a projectile; a dash draws a roll.
    if (s.rangePx >= CAST_RANGE_FLOOR_PX) continue;
    if (s.kind === "mobility") continue;
    silent++;
    fail(
      `${s.id} lands at ${s.rangePx}px and draws no shape of its own — it is ` +
        `indistinguishable from an ordinary swing`,
    );
  }
  if (silent === 0) console.log("  every melee skill draws something an auto-attack does not");

  // And the two shapes that carry a MEANING have to keep it. The four
  // debuff-appliers share one signature deliberately, exactly as the eight
  // readers share an amber cast: what a player has to learn is "a condition
  // just landed", and four unrelated signatures would teach them nothing.
  // SINGLE-TARGET only. Frost Nova rings outward and Rend sweeps a wedge —
  // both apply a debuff and both are AREA skills, whose shape is telling you
  // where it landed rather than what it did. The shared signature is for the
  // ones that put a condition on ONE body, which is the case where nothing else
  // distinguishes them from a swing.
  const appliers = Object.values(SKILLS).filter(
    (s) =>
      s.applies &&
      s.kind !== "buff" &&
      s.kind !== "heal" &&
      s.rangePx < CAST_RANGE_FLOOR_PX &&
      s.radiusPx === 0,
  );
  // What matters is that the mark IS a shared vocabulary rather than one
  // skill's decoration — not that every applier is forced into it. Rend is a
  // slash that happens to bleed, and its cone is a signature of its own that is
  // already unmistakable from a swing; demanding it join the ring would be the
  // rule over-reaching into a case it was not written for.
  const marks = appliers.filter((s) => shapeOf[s.id] === "mark");
  if (appliers.length > 1 && marks.length < 2) {
    fail(
      `only ${marks.length} single-target melee applier uses the inward ring — ` +
        `a signature one skill wears is decoration, not a vocabulary`,
    );
  }
  console.log(
    `  ${marks.length} of ${appliers.length} single-target melee appliers share the inward ring`,
  );

  // Every shape named in the table must be one the renderer can actually draw.
  // Matched per shape rather than by scraping every method signature: `cone`
  // declares its parameters across several lines, so a pattern anchored on
  // `name(x: number` cannot see it and reported a shape the renderer draws
  // perfectly well as undrawable.
  for (const shape of new Set(Object.values(shapeOf))) {
    if (shape === "none" || shape === "chain") continue;
    if (!new RegExp(`^  ${shape}\\(`, "m").test(skillfx)) {
      fail(`SKILL_FX names the shape "${shape}" and SkillFx cannot draw it`);
    }
  }
  console.log(`  ${[...new Set(Object.values(shapeOf))].length} distinct shapes, all drawable`);
}

console.log(failures === 0 ? "\nOK — every state binds, and something plays it." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
