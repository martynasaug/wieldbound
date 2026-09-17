// WALKING THE NORTH ROAD, WHICH IS THE ONLY WAY TO KNOW IT IS A ROAD.
//
//   node tools/soak/kingsway.mjs [Name]
//
// `tools/test/road.mjs` proves the route clears every camp, node and waystone,
// and `crossing.mjs` proves the deck and the land meet at the bridge. Neither
// can say whether the thing reads as a road you would choose to follow — which
// is the whole claim being made about it, since Coldharrow is reachable by
// anyone precisely because this track is safe.
//
// So: walk it end to end and photograph the length of it, stopping at each
// waystone to check the stone is actually standing there and beside the road
// rather than in it.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach, unstick } from "./driver.mjs";
import { roadPath, NORTH_TOWN_SITE, NORTH_TOWN_NAME } from "../../shared/road.ts";
import { LANDMARKS, landmarkPosition } from "../../shared/landmarks.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Way${Math.floor(Math.random() * 90000)}`;
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const path = roadPath();
const northOf = (p) => Math.round(PLAYER_SPAWN.y - p.y);
const STONES = ["posternstone", "marchstone", "pinewardstone"]
  .map((id) => LANDMARKS.find((l) => l.id === id))
  .filter(Boolean);

console.log(
  `the Kingsway runs ${northOf(path.at(-1))}px north to ${NORTH_TOWN_NAME}, ` +
  `through ${STONES.length} stones\n`,
);

const { browser, page } = await open({ headless: true, width: 1400, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(1600);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.45));

const posOf = () =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

// Stops: each waystone, then the city site. Walking the smoothed path point by
// point rather than straight at the destination, because the road bends and the
// question is whether the ROAD is walkable, not whether the ground is.
const stops = [
  ...STONES.map((l) => ({ name: l.name, at: landmarkPosition(l) })),
  { name: NORTH_TOWN_NAME, at: NORTH_TOWN_SITE },
];

// Each stop's own index on the smoothed path, so the walk can follow the road
// IN ORDER instead of aiming at whatever happens to be near.
const indexOf = (at) => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i].x - at.x, path[i].y - at.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
};

let shot = 0;
let cursor = 0;
for (const stop of stops) {
  const target = indexOf(stop.at);
  let best = Infinity;
  let stalled = 0;
  for (let i = 0; i < 620; i++) {
    const at = await posOf();
    const d = Math.hypot(stop.at.x - at.x, stop.at.y - at.y);
    if (d < 220) break;
    if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
    if (stalled > 0 && stalled % 14 === 0) await unstick(page, 200);

    // WALK THE PATH IN ORDER. The first version of this picked the furthest
    // path point within 700px of the player, which has no notion of AHEAD —
    // and fell back to the road's last point when nothing was in range. The
    // bot charged 7,686px north on the first leg and reported arriving four
    // thousand seven hundred pixels short of a stone it had already run past.
    //
    // A cursor that only ever moves forward, toward this stop's own index, is
    // what "follow the road" actually means.
    while (
      cursor < target &&
      Math.hypot(path[cursor].x - at.x, path[cursor].y - at.y) < 260
    ) {
      cursor++;
    }
    const aim = cursor >= target ? stop.at : path[cursor];
    await approach(page, aim, 380);
  }
  cursor = Math.max(cursor, target);
  const at = await posOf();
  const gap = Math.round(Math.hypot(stop.at.x - at.x, stop.at.y - at.y));
  console.log(
    `  ${stop.name.padEnd(22)} ${northOf(at)}px north, ${gap}px short` +
    `${gap > 400 ? "  !! did not arrive" : ""}`,
  );
  await page.waitForTimeout(400);
  writeFileSync(`${OUT}/kingsway-${String(shot++).padStart(2, "0")}.png`, await page.screenshot());
}

console.log(`\n  ${shot} shots in ${OUT}/kingsway-*.png`);
if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
