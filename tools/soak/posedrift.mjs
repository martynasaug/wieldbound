// THE BODY MUST COME BACK TO WHERE IT STARTED.
//
// Gathering strokes are posed on top of the animation rather than played as a
// clip, which means the offsets are MULTIPLIED onto the bones every frame — and
// that is only safe if something undoes the previous frame first. The first
// version assumed the mixer did: "it rewrites every bone each frame, so the
// offsets cannot accumulate."
//
// It rewrites the bones the CLIP KEYS. An idle animation keys the arms and the
// spine's sway and does not key the knees; every unkeyed bone therefore kept
// last frame's rotation and had this frame's multiplied onto it, sixty times a
// second. Reported from play as the whole upper body spinning the moment
// gathering started.
//
// NO SCREENSHOT CATCHES THIS. A single frame of a body rotating through its
// third revolution looks like a body at some angle; the fault is in the
// DERIVATIVE, and the only way to see it is to watch one bone over seconds and
// ask whether it is drifting. Which is what this does.
//
//   node tools/soak/posedrift.mjs
import { open, login, approach } from "./driver.mjs";
import { gatherRangeToNode } from "../../shared/protocol-types.ts";

const { browser, page } = await open({ headless: true, width: 900, height: 620 });
await login(page, process.argv[2] ?? `Drift${Math.floor(Math.random() * 100000)}`);
await page.waitForTimeout(1500);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

/**
 * The bones a stroke touches, as Euler angles.
 *
 * Read straight off the rig rather than from anything the game reports about
 * itself: the question is what the SKELETON is doing, and a counter maintained
 * beside it could agree with the game while the body span.
 */
const boneAngles = () =>
  page.evaluate(() => {
    const a = window.__wieldbound.localActor;
    const out = {};
    a.root.traverse((o) => {
      if (!o.isBone) return;
      if (!/^(Torso|Abdomen|Neck|UpperArmR|UpperArmL|UpperLegR|UpperLegL)$/.test(o.name)) return;
      // QUATERNIONS, NOT EULERS. The first version read `rotation.x/y/z` and
      // subtracted them, which reported every stroke as bending a joint 6.00
      // radians — an angle that is very nearly a full turn, and is nothing of
      // the sort. Euler components WRAP: -3.0 and +3.0 are a tenth of a turn
      // apart and differ by 6.0 as numbers. The angle between two orientations
      // is a property of the rotation, not of the three numbers used to write
      // it down.
      out[o.name] = [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w];
    });
    return { bones: out, stroke: a.strokeKind ?? null, anim: a.currentAnim ?? "?" };
  });

/**
 * The angle between two orientations, in radians, 0..PI.
 *
 * `2*acos(|dot|)` — the absolute value because q and -q are the same rotation,
 * and without it half the comparisons come back as "nearly a full turn apart"
 * about two orientations that are identical.
 */
const angleBetween = (a, b) => {
  if (!a || !b) return 0;
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
};

const nearest = (kind) =>
  page.evaluate((k) => {
    const g = window.__wieldbound;
    let best = null;
    for (const n of g.nodeStates.values()) {
      if (n.kind !== k || n.status !== "available") continue;
      const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
      if (!best || d < best.d) best = { id: n.id, x: n.x, y: n.y, d };
    }
    return best;
  }, kind);

