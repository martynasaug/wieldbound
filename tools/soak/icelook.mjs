// WHAT THE HARBOUR ICE ACTUALLY LOOKS LIKE.
//
//   node tools/soak/icelook.mjs [Name]
//
// Its own harness rather than another shot in `coldharrow.mjs`, for two
// reasons that the wharf shot in that file gets wrong.
//
// FIRST, IT FACES THE WRONG WAY. Every shot there ends with a step toward the
// city centre, which is the fix for a real bug — `approach` leaves the player
// pointing wherever the last step went, and three photographs of the curtain
// wall came back as empty grass because of it. But the harbour is on the far
// side of the quay from the centre, so turning toward the middle turns the
// camera AWAY from the ice. The wharf shot is a photograph of the fishmarket's
// back wall with the subject behind the lens.
//
// SECOND, ONE HOUR IS NOT ENOUGH. The bug being checked here was invisible at
// the frozen 0.42 that file uses and glaring at first light: the ice carried a
// fixed `emissiveIntensity: 1` and was never registered with the clock, so it
// emitted at full strength at every hour. At midday the sun drowns that out. At
// first light every roof in the city goes black and the harbour does not, which
// is what "what the hell is this white thing" was looking at. A single frozen
// hour would have missed it, so this shoots the same frame at three.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach, unstick } from "./driver.mjs";
import { COLDHARROW, COLDHARROW_BASIN } from "../../shared/town.ts";
import { LANDMARKS } from "../../shared/landmarks.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Ice${Math.floor(Math.random() * 90000)}`;
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const centre = COLDHARROW.center;
const at = (radiusPx, deg) => {
  const a = (deg * Math.PI) / 180;
  return { x: centre.x + Math.cos(a) * radiusPx, y: centre.y + Math.sin(a) * radiusPx };
};

const b = COLDHARROW_BASIN;
console.log(
  `harbour: ${b.startDeg}-${b.endDeg}deg, ${b.innerPx}..${b.outerPx}px from the centre\n` +
  `  north lip at y=${centre.y - b.outerPx} (the world edge is y=0)\n`,
);

const { browser, page } = await open({ headless: true, width: 1500, height: 940 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(1800);

const posOf = () =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

const goTo = async (to, label, budget = 420) => {
  let best = Infinity;
  let stalled = 0;
  for (let i = 0; i < budget; i++) {
    const me = await posOf();
    const d = Math.hypot(to.x - me.x, to.y - me.y);
    if (d < 180) return true;
    if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
    if (stalled > 0 && stalled % 14 === 0) await unstick(page, 200);
    await approach(page, to, d > 900 ? 800 : 340);
  }
  console.log(`  !! never reached ${label}`);
  return false;
};

const travelled = await page.evaluate(() => {
  const g = window.__wieldbound;
  if (!g.travelPanel?.knows?.("pinewardstone")) return false;
  g.socket.sendTravelTo("pinewardstone");
  return true;
});
if (!travelled) {
  console.log("  Pineward Stone not known — run tools/seed.mjs for this character first");
  await browser.close();
  process.exit(1);
}
await page.waitForTimeout(1400);
console.log(`  travelled to ${LANDMARKS.find((l) => l.id === "pinewardstone").name}`);

// Onto the quay, which is the landward lip of the basin.
const quay = at(b.innerPx - 220, 270);
if (!(await goTo(quay, "the quay"))) {
  await browser.close();
  process.exit(1);
}

// FACE THE ICE. Across the basin, so the heading is dead over the sheet rather
// than along it — the step the wharf shot takes toward the city centre, pointed
// the other way on purpose.
//
// AND THE AIM POINT STAYS INSIDE THE WALL. It was `outerPx + 400`, which is
// past the curtain, and `approach` now routes a leg from inside a settlement to
// a point outside it through the nearest GATE — correctly, since that fix is
// what got this harness to the quay at all. The nearest gate to bearing 270 is
// the Shore Postern at 200, so the turn-to-face step marched the camera off
// east and photographed a warehouse. The far lip is inside the wall by 80px;
// aim just short of it.
await approach(page, at(b.outerPx - 60, 270), 300);
await page.waitForTimeout(700);

const me = await posOf();
console.log(`  standing ${PLAYER_SPAWN.y - Math.round(me.y)}px north, on the quay\n`);

const hours = [
  ["noon", 0.5, "the sun doing the work"],
  ["firstlight", 0.2, "the hour it was reported at"],
  ["night", 0.88, "nothing but the braziers"],
];

for (const [id, clock, what] of hours) {
  await page.evaluate((t) => window.__wieldbound.world.dayNight.freeze(t), clock);
  await page.waitForTimeout(650);
  writeFileSync(`${OUT}/ice-${id}.png`, await page.screenshot());
  console.log(`  ice-${id.padEnd(11)} clock ${clock} — ${what}`);
}

// And one from out on the ice looking back, which is the only view that shows
// the sheet as a surface rather than as a band along the bottom of the frame.
// A SHORT BUDGET, because this leg is a bonus and the quay shots are the
// point. Nothing stops a player walking onto the ice — it is a surface, not a
// barrier, which is what makes the fishing in Phase D possible at all — but
// the route out passes between the piers and the steering can spend a long
// time finding the gap. At the default 420 it held the whole run up for ten
// minutes after the shots that mattered were already written.
if (await goTo(at((b.innerPx + b.outerPx) / 2, 268), "the middle of the basin", 110)) {
  await approach(page, at(b.innerPx - 400, 272), 300);
  await page.waitForTimeout(700);
  for (const [id, clock] of [["noon", 0.5], ["firstlight", 0.2]]) {
    await page.evaluate((t) => window.__wieldbound.world.dayNight.freeze(t), clock);
    await page.waitForTimeout(650);
    writeFileSync(`${OUT}/ice-out-${id}.png`, await page.screenshot());
    console.log(`  ice-out-${id.padEnd(7)} from the basin, looking back at the quays`);
  }
}

console.log(`\n  shots in ${OUT}/ice-*.png`);
if (errors.length) console.log("page errors:", errors.slice(0, 4));
await browser.close();
