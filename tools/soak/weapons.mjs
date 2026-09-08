// PLAY EVERY WEAPON, ONE AFTER ANOTHER, AND PHOTOGRAPH EACH ONE FIGHTING.
//
// Eight families across four classes, and they are meant to feel different:
// an axe is slow and heavy (1.35 interval, 1.45 damage), a dagger fast and
// light (0.6 / 0.7), a bow reaches 300px where a sword reaches 62. Whether they
// actually DO is not something the numbers can answer — a weapon with the right
// arithmetic and no swing animation, or a silent one, or one whose projectile
// never appears, reads as broken while every table says it is fine.
//
// So this equips each in turn, fights with it, and records what happened:
// hits, misses, damage, kills, console errors, and a frame mid-fight. The
// screenshots are the point. The counts are there to make an anomaly findable
// in the log rather than only in the pictures.
//
//   node tools/soak/weapons.mjs Fighter ./shots

import { open, login, step, approach, nearestMonster } from "./driver.mjs";
import { attackRangeFor, MONSTER_STATS, reachToBody } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Fighter";
const OUT = process.argv[3] ?? ".";
const FIGHT_MS = Number(process.argv[4] ?? 26000);

/** Fists last, because getting there means taking the weapon off. */
const ALL = ["sword", "axe", "mace", "dagger", "bow", "staff", "wand", "fist"];
/** Optional filter, so one suspicious family can be re-run on its own. */
const ONLY = process.argv[5];
const ORDER = ONLY ? ALL.filter((w) => ONLY.split(",").includes(w)) : ALL;

/** Equips a weapon of the given family, or bare hands for "fist". Returns what
 *  the client thinks it is holding afterwards, so a silent failure is visible. */
const equip = (page, family) =>
  page.evaluate(async (fam) => {
    const g = window.__wieldbound;
    const held = g.items.find((i) => i.slot === "weapon" && i.equipped);
    if (fam === "fist") {
      if (held) g.socket.sendEquipItem(held.id); // toggles off
    } else {
      const want = g.items.find((i) => i.slot === "weapon" && i.weaponType === fam && !i.equipped);
      if (want) g.socket.sendEquipItem(want.id);
      else if (!held || held.weaponType !== fam) return { ok: false, why: `no ${fam} owned` };
    }
    await new Promise((r) => setTimeout(r, 900));
    return { ok: true, holding: g.appearance?.weaponType ?? "(none)" };
  }, family);

const logLines = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#combat-log div")].map((e) => e.textContent.trim()).filter(Boolean),
  );

const { browser, page } = await open({ headless: true, width: 1400, height: 800 });
await login(page, NAME);
const errorsAt = () => page.__errors.length;

console.log(`${"weapon".padEnd(8)} ${"holding".padEnd(8)} ${"reach".padStart(5)} ${"hits".padStart(5)} ${"miss".padStart(5)} ${"dmg".padStart(6)} ${"kills".padStart(5)}  errors`);

for (const family of ORDER) {
  const before = errorsAt();
  const got = await equip(page, family);
  if (!got.ok) {
    console.log(`${family.padEnd(8)} ${"—".padEnd(8)} ${"".padStart(5)} ${got.why}`);
    continue;
  }

  // Close with something, then swing at it for a while.
  const seen = new Set(await logLines(page));
  const reach = attackRangeFor(family);
  const keys = await page.evaluate(() => window.__wieldbound.hotbar?.layout?.keys ?? []);
  const until = Date.now() + FIGHT_MS;
  let shot = false;
  while (Date.now() < until) {
    const t = await nearestMonster(page);
    if (!t) { await step(page, ["w"], 800); continue; }
    // CLOSE TO THIS WEAPON'S REACH, not to a flat 160px. The first version
    // used 160 for everything and then swung, which is outside a mace (59px)
    // and a dagger (60px) entirely — they scored zero hits and zero kills and
    // looked broken, while a sword only landed anything because the monsters
    // walked into it.
    const want = reachToBody(reach, MONSTER_STATS[t.kind]?.bodyRadiusPx ?? 16);
    if (t.d > want) { await approach(page, t, 500); continue; }
    for (const k of keys.slice(0, 1)) {
      await page.keyboard.press(k);
      await page.waitForTimeout(140);
    }
    // One frame, taken while genuinely mid-fight rather than at the end when
    // everything nearby is already dead.
    if (!shot && Date.now() > until - FIGHT_MS + 6000) {
      await page.screenshot({ path: `${OUT}/weapon-${family}.png` });
      shot = true;
    }
  }
  if (!shot) await page.screenshot({ path: `${OUT}/weapon-${family}.png` });

  const after = (await logLines(page)).filter((l) => !seen.has(l));
  // THE VERB VARIES BY WEAPON. "You hit the Slime for 127" but "You shocked
  // the Wolf for 79" — matching on "You hit" scored every elemental weapon at
  // zero and made a working staff look dead.
  const hits = after.filter((l) => /^You .* for \d+/i.test(l));
  const misses = after.filter((l) => /^You .*(miss|finds nothing)/i.test(l)).length;
  const kills = after.filter((l) => /You defeated/i.test(l)).length;
  const dmg = hits.reduce((a, l) => a + (Number(/for (\d+)/.exec(l)?.[1]) || 0), 0);
  console.log(
    `${family.padEnd(8)} ${String(got.holding).padEnd(8)} ${String(reach ?? "?").padStart(5)} ` +
      `${String(hits.length).padStart(5)} ${String(misses).padStart(5)} ${String(dmg).padStart(6)} ` +
      `${String(kills).padStart(5)}  ${errorsAt() - before}`,
  );
}

console.log("\nconsole errors overall:", page.__errors.length);
for (const e of page.__errors.slice(0, 6)) console.log("  ", e);
await browser.close();
