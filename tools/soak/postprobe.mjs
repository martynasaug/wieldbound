// WHICH TRIANGLES OF THE HOOD ARE THE POST?
//
// Four cuts in the harvest frame missed it, so this asks the GAME instead:
// hide the hood, note the pixels that change, then report the hood's own
// vertices in that region — in the hood's LOCAL space, which is the space the
// harvest script writes.
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Post${Date.now() % 100000}`);
await page.waitForTimeout(2400);
const rows = await page.evaluate(async () => {
  const a = window.__wieldbound.localActor;
  a.setAppearance({ layers: { helm: { style: "hood", rarity: "honed", palette: "steel" } } });
  await new Promise((r) => setTimeout(r, 1600));
  if (a.mixer) a.mixer.stopAllAction();
  a.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
  a.root.updateMatrixWorld(true);
  let hood = null, body = null;
  a.root.traverse((o) => {
    if (o.isMesh && /gear_helm_hood/.test(o.name)) hood = o;
    if (o.isSkinnedMesh && !body && !/^worn_/.test(o.name)) body = o;
  });
  if (!hood) return ["no hood"];
  // The skull, to locate the face opening in world space.
  const bp = body.geometry.attributes.position, si = body.geometry.attributes.skinIndex,
        sw = body.geometry.attributes.skinWeight, bm = body.matrixWorld.elements;
  const bones = body.skeleton.bones.map((b) => b.name);
  const xf = (m, x, y, z) => [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ];
  let hlo = [1e9,1e9,1e9], hhi = [-1e9,-1e9,-1e9];
  for (let i = 0; i < bp.count; i++) {
    let best = -1, bw = 0.5;
    for (const c of ["X","Y","Z","W"]) { const w = sw[`get${c}`](i); if (w > bw) { bw = w; best = si[`get${c}`](i); } }
    if (best < 0 || bones[best] !== "Head") continue;
    const q = xf(bm, bp.getX(i), bp.getY(i), bp.getZ(i));
    for (let k = 0; k < 3; k++) { hlo[k] = Math.min(hlo[k], q[k]); hhi[k] = Math.max(hhi[k], q[k]); }
  }
  const out = [`SKULL world x[${hlo[0].toFixed(2)},${hhi[0].toFixed(2)}] y[${hlo[1].toFixed(2)},${hhi[1].toFixed(2)}] z[${hlo[2].toFixed(2)},${hhi[2].toFixed(2)}]`];

  // Hood vertices that land in the post: centred in x, below the chin, in front.
  const hp = hood.geometry.attributes.position, hm = hood.matrixWorld.elements;
  const midX = (hlo[0] + hhi[0]) / 2;
  let n = 0, llo = [1e9,1e9,1e9], lhi = [-1e9,-1e9,-1e9];
  for (let i = 0; i < hp.count; i++) {
    const lx = hp.getX(i), ly = hp.getY(i), lz = hp.getZ(i);
    const q = xf(hm, lx, ly, lz);
    if (Math.abs(q[0] - midX) > 0.06) continue;      // centred
    if (q[1] < 1.10 || q[1] > 1.40) continue;        // the post's height
    n++;
    const l = [lx, ly, lz];
    for (let k = 0; k < 3; k++) { llo[k] = Math.min(llo[k], l[k]); lhi[k] = Math.max(lhi[k], l[k]); }
  }
  out.push(`${n} hood vertices in the post`);
  if (n) {
    out.push(`  their LOCAL coords: x[${llo[0].toFixed(3)},${lhi[0].toFixed(3)}] `
      + `y[${llo[1].toFixed(3)},${lhi[1].toFixed(3)}] z[${llo[2].toFixed(3)},${lhi[2].toFixed(3)}]`);
  }
  return out;
});
for (const r of rows) console.log(r);
await browser.close();
