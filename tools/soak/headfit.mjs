// WHERE IS THE SKULL, IN THE SPACE HAIR IS AUTHORED IN?
//
// Every hairstyle and helm is authored against constants — HEAD_TOP 296,
// HEAD_HALF_WIDTH 33, HEAD_FRONT_Z 32, HEAD_BACK_Z -46 — that were fitted by eye
// to helms, which are deliberately oversized. The crest rebuild in M70.271 stood
// its blades on the curve the `crop` dome sits on and photographed half of them
// buried in the forehead: the Monk's head is a flat-topped block with a nearly
// vertical back, and an ellipse is the wrong guess for it.
//
// So this measures instead. Every body vertex weighted mostly to the Head bone
// is skinned to where it is actually drawn, then carried into the hair mesh's
// own geometry space — so the numbers are in exactly the units `hairGeometry`
// writes, and nothing about the attachment's offset or scale has to be known.
//
//   node tools/soak/headfit.mjs [name]
import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Crest4";
const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, NAME);
await page.waitForTimeout(2500);

const fit = await page.evaluate(() => {
  const g = window.__wieldbound;
  const root = g.localActor?.root;
  if (!root) return { error: "no local actor" };
  root.updateMatrixWorld(true);
  let body = null;
  let hair = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh && String(o.material?.name ?? "").includes("Monk")) body = o;
    if (o.name === "look_hair") hair = o;
  });
  if (!body) return { error: "no Monk body mesh" };
  if (!hair) {
    // Not every name draws hair; the attachment is what defines the space.
    const names = [];
    root.traverse((o) => { if (o.name?.startsWith("look_")) names.push(o.name); });
    return { error: `no look_hair (have: ${names.join(", ") || "none"})` };
  }
  hair.updateMatrixWorld(true);
  const bones = body.skeleton.bones;
  const headIndex = bones.findIndex((b) => b.name === "Head");
  if (headIndex < 0) return { error: "no Head bone" };

  const pos = body.geometry.attributes.position;
  const si = body.geometry.attributes.skinIndex;
  const sw = body.geometry.attributes.skinWeight;
  const skin = (body.applyBoneTransform ?? body.boneTransform).bind(body);
  const inv = hair.matrixWorld.clone().invert();
  const V = body.position.constructor; // THREE.Vector3 without importing three
  const pts = [];
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === headIndex) w += sw.getComponent(i, k);
    if (w < 0.5) continue;
    const v = new V().fromBufferAttribute(pos, i);
    skin(i, v);
    v.applyMatrix4(body.matrixWorld).applyMatrix4(inv);
    pts.push([v.x, v.y, v.z]);
  }
  if (!pts.length) return { error: "no head-weighted vertices" };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }

  // The midline profile, which is the only line a crest stands on: the highest
  // point of the head at each depth, and the furthest-back point at each height.
  const mid = pts.filter((p) => Math.abs(p[0]) < 10);
  const top = [];
  for (let z = Math.floor(lo[2] / 8) * 8; z <= hi[2]; z += 8) {
    const col = mid.filter((p) => p[2] >= z && p[2] < z + 8);
    if (col.length) top.push([z + 4, Math.round(Math.max(...col.map((p) => p[1])))]);
  }
  const back = [];
  for (let y = Math.floor(lo[1] / 10) * 10; y <= hi[1]; y += 10) {
    const row = mid.filter((p) => p[1] >= y && p[1] < y + 10);
    if (row.length) back.push([y + 5, Math.round(Math.min(...row.map((p) => p[2]))), Math.round(Math.max(...row.map((p) => p[2])))]);
  }
  // And the half-width at a few heights, for the helms' sake.
  const width = [];
  for (let y = Math.floor(lo[1] / 20) * 20; y <= hi[1]; y += 20) {
    const row = pts.filter((p) => p[1] >= y && p[1] < y + 20);
    if (row.length) width.push([y + 10, Math.round(Math.max(...row.map((p) => Math.abs(p[0]))))]);
  }
  return {
    count: pts.length,
    lo: lo.map(Math.round),
    hi: hi.map(Math.round),
    top,
    back,
    width,
  };
});

if (fit.error) {
  console.log(fit.error);
} else {
  console.log(`${fit.count} head vertices, in hair space:`);
  console.log(`  x ${fit.lo[0]}..${fit.hi[0]}   y ${fit.lo[1]}..${fit.hi[1]}   z ${fit.lo[2]}..${fit.hi[2]}`);
  console.log("  constants: HEAD_TOP 296, HEAD_BOTTOM 205, HEAD_HALF_WIDTH 33, HEAD_FRONT_Z 32, HEAD_BACK_Z -46");
  console.log("\n  midline, highest point at each depth (z: y):");
  console.log("    " + fit.top.map(([z, y]) => `${z}:${y}`).join("  "));
  console.log("\n  midline, back and front at each height (y: zBack..zFront):");
  console.log("    " + fit.back.map(([y, b, f]) => `${y}:${b}..${f}`).join("  "));
  console.log("\n  half-width at each height (y: |x|):");
  console.log("    " + fit.width.map(([y, x]) => `${y}:${x}`).join("  "));
}
await browser.close();
