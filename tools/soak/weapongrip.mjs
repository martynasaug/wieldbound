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
import { ITEM_BASES } from "../../shared/items.ts";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? "tools/soak/shots/grip";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1200, height: 900 });
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

const owned = await page.evaluate(() =>
  window.__wieldbound.items
    .filter((i) => i.slot === "weapon" || i.slot === "offhand")
    .map((i) => ({ id: i.id, baseId: i.baseId })));
const key = (b) => `${b?.art?.model ?? b?.art?.build ?? "?"}|${b?.art?.lay ?? "along"}`;
const seen = new Set();
for (const it of owned) {
  const k = key(ITEM_BASES[it.baseId]);
  if (seen.has(k)) continue;
  seen.add(k);
  const ok = await page.evaluate(async (x) => {
    const g = window.__wieldbound;
    g.socket.sendEquipItem(x.id);
    await new Promise((r) => setTimeout(r, 1500));
    let found = false;
    for (const h of g.localActor?.held ?? []) h.traverse((c) => { if (c.name === `held_${x.baseId}`) found = true; });
    return found;
  }, it);
  const file = k.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/w-${file}.png` });
  console.log(`  ${ok ? "ok  " : "MISS"} ${it.baseId.padEnd(16)} ${k}`);
}

