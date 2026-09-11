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

console.log(failures === 0 ? "\nOK — click, walk, act, and stop when told" : `\n${failures} FAILURES`);
await browser.close();
process.exit(failures ? 1 : 0);
