// DOES THE ARMOUR READ AGAINST THE BODY, IN NUMBERS?
//
// Reported: "All the armors are barely visible, they're basically blended in
// with the body." Judging that by eye is what let it ship — a dark brown piece
// on a dark brown body looks fine in a bright screenshot and vanishes at
// gameplay distance. So this measures it.
//
// For each armour item it equips the piece alone, reads the average colour of
// the pixels the piece covers and of the bare body beside it, and reports the
// difference in LIGHTNESS and in HUE. A piece whose lightness is within a few
// per cent of the skin and cloth behind it is the complaint, whatever its name.
//
//   node tools/soak/contrast.mjs [slot ...]
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

const SLOTS = process.argv.slice(2).length ? process.argv.slice(2) : ["armor", "helm", "boots", "cape"];
const bases = Object.values(ITEM_BASES).filter((b) => SLOTS.includes(b.slot) && b.style);

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, `Contrast${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  // NOON, AND FACING THE SUN. The reference strip of bare arm read 0.24 on one
  // run and 0.125 on the next — not because anything changed, but because the
  // arm was in its own shade, and every difference here is measured against it.
  // A fixed time of day is not enough; the camera side has to be the lit side.
  g.world.dayNight.freeze(0.5);
  const lit = g.localActor;
  lit.heading = Math.PI;
  lit.root.rotation.y = Math.PI;
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__contrastHold?.();
    render(s, c);
  };
  const a = g.localActor;
  g.__contrastHold = () => {
    const target = a.position.clone();
    target.y += 0.95;
    const f = a.heading;
    g.world.camera.position.set(target.x + Math.sin(f) * 2.6, target.y + 0.2, target.z + Math.cos(f) * 2.6);
    g.world.camera.lookAt(target);
  };
});
await page.waitForTimeout(1500);

const luma = (p) => (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255;

/** Average colour of a screenshot region, ignoring the sky. */
async function sample(clip) {
  const shot = await page.screenshot({ clip });
  const px = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      // Sky is the one thing in frame that is not the character or the street.
      if (d[i + 2] > 150 && d[i + 2] > d[i] + 20) continue;
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return n ? [r / n, g / n, b / n] : [0, 0, 0];
  }, shot.toString("base64"));
  return px;
}

// WHERE THE PIECE ACTUALLY IS, not where I guessed it would be. Fixed screen
// rectangles reported the same three numbers for every item in the catalogue —
// including the body strip, which never changes — because both windows were
// sitting on the street behind the character. The piece's own mesh is projected
// to screen space each time instead, and the body is sampled from the torso
// bone beside it.
async function windows() {
  return page.evaluate(() => {
    const g = window.__wieldbound;
    const a = g.localActor;
    const cam = g.world.camera;
    const V = a.position.constructor;
    a.root.updateMatrixWorld(true);
    const canvas = g.world.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const project = (points) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of points) {
        const q = p.clone().project(cam);
        x0 = Math.min(x0, ((q.x + 1) / 2) * w);
        x1 = Math.max(x1, ((q.x + 1) / 2) * w);
        y0 = Math.min(y0, ((1 - q.y) / 2) * h);
        y1 = Math.max(y1, ((1 - q.y) / 2) * h);
      }
      return { x0, y0, x1, y1 };
    };

    const corners = (mesh) => {
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox;
      const out = [];
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) out.push(mesh.localToWorld(new V(x, y, z)));
        }
      }
      return out;
    };

    let piece = null;
    a.root.traverse((o) => {
      if (o.isMesh && o.name.startsWith("gear_") && o.name.includes("Torso")) piece = o;
    });
    if (!piece) a.root.traverse((o) => { if (!piece && o.isMesh && o.name.startsWith("gear_")) piece = o; });
    if (!piece) return null;

    // A strip of the upper arm, which no chest piece covers.
    let arm = null;
    a.root.traverse((o) => { if (o.isBone && o.name === "UpperArmL") arm = o; });
    const armAt = new V();
    arm?.getWorldPosition(armAt);

    const p = project(corners(piece));
    const inset = (r, k) => ({
      x: Math.round(r.x0 + (r.x1 - r.x0) * k),
      y: Math.round(r.y0 + (r.y1 - r.y0) * k),
      width: Math.max(8, Math.round((r.x1 - r.x0) * (1 - 2 * k))),
      height: Math.max(8, Math.round((r.y1 - r.y0) * (1 - 2 * k))),
    });
    const armBox = project([armAt.clone().add(new V(0.06, 0.10, 0)), armAt.clone().add(new V(0.14, -0.06, 0))]);
    return { piece: inset(p, 0.28), body: inset(armBox, 0.1) };
  });
}

console.log("item                       piece      body       dL     contrast");
for (const base of bases) {
  await page.evaluate((layer) => {
    const a = window.__wieldbound.localActor;
    a.setAppearance({ layers: { [layer.slot]: layer.value } });
    // THE SAME POSE EVERY TIME, or the reference drifts: the body strip read
    // 0.168 on one run and 0.237 on the next, purely because the arm had moved
    // into its own shadow, and every difference below is measured against it.
    if (!a.__realPlay) {
      a.__realPlay = a.play.bind(a);
      a.play = () => {};
    }
    a.mixer.stopAllAction();
    a.mixer.timeScale = 1;
    a.__realPlay("idle", true);
    const action = a.actions.get("idle");
    if (action) {
      a.mixer.stopAllAction();
      action.reset().setEffectiveWeight(1).play();
      action.time = 0.25;
    }
    a.mixer.update(0.0001);
    a.mixer.timeScale = 0;
  }, { slot: base.slot, value: { style: base.style, rarity: "honed", palette: base.art.palette } });
  await page.waitForTimeout(900);
  const boxes = await windows();
  if (!boxes) {
    console.log(`${base.name.padEnd(26)} — nothing drawn`);
    continue;
  }
  const piece = await sample(boxes.piece);
  const body = await sample(boxes.body);
  // SEPARATION, AS A RATIO, NOT A SIGNED DIFFERENCE. Absolute lightness moves
  // with wherever the sun is: turning the character to face it lifted the bare
  // skin from 0.13 to 0.55 and every piece with it, which called Bone Cuirass
  // at 0.502 "dark" against skin at 0.564. What a player actually sees is the
  // CONTRAST between the piece and the body beside it, so that is what is
  // measured — Weber contrast, which is scale-free — plus a floor on the
  // piece's own lightness, because a black blob reads as a hole whatever the
  // ratio says.
  const dL = luma(piece) - luma(body);
  const contrast = Math.abs(dL) / Math.max(luma(body), 0.01);
  const flag = contrast < 0.18
    ? "  <-- blends in"
    : luma(piece) < 0.08
      ? "  <-- too dark to read"
      : "";
  console.log(
    `${base.name.padEnd(26)} ${luma(piece).toFixed(3).padStart(5)}      ${luma(body).toFixed(3).padStart(5)}` +
      `      ${dL >= 0 ? "+" : ""}${dL.toFixed(3)}    ${contrast.toFixed(2).padStart(5)}${flag}`,
  );
}
await browser.close();
