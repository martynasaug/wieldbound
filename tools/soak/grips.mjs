// HOW IS EVERY WEAPON ACTUALLY HELD?
//
// Reported: "some weapons like axes are held the opposite way (blade facing
// character), staves are held on the bottom for some reason, some wands are held
// upside down, some bows are held at the bottom too." All true, and all the same
// cause: the grip fitting knows a weapon's LENGTH and nothing else. It points the
// longest axis down the hand and puts the butt in the fist — right for a sword,
// wrong for a staff held a third of the way up, a bow held in the middle, or an
// axe whose edge can end up on either side.
//
// So this measures, per item, on the real character in its idle pose:
//
//   hand at   where the fist sits along the weapon, 0 = butt, 1 = tip
//   length    which way the weapon's length points: up / forward / right
//   edge      which way its local +X (the edge side of a generated model) points
//
// and photographs each from the front and the side onto one contact sheet, so a
// wrong grip is a number AND a picture.
//
//   node tools/soak/grips.mjs [out] [id|family ...]
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

const OUT = process.argv[2] ?? "tools/soak/shots/grips";
const FILTER = process.argv.slice(3);
mkdirSync(OUT, { recursive: true });

const bases = Object.values(ITEM_BASES).filter((b) => b.slot === "weapon" || b.slot === "offhand");
const wanted = bases.filter((b) => !FILTER.length || FILTER.includes(b.id) || FILTER.includes(b.weaponType ?? b.slot));

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Grips${Date.now() % 100000}`);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__gripHold?.();
    render(s, c);
  };
});
await page.waitForTimeout(1500);

// GRIPS_SHOTS=0 measures every item without photographing it: a fast pass
// for the numbers, before spending the photos on the ones that look wrong.
const NUMBERS_ONLY = process.env.GRIPS_SHOTS === "0";
const SHOTS = [
  { anim: "idle", frac: 0.3, yaw: 0 },
  { anim: "idle", frac: 0.3, yaw: Math.PI / 2 },
  { anim: "run", frac: 0.25, yaw: null },
  { anim: "attack", frac: 0.45, yaw: Math.PI / 2 },
];

const rows = [];
const fmt =(v) => (v >= 0 ? "+" : "") + v.toFixed(2);
for (const base of wanted) {
  const offhand = base.slot === "offhand";
  await page.evaluate(({ id, offhand, weaponType }) => {
    const a = window.__wieldbound.localActor;
    a.setAppearance(
      offhand
        ? { weaponType: "sword", weaponRarity: "honed", weaponBaseId: "armingsword", offhandBaseId: id, offhandRarity: "honed", layers: {} }
        : { weaponType, weaponRarity: "honed", weaponBaseId: id, layers: {} },
    );
  }, { id: base.id, offhand, weaponType: base.weaponType });
  const measured = await page
    .waitForFunction((id) => {
      const a = window.__wieldbound.localActor;
      let mesh = null;
      a.root.traverse((o) => { if (o.name === `held_${id}` && o.isMesh) mesh = o; });
      if (!mesh) return null;
      a.root.updateMatrixWorld(true);
      const V = mesh.position.constructor;
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      const m = mesh.matrixWorld;
      const e = m.elements;
      const axis = (i) => new V(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]).normalize();
      const h = a.heading;
      const forward = new V(Math.sin(h), 0, Math.cos(h));
      const up = new V(0, 1, 0);
      const right = new V().crossVectors(forward, up).normalize();
      const butt = new V(0, 0, bb.min.z).applyMatrix4(m);
      const tip = new V(0, 0, bb.max.z).applyMatrix4(m);
      const hand = new V();
      (mesh.parent?.userData?.handBone ?? mesh.parent).getWorldPosition(hand);
      // The socket bone is the hand; the held object may sit in a holder under it.
      let socket = mesh.parent;
      while (socket && !socket.isBone) socket = socket.parent;
      if (socket) socket.getWorldPosition(hand);
      const along = tip.clone().sub(butt);
      const handAt = along.lengthSq() ? hand.clone().sub(butt).dot(along) / along.lengthSq() : 0;
      const z = axis(2);
      const x = axis(0);
      // THE FIST IN THE ITEM'S OWN SPACE, undoing the item's scale. The fitting
      // puts every item's grip at one point of the socket, so this should read
      // the same for every right-hand item — one that differs is fitted wrong,
      // whatever its photo looks like.
      const fist = mesh.worldToLocal(hand.clone()).multiplyScalar(mesh.scale.x);
      // AND HOW FAR THE FIST IS FROM THE ITEM AT ALL, in metres. Against points
      // along every triangle's edges and across its face, not its vertices: a
      // staff's shaft has vertices only at its two ends, and runs straight
      // through the fist between them.
      const pos = mesh.geometry.attributes.position;
      const idx = mesh.geometry.index;
      const tri = [new V(), new V(), new V()];
      const q = new V();
      let nearest = Infinity;
      const triangles = (idx ? idx.count : pos.count) / 3;
      for (let t = 0; t < triangles; t++) {
        for (let k = 0; k < 3; k++) tri[k].fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k).applyMatrix4(m);
        for (let s = 0; s <= 12; s++) {
          for (let u = 0; u <= 12 - s; u++) {
            const w = 12 - s - u;
            q.set(0, 0, 0).addScaledVector(tri[0], s / 12).addScaledVector(tri[1], u / 12).addScaledVector(tri[2], w / 12);
            nearest = Math.min(nearest, q.distanceTo(hand));
          }
        }
      }
      return {
        handAt,
        length: [z.dot(up), z.dot(forward), z.dot(right)],
        edge: [x.dot(up), x.dot(forward), x.dot(right)],
        size: along.length(),
        fist: [fist.x, fist.y, fist.z],
        gap: nearest,
      };
    }, base.id, { timeout: 8000 })
    .then((h) => h.jsonValue())
    .catch(() => null);

  // FOUR SHOTS, BECAUSE ONE POSE LIED. The first version shot only the idle,
  // close up, and every bow looked upright in it — while in the run, seen from
  // the game's own camera, the same bows lay flat and pointed forward. So: idle
  // from the front and the side, the run from the game camera, and the attack
  // frozen part-way, which for a bow is the draw.
  const tiles = [];
  for (const shot of NUMBERS_ONLY ? [] : SHOTS) {
    await page.evaluate(({ anim, frac, yaw }) => {
      const g = window.__wieldbound;
      const a = g.localActor;
      // The game re-picks the animation every frame from movement; take the
      // actor's `play` away from it for the length of the run.
      if (!a.__realPlay) {
        a.__realPlay = a.play.bind(a);
        a.play = () => {};
      }
      // ONE POSE AT A TIME. With the clock frozen a cross-fade never finishes,
      // so the last item's attack stayed blended into the next item's idle —
      // a focus photographed up by its owner's ear.
      a.mixer.stopAllAction();
      a.mixer.timeScale = 1;
      a.__realPlay(anim, true);
      const action = a.actions.get(anim);
      if (action) {
        a.mixer.stopAllAction();
        action.reset().setEffectiveWeight(1).play();
        action.time = action.getClip().duration * frac;
      }
      a.mixer.update(0.0001);
      a.mixer.timeScale = 0;
      g.__gripHold = yaw === null ? null : () => {
        const target = a.position.clone();
        target.y += 1.0;
        const f = a.heading + yaw;
        g.world.camera.position.set(target.x + Math.sin(f) * 2.6, target.y + 0.35, target.z + Math.cos(f) * 2.6);
        g.world.camera.lookAt(target);
      };
    }, shot);
    await page.waitForTimeout(shot.yaw === null ? 900 : 350);
    // The game camera stands well back; crop to the character, not the street.
    const clip = shot.yaw === null ? { x: 560, y: 360, width: 160, height: 224 } : { x: 440, y: 120, width: 400, height: 560 };
    tiles.push((await page.screenshot({ clip })).toString("base64"));
  }
  const label = `${base.name} (${base.id})`;
  const line = measured
    ? `hand at ${measured.handAt.toFixed(2)}   gap ${measured.gap.toFixed(3)}m` +
      `   length up ${fmt(measured.length[0])} fwd ${fmt(measured.length[1])} right ${fmt(measured.length[2])}`
    : "NOT IN HAND";
  console.log(`${(base.weaponType ?? "offhand").padEnd(7)} ${base.id.padEnd(16)} ${line}`);
  rows.push({ label, line, tiles });
}

if (NUMBERS_ONLY) {
  console.log(errors.length ? `page errors:\n  ${errors.slice(0, 3).join("\n  ")}` : "no page errors");
  await browser.close();
  process.exit(0);
}

// One sheet per run: the shots per item side by side.
const sheet = await page.evaluate(async ({ rows, big }) => {
  // GRIPS_BIG=1 for full-size tiles, two items a row: small tiles are enough
  // to see which end is up, not which way an edge or a shield's face points.
  const tileW = big ? 400 : 200, tileH = big ? 560 : 280, head = 34, perRow = big ? 1 : 2;
  const cellW = tileW * rows[0].tiles.length + 10;
  const canvas = document.createElement("canvas");
  canvas.width = perRow * cellW;
  canvas.height = Math.ceil(rows.length / perRow) * (tileH + head);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#15110d";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, row] of rows.entries()) {
    const x0 = (i % perRow) * cellW;
    const y0 = Math.floor(i / perRow) * (tileH + head);
    for (const [k, data] of row.tiles.entries()) {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      ctx.drawImage(img, x0 + k * tileW, y0 + head, tileW, tileH);
    }
    ctx.fillStyle = "#f0dcaa";
    ctx.font = "13px Georgia";
    ctx.fillText(row.label, x0 + 6, y0 + 14);
    ctx.fillStyle = "#b8a684";
    ctx.font = "10px monospace";
    ctx.fillText(row.line.replace(/\s+/g, " ").slice(0, 70), x0 + 6, y0 + 28);
  }
  return canvas.toDataURL("image/png").split(",")[1];
}, { rows, big: !!process.env.GRIPS_BIG });

const name = FILTER.length ? `grips-${FILTER.join("-")}` : "grips";
writeFileSync(`${OUT}/${name}.png`, Buffer.from(sheet, "base64"));
console.log(errors.length ? `page errors:\n  ${errors.slice(0, 3).join("\n  ")}` : "no page errors");
console.log(`sheet: ${OUT}/${name}.png`);
await browser.close();
