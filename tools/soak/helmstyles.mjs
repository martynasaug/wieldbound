// EVERY HEAD STYLE, WORN AND PHOTOGRAPHED.
//
// `GEAR_STYLES` declares five head styles — cap, hood, full, horned, circlet —
// and `helmParts` branched on two of them. `horned` and `circlet` fell through
// to the closed great helm, so five of the twelve helms in the catalogue put a
// face-hiding bucket on the character instead of the thing they are named
// after. Nothing threw and no test failed: a helm that is the wrong helm still
// renders, still tints by rarity and still occupies the slot.
//
// This wears one helm of each style in turn and reports the mesh the client
// actually built, so a style that silently falls through to another one says so
// by name.
//
//   node tools/soak/helmstyles.mjs Player3619 tools/soak/shots/helmstyles
import { mkdirSync } from "node:fs";
import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/helmstyles";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, NAME);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.world.setCameraDistance(3.4);
});
await new Promise((r) => setTimeout(r, 2500));

const wear = (baseId) => page.evaluate((id) => {
  const g = window.__wieldbound;
  const it = g.items.find((i) => i.baseId === id);
  if (!it) return "not in the bag";
  if (!it.equipped) g.socket.sendEquipItem(it.id);
  return "equipping";
}, baseId);

/** The head-slot mesh the client actually built, by name and world box. */
const headMesh = (slot) => page.evaluate((slotName) => {
  const g = window.__wieldbound;
  const root = g.localActor.root;
  root.updateMatrixWorld(true);
  let found = null;
  root.traverse((o) => {
        // BY THE SLOT UNDER TEST. Matching helm OR boots and keeping the tallest
    // mesh made a thin circlet lose to a boot cuff, and the run reported
    // "circlet -> gear_boots_tall" as though the style were broken.
    if (!o.isMesh || !o.name?.startsWith("gear_" + slotName + "_")) return;
    const geo = o.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const m = o.matrixWorld.elements;
    let loY = Infinity, hiY = -Infinity, loX = Infinity, hiX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? bb.max.x : bb.min.x;
      const y = i & 2 ? bb.max.y : bb.min.y;
      const z = i & 4 ? bb.max.z : bb.min.z;
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      loY = Math.min(loY, wy); hiY = Math.max(hiY, wy);
      loX = Math.min(loX, wx); hiX = Math.max(hiX, wx);
    }
    // Several parts share the name; keep the tallest, which is the shell.
    if (!found || hiY - loY > found.h) {
      found = { name: o.name, h: +(hiY - loY).toFixed(2), w: +(hiX - loX).toFixed(2), top: +hiY.toFixed(2), bottom: +loY.toFixed(2) };
    }
  });
  return found;
}, slot);

// One helm per style, from the catalogue.
const CASES = [
  ["cap", "bronzehelm", "helm"],
  ["hood", "rangerhood", "helm"],
  ["full", "dreadhelm", "helm"],
  ["horned", "hornedhelm", "helm"],
  ["circlet", "gildedcrown", "helm"],
  ["plated", "platedgreaves", "boots"],
];

console.log("style     item             mesh the client built       height  width   top");
const seen = [];
for (const [style, baseId, slot] of CASES) {
  const r = await wear(baseId);
  if (r === "not in the bag") {
    console.log(`${style.padEnd(9)} ${baseId.padEnd(16)} (not in the bag - skipped)`);
    continue;
  }
  await new Promise((res) => setTimeout(res, 3200));
  const m = await headMesh(slot);
  await page.screenshot({ path: `${OUT}/${style}.png` });
  const expected = `gear_${slot}_${style}`;
  const ok = m?.name === expected;
  seen.push({ style, name: m?.name ?? "(none)", ok });
  console.log(
    `${style.padEnd(9)} ${baseId.padEnd(16)} ${String(m?.name ?? "(no mesh)").padEnd(26)} ` +
    `${String(m?.h ?? "-").padStart(6)} ${String(m?.w ?? "-").padStart(6)} ${String(m?.top ?? "-").padStart(5)}` +
    (ok ? "" : `   <-- expected ${expected}`),
  );
}

const wrong = seen.filter((s) => !s.ok);
console.log(`\n${wrong.length ? wrong.length + " style(s) building the wrong mesh: " + wrong.map((w) => `${w.style} -> ${w.name}`).join(", ") : "every style builds its own mesh"}`);
await browser.close();
