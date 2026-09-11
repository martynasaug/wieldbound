// DO FOUR CHARACTERS LOOK LIKE FOUR PEOPLE?
//
// The body is tinted from its owner's name already, and the note on
// `Actor.tintBody` records that taking two goes to get right: the first attempt
// produced four characters within ten values of each other on every channel.
// That fix made them four SHADES. Hair and a beard are what make them four
// SILHOUETTES, which is what the eye actually sorts people by at the distance
// this camera sits.
//
// So this photographs several names side by side. The check is not that the
// code ran — it is whether a person looking at the picture can tell them apart,
// which is why it produces a picture and reports what each one drew.
//
//   node tools/soak/looks.mjs [count]
import { mkdirSync } from "node:fs";
import { open, login } from "./driver.mjs";

const OUT = "tools/soak/shots/looks";
mkdirSync(OUT, { recursive: true });
const COUNT = Number(process.argv[2] ?? 6);

// Fixed names rather than random ones: a look is derived from the name, so the
// same names make the same people and a change to the derivation can be SEEN as
// a change rather than guessed at behind fresh randomness.
const NAMES = ["Alder", "Bryn", "Cass", "Dunmar", "Eira", "Fenn", "Gretel", "Hobb"];

// WIDE ENOUGH THAT THE INTERFACE IS NOT THE PICTURE. At 520x640 the minimap
// and the unit frame covered the character entirely and the first run
// photographed six heads behind a map.
const { browser, page } = await open({ headless: true, width: 1000, height: 820 });
for (const name of NAMES.slice(0, COUNT)) {
  await login(page, name);
  await page.waitForTimeout(2200);
  // Close in and look at the character rather than the field: this is about a
  // head, and the game's own camera is too far out to judge one.
  const look = await page.evaluate(() => {
    const g = window.__wieldbound;
    g.world.setCameraDistance(3.0);
    g.world.dayNight.freeze(0.5);
    const a = g.localActor;
    // WHAT THE CHARACTER ACTUALLY IS, in the terms the look is described in.
    // The first version reported `instance.scale.x`, which is the model's fit
    // scale multiplied by the build — 0.006 for every character, a number that
    // says nothing about any of them.
    const look = window.__wieldboundLook?.(g.name ?? "");

    // THE TEXTURE THE BODY IS ACTUALLY WEARING, averaged — not the tone that
    // was requested. Reporting the request is how the previous version of this
    // harness printed eight different skins for eight identical characters:
    // the tint was applied to a material channel that could not lighten, so
    // the numbers varied and the pixels did not. This reads the map back.
    let painted = "?";
    a?.root.traverse((o) => {
      // THE BODY'S MATERIAL BY NAME, not the first mesh that happens to carry
      // a texture. Gear is added to the same root and is never recoloured, so a
      // helmet would be measured instead of a face and the harness would report
      // that skin tone does nothing — a broken instrument describing working
      // code, which is the failure mode this project keeps meeting.
      if (painted !== "?" || !o.isMesh) return;
      if (!String(o.material?.name ?? "").includes("Monk")) return;
      if (!o.material?.map?.image) return;
      const img = o.material.map.image;
      const c = document.createElement("canvas");
      c.width = 32; c.height = 32;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      const h = (v) => Math.round(v / n).toString(16).padStart(2, "0");
      painted = n ? "#" + h(r) + h(gg) + h(b) : "?";
    });

    return {
      skin: look?.skin?.id ?? "?", painted,
      build: look ? +look.build.toFixed(2) : null,
    };
  });
  await page.waitForTimeout(900);
  // Cropped to the character rather than the whole frame, so eight of these
  // can be looked at side by side without the interface between them.
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 330, y: 180, width: 340, height: 430 } });
  console.log(
    `${name.padEnd(8)} skin ${String(look.skin).padEnd(10)} painted ${look.painted}  build ${look.build}`,
  );
}
console.log(`\nshots in ${OUT}/`);
await browser.close();
