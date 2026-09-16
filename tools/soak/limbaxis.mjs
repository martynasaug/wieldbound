// WHERE IS EACH LIMB'S AXIS, AND HOW FAR IS ITS SURFACE FROM IT?
//
//   node tools/soak/limbaxis.mjs
//
// Reported: "armour should be on the body, not in the body" -- the character
// breaking through the plates at the shoulders, thighs and shins on every
// style. Raising the facet count helped and did not fix it, which points at
// the other possibility: the shells are placed at fixed offsets (`THIGH_X`,
// `CALF_X`, `shoulder_x`) and turned about that point. If a limb's real axis is
// somewhere else, or its surface reaches further than the radius allows, the
// body comes through on one side however many sides the shell has.
//
// So this asks the body: for each limb, the centre of its own vertices and the
// FURTHEST any of them sits from that centre, measured across the limb.
import { open, login } from "./driver.mjs";

const LIMBS = [
  ["UpperArmL", "x"], ["LowerArmL", "x"],
  ["UpperLegL", "y"], ["LowerLegL", "y"],
  ["Torso", "y"], ["Abdomen", "y"],
];

const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Axis${Date.now() % 100000}`);
await page.waitForTimeout(2400);
const rows = await page.evaluate((limbs) => {
  const a = window.__wieldbound.localActor;
  if (a.mixer) a.mixer.stopAllAction();
  a.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
  a.root.updateMatrixWorld(true);
  let body = null;
  a.root.traverse((o) => { if (!body && o.isSkinnedMesh && !/^worn_/.test(o.name)) body = o; });
  const p = body.geometry.attributes.position, si = body.geometry.attributes.skinIndex,
        sw = body.geometry.attributes.skinWeight, m = body.matrixWorld.elements;
  const bones = body.skeleton.bones.map((b) => b.name);
  const xf = (x, y, z) => [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ];
  // The scale between world units and the BODY table's: the head is 89 tall.
  let hlo = 1e9, hhi = -1e9;
  for (let i = 0; i < p.count; i++) {
    let best = -1, bw = 0.5;
    for (const c of ["X","Y","Z","W"]) { const w = sw[`get${c}`](i); if (w > bw) { bw = w; best = si[`get${c}`](i); } }
    if (best < 0 || bones[best] !== "Head") continue;
    const q = xf(p.getX(i), p.getY(i), p.getZ(i));
    hlo = Math.min(hlo, q[1]); hhi = Math.max(hhi, q[1]);
  }
  const perUnit = (hhi - hlo) / 89;

  const out = [`1 BODY unit = ${perUnit.toFixed(5)} world`];
  for (const [bone, along] of limbs) {
    const pts = [];
    for (let i = 0; i < p.count; i++) {
      let best = -1, bw = 0.5;
      for (const c of ["X","Y","Z","W"]) { const w = sw[`get${c}`](i); if (w > bw) { bw = w; best = si[`get${c}`](i); } }
      if (best < 0 || bones[best] !== bone) continue;
      pts.push(xf(p.getX(i), p.getY(i), p.getZ(i)));
    }
    if (pts.length < 3) { out.push(`${bone.padEnd(11)} only ${pts.length} vertices`); continue; }
    // The two axes across the limb.
    const ax = along === "x" ? [1, 2] : [0, 2];
    const c0 = pts.reduce((s, q) => s + q[ax[0]], 0) / pts.length;
    const c1 = pts.reduce((s, q) => s + q[ax[1]], 0) / pts.length;
    let far = 0;
    for (const q of pts) {
      const d = Math.hypot(q[ax[0]] - c0, q[ax[1]] - c1);
      if (d > far) far = d;
    }
    out.push(`${bone.padEnd(11)} axis at (${(c0 / perUnit).toFixed(1)}, ${(c1 / perUnit).toFixed(1)}) `
      + `reaches ${(far / perUnit).toFixed(1)} from it   (${pts.length} verts)`);
  }
  return out;
}, LIMBS);
for (const r of rows) console.log(r);
await browser.close();
