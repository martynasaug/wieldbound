// EVERY FACE THE CREATOR CAN MAKE, IN ONE PASS.
//
//   node tools/soak/faces.mjs
//
// `portrait.mjs` photographs ONE look per run, which is right for judging a
// single piece and wrong for judging a set: twelve separate runs means twelve
// logins, twelve spawn points and twelve times of day, and any difference
// between two shots might be the art or might be the weather. Here one character
// stands in one place under one light and only the look changes, so the pictures
// can actually be compared with each other.
//
// ONE SKIN AND ONE HAIR COLOUR ON PURPOSE. The variable under test is the
// GEOMETRY — where a piece sits, whether it caps the crown, whether a beard
// touches the jaw. Varying the colour at the same time would make every shot
// differ for a reason that has nothing to do with fit.
//
// The hour is the measured one from `sunsweep.mjs`, not a derived one: see the
// note in `portrait.mjs` for why every front portrait before it was taken in
// the dark.
import { open, login } from "./driver.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = "tools/soak/shots/faces";
mkdirSync(OUT, { recursive: true });

const HAIRS = ["none", "swept", "shaggy"];
const BEARDS = ["none", "moustache", "monk", "full"];
const SKIN = "tan";
const HAIR_COLOR = "espresso";
const HOUR = 0.0;

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await login(page, `Face${Date.now() % 100000}`);
await page.waitForTimeout(2500);

await page.evaluate((hour) => {
  const g = window.__wieldbound;
  const a = g.localActor;
  g.world.dayNight.freeze(hour);
  a.heading = Math.PI;
  a.root.rotation.y = Math.PI;

  // The live mesh bounds, recomputed inside the render hook. `portrait.mjs`
  // records why this cannot be read once and held: the local player is a
  // networked entity that keeps moving, and a stale aim points at empty
  // courtyard. `look_hair` and `look_beard` are named because a style standing
  // above the crown would otherwise fall outside the box the camera aims by.
  window.__bodyBox = () => {
    const actor = g.localActor;
    const V = actor.position.constructor;
    actor.root.updateMatrixWorld(true);
    let lo = null, hi = null;
    actor.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      if (!/PlayerBody|Face|Garment|look_/.test(o.name)) return;
      const p = o.geometry.attributes.position;
      const v = new V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (!lo) { lo = v.clone(); hi = v.clone(); } else { lo.min(v); hi.max(v); }
      }
    });
    return lo ? { lo, hi } : null;
  };

  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => { g.__hold?.(); render(s, c); };
  g.__hold = () => {
    const box = window.__bodyBox();
    if (!box) return;
    const V = a.position.constructor;
    const height = box.hi.y - box.lo.y;
    const target = new V(
      (box.lo.x + box.hi.x) / 2,
      box.lo.y + height * 0.84,
      (box.lo.z + box.hi.z) / 2,
    );
    const f = a.heading + Math.PI;
    g.world.camera.position.set(
      target.x + Math.sin(f) * 2.25,
      target.y + height * 0.02,
      target.z + Math.cos(f) * 2.25,
    );
    g.world.camera.lookAt(target);
  };
}, HOUR);

await page.waitForTimeout(2500);

const made = [];
for (const hair of HAIRS) {
  for (const beard of BEARDS) {
    await page.evaluate(({ hair, beard, skin, hairColor }) => {
      window.__wieldbound.localActor.setLook({
        skin, build: "average", hair, beard, hairColor,
      });
    }, { hair, beard, skin: SKIN, hairColor: HAIR_COLOR });
    // A piece is fetched, seated against the skull and only then attached, so a
    // shot taken too early catches the previous style or none at all.
    await page.waitForTimeout(1100);
    const name = `${hair}-${beard}`;
    const file = `${OUT}/${name}.png`;
    writeFileSync(file, await page.screenshot({ clip: { x: 520, y: 210, width: 260, height: 400 } }));
    made.push(name);
    console.log(`${name.padEnd(18)} -> ${file}`);
  }
}

console.log(`\n${made.length} faces in ${OUT}/`);
if (errors.length) console.log("ERRORS:", errors.slice(0, 5));
await browser.close();
