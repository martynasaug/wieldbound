// CLICK A DISTANT THING AND THE CHARACTER GOES AND DOES IT.
//
// Clicking something out of reach used to be a refusal — a range check and a
// toast, "Too far from the workbench" — leaving the player to close the gap on
// the keyboard. Now the click is an errand: walk there, then perform the same
// action an in-range click performs.
//
// Two things have to be true and only one of them is obvious. The character
// must ARRIVE and the action must FIRE — and the errand must remain the
// player's to cancel, because an auto-walk you cannot call off is a possession
// rather than a convenience. Both are checked here.
//
// AND WHILE IT IS WALKING, the nameplate. Plates are DOM elements positioned
// from a projected world point, and the anchor sits above the body: walk right
// up to something tall and that anchor climbs out of the top of the viewport,
// so the plate vanished exactly when the object filled the screen. This watches
// the plate for the whole approach, because "sometimes disappears when you come
// close" is a thing you can only see by looking continuously.
//
//   node tools/soak/clickwalk.mjs
import { open, login, approach } from "./driver.mjs";
import { gatherRangeToNode, PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, process.argv[2] ?? `Click${Math.floor(Math.random() * 100000)}`);
await page.waitForTimeout(1500);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const look = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    return { x: g.playerX, y: g.playerY, gathering: g.gatherNodeId ?? null };
  });

/** Click whatever is drawn at a world node's screen position. */
const clickNode = (id) =>
  page.evaluate((nodeId) => {
    const g = window.__wieldbound;
    const obj = g.nodes.get(nodeId);
    if (!obj) return null;
    const p = g.world.project(obj.position.x, obj.position.y + 0.5, obj.position.z, 4000);
    if (!p) return null;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      g.world.renderer.domElement.dispatchEvent(
        new MouseEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, button: 0 }),
      );
    }
    return p;
  }, id);

// --- 4. EVERY KIND OF THING, not just the one that worked ------------------
//
// The reason this section exists: the errand was wired into the node branch and
// the station branch of the click handler and nowhere else, and the probe only
// ever clicked a tree — so it passed while clicking a townsperson still printed
// "X is too far away" and clicking a monster across the field selected it and
// left the player to walk. Reported from play as "left clicking on objects to
// walk and do action only works on gatherable objects", which is exactly what a
// test that only clicks gatherable objects will tell you.
//
// The click handler has five branches. This asks the three that should carry
// somewhere to go.
console.log("\n4. clicking any kind of thing walks you to it");

/**
 * Where a world-pixel position is in the SCENE.
 *
 * Not `px / 40`. The scene is recentred on spawn, so scene x is
 * `(px - PLAYER_SPAWN.x) / PX_PER_UNIT` — Warden Cabel at world 8293 stands at
 * scene 7.3, not 207.3. Getting this wrong projects a point two hundred units
 * off the map, `project` correctly returns null, and every test reports
 * "not on screen" about a townsperson standing in front of the character.
 * Three rounds of this file's INCONCLUSIVE output were that one missing offset.
 */
const toScene = (x, y) => [(x - PLAYER_SPAWN.x) / 40, (y - PLAYER_SPAWN.y) / 40];

/** Click whatever is drawn at a world position, and say whether anything was there. */
const clickWorld = (x, y, liftY) =>
  page.evaluate(([sx, sz, lift]) => {
    const g = window.__wieldbound;
    const p = g.world.project(sx, lift, sz, 4000);
    if (!p) return null;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      g.world.renderer.domElement.dispatchEvent(
        new MouseEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, button: 0 }),
      );
    }
    return p;
  }, [...toScene(x, y), liftY]);

/**
 * Click a monster where it is NOW, at the point the game picks it by.
 *
 * A monster is not a tree: it is moving, usually straight at you, and the
 * position a finder read a few hundred milliseconds ago is not where it is when
 * the click lands. Clicking a remembered position missed every time and
 * reported "it moved 0px", which reads as the errand not being wired for
 * monsters when it was the probe aiming at a ghost.
 *
 * The height matters too — `pickMonsterAt` projects the middle of the body and
 * accepts clicks within a screen radius of THAT — so this asks for the same
 * point rather than a guess a unit off the floor.
 */
