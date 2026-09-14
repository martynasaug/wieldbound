// HOW MUCH OF THE HEAD DOES EACH HELM ACTUALLY COVER?
//
//   node tools/soak/helmcover.mjs
//
// Reported: "there are literally parts of the head showing on every single head
// piece." I had checked exactly one helm — the great helm, because it was the one
// I had just edited — declared it enclosed, and published a sheet of five.
//
// Eyeballing does not scale and it is not what this question needs. A helm is
// either over a piece of skull or it is not, and that is a ray test: out through
// each vertex the Head bone owns, and on. If the ray leaves the head and meets the
// helm, that piece of skull is covered.
//
// RADIALLY OUTWARD, NOT ALONG THE NORMAL. A vertex normal on a low-poly skull
// points wherever its facet happens to face, and near the jaw that is often
// sideways or down — so a normal test reports a chin as uncovered by a helm that
// plainly encloses it. Away from the head's own centre is what "outward" means.
//
// AND FROM THE VERTEX, NOT FROM THE CENTRE. A ray started inside the head hits the
// far wall of the helm from within and counts every vertex as covered, which is a
// metric that can only ever answer 100%.
//
// The intersection is written out rather than taken from three.js, which the game
// does not expose on its debug handle. Moller-Trumbore is a dozen lines and the
// alternative was exposing a library to answer one question.
import { open, login } from "./driver.mjs";

const STYLES = ["cap", "hood", "full", "horned", "circlet"];

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Cov${Date.now() % 100000}`);
await page.waitForTimeout(2200);

const rows = await page.evaluate(async (styles) => {
  const a = window.__wieldbound.localActor;
  const out = [];

  const freeze = () => {
    if (a.mixer) a.mixer.stopAllAction();
    a.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    a.root.updateMatrixWorld(true);
  };

  const xform = (m, x, y, z) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];

  freeze();
  let headIndex = -1;
  let bodyMesh = null;
  a.root.traverse((o) => {
    if (bodyMesh || !o.isSkinnedMesh) return;
    const i = o.skeleton.bones.findIndex((b) => b.name === "Head");
    if (i < 0) return;
    bodyMesh = o;
    headIndex = i;
  });
  if (!bodyMesh) return ["no skinned body with a Head bone"];

  const pos = bodyMesh.geometry.attributes.position;
  const si = bodyMesh.geometry.attributes.skinIndex;
  const sw = bodyMesh.geometry.attributes.skinWeight;
  const bm = bodyMesh.matrixWorld.elements;
  const points = [];
  for (let i = 0; i < pos.count; i++) {
    let owned = false;
    for (const c of ["X", "Y", "Z", "W"]) {
      if (si[`get${c}`](i) === headIndex && sw[`get${c}`](i) > 0.5) { owned = true; break; }
    }
    if (!owned) continue;
    points.push(xform(bm, pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  if (!points.length) return ["no head-owned vertices"];

  const centre = [0, 0, 0];
  for (const p of points) for (let k = 0; k < 3; k++) centre[k] += p[k];
  for (let k = 0; k < 3; k++) centre[k] /= points.length;

  const hits = (ox, oy, oz, dx, dy, dz, far, tris) => {
    for (let j = 0; j < tris.length; j += 9) {
      const ax = tris[j], ay = tris[j + 1], az = tris[j + 2];
      const e1x = tris[j + 3] - ax, e1y = tris[j + 4] - ay, e1z = tris[j + 5] - az;
      const e2x = tris[j + 6] - ax, e2y = tris[j + 7] - ay, e2z = tris[j + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const vv = (dx * qx + dy * qy + dz * qz) * inv;
      if (vv < 0 || u + vv > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      // Both faces count: a helm is a shell and a ray leaving the head meets its
      // inside first. Culling by winding would report an enclosed head as bare.
      if (t > 1e-5 && t < far) return true;
    }
    return false;
  };

  for (const style of styles) {
    a.setAppearance({ layers: { helm: { style, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1400));
    freeze();

    const tris = [];
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !/^gear_helm_/.test(o.name)) return;
      if (seen.has(o.geometry.uuid)) return;
      seen.add(o.geometry.uuid);
      const gp = o.geometry.attributes.position;
      const idx = o.geometry.index;
      const m = o.matrixWorld.elements;
      const n = idx ? idx.count : gp.count;
      for (let f = 0; f + 2 < n; f += 3) {
        for (const k of [0, 1, 2]) {
          const vi = idx ? idx.getX(f + k) : f + k;
          const w = xform(m, gp.getX(vi), gp.getY(vi), gp.getZ(vi));
          tris.push(w[0], w[1], w[2]);
        }
      }
    });
    if (!tris.length) { out.push(`${style.padEnd(9)} no helm mesh`); continue; }
    const flat = new Float64Array(tris);

    let covered = 0;
    for (const p of points) {
      let dx = p[0] - centre[0], dy = p[1] - centre[1], dz = p[2] - centre[2];
      const reach = Math.hypot(dx, dy, dz);
      if (reach < 1e-6) { covered++; continue; }
      dx /= reach; dy /= reach; dz /= reach;
      if (hits(p[0] + dx * 1e-4, p[1] + dy * 1e-4, p[2] + dz * 1e-4, dx, dy, dz, reach * 1.4, flat)) covered++;
    }
    const pct = (covered / points.length) * 100;
    out.push(`${style.padEnd(9)} covers ${pct.toFixed(0).padStart(3)}% of the skull  (${covered}/${points.length}, ${flat.length / 9} tris)`);
  }
  return out;
}, STYLES);

for (const r of rows) console.log(r);
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
