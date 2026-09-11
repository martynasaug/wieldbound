// DOES THE CREST READ AS HAIR?
//
// Handed over as "renders as a flat slab". It was two boxes stacked on the
// crown — an 11-wide, 26-tall, 70-long block — which is a slab from every angle
// except dead overhead. This photographs one character who draws the crest from
// the front, the side and above, so the change can be judged in pictures rather
// than in box dimensions.
//
// The camera's orbit is set directly rather than walked, because the question is
// about a head and the game's own framing is too far out to answer it.
//
//   node tools/soak/crest.mjs [name] [out]
import { mkdirSync } from "node:fs";
import { open, login } from "./driver.mjs";

// A name whose hash lands on "crest" (index 6 of HAIR_STYLES), checked below
// rather than trusted: if the derivation changes, this says so instead of
// photographing somebody's topknot and calling it a crest.
const NAME = process.argv[2] ?? "Crest4";
const OUT = process.argv[3] ?? "tools/soak/shots/crest";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1000, height: 820 });
await login(page, NAME);
await page.waitForTimeout(2200);

const look = await page.evaluate((name) => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  return window.__wieldboundLook?.(name)?.hair ?? null;
}, NAME);
console.log(`${NAME} wears: ${look}`);
if (look !== "crest") {
  console.log("not a crest — pick another name");
  await browser.close();
  process.exit(1);
}

// Unequip the helm if one is worn, or it hides the crown entirely.
const helm = await page.evaluate(() => {
  let hidden = 0;
  window.__wieldbound.localActor?.root.traverse((o) => {
    if (o.name?.startsWith("gear_helm") && o.visible) { o.visible = false; hidden++; }
  });
  return hidden;
});
if (helm) console.log(`hid ${helm} helm part(s) for the photograph`);

const views = [
  ["front", 0, 0.25],
  ["side", Math.PI / 2, 0.25],
  ["back", Math.PI, 0.35],
  ["above", 0, 1.2],
];
for (const [label, yaw, pitch] of views) {
  await page.evaluate(({ yaw, pitch }) => {
    const g = window.__wieldbound;
    const a = g.localActor;
    const cam = g.world.camera;
    const head = a.position.clone();
    head.y += 1.55;
    const facing = a.root.rotation.y + yaw;
    const dist = 1.6;
    g.__crestHold = () => {
      cam.position.set(
        head.x + Math.sin(facing) * Math.cos(pitch) * dist,
        head.y + Math.sin(pitch) * dist,
        head.z + Math.cos(facing) * Math.cos(pitch) * dist,
      );
      cam.lookAt(head);
    };
    // Re-applied every frame: the follow camera writes its own position each
    // tick, and a pose set once is overwritten before it is ever drawn.
    if (!g.__crestHooked) {
      g.__crestHooked = true;
      const render = g.world.renderer.render.bind(g.world.renderer);
      g.world.renderer.render = (s, c) => { g.__crestHold?.(); render(s, c); };
    }
  }, { yaw, pitch });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${label}.png`, clip: { x: 250, y: 110, width: 500, height: 560 } });
  console.log(`  ${label}`);
}
console.log(`shots in ${OUT}/`);
await browser.close();
