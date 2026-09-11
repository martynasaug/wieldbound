// THE CHARACTER CREATOR, END TO END, IN PICTURES.
//
// A brand-new name logs in with the creator allowed (every other harness skips
// it — see `driver.login`), and this photographs what a new player sees. It then
// picks a look through the creator's own `set`, turns the camera the way a
// player would, accepts, and logs the same name in on a FRESH page to answer the
// two questions a screenshot cannot: was the look saved, and does the creator
// stay shut for a character that has chosen.
//
//   node tools/soak/creator.mjs [out]
import { mkdirSync } from "node:fs";
import { open, login } from "./driver.mjs";

const OUT = process.argv[2] ?? "tools/soak/shots/creator";
mkdirSync(OUT, { recursive: true });
const NAME = `Maker${Date.now() % 100000}`;
const CHOSEN = { skin: "porcelain", build: "broad", hair: "long", hairColor: "auburn" };

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME, { creator: true });
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.5));
await page.waitForTimeout(1500);

const opened = await page.evaluate(() => !!document.getElementById("creator-root") && !!window.__wieldbound.creator);
console.log(`${NAME}: creator open on first login: ${opened}`);
if (!opened) { console.log("FAIL — nothing to photograph"); await browser.close(); process.exit(1); }
await page.screenshot({ path: `${OUT}/1-first.png` });

for (const [key, id] of Object.entries(CHOSEN)) {
  await page.evaluate(([k, v]) => window.__wieldbound.creator.set(k, v), [key, id]);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/2-chosen.png` });

// Zoomed to the face, which is the Monk's own.
await page.evaluate(() => { window.__wieldbound.creator.zoomTarget = 1; });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/3-face.png` });

// Turned by dragging off the panel, the way a player would.
await page.mouse.move(900, 400);
await page.mouse.down();
await page.mouse.move(700, 400, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/4-turned.png` });

await page.click("#creator-root .cc-done");
await page.waitForTimeout(1500);
const closed = await page.evaluate(() => !document.getElementById("creator-root") && !document.body.classList.contains("wb-creating"));
console.log(`closed after Enter the world: ${closed}`);
await page.screenshot({ path: `${OUT}/5-in-world.png` });

const second = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await login(second, NAME, { creator: true });
await second.waitForTimeout(1500);
const back = await second.evaluate(() => ({
  creator: !!document.getElementById("creator-root"),
  look: window.__wieldbound.localActor.currentLook,
}));
const same = JSON.stringify(back.look) === JSON.stringify(CHOSEN);
console.log(`second login: creator ${back.creator ? "OPENED AGAIN" : "stayed shut"}, look saved: ${same}`);
if (!same) console.log(`  got ${JSON.stringify(back.look)}`);
console.log(errors.length ? `page errors:\n  ${errors.join("\n  ")}` : "no page errors");
console.log(`shots in ${OUT}/`);
await browser.close();
