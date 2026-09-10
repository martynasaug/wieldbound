// STAND BEHIND THE STATUE AND SEE IF IT GETS OUT OF THE WAY.
//
// The statue is added straight to the town group, so it was in neither
// `buildings` nor `decor` — the two lists `refreshOccluderCandidates` builds
// from — and a player behind it was hidden from the chest down with nothing
// fading and no camera pull. It stands in the middle of the busiest square in
// the game. Same structural gap M70.241 found in the palisade.
//
// Three questions: does it fade, does it compile a shader the first time it
// does (the M70.144 failure class, and the statue loads ASYNCHRONOUSLY so the
// warm pass may have run before it existed), and does the character read.
//
//   node tools/soak/statuefade.mjs Player3619 tools/soak/shots/statue
import { mkdirSync } from "node:fs";
import { open, login, approach } from "./driver.mjs";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../../shared/protocol-types.ts";

const PX_PER_UNIT = 40;
const toServer = (wx, wz) => ({
  x: wx * PX_PER_UNIT + WORLD_WIDTH / 2,
  y: wz * PX_PER_UNIT + WORLD_HEIGHT / 2,
});

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/statue";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.5));
await new Promise((r) => setTimeout(r, 3000));

const where = await page.evaluate(() => {
  const g = window.__wieldbound;
  const o = g.town.ornaments?.[0];
  if (!o) return null;
  o.updateMatrixWorld(true);
  const d = g.world.cameraDir;
  return {
    x: o.position.x,
    z: o.position.z,
    dir: { x: d.x, z: d.z },
    ornaments: g.town.ornaments.length,
    programs: g.world.renderer.info.programs.length,
  };
});
if (!where) { console.log("no ornament registered — the statue did not load"); await browser.close(); process.exit(1); }
console.log(`${where.ornaments} ornament(s); statue at ${where.x.toFixed(1)}, ${where.z.toFixed(1)}`);
console.log(`programs before going anywhere near it: ${where.programs}`);

// SWEEP AROUND IT. Guessing one side put the character 2.92u off the sight line
// and reported "nothing faded", which says nothing at all. The camera direction
// is fixed, so exactly one arc puts the statue between it and the player.
let best = null;
for (let deg = 0; deg < 360; deg += 45) {
  const a = (deg * Math.PI) / 180;
  const spot = toServer(where.x + Math.cos(a) * 3.0, where.z + Math.sin(a) * 3.0);
  for (let k = 0; k < 22; k++) await approach(page, spot, 420);
  await new Promise((res) => setTimeout(res, 600));
  const r = await page.evaluate((q) => {
    const g = window.__wieldbound;
    const A = g.world.camera.position;
    const B = g.localActor.position;
    const abx = B.x - A.x;
    const abz = B.z - A.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 ? Math.max(0, Math.min(1, ((q.x - A.x) * abx + (q.z - A.z) * abz) / len2)) : 0;
    const px = A.x + abx * t;
    const pz = A.z + abz * t;
    return {
      off: +Math.hypot(q.x - px, q.z - pz).toFixed(2),
      t: +t.toFixed(2),
      faded: g.fadedMaterials ? g.fadedMaterials.size : -1,
      programs: g.world.renderer.info.programs.length,
    };
  }, { x: where.x, z: where.z });
  const inWay = r.off < 1.2 && r.t > 0.05 && r.t < 0.95;
  console.log(
    `  ${String(deg).padStart(3)}deg  off ${String(r.off).padStart(5)}u  t ${r.t}  ` +
      `${inWay ? "IN THE WAY" : "clear     "}  faded ${r.faded}  programs ${r.programs}`,
  );
  if (inWay) {
    await page.screenshot({ path: `${OUT}/behind-${deg}.png` });
    if (!best || r.off < best.off) best = { deg, ...r };
  }
}
console.log(
  best
    ? `\nbest line-up at ${best.deg}deg: off ${best.off}u, faded ${best.faded}, ` +
        `programs ${best.programs} (started ${where.programs})`
    : "\ncould not get behind it on any bearing",
);
await browser.close();
