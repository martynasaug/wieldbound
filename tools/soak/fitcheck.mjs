// DOES EVERY WORN PIECE ACTUALLY SIT ON THE BODY?
//
//   node tools/soak/fitcheck.mjs [slot|style ...]
//
// THE PROBLEM THIS EXISTS TO END. Every misfit in this phase was found by a
// person looking at a picture and saying so: a hood floating in front of a face,
// a helm with the chin coming through it, a pauldron off the side of a shoulder,
// boots hovering at mid-shin. Each was then diagnosed from scratch, usually as
// the wrong axis first. None of them was caught by anything automatic, because
// nothing automatic was looking.
//
// That is survivable at nineteen styles and it is not survivable at two hundred.
// So this asks the question once, for every style in every slot, and prints the
// ones that fail.
//
// WHAT IT MEASURES. A worn piece hangs off a bone. That bone owns a region of the
// body — the vertices it dominates — and a piece belonging to it should be AROUND
// that region: overlapping it on every axis, not floating clear of it and not
// buried inside it. Two numbers say whether it is:
//
//   OVERLAP   how much of the bone's own box the piece's box covers, per axis.
//             A piece that has slid off the part it belongs to loses this first.
//   CLEARANCE the gap between the two boxes when they do not overlap at all.
//             Zero for anything touching; large for a hood in front of a face.
//
// Deliberately crude. A box test cannot tell a good pauldron from a bad one, and
// it is not trying to: it is trying to make "this piece is not on the body" a
// thing the machine notices before a person has to.
import { open, login } from "./driver.mjs";
import { GEAR_STYLES } from "../../shared/protocol-types.ts";
import { ITEM_BASES } from "../../shared/items.ts";

const FILTER = process.argv.slice(2);

// WHICH SLOT EACH STYLE BELONGS TO, TAKEN FROM THE CATALOGUE. This used to be
// typed out here, and when two helms and two boots were added in M70.371 it
// reported them as `undefined:fur — nothing worn`: the harness could not name
// their slot, so it equipped them into nothing and then complained that nothing
// was worn. Every item declares its own slot and style; that is the answer.
const SLOT_OF = Object.fromEntries(
  Object.values(ITEM_BASES).filter((b) => b.style).map((b) => [b.style, b.slot]),
);

const styles = GEAR_STYLES.filter(
  (s) => !FILTER.length || FILTER.includes(s) || FILTER.includes(SLOT_OF[s]),
);

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Fit${Date.now() % 100000}`);
await page.waitForTimeout(2200);

const rows = await page.evaluate(async ({ styles, slotOf }) => {
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
  const boxOf = (pts) => {
    if (!pts.length) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    return { lo, hi };
  };

  freeze();
  let body = null;
  a.root.traverse((o) => { if (!body && o.isSkinnedMesh) body = o; });
  if (!body) return ["no skinned body"];
  const bp = body.geometry.attributes.position;
  const si = body.geometry.attributes.skinIndex;
  const sw = body.geometry.attributes.skinWeight;
  const bm = body.matrixWorld.elements;
  const bones = body.skeleton.bones.map((b) => b.name);

  // The body region each bone owns, once. Dominant weight only: a vertex the
  // neck shares with the spine belongs to neither box cleanly, and counting it
  // in both stretches them into each other.
  const region = new Map();
  for (let i = 0; i < bp.count; i++) {
    let best = -1, bestW = 0.5;
    for (const c of ["X", "Y", "Z", "W"]) {
      const w = sw[`get${c}`](i);
      if (w > bestW) { bestW = w; best = si[`get${c}`](i); }
    }
    if (best < 0) continue;
    const name = bones[best];
    if (!region.has(name)) region.set(name, []);
    region.get(name).push(xf(bm, bp.getX(i), bp.getY(i), bp.getZ(i)));
  }
  const regionBox = new Map();
  for (const [name, pts] of region) regionBox.set(name, boxOf(pts));

  for (const style of styles) {
    const slot = slotOf[style];
    a.setAppearance({ layers: { [slot]: { style, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1300));
    freeze();

    const pieces = new Map();
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
      if (!/^(gear_|worn_)/.test(o.name)) return;
      if (seen.has(o.geometry.uuid + o.name)) return;
      seen.add(o.geometry.uuid + o.name);
      // The bone it hangs from, which is what it should be measured against.
      let bone = null;
      for (let p = o.parent; p; p = p.parent) {
        if (p.isBone) { bone = p.name; break; }
      }
      const gp = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      const pts = [];
      for (let i = 0; i < gp.count; i++) pts.push(xf(m, gp.getX(i), gp.getY(i), gp.getZ(i)));
      pieces.set(o.name, { bone, box: boxOf(pts) });
    });

    if (!pieces.size) { out.push(`FAIL ${slot}:${style} — nothing worn`); continue; }

    const faults = [];
    for (const [name, { bone, box }] of pieces) {
      // A skinned garment has no single bone and legitimately spans the body;
      // it is measured against the whole figure instead.
      // A CHAINED SEGMENT HANGS FROM THE ONE ABOVE IT, not from the bone.
      // `Cape1` and `Cape2` are links in a swinging chain whose root is
      // `Cape0`; measuring them against the torso reports a correctly hanging
      // cape as detached, which is how five of the first seven failures arose.
      if (/Cape[1-9]/.test(name)) continue;
      const against = bone && regionBox.has(bone) ? regionBox.get(bone) : null;
      if (!against) continue;
      // CLEARANCE ONLY, AND THE PERCENTAGE TEST IS GONE. It flagged a circlet
      // for covering 16% of the head — which is what a circlet is — and every
      // cape for hanging below the torso, which is what a cape does. Seven
      // failures, five of them correct art. A guard that cries wolf gets
      // switched off, and then it is worth nothing when something is really
      // wrong.
      //
      // What is never right is a piece with DAYLIGHT between it and the part of
      // the body it hangs from. That is the pauldron off the side of the
      // shoulder and the boot hovering at mid-shin, and it has no legitimate
      // version.
      const axis = ["x", "y", "z"];
      for (let k = 0; k < 3; k++) {
        const lo = Math.max(box.lo[k], against.lo[k]);
        const hi = Math.min(box.hi[k], against.hi[k]);
        // THE TOLERANCE IS WHAT A PLAYER COULD SEE, not zero. At 0.01 this
        // flagged the leather pouch for hanging 0.011 below the abdomen -- six
        // thousandths of body height, under a pixel at the game camera. A guard
        // that reports the invisible gets ignored exactly as fast as one that
        // reports the harmless. The faults it is for were 0.09 to 0.27.
        if (hi < lo - 0.03) {
          faults.push(`${name} clears ${bone} on ${axis[k]} by ${(lo - hi).toFixed(3)}`);
        }
      }
    }
    out.push(
      faults.length
        ? `FAIL ${slot}:${style}\n     ${faults.join("\n     ")}`
        : `ok   ${slot}:${style}  (${pieces.size} pieces)`,
    );
  }
  return out;
}, { styles, slotOf: SLOT_OF });

let bad = 0;
for (const r of rows) {
  if (r.startsWith("FAIL")) bad++;
  console.log(r);
}
console.log(`\n${rows.length - bad} fitted, ${bad} not`);
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
process.exitCode = bad ? 1 : 0;
