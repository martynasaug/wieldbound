// THE SLIDE: a character that translates across the ground with no animation.
//
// Reported four times. M70.22 and M70.23 fixed a genuine WebGL context-loss bug
// that fits every detail of the report, and the report survived both — so this
// file stops arguing about the cause and pins down the one mechanism in the
// animation state machine that can produce the symptom on its own, forever,
// with nothing in the console.
//
// `Actor.play` is six early returns and every one of them is a deliberate,
// silent no-op. Five are bounded: they stop being true when a clip ends, or
// when the state being asked for stops matching the state you are in. ONE is
// not. `play("die")` sets `oneShotUntil` to `Number.MAX_SAFE_INTEGER`, and
// `busy` is a plain `performance.now() < this.oneShotUntil` — so while
// `currentAnim` is "die", every play("idle"/"walk"/"run") returns without a
// word, for the rest of the session. `stepMovement` goes on writing the
// position regardless, which is the slide exactly.
//
// What makes it invisible rather than merely bad: nothing throws, nothing warns,
// the mixer keeps being updated through a `?.`, and `play("run")` is called
// every frame in the locked case and the healthy case alike.
//
//   node tools/test/sliding.mjs

import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const actor = read("client/src/three/Actor.ts");
const game = read("client/src/three/Game.ts");

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
}
function section(t) { console.log(`\n${t}`); }

// --- 1. the lock exists, and is unbounded -----------------------------------
section("1. the mechanism");
check(
  'play("die") arms a one-shot that never expires',
  /anim === "die"\s*\)\s*\{\s*\r?\n\s*this\.oneShotUntil = Number\.MAX_SAFE_INTEGER;/.test(actor),
);
check(
  "busy is a plain clock compare, so that sentinel can never age out",
  /const busy = performance\.now\(\) < this\.oneShotUntil;/.test(actor),
);
check(
  'and every base state is gated behind it while currentAnim is "die"',
  /if \(busy && this\.currentAnim === "die"\) return;/.test(actor),
);

// --- 2. the state machine, modelled exactly ---------------------------------
// The guard chain is copied from `play` rather than imported, because Actor.ts
// cannot be loaded under Node (three.js, an FBX loader and a GPU). If the source
// above stops matching, section 1 fails and this model is known to be stale.
section("2. what the lock does over a real minute of held movement");
class Machine {
  constructor() {
    this.currentAnim = "idle"; this.baseAnim = "idle";
    this.oneShotUntil = 0; this.now = 1000;
    this.actions = new Set(["idle", "walk", "run", "die", "attack", "hit"]);
    this.played = [];
  }
  play(anim, immediate = false) {
    if (anim === "idle" || anim === "walk" || anim === "run") {
      this.baseAnim = anim;
      const busy = this.now < this.oneShotUntil;
      if (busy && anim === "idle") return;
      if (busy && this.currentAnim === "die") return;
      if (busy && this.currentAnim === "roll") return;
      if (busy) this.oneShotUntil = 0;
    }
    if (this.currentAnim === anim && !immediate) return;
    if (!this.actions.has(anim)) return;
    this.currentAnim = anim;
    this.played.push(anim);
    this.oneShotUntil = anim === "die" ? Number.MAX_SAFE_INTEGER : 0;
  }
  unstick() {
    this.oneShotUntil = 0;
    const target = this.baseAnim === "die" ? "idle" : this.baseAnim;
    this.play(target, true);
    return this.actions.has(target);
  }
}

const m = new Machine();
m.play("die");
check("a defeat locks the machine", m.currentAnim === "die");
m.played = [];
for (let f = 0; f < 3600; f++) { m.now += 16; m.play("run"); }
check(
  "60s of held movement plays nothing at all",
  m.played.length === 0 && m.currentAnim === "die",
  `played ${m.played.length}, currentAnim ${m.currentAnim}`,
);
console.log(`  3600 frames of play("run") after a death: ${m.played.length} animations started`);

// An ordinary attack must NOT behave this way, or the guard is simply broken.
const ok2 = new Machine();
ok2.play("run");
ok2.play("attack");
ok2.oneShotUntil = ok2.now + 900;
ok2.played = [];
ok2.now += 1000;
ok2.play("run");
check("an expired ordinary one-shot hands control back", ok2.currentAnim === "run");

// --- 3. the recovery --------------------------------------------------------
section("3. unstick");
check("reports success when the base state is bound", m.unstick() === true);
check("and the machine animates again", m.currentAnim === "run", m.currentAnim);
m.play("idle");
check("idle is reachable again too", m.currentAnim === "idle");