for (const kind of ["tree", "rock", "bush"]) {
  console.log(`\n${kind}:`);
  let at = await nearest(kind);
  if (!at) { console.log("  INCONCLUSIVE — none available"); continue; }
  for (let i = 0; i < 70; i++) {
    at = (await nearest(kind)) ?? at;
    if (at.d <= gatherRangeToNode(kind) * 0.8) break;
    await approach(page, at, 500);
  }
  at = (await nearest(kind)) ?? at;
  if (at.d > gatherRangeToNode(kind)) {
    console.log(`  INCONCLUSIVE — stopped ${Math.round(at.d)}px away, never in range`);
    continue;
  }

  // LET THE BODY SETTLE FIRST. The walk above ends with the character still
  // blending out of its run, and a "resting pose" captured mid-transition is a
  // running pose — every comparison against it then reports a difference that
  // belongs to the walk rather than to the stroke.
  await page.waitForTimeout(900);
  const before = await boneAngles();
  await page.evaluate((id) => window.__wieldbound.socket.sendGather(id), at.id);

  // Watch across several strokes. One is not enough: accumulation is a slope,
  // and a slope needs a run to show itself.
  let peak = 0;
  let sawStroke = false;
  const samples = [];
  for (let i = 0; i < 26; i++) {
    await page.waitForTimeout(220);
    const now = await boneAngles();
    if (now.stroke) sawStroke = true;
    let worst = 0;
    for (const name in now.bones) {
      worst = Math.max(worst, angleBetween(before.bones[name], now.bones[name]));
    }
    samples.push(worst);
    peak = Math.max(peak, worst);
  }
  console.log(`  a stroke was seen: ${sawStroke}; largest departure from rest ${peak.toFixed(2)} rad`);
  if (!sawStroke) {
    console.log("  INCONCLUSIVE — no stroke ran, so nothing was measured");
    continue;
  }

  // A stroke legitimately bends a joint a long way. What it may NOT do is keep
  // going: the late samples must not be systematically further from rest than
  // the early ones.
  //
  // THIS CHECK IS THE WEAKER OF THE TWO AND THE REASON IS GEOMETRY. The angle
  // between two orientations SATURATES AT PI — half a turn is as far apart as
  // two rotations can be, and one more revolution brings them back together —
  // so a bone spinning freely does not read as a growing number, it reads as a
  // number bouncing between 0 and 3.14. Verified by putting the accumulation
  // bug back: this check passed for the tree while the body span, and what
  // caught it every time was the residue test at the end. A "has it come back"
  // question survives wrap-around; a "how far has it gone" question does not.
  const early = samples.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
  const late = samples.slice(-8).reduce((a, b) => a + b, 0) / 8;
  console.log(`  mean departure: first samples ${early.toFixed(2)} rad, last ${late.toFixed(2)} rad`);
  check(
    `${kind} strokes do not wind the body up`,
    late < early + 0.5,
    `it drifted from ${early.toFixed(2)} to ${late.toFixed(2)} rad — the offsets are accumulating`,
  );
  // And the absolute ceiling, because a slow enough drift passes the slope test
  // and still ends up somewhere absurd.
  check(
    `${kind} never bends a joint past a half turn`,
    peak < 3.4,
    `it reached ${peak.toFixed(2)} rad from rest`,
  );

  // Let it finish and settle, then the body must be back where it began.
  await page.evaluate(() => window.__wieldbound.socket.sendGather(null));
  // SAMPLED REPEATEDLY, AND THE CLOSEST ONE COUNTS.
  //
  // The body does not hold still after a gather — an idle breathes, and a slime
  // that wandered in while the character was chopping puts it in `attack` or
  // `hit`, which bends an arm for reasons that have nothing to do with a
  // stroke. A single sample a fixed time later catches whatever the body
  // happened to be doing: the tree run failed on UpperArmL at 1.00 rad while
  // the combat log filled with a slime hitting the character. What the check
  // actually means is "the stroke leaves nothing behind", so it asks whether
  // the body RETURNS to where it started at any point, not whether it is there
  // on one particular frame.
  let residue = Infinity;
  let residueBone = "";
  let sawIdle = false;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(220);
    const after = await boneAngles();
    if (after.anim === "idle") sawIdle = true;
    let worst = 0;
    let bone = "";
    for (const name in after.bones) {
      const d = angleBetween(before.bones[name], after.bones[name]);
      if (d > worst) { worst = d; bone = name; }
    }
    if (worst < residue) { residue = worst; residueBone = bone; }
  }
  if (!sawIdle) {
    console.log("  INCONCLUSIVE — the body never settled to idle (a fight, most likely)");
  } else {
    check(
      `${kind} leaves the skeleton where it found it`,
      residue < 0.35,
      `${residueBone} never came back closer than ${residue.toFixed(2)} rad`,
    );
  }
}

console.log(failures === 0 ? "\nOK — the strokes bend the body and give it back" : `\n${failures} FAILURES`);
await browser.close();
process.exit(failures ? 1 : 0);
