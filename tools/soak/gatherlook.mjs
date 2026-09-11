// WHAT DOES GATHERING LOOK LIKE NOW?
//
// M70.227 gave gathering a progress arc, a swing per beat, debris off the node
// and a flourish on the payoff. All of that is invisible to a test that checks
// numbers: the wallet went up before this change too. So this walks to each of
// the three node kinds, stands in it, and photographs the act at several points
// through a single gather — which is the only way to tell "an arc that fills"
// from "an arc that is drawn".
//
//   node tools/soak/gatherlook.mjs Fighter tools/soak/shots/gather
import { mkdirSync } from "node:fs";
import { open, login, approach } from "./driver.mjs";
import { gatherRangeToNode } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Fighter";
const OUT = process.argv[3] ?? "tools/soak/shots/gather";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.world.setCameraDistance(4.6);
});
await page.waitForTimeout(1200);

const nearest = (kind) => page.evaluate((k) => {
  const g = window.__wieldbound;
  let best = null;
  for (const n of g.nodeStates?.values?.() ?? []) {
    if (n.kind !== k || n.status !== "available") continue;
    const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
    if (!best || d < best.d) best = { x: n.x, y: n.y, d, id: n.id };
  }
  return best;
}, kind);

// Read the client's own gather state, which is the thing under test: if this
// stays null the pictures below are of a character standing next to a tree.
const gatherState = () => page.evaluate(() => {
  const g = window.__wieldbound;
  return { node: g.gatherNodeId ?? null, wood: g.wallet?.wood, ore: g.wallet?.ore, herb: g.wallet?.herb };
});

for (const [kind, label] of [["tree", "wood"], ["rock", "ore"], ["bush", "herb"]]) {
  let at = await nearest(kind);
  if (!at) { console.log(`${kind}: none available`); continue; }
  console.log(`\n${kind}: walking ${at.d.toFixed(0)}px to ${at.id}`);
  for (let i = 0; i < 60; i++) {
    at = await nearest(kind);
    // NODES ARE SOLID NOW, so collision holds the player about 30px from a
    // tree's centre and the old target of 24px could never be met — the walk
    // would burn every one of its sixty legs and photograph a character in
    // the middle of a field. Gathering is measured to the surface; so is this.
    if (!at || at.d <= gatherRangeToNode(kind) * 0.8) break;
    await approach(page, at, 400);
  }
  const arrived = await nearest(kind);
  console.log(`  standing ${arrived ? arrived.d.toFixed(0) : "?"}px away`);
  // Ask for it. Since M70.230 proximity gathers nothing, so a run that only
  // walks photographs a character standing beside a node doing nothing.
  if (arrived) await page.evaluate((id) => window.__wieldbound.socket.sendGather(id), arrived.id);

  const before = await gatherState();
  let sawGather = false;
  for (let shot = 0; shot < 7; shot++) {
    await page.waitForTimeout(700);
    const s = await gatherState();
    if (s.node) sawGather = true;
    await page.screenshot({ path: `${OUT}/${kind}-${shot}.png` });
    console.log(`  +${((shot + 1) * 0.7).toFixed(1)}s  gathering=${s.node ?? "null"}  ${label}=${s[label]}  ${await page.evaluate(() => {
      const a = window.__wieldbound.localActor;
      // THE POSE FIELD STOPPED MEANING ANYTHING when strokes became layered
      // rather than played: `currentAnim` reads "idle" throughout a gather now,
      // because the idle IS what is playing underneath the posed arms. What
      // says whether gathering is animating is the stroke and the tool.
      return `stroke=${a?.strokeKind ?? "none"} tool=${a?.heldToolKind ?? "none"}`;
    })}`);
  }
  const after = await gatherState();
  console.log(
    `  ${label} ${before[label]} -> ${after[label]}` +
      (sawGather ? "" : "   !! the client never saw a GATHER_STATE — the pictures show nothing happening"),
  );
}
await browser.close();
console.log(`\nshots in ${OUT}/`);
