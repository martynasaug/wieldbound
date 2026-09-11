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
  // THE PAIRING IS SOUGHT OUT, NOT WAITED FOR.
  //
  // This looked for a tree with a monster already within 260px of it, at
  // whatever spot the character happened to be standing, and reported
  // INCONCLUSIVE every run — camps sit at 1320px and up while the character
  // starts in town, so the two were never near each other. A probe that reports
  // INCONCLUSIVE every time it runs is not a cautious probe, it is an unused
  // one, and the question it declines to answer is whether a trunk can be
  // hidden behind indefinitely.
  //
  // The client knows every node and every monster in the world, so the closest
  // tree-and-monster pairing ANYWHERE is findable from here; the bot then walks
  // to it.
  let best = null;
  for (const nd of w.nodes) {
    if (nd.kind !== "tree") continue;
    for (const m of w.monsters) {
      const d = Math.hypot(m.x - nd.x, m.y - nd.y);
      if (d < 420 && (!best || d < best.d)) best = { node: nd, monster: m, d };
    }
  }
  if (best) {
    // Walk to the tree first. Its monster will notice on the way in, which is
    // the point — the fight should start before the hiding does.
    console.log(`  walking to ${best.node.id}, which has a ${best.monster.kind} ${Math.round(best.d)}px away`);
    for (let i = 0; i < 80; i++) {
      const here = await world();
      const d = Math.hypot(best.node.x - here.x, best.node.y - here.y);
      if (d < 120) break;
      await approach(page, { x: best.node.x, y: best.node.y, d }, 500);
    }
    // Re-read: the monster has been chasing, so its position is stale.
    const now = await world();
    const live = now.monsters.find((m) => m.id === best.monster.id);
    if (live) best = { node: best.node, monster: live, d: Math.hypot(live.x - best.node.x, live.y - best.node.y) };
  }
  if (!best) {
    console.log("  INCONCLUSIVE — nowhere in the world is a tree within 420px of anything alive");
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
