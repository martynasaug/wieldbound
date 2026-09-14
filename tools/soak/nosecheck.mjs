// DOES THE GAME PUT A MONK PIECE WHERE THE FILE SAYS IT GOES?
//
//   node tools/soak/nosecheck.mjs
//
// `face_register.py` showed that `Monk_nose.glb` and the player's own
// `Face_nose` are the same 32 vertices in the same place, and I read that as
// proof that Monk-derived pieces are correctly framed. IT IS NOT. That test
// compared two FILES in Blender. The game does not draw files: it hangs a piece
// off the Head bone through `boneAttachMatrix`, and whether THAT lands where the
// file says is a separate question I never asked.
//
// It is answerable exactly, and this is the way to ask it. The player's body
// already carries `Face_nose` as a mesh, baked on by `base_body.py`. Sending the
// SAME nose through the look-piece path puts the two in one frame: if the worn
// copy lands on the baked one, placement is sound and the misplaced beards are a
// cutting problem. If it lands somewhere else, that offset is the bug, it is the
// same offset for every Monk piece, and no amount of re-cutting would have fixed
// it.
//
// A NOSE IS THE RIGHT PROBE because it is the one piece whose correct answer is
// already on the model to compare against. Any beard would leave me judging by
// eye again.
import { open, login } from "./driver.mjs";

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await login(page, `Nose${Date.now() % 100000}`);
await page.waitForTimeout(2000);

const out = await page.evaluate(async () => {
  const g = window.__wieldbound;
  const a = g.localActor;
  const lines = [];

  const freeze = () => {
    if (a.mixer) a.mixer.stopAllAction();
    a.root.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
    a.root.updateMatrixWorld(true);
  };

  const boxOf = (match) => {
    a.root.updateMatrixWorld(true);
    let lo = null, hi = null, n = 0;
    const seen = new Set();
    a.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position || !match(o)) return;
      // The outline pass clones each mesh; one geometry counted three times is
      // the same box, but the vertex count would lie.
      if (seen.has(o.geometry.uuid)) return;
      seen.add(o.geometry.uuid);
      const p = o.geometry.attributes.position;
      const m = o.matrixWorld.elements;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const w = [
          m[0]*x + m[4]*y + m[8]*z + m[12],
          m[1]*x + m[5]*y + m[9]*z + m[13],
          m[2]*x + m[6]*y + m[10]*z + m[14],
        ];
        n++;
        if (!lo) { lo = [...w]; hi = [...w]; }
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
      }
    });
    return lo ? { lo, hi, n } : null;
  };
  const fmt = (b) => b ? `x[${b.lo[0].toFixed(3)},${b.hi[0].toFixed(3)}] y[${b.lo[1].toFixed(3)},${b.hi[1].toFixed(3)}] z[${b.lo[2].toFixed(3)},${b.hi[2].toFixed(3)}] n=${b.n}` : "MISSING";
  const mid = (b) => [0,1,2].map((k) => (b.lo[k] + b.hi[k]) / 2);

  // A beard first, only to borrow a live THREE.Color from it — the harness runs
  // in the page, where the module's own imports are not reachable.
  a.setLook({ skin: "tan", build: "average", hair: "none", beard: "monk", hairColor: "espresso" });
  await new Promise((r) => setTimeout(r, 1200));
  const colour = a.lookPieces.get("beard")?.material?.color;
  if (!colour) return ["no beard material to borrow a colour from"];

  freeze();
  const baked = boxOf((o) => o.name === "Face_nose");
  lines.push(`BAKED  Face_nose   ${fmt(baked)}`);

  // The same nose, through the look-piece path. `applyLookPiece` is private in
  // TypeScript only; at runtime it is an ordinary method, and calling it here
  // avoids adding a debug style to the shipped tables.
  a.applyLookPiece("beard", "Monk_nose", colour);
  await new Promise((r) => setTimeout(r, 1400));
  freeze();
  const worn = boxOf((o) => o.name === "look_beard");
  lines.push(`WORN   Monk_nose   ${fmt(worn)}`);

  if (baked && worn) {
    const d = mid(worn).map((v, k) => v - mid(baked)[k]);
    lines.push(`OFFSET worn - baked (${d[0].toFixed(3)}, ${d[1].toFixed(3)}, ${d[2].toFixed(3)})`);
    lines.push(worn.n === baked.n
      ? `same vertex count (${worn.n}) — the same nose both ways`
      : `DIFFERENT vertex counts: baked ${baked.n}, worn ${worn.n}`);
  }
  return lines;
});

for (const l of out) console.log(l);
if (errors.length) console.log("ERRORS:", errors.slice(0, 4));
await browser.close();
