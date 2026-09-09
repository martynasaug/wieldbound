// WHICH WAY IS THE BLADE POINTING?
//
// "The weapon was the wrong way — the blade was facing the player." That is not
// something eight screenshots settle, and it is not something a screenshot
// settles at all when the answer is "some of them": fifty-four weapon and
// off-hand bases share TWENTY-NINE distinct (model, lay) pairs, and how a mesh
// sits in the fist is a property of the model, so a fault in one is invisible
// from the other twenty-eight.
//
// So this measures it instead of looking at it. For each base:
//
//   * take the world position of the hand bone the weapon hangs from,
//   * take the world position of the far end of the weapon's bounding box,
//   * and project (tip - hand) onto the character's own forward direction.
//
// Positive means the business end points AWAY from the character, which is how
// a weapon is held. Negative means it points back along the body at its owner.
//
// The sideways and vertical components are reported too, because "not pointing
// at me" is not the same as "held correctly" — a blade lying flat across the
// chest scores zero forward and is still wrong.
//
// Run `tools/seed-armoury.mjs` first, with the server stopped, so one character
// owns every base. Without it this can only judge what happens to be in the bag.
//
//   node tools/soak/weaponfacing.mjs Armoury
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

const NAME = process.argv[2] ?? "Armoury";

const { browser, page } = await open({ headless: true, width: 1000, height: 800 });
await login(page, NAME);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.world.setCameraDistance(4.5);
});
await page.waitForTimeout(1200);

const owned = await page.evaluate(() =>
  window.__wieldbound.items
    .filter((i) => i.slot === "weapon" || i.slot === "offhand")
    .map((i) => ({ id: i.id, baseId: i.baseId, slot: i.slot })),
);

const modelKey = (b) => `${b?.art?.model ?? b?.art?.build ?? "?"}|${b?.art?.lay ?? "along"}`;
/** One representative per distinct model, since orientation cannot vary within one. */
const seen = new Set();
const toCheck = [];
for (const it of owned) {
  const key = modelKey(ITEM_BASES[it.baseId]);
  if (seen.has(key)) continue;
  seen.add(key);
  toCheck.push({ ...it, key });
}
console.log(`${owned.length} items owned; ${toCheck.length} distinct (model, lay) pairs to check\n`);

