// EVERY PANEL, CAPTURED, SO THEY CAN BE LOOKED AT.
//
// The standing instruction on this project is that I should find these things
// myself rather than wait to be told, and the two most recent visual bugs — a
// death animation played on the respawn tile, and a level-up that hid the
// character behind a yellow slab — were both reported by the person watching
// rather than by me. Both were plainly visible in frames I had already captured
// and skimmed for numbers.
//
// So this opens each window in turn and saves it. No assertions: the point is a
// set of pictures to actually examine, and an assertion would only encode what I
// already thought to look for.

import { open, login, hotbarKeys, step, nearestMonster, approach } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? ".";

// key, what it opens, and how long to let it settle.
const PANELS = [
  ["c", "character"],
  ["i", "inventory"],
  ["k", "skills"],
  ["l", "leaderboard"],
  ["o", "settings"],
  ["m", "map"],
];

const { browser, page } = await open({ headless: true, width: 1600, height: 900 });
await login(page, NAME);

// Get into a fight first, so the panels are captured over a live game rather
// than over an empty field — a panel that is unreadable against combat is a
// panel that is unreadable when it matters.
const keys = await hotbarKeys(page);
for (let i = 0; i < 40; i++) {
  const t = await nearestMonster(page);
  if (t && t.d < 220) break;
  if (!t) { await step(page, ["w"], 700); continue; }
  await approach(page, t, 600);
}
for (const k of keys.slice(0, 3)) {
  await page.keyboard.press(k);
  await page.waitForTimeout(120);
}

await page.screenshot({ path: `${OUT}/panel-00-combat.png` });
console.log("combat");

for (const [key, name] of PANELS) {
  // Close whatever is open first, so panels do not stack.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await page.keyboard.press(key);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/panel-${key}-${name}.png` });
  const open_ = await page.evaluate(() => {
    // What is actually on screen, so a capture of nothing is obvious in the log
    // rather than a mystery in the picture.
    const panels = [...document.querySelectorAll("div,section")]
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 260 && r.height > 200 && (el.id || el.className);
      })
      .map((el) => el.id || String(el.className).split(" ")[0]);
    return [...new Set(panels)].slice(0, 6);
  });
  console.log(`${key} -> ${name}: visible [${open_.join(", ")}]`);
}

console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 5)) console.log("  ", e);
await browser.close();