// --- 4. the two call sites that must stay honest ----------------------------
section("4. the code that has to keep this true");
check(
  "Actor exposes a pose clock the loop can watch",
  /poseClock\(\): number/.test(actor),
);
check(
  "Actor exposes the locked state for a log line",
  /animationState\(\): Record<string, unknown>/.test(actor),
);
check(
  "the loop watches for the symptom every frame",
  /this\.watchForSlide\(dt\);/.test(game) && /private watchForSlide\(/.test(game),
);
// The regression that would silently reintroduce a permanent lock: making the
// client's own recovery conditional on the server's respawn payload again.
//
// Brace-matched rather than measured in characters. A first version of this
// check compared string offsets against a fixed slice and PASSED when the
// recovery was deliberately moved back inside the guard — a test that cannot
// fail is worse than no test, because it is also a claim.
const guardAt = game.indexOf("if (p.x !== undefined && p.y !== undefined) {");
check("the respawn-coordinate guard is where it is expected", guardAt > -1);
let end = -1;
if (guardAt > -1) {
  let depth = 0;
  for (let i = game.indexOf("{", guardAt); i < game.length; i++) {
    if (game[i] === "{") depth++;
    else if (game[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
}
const insideGuard = guardAt > -1 && end > -1 && game.slice(guardAt, end).includes("revive()");
check(
  "revive() is NOT scheduled inside the respawn-coordinate guard",
  !insideGuard,
  "a defeat without coordinates would lock the character forever",
);
check(
  "revive() is still scheduled somewhere in the defeat branch",
  game.includes("setTimeout(() => this.localActor?.revive(), 900);"),
);

// --- 5. the run action must never be left disabled --------------------------
// A RUNTIME test, unlike the rest of this file, because three.js's animation
// system is pure JavaScript and needs no GPU — so the actual bug can be
// reproduced against the actual library rather than argued about from source.
//
// The mechanism: `reset()` is the only call that sets `AnimationAction.enabled`
// back to true, and `play` deliberately skips it for "run" so that a resumed
// stride carries on from where it was instead of snapping to frame zero. But
// three.js turns that flag OFF on its own — `_updateWeight` sets
// `enabled = false` on an action whose crossfade-out reaches zero — and a
// disabled action cannot be recovered by anything `play` does:
// `setEffectiveWeight` stores `enabled ? weight : 0`, `play()` does not touch
// the flag, and `_updateWeight` returns 0 without evaluating the fade-in
// interpolant while it is false.
//
// Result: attack while standing still, the run->attack crossfade completes, and
// run is dead for the session. Move again and the character travels at full
// speed in a frozen pose. That is the combat slide.
section("5. an interrupted stride can still be resumed (real three.js)");
{
  const THREE = await import("three");

  const bone = new THREE.Object3D();
  const track = (v) => new THREE.VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 0, v, 0]);
  const mixer = new THREE.AnimationMixer(bone);
  const run = mixer.clipAction(new THREE.AnimationClip("Run", 1, [track(1)]));
  const atk = mixer.clipAction(new THREE.AnimationClip("Attack", 1, [track(2)]));
  atk.setLoop(THREE.LoopOnce, 1);
  atk.clampWhenFinished = true;

  // `Actor.play`'s crossfade, in the part that decides whether a clip animates.
  // Kept in step with the real one by section 6's source checks below.
  const play = (next, prev, isRun) => {
    if (!isRun) next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.2, false);
  };
  const step = (n) => { for (let i = 0; i < n; i++) mixer.update(1 / 60); };

  play(run, null, true);
  step(30);
  check("a stride plays", run.getEffectiveWeight() > 0 && run.isRunning());

  // The exact combat case: an auto-attack lands while the player is NOT moving,
  // so nothing calls play("run") during the crossfade and it runs to completion.
  play(atk, run, false);
  step(30);
  check(
    "three.js disables the faded-out action by itself",
    run.enabled === false,
    "if this ever stops being true the bug below cannot happen and this test is moot",
  );

  const before = bone.position.y;
  play(run, atk, true);
  step(60);
  check(
    "the stride can be resumed after the interruption",
    run.getEffectiveWeight() > 0,
    "run is permanently disabled — the character would slide at full speed in a frozen pose",
  );
  check("and the rig actually moves again", bone.position.y !== before);
  console.log(
    `  run after resume: enabled=${run.enabled} weight=${run.getEffectiveWeight().toFixed(2)}`,
  );
}

// --- 6. the source keeps making that true -----------------------------------
section("6. the line the runtime test depends on");
{
  const at = actor.indexOf('if (anim !== "run") next.reset();');
  check("play() still skips reset() for run", at > -1);
  const enabledAt = actor.indexOf("next.enabled = true;", at);
  const weightAt = actor.indexOf("next.setEffectiveWeight(1);", at);
  check(
    "play() re-enables the action explicitly, since reset() no longer does it for run",
    enabledAt > -1,
    "without this, run is permanently dead after its first completed crossfade-out",
  );
  check(
    "and does it BEFORE setEffectiveWeight, which reads the flag",
    enabledAt > -1 && weightAt > -1 && enabledAt < weightAt,
    "setEffectiveWeight stores `enabled ? weight : 0`, so the order is the fix",
  );
}

console.log(
  failures === 0
    ? "\nOK — the slide has one unbounded lock, it is watched for, and it is recoverable"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
