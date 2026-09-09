// WHAT ALT-TAB DOES TO THE GRAPHICS SETTING.
//
// A combat screenshot came back with "Graphics set to High to hold 1Hz" in the
// log. 1Hz is not a display; it is a Chromium window that is not in front,
// where requestAnimationFrame is throttled to about once a second. The pacer
// measures that as the refresh interval, and `autoQualityDecision` compares a
// ~5ms frame against a ~1000ms budget and concludes there is room to spare.
//
// Stepping UP while nobody is looking would be harmless on its own. The harm is
// what happens next: on return the frame no longer fits, it steps back DOWN,
// and `Game.adaptQuality` treats a step down that immediately undoes a step up
// as proof the level does not hold — `lowerCeiling` then bars that level for
// the rest of the session. So alt-tabbing can permanently cap a machine below
// what it can actually run, and the player is never told why.
//
// `Profiler` already refuses to report anything measured across a
// visibilitychange, for exactly this reason. This path has no such guard.
//
// The sequence, with real focus changes rather than a synthesised event:
//   settle -> background the window -> wait -> bring it back -> wait -> read.
//
//   node tools/soak/qualityfocus.mjs
// ITS OWN BROWSER, WITHOUT THE DRIVER'S ANTI-THROTTLE FLAGS. `driver.open`
// launches with --disable-background-timer-throttling,
// --disable-renderer-backgrounding and --disable-backgrounding-occluded-windows,
// which exist so that measuring harnesses are not ruined by a window losing
// focus. Here the throttling IS the subject, and the first run of this file
// used the shared launcher and reported a steady 60Hz while backgrounded —
// an instrument configured to suppress the thing it was pointed at.
import { chromium } from "playwright";
import { login } from "./driver.mjs";

const open = async () => {
  const browser = await chromium.launch({ headless: false, args: ["--use-gl=angle"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
  page.__errors = errors;
  return { browser, page };
};

const read = (page) =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    return {
      level: g.world.qualityLevel,
      auto: g.autoQuality ? { level: g.autoQuality.level, ceiling: g.autoQuality.ceiling, manual: g.autoQuality.manual } : null,
      refreshHz: g.pacer?.refreshHz,
      divisor: g.pacer?.divisor,
      costMs: g.pacer?.frameCostMs,
    };
  });

const show = (label, s) =>
  console.log(
    `${label.padEnd(24)} quality ${String(s.level).padEnd(11)} ceiling ${String(s.auto?.ceiling ?? "-").padEnd(11)} ` +
      `pacer ${s.refreshHz?.toFixed(0)}Hz divisor ${s.divisor} cost ${s.costMs?.toFixed(1)}ms`,
  );

const { browser, page } = await open();
await page.bringToFront();
await login(page, process.argv[2] ?? "Player3619");

// Settle past AUTO_SETTLE_MS with the window genuinely in front.
await page.waitForTimeout(45000);
const before = await read(page);
show("in front, settled", before);

// A SECOND BROWSER, NOT A SECOND TAB, AND THE DIFFERENCE IS THE WHOLE TEST.
//
// A new tab HIDES the game: `document.hidden` goes true and rAF stops dead. A
// stopped rAF feeds the pacer nothing, so nothing is mismeasured and there is
// no bug to find — which is exactly what the second run of this reported, a
// steady 60Hz while "backgrounded".
//
// The case from the screenshot is different and is the one players actually
// create: the game window still VISIBLE but not focused, where Chromium
// throttles rAF to about 1Hz instead of stopping it. That needs another
// top-level window to take the focus.
const distraction = await chromium.launch({ headless: false, args: ["--use-gl=angle"] });
const other = await distraction.newPage();
await other.goto("about:blank");
await other.bringToFront();
await page.waitForTimeout(30000);
const hidden = await read(page);
show("while backgrounded", hidden);

await page.bringToFront();
await page.waitForTimeout(30000);
const after = await read(page);
show("back in front", after);

const log = await page.evaluate(() =>
  (window.__wieldbound.combatLog?.lines ?? []).filter((l) => String(l.text ?? l).includes("Graphics")).slice(-6),
);
console.log("\ngraphics lines in the log:");
for (const l of log) console.log("   " + (l.text ?? l));

console.log("");
if (after.auto?.ceiling !== before.auto?.ceiling) {
  console.log(
    `CEILING MOVED: ${before.auto?.ceiling} -> ${after.auto?.ceiling}. Alt-tabbing has capped the\n` +
      "  graphics for the rest of the session, on evidence gathered while nothing was being drawn.",
  );
} else if (after.level !== before.level) {
  console.log(`quality changed ${before.level} -> ${after.level} across an alt-tab, ceiling intact.`);
} else {
  console.log("no change across the alt-tab.");
}
await distraction.close();
await browser.close();
