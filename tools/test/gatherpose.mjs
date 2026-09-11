// THE THREE GATHERING STROKES ARE THREE DIFFERENT MOTIONS, AND EACH ONE CLOSES.
//
// Chopping, mining and picking are posed rather than played — the clip library
// has no animation for any of them — so the motion is arithmetic, and
// arithmetic is checkable without a browser. Two properties matter and neither
// is visible in a screenshot:
//
//   1. EVERY STROKE RETURNS TO REST. The offsets are layered on top of whatever
//      the mixer wrote, and the mixer rewrites the bones each frame, so a pose
//      that does not close does not accumulate — it flickers, because the body
//      snaps between the clip's pose and a bent one. Anything non-zero at t=0
//      or t=1 is a visible pop at the start and end of every swing.
//   2. THEY ARE ACTUALLY DIFFERENT. The whole complaint that produced this file
//      was "tree cutting and rock mining animations are pretty much the same".
//      Two poses that differ by a few hundredths of a radian would pass every
//      other check here and look identical, which is the failure being guarded.
//
//   node tools/test/gatherpose.mjs
import { strokePose } from "../../client/src/three/gatherpose.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

const KINDS = ["tree", "rock", "bush"];
const SAMPLES = 41;
const at = (kind, t) => strokePose(kind, t);

section("1. every stroke starts and ends at rest");
{
  for (const kind of KINDS) {
    for (const t of [0, 1]) {
      const pose = at(kind, t);
      let worst = 0;
      let bone = "";
      for (const name in pose) {
        for (const v of pose[name]) {
          if (Math.abs(v) > worst) {
            worst = Math.abs(v);
            bone = name;
          }
        }
      }
      // A hundredth of a radian is half a degree: below anything an eye
      // resolves on a character the size of a thumbnail.
      check(
        `${kind} is at rest at t=${t}`,
        worst <= 0.01,
        `${bone} is ${worst.toFixed(3)} rad off`,
      );
    }
  }
}

section("2. nothing is ever NaN, and nothing wraps round");
{
  for (const kind of KINDS) {
    let bad = null;
    let biggest = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const pose = at(kind, i / (SAMPLES - 1));
      for (const name in pose) {
        for (const v of pose[name]) {
          if (!Number.isFinite(v)) bad = `${name} is ${v}`;
          biggest = Math.max(biggest, Math.abs(v));
        }
      }
    }
    check(`${kind} produces finite rotations`, !bad, bad ?? "");
    // A TYPO GUARD, NOT ANATOMY, and the first version of this line got that
    // wrong: it capped joints at 2.4 rad on the reasoning that more folds a
    // limb through the body, and then failed a mining stroke at 2.95 that
    // photographs correctly. These are OFFSETS from the idle pose, where the
    // arms hang at the sides — lifting a pick overhead from there is most of a
    // half-turn at the shoulder and is supposed to be. What the number is
    // actually for is catching 7.78, which is what a missing clamp produced.
    check(
      `${kind} keeps every joint inside 3.2 rad`,
      biggest <= 3.2,
      `largest is ${biggest.toFixed(2)} rad`,
    );
  }
}

section("3. the strokes are visibly different from each other");
{
  /** Mean absolute difference across the stroke, over the bones they share. */
  const distance = (a, b) => {
    let total = 0;
    let count = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / (SAMPLES - 1);
      const pa = at(a, t);
      const pb = at(b, t);
      for (const name of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
        const va = pa[name] ?? [0, 0, 0];
        const vb = pb[name] ?? [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          total += Math.abs(va[k] - vb[k]);
          count++;
        }
      }
    }
    return total / Math.max(1, count);
  };

  for (const [a, b] of [["tree", "rock"], ["tree", "bush"], ["rock", "bush"]]) {
    const d = distance(a, b);
    console.log(`  ${a} vs ${b}: mean joint difference ${d.toFixed(3)} rad`);
    // 0.05 rad averaged over every joint and every moment is about three
    // degrees of constant disagreement — small as a number, and the point is
    // that two motions this far apart cannot read as the same one.
    check(`${a} and ${b} are different motions`, d >= 0.05, `they differ by ${d.toFixed(3)} rad on average`);
  }
}

section("4. each stroke does what its name says");
{
  // The identifying feature of each, asserted so a rewrite cannot quietly turn
  // one into another. These read the arm that holds the tool.
  const highest = (kind) => {
    let best = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const p = at(kind, i / (SAMPLES - 1));
      best = Math.min(best, p.UpperArmR?.[0] ?? 0);
    }
    return best;
  };
  // Raising the arm is negative X on this rig, so "higher" is more negative.
  const chop = highest("tree");
  const mine = highest("rock");
  console.log(`  highest arm lift: chop ${chop.toFixed(2)}, mine ${mine.toFixed(2)} rad`);
  check("mining lifts higher than chopping", mine < chop, `chop ${chop.toFixed(2)}, mine ${mine.toFixed(2)}`);

  // A chop travels across the body; a mine comes down straight. That is the Z
  // component on the swinging arm, and it is most of why they look different.
  const spread = (kind) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const z = at(kind, i / (SAMPLES - 1)).UpperArmR?.[2] ?? 0;
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
    return hi - lo;
  };
  const across = spread("tree");
  const straight = spread("rock");
  console.log(`  sideways travel: chop ${across.toFixed(2)}, mine ${straight.toFixed(2)} rad`);
  check(
    "the chop travels further across the body than the mine",
    across > straight * 1.5,
    `chop ${across.toFixed(2)} against mine ${straight.toFixed(2)}`,
  );

  // And picking is not a swing: it stays well below where a chop peaks.
  //
  // Stated as a MARGIN rather than as a fraction, because a fraction was the
  // wrong shape and failed on a correct pose. Reaching forward and lifting
  // overhead are the same sign on this rig — both are negative X at the
  // shoulder — so a picker's arm held out horizontally reads as 60% of a chop's
  // lift by ratio while looking nothing like it. The distance between them is
  // what carries the meaning.
  check(
    "picking stays well below a chop's peak",
    highest("bush") > chop + 0.6,
    `it reaches ${highest("bush").toFixed(2)} against a chop's ${chop.toFixed(2)}`,
  );
}

console.log(failures === 0 ? "\nOK — three strokes, three motions, all of them closing" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
