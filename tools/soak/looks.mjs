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
    const worn = [];
    a?.root.traverse((o) => { if (o.name?.startsWith("look_")) worn.push(o.name.slice(5)); });
    return { worn, scale: +(a?.instance?.object?.scale?.x ?? 0).toFixed(3) };
  });
  await page.waitForTimeout(900);
  // Cropped to the character rather than the whole frame, so eight of these
  // can be looked at side by side without the interface between them.
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 330, y: 180, width: 340, height: 430 } });
  console.log(`${name.padEnd(8)} ${look.worn.join("+") || "(no hair, no beard)"}  build=${look.scale}`);
}
console.log(`\nshots in ${OUT}/`);
await browser.close();
