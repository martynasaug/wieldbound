// WHAT THE FITTING ACTUALLY PRODUCED, in numbers, for one item at a time.
//
// `grips.mjs` says whether an item ends up in the hand; when it does not, this
// says why. For each id it prints the fitted geometry's own bounds, the grip
// point the fitting seated it on, the scale the catalogue then applied, and
// where the holder ended up — which is enough to tell a model authored wrong
// from a model placed wrong.
//
//   node tools/soak/gripprobe.mjs <id> [id ...]
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

const IDS = process.argv.slice(2);
if (!IDS.length) {
  console.error("usage: node tools/soak/gripprobe.mjs <id> [id ...]");
  process.exit(1);
}

const { browser, page } = await open({ headless: true, width: 900, height: 600 });
await login(page, `Probe${Date.now() % 100000}`);
await page.waitForTimeout(1200);

for (const id of IDS) {
  const out = await page.evaluate(async ({ id, base }) => {
    const a = window.__wieldbound.localActor;
    const offhand = base?.slot === "offhand";
    a.setAppearance(
      offhand
        ? { weaponType: "sword", weaponRarity: "honed", weaponBaseId: "armingsword", offhandBaseId: id, offhandRarity: "honed", layers: {} }
        : { weaponType: base?.weaponType, weaponRarity: "honed", weaponBaseId: id, layers: {} },
    );
    await new Promise((r) => setTimeout(r, 900));
    let mesh = null;
    a.root.traverse((o) => { if (o.name === `held_${id}` && o.isMesh) mesh = o; });
    if (!mesh) return { id, missing: true };
    a.root.updateMatrixWorld(true);
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox;
    const V = mesh.position.constructor;
    const grip = new V(...(mesh.userData.gripPoint ?? [0, 0, 0]));
    const holder = mesh.parent;
    let bone = holder;
    while (bone && !bone.isBone) bone = bone.parent;
    const world = new V();
    mesh.localToWorld(world.copy(grip));
    const boneAt = new V();
    bone?.getWorldPosition(boneAt);
    const round = (v) => [v.x, v.y, v.z].map((n) => +n.toFixed(3));
    return {
      id,
      art: base?.art,
      box: { min: round(b.min), max: round(b.max) },
      gripPoint: round(grip),
      gripInBox: [
        +((grip.x - b.min.x) / Math.max(b.max.x - b.min.x, 1e-6)).toFixed(2),
        +((grip.y - b.min.y) / Math.max(b.max.y - b.min.y, 1e-6)).toFixed(2),
        +((grip.z - b.min.z) / Math.max(b.max.z - b.min.z, 1e-6)).toFixed(2),
      ],
      meshScale: +mesh.scale.x.toFixed(3),
      holderPos: holder?.isBone ? null : round(holder.position),
      gripWorld: round(world),
      boneWorld: round(boneAt),
      bone: bone?.name ?? null,
    };
  }, { id, base: ITEM_BASES[id] });
  console.log(JSON.stringify(out, null, 1));
}
await browser.close();
