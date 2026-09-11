// A PICTURE OF THE RIG VIEWER, because a page that returns 200 and draws
// nothing returns 200.
//
// The viewer at /preview/rig.html loads a GLB, plays its idle and lets it be
// turned. All three of those can fail silently — a model that 404s, a clip that
// is not in the file, a camera pointed at the floor — and every one of them
// still serves a page.
//
//   node tools/soak/rigshot.mjs [out-dir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "tools/soak/shots/rig";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewportSize: { width: 900, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

// THE MODEL URL IS AN ARGUMENT, and the reason is worth knowing: Vite is
// configured to ignore `public/models` in its watcher — regenerating an asset
// while the dev server runs locks the file and kills Vite with EBUSY on Windows
// — and the consequence nobody had written down is that a NEWLY generated model
// is not served until the server restarts. It answers the HTML fallback
// instead, so the page loads, the fetch succeeds, and the GLB parser chokes on
// "<". Pass ?model= at a URL that is definitely served to test the viewer
// itself without restarting anybody's dev server.
const MODEL = process.argv[3];
const url = "http://localhost:5173/preview/rig.html" + (MODEL ? `?model=${encodeURIComponent(MODEL)}` : "");
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

// The HUD is the viewer's own report of what it loaded. Reading it is how a
// silent failure — model missing, no clips — is told from a good render.
const hud = await page.textContent("#hud");
console.log("viewer says:", (hud ?? "").replace(/\s+/g, " ").trim());

for (const [name, turn] of [["front", 0], ["side", 1.57], ["back", 3.14]]) {
  await page.evaluate((t) => {
    // Drag the camera round by dispatching the same events a hand would.
    const el = document.querySelector("canvas");
    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: 400, clientY: 400, bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 400 - t / 0.008, clientY: 400, bubbles: true }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, turn);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/rig-${name}.png` });
  console.log(`  ${OUT}/rig-${name}.png`);
}

// And a pair a second apart, which is the only way to see whether the idle is
// actually running: two identical frames mean a paused mixer or no clip.
await page.screenshot({ path: `${OUT}/idle-a.png` });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/idle-b.png` });
console.log(`  ${OUT}/idle-a.png and idle-b.png, a second apart`);

console.log(errors.length ? `console errors: ${errors.slice(0, 4).join(" | ")}` : "console errors: 0");
await browser.close();
