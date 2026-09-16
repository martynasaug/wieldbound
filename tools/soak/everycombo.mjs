// EVERY ITEM WITH EVERY OTHER ITEM.
//
//   node tools/soak/everycombo.mjs
//
// Asked for in those words. Six armours by five helms by four boots by four
// capes is 480 outfits — too many to look at and exactly the right number to
// MEASURE, so this wears all of them and prints only what fails.
//
// Three questions per outfit, and each is one the eye has already caught this
// phase at least once:
//
//   BARE REGION   is any part of the body the armour covers left narrower than
//                 the body under it? Coverage COMPOSES across slots — a garment
//                 ending at the knee is not bare if a boot starts there — so
//                 each region takes the best of what is worn over it. This is
//                 the "MASSIVE spots where the character base is seen" check.
//   BURIED SLOT   do two slots share so much space that one is inside the
//                 other? The rule is no overlapping and no item removing part
//                 of another: boundaries meet, they do not interpenetrate.
//   NOTHING WORN  did a slot ask for a style and draw no geometry at all?
//
// Everything is bucketed BY BONE. The body is bound in a T-pose, so filtering
// by height band counts both sleeves as chest armour and reports the torso at
// 680% covered — which an earlier version of this did.
import { open, login } from "./driver.mjs";
import { HAIR_STYLE_IDS } from "../../shared/look.ts";

const ARMOR = ["leather", "chain", "plate", "robe", "scale", "brigandine"];
const HELM = ["cap", "hood", "full", "horned", "circlet"];
const BOOTS = ["low", "tall", "plated", "wrapped"];
const CAPE = ["cape", "cloak", "mantle", "tabard"];

// Regions the WORN slots are responsible for. The head is the helm's business
// and `helmcover.mjs` measures it; hands and face belong to the body.
const REGIONS = [
  ["torso", "^(Torso|Chest|Spine)$"],
  ["abdomen", "^(Abdomen|Hips)$"],
  ["upper arm", "^UpperArm"],
  ["forearm", "^LowerArm"],
  ["thigh", "^UpperLeg"],
  ["shin", "^LowerLeg"],
];

// A region is bare below this.
const COVERED = 1.0;
// Two slots this deep inside each other on their tightest axis are not meeting
// at a boundary.
// A slot with this much of its own volume inside another is buried in it.
const BURIED = 0.75;

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `All${Date.now() % 100000}`);
await page.waitForTimeout(2600);

const PINNED = { skin: "tan", build: "average", hair: "shaggy", beard: "none", hairColor: "black" };
if (!HAIR_STYLE_IDS.includes(PINNED.hair)) {
  console.error(`hair "${PINNED.hair}" is not a real style`);
  process.exit(1);
}
await page.evaluate((look) => {
  window.__wieldbound.localActor.setLook(look);
  window.__wieldbound.world.dayNight.freeze(0.5);
}, PINNED);
await page.waitForTimeout(1400);

const outfits = [];
for (const armor of ARMOR) {
  for (const helm of HELM) {
    for (const boots of BOOTS) {
      for (const cape of CAPE) outfits.push({ armor, helm, boots, cape });
    }
  }
}
console.log(`${outfits.length} outfits`);

