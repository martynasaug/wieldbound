// WHERE EACH HELM SITS AGAINST THE HEAD IT IS SUPPOSED TO BE ON.
//
//   node tools/soak/helmfit.mjs
//
// `helmcover.mjs` answers "how much of the skull is covered" and that turned out
// not to be enough: a piece can score a coverage number and still be floating
// clear of the head, because a ray cast outward hits it either way. Reported, and
// correct: "head is still showing through helmets ... the hood is not even on the
// head."
//
// So this prints the two boxes side by side — the skull's and the helm's, in the
// same world frame, in the same pose — and the gap between them on each axis. A
// helm that sits too high says so in one number instead of being argued about.
import { open, login } from "./driver.mjs";

const STYLES = ["cap", "hood", "full", "horned", "circlet"];

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Fit${Date.now() % 100000}`);
await page.waitForTimeout(2200);

const rows = await page.evaluate(async (styles) => {
  const a = window.__wieldbound.localActor;
  const out = [];

  const freeze = () => {
    if (a.mixer) a.mixer.stopAllAction();
    a.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    a.root.updateMatrixWorld(true);
  };
  const xf = (m, x, y, z) => [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
  const box = (pts) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    return { lo, hi };
  };
  const fmt = (b) => `x[${b.lo[0].toFixed(2)},${b.hi[0].toFixed(2)}] y[${b.lo[1].toFixed(2)},${b.hi[1].toFixed(2)}] z[${b.lo[2].toFixed(2)},${b.hi[2].toFixed(2)}]`;

  freeze();
  let headIndex = -1, body = null;
  a.root.traverse((o) => {
    if (body || !o.isSkinnedMesh) return;
    const i = o.skeleton.bones.findIndex((b) => b.name === "Head");
    if (i < 0) return;
    body = o; headIndex = i;
  });
  if (!body) return ["no body"];
  const bp = body.geometry.attributes.position;
  const si = body.geometry.attributes.skinIndex;
  const sw = body.geometry.attributes.skinWeight;
  const bm = body.matrixWorld.elements;
  const skullPts = [];
  for (let i = 0; i < bp.count; i++) {
    let owned = false;
    for (const c of ["X", "Y", "Z", "W"]) {
      if (si[`get${c}`](i) === headIndex && sw[`get${c}`](i) > 0.5) { owned = true; break; }
    }
    if (owned) skullPts.push(xf(bm, bp.getX(i), bp.getY(i), bp.getZ(i)));
  }
  const skull = box(skullPts);
  out.push(`SKULL      ${fmt(skull)}`);

  for (const style of styles) {
    a.setAppearance({ layers: { helm: { style, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1400));
    freeze();
    const pts = [];
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !/^gear_helm_/.test(o.name)) return;
      if (seen.has(o.geometry.uuid)) return;
      seen.add(o.geometry.uuid);
      const gp = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      for (let i = 0; i < gp.count; i++) pts.push(xf(m, gp.getX(i), gp.getY(i), gp.getZ(i)));
    });
    if (!pts.length) { out.push(`${style.padEnd(9)} no mesh`); continue; }
    const h = box(pts);
    // How far the helm's own box sits off the skull's, per axis. A helm should
    // ENCLOSE: its low should be at or under the skull's, its high at or over.
    const lowGap = h.lo[1] - skull.lo[1];
    const highGap = h.hi[1] - skull.hi[1];
    const front = h.hi[2] - skull.hi[2];
    out.push(
      `${style.padEnd(9)} ${fmt(h)}` +
      `  bottom ${lowGap >= 0 ? "+" : ""}${lowGap.toFixed(3)}` +
      `  top ${highGap >= 0 ? "+" : ""}${highGap.toFixed(3)}` +
      `  front ${front >= 0 ? "+" : ""}${front.toFixed(3)}`,
    );
  }
  return out;
}, STYLES);

for (const r of rows) console.log(r);
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
