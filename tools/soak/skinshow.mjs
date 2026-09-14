// WHOSE SURFACE IS THE BARE SKIN AT THE THROAT?
//
//   node tools/soak/skinshow.mjs
//
// Reported: "there are still spots of characters skin showing." The wedge runs
// from the jaw down over the throat and onto the upper chest, and it is there
// under EVERY chest style, which means it is one of two very different faults:
//
//   a HOLE   the garment's own collar was cut away, so the body beneath shows
//            through it. Fixed in `garments.py`, at the cut.
//   the BODY the player's base body is simply skin-textured that far down and
//            no garment was ever going to reach it. Fixed in `base_body.py`,
//            or by giving the collars more height.
//
// The first guess was the hole, and it was WRONG — the `Neck` cut removes one
// to three vertices per donor, not a wedge. So this stops guessing and asks the
// picture: the same close camera on a body wearing NOTHING, and on the same
// body wearing each chest style. If the bare body already shows that wedge, it
// belongs to the body.
//
// It also counts, per frame, how much of the figure is being drawn by the base
// body versus by garment meshes, so "the collar does not reach" has a number
// beside it instead of only a photograph.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";

const OUT = "tools/soak/shots/skinshow";
const STYLES = [null, "leather", "chain", "plate", "robe"];

mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Skin${Date.now() % 100000}`);
await page.waitForTimeout(2400);

// Held on the upper body at the catalogue's own distance, and HELD — the game
// drives its camera every frame, so a one-off set is gone by the next one.
//
// THE HOLD HAS TO BE WRAPPED ROUND `render`, which is how `catalogue.mjs` does
// it. Assigning a hook under a name of my own invention and expecting the game
// to call it produced a wide overhead shot of the whole courtyard and a minute
// spent wondering why the close-up was not close. The instrument has to
// reproduce the state it claims to measure.
//
// The look is pinned for the same reason the catalogue pins it: skin tone is
// hashed from the login name over eight tones, and a question about SKIN
// SHOWING cannot be asked on a body whose skin is a different colour each run.
const PINNED_LOOK = { skin: "tan", build: "average", hair: "shaggy", beard: "none", hairColor: "black" };
await page.evaluate((look) => {
  const g = window.__wieldbound;
  const a = g.localActor;
  g.localActor.setLook(look);
  g.world.dayNight.freeze(0.5);
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__skinHold?.();
    render(s, c);
  };
  if (a.mixer) {
    a.mixer.stopAllAction();
    const action = a.actions?.get("idle");
    if (action) { action.reset().setEffectiveWeight(1).play(); action.time = 0.25; }
    a.mixer.update(0.0001);
    a.mixer.timeScale = 0;
  }
  g.__skinHold = () => {
    const target = a.position.clone();
    target.y += 1.28;             // the throat, not the belt
    const f = a.heading;
    g.world.camera.position.set(target.x + Math.sin(f) * 1.5, target.y + 0.12, target.z + Math.cos(f) * 1.5);
    g.world.camera.lookAt(target);
  };
}, PINNED_LOOK);

// And prove the look took, for the reason the catalogue proves it: `setLook`
// returns early if the actor has no instance loaded yet, so asking is not
// wearing. A skin question answered on the wrong skin is worth nothing.
{
  const got = await page.evaluate(() => window.__wieldbound.localActor.currentLook);
  if (!got || got.skin !== PINNED_LOOK.skin) {
    console.error(`skinshow: the look did not pin — got ${JSON.stringify(got)}`);
    await browser.close();
    process.exit(1);
  }
}

for (const style of STYLES) {
  const label = style ?? "bare";
  await page.evaluate((style) => {
    const a = window.__wieldbound.localActor;
    a.setAppearance({ layers: { armor: style ? { style, rarity: "honed", palette: "steel" } : null } });
  }, style);
  await page.waitForTimeout(1400);

  const counts = await page.evaluate(() => {
    const a = window.__wieldbound.localActor;
    // RE-FROZEN PER STYLE. Equipping rebuilds the instance, which brings a
    // running mixer back with it; without this the later frames are caught
    // mid-idle and the throat moves between shots that are meant to differ
    // only by what is worn.
    if (a.mixer) {
      a.mixer.stopAllAction();
      const action = a.actions?.get("idle");
      if (action) { action.reset().setEffectiveWeight(1).play(); action.time = 0.25; }
      a.mixer.update(0.0001);
      a.mixer.timeScale = 0;
    }
    a.root.updateMatrixWorld(true);
    let bodyTris = 0, gearTris = 0;
    const names = [];
    a.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
      const tris = (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      if (/^(gear_|worn_)/.test(o.name)) { gearTris += tris; names.push(o.name); }
      else bodyTris += tris;
    });
    return { bodyTris, gearTris, names };
  });

  const shot = await page.screenshot({ clip: { x: 440, y: 120, width: 400, height: 460 } });
  writeFileSync(`${OUT}/${label}.png`, shot);
  console.log(`${label.padEnd(10)} body ${String(counts.bodyTris).padStart(5)} tris   gear ${String(counts.gearTris).padStart(5)} tris`);
  console.log(`           ${counts.names.join(", ") || "(nothing worn)"}`);
}

if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
console.log(`\nshots in ${OUT}/`);
await browser.close();