const clickMonster = (id) =>
  page.evaluate((monsterId) => {
    const g = window.__wieldbound;
    const vis = g.monsters.get(monsterId);
    if (!vis?.actor?.loaded) return null;
    const p = vis.actor.position;
    // LOW, AND THAT IS NOT A GUESS. `pickMonsterAt` tests a sphere centred at
    // half the model's height with a radius of half its height, so the sphere
    // touches the ground for every creature in the game — from a 0.8-unit slime
    // to a 3.4-unit dragon. A point just above the feet is inside it for all of
    // them. Aiming at an assumed mid-body height of 2 units sailed clean over
    // the short ones, the ray missed, and the click fell through to the ground
    // branch — which CLEARS errands, so the probe's own click was cancelling
    // the thing it was testing.
    const at = g.world.project(p.x, p.y + 0.4, p.z, 4000);
    if (!at) return null;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      g.world.renderer.domElement.dispatchEvent(
        new MouseEvent(type, { clientX: at.x, clientY: at.y, bubbles: true, button: 0 }),
      );
    }
    return at;
  }, id);

/**
 * Walk within sight of something, then click it and watch whether we close in.
 *
 * GETTING IT ON SCREEN IS MOST OF THE WORK, and the first version skipped it:
 * it picked the nearest candidate and clicked where that candidate would be,
 * and the camera sees a band a few hundred pixels wide, so all three subjects
 * came back "not on screen" and all three tests reported INCONCLUSIVE. That is
 * an honest non-answer rather than a false pass, but it is still no evidence —
 * and the thing being tested had been reported broken by a person, so no
 * evidence was not good enough.
 *
 * `find` returns the nearest candidate whether or not it is visible; the walk
 * closes until it projects, and only then is anything clicked.
 */
const clickAndWatch = async (label, find, arriveWithin) => {
  let subject = await find();
  if (!subject) {
    console.log(`  INCONCLUSIVE  ${label}: nothing suitable in range to click`);
    return;
  }
  // Close in until the camera can see it, keeping it out of arrival range so
  // the click still has somewhere to walk.
  let hit = null;
  for (let i = 0; i < 30; i++) {
    subject = (await find()) ?? subject;
    hit = await page.evaluate(([sx, sz, lift]) => {
      const g = window.__wieldbound;
      return g.world.project(sx, lift, sz, 4000);
    }, [...toScene(subject.x, subject.y), subject.lift]);
    const here = await look();
    const d = Math.hypot(subject.x - here.x, subject.y - here.y);
    if (hit && d > arriveWithin * 1.4) break;
    hit = null;
    if (d <= arriveWithin * 1.1) {
      console.log(`  INCONCLUSIVE  ${label}: already within reach before it came on screen`);
      return;
    }
    await approach(page, { x: subject.x, y: subject.y, d }, 450);
  }
  if (!hit) {
    console.log(`  INCONCLUSIVE  ${label}: never got it on screen, so no click landed`);
    return;
  }
  const before = await look();
  if (subject.id) await clickMonster(subject.id);
  else await clickWorld(subject.x, subject.y, subject.lift);
  // DID THE CLICK SET AN ERRAND AT ALL? Movement is a consequence two steps
  // removed, and "it moved 0px" is the same output for a click that missed, a
  // click that landed on the wrong branch, and an errand that was set and then
  // cancelled. Reading the game's own state says which.
  const errand = await page.evaluate(() => {
    const e = window.__wieldbound.errand;
    return e ? { x: Math.round(e.x), y: Math.round(e.y), withinPx: Math.round(e.withinPx), follows: !!e.follow } : null;
  });
  console.log(`    errand after the click: ${errand ? JSON.stringify(errand) : "none"}`);
  let closest = Math.hypot(subject.x - before.x, subject.y - before.y);
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(400);
    const now = await look();
    const live = (await find()) ?? subject;
    const d = Math.hypot(live.x - now.x, live.y - now.y);
    closest = Math.min(closest, d);
    if (d <= arriveWithin) break;
  }
  const after = await look();
  // ALONG THE BEARING, not raw displacement. A monster runs at you while you
  // walk at it, so the character covers less ground than the gap closes, and a
  // flat "moved 60px" reads a working errand as a failure — which it did, at
  // 56px. Projecting onto the direction of the click answers the question the
  // test is actually asking: did clicking send the character THAT way.
  const bearing = Math.atan2(subject.y - before.y, subject.x - before.x);
  const towards =
    (after.x - before.x) * Math.cos(bearing) + (after.y - before.y) * Math.sin(bearing);
  check(
    `${label}: the click sent the character towards it`,
    towards > 40,
    `it moved ${Math.round(towards)}px along the bearing; closest approach ${Math.round(closest)}px`,
  );
};

