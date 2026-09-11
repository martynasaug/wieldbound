// WALKING TO "THE NEAREST TREE" IS NOT WALKING TO A TREE.
//
// A guided-opening run reported "gathering wood: 20 -> 20 (gave up)" with every
// interrupt counter at zero, and the next run failed the ORE phase instead while
// wood worked. Two runs, two different materials, same shape — which is the
// signature of a coin toss rather than a bug in either.
//
// The phase re-chose its target on every leg, passing "whichever available node
// is nearest right now" as the destination. The rings hold 42 trees and 28 rocks
// at fixed radii, so two of them are very often within a few pixels of equally
// far; the pick flips between them and the character walks the bisector,
// closing on neither. It arrives only when the tie happens to break.
//
// This walks the same ground both ways from one character, so the comparison is
// not between two runs on two days.
//
//   node tools/soak/treewalk.mjs
import { open, login, approach } from "./driver.mjs";
import { INTERACTION_RANGE_PX, PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const WANT = INTERACTION_RANGE_PX * 0.7; // the threshold the harness uses
const LEGS = 40; // and the number of legs it allows

const { browser, page } = await open({ headless: true, width: 900, height: 620 });
await login(page, process.argv[2] ?? `Tree${Math.floor(Math.random() * 100000)}`);
await page.waitForTimeout(1500);

const census = await page.evaluate(() => {
  const g = window.__wieldbound;
  const all = [...(g.nodeStates?.values?.() ?? [])];
  const by = {};
  for (const n of all) by[`${n.kind}/${n.status}`] = (by[`${n.kind}/${n.status}`] ?? 0) + 1;
  return { total: all.length, by };
});
console.log(`the client knows ${census.total} nodes: ${JSON.stringify(census.by)}`);
console.log("(every node in the world is in STATE_SNAPSHOT — there is no streaming radius)\n");

/** The nearest available node of a kind, right now. */
const nearest = (kind) =>
  page.evaluate((k) => {
    const g = window.__wieldbound;
    let best = null;
    for (const n of g.nodeStates.values()) {
      if (n.kind !== k || n.status !== "available") continue;
      const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
      if (!best || d < best.d) best = { x: n.x, y: n.y, d, id: n.id };
    }
    return best;
  }, kind);

/**
 * One walk. `lock` follows the node chosen on the first leg; otherwise the
 * destination is re-chosen every leg, which is what the harness used to do.
 */
const walk = async (kind, lock) => {
  let locked = null;
  let closest = Infinity;
  const visited = new Set();
  for (let i = 0; i < LEGS; i++) {
    let at;
    if (lock && locked) {
      at = await page.evaluate((wanted) => {
        const g = window.__wieldbound;
        for (const n of g.nodeStates.values()) {
          if (n.id !== wanted) continue;
          if (n.status !== "available") return null;
          return { x: n.x, y: n.y, d: Math.hypot(n.x - g.playerX, n.y - g.playerY), id: n.id };
        }
        return null;
      }, locked);
    } else {
      at = await nearest(kind);
      if (lock && at) locked = at.id;
    }
    if (!at) return { arrived: false, closest, switches: visited.size, legs: i, why: "target stopped being available" };
    visited.add(at.id);
    closest = Math.min(closest, at.d);
    if (at.d <= WANT) return { arrived: true, closest: at.d, switches: visited.size, legs: i, why: "arrived" };
    await approach(page, at, 500);
  }
  return { arrived: false, closest, switches: visited.size, legs: LEGS, why: "ran out of legs" };
};

/**
 * Back to town, so the next walk starts from the same ground as the last one.
 *
 * IT REPORTS WHETHER IT GOT THERE. The first version of this file did not, and
 * printed a comparison in which one strategy "arrived in 8 legs" and the other
 * "gave up after 40" — from start points hundreds of pixels apart, because the
 * reset had quietly run out of legs. Two walks from two different places are
 * not a comparison of walks, and that table was the exact kind of confident
 * wrong answer this probe exists to avoid.
 */
const homeDistance = () =>
  page.evaluate(
    (s) => Math.hypot(window.__wieldbound.playerX - s.x, window.__wieldbound.playerY - s.y),
    PLAYER_SPAWN,
  );
const goHome = async () => {
  for (let i = 0; i < 60; i++) {
    const d = await homeDistance();
    if (d < 260) return true;
    await approach(page, { ...PLAYER_SPAWN, d }, 500);
  }
  return (await homeDistance()) < 260;
};

const report = (label, from, r) =>
  console.log(
    `  ${label.padEnd(22)} from ${Math.round(from)}px: ${r.arrived ? "ARRIVED" : "gave up"} at ` +
      `${Math.round(r.closest)}px after ${r.legs} legs, aimed at ${r.switches} different node(s) — ${r.why}`,
  );

// Each strategy is tried twice per kind, because a tie breaking in your favour
// is exactly the thing being measured and one trial cannot tell a strategy from
// a coin landing heads.
for (const kind of ["tree", "rock"]) {
  console.log(`${kind}:`);
  for (const trial of [1, 2]) {
    for (const [label, lock] of [["nearest each leg", false], ["one node, followed", true]]) {
      if (!(await goHome())) {
        console.log(`  !! could not get back to town before trial ${trial} — the next line is not comparable`);
      }
      const from = await homeDistance();
      const seen = await nearest(kind);
      report(`${label} #${trial}`, seen ? seen.d : from, await walk(kind, lock));
    }
  }
}
console.log(
  `\nthe server gathers at ${INTERACTION_RANGE_PX}px and the harness stops walking at ${WANT}px.`,
);
await browser.close();
