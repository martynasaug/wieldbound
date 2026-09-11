// CAN A CHARACTER STILL GET ANYWHERE NOW THAT NODES ARE SOLID?
//
// Making trees, rocks and bushes collision bodies added 82 obstacles to a world
// that had none outside the town and the river. The guided-opening run straight
// afterwards killed 2 monsters against 5-6 before, and a click-to-walk probe
// watched the bot end up FURTHER from its target after sixty legs of walking
// than it started. Both are consistent with a bot that now snags on scenery —
// and both are equally consistent with the game having become genuinely harder
// to move around, which would be a real problem for players and not just bots.
//
// This walks a straight line through the tree rings and reports how much ground
// was actually covered against how much was asked for. It says nothing about
// whose fault a shortfall is; it says how big one is.
//
//   node tools/soak/navcheck.mjs
import { open, login, approach, step } from "./driver.mjs";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const { browser, page } = await open({ headless: true, width: 900, height: 620 });
await login(page, process.argv[2] ?? `Nav${Math.floor(Math.random() * 100000)}`);
await page.waitForTimeout(1500);

const at = () => page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

// Straight out from spawn, through the bush ring at 1000, the tree ring at 1150
// and the rock ring at 1500.
const HEADING = 0.6;
const TARGET = {
  x: PLAYER_SPAWN.x + Math.cos(HEADING) * 1800,
  y: PLAYER_SPAWN.y + Math.sin(HEADING) * 1800,
};

console.log("walking 1800px out through the node rings, one leg at a time:\n");
let stalls = 0;
let best = Infinity;
const start = await at();
for (let i = 0; i < 70; i++) {
  const p = await at();
  const d = Math.hypot(TARGET.x - p.x, TARGET.y - p.y);
  if (d < best - 1) best = d;
  else stalls++;
  if (i % 10 === 0 || d < 60) {
    // What is within arm's reach, so a stall can be attributed to a thing
    // rather than guessed at.
    const near = await page.evaluate(() => {
      const g = window.__wieldbound;
      let n = null;
      for (const s of g.nodeStates.values()) {
        const dd = Math.hypot(s.x - g.playerX, s.y - g.playerY);
        if (!n || dd < n.d) n = { kind: s.kind, d: Math.round(dd) };
      }
      return n;
    });
    console.log(`  leg ${String(i).padStart(2)}: ${Math.round(d)}px to go, nearest node ${near ? `${near.kind} at ${near.d}px` : "none"}`);
  }
  if (d < 60) break;
  await approach(page, { ...TARGET, d }, 500);
}
const end = await at();
const covered = Math.hypot(end.x - start.x, end.y - start.y);
const remaining = Math.hypot(TARGET.x - end.x, TARGET.y - end.y);
console.log(`\ncovered ${Math.round(covered)}px of 1800, ${Math.round(remaining)}px still to go, ${stalls} leg(s) made no progress`);
console.log(
  remaining < 120
    ? "the walk completes — solid nodes are not blocking travel"
    : "!! the walk did not complete; solid nodes may be snagging the approach",
);
await browser.close();
