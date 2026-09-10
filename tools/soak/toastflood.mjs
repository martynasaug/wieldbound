// HOW MANY TOASTS CAN COVER THE SCREEN AT ONCE?
//
// `tour.mjs`'s frontier frame is buried down the left edge under about twenty
// stacked toasts — "Shockwave: cooling down", "Shield Wall: cooling down",
// "Crush: nothing in reach", "Concuss: cooling down", over and over — drawn
// straight across the player's own health bar and character panel.
//
// `Hud.toast` already coalesces repeats, and its comment says it was written
// for precisely this. It only merges the MOST RECENT toast, though, and this is
// not a repeat, it is a CYCLE: four hotkeys pressed in turn produce A, B, C, D,
// A, B, C, D... so no two in a row are ever equal, nothing coalesces, and the
// host grows without limit. A player holding down a row of skills on cooldown
// gets the same thing.
//
// This presses several hotkeys in rotation and counts what is on screen.
//
//   node tools/soak/toastflood.mjs Player3619
import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await new Promise((r) => setTimeout(r, 2000));

const toasts = () => page.evaluate(() => {
  const host = document.querySelector("#hud3d .toasts");
  const els = [...(host?.children ?? [])];
  return {
    count: els.length,
    tallestBottom: els.length ? Math.max(...els.map((e) => e.getBoundingClientRect().bottom)) : 0,
    topmost: els.length ? Math.min(...els.map((e) => e.getBoundingClientRect().top)) : null,
    texts: els.slice(0, 4).map((e) => e.textContent.slice(0, 42)),
  };
});

// Where the player's own health bar sits, so "does this cover the HUD" is a
// measured overlap rather than an impression.
const frame = await page.evaluate(() => {
  const el = document.querySelector("#hud3d .frame, #hud3d .unit, #hud3d .selfframe") ?? document.querySelector("#hud3d > div");
  const r = el?.getBoundingClientRect();
  return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right) } : null;
});

console.log(`the unit frame occupies y ${frame?.top}..${frame?.bottom}\n`);
console.log("presses   toasts on screen   topmost y   sample");
// Skills 1-7, pressed in rotation. Most will be on cooldown or out of reach,
// which is the ordinary state of a hotbar being mashed.
for (let round = 1; round <= 6; round++) {
  for (let n = 0; n < 8; n++) {
    for (const k of ["1", "2", "3", "4", "5", "6", "7"]) {
      await page.keyboard.press(k);
      await page.waitForTimeout(35);
    }
  }
  const t = await toasts();
  console.log(
    `${String(round * 56).padStart(7)}   ${String(t.count).padStart(16)}   ${String(t.topmost ?? "-").padStart(9)}   ${t.texts[0] ?? ""}`,
  );
}

const t = await toasts();
await page.screenshot({ path: "tools/soak/shots/toastflood.png" });
console.log(`\n${t.count} toast(s) on screen at the end`);
if (frame && t.topmost !== null && t.topmost < frame.bottom) {
  console.log(`THE STACK REACHES y=${t.topmost}, WHICH IS OVER THE UNIT FRAME (ends at y=${frame.bottom}).`);
} else {
  console.log("the stack stays clear of the unit frame.");
}
console.log(`first few: ${JSON.stringify(t.texts)}`);
await browser.close();
