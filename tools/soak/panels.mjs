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
  // NO "m" FOR "map". There is no map window — `m` toggles MUTE (Game.ts, the
  // `key === "m"` branch), and this table asked for it every run: the capture
  // labelled "map" was whatever window happened to still be open, and the run
  // left the game silenced behind it. A key list written from memory rather
  // than from the handler, quietly wrong for as long as it has existed.
  //
  // Windows here also STACK rather than replace, so a shot is of everything
  // open at that moment, not of one panel. That is worth knowing before reading
  // one of these as a picture of a single window.
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

/** The windows actually on screen, by id. Named panels only — every large div
 *  matched before, so the answer was a list of layout containers. */
const openPanels = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[id$='-panel']")]
      .filter((el) => {
        const s = getComputedStyle(el);
        return s.display !== "none" && s.visibility !== "hidden" && el.getBoundingClientRect().width > 0;
      })
      .map((el) => el.id),
  );

for (const [key, name] of PANELS) {
  // CLOSE BY TOGGLING, because Escape does not do it. This pressed Escape and
  // said "so panels do not stack" in a comment; the captures have Bags sitting
  // beside the talent tree in the same frame, so it never worked. Each window
  // is toggled by its own key, so pressing the keys of whatever is still open
  // is the thing that actually closes them.
  for (let attempt = 0; attempt < PANELS.length; attempt++) {
    const still = await openPanels(page);
    if (still.length === 0) break;
    for (const [k, n] of PANELS) {
      if (still.some((id) => id.startsWith(n))) {
        await page.keyboard.press(k);
        await page.waitForTimeout(150);
      }
    }
  }
  await page.keyboard.press(key);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/panel-${key}-${name}.png` });
  // Every one of them, not the first six in document order. The truncation was
  // why this reported "i -> inventory: character-panel": it listed whatever came
  // first in the DOM and stopped before reaching the window that had just been
  // opened, so the log contradicted the picture beside it.
  const shown = await openPanels(page);
  const right = shown.some((id) => id.startsWith(name));
  console.log(`${key} -> ${name}: [${shown.join(", ") || "nothing"}]${right ? "" : "   <-- did not open"}`);
}

console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 5)) console.log("  ", e);
await browser.close();
