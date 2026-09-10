// CLICK TO GATHER, AND A STUMP WHEN IT IS DONE.
//
// M70.230 turned gathering from something proximity did to you into something
// you choose, and gave a spent node real art instead of 35% opacity. Two things
// to show, neither of which a wallet number can:
//
//   * walking up to a node and waiting does NOTHING. That is the whole change,
//     and it is the one easiest to fail to notice, because the old behaviour and
//     the new differ only in the absence of an event.
//   * a spent tree is a STUMP — crown hidden, trunk cut down — not a whole tree
//     drawn faintly.
//
// The order is placed through the client's own `sendGather`, not a mouse click.
// The click PATH — raycast, range check, refusal — is covered by
// `tools/test/gatherstate.mjs` at the protocol level and by `hoverNodeId` below;
// driving it through the pointer here means fighting the camera for a screen
// point that is on the trunk rather than on the player standing in front of it,
// which measures projection maths and not gathering.
//
//   node tools/soak/gatherclick.mjs Clicker1 tools/soak/shots/click
import { mkdirSync } from "node:fs";
import { open, login, approach, step } from "./driver.mjs";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Click${Math.floor(Math.random() * 90000)}`;
const OUT = process.argv[3] ?? "tools/soak/shots/click";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.world.setCameraDistance(6.5);
});
await page.waitForTimeout(1200);

const nearestTree = () => page.evaluate(() => {
  const g = window.__wieldbound;
  let best = null;
  for (const n of g.nodeStates?.values?.() ?? []) {
    if (n.kind !== "tree" || n.status !== "available") continue;
    const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
    if (!best || d < best.d) best = { x: n.x, y: n.y, d, id: n.id };
  }
  return best;
});
for (let i = 0; i < 70; i++) {
  const at = await nearestTree();
  if (!at || at.d <= INTERACTION_RANGE_PX * 0.5) break;
  await approach(page, at, 400);
}
// The last few pixels in short legs: a 400ms leg is 88px at walking pace and
// can straddle the 40px radius, leaving the character just outside it. A run
// that stopped at 43px reported "the click did nothing", which was true and was
// a statement about the walk — the server refused because it really was too far.
for (let i = 0; i < 30; i++) {
  const at = await nearestTree();
  if (!at || at.d <= INTERACTION_RANGE_PX * 0.5) break;
  await approach(page, at, 120);
}
const target = await nearestTree();
if (!target) { console.log("could not reach a tree"); await browser.close(); process.exit(1); }
console.log(`standing ${target.d.toFixed(0)}px from ${target.id} (interaction range ${INTERACTION_RANGE_PX})`);

const look = () => page.evaluate(() => ({
  gathering: window.__wieldbound.gatherNodeId ?? null,
  wood: window.__wieldbound.wallet?.wood,
  hoverNodeId: window.__wieldbound.hoverNodeId ?? null,
}));

// 1. WAITING DOES NOTHING — four seconds, longer than a full gather.
const before = await look();
await page.waitForTimeout(4200);
const waited = await look();
console.log(
  `  waited 4.2s without asking: gathering=${waited.gathering}, wood ${before.wood} -> ${waited.wood}` +
    (waited.wood === before.wood && !waited.gathering
      ? "   (correct — proximity does nothing)"
      : "   !! IT GATHERED ON ITS OWN"),
);
await page.screenshot({ path: `${OUT}/idle-beside-tree.png` });

// 2. Ask for it, the way a click does.
await page.evaluate((id) => window.__wieldbound.socket.sendGather(id), target.id);
await page.waitForTimeout(1000);
const started = await look();
console.log(`  after asking: gathering=${started.gathering}` + (started.gathering ? "" : "   !! NOTHING STARTED"));
await page.screenshot({ path: `${OUT}/gathering.png` });

// 3. Let it pay, then look at what is left standing.
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(400);
  if ((await look()).wood > waited.wood) break;
}
await page.waitForTimeout(500);
const done = await look();
const spent = await page.evaluate((id) => {
  const g = window.__wieldbound;
  const o = g.nodes.get(id);
  let leavesVisible = 0, leavesHidden = 0, barkVisible = 0;
  o?.traverse((m) => {
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const name = mats.map((mm) => mm?.name ?? "").join(",");
    if (name.includes("Leaves")) (m.visible ? leavesVisible++ : leavesHidden++);
    else if (name.includes("Bark") && m.visible) barkVisible++;
  });
  return {
    status: g.nodeStates.get(id)?.status,
    leavesVisible, leavesHidden, barkVisible,
    sunkBy: o?.children?.[0]?.position?.y ?? null,
    ...(() => {
      const c = o?.children?.[0];
      if (!c) return {};
      o.updateWorldMatrix(true, true);
      let top = -Infinity, bottom = Infinity;
      c.traverse((m) => {
        if (!m.isMesh || !m.visible || !m.geometry) return;
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
          const e = m.matrixWorld.elements;
          const wy = e[1]*cx + e[5]*cy + e[9]*cz + e[13];
          if (wy > top) top = wy; if (wy < bottom) bottom = wy;
        }
      });
      return { visTop: +top.toFixed(2), visBottom: +bottom.toFixed(2), hostY: +o.position.y.toFixed(2) };
    })(),
  };
}, target.id);
console.log(`  gathered: wood ${waited.wood} -> ${done.wood}`);
console.log(`  the node now: ${JSON.stringify(spent)}`);
console.log(
  spent.status !== "available" && spent.leavesHidden > 0 && spent.barkVisible > 0 && spent.sunkBy < -0.5
    ? "  a stump: crown hidden, trunk still there and cut down"
    : "  !! the spent tree does not look spent",
);
await page.screenshot({ path: `${OUT}/stump.png` });

// A CLEAN LOOK AT WHAT IS LEFT. The character stands on top of the node while
// gathering, and band-1 camps wander over it — the shot above caught two slimes
// sitting on the stump. Step back and pull the camera out for a second one.
await page.evaluate(() => window.__wieldbound.world.setCameraDistance(9));
for (let i = 0; i < 5; i++) await step(page, ["s"], 260);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/stump-clear.png` });
await browser.close();
console.log(`\nshots in ${OUT}/`);
