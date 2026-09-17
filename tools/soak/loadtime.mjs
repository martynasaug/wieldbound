// HOW LONG THE LOADING SCREEN LASTS, AND WHETHER IT ENDS.
//
//   node tools/soak/loadtime.mjs [Name]
//
// A whole-browser freeze on the loading screen has two very different causes
// and they want opposite fixes. Either the load NEVER FINISHES — a loop that
// does not yield, and the tab is dead — or it finishes but takes so long, in
// one synchronous span, that the compositor gets no frame and the window stops
// responding until it is over. The second looks exactly like the first from the
// outside, and only a number tells them apart.
//
// So this waits for the real thing: a numeric `playerX`, which only exists once
// the world is running. An earlier version of this check asked whether
// `window.__wieldbound` was present at all and cheerfully reported "reached
// play in 0.9s" while the loading screen was still up, which is worse than no
// measurement because it reads as a pass.
import { chromium } from "playwright";

const NAME = process.argv[2] ?? `Load${Math.floor(Math.random() * 90000)}`;
const BUDGET_MS = Number(process.argv[3] ?? 180000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));

await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
await page.waitForSelector("input", { timeout: 30000 });
await page.fill("input", NAME);
await page.keyboard.press("Enter");

const t0 = Date.now();
let lastSeen = "";
let reached = false;
while (Date.now() - t0 < BUDGET_MS) {
  let state = null;
  try {
    state = await page.evaluate(() => {
      const g = window.__wieldbound;
      return {
        playing: typeof g?.playerX === "number",
        marks: (g?.loadMarks ?? []).length,
        // Whatever the loading screen is currently saying, which is the only
        // progress signal available from outside.
        caption:
          document.querySelector("[class*=loading] p, [class*=loading] div, #loading")?.textContent?.trim()?.slice(0, 60) ?? "",
      };
    });
  } catch (e) {
    console.log(`  !! the page stopped answering at +${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log(`     that is a main thread that never yields — the freeze is real and total`);
    break;
  }
  if (state.caption && state.caption !== lastSeen) {
    lastSeen = state.caption;
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${state.caption}`);
  }
  if (state.playing) {
    console.log(`\n  PLAYABLE after ${((Date.now() - t0) / 1000).toFixed(1)}s  (${state.marks} load marks)`);
    reached = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 400));
}
if (!reached) console.log(`\n  NEVER REACHED PLAY within ${BUDGET_MS / 1000}s`);
if (errors.length) {
  console.log("\n  page errors:");
  for (const e of errors.slice(0, 6)) console.log(`    ${e}`);
}
await browser.close();
