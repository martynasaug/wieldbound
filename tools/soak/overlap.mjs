// DOES ANY WORN ITEM OCCUPY THE SAME SPACE AS ANOTHER?
//
//   node tools/soak/overlap.mjs
//
// Stated as a rule: "I don't want any overlappings or one item removing part of
// other." Each slot owns its region of the body, the boundaries meet, and
// nothing is deleted to make room.
//
// That rule has been kept by memory until now, which is how the shin ended up
// belonging to the boots slot in `garments.py` and nothing checked it again for
// forty milestones. This checks it: every pair of pieces from DIFFERENT slots,
// worn together, and how much of their space is shared.
//
// WHAT THIS CAN AND CANNOT SEE, said plainly, because four instruments in this
// phase answered confidently about things they could not measure. A box test
// cannot tell a cape hanging in front of a breastplate from a cape buried in
// it — both overlap. What it CAN do is name the pairs worth looking at, and
// prove the ones that are far apart really are. Treat a hit as a question.
import { open, login } from "./driver.mjs";

// One representative outfit per pairing worth checking: slots whose regions
// touch. A ring is invisible and a weapon hangs off a hand.
const OUTFITS = [
  ["chain + tall", { armor: "chain", boots: "tall" }],
  ["plate + tall", { armor: "plate", boots: "tall" }],
  ["robe + plated", { armor: "robe", boots: "plated" }],
  ["leather + low", { armor: "leather", boots: "low" }],
  ["chain + cape", { armor: "chain", cape: "cape" }],
  ["plate + cloak", { armor: "plate", cape: "cloak" }],
  ["robe + mantle", { armor: "robe", cape: "mantle" }],
  ["chain + full", { armor: "chain", helm: "full" }],
  ["leather + hood", { armor: "leather", helm: "hood" }],
  ["plate + tabard + cap", { armor: "plate", cape: "tabard", helm: "cap" }],
];

// Below this, two boxes are touching rather than sharing. A seam has to be
// allowed to meet: a greave's top and a cuisse's bottom are supposed to.
const SHARE = 0.25;

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Ovl${Date.now() % 100000}`);
await page.waitForTimeout(2400);

const rows = await page.evaluate(async ({ outfits, share }) => {
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

  for (const [label, layers] of outfits) {
    const worn = {};
    for (const [slot, style] of Object.entries(layers)) {
      worn[slot] = { style, rarity: "honed", palette: "steel" };
    }
    a.setAppearance({ layers: worn });
    await new Promise((r) => setTimeout(r, 1500));
    freeze();

    // One box per SLOT, over everything that slot drew.
    const boxes = new Map();
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !/^(gear_|worn_)/.test(o.name)) return;
      if (seen.has(o.uuid)) return;
      seen.add(o.uuid);
      const slot = o.userData?.gearKey;
      if (!slot) return;
      const p = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      let b = boxes.get(slot);
      if (!b) { b = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] }; boxes.set(slot, b); }
      for (let i = 0; i < p.count; i++) {
        const q = xf(m, p.getX(i), p.getY(i), p.getZ(i));
        for (let k = 0; k < 3; k++) {
          b.lo[k] = Math.min(b.lo[k], q[k]);
          b.hi[k] = Math.max(b.hi[k], q[k]);
        }
      }
    });

    const slots = [...boxes.keys()];
    const hits = [];
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const A = boxes.get(slots[i]), B = boxes.get(slots[j]);
        // The shared box, per axis. Negative on any axis means they are apart.
        const over = [0, 1, 2].map((k) => Math.min(A.hi[k], B.hi[k]) - Math.max(A.lo[k], B.lo[k]));
        if (over.some((v) => v <= 0)) continue;
        // How deep the smaller of the two is inside the other, on its thinnest
        // shared axis — a cape brushing a pauldron shares a sliver; a boot
        // buried in a gown shares its whole height.
        const depth = Math.min(...over);
        if (depth >= share) {
          hits.push(`${slots[i]}/${slots[j]} share ${depth.toFixed(2)} on their tightest axis`);
        }
      }
    }
    out.push(hits.length
      ? `LOOK ${label}\n     ${hits.join("\n     ")}`
      : `ok   ${label}  (${slots.length} slots, no slot buried in another)`);
  }
  return out;
}, { outfits: OUTFITS, share: SHARE });

let flagged = 0;
for (const r of rows) { if (r.startsWith("LOOK")) flagged++; console.log(r); }
console.log(`\n${rows.length - flagged} clean, ${flagged} worth looking at`);
console.log("A hit is a question, not a verdict: a cape IS in front of a chest.");
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
