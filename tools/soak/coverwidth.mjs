// HOW WIDE IS THE ARMOUR, AGAINST HOW WIDE IS THE BODY UNDER IT?
//
//   node tools/soak/coverwidth.mjs
//
// Reported: "that empty space between the chest armor and armguards, there's
// literally half of the body naked." Photographed, the chain breastplate is a
// strip down the middle of a torso twice its width, with the body's own tunic
// showing on both sides.
//
// The builder says that should not happen — the shell is cut at radius 20 and
// `body_profile.py` measures the torso at 17 to 19 half-width — so either the
// number in the recipe is not the number that reaches the screen, or the piece
// is not where the recipe thinks. This asks the running game instead of the
// source: the world-space X extent of what each chest style draws over the
// torso, beside the X extent of the torso itself.
import { open, login } from "./driver.mjs";

const STYLES = ["leather", "chain", "plate", "robe", "scale", "brigandine"];

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Cov${Date.now() % 100000}`);
await page.waitForTimeout(2400);

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

  freeze();
  // The torso's own span, from the body mesh, over the chest's height band.
  let body = null;
  a.root.traverse((o) => { if (!body && o.isSkinnedMesh) body = o; });
  const bp = body.geometry.attributes.position;
  const si = body.geometry.attributes.skinIndex;
  const sw = body.geometry.attributes.skinWeight;
  const bm = body.matrixWorld.elements;
  const bones = body.skeleton.bones.map((b) => b.name);
  const torsoPts = [];
  for (let i = 0; i < bp.count; i++) {
    let best = -1, bw = 0.5;
    for (const c of ["X", "Y", "Z", "W"]) {
      const w = sw[`get${c}`](i);
      if (w > bw) { bw = w; best = si[`get${c}`](i); }
    }
    if (best < 0) continue;
    if (!/Torso|Abdomen|Chest|Spine/.test(bones[best])) continue;
    torsoPts.push(xf(bm, bp.getX(i), bp.getY(i), bp.getZ(i)));
  }
  const tLo = Math.min(...torsoPts.map((p) => p[0]));
  const tHi = Math.max(...torsoPts.map((p) => p[0]));
  const tY = [Math.min(...torsoPts.map((p) => p[1])), Math.max(...torsoPts.map((p) => p[1]))];
  out.push(`TORSO x[${tLo.toFixed(3)},${tHi.toFixed(3)}] width ${(tHi - tLo).toFixed(3)}`);

  for (const style of styles) {
    a.setAppearance({ layers: { armor: { style, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1400));
    freeze();
    let lo = Infinity, hi = -Infinity, n = 0;
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !/^(gear_|worn_)/.test(o.name)) return;
      // The torso pieces only — sleeves and skirts are not what is being asked.
      if (!/Torso|Abdomen|^worn_[a-z]+$/.test(o.name)) return;
      if (seen.has(o.uuid)) return;
      seen.add(o.uuid);
      const gp = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      for (let i = 0; i < gp.count; i++) {
        const p = xf(m, gp.getX(i), gp.getY(i), gp.getZ(i));
        // Only where the chest is, so a skirt reaching the knee does not count.
        if (p[1] < tY[0] || p[1] > tY[1]) continue;
        lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); n++;
      }
    });
    out.push(n
      ? `${style.padEnd(11)} x[${lo.toFixed(3)},${hi.toFixed(3)}] width ${(hi - lo).toFixed(3)}  = ${((hi - lo) / (tHi - tLo) * 100).toFixed(0)}% of the torso`
      : `${style.padEnd(11)} nothing over the torso`);
  }
  return out;
}, STYLES);

for (const r of rows) console.log(r);
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
