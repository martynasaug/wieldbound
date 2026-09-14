// WHERE THE HEAD PIECES ACTUALLY LAND, IN THE RUNNING GAME.
//
//   node tools/soak/lookfit.mjs
//
// WHY THIS IS IN THE GAME AND NOT IN BLENDER. `fit_check.py` measured these in
// Blender and its renders never showed the head, so its numbers were never
// confirmed against anything. Worse, the piece files and `Player_Base.glb` do
// not agree about which axis is up — a Blender-space measurement has to guess a
// conversion, and guessing wrong yields numbers that look authoritative and are
// nonsense. In the game there is one frame and no conversion.
//
// THREE THINGS IT HAS TO GET RIGHT, each of which a simpler version got wrong:
//
//   * ONE POSE FOR BOTH. A look piece is a child of the Head BONE and carries
//     whatever the idle is doing; the body is SKINNED, and its stored vertices
//     never move. Comparing them as they sit measures the animation. The
//     skeleton is forced to bind pose and the mixer stopped.
//   * THE SKULL, NOT THE CHARACTER. The bind pose has the arms out, so the body
//     box is 1.75 wide and says nothing about a face.
//   * SKINNED VERTICES ONLY, FOR THE SKULL. The first version counted every
//     unskinned mesh as head geometry and swept up `held_dirk` — a dagger in the
//     character's hand — which put the skull's left edge 0.9 off centre and made
//     every piece overlap it. Every gap read 0.000 and the fit looked perfect.
import { open, login } from "./driver.mjs";

const HAIRS = ["swept", "shaggy"];
const BEARDS = ["moustache", "monk", "full"];

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await login(page, `Fit${Date.now() % 100000}`);
await page.waitForTimeout(1500);

const rows = await page.evaluate(async ({ hairs, beards }) => {
  const g = window.__wieldbound;
  const a = g.localActor;
  const out = [];

  const freeze = () => {
    if (a.mixer) a.mixer.stopAllAction();
    a.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    a.root.updateMatrixWorld(true);
  };

  let headIndex = -1;
  a.root.traverse((o) => {
    if (headIndex >= 0 || !o.isSkinnedMesh) return;
    headIndex = o.skeleton.bones.findIndex((b) => b.name === "Head");
  });

  const collect = (pred, pick) => {
    a.root.updateMatrixWorld(true);
    const pts = [];
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position || !pred(o)) return;
      // The outline pass clones each mesh, so every vertex would otherwise be
      // counted three times over. Geometry identity is what distinguishes them.
      if (seen.has(o.geometry.uuid)) return;
      seen.add(o.geometry.uuid);
      const p = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      for (let i = 0; i < p.count; i++) {
        if (pick && !pick(o, i)) continue;
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        pts.push([
          m[0]*x + m[4]*y + m[8]*z + m[12],
          m[1]*x + m[5]*y + m[9]*z + m[13],
          m[2]*x + m[6]*y + m[10]*z + m[14],
        ]);
      }
    });
    return pts;
  };

  const boxOf = (pts) => {
    if (!pts.length) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    return { lo, hi, n: pts.length };
  };
  const fmt = (b) => b ? `x[${b.lo[0].toFixed(2)},${b.hi[0].toFixed(2)}] y[${b.lo[1].toFixed(2)},${b.hi[1].toFixed(2)}] z[${b.lo[2].toFixed(2)},${b.hi[2].toFixed(2)}] n=${b.n}` : "MISSING";

  const headOwned = (o, i) => {
    if (!o.isSkinnedMesh) return false;   // see the note above: no held dagger
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    if (!si) return false;
    for (const c of ["X", "Y", "Z", "W"]) {
      if (si[`get${c}`](i) === headIndex && sw[`get${c}`](i) > 0.5) return true;
    }
    return false;
  };

  a.setLook({ skin: "tan", build: "average", hair: "none", beard: "none", hairColor: "espresso" });
  await new Promise((r) => setTimeout(r, 900));
  freeze();
  const skullPts = collect(() => true, headOwned);
  const skull = boxOf(skullPts);
  out.push(`SKULL      ${fmt(skull)}`);

  // How far a piece stands off the skull: for each of the piece's vertices, the
  // distance to the NEAREST skull vertex, and the smallest of those. A piece
  // resting on the head has a near-zero minimum; one hovering in front has the
  // size of the gap. A bounding-box overlap cannot see this — a beard floating
  // in front of the chin still overlaps the head's box.
  const standoff = (pts) => {
    let best = Infinity;
    for (const p of pts) {
      let d = Infinity;
      for (const s of skullPts) {
        const dx = p[0]-s[0], dy = p[1]-s[1], dz = p[2]-s[2];
        const v = dx*dx + dy*dy + dz*dz;
        if (v < d) d = v;
      }
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  const report = (label, slot) => {
    const pts = collect((o) => o.name === slot, null);
    const b = boxOf(pts);
    if (!b) { out.push(`${label} MISSING`); return; }
    out.push(`${label} ${fmt(b)}  standoff ${standoff(pts).toFixed(3)}`);
  };

  for (const hair of hairs) {
    a.setLook({ skin: "tan", build: "average", hair, beard: "none", hairColor: "espresso" });
    await new Promise((r) => setTimeout(r, 900));
    freeze();
    report(`hair ${hair.padEnd(10)}`, "look_hair");
  }
  for (const beard of beards) {
    a.setLook({ skin: "tan", build: "average", hair: "none", beard, hairColor: "espresso" });
    await new Promise((r) => setTimeout(r, 900));
    freeze();
    report(`beard ${beard.padEnd(9)}`, "look_beard");
  }
  return out;
}, { hairs: HAIRS, beards: BEARDS });

for (const r of rows) console.log(r);
if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
await browser.close();
