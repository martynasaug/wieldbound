// OUR BODY, WEARING THE GAME'S ARMOUR.
//
// The comparison that called the new rig blocky put it beside the Monk — and
// the Monk has its armour modelled into its mesh, while ours is a bare body the
// wardrobe dresses at runtime. So that was an armoured hero against an
// undressed mannequin, and the interesting question was never asked: what does
// ours look like once the game has dressed it?
//
// The contact sheet already drives the real `Actor.setAppearance`, so this just
// photographs it with each body in turn.
//
//   node tools/soak/dressed.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "tools/soak/shots/dressed";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
});

for (const [label, query] of [["monk", "sheet=full"], ["ours", "sheet=full&body=new"]]) {
  const page = await browser.newPage({ viewportSize: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:5173/preview/?${query}`, { waitUntil: "networkidle" });
  // The sheet builds every actor asynchronously — models, armour and weapons
  // all load and compile — so a screenshot taken on "networkidle" catches an
  // empty grid. Waiting on the canvas having drawn something is not enough
  // either; this is a generous fixed wait because the alternative is a probe
  // that reports an empty sheet as a body with no gear.
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  console.log(`${label}: ${OUT}/${label}.png${errors.length ? `  !! ${errors[0].slice(0, 120)}` : ""}`);
  await page.close();
}
await browser.close();
