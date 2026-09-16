// WHICH WAY DOES THE CAPE SWING?
//
//   node tools/soak/capelean.mjs [style ...]
//
// Reported: "the walking animation is backwards (goes into character when
// walking)." `swingCapes` rotates each link about the body's x, and whether a
// positive angle carries the hem behind the character or through their legs is
// a question about the frame `hangCape` builds, which I would rather measure
// once than derive and hope.
//
// So this parks the character, reads the hem's position along their own FORWARD
// vector, then drives the swing to a full run and reads it again. Behind is
// negative forward: a cape that trails gets MORE negative, a cape that sweeps
// into the body gets less.
import { open, login } from "./driver.mjs";

const STYLES = process.argv.slice(2).length ? process.argv.slice(2) : ["cape", "cloak", "mantle", "tabard"];

const { browser, page } = await open({ headless: true, width: 1024, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Lean${Date.now() % 100000}`);
await page.waitForTimeout(1200);

console.log("");
let wrong = 0;
for (const style of STYLES) {
  await page.evaluate(({ style }) => {
    window.__wieldbound.localActor.setAppearance({
      layers: { cape: { style, rarity: "honed", palette: "crimson" } },
    });
  }, { style });
  await page.waitForTimeout(1400);

  const read = await page.evaluate(() => {
    const g = window.__wieldbound;
    const a = g.localActor;
    const links = a.capeLinks ?? [];
    if (!links.length) return { error: "no cape links" };

    // NO THREE HERE. The debug handle does not export it, and none is needed:
    // a world matrix's last column IS the world position, and the swing only
    // has to be compared with itself.
    const at = (o) => ({ x: o.matrixWorld.elements[12], y: o.matrixWorld.elements[13], z: o.matrixWorld.elements[14] });
    const h = a.heading ?? 0;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const root = a.root;

    const hinges = (lean) => {
      for (const [i, joint] of links.entries()) joint.rotation.x = lean * (0.6 + i * 0.5);
      root.updateWorldMatrix(true, true);
      const here = at(root);
      // Every hinge below the first, which is where the fall actually moves.
      return links.slice(1).map((j) => {
        const w = at(j);
        return (w.x - here.x) * fx + (w.z - here.z) * fz;
      });
    };
    const still = hinges(0);
    const running = hinges(0.44);
    hinges(0);
    return { still, running };
  });

  if (read.error) {
    console.log(`${style.padEnd(9)} ${read.error}`);
    continue;
  }
  const moved = read.running.map((v, i) => v - read.still[i]);
  const last = moved[moved.length - 1];
  const ok = last < -0.002;
  if (!ok) wrong++;
  // THE RESTING POSITION IS THE INSTRUMENT'S OWN CHECK. A cape hangs off the
  // BACK, so every hinge must already read negative-forward before anything
  // swings. If these come out positive the sign convention here is wrong and
  // the verdict below means nothing — which is the failure mode that has cost
  // this phase more time than any modelling mistake.
  const backwards = read.still.every((v) => v < 0);
  console.log(
    `${style.padEnd(9)} at rest ${read.still.map((v) => v.toFixed(3)).join(", ")}` +
    `${backwards ? "" : "  <- NOT BEHIND THE BODY, do not trust the verdict"}`,
  );
  console.log(
    `${"".padEnd(9)} swinging, hinges move ${moved.map((v) => v.toFixed(3)).join(", ")}   ` +
    `${ok ? `TRAILS by ${(-last).toFixed(3)}` : `WRONG WAY by ${last.toFixed(3)}`}`,
  );
}
console.log("");
console.log(wrong ? `${wrong} of ${STYLES.length} swing into the character` : "every cape trails behind the character");
if (errors.length) console.log("page errors:", errors.slice(0, 3));
await browser.close();
