// HOW THE CHARACTER ACTUALLY HOLDS EACH WEAPON.
//
// Every weapon in this game is a separate model socketed to a hand bone, and
// nothing has ever LOOKED at the result. The harnesses here have checked that a
// weapon swings, that it reaches the right distance, that its tree is coherent
// and that its damage is balanced — all of which can be true while the sword is
// through the character's forearm.
//
// This was pointed out from outside, off a frame I had already captured and
// read for other reasons: "look at how that character is holding that sword."
// The frame was there. I had been reading the combat log in it.
//
// Close, lit, and one weapon at a time, because that is what it takes to judge
// a grip: the clock frozen at noon so nothing is in shadow, the camera pulled
// in to its minimum, and the character alone rather than mid-fight.
//
//   node tools/soak/weapongrip.mjs Player3619 tools/soak/shots/grip
import { mkdirSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { WEAPONS } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/grip";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: false, width: 1200, height: 900 });
await page.bringToFront();
await login(page, NAME);

// Noon, so the model is lit rather than guessed at. `DayNight.freeze` takes a
// FRACTION of a day — 0.5 is midday. See tour.mjs, which was handed 12 once and
// photographed midnight.
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.world.setCameraDistance(4.5);
});
await page.waitForTimeout(1200);

for (const family of Object.keys(WEAPONS)) {
  const held = await page.evaluate(async (want) => {
    const g = window.__wieldbound;
    if (want === "fist") {
      const on = g.items.find((i) => i.slot === "weapon" && i.equipped);
      if (on) g.socket.sendEquipItem(on.id);
    } else {
      const item = g.items.find((i) => i.slot === "weapon" && i.weaponType === want && !i.equipped);
      if (!item) return null;
      g.socket.sendEquipItem(item.id);
    }
    await new Promise((r) => setTimeout(r, 1400));
    const now = g.items.find((i) => i.slot === "weapon" && i.equipped);
    return want === "fist" ? (now ? null : "fists") : (now?.weaponType ?? null);
  }, family);

  if (held !== (family === "fist" ? "fists" : family)) {
    console.log(`  ${family.padEnd(7)} SKIPPED — no ${family} in the bag to hold`);
    continue;
  }
  // Idle, facing the camera-ish, so the hand is visible rather than mid-swing.
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/grip-${family}.png` });
  console.log(`  ${family.padEnd(7)} captured`);
}

console.log(`\nshots in ${OUT}/ — look at the hands.`);
console.log("console errors:", page.__errors.length);
await browser.close();