console.log("1. in town: clicking a person or the bench walks you to them");
await clickAndWatch(
  "townsperson",
  () =>
    page.evaluate(() => {
      const g = window.__wieldbound;
      let best = null;
      for (const [, n] of g.npcs) {
        const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
        if (!best || d < best.d) best = { x: n.x, y: n.y, d, lift: 1.2 };
      }
      // Only worth the test if it is out of talking range to begin with.
      return best && best.d > 120 ? best : null;
    }),
  110,
);

await clickAndWatch(
  "workbench",
  () =>
    page.evaluate(() => {
      const g = window.__wieldbound;
      let best = null;
      for (const [, s] of g.stationStates) {
        const d = Math.hypot(s.x - g.playerX, s.y - g.playerY);
        if (d > 120 && (!best || d < best.d)) best = { x: s.x, y: s.y, d, lift: 1.4 };
      }
      return best;
    }),
  60,
);


// OUT OF TOWN FIRST, ALONG A HEADING THAT WORKS.
//
// Two things had to be learned the hard way here. The first version clicked the
// nearest tree outright — 1001px away, twenty-five world units, far outside the
// camera — and `project` correctly returned null: you can only click what is
// drawn. The second walked toward that tree and got STUCK, pinned at 1186px for
// fifty legs, because leaving town means leaving through a gate and the bearing
// to that particular tree does not have one. Both produced four identical
// failures that read as the errand system not working, and in both cases the
// errand system had never been reached.
//
// So: out through the gate on a bearing known to work, THEN pick a tree that is
// genuinely on screen, and let the click do the rest. Everything after the
// click is the game's doing; nothing here touches a key again.
const OUT = { x: PLAYER_SPAWN.x + Math.cos(0.6) * 1400, y: PLAYER_SPAWN.y + Math.sin(0.6) * 1400 };
for (let i = 0; i < 60; i++) {
  const p2 = await look();
  const d = Math.hypot(OUT.x - p2.x, OUT.y - p2.y);
  if (d < 90) break;
  await approach(page, { ...OUT, d }, 500);
}

// A tree that is drawn AND out of reach, so the click has somewhere to walk.
const target = await page.evaluate(() => {
  const g = window.__wieldbound;
  let best = null;
  for (const n of g.nodeStates.values()) {
    if (n.kind !== "tree" || n.status !== "available") continue;
    const obj = g.nodes.get(n.id);
    if (!obj || !g.world.project(obj.position.x, obj.position.y + 0.5, obj.position.z, 200)) continue;
    const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
    if (d < 120) continue; // already in reach
    if (!best || d < best.d) best = { id: n.id, x: n.x, y: n.y, d };
  }
  return best;
});
if (!target) {
  console.log("INCONCLUSIVE — no tree both on screen and out of reach after leaving town");
  await browser.close();
  process.exit(0);
}
console.log(`clicking ${target.id}, ${Math.round(target.d)}px away, and touching no keys\n`);

