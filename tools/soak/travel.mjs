// FAST TRAVEL, WHICH IS THE PIECE THAT DECIDES WHETHER COLDHARROW IS A PLACE.
//
//   node tools/soak/travel.mjs [Name]
//
// The road north is 8,400px. The first walk up it is meant to be an event; the
// hundredth is a tax on living at the end of it, and a city nobody can bear to
// travel to is not somewhere people hang out — which was the entire reason for
// building one. So this is not a convenience, it is load-bearing.
//
// Four things can be wrong and none of them throws:
//
//   1. The record never fills. Standing at a stone is the only qualification,
//      and if the arrival is not written down the panel stays empty forever.
//   2. The teleport does not take. The server moves the player and the client
//      has been standing somewhere else — exactly the disagreement the death
//      path already has to reconcile.
//   3. THE RULES ARE ONLY IN THE PANEL. A greyed button is an interface; a
//      teleport a client can ask for unchecked is a teleport to anywhere.
//   4. It works and the panel never says so.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach, unstick } from "./driver.mjs";
import { LANDMARKS, landmarkPosition, LANDMARK_REACH_PX } from "../../shared/landmarks.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Trav${Math.floor(Math.random() * 90000)}`;
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const POSTERN = LANDMARKS.find((l) => l.id === "posternstone");
const MARCH = LANDMARKS.find((l) => l.id === "marchstone");

const { browser, page } = await open({ headless: true, width: 1280, height: 820 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(1600);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.45));

const posOf = () =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));
const northOf = (p) => Math.round(PLAYER_SPAWN.y - p.y);
const reached = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("#travel-list .travel-row:not(.unknown) .travel-name")]
      .map((e) => e.textContent),
  );

/**
 * Walk to a stone, and let THE GAME say whether we arrived.
 *
 * The first two versions of this recomputed arrival from the player's position
 * against `LANDMARK_REACH_PX`, and both reported "never reached" about a stone
 * the server had already recorded — the next section then fast-travelled to it,
 * which only works if it was recorded. A sampled distance is a second answer to
 * a question the game is already answering continuously, and when two answers
 * disagree the harness is the one that is wrong.
 *
 * So: walk, and watch for the stone to appear in the reached set.
 */
const walkTo = async (at, id, label) => {
  let best = Infinity;
  let stalled = 0;
  for (let i = 0; i < 520; i++) {
    if (await hasReached(id)) return true;
    const me = await posOf();
    const d = Math.hypot(at.x - me.x, at.y - me.y);
    if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
    if (stalled > 0 && stalled % 14 === 0) await unstick(page, 200);
    await approach(page, at, d > 900 ? 700 : 320);
  }
  console.log(`  !! never reached ${label}`);
  return false;
};

/** Straight off the panel's own data, which is the server's answer. */
const hasReached = (id) =>
  page.evaluate((want) => (window.__wieldbound.travelPanel?.knows?.(want) ?? false), id);

// --- 1. the rule refuses you in open country --------------------------------
await page.keyboard.press("t");
await page.waitForTimeout(300);
const openInField = await page.evaluate(() => ({
  open: document.getElementById("travel")?.classList.contains("open") ?? false,
  from: document.getElementById("travel-from")?.textContent ?? "",
}));
console.log(`1. in Emberhold, panel says: "${openInField.from}"`);

// --- 2. walking to a stone records it ----------------------------------------
const before = await reached();
console.log(`2. before walking, ${before.length} destination(s) known`);
await page.keyboard.press("t");
await page.waitForTimeout(200);

if (await walkTo(landmarkPosition(POSTERN), "posternstone", POSTERN.name)) {
  await page.waitForTimeout(900);
  await page.keyboard.press("t");
  await page.waitForTimeout(400);
  const after = await reached();
  const from = await page.evaluate(() => document.getElementById("travel-from")?.textContent ?? "");
  console.log(`3. stood at ${POSTERN.name}: ${after.length} known — ${after.join(", ") || "none"}`);
  console.log(`   panel says: "${from}"`);
  writeFileSync(`${OUT}/travel-panel.png`, await page.screenshot());
  await page.keyboard.press("t");
  await page.waitForTimeout(200);
}

// --- 3. a second stone, then travel back --------------------------------------
if (await walkTo(landmarkPosition(MARCH), "marchstone", MARCH.name)) {
  await page.waitForTimeout(900);
  const at = await posOf();
  console.log(`4. walked on to ${MARCH.name} at ${northOf(at)}px north`);

  await page.evaluate(() => window.__wieldbound.socket.sendTravelTo("posternstone"));
  await page.waitForTimeout(1200);
  const now = await posOf();
  const want = landmarkPosition(POSTERN);
  const gap = Math.round(Math.hypot(now.x - want.x, now.y - want.y));
  console.log(
    `5. travelled back to ${POSTERN.name}: now ${northOf(now)}px north, ${gap}px off` +
    ` — ${gap < 60 ? "arrived" : "!! DID NOT ARRIVE"}`,
  );
  writeFileSync(`${OUT}/travel-arrived.png`, await page.screenshot());
}

// --- 4. the rules are the server's ---------------------------------------------
const log = () =>
  page.evaluate(() => [...document.querySelectorAll("#combat-log div")].slice(-2).map((e) => e.textContent));

await page.evaluate(() => window.__wieldbound.socket.sendTravelTo("ashenstone"));
await page.waitForTimeout(800);
console.log(`6. asked for a stone never visited: "${(await log()).at(-1)}"`);

// Walk into open country and try from there.
const field = await page.evaluate(() => ({
  x: window.__wieldbound.playerX + 700,
  y: window.__wieldbound.playerY + 300,
}));
for (let i = 0; i < 30; i++) {
  const me = await posOf();
  if (Math.hypot(field.x - me.x, field.y - me.y) < 120) break;
  await approach(page, field, 400);
}
await page.evaluate(() => window.__wieldbound.socket.sendTravelTo("posternstone"));
await page.waitForTimeout(800);
console.log(`7. asked from open country: "${(await log()).at(-1)}"`);

console.log(`\n  shots: ${OUT}/travel-*.png`);
if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
