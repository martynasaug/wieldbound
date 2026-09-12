// WHERE DID THE ARMOUR ACTUALLY GO, AND HOW BIG IS IT?
//
// A photograph at two hundred pixels says "there is something pale on the
// chest" and nothing more — not whether the cuirass is fitted, inflated, or
// sunk into the ribs. This equips one style at a time and reports, per piece:
// the bone it found, its size, and its world box against the BODY's own box for
// the same region, so "swallows the character" and "is inside the character"
// are different numbers rather than the same grey smudge.
//
//   node tools/soak/armourprobe.mjs <style> [style ...]
import { open, login } from "./driver.mjs";

const STYLES = process.argv.slice(2);
if (!STYLES.length) {
  console.error("usage: node tools/soak/armourprobe.mjs <style> [style ...]");
  process.exit(1);
}
const SLOT_OF = {
  leather: "armor", chain: "armor", plate: "armor", robe: "armor", scale: "armor", brigandine: "armor",
  cap: "helm", hood: "helm", full: "helm", horned: "helm", circlet: "helm",
  low: "boots", tall: "boots", plated: "boots", wrapped: "boots",
  cape: "cape", cloak: "cape", mantle: "cape", tabard: "cape",
};

const { browser, page } = await open({ headless: true, width: 900, height: 600 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") errors.push(`${m.type()}: ${m.text()}`);
});
await login(page, `Arm${Date.now() % 100000}`);
await page.waitForTimeout(1500);

for (const style of STYLES) {
  const out = await page.evaluate(async ({ style, slot }) => {
    const a = window.__wieldbound.localActor;
    a.setAppearance({ layers: { [slot]: { style, rarity: "honed" } } });
    await new Promise((r) => setTimeout(r, 1300));
    a.root.updateMatrixWorld(true);
    const V = a.position.constructor;
    const Box = a.root.constructor === Object ? null : null;

    // The body's own extent, for scale: the skinned mesh as it stands.
    let body = null;
    a.root.traverse((o) => { if (!body && o.isSkinnedMesh) body = o; });
    const bodyBox = { min: new V(+1e9, +1e9, +1e9), max: new V(-1e9, -1e9, -1e9) };
    if (body) {
      const pos = body.geometry.attributes.position;
      const v = new V();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
        bodyBox.min.min(v);
        bodyBox.max.max(v);
      }
    }

    const pieces = [];
    a.root.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith(`gear_${slot}_${style}`)) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      const corners = [];
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) corners.push(new V(x, y, z).applyMatrix4(o.matrixWorld));
        }
      }
      const lo = new V(+1e9, +1e9, +1e9);
      const hi = new V(-1e9, -1e9, -1e9);
      for (const c of corners) { lo.min(c); hi.max(c); }
      let bone = o.parent;
      while (bone && !bone.isBone) bone = bone.parent;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      pieces.push({
        piece: o.name.replace(`gear_${slot}_${style}_`, ""),
        bone: bone?.name ?? null,
        world: { lo: [lo.x, lo.y, lo.z].map((n) => +n.toFixed(3)), hi: [hi.x, hi.y, hi.z].map((n) => +n.toFixed(3)) },
        size: [hi.x - lo.x, hi.y - lo.y, hi.z - lo.z].map((n) => +n.toFixed(3)),
        colour: `#${mat?.color?.getHexString?.() ?? "??"}`,
        visible: o.visible,
      });
      void Box;
    });
    return {
      style,
      pieces,
      body: {
        lo: [bodyBox.min.x, bodyBox.min.y, bodyBox.min.z].map((n) => +n.toFixed(3)),
        hi: [bodyBox.max.x, bodyBox.max.y, bodyBox.max.z].map((n) => +n.toFixed(3)),
      },
      feet: +bodyBox.min.y.toFixed(3),
      crown: +bodyBox.max.y.toFixed(3),
    };
  }, { style, slot: SLOT_OF[style] });

  const height = out.crown - out.feet;
  console.log(`${out.style}: body ${height.toFixed(2)}m tall, ${out.pieces.length} pieces`);
  for (const p of out.pieces) {
    // Heights as a fraction of the figure, which is how a player reads them:
    // 0 is the ground, 1 the crown.
    const lo = ((p.world.lo[1] - out.feet) / height).toFixed(2);
    const hi = ((p.world.hi[1] - out.feet) / height).toFixed(2);
    console.log(`   ${p.piece.padEnd(10)} bone ${String(p.bone).padEnd(10)} height ${lo}..${hi} of the figure` +
      `   size ${p.size.join(" x ")}m   ${p.colour}${p.visible ? "" : "  HIDDEN"}`);
  }
  console.log(`   body box ${JSON.stringify(out.body.lo)} .. ${JSON.stringify(out.body.hi)}`);
}
console.log(errors.length ? `page errors:\n  ${errors.slice(0, 4).join("\n  ")}` : "no page errors");
await browser.close();