// CANCELLING IS TESTED FIRST, on the one target known to be clickable.
//
// It used to run last, against a second node picked for being far away — which
// after the walk was a node the camera could not see, so the click landed on
// nothing and the test passed by reporting that a character which had never
// moved had successfully stopped. Testing the cancel on the SAME target, before
// the errand is allowed to complete, removes the second selection entirely.
console.log("1. the errand is the player's to call off");
{
  const before = await look();
  const hit = await clickNode(target.id);
  await page.waitForTimeout(900);
  const started = await look();
  const startedBy = Math.hypot(started.x - before.x, started.y - before.y);
  check("the click set the character walking", !!hit && startedBy > 15, `it moved ${Math.round(startedBy)}px`);

  await page.keyboard.down("s");
  await page.waitForTimeout(250);
  await page.keyboard.up("s");
  const afterKey = await look();
  await page.waitForTimeout(1600);
  const later = await look();
  // The question is what happens AFTER the key is released: an errand that
  // survived the keypress would quietly resume and finish the walk.
  const gapAfterKey = Math.hypot(target.x - afterKey.x, target.y - afterKey.y);
  const gapLater = Math.hypot(target.x - later.x, target.y - later.y);
  console.log(`  gap to the tree: ${Math.round(gapAfterKey)}px at the keypress, ${Math.round(gapLater)}px a second and a half later`);
  check(
    "a movement key cancels it for good",
    gapLater >= gapAfterKey - 40,
    `it closed another ${Math.round(gapAfterKey - gapLater)}px on its own after being cancelled`,
  );
  check("and nothing was gathered by the cancelled errand", later.gathering === null, `gathering ${later.gathering}`);
}

console.log("\n2. clicked again, it walks there and gathers");
const startAt = await look();
await clickNode(target.id);

// WATCH THE PLATE THROUGHOUT, not at the end. The failure being chased happens
// during the last stride and would be invisible to a before-and-after check.
let plateSeen = 0;
let plateMissingClose = 0;
let closestSeen = Infinity;
let gathering = false;
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(400);
  const s = await look();
  const d = Math.hypot(target.x - s.x, target.y - s.y);
  closestSeen = Math.min(closestSeen, d);
  const plate = await page.evaluate((id) => {
    // Node plates are keyed `node-<id>`, not by the bare node id — a query for
    // the wrong key finds nothing and reads exactly like a plate that is not
    // being drawn, which is the failure this probe exists to detect.
    const el = document.querySelector(`#hud3d [data-id="node-${id}"]`);
    if (!el) return { present: false };
    const r = el.getBoundingClientRect();
    return { present: r.width > 0 && r.height > 0 && r.top >= 0 };
  }, target.id);
  if (plate.present) plateSeen++;
  // Only the close half of the approach is the subject: a plate legitimately
  // hides at distance, and counting that as a failure would be measuring the
  // design rather than the bug.
  else if (d < 400) plateMissingClose++;
  if (s.gathering) { gathering = true; break; }
}
const end = await look();
const moved = Math.hypot(end.x - startAt.x, end.y - startAt.y);
console.log(`  walked ${Math.round(moved)}px, closest ${Math.round(closestSeen)}px, gathering=${end.gathering ?? "null"}`);
check("the character walked to the tree without a keypress", moved > 100, `it moved ${Math.round(moved)}px`);
check("and the gather started on arrival", gathering, "the errand walked there and did nothing");

console.log("\n3. the nameplate survives the approach");
console.log(`  the plate was drawn in ${plateSeen} sample(s); missing in ${plateMissingClose} sample(s) taken within 400px`);
check(
  "the plate does not vanish as the character closes in",
  plateMissingClose === 0 && plateSeen > 0,
  plateSeen === 0 ? "no plate was ever drawn — is the query key right?" : `${plateMissingClose} close-range sample(s) had no plate`,
);


console.log("\n5. out in the field: clicking a monster closes the distance");
await clickAndWatch(
  "monster",
  () =>
    page.evaluate(() => {
      const g = window.__wieldbound;
      let best = null;
      for (const v of g.monsters.values()) {
        if (!v.state || v.state.status !== "alive") continue;
        const d = Math.hypot(v.state.x - g.playerX, v.state.y - g.playerY);
        // NOT A THROWER. Cactoro, demon and golem hold station at about 150px
        // and back away as you close — correct behaviour that makes them the
        // one kind of monster this test cannot use, because "the player never
        // got closer" is then a statement about the monster's design. A first
        // run picked one and reported a 145px closest approach as a failure.
        if (v.kind === "cactoro" || v.kind === "demon" || v.kind === "golem") continue;
        if (d > 120 && (!best || d < best.d)) best = { id: v.state.id, x: v.state.x, y: v.state.y, d, lift: 1.0 };
      }
      return best;
    }),
  80,
);


console.log(failures === 0 ? "\nOK — click, walk, act, and stop when told" : `\n${failures} FAILURES`);
await browser.close();
process.exit(failures ? 1 : 0);
