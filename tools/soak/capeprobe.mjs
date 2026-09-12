// WHERE DOES EACH LINK OF THE CAPE ACTUALLY HANG?
//
// A cape is a chain now — `Cape0` from the torso, `Cape1` from `Cape0` — and a
// chain is exactly the kind of thing that looks plausible in code and lands a
// metre behind the character. Photographs cost a round trip each and cannot
// tell "the hinge is wrong" from "the panel is too narrow", so this reports the
// numbers: every link's parent, its hinge, and where its geometry ends up in
// the world against the torso it hangs from.
//
//   node tools/soak/capeprobe.mjs [style ...]
import { open, login } from "./driver.mjs";

const STYLES = process.argv.slice(2).length ? process.argv.slice(2) : ["cape", "cloak", "mantle", "tabard"];
const PALETTE = { cape: "crimson", cloak: "wood", mantle: "silver", tabard: "verdant" };

const { browser, page } = await open({ headless: true, width: 900, height: 600 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") errors.push(`${m.type()}: ${m.text()}`);
});
await login(page, `Cape${Date.now() % 100000}`);
await page.waitForTimeout(1500);

for (const style of STYLES) {
  const out = await page.evaluate(async ({ style, palette }) => {
    const a = window.__wieldbound.localActor;
    a.setAppearance({ layers: { cape: { style, rarity: "honed", palette } } });
    await new Promise((r) => setTimeout(r, 1200));
    a.root.updateMatrixWorld(true);
    const V = a.position.constructor;

    let torso = null;
    a.root.traverse((o) => { if (o.isBone && o.name === "Torso") torso = o; });
    const torsoAt = new V();
    torso?.getWorldPosition(torsoAt);

    const links = [];
    a.root.traverse((o) => {
      if (!o.isMesh || !o.name.includes("Cape")) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      const lo = new V(+1e9, +1e9, +1e9);
      const hi = new V(-1e9, -1e9, -1e9);
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) {
            const p = new V(x, y, z).applyMatrix4(o.matrixWorld);
            lo.min(p);
            hi.max(p);
          }
        }
      }
      const chain = [];
      for (let p = o.parent; p && chain.length < 6; p = p.parent) {
        chain.push(p.name || p.type);
        if (p.isBone) break;
      }
      links.push({
        name: o.name.split("_").pop(),
        chain,
        local: [o.position.x, o.position.y, o.position.z].map((n) => +n.toFixed(3)),
        joint: o.parent ? [o.parent.position.x, o.parent.position.y, o.parent.position.z].map((n) => +n.toFixed(3)) : null,
        worldLo: [lo.x, lo.y, lo.z].map((n) => +n.toFixed(3)),
        worldHi: [hi.x, hi.y, hi.z].map((n) => +n.toFixed(3)),
        width: +(hi.x - lo.x).toFixed(3),
        drop: +(hi.y - lo.y).toFixed(3),
        behind: +(torsoAt.z - (lo.z + hi.z) / 2).toFixed(3),
      });
    });
    return {
      style,
      torso: [torsoAt.x, torsoAt.y, torsoAt.z].map((n) => +n.toFixed(3)),
      links,
      swing: a.capeLinks?.length ?? 0,
    };
  }, { style, palette: PALETTE[style] ?? "steel" });

  console.log(`${out.style}: torso at ${JSON.stringify(out.torso)}, ${out.links.length} link meshes, ${out.swing} joints swinging`);
  for (const l of out.links) {
    console.log(`   ${l.name.padEnd(7)} joint ${JSON.stringify(l.joint)} local ${JSON.stringify(l.local)}`);
    console.log(`           world ${JSON.stringify(l.worldLo)}..${JSON.stringify(l.worldHi)}` +
      `  width ${l.width}m drop ${l.drop}m  behind torso ${l.behind}m  chain ${l.chain.join(" < ")}`);
  }
}
console.log(errors.length ? `page errors:\n  ${errors.slice(0, 4).join("\n  ")}` : "no page errors");
await browser.close();
