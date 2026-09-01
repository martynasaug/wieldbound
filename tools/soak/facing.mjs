// WHICH WAY DOES THE BODY POINT WHILE WALKING PAST A MONSTER?
//
// Reported from play: "when you're walking somewhere and there is a monster
// nearby your character automatically starts facing the monster, even while
// walking the other way" — and, on being asked, "that happens even without
// targeting or attacking".
//
// The cause was that `engagedId` is not what its name says. It falls back to
// `nearestMonster(ENGAGE_RADIUS_PX)`, so anything within 340px counts as
// "engaged" with no swing and no click, and the facing override read that as a
// fight. `isRetreating` did not save it either: `RETREAT_DOT` is -0.35, so you
// have to be heading more than about 110 degrees away before the override lets
// go — walking PAST something is not retreating by that measure.
//
// This measures the angle between the direction the character is travelling and
// the direction it is pointing, in two conditions that must differ:
//
//   walking past, never attacking  -> the body follows the feet
//   walking while fighting          -> the body holds the target
//
// Both matter. The second is the behaviour the override was added for, and a
// fix that pointed everyone at their feet always would break it.

import { open, login, hotbarKeys, step, nearestMonster, keysToward } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

/** Angle in degrees between where the body points and where it is walking. */
const facingError = (page, keyX, keyY) =>
  page.evaluate(
    ({ kx, ky }) => {
      const g = window.__wieldbound;
      const f = g.localActor?.facingVector?.();
      if (!f) return null;
      // Screen input maps to world axes: +x east, +y south == +z here.
      const len = Math.hypot(kx, ky) || 1;
      const wx = kx / len;
      const wz = ky / len;
      const fl = Math.hypot(f.x, f.z) || 1;
      const dot = (f.x / fl) * wx + (f.z / fl) * wz;
      const near = (() => {
        let best = null;
        let bd = Infinity;
        for (const v of g.monsters.values()) {
          if (v.state?.status !== "alive") continue;
          const d = Math.hypot(v.state.x - g.playerX, v.state.y - g.playerY);
          if (d < bd) { bd = d; best = d; }
        }
        return best;
      })();
      return {
        deg: Math.round((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI),
        nearestPx: near === null ? -1 : Math.round(near),
        attacking: !!g.attacking,
      };
    },
    { kx: keyX, ky: keyY },
  );

const run = async () => {
  const { browser, page } = await open({ headless: true });
  await login(page, NAME);
  const keys = await hotbarKeys(page);

  // Get near a camp without touching the attack keys.
  for (let i = 0; i < 40; i++) {
    const t = await nearestMonster(page);
    if (t && t.d < 300) break;
    const p = await page.evaluate(() => ({
      x: window.__wieldbound.playerX,
      y: window.__wieldbound.playerY,
    }));
    if (!t) { await step(page, ["w"], 700); continue; }
    await step(page, keysToward(p, t), 600);
  }
  const arrived = await nearestMonster(page);
  console.log(`nearest monster: ${arrived ? Math.round(arrived.d) + "px" : "none"}`);

  // --- 1. walking past, never having attacked -------------------------------
  // Held for a while so any grace window from an earlier action has expired.
  console.log("\nwalking past without attacking:");
  await page.waitForTimeout(1500);
  const past = [];
  for (let i = 0; i < 6; i++) {
    // Strafe: perpendicular-ish to the monster, which is the case the old rule
    // got wrong — not retreating, so the override held on.
    await page.keyboard.down("d");
    await page.waitForTimeout(320);
    const e = await facingError(page, 1, 0);
    if (e) past.push(e);
    await page.keyboard.up("d");
  }
  for (const e of past) console.log(`   off by ${e.deg}deg, nearest ${e.nearestPx}px, attacking=${e.attacking}`);
  const worstPast = past.length ? Math.max(...past.map((e) => e.deg)) : 999;
  check(
    "walking past a monster, the body follows the feet",
    worstPast <= 30,
    `worst ${worstPast}deg off the direction of travel over ${past.length} samples`,
  );
  check("and the run really was next to a monster", past.every((e) => e.nearestPx >= 0 && e.nearestPx < 900));
  check("and nothing was attacking", past.every((e) => !e.attacking));

  // --- 2. the behaviour the override exists for -----------------------------
  console.log("\nnow fighting, walking sideways:");
  // CLOSE BACK IN FIRST. Phase one strafes in one direction for two seconds and
  // carries the character from 137px out to 600px — past `ENGAGE_RADIUS_PX`
  // (340), so there is nothing engaged to face and the second phase measured a
  // character alone in a field. That failed and said the override was broken
  // when the override simply had no target.
  for (let i = 0; i < 25; i++) {
    const t = await nearestMonster(page);
    if (t && t.d < 200) break;
    const p = await page.evaluate(() => ({
      x: window.__wieldbound.playerX,
      y: window.__wieldbound.playerY,
    }));
    if (!t) break;
    await step(page, keysToward(p, t), 500);
  }
  const closed = await nearestMonster(page);
  console.log(`   closed back to ${closed ? Math.round(closed.d) + "px" : "nothing"}`);

  const fighting = [];
  for (let i = 0; i < 6; i++) {
    for (const k of keys.slice(0, 2)) await page.keyboard.press(k);
    // Alternate the strafe so the character orbits rather than departing again.
    const key = i % 2 ? "a" : "d";
    await page.keyboard.down(key);
    await page.waitForTimeout(320);
    const e = await facingError(page, key === "d" ? 1 : -1, 0);
    if (e) fighting.push(e);
    await page.keyboard.up(key);
  }
  for (const e of fighting) console.log(`   off by ${e.deg}deg, nearest ${e.nearestPx}px, attacking=${e.attacking}`);
  const heldTarget = fighting.filter((e) => e.deg > 35).length;
  check(
    "while fighting, the body holds the target instead",
    heldTarget >= 2,
    `${heldTarget} of ${fighting.length} samples pointed away from the direction of travel`,
  );

  console.log("\nconsole errors:", page.__errors.length);
  console.log(`\n${failures === 0 ? "OK — you face where you are going unless you are fighting" : `${failures} FAILURE(S)`}`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
