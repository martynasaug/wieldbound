// THE ARM'S WIDTH, ALONG ITS LENGTH.
//
// Reported: "Look how the whole arm width goes and then at the gloves place" —
// a slim forearm ending in a block, with a hard step where they meet. I have
// now measured that twice with a number that hid it: a bounding box over every
// vertex of the forearm bone SPANS the step, so it reported the widest part of
// the arm as "the forearm" and the hand came out the same size. The same shape
// of mistake as the prayer beads, which took three passes for the same reason.
//
// So this samples the width in SLICES from elbow to fingertip. A step shows up
// as a jump between neighbouring slices; a real arm tapers smoothly and widens
// slightly at the hand.
//
//   node tools/soak/armprofile.mjs [slices]
import { open, login } from "./driver.mjs";

const SLICES = Number(process.argv[2] ?? 14);

const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Arm${Date.now() % 100000}`);
await page.waitForTimeout(1500);

const out = await page.evaluate((slices) => {
  const a = window.__wieldbound.localActor;
  a.setAppearance({ layers: {} });
  let body = null;
  a.root.traverse((o) => { if (!body && o.isSkinnedMesh) body = o; });
  if (!body) return null;
  const V = a.position.constructor;
  const names = body.skeleton.bones.map((b) => b.name);
  const pos = body.geometry.attributes.position;
  const index = body.geometry.attributes.skinIndex;
  const weight = body.geometry.attributes.skinWeight;

  // THE AXIS FROM THE VERTICES THEMSELVES. Taking it off the skeleton mixed two
  // spaces — the bind matrices carry a hundredfold the vertex positions do not —
  // and reported a seventy-metre forearm, so every slice came back empty. The
  // centroid of the vertices that follow a bone is in the same space as the
  // vertices being sliced, by construction.
  const centroid = (want) => {
    const wanted = new Set(want);
    const sum = new V();
    const v = new V();
    let n = 0;
    for (let i = 0; i < pos.count; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
      if (!wanted.has(names[index.getComponent(i, best)])) continue;
      sum.add(v.fromBufferAttribute(pos, i));
      n++;
    }
    return n ? sum.divideScalar(n) : null;
  };
  const elbow = centroid(["UpperArmR"]);
  const wrist = centroid(["Fist2R"]);
  if (!elbow || !wrist) return null;
  const axis = wrist.clone().sub(elbow);
  const span = axis.length();
  axis.normalize();

  // Everything from the forearm outwards.
  const want = new Set(["LowerArmR", "FistR", "Fist1R", "Fist2R", "Thumb1R", "Thumb2R"]);
  const rows = [];
  const v = new V();
  for (let s = 0; s < slices; s++) {
    // Past the wrist by half again, so the fingers are included.
    const t0 = (s / slices) * 1.6;
    const t1 = ((s + 1) / slices) * 1.6;
    let count = 0;
    let maxR = 0;
    let sumR = 0;
    for (let i = 0; i < pos.count; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
      if (!want.has(names[index.getComponent(i, best)])) continue;
      v.fromBufferAttribute(pos, i).sub(elbow);
      const t = v.dot(axis) / span;
      if (t < t0 || t >= t1) continue;
      const r = v.clone().sub(axis.clone().multiplyScalar(t * span)).length();
      maxR = Math.max(maxR, r);
      sumR += r;
      count++;
    }
    if (count) rows.push({ from: +t0.toFixed(2), to: +t1.toFixed(2), verts: count, max: +maxR.toFixed(3), mean: +(sumR / count).toFixed(3) });
  }
  return { span: +span.toFixed(3), rows };
}, SLICES);

if (!out) {
  console.log("no body");
} else {
  console.log(`forearm elbow-to-wrist ${out.span}m; width sampled in slices along it (1.0 = wrist)`);
  let prev = null;
  for (const r of out.rows) {
    const jump = prev ? r.max / Math.max(prev, 1e-6) : 1;
    const flag = prev && jump > 1.25 ? `  <-- steps up x${jump.toFixed(2)}` : "";
    console.log(`  t ${String(r.from).padStart(4)}..${String(r.to).padEnd(4)}  verts ${String(r.verts).padStart(3)}` +
      `  max radius ${r.max.toFixed(3)}  mean ${r.mean.toFixed(3)}${flag}`);
    prev = r.max;
  }
}
await browser.close();