const rows = [];
for (const item of toCheck) {
  const measured = await page.evaluate(async (it) => {
    const g = window.__wieldbound;
    g.socket.sendEquipItem(it.id);
    await new Promise((r) => setTimeout(r, 1400));

    const actor = g.localActor;
    const held = actor?.held ?? [];
    if (held.length === 0) return { held: false };

    // THE OBJECT THIS BASE BUILT, FOUND BY NAME, NOT "THE LAST ONE ATTACHED".
    //
    // `makeHeldItem` names every mesh `held_<baseId>`, which is the only
    // reliable way to know the thing being measured is the thing just equipped.
    // Taking `held[held.length - 1]` measured whatever happened to be in the
    // array, and the tell was in the output: Dagger, Dagger_2, Sword, Sword_2
    // and Warrior_Sword all reported byte-identical numbers. Five different
    // meshes cannot measure the same, so the probe was reading one stale object
    // five times.
    let object = null;
    for (const o of held) {
      o.traverse((c) => {
        if (!object && c.name === `held_${it.baseId}`) object = o;
      });
    }
    if (!object) return { held: false, why: `no held_${it.baseId} in the hand` };

    const THREE = g.world.THREE ?? null;
    // Bone (hand) world position: the object's parent is the socket.
    object.updateWorldMatrix(true, true);
    const hand = { x: 0, y: 0, z: 0 };
    const p = object.parent;
    p.updateWorldMatrix(true, false);
    hand.x = p.matrixWorld.elements[12];
    hand.y = p.matrixWorld.elements[13];
    hand.z = p.matrixWorld.elements[14];

    // Far end of the weapon in world space: the bounding-box corner furthest
    // from the hand. Corners rather than the centre, because the centre of a
    // long weapon sits near the middle of the shaft and says nothing about
    // which end the point is on.
    let far = null;
    let farD = -1;
    let near = null;
    let nearD = Infinity;
    object.traverse((o) => {
      const mesh = o;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      for (const cx of [bb.min.x, bb.max.x]) {
        for (const cy of [bb.min.y, bb.max.y]) {
          for (const cz of [bb.min.z, bb.max.z]) {
            const v = { x: cx, y: cy, z: cz };
            const e = mesh.matrixWorld.elements;
            const wx = e[0] * v.x + e[4] * v.y + e[8] * v.z + e[12];
            const wy = e[1] * v.x + e[5] * v.y + e[9] * v.z + e[13];
            const wz = e[2] * v.x + e[6] * v.y + e[10] * v.z + e[14];
            const d = Math.hypot(wx - hand.x, wy - hand.y, wz - hand.z);
            if (d > farD) { farD = d; far = { x: wx, y: wy, z: wz }; }
            if (d < nearD) { nearD = d; near = { x: wx, y: wy, z: wz }; }
          }
        }
      }
    });
    if (!far) return { held: false };

    // FORWARD IS THE PIVOT'S +Z, AND BOTH HALVES OF THAT WERE WRONG FIRST.
    //
    // This read the ROOT and called -Z forward. The root carries no facing at
    // all — `Actor.faceDirection` sets an angle that is written to
    // `pivot.rotation.y`, and the root's basis stays exactly unrotated. Walking
    // the character due east and re-reading it returned [0,0,1] and [1,0,0]
    // unchanged, which is what proved it: the vector was world -Z on every
    // sample regardless of where the character was looking, so the first run of
    // this file reported 22 of 29 weapons backwards, including
    // `rig:Warrior/Warrior_Sword` — the donor mesh, harvested in its own socket,
    // which cannot be wrong by construction. That contradiction was the tell.
    //
    // And the sign is +Z, not -Z: `facingOffset` is documented as "radians to
    // add so the model faces +Z when facing is 0".
    const pivot = actor.pivot ?? actor.root;
    pivot.updateWorldMatrix(true, false);
    const e = pivot.matrixWorld.elements;
    const fwd = { x: e[8], y: e[9], z: e[10] };
    const flen = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
    fwd.x /= flen; fwd.y /= flen; fwd.z /= flen;
    const right = { x: e[0], y: e[1], z: e[2] };
    const rlen = Math.hypot(right.x, right.y, right.z) || 1;
    right.x /= rlen; right.y /= rlen; right.z /= rlen;

    const v = { x: far.x - hand.x, y: far.y - hand.y, z: far.z - hand.z };
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return {
      held: true,
      length: len,
      forward: (v.x * fwd.x + v.y * fwd.y + v.z * fwd.z) / len,
      side: (v.x * right.x + v.y * right.y + v.z * right.z) / len,
      up: v.y / len,
    };
  }, item);

  if (!measured.held) {
    console.log(`  ${item.key.padEnd(34)} NOT HELD`);
    continue;
  }
  rows.push({ ...item, ...measured });
}
await browser.close();

const verdict = (r) => {
  if (r.forward < -0.25) return "BACKWARDS — points at the player";
  if (r.forward > 0.25) return "forward";
  return "across the body";
};
rows.sort((a, b) => a.forward - b.forward);
console.log("model (lay)                        len   fwd    side    up    verdict");
for (const r of rows) {
  console.log(
    `  ${r.key.padEnd(33)} ${r.length.toFixed(2)}  ${r.forward.toFixed(2).padStart(5)}  ` +
      `${r.side.toFixed(2).padStart(5)}  ${r.up.toFixed(2).padStart(5)}  ${verdict(r)}`,
  );
}
const bad = rows.filter((r) => r.forward < -0.25);
console.log(`\n${bad.length} of ${rows.length} point back at the player.`);
