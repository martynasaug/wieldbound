// PLAY THE GAME AND PHOTOGRAPH IT, IN PLACES THAT ARE DIFFERENT FROM EACH OTHER.
//
// The bugs that have actually reached the person watching this project were all
// visible ones — a death animation played on the respawn tile, a level-up that
// hid the character behind a yellow slab, an inventory footer drawing over the
// character panel, ornaments that read as something other than serpents. Every
// one of them was in a frame that had already been captured and skimmed for
// numbers. The instrument was never the problem; not looking was.
//
// `panels.mjs` does this for windows. This does it for the WORLD, and the one
// design decision that matters is that it tours places which differ rather than
// sampling one place repeatedly. Thirty frames of the same field at thirty
// second intervals is one frame with extra steps; a frame in town, on the road,
// on the bridge, in the forest and out at the frontier is five chances to see
// something wrong.
//
// Landmarks are DERIVED from the shared world definition rather than typed, for
// the reason `roadTorches` gives: a typed coordinate agrees with the world on
// the day it is written. If a waypoint moves, this tours the new road.
//
//   node tools/soak/tour.mjs Player3619 ./shots        (whatever hour it is)
//   node tools/soak/tour.mjs Player3619 ./shots 0.12   (frozen at night)

import {
  open, login, probe, hotbarKeys, step, nearestMonster, approach,
} from "./driver.mjs";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";
import { TOWN_RADIUS_PX } from "../../shared/town.ts";
import { roadPath, NORTH_TOWN_SITE } from "../../shared/road.ts";
import { roadRiverCrossings } from "../../shared/river.ts";
import { placeNameAt } from "../../shared/places.ts";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? ".";
/** Freeze the world clock, so a lighting change can be seen at the hour it
 *  matters instead of whenever the tour happens to run. 0 is midnight, 0.5
 *  noon; `null` leaves the clock running. */
const CLOCK = process.argv[4] !== undefined ? Number(process.argv[4]) : null;

// AND REJECTED IF IT IS NOT ONE, because the failure is silent and total.
//
// `DayNight` normalises with `((t % 1) + 1) % 1`, so an hour passed by mistake
// wraps instead of complaining: 12 becomes 12 % 1 = 0, which is MIDNIGHT. A
// tour asked for noon was photographed in the dark, every frame, while the log
// said "clock frozen at 12" — a run that looks successful, produces nine
// screenshots, and answers a different question than the one asked. Nothing
// downstream can tell.
//
// The units were documented directly above and the argument was still wrong,
// which is the argument for checking rather than documenting harder.
if (CLOCK !== null && !(CLOCK >= 0 && CLOCK <= 1)) {
  console.error(
    `clock must be a FRACTION of a day between 0 and 1, not ${process.argv[4]}.\n` +
      `  0 = midnight, 0.25 = 06:00, 0.5 = noon, 0.75 = 18:00.\n` +
      `  For ${process.argv[4]}:00 pass ${(Number(process.argv[4]) / 24).toFixed(3)}.`,
  );
  process.exit(1);
}
/** The frozen clock as a wall-clock time, so the log can be checked against the
 *  picture it describes rather than trusted. */
const clockLabel = (t) => {
  const h = Math.floor(t * 24);
  const m = Math.round((t * 24 - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const road = roadPath();
const at = (frac) => road[Math.floor((road.length - 1) * frac)];
const bridge = roadRiverCrossings()[0];

/** Where to stand, in the order a player would meet them walking out of town. */
const STOPS = [
  ["town", { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y }],
  ["gate", at(0.02)],
  ["road-south", at(0.2)],
  ["road-mid", at(0.45)],
  ["bridge", bridge ? { x: bridge.x, y: bridge.y } : at(0.6)],
  ["road-north", at(0.8)],
  ["frontier", NORTH_TOWN_SITE],
  // Off the road entirely, which is where the camps and the forest are and
  // where a player who cuts the corner actually ends up.
  ["wilds-east", { x: PLAYER_SPAWN.x + 1700, y: PLAYER_SPAWN.y - 600 }],
  ["wilds-west", { x: PLAYER_SPAWN.x - 1600, y: PLAYER_SPAWN.y + 500 }],
];

const me = (page) =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

const run = async () => {
  const { browser, page } = await open({ headless: true, width: 1600, height: 900 });
  await login(page, NAME);
  const keys = await hotbarKeys(page);
  if (CLOCK !== null) {
    await page.evaluate((t) => window.__wieldbound.world.dayNight.freeze(t), CLOCK);
    console.log(`clock frozen at ${CLOCK} (${clockLabel(CLOCK)})`);
  }

  for (const [name, dest] of STOPS) {
    // Walk there, sliding along anything solid; give up rather than hang, since
    // a stop that cannot be reached is itself worth seeing in the log.
    const until = Date.now() + 100000;
    let sign = 1;
    let reached = false;
    while (Date.now() < until) {
      const p = await me(page);
      if (Math.hypot(dest.x - p.x, dest.y - p.y) < 220) {
        reached = true;
        break;
      }
      if ((await approach(page, dest, 650, sign)) < 25) sign = -sign;
    }

    // Fight whatever comes, WITHOUT CHASING IT.
    //
    // The first version called `approach` here, and that is how a tour of nine
    // named places produced nine mislabelled photographs: chasing a monster for
    // nine seconds at ~198px/s carries the character up to 1,700px, so "town"
    // was photographed 1,718px outside town and the log cheerfully said
    // "reached". The stop is the point of the frame, so the character stays on
    // it and swings at whatever walks into range. A stop with nothing nearby
    // gets a quiet frame, which is a true picture of that place.
    const fightUntil = Date.now() + 9000;
    while (Date.now() < fightUntil) {
      for (const k of keys.slice(0, 4)) {
        await page.keyboard.press(k);
        await page.waitForTimeout(110);
      }
    }

    // Re-freeze: walking here took game-minutes and `approach` knows nothing
    // about the clock, so without this each stop drifts into a different hour.
    if (CLOCK !== null) await page.evaluate((t) => window.__wieldbound.world.dayNight.freeze(t), CLOCK);
    const p = await me(page);
    const drift = Math.hypot(dest.x - p.x, dest.y - p.y);
    const shot = `${OUT}/tour-${name}.png`;
    await page.screenshot({ path: shot });
    const place = placeNameAt(p.x, p.y);
    const st = await probe(page);
    // The distance is reported at SHOOTING time, not at arrival time, because
    // that is the only one that describes the picture.
    console.log(
      `${name.padEnd(12)} ${reached ? "reached" : "GAVE UP"}  ${drift.toFixed(0).padStart(5)}px from the mark` +
        `  at (${p.x.toFixed(0)}, ${p.y.toFixed(0)})  ${place ? `"${place}"` : ""}` +
        `  hp ${st.hp ?? "?"}  lvl ${st.level ?? "?"}`,
    );
  }

  console.log("\nconsole errors:", page.__errors.length);
  for (const e of page.__errors.slice(0, 5)) console.log("  ", e);
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
