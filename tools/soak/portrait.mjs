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

// THE LOOK IS AN ARGUMENT NOW, because this harness could not photograph a
// hairstyle: it pinned `hair: "none", beard: "none"` and every shot came back
// shaved and clean-shaven whatever had just been cut. A piece that loads is not
// a piece that reads, and the only way to judge one is to wear it.
//
//   node tools/soak/portrait.mjs head --hair=swept --beard=full
//
// The filename carries the styles, so a run photographing four hairstyles does
// not overwrite itself three times and leave one picture to draw conclusions
// from. `WANT` already drops `--` tokens, so these never look like view names.
const flag = (key, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3) : fallback;
};
const HAIR = flag("hair", "none");
const BEARD = flag("beard", "none");
const SKIN = flag("skin", "tan");
// A HAIR COLOUR THE GAME WOULD ACTUALLY CHOOSE. This pinned "brown", and against
// the default `tan` skin that is a delta of 0.071 in value — so every hairstyle
// photographed as a lumpy brown extension of the scalp, and I nearly read that
// as the art being wrong. `shared/look.ts` has `readableHair`, which walks the
// palette until it is at least 0.16 from the skin; six of the fourteen colours
// fail that against tan, "brown" among them, and the game skips all six. The
// harness has to pick from the same side of that line as the game does.
const HAIR_COLOR = flag("hairColor", "espresso");
// THE HOUR, because the default froze the one time of day at which a front-on
// portrait CANNOT be lit. `daynight.ts` puts the sun at
// `(cos((t - 0.25) * 2pi) * 0.88, max(0.16, sin(...)), 0.34)`, so at t = 0.5 the
// azimuth term is cos(pi/2) = 0 and the direction is about (0, 0.947, 0.322):
// noon, straight down, leaning to +z. The `face` and `body` cameras sit at
// `heading + pi` looking back along -z, which puts that sun behind the head —
// and every front shot came back a silhouette with a correctly lit courtyard
// behind it. I twice started blaming the art.
//
// AND THAT DERIVATION WAS STILL WRONG, WHICH IS WHY THE DEFAULT IS MEASURED NOW.
// The reasoning below is sound and every front portrait taken under it still came
// back with the face in shadow — dark enough that I read a correctly-fitted beard
// as missing, and a lifted fringe as "barely visible". `tools/soak/sunsweep.mjs`
// scores the same shot at twelve hours off the framebuffer, and the answer is
// blunt: t = 0.32 is the DARKEST setting of the day for a face, at luminance 15.9,
// and t = 0.00 is the brightest at 51.3. The derived default was the worst
// available choice.
//
// WHAT ACTUALLY LIGHTS THE FACE IS THE BRAZIER, not the sun. t = 0.00 is night,
// and the spawn point stands beside a lit brazier whose warm light falls on the
// front of the head; the sun leans +z at every hour, so a front-on camera is
// backlit all day. That is worth saying plainly rather than dressing up as a
// solved sun angle: the portrait default is a NIGHT shot by firelight, which is
// the best front lighting this location offers. Judge daylight art with `side`,
// which the rake below does light properly.
//
// t = 0.30 and t = 0.70 give azimuth about +/-0.59: the side rake that made the
// `side` view read cleanly with this same character, tone and hair colour.
const HOUR = Number(flag("hour", "0.00"));
// THE OUTLINE, OFF, so art can be judged without it.
//
//   node tools/soak/portrait.mjs face --hair=shaggy --rim=0
//
// `Actor` draws a back-face shell 0.0136 world units outside every mesh in a
// warm cream, and at the crown that reads as a pale band above the hair — close
// enough to bare scalp that it was reported as one, and close enough that I
// started thickening the scalp cap to cover something that may not be scalp at
// all. Being able to switch it off turns "what is that band" from a guess into
// one render.
const RIM = flag("rim", null);
// PAINT EVERY HEAD MESH A DIFFERENT COLOUR, so nothing on screen is
// unaccounted for.
//
//   node tools/soak/portrait.mjs face --hair=swept --paint=1
//
// Judging "what is that shape near the eyebrow" by eye means guessing whether
// it is hair, the scalp cap, the skull or a brow. Colouring them settles it in
// one frame; it found the scalp-cap axis bug after three rounds of arithmetic
// had not. scalp red, hair green, body blue, face magenta.
const PAINT = flag("paint", null);
// Only name the file after a style that is actually worn, so the default shots
// keep the plain names the rest of this session's notes refer to.
const SUFFIX = HAIR === "none" && BEARD === "none" ? "" : `_${HAIR}-${BEARD}`;

