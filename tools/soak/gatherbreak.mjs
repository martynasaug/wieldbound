// WHAT AN INTERRUPTED GATHER LOOKS LIKE.
//
// M70.229 gave a cut-off gather a state of its own: the arc stops where it got
// to, turns red, and a log line names the rule. `gatherstate.mjs` proves the
// WIRE half — walking off mid-gather reports interrupted rather than done — and
// nothing has ever looked at the other half. An arc that is drawn red and an
// arc that keeps filling in red are the same on every counter there is.
//
// So: start a gather, let it get part-way, walk out of range, and photograph
// the moment. The arc's own fill fraction is read off the client as well, since
// "stops where it got to" is a number and not an impression.
//
//   node tools/soak/gatherbreak.mjs Player3619 tools/soak/shots/gatherbreak
import { mkdirSync } from "node:fs";
import { open, login, approach } from "./driver.mjs";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/gatherbreak";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.world.setCameraDistance(9.5);
});
await new Promise((r) => setTimeout(r, 2000));

// The nearest node of any kind, and walk into range of it.
const target = await page.evaluate(() => {
  const g = window.__wieldbound;
  let best = null;
  let bd = Infinity;
  for (const n of g.nodeStates.values()) {
    if (n.status !== "available") continue;
    const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
    if (d < bd) { bd = d; best = { id: n.id, kind: n.kind, x: n.x, y: n.y, d: Math.round(d) }; }
  }
  return best;
});
if (!target) { console.log("no available node"); await browser.close(); process.exit(0); }
console.log(`walking ${target.d}px to ${target.id} (${target.kind})`);
// TWO PHASES, the way gatherclick.mjs does it. A single long leg overshoots and
// leaves the character just outside the 40px radius - the first run of this
// stopped at 176px and reported a gather that never started.
const at = () => page.evaluate((t) => {
  const g = window.__wieldbound;
  return Math.hypot(t.x - g.playerX, t.y - g.playerY);
}, target);
for (let i = 0; i < 40; i++) {
  if (await at() <= INTERACTION_RANGE_PX * 0.5) break;
  await approach(page, { x: target.x, y: target.y }, 400);
}
for (let i = 0; i < 30; i++) {
  if (await at() <= INTERACTION_RANGE_PX * 0.5) break;
  await approach(page, { x: target.x, y: target.y }, 120);
}

const gap = await page.evaluate((t) => {
  const g = window.__wieldbound;
  return Math.round(Math.hypot(t.x - g.playerX, t.y - g.playerY));
}, target);
console.log(`standing ${gap}px away (range is ${INTERACTION_RANGE_PX})`);

/** What the client believes about the gather in progress. */
const state = () => page.evaluate(() => {
  const g = window.__wieldbound;
  const fx = g.gatherFx ?? null;
  return {
    gathering: g.gatherNodeId ?? null,
    // Whatever the arc is carrying, without assuming a field name.
    fx: fx ? Object.fromEntries(
      Object.entries(fx).filter(([, v]) => typeof v === "number" || typeof v === "string" || typeof v === "boolean"),
    ) : null,
  };
});

await page.evaluate((id) => window.__wieldbound.socket.sendGather(id), target.id);
await new Promise((r) => setTimeout(r, 900));
console.log(`part-way through: ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${OUT}/1-partway.png` });

// WALK OFF. This is the interruption the rule is about.
// JUST FAR ENOUGH TO BREAK RANGE, and no further. The first version ran for
// 700ms and ended 285px away with the node off the bottom of the frame, so the
// picture of the interrupted arc did not contain the arc. Range is 40px; a
// short step clears it and leaves the node on screen to be looked at.
await page.keyboard.down("s");
await new Promise((r) => setTimeout(r, 260));
await page.keyboard.up("s");

// A BURST, because the arc does not wait. A single crop 180ms after the step
// caught nothing at all — no arc, red or otherwise — which cannot distinguish
// "it turns red and holds" from "it vanishes the instant the gather stops".
// Six crops at 90ms covers just over half a second.
{
  const half = 150;
  const shot = async (n) => {
    const b = await page.evaluate((t) => {
      const g = window.__wieldbound;
      const q = g.nodes.get(t.id)?.position?.clone();
      if (!q) return null;
      q.project(g.world.camera);
      return { x: (q.x * 0.5 + 0.5) * window.innerWidth, y: (-q.y * 0.5 + 0.5) * window.innerHeight };
    }, target);
    if (!b) return;
    await page.screenshot({
      path: `${OUT}/burst-${n}.png`,
      clip: {
        x: Math.max(0, Math.round(b.x - half)),
        y: Math.max(0, Math.round(b.y - half)),
        width: half * 2,
        height: half * 2,
      },
    });
  };
  for (let i = 0; i < 6; i++) {
    await shot(i);
    await new Promise((r) => setTimeout(r, 90));
  }
  console.log("burst of 6 crops written");
}
await new Promise((r) => setTimeout(r, 180));
const after = await page.evaluate((t) => {
  const g = window.__wieldbound;
  return Math.round(Math.hypot(t.x - g.playerX, t.y - g.playerY));
}, target);
console.log(`walked out to ${after}px; state now ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${OUT}/2-broken.png` });
// AND A CROP AROUND THE NODE ITSELF. The arc is drawn on the ground at the
// node, and at a playable camera distance it is maybe eighty pixels across in a
// 1280-wide frame - too small to tell "stopped and red" from "still filling".
// Project the node and clip to it.
const box = await page.evaluate((t) => {
  const g = window.__wieldbound;
  const v = g.world.toWorldVec ? g.world.toWorldVec(t.x, t.y) : null;
  const p2 = g.nodes.get(t.id)?.position?.clone();
  if (!p2) return null;
  p2.project(g.world.camera);
  return { x: (p2.x * 0.5 + 0.5) * window.innerWidth, y: (-p2.y * 0.5 + 0.5) * window.innerHeight };
}, target);
if (box) {
  const half = 170;
  await page.screenshot({
    path: `${OUT}/2-broken-crop.png`,
    clip: {
      x: Math.max(0, Math.round(box.x - half)),
      y: Math.max(0, Math.round(box.y - half)),
      width: half * 2,
      height: half * 2,
    },
  });
  console.log(`cropped around the node at ${Math.round(box.x)},${Math.round(box.y)}`);
}

await new Promise((r) => setTimeout(r, 1400));
await page.screenshot({ path: `${OUT}/3-after.png` });

const log = await page.evaluate(() =>
  [...document.querySelectorAll("#combat-log div, .combat-log div")].slice(-6).map((e) => e.textContent.trim()));
console.log("the log said:");
for (const l of log) console.log(`  ${l}`);
await browser.close();
