// THE SCENERY BLOCKS BOTH OF YOU, OR IT ONLY BLOCKS YOU.
//
// Making nodes solid stopped trees dissolving when you walked onto them, and
// stopped there — for the PLAYER. Monsters resolved against player bodies and
// nothing else, so every wolf in the world could walk through a trunk that the
// person it was chasing had to go around.
//
// That is not cosmetic. Retreating to heal is the one defensive move the early
// game has, and an obstacle that only slows the person running away makes it
// strictly worse — a change about how the world looks quietly taking away a
// piece of how it plays.
//
// The opposite failure is just as bad and is what this really watches for: a
// monster that CANNOT get past a tree is a monster you can kite forever by
// standing behind one. Depenetration should slide it around, the same way
// walking into a monster slides you around it rather than sticking you to it.
// So this asks both questions of the same monster.
//
//   node tools/soak/treefair.mjs
import { open, login, approach } from "./driver.mjs";
import { NODE_BODY_RADIUS_PX, PLAYER_BODY_RADIUS_PX } from "../../shared/protocol-types.ts";

const { browser, page } = await open({ headless: true, width: 900, height: 620 });
await login(page, process.argv[2] ?? `Fair${Math.floor(Math.random() * 100000)}`);
await page.waitForTimeout(1500);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const world = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    const monsters = [];
    for (const v of g.monsters.values()) {
      if (!v.state || v.state.status !== "alive") continue;
      monsters.push({ id: v.state.id, kind: v.kind, x: v.state.x, y: v.state.y });
    }
    const nodes = [];
    for (const n of g.nodeStates.values()) nodes.push({ id: n.id, kind: n.kind, x: n.x, y: n.y });
    return { x: g.playerX, y: g.playerY, hp: g.hp, monsters, nodes };
  });

// --- 1. can a monster stand inside a tree? --------------------------------
//
// The direct question, and the one that needs no chase at all: sample every
// live monster against every node for a whole minute of ordinary wandering and
// see whether any of them is ever somewhere it should not fit.
console.log("1. no monster stands inside a node");
{
  let worstOverlap = 0;
  let worst = null;
  let samples = 0;
  const until = Date.now() + 45000;
  while (Date.now() < until) {
    const w = await world();
    samples++;
    for (const m of w.monsters) {
      for (const n of w.nodes) {
        // Bodies may touch; they may not interpenetrate. A small tolerance
        // because a monster is pushed out over a tick or two rather than
        // instantly, and reporting the settling itself would be noise.
        const minimum = NODE_BODY_RADIUS_PX[n.kind] + 6;
        const d = Math.hypot(m.x - n.x, m.y - n.y);
        const overlap = minimum - d;
        if (overlap > worstOverlap) {
          worstOverlap = overlap;
          worst = { monster: m.kind, node: n.id, d: Math.round(d), minimum };
        }
      }
    }
    await page.waitForTimeout(600);
  }
  console.log(
    `  ${samples} samples; deepest overlap ${Math.round(worstOverlap)}px` +
      (worst ? ` (${worst.monster} at ${worst.d}px from ${worst.node}, needs ${worst.minimum})` : ""),
  );
  check(
    "nothing alive was found standing inside a tree, rock or bush",
    worstOverlap <= 10,
    worst ? `${worst.monster} was ${Math.round(worstOverlap)}px inside ${worst.node}` : "",
  );
}

// --- 2. and it can still get to you ---------------------------------------
//
// The other half. Stand on the far side of a tree from a monster that wants
// you, and see whether it arrives. A monster that cannot is worse than one that
// walks through: it turns every trunk in the world into a wall you can hide
// behind indefinitely.
console.log("\n2. a monster can still reach a player standing behind a tree");
{
  const w = await world();
  // A tree with something alive near it — and near enough to be roused.
  let best = null;
  for (const n of w.nodes) {
    if (n.kind !== "tree") continue;
    for (const m of w.monsters) {
      const d = Math.hypot(m.x - n.x, m.y - n.y);
      if (d < 260 && (!best || d < best.d)) best = { node: n, monster: m, d };
    }
  }
  if (!best) {
    console.log("  INCONCLUSIVE — no monster found within 260px of a tree to test with");
  } else {
    // Directly opposite the monster, one body's width past the trunk.
    const away = Math.atan2(best.node.y - best.monster.y, best.node.x - best.monster.x);
    const stand = {
      x: best.node.x + Math.cos(away) * (NODE_BODY_RADIUS_PX.tree + PLAYER_BODY_RADIUS_PX + 12),
      y: best.node.y + Math.sin(away) * (NODE_BODY_RADIUS_PX.tree + PLAYER_BODY_RADIUS_PX + 12),
    };
    console.log(`  hiding behind ${best.node.id} from a ${best.monster.kind} ${Math.round(best.d)}px away`);
    for (let i = 0; i < 50; i++) {
      const here = await world();
      const d = Math.hypot(stand.x - here.x, stand.y - here.y);
      if (d < 26) break;
      await approach(page, { ...stand, d }, 450);
    }
    // Then stand still and let it come. Its reach is about 42-56px depending on
    // kind, so "arrived" is measured generously: what matters is whether the
    // tree stopped it dead at a body's width.
    let closest = Infinity;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(500);
      const here = await world();
      const m = here.monsters.find((x) => x.id === best.monster.id);
      if (!m) break;
      closest = Math.min(closest, Math.hypot(m.x - here.x, m.y - here.y));
      if (closest < 70) break;
    }
    console.log(`  it closed to ${closest === Infinity ? "never seen again" : Math.round(closest) + "px"}`);
    check(
      "the tree slowed it without sealing it out",
      closest < 120,
      `it never got closer than ${Math.round(closest)}px — a trunk is a wall it cannot get round`,
    );
  }
}

console.log(failures === 0 ? "\nOK — the scenery is solid for both sides" : `\n${failures} FAILURES`);
await browser.close();
process.exit(failures ? 1 : 0);
