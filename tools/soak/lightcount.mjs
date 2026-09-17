// WHERE THE SCENE'S LIGHTS ACTUALLY ARE.
//
//   node tools/soak/lightcount.mjs [Name]
//
// `citycost.mjs` reported "100/122 lights" identically at the spawn, in open
// country and on Coldharrow's quay — which says two things at once. The scene
// carries far more lights than either town accounts for, and the distance
// culling added to `Town.update` never fires, because Coldharrow's radius is
// 65 units and the towns are only 210 apart: the "far away" threshold of 3.4
// radii is 221 units, so each town is permanently inside the other's band.
//
// Runs at the spawn only. This is a question about what EXISTS, not about what
// is near, so there is no reason to walk anywhere for it.
import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? `Lights${Math.floor(Math.random() * 90000)}`;

const { browser, page } = await open({ headless: true, width: 1024, height: 700 });
await login(page, NAME);
await page.waitForTimeout(2600);

const report = await page.evaluate(() => {
  const g = window.__wieldbound;
  const byType = {};
  const byOwner = {};
  let visible = 0;
  let total = 0;
  g.world.scene.traverse((o) => {
    if (!o.isLight) return;
    total++;
    if (o.visible) visible++;
    const t = o.type;
    byType[t] = byType[t] ?? { total: 0, visible: 0 };
    byType[t].total++;
    if (o.visible) byType[t].visible++;

    // Walk up for the nearest named ancestor, which is how a light says what
    // it belongs to — the lanterns are parented into their town's group.
    let owner = "(scene root)";
    for (let p = o.parent; p; p = p.parent) {
      if (p.name) {
        owner = p.name;
        break;
      }
    }
    byOwner[owner] = byOwner[owner] ?? { total: 0, visible: 0 };
    byOwner[owner].total++;
    if (o.visible) byOwner[owner].visible++;
  });
  // AND WHERE THEY ARE, which is the question the owner names could not answer:
  // nothing parents its lights into a named group, so every one of them reports
  // "(scene root)". Position is the honest discriminator.
  const spots = [];
  g.world.scene.traverse((o) => {
    if (!o.isLight || o.type !== "PointLight") return;
    // Straight off the world matrix rather than `getWorldPosition`, which needs
    // a THREE.Vector3 and the page does not hand the module out. Elements 12
    // and 14 are the translation's x and z in a column-major 4x4.
    o.updateWorldMatrix(true, false);
    const e = o.matrixWorld.elements;
    spots.push({ x: e[12], z: e[14], visible: o.visible });
  });
  return { byType, byOwner, visible, total, spots };
});

console.log(`\n  ${report.visible} visible of ${report.total} lights in the scene\n`);
console.log("  by type:");
for (const [t, c] of Object.entries(report.byType).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`    ${t.padEnd(22)} ${String(c.visible).padStart(4)} visible / ${c.total}`);
}
console.log("\n  by nearest named ancestor:");
for (const [o, c] of Object.entries(report.byOwner).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`    ${o.padEnd(30)} ${String(c.visible).padStart(4)} visible / ${c.total}`);
}


// AND WHICH SETTLEMENT EACH ONE STANDS IN. The owner names could not answer it
// — nothing parents its lights into a named group, so all 122 report "(scene
// root)" — so position is the honest discriminator.
const { SETTLEMENTS } = await import("../../shared/town.ts");
const { PX_PER_UNIT, WORLD_WIDTH, WORLD_HEIGHT } = await import("../../shared/protocol-types.ts");
const toWX = (px) => (px - WORLD_WIDTH / 2) / PX_PER_UNIT;
const toWZ = (py) => (py - WORLD_HEIGHT / 2) / PX_PER_UNIT;
const buckets = {};
for (const sp of report.spots) {
  let where = "elsewhere in the world";
  for (const st of SETTLEMENTS) {
    const cx = toWX(st.center.x);
    const cz = toWZ(st.center.y);
    if (Math.hypot(sp.x - cx, sp.z - cz) < st.radiusPx / PX_PER_UNIT) {
      where = st.name;
      break;
    }
  }
  buckets[where] = buckets[where] ?? { total: 0, visible: 0 };
  buckets[where].total++;
  if (sp.visible) buckets[where].visible++;
}
const xs = report.spots.map((s) => s.x);
const zs = report.spots.map((s) => s.z);
console.log(`  spread: x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}  z ${Math.min(...zs).toFixed(0)}..${Math.max(...zs).toFixed(0)}`);
console.log(`  first 6: ${report.spots.slice(0, 6).map((s) => "(" + s.x.toFixed(0) + "," + s.z.toFixed(0) + ")").join(" ")}`);
const near = (ncx, ncz, r) => report.spots.filter((s) => Math.hypot(s.x - ncx, s.z - ncz) < r).length;
console.log(`  within 30u of Emberhold (0,0)    : ${near(0, 0, 30)}`);
console.log(`  within 80u of Coldharrow (0,-210): ${near(0, -210, 80)}`);
console.log("\n  point lights by where they stand:");
for (const [k, c] of Object.entries(buckets).sort((a, b) => b[1].total - a[1].total)) {
  console.log(`    ${k.padEnd(30)} ${String(c.visible).padStart(4)} visible / ${c.total}`);
}

await browser.close();
