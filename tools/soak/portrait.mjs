// PHOTOGRAPH THE CHARACTER, AIMED AT THE CHARACTER.
//
//   node tools/soak/portrait.mjs [name ...]   e.g. face body robe
//
// WHY THIS IS A FILE RATHER THAN ANOTHER THROWAWAY. Three separate attempts at
// a head-and-shoulders shot today came back as empty courtyard, and each time I
// assumed the character was broken — once concluding the body had sunk, once
// that keeping `Face` had wrecked the bounding box. The character was fine every
// time. The camera was not:
//
//   * `actor.position.y` IS NOT THE FEET. Measured, the body stands from 0.49 to
//     2.38 while `position.y` reads 0, so a camera aimed at `position + 1.5`
//     sits inside the ribcage looking out.
//   * AND THE AIM MUST BE RECOMPUTED EVERY FRAME. Reading the mesh bounds once,
//     before the shot, then holding that aim is stale by the time the shutter
//     falls: the local player is a live networked entity that keeps moving.
//
// So the aim is derived from the live mesh INSIDE the render hook, every frame,
// and the harness reports the bounds it actually used. A frame that misses is
// then a fact about the character rather than a mystery.
import { open, login } from "./driver.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

const WANT = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const OUT = "tools/soak/shots/portrait";
mkdirSync(OUT, { recursive: true });

/** Every view this harness knows how to take. */
const VIEWS = {
  // `lift` is a fraction of the body's height above the aim point, so a view
  // frames the same way whatever the character is wearing.
  face: { yaw: Math.PI, dist: 1.2, aim: 0.94, lift: 0.04 },
  head: { yaw: Math.PI * 0.75, dist: 1.3, aim: 0.9, lift: 0.06 },
  body: { yaw: Math.PI, dist: 3.4, aim: 0.55, lift: 0.06 },
  back: { yaw: 0, dist: 3.4, aim: 0.55, lift: 0.06 },
  side: { yaw: Math.PI * 0.5, dist: 3.4, aim: 0.55, lift: 0.06 },
};

const views = (WANT.length ? WANT : ["face", "body"]).filter((v) => {
  if (VIEWS[v]) return true;
  console.warn(`portrait: no such view "${v}" — have ${Object.keys(VIEWS).join(", ")}`);
  return false;
});

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`error: ${m.text()}`);
});
await login(page, `Port${Date.now() % 100000}`);

await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  const a = g.localActor;
  a.setLook({ skin: "tan", build: "average", hair: "short", beard: "none", hairColor: "brown" });
  a.heading = Math.PI;
  a.root.rotation.y = Math.PI;
  // THE BODY'S OWN BOUNDS, FROM THE LIVE MESHES, recomputed on demand. Only the
  // character's own meshes count: a held weapon or a through-walls silhouette
  // would drag the box somewhere the character is not.
  window.__bodyBox = () => {
    const actor = g.localActor;
    const V = actor.position.constructor;
    actor.root.updateMatrixWorld(true);
    let lo = null;
    let hi = null;
    actor.root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      if (!/PlayerBody|Face|Garment|Monk/.test(o.name)) return;
      const p = o.geometry.attributes.position;
      const v = new V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (!lo) {
          lo = v.clone();
          hi = v.clone();
        } else {
          lo.min(v);
          hi.max(v);
        }
      }
    });
    return lo ? { lo, hi } : null;
  };
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__hold?.();
    render(s, c);
  };
});
await page.waitForTimeout(3500);

for (const name of views) {
  const view = VIEWS[name];
  const used = await page.evaluate((v) => {
    const g = window.__wieldbound;
    const a = g.localActor;
    g.__hold = () => {
      const box = window.__bodyBox();
      if (!box) return;
      const V = a.position.constructor;
      const height = box.hi.y - box.lo.y;
      const target = new V(
        (box.lo.x + box.hi.x) / 2,
        box.lo.y + height * v.aim,
        (box.lo.z + box.hi.z) / 2,
      );
      const f = a.heading + v.yaw;
      g.world.camera.position.set(
        target.x + Math.sin(f) * v.dist,
        target.y + height * v.lift,
        target.z + Math.cos(f) * v.dist,
      );
      g.world.camera.lookAt(target);
    };
    const box = window.__bodyBox();
    return box
      ? {
          feet: +box.lo.y.toFixed(2),
          head: +box.hi.y.toFixed(2),
          at: [+((box.lo.x + box.hi.x) / 2).toFixed(2), +((box.lo.z + box.hi.z) / 2).toFixed(2)],
        }
      : null;
  }, view);
  await page.waitForTimeout(450);
  const file = `${OUT}/${name}.png`;
  writeFileSync(file, await page.screenshot({ clip: { x: 380, y: 60, width: 520, height: 660 } }));
  console.log(
    used
      ? `${name}: feet ${used.feet} head ${used.head} at ${JSON.stringify(used.at)} -> ${file}`
      : `${name}: NO BODY MESH FOUND -> ${file}`,
  );
}

console.log(errors.length ? `page errors:\n  ${errors.slice(0, 6).join("\n  ")}` : "no page errors");
await browser.close();
process.exit(0);
