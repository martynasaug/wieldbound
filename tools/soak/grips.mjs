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

const rows = [];
const fmt = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
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
      return {
        handAt,
        length: [z.dot(up), z.dot(forward), z.dot(right)],
        edge: [x.dot(up), x.dot(forward), x.dot(right)],
        size: along.length(),
      };
    }, base.id, { timeout: 8000 })
    .then((h) => h.jsonValue())
    .catch(() => null);

  const tiles = [];
  for (const yaw of [0, Math.PI / 2]) {
    await page.evaluate((yaw) => {
      const g = window.__wieldbound;
      const a = g.localActor;
      g.__gripHold = () => {
        const target = a.position.clone();
        target.y += 1.0;
        const f = a.heading + yaw;
        g.world.camera.position.set(target.x + Math.sin(f) * 2.6, target.y + 0.35, target.z + Math.cos(f) * 2.6);
        g.world.camera.lookAt(target);
      };
    }, yaw);
    await page.waitForTimeout(350);
    tiles.push((await page.screenshot({ clip: { x: 440, y: 120, width: 400, height: 560 } })).toString("base64"));
  }
  const label = `${base.name} (${base.id})`;
  const line = measured
    ? `hand at ${measured.handAt.toFixed(2)}   length up ${fmt(measured.length[0])} fwd ${fmt(measured.length[1])} right ${fmt(measured.length[2])}` +
      `   edge up ${fmt(measured.edge[0])} fwd ${fmt(measured.edge[1])} right ${fmt(measured.edge[2])}`
    : "NOT IN HAND";
  console.log(`${(base.weaponType ?? "offhand").padEnd(7)} ${base.id.padEnd(16)} ${line}`);
  rows.push({ label, line, tiles });
}

// One sheet per run: two views per item, three items per row.
const sheet = await page.evaluate(async ({ rows, big }) => {
  // GRIPS_BIG=1 for full-size tiles, two items a row: small tiles are enough
  // to see which end is up, not which way an edge or a shield's face points.
  const tileW = big ? 400 : 200, tileH = big ? 560 : 280, head = 34, perRow = big ? 2 : 3;
  const cellW = tileW * 2 + 10;
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
