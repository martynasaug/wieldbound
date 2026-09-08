// DOES A SLOWED PLAYER ACTUALLY MOVE SLOWER?
//
// `statusMoveMultiplier` was wired to monsters and to nothing else, so chilled,
// poisoned and staggered slowed every creature in the game except the one
// reading the tooltip. Three monsters inflict one on the player — troll 0.5,
// cactoro 0.65, ghost 0.4 — and chilled's own blurb says "Moving at a fraction
// of its usual pace" while the player ran at full speed.
//
// This stands next to something that inflicts one, takes the hit, and walks.
// It needs a browser because the client is what integrates position: the whole
// question is whether the legs agree with the status bar.
//
//   node tools/soak/slowcheck.mjs Fighter

import { open, login, step, approach, nearestMonster } from "./driver.mjs";

const NAME = process.argv[2] ?? "Fighter";
/** The kinds that inflict something with a moveMultiplier. */
const SLOWERS = ["ghost", "cactoro", "troll"];
/** How far each can hit from, so "in range" means what it means to THEM. */
const REACH = { ghost: 58, cactoro: 185, troll: 82 };

// ONE SHORT WALK, NOT THE BEST OF FOUR.
//
// The first version took the maximum over four 1.5-second walks, which is right
// for measuring a character's top speed and exactly wrong here: chilled lasts
// 3,500ms and the four walks take six seconds, so the debuff expired partway
// and the MAX picked an unslowed leg. It reported "sheet 150 px/s, walked 380"
// and called the fix broken when the measurement was.
const walkSpeed = async (page, ms = 1200) => {
  const r = await step(page, ["d"], ms);
  return (r.moved / ms) * 1000;
};

const statusOf = (page) =>
  page.evaluate(() => ({
    active: (window.__wieldbound.statusBar?.active ?? []).map((s) => s.id),
    sheet: window.__wieldbound.moveSpeed(),
  }));

const { browser, page } = await open({ headless: true, width: 1000, height: 700 });
await login(page, NAME);

// A CLEAN BASELINE, WAITED FOR. Placed beside a ghost, the character is
// chilled before it has finished logging in, and a baseline taken while
// already slowed makes the ratio 1.00 and the verdict meaningless — which is
// exactly what the first run of this reported.
{
  const waitUntil = Date.now() + 25000;
  while (Date.now() < waitUntil) {
    const s0 = await statusOf(page);
    if (!s0.active.some((id) => ["chilled", "poisoned", "staggered"].includes(id))) break;
    await page.waitForTimeout(500);
  }
}
const clean = await statusOf(page);
const cleanWalk = await walkSpeed(page);
console.log(`unslowed: sheet ${clean.sheet} px/s, walked ${cleanWalk.toFixed(0)} px/s  statuses [${clean.active.join(",")}]`);

// Find something that slows and stand in its way until it lands one.
let found = null;
const until = Date.now() + 180000;
while (Date.now() < until && !found) {
  const t = await page.evaluate((kinds) => {
    const g = window.__wieldbound;
    let best = null;
    let bd = Infinity;
    for (const v of g.monsters.values()) {
      if (v.state?.status !== "alive" || !kinds.includes(v.state.kind)) continue;
      const d = Math.hypot(v.state.x - g.playerX, v.state.y - g.playerY);
      if (d < bd) { bd = d; best = { x: v.state.x, y: v.state.y, d, kind: v.state.kind }; }
    }
    return best;
  }, SLOWERS);
  if (!t) { await step(page, ["w"], 900); continue; }
  // WITHIN ITS REACH, NOT WITHIN NINETY PIXELS. The first version used a flat
  // 90px and waited three minutes for nothing: a cactoro is a THROWER that
  // holds station at 150px and shoots from 185, so ninety pixels is a distance
  // it will never allow. Ask each kind how far it can hit from.
  const reach = REACH[t.kind] ?? 80;
  if (t.d > reach * 0.8) { await approach(page, t, 700); continue; }
  // In range. Stand still and let it swing — do NOT fight back, because a dead
  // monster inflicts nothing — and wait long enough for the dice to land. A
  // ghost swings every 1.7s at a 25% chance; the first version dwelt 1.2s,
  // which is less than one swing.
  const dwellUntil = Date.now() + 30000;
  while (Date.now() < dwellUntil && !found) {
    await page.waitForTimeout(500);
    const s = await statusOf(page);
    const slowing = s.active.filter((id) => ["chilled", "poisoned", "staggered"].includes(id));
    if (slowing.length) found = { kind: t.kind, statuses: slowing, sheet: s.sheet };
  }
}

if (!found) {
  console.log("\nNOT RUN — nothing landed a movement debuff in three minutes. INCONCLUSIVE.");
  await browser.close();
  process.exit(0);
}

const slowWalk = await walkSpeed(page);
const after = await statusOf(page);
console.log(
  `slowed by a ${found.kind} [${found.statuses.join(",")}]: sheet ${found.sheet} px/s, ` +
    `walked ${slowWalk.toFixed(0)} px/s`,
);

// The status may lapse mid-measurement, which is not a failure — it is a
// four-second debuff and this walks for six. Say so rather than failing.
const stillSlowed = after.active.some((id) => ["chilled", "poisoned", "staggered"].includes(id));
const ratio = slowWalk / cleanWalk;
let bad = false;
if (!stillSlowed) {
  console.log(`  (it wore off partway through the walk — ratio ${ratio.toFixed(2)} is a blend. INCONCLUSIVE.)`);
} else if (ratio > 0.9) {
  console.log(`\nFAIL — slowed and unslowed speeds are the same (${ratio.toFixed(2)}x). The debuff does not reach movement.`);
  bad = true;
} else {
  console.log(`\nOK — a slowed player really is slower: ${(ratio * 100).toFixed(0)}% of normal.`);
}
await browser.close();
process.exit(bad ? 1 : 0);
