// HOW MUCH OF EACH LIMB IS ACTUALLY ARMOUR?
//
//   node tools/soak/coverwidth.mjs
//
// Reported, repeatedly and correctly: "there are MASSIVE spots where the
// character's base is seen — all shoulders, part of the torso, bottom torso is
// worse and legs are absolutely the worst (80% is the character base pants)."
//
// The chest was measured this way and fixed; no other region ever was.
//
// EVERYTHING IS BUCKETED BY BONE, which is the only way this measures what it
// claims to. A first version filtered gear by the region's HEIGHT BAND and
// reported the torso at 680% covered — because the body is bound in a T-pose,
// so both sleeves lie inside the torso's band and got counted as chest armour.
//
// The body and the skinned garments share one skeleton, so both are bucketed by
// dominant skin weight. Rigid pieces are bucketed by the bone they hang from.
import { open, login } from "./driver.mjs";

const STYLES = ["leather", "chain", "plate", "robe", "scale", "brigandine"];

const REGIONS = [
  ["torso", "^(Torso|Chest|Spine)$"],
  ["abdomen", "^(Abdomen|Hips)$"],
  ["upper arm", "^UpperArm"],
  ["forearm", "^LowerArm"],
  ["thigh", "^UpperLeg"],
  ["shin", "^LowerLeg"],
];

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Cov${Date.now() % 100000}`);
await page.waitForTimeout(2400);

const rows = await page.evaluate(async ({ styles, regions }) => {
  const a = window.__wieldbound.localActor;
  const out = [];
  const res = regions.map(([name, src]) => [name, new RegExp(src)]);
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
  // The widest extent across the two axes perpendicular to the limb's run —
  // a girth, not a length, so a short sleeve is not credited for being long.
  // ACROSS THE LIMB, NOT ALONG IT. The body is bound in a T-POSE, so X runs
  // down the arms: measuring an arm across x and z measures how LONG a sleeve
  // is, not how far round the arm it goes. Reported as forearm 97%, which
  // read as a bare arm and was in fact a bracer stopping short of the wrist,
  // exactly as it should. The axes to measure are the two the limb does not
  // run along.
  const girth = (pts, axes) => {
    if (!pts.length) return 0;
    let best = 0;
    for (const k of axes) {
      best = Math.max(best, Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k])));
    }
    return best;
  };
  const acrossOf = (region) => (/arm/.test(region) ? [1, 2] : [0, 2]);
  const regionOf = (bone) => {
    for (const [name, re] of res) if (re.test(bone)) return name;
    return null;
  };
  // Vertices of one skinned mesh, split by the bone that dominates each.
  const bySkin = (mesh, into) => {
    const p = mesh.geometry.attributes.position;
    const si = mesh.geometry.attributes.skinIndex;
    const sw = mesh.geometry.attributes.skinWeight;
    if (!si || !sw) return;
    const m = mesh.matrixWorld.elements;
    const bones = mesh.skeleton.bones.map((b) => b.name);
    for (let i = 0; i < p.count; i++) {
      let best = -1, bw = 0.5;
      for (const c of ["X", "Y", "Z", "W"]) {
        const w = sw[`get${c}`](i);
        if (w > bw) { bw = w; best = si[`get${c}`](i); }
      }
      if (best < 0) continue;
      const region = regionOf(bones[best]);
      if (!region) continue;
      into.get(region).push(xf(m, p.getX(i), p.getY(i), p.getZ(i)));
    }
  };

  freeze();
  let body = null;
  a.root.traverse((o) => { if (!body && o.isSkinnedMesh && !/^worn_/.test(o.name)) body = o; });
  const bodyPts = new Map(res.map(([n]) => [n, []]));
  bySkin(body, bodyPts);

  for (const style of styles) {
    a.setAppearance({ layers: { armor: { style, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1400));
    freeze();

    const gearPts = new Map(res.map(([n]) => [n, []]));
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !/^(gear_|worn_)/.test(o.name)) return;
      if (seen.has(o.uuid)) return;
      seen.add(o.uuid);
      if (o.isSkinnedMesh) { bySkin(o, gearPts); return; }
      // A rigid piece belongs to the bone it hangs from.
      let bone = null;
      for (let q = o.parent; q; q = q.parent) if (q.isBone) { bone = q.name; break; }
      const region = bone && regionOf(bone);
      if (!region) return;
      const p = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      for (let i = 0; i < p.count; i++) {
        gearPts.get(region).push(xf(m, p.getX(i), p.getY(i), p.getZ(i)));
      }
    });

    const cells = res.map(([name]) => {
      const b = girth(bodyPts.get(name), acrossOf(name));
      const g = girth(gearPts.get(name), acrossOf(name));
      const pct = b > 0 ? Math.round((g / b) * 100) : 0;
      return `${name} ${String(pct).padStart(3)}%`;
    });
    out.push(`${style.padEnd(11)} ${cells.join("   ")}`);
  }
  return out;
}, { styles: STYLES, regions: REGIONS });

console.log("armour girth as a percentage of the body's, per region\n");
for (const r of rows) console.log(r);
console.log("\n0% means nothing is drawn there at all.");
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
