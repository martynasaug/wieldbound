// WHERE DID THE GLOVE ACTUALLY GO?
//
// A fist weapon is a piece per hand bone, attached through the same rest-frame
// holders armour uses. When a piece lands somewhere other than the hand, the
// photo says "floating near the shoulder" and nothing more. This says which
// bone each piece found, where it ended up, and how far that is from the hand
// it belongs to — the hand being the middle of the body's own fist vertices.
//
//   node tools/soak/handprobe.mjs <fist-item-id> [id ...]
import { open, login } from "./driver.mjs";

const IDS = process.argv.slice(2);
if (!IDS.length) {
  console.error("usage: node tools/soak/handprobe.mjs <fist-item-id> [id ...]");
  process.exit(1);
}

const { browser, page } = await open({ headless: true, width: 900, height: 600 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// Warnings too: a piece that finds no bone says so rather than vanishing.
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") errors.push(`${m.type()}: ${m.text()}`);
});
await login(page, `Hand${Date.now() % 100000}`);
await page.waitForTimeout(1500);

for (const id of IDS) {
  const out = await page.evaluate(async (id) => {
    const a = window.__wieldbound.localActor;
    a.setAppearance({ weaponType: "fist", weaponRarity: "honed", weaponBaseId: id, layers: {} });
    await new Promise((r) => setTimeout(r, 1200));
    a.root.updateMatrixWorld(true);
    const V = a.position.constructor;

    // Every bone by name, and the fists' own vertices, for something to compare against.
    const bones = new Map();
    let body = null;
    a.root.traverse((o) => {
      if (o.isBone) bones.set(o.name, o);
      if (!body && o.isSkinnedMesh) body = o;
    });
    const handCentre = (side) => {
      if (!body) return null;
      const names = body.skeleton.bones.map((b) => b.name);
      const want = new Set([`Fist${side}`, `Fist1${side}`, `Fist2${side}`, `Thumb1${side}`, `Thumb2${side}`]);
      const pos = body.geometry.attributes.position;
      const index = body.geometry.attributes.skinIndex;
      const weight = body.geometry.attributes.skinWeight;
      const bone = names.indexOf(`Fist${side}`);
      if (bone < 0) return null;
      const toBone = body.skeleton.boneInverses[bone].clone().multiply(body.bindMatrix);
      const sum = new V();
      const v = new V();
      let n = 0;
      for (let i = 0; i < pos.count; i++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
        if (!want.has(names[index.getComponent(i, best)])) continue;
        sum.add(v.fromBufferAttribute(pos, i).applyMatrix4(toBone));
        n++;
      }
      if (!n) return null;
      return bones.get(`Fist${side}`).localToWorld(sum.divideScalar(n));
    };
    const hand = { R: handCentre("R"), L: handCentre("L") };

    const pieces = [];
    a.root.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith(`hand_${id}_`)) return;
      const box = new (o.geometry.boundingBox?.constructor ?? Object)();
      o.geometry.computeBoundingBox();
      const local = o.geometry.boundingBox;
      const centre = new V().addVectors(local.min, local.max).multiplyScalar(0.5);
      const world = o.localToWorld(centre.clone());
      let parent = o.parent;
      let bone = parent;
      while (bone && !bone.isBone) bone = bone.parent;
      const side = o.name.endsWith("L") ? "L" : "R";
      const target = hand[side];
      pieces.push({
        piece: o.name.replace(`hand_${id}_`, ""),
        parent: parent?.name ?? null,
        bone: bone?.name ?? null,
        localBox: [local.min, local.max].map((p) => [p.x, p.y, p.z].map((n) => +n.toFixed(1))),
        world: [world.x, world.y, world.z].map((n) => +n.toFixed(3)),
        fromHand: target ? +world.distanceTo(target).toFixed(3) : null,
        visible: o.visible,
        scale: +o.getWorldScale(new V()).x.toFixed(4),
      });
      void box;
    });
    // THE BODY'S OWN UNITS, to compare against the units the gloves are
    // authored in. A piece authored on the body's coordinates should need no
    // scaling at all; anything else is a conversion nobody wrote down.
    let bodySpace = null;
    if (body) {
      body.geometry.computeBoundingBox();
      const bb = body.geometry.boundingBox;
      const names = body.skeleton.bones.map((b) => b.name);
      const fist = names.indexOf("FistR");
      const inMesh = fist >= 0
        ? body.skeleton.boneInverses[fist].clone().multiply(body.bindMatrix).invert()
        : null;
      const centre = inMesh ? new V().applyMatrix4(inMesh) : null;
      bodySpace = {
        mesh: body.name,
        box: [bb.min, bb.max].map((p) => [p.x, p.y, p.z].map((n) => +n.toFixed(1))),
        fistBoneInMeshSpace: centre ? [centre.x, centre.y, centre.z].map((n) => +n.toFixed(1)) : null,
        bindScale: +new V().setFromMatrixScale(body.bindMatrix).x.toFixed(4),
        worldScale: +body.getWorldScale(new V()).x.toFixed(4),
      };
    }
    return {
      id,
      bodySpace,
      pieces,
      handR: hand.R ? [hand.R.x, hand.R.y, hand.R.z].map((n) => +n.toFixed(3)) : null,
      bonesSeen: ["FistR", "Fist1R", "Fist2R", "LowerArmR"].filter((n) => bones.has(n)),
    };
  }, id);
  console.log(JSON.stringify(out));
}
console.log(errors.length ? `page errors:\n  ${errors.slice(0, 3).join("\n  ")}` : "no page errors");
await browser.close();