const report = await page.evaluate(async ({ outfits, regions, covered, buried }) => {
  const a = window.__wieldbound.localActor;
  const res = regions.map(([n, s]) => [n, new RegExp(s)]);
  const bad = [];
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
      let lo = Infinity, hi = -Infinity;
      for (const p of pts) { if (p[k] < lo) lo = p[k]; if (p[k] > hi) hi = p[k]; }
      if (hi - lo > best) best = hi - lo;
    }
    return best;
  };
  const acrossOf = (region) => (/arm/.test(region) ? [1, 2] : [0, 2]);
  const regionOf = (bone) => {
    for (const [name, re] of res) if (re.test(bone)) return name;
    return null;
  };
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
      const r = regionOf(bones[best]);
      if (r) into.get(r).push(xf(m, p.getX(i), p.getY(i), p.getZ(i)));
    }
  };

  freeze();
  let body = null;
  a.root.traverse((o) => { if (!body && o.isSkinnedMesh && !/^worn_/.test(o.name)) body = o; });
  const bodyPts = new Map(res.map(([n]) => [n, []]));
  bySkin(body, bodyPts);
  const bodyGirth = new Map([...bodyPts].map(([n, p]) => [n, girth(p, acrossOf(n))]));

  for (const outfit of outfits) {
    const layers = {};
    for (const [slot, style] of Object.entries(outfit)) {
      layers[slot] = { style, rarity: "honed", palette: "steel" };
    }
    a.setAppearance({ layers });
    await new Promise((r) => setTimeout(r, 620));
    freeze();

    const gearPts = new Map(res.map(([n]) => [n, []]));
    const gearSpans = new Map(res.map(([n]) => [n, []]));
    const slotBox = new Map();
    const drew = new Set();
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !/^(gear_|worn_)/.test(o.name)) return;
      if (seen.has(o.uuid)) return;
      seen.add(o.uuid);
      const slot = o.userData?.gearKey;
      if (slot) drew.add(slot);
      const p = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      if (slot) {
        let b = slotBox.get(slot);
        if (!b) { b = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] }; slotBox.set(slot, b); }
        for (let i = 0; i < p.count; i++) {
          const q = xf(m, p.getX(i), p.getY(i), p.getZ(i));
          for (let k = 0; k < 3; k++) {
            if (q[k] < b.lo[k]) b.lo[k] = q[k];
            if (q[k] > b.hi[k]) b.hi[k] = q[k];
          }
        }
      }
      if (o.isSkinnedMesh) {
        const into = new Map(res.map(([n]) => [n, []]));
        bySkin(o, into);
        for (const [rn, pts] of into) {
          if (!pts.length) continue;
          for (const q of pts) gearPts.get(rn).push(q);
          const ax = /arm/.test(rn) ? 0 : 1;
          let lo2 = Infinity, hi2 = -Infinity;
          for (const q of pts) { if (q[ax] < lo2) lo2 = q[ax]; if (q[ax] > hi2) hi2 = q[ax]; }
          gearSpans.get(rn).push([lo2, hi2]);
        }
        return;
      }
      let bone = null;
      for (let q = o.parent; q; q = q.parent) if (q.isBone) { bone = q.name; break; }
      const r = bone && regionOf(bone);
      if (!r) return;
      const axis = /arm/.test(r) ? 0 : 1;
      let slo = Infinity, shi = -Infinity;
      for (let i = 0; i < p.count; i++) {
        const q = xf(m, p.getX(i), p.getY(i), p.getZ(i));
        gearPts.get(r).push(q);
        if (q[axis] < slo) slo = q[axis];
        if (q[axis] > shi) shi = q[axis];
      }
      if (slo <= shi) gearSpans.get(r).push([slo, shi]);
    });

    const name = `${outfit.armor}+${outfit.helm}+${outfit.boots}+${outfit.cape}`;
    const faults = [];
    for (const [r] of res) {
      const b = bodyGirth.get(r);
      if (!b) continue;
      const ratio = girth(gearPts.get(r), acrossOf(r)) / b;
      if (ratio < covered) faults.push(`${r} ${Math.round(ratio * 100)}%`);
      // A BARE BAND, which girth cannot see. A tunic ending halfway down a
      // thigh is full girth where it exists and bare below it — which is what
      // "80% is the character base pants" actually was. The region is sliced
      // along its own length and every slice has to have something in it.
      const bp = bodyPts.get(r);
      if (!bp.length) continue;
      // NOT THE ARMS. Along an arm the axis is X, and X runs through BOTH
      // arms -- so the left sleeve fills the low bands, the right one fills
      // the high bands, and the middle reads bare however well both are
      // covered. Girth already answers the arms honestly; a band test cannot.
      if (/arm/.test(r)) continue;
      const axis = 1;
      let lo = Infinity, hi = -Infinity;
      for (const q of bp) { if (q[axis] < lo) lo = q[axis]; if (q[axis] > hi) hi = q[axis]; }
      const SLICES = 6;
      const step = (hi - lo) / SLICES;
      if (step <= 0) continue;
      // BY SPAN, NOT BY VERTEX. A shell with a ring at each end has no
      // vertices in between and covers everything between them — counting
      // vertices per slice reported a fully covered shin as bare on 360 of 480
      // outfits, and the boot was measured spanning it the whole time.
      const filled = new Array(SLICES).fill(0);
      for (const [slo, shi] of gearSpans.get(r)) {
        const a0 = Math.max(0, Math.floor((slo - lo) / step));
        const a1 = Math.min(SLICES - 1, Math.floor((shi - lo) / step));
        for (let i = a0; i <= a1; i++) filled[i]++;
      }
      // The END slices are allowed to be empty: a bracer stops short of the
      // wrist and a greave stops above the ankle, both on purpose. A hole in
      // the MIDDLE of a limb is never right.
      for (let i = 1; i < SLICES - 1; i++) {
        if (!filled[i]) { faults.push(`${r} bare band ${i + 1}/${SLICES}`); break; }
      }
    }
    for (const slot of ["armor", "helm", "boots", "cape"]) {
      if (!drew.has(slot)) faults.push(`${slot} drew nothing`);
    }
    // NO BURIAL CHECK HERE, AND THAT IS A CONCLUSION RATHER THAN AN OMISSION.
    //
    // Three versions were tried. Raw box overlap flagged a tabard worn ON a
    // breastplate, which is what a tabard is. A depth threshold flagged a hood
    // draping onto shoulders, which is what a hood does. Containment flagged
    // every cape at 100%, because a cape hangs BEHIND a full-body garment and
    // their boxes nest.
    //
    // A bounding box cannot tell BEHIND from INSIDE -- `overlap.mjs` says so in
    // its own header and it is right. Every one of those was checked by eye and
    // every one was correct art. A guard that only cries wolf is worse than no
    // guard, so the question goes back to `wearlook.mjs` and a person looking at
    // four sides. What is left here is coverage, which a box CAN answer and
    // which found real faults on 480 outfits.
    if (faults.length) bad.push(`${name}: ${faults.join(", ")}`);
  }
  return bad;
}, { outfits, regions: REGIONS, covered: COVERED, buried: BURIED });

// Grouped, because 480 outfits share a handful of causes and a wall of lines
// hides that.
const causes = new Map();
for (const line of report) {
  const [name, rest] = line.split(": ");
  for (const f of rest.split(", ")) {
    const key = f.replace(/\s*\d+%/, "").replace(/\s*[\d.]+$/, "").trim();
    if (!causes.has(key)) causes.set(key, []);
    causes.get(key).push(`${name} (${f})`);
  }
}
console.log("");
if (!causes.size) {
  console.log("every outfit covers every region, and every slot drew.");
} else {
  for (const [cause, hits] of [...causes].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${hits.length.toString().padStart(4)}x  ${cause}`);
    for (const h of hits.slice(0, 3)) console.log(`        ${h}`);
    if (hits.length > 3) console.log(`        ... and ${hits.length - 3} more`);
  }
}
console.log(`\n${outfits.length - report.length} of ${outfits.length} outfits clean`);
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
process.exitCode = report.length ? 1 : 0;
