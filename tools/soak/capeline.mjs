// DOES THE CAPE HANG BEHIND THE BODY, OR THROUGH IT?
//
//   node tools/soak/capeline.mjs
//
// From the side every cape reads as a flat plank standing off the back, and the
// z stations in `cape_back` run -26 at the collar to -41 at the hem while the
// BODY's own back reaches -36 at the waist. If that is right, the cloth passes
// through the figure halfway down. This samples both by height and prints them
// side by side.
import { open, login } from "./driver.mjs";

const STYLES = ["cape", "cloak", "mantle", "tabard"];
const BANDS = 8;

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Cape${Date.now() % 100000}`);
await page.waitForTimeout(2400);

const rows = await page.evaluate(async ({ styles, bands }) => {
  const a = window.__wieldbound.localActor;
  const out = [];
  const freeze = () => {
    if (a.mixer) a.mixer.stopAllAction();
    a.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    a.root.updateMatrixWorld(true);
  };
  const xf = (m, x, y, z) => [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
  ];

  freeze();
  // The body's own back line, by height: the SMALLEST z at each band, near the
  // centre so a swinging arm is not mistaken for the spine.
  let body = null;
  a.root.traverse((o) => { if (!body && o.isSkinnedMesh && !/^worn_/.test(o.name)) body = o; });
  const bp = body.geometry.attributes.position, bm = body.matrixWorld.elements;
  const pts = [];
  for (let i = 0; i < bp.count; i++) pts.push(xf(bm, bp.getX(i), bp.getY(i), bp.getZ(i)));
  const midX = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
  const torso = pts.filter((p) => Math.abs(p[0] - midX) < 0.08 && p[1] > 0.7 && p[1] < 1.45);
  const lo = Math.min(...torso.map((p) => p[1])), hi = Math.max(...torso.map((p) => p[1]));
  const step = (hi - lo) / bands;
  const backOf = (list, i) => {
    const band = list.filter((p) => p[1] >= lo + i * step && p[1] < lo + (i + 1) * step);
    return band.length ? Math.min(...band.map((p) => p[2])) : null;
  };
  const bodyBack = [];
  for (let i = 0; i < bands; i++) bodyBack.push(backOf(torso, i));

  for (const style of styles) {
    a.setAppearance({ layers: { cape: { style, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1500));
    freeze();
    const cp = [];
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !/^gear_cape_/.test(o.name) || seen.has(o.uuid)) return;
      seen.add(o.uuid);
      const p = o.geometry.attributes.position, m = o.matrixWorld.elements;
      for (let i = 0; i < p.count; i++) cp.push(xf(m, p.getX(i), p.getY(i), p.getZ(i)));
    });
    const near = cp.filter((p) => Math.abs(p[0] - midX) < 0.08);
    const cells = [];
    for (let i = 0; i < bands; i++) {
      const b = bodyBack[i];
      const band = near.filter((p) => p[1] >= lo + i * step && p[1] < lo + (i + 1) * step);
      if (b === null || !band.length) { cells.push("  -  "); continue; }
      // How far BEHIND the body's back the cloth sits. Negative means it is in
      // front of the back line, i.e. inside the figure.
      const gap = b - Math.max(...band.map((p) => p[2]));
      cells.push((gap >= 0 ? "+" : "") + gap.toFixed(3));
    }
    out.push(`${style.padEnd(8)} ${cells.join(" ")}`);
  }
  out.unshift(`${"".padEnd(8)} ` + Array.from({ length: bands }, (_, i) => `band${i + 1}`.padStart(6)).join(" "));
  out.unshift("how far the cloth sits BEHIND the body's own back, by height (low to high)");
  return out;
}, { styles: STYLES, bands: BANDS });

for (const r of rows) console.log(r);
console.log("\nnegative = the cloth is in front of the back line, i.e. inside the figure.");
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
