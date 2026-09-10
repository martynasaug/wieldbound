// DOES THE CAMERA STOP SITTING BEHIND THE TOWN WALL?
//
// The gate stop on `tour.mjs` showed the character cut off at the waist by the
// palisade, which could neither push the camera out nor fade (M70.241). A ring
// of invisible collider boxes now stands where the wall stands.
//
// Three questions, and the third is the one a screenshot cannot answer: is the
// camera actually blocked at the wall, does the character still fit in frame,
// and does the ring cost any DRAW CALLS — it is never added to the scene, so it
// should cost exactly none.
import { mkdirSync } from "node:fs";
import { open, login, approach, probe } from "./driver.mjs";
import { TOWN_CENTER } from "../../shared/town.ts";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/wallcam";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.5));
await new Promise((r) => setTimeout(r, 2000));

const look = () => page.evaluate(() => {
  const g = window.__wieldbound;
  const info = g.world.renderer.info;
  return {
    dist: +g.world.cameraDistance.toFixed(2),
    blocked: g.world.cameraBlocked,
    drawCalls: info.render.calls,
    colliders: g.world.cameraColliders?.length ?? 0,
    inScene: !!g.world.scene.getObjectById(g.town.wallColliders?.id ?? -1),
  };
});

const middle = await look();
console.log(`in the open: dist ${middle.dist}, blocked ${middle.blocked}, ${middle.drawCalls} draw calls`);
console.log(`the collider ring is in the scene graph: ${middle.inScene}   (it should not be)`);
await page.screenshot({ path: `${OUT}/1-open.png` });

// SWEEP THE INSIDE FACE OF THE WALL.
//
// The camera direction is fixed, so the wall only comes between it and the
// player on some bearings — and standing OUTSIDE the ring can never be blocked
// by it, correctly. The first version of this walked to radius 835 against a
// wall at 800 and reported "blocked false" as though the collider did nothing.
const R = 770;
const hits = [];
for (let deg = 0; deg < 360; deg += 30) {
  const a = (deg * Math.PI) / 180;
  const spot = { x: TOWN_CENTER.x + Math.cos(a) * R, y: TOWN_CENTER.y + Math.sin(a) * R };
  for (let i = 0; i < 26; i++) await approach(page, spot, 450);
  await new Promise((r) => setTimeout(r, 500));
  const st = await look();
  const at = await probe(page);
  const rad = Math.round(Math.hypot(at.x - TOWN_CENTER.x, at.y - TOWN_CENTER.y));
  console.log(
    `  ${String(deg).padStart(3)}deg  r=${String(rad).padStart(3)}  dist ${String(st.dist).padStart(4)}` +
      `  blocked ${String(st.blocked).padEnd(5)}  draws ${st.drawCalls}`,
  );
  if (st.blocked) {
    hits.push(deg);
    await page.screenshot({ path: `${OUT}/wall-${deg}.png` });
  }
}
console.log(`\nthe wall caught the camera on ${hits.length} of 12 bearings: ${hits.join(", ") || "none"}`);
await browser.close();
