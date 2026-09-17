// WHERE THE LOAD STOPS.
//
//   node tools/soak/loadstall.mjs [Name]
//
// Written the moment the game stopped reaching play at all — "on the loading
// screen it freezes and my whole browser freezes". A whole-browser freeze is
// not slowness: it is one synchronous span that never yields, so the tab never
// gets to paint and the compositor never gets a frame. Which means the useful
// question is not "how long does loading take" but "which load mark was the
// last one printed", and everything after it is the suspect.
//
// `Game.loadMark` already records the phases with timings and program counts,
// which is exactly the instrument needed; this just gets them out. It gives up
// rather than hanging, because a harness that hangs on a hang tells you nothing
// you did not already know.
import { chromium } from "playwright";

const NAME = process.argv[2] ?? `Stall${Math.floor(Math.random() * 90000)}`;
const BUDGET_MS = Number(process.argv[3] ?? 90000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });

const console_ = [];
page.on("console", (m) => console_.push(`${m.type()}: ${m.text()}`.slice(0, 300)));
page.on("pageerror", (e) => console_.push(`PAGEERROR: ${String(e).slice(0, 400)}`));

const t0 = Date.now();
await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
console.log(`  page served in ${Date.now() - t0}ms`);

// Log in the plain way, without the driver, so nothing in the driver's own
// readiness waits can be what times out.
try {
  await page.waitForSelector("input", { timeout: 20000 });
  await page.fill("input", NAME);
  await page.keyboard.press("Enter");
  console.log("  submitted the name");
} catch {
  console.log("  !! never got a login input");
}

// Poll for the load marks. A frozen main thread cannot answer an evaluate
// either, so a timeout on THIS is itself the finding.
const started = Date.now();
let lastMarks = [];
let stuckSince = Date.now();
while (Date.now() - started < BUDGET_MS) {
  let marks = null;
  try {
    marks = await page.evaluate(
      () => (window.__wieldbound?.loadMarks ?? []).map((m) => `${m.name} ${m.ms}ms +${m.added}prog`),
      { timeout: 4000 },
    );
  } catch {
    console.log(`  !! main thread did not answer at +${Date.now() - started}ms — this is the freeze`);
    break;
  }
  if (marks && marks.length !== lastMarks.length) {
    for (const m of marks.slice(lastMarks.length)) {
      console.log(`    ${((Date.now() - started) / 1000).toFixed(1)}s  ${m}`);
    }
    lastMarks = marks;
    stuckSince = Date.now();
  }
  const playing = await page
    .evaluate(() => Boolean(window.__wieldbound?.playerX !== undefined))
    .catch(() => false);
  if (playing && marks && marks.length) {
    console.log(`\n  reached play in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    break;
  }
  if (Date.now() - stuckSince > 25000) {
    console.log(`\n  !! no new load mark for 25s. Last was: ${lastMarks[lastMarks.length - 1] ?? "(none at all)"}`);
    break;
  }
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\n  ${lastMarks.length} load marks total`);
const errs = console_.filter((l) => l.startsWith("PAGEERROR") || l.startsWith("error"));
if (errs.length) {
  console.log("\n  errors:");
  for (const e of errs.slice(0, 8)) console.log(`    ${e}`);
}
await browser.close();
