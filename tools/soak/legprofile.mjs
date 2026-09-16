// HOW WIDE IS THE LEG AT EVERY HEIGHT?
//
//   node tools/soak/legprofile.mjs
//
// `limbaxis.mjs` gives one number per limb — the furthest any vertex sits from
// its axis — and for a LEG that number is the hip. A cuisse cut to it would be
// a barrel; cut to the knee it leaves the hip bare, which is the dark band
// across the buttocks and the tops of the thighs.
//
// So this is `skull_profile.py` for the legs, measured in the running game: the
// reach at each height, in the units `armour.py`'s BODY table uses.
import { open, login } from "./driver.mjs";

const BANDS = 7;

const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Leg${Date.now() % 100000}`);
await page.waitForTimeout(2400);
const rows = await page.evaluate((bands) => {
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
  let hlo = 1e9, hhi = -1e9;
  const own = (want) => {
    const out = [];
    for (let i = 0; i < p.count; i++) {
      let best = -1, bw = 0.5;
      for (const c of ["X","Y","Z","W"]) { const w = sw[`get${c}`](i); if (w > bw) { bw = w; best = si[`get${c}`](i); } }
      if (best < 0 || !want.test(bones[best])) continue;
      out.push(xf(p.getX(i), p.getY(i), p.getZ(i)));
    }
    return out;
  };
  for (const q of own(/^Head$/)) { hlo = Math.min(hlo, q[1]); hhi = Math.max(hhi, q[1]); }
  const perUnit = (hhi - hlo) / 89;
  // The BODY table pins the hip at 116 and the ankle at 10; anchor the ruler on
  // the leg's own span so the printed heights line up with the recipes.
  const out = [];
  for (const [label, want, y0, y1] of [
    ["thigh", /^UpperLegL$/, 116, 61],
    ["shin", /^LowerLegL$/, 61, 10],
  ]) {
    const pts = own(want);
    if (pts.length < 3) { out.push(`${label}: ${pts.length} verts`); continue; }
    const lo = Math.min(...pts.map((q) => q[1])), hi = Math.max(...pts.map((q) => q[1]));
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
    const cz = pts.reduce((s, q) => s + q[2], 0) / pts.length;
    out.push(`${label}  (${pts.length} verts, ${y1}..${y0} in BODY units)`);
    const step = (hi - lo) / bands;
    for (let i = bands - 1; i >= 0; i--) {
      const band = pts.filter((q) => q[1] >= lo + i * step && q[1] <= lo + (i + 1) * step);
      if (!band.length) continue;
      let far = 0;
      for (const q of band) far = Math.max(far, Math.hypot(q[0] - cx, q[2] - cz));
      const at = y1 + ((y0 - y1) * (i + 0.5)) / bands;
      out.push(`   y ${at.toFixed(0).padStart(3)}   reaches ${(far / perUnit).toFixed(1).padStart(5)}   (${band.length} verts)`);
    }
  }
  return out;
}, BANDS);
for (const r of rows) console.log(r);
await browser.close();
