// DOES A HEAD PIECE KEEP THE HAIR IT SHOULD?
//
//   node tools/soak/hairhelm.mjs
//
// Reported: "why does wearing helmets (crown for example) remove your
// hairstyle?" Hair was hidden by ANY helm layer, so a circlet — a band above the
// brow covering 11% of the skull — deleted a hairstyle the player had chosen.
// `HELM_COVERS_HAIR` decides per style now, and this checks each one.
import { open, login } from "./driver.mjs";
import { HELM_COVERS_HAIR } from "../../shared/protocol-types.ts";

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Hair${Date.now() % 100000}`);
await page.waitForTimeout(2400);
await page.evaluate(() => window.__wieldbound.localActor.setLook(
  { skin: "tan", build: "average", hair: "shaggy", beard: "none", hairColor: "black" }));
await page.waitForTimeout(1400);

const rows = await page.evaluate(async (styles) => {
  const a = window.__wieldbound.localActor;
  const out = [];
  const hairShown = () => {
    let shown = false;
    a.root.traverse((o) => { if (o.name === "hair" || o.userData?.lookSlot === "hair") shown ||= o.visible; });
    // `lookPieces` is the authority; the traverse above is a fallback.
    const piece = a.lookPieces?.get?.("hair");
    return piece ? piece.visible : shown;
  };
  out.push(["(none)", hairShown()]);
  for (const style of styles) {
    a.setAppearance({ layers: { helm: { style, rarity: "honed", palette: "steel" } } });
    await new Promise((r) => setTimeout(r, 1100));
    out.push([style, hairShown()]);
  }
  return out;
}, Object.keys(HELM_COVERS_HAIR));

let bad = 0;
for (const [style, shown] of rows) {
  const want = style === "(none)" ? true : !HELM_COVERS_HAIR[style];
  const ok = shown === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${style.padEnd(9)} hair ${shown ? "shown" : "hidden"}, wanted ${want ? "shown" : "hidden"}`);
}
console.log(bad ? `\n${bad} wrong` : "\nevery head piece keeps or covers the hair as declared");
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
process.exitCode = bad ? 1 : 0;