/** Every view this harness knows how to take. */
const VIEWS = {
  // `lift` is a fraction of the body's height above the aim point, so a view
  // frames the same way whatever the character is wearing.
  // `dist` was 1.2 with `aim` 0.94, which put the camera inside the skull: the
  // frame filled with scalp and cut off at the jaw, and a hairstyle that raises
  // the body box — the swept crest takes `head` from 1.80 to 1.85 — pushed the
  // aim point higher still and made it worse. `aim` is a FRACTION of body
  // height, so the framing moves with whatever the character is wearing; the
  // distance has to leave room for that.
  face: { yaw: Math.PI, dist: 2.0, aim: 0.88, lift: 0.03 },
  head: { yaw: Math.PI * 0.75, dist: 1.3, aim: 0.9, lift: 0.06 },
  body: { yaw: Math.PI, dist: 3.4, aim: 0.55, lift: 0.06 },
  back: { yaw: 0, dist: 3.4, aim: 0.55, lift: 0.06 },
  side: { yaw: Math.PI * 0.5, dist: 3.4, aim: 0.55, lift: 0.06 },
  // STRAIGHT DOWN ON THE CROWN, which none of the views above can see and which
  // is the one angle a hairstyle made of separate clumps fails at: from the
  // front a fringe reads as hair whatever is behind it, and the gaps between
  // locks only show from over the top. Reported as "bald spots", and every view
  // this harness had was blind to them.
  //
  // `lift` is a fraction of body height ABOVE the aim point, so a large one puts
  // the camera over the head; the distance is small because it is looking down
  // the short way.
  top: { yaw: Math.PI, dist: 0.55, aim: 0.99, lift: 1.15 },
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

await page.evaluate((look) => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(look.hour);
  const a = g.localActor;
  // IDS THAT STILL EXIST. This asked for `hair: "short"`, retired with the rest
  // of the procedural styles when the tables shrank to what has art that lands
  // on this body. `sanitizeLook` drops a look with an unknown field WHOLE, so
  // the harness would have photographed a character whose look never applied —
  // and the picture would have been read as art rather than as a failed call.
  //
  // PASSED IN rather than pinned, and passed as a SECOND ARGUMENT rather than
  // closed over: `page.evaluate` runs this in the browser, where the harness's
  // own constants do not exist. Declaring `HAIR` above and still writing "none"
  // here would photograph a shaved head for every style — a rule edited that
  // nothing consults, which is the third time this session.
  a.setLook({ skin: look.skin, build: "average", hair: look.hair, beard: look.beard, hairColor: look.hairColor });
  if (look.rim !== null && look.rim !== undefined) {
    // Private in TypeScript only; an ordinary property at runtime.
    a.options.rim = Number(look.rim);
    a.refreshOutlines();
  }
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
      // `look_hair` and `look_beard` are in this list because `Actor` names its
      // worn head pieces that, and a hairstyle standing above the crown was
      // otherwise outside the box this harness aims by — so the camera framed a
      // head that stopped at the skull and clipped the hair off the top of the
      // shot. The whole point of this file is to aim from the live meshes; the
      // filter has to name the meshes actually being photographed.
      if (!/PlayerBody|Face|Garment|Monk|look_/.test(o.name)) return;
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
// HANDED OVER, not closed over. `page.evaluate` runs the callback in the
// BROWSER, where `HAIR`, `BEARD` and `SKIN` do not exist — adding the parameter
// without also passing the value leaves it `undefined` and every portrait comes
// back shaved. The same omission fetched `/textures/undefined` in `skinmask.mjs`
// an hour ago and read as a corrupt atlas.
}, { hair: HAIR, beard: BEARD, skin: SKIN, hairColor: HAIR_COLOR, hour: HOUR, rim: RIM, paint: PAINT });
await page.waitForTimeout(3500);

// AFTER the wait, not in the same breath as `setLook`. A look piece is fetched,
// seated against the skull and only THEN attached, so painting immediately
// colours whatever happened to exist already: the hair came back its own brown
// and I read that as "the shape by the eyebrow is not hair".
if (PAINT) {
  await page.evaluate(() => {
    window.__wieldbound.localActor.root.traverse((o) => {
      if (!o.isMesh || !o.material?.color) return;
      if (o.name === "look_scalp") o.material.color.setHex(0xff0000);
      else if (o.name === "look_hair") o.material.color.setHex(0x00ff00);
      else if (o.name === "look_beard") o.material.color.setHex(0xffff00);
      else if (o.name === "PlayerBody") o.material.color.setHex(0x0044ff);
      else if (/^Face_/.test(o.name)) o.material.color.setHex(0xff00ff);
    });
  });
}

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
  const file = `${OUT}/${name}${SUFFIX}.png`;
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
