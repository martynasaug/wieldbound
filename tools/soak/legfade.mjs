// CAN A LOW PROP HIDE YOUR LEGS WITHOUT THE FADE NOTICING?
//
// `World.clearDistance` casts FIVE rays spread from above the head to the
// ankles, and says why in a comment: "a camera with clear sight of their chest
// can still have a wall across their legs... the watchpost and the chapel both
// still ate the bottom half of the character while the ray reported clear."
//
// `Game.fadeOccluders` casts ONE, to a point 1.0 above the actor's feet. So the
// same mistake that was found and fixed for the camera is still live in the
// thing that decides what goes translucent — in theory. M70.241 recorded it
// with no observed instance, because the case that suggested it (the town wall)
// turned out to be a different bug entirely.
//
// A BARREL IS THE SHAPE THAT WOULD DO IT: about a metre tall, so it covers the
// legs and passes under the one ray. This stands the character directly behind
// each town prop, relative to the camera, and asks whether anything faded.
//
//   node tools/soak/legfade.mjs Player3619 tools/soak/shots/legfade
import { mkdirSync } from "node:fs";
import { open, login, approach } from "./driver.mjs";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../../shared/protocol-types.ts";

// The client works in world units and the driver walks in server pixels.
// heightfield.ts: serverX = worldX * PX_PER_UNIT + WORLD_WIDTH / 2.
const PX_PER_UNIT = 40;
const toServer = (wx, wz) => ({
  x: wx * PX_PER_UNIT + WORLD_WIDTH / 2,
  y: wz * PX_PER_UNIT + WORLD_HEIGHT / 2,
});

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/legfade";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.5));
await new Promise((r) => setTimeout(r, 2000));

// Town props: the barrels, crates and chest dressed round the square. They are
// children of the town group and short, which is the whole point.
const props = await page.evaluate(() => {
  const g = window.__wieldbound;
  const out = [];
  const dir = g.world.cameraDir;
  for (const child of g.town.group.children) {
    child.updateMatrixWorld(true);
    // Height from the object's own bounds, computed the cheap way.
    let lo = Infinity, hi = -Infinity, cx = 0, cz = 0, n = 0;
    child.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      const m = o.matrixWorld.elements;
      for (let i = 0; i < 8; i++) {
        const x = i & 1 ? bb.max.x : bb.min.x;
        const y = i & 2 ? bb.max.y : bb.min.y;
        const z = i & 4 ? bb.max.z : bb.min.z;
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        lo = Math.min(lo, wy); hi = Math.max(hi, wy);
        cx += wx; cz += wz; n++;
      }
    });
    if (!n || !isFinite(lo)) continue;
    const height = hi - lo;
    // Waist-high or lower: tall enough to hide legs, short enough to duck the
    // single chest-height ray.
    if (height < 0.3 || height > 1.6) continue;
    out.push({ x: cx / n, y: hi, z: cz / n, height: +height.toFixed(2) });
  }
  return { props: out.slice(0, 8), dir: { x: dir.x, y: dir.y, z: dir.z } };
});

console.log(`${props.props.length} waist-high prop(s) in town`);
if (!props.props.length) { console.log("nothing to stand behind"); await browser.close(); process.exit(0); }

const state = () => page.evaluate(() => {
  const g = window.__wieldbound;
  return {
    faded: g.fadedMaterials ? g.fadedMaterials.size : -1,
    candidates: g.occluderCandidates ? g.occluderCandidates.length : -1,
    dist: +g.world.cameraDistance.toFixed(2),
    blocked: g.world.cameraBlocked,
  };
});

let found = 0;
for (const [i, p] of props.props.entries()) {
  // Stand on the far side of the prop from the camera: the camera sits at
  // player + dir * distance, so the prop is in the way when the player is at
  // prop - dir * (a bit).
  // FAR ENOUGH BACK TO ACTUALLY GET THERE. At 1.4 units the target sits inside
  // the prop's own collision radius, so the walk stopped short and the first
  // run photographed a character standing in the open square with the barrels
  // behind them — then reported "nothing faded", which was true and meant
  // nothing.
  const target = toServer(p.x - props.dir.x * 3.0, p.z - props.dir.z * 3.0);
  for (let n = 0; n < 22; n++) await approach(page, target, 400);
  await new Promise((r) => setTimeout(r, 700));
  const s = await state();
  // IS THE PROP ACTUALLY IN THE WAY? Distance from the prop to the segment
  // between camera and player. Without this the run reports "nothing faded"
  // for a character standing nowhere near it, which is not a finding.
  const geom = await page.evaluate((q) => {
    const g = window.__wieldbound;
    const a = g.world.camera.position;
    const b = g.localActor.position;
    const abx = b.x - a.x, abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 ? Math.max(0, Math.min(1, ((q.x - a.x) * abx + (q.z - a.z) * abz) / len2)) : 0;
    const px = a.x + abx * t, pz = a.z + abz * t;
    return { off: +Math.hypot(q.x - px, q.z - pz).toFixed(2), t: +t.toFixed(2) };
  }, p);
  const inTheWay = geom.off < 1.0 && geom.t > 0.05 && geom.t < 0.95;
  console.log(
    `  prop ${i} (${p.height}u tall): ${inTheWay ? "IN THE WAY" : "not in the way"} ` +
      `(off ${geom.off}u, t ${geom.t})  faded ${s.faded}  camera ${s.dist}${s.blocked ? " blocked" : ""}`,
  );
  await page.screenshot({ path: `${OUT}/prop-${i}.png` });
  if (inTheWay && s.faded === 0) found++;
}
console.log(`\n${found} of ${props.props.length} stops had a prop in the way and nothing faded`);
await browser.close();
