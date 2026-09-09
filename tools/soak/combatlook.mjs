// WHAT A FIGHT ACTUALLY LOOKS LIKE.
//
// Every combat harness in this directory counts something — frames, hits,
// damage, programs. None of them looks. `fxshot.mjs` looks, but deliberately at
// ONE effect with nothing else happening, which is the right way to judge an
// effect and the wrong way to judge a fight: the thing a player experiences is
// four monsters, a skill going off, numbers rising and something dying, all at
// once, and whether that reads clearly is not a number.
//
// So: walk into the nearest pack, swing and cast, and take a burst of frames
// across the whole fight to be looked at afterwards. No assertions — this
// produces evidence for a person, and the point is to find what is wrong before
// having a theory about it.
//
//   node tools/soak/combatlook.mjs Fighter sword cleave,onslaught
//
// Shots land in tools/soak/shots/combat-NN.png.
import { mkdirSync } from "node:fs";
import { open, login, approach, step } from "./driver.mjs";

const NAME = process.argv[2] ?? "Fighter";
const WEAPON = process.argv[3] ?? "sword";
const SKILLS = (process.argv[4] ?? "cleave,onslaught").split(",").filter(Boolean);
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: false, width: 1600, height: 900 });
await page.bringToFront();
await login(page, NAME);

await page.evaluate(async (w) => {
  const g = window.__wieldbound;
  const held = g.items.find((i) => i.slot === "weapon" && i.equipped);
  if (!held || held.weaponType !== w.WEAPON) {
    const want = g.items.find((i) => i.slot === "weapon" && i.weaponType === w.WEAPON && !i.equipped);
    if (want) g.socket.sendEquipItem(want.id);
    await new Promise((r) => setTimeout(r, 1200));
  }
  for (const s of w.SKILLS) {
    g.socket.sendLearnTalent(`${w.WEAPON}.${s}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}, { WEAPON, SKILLS });

const look = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    let best = null;
    let alive = 0;
    for (const v of g.monsters.values()) {
      const s = v.state;
      if (!s || s.status !== "alive") continue;
      alive++;
      const d = Math.hypot(s.x - g.playerX, s.y - g.playerY);
      if (!best || d < best.d) best = { x: s.x, y: s.y, d, kind: s.kind };
    }
    return { best, alive, hp: g.hp, maxHp: g.maxHp };
  });

// Find something to fight. A screenshot of an empty field is not a fight.
let target = null;
for (let i = 0; i < 40 && !target; i++) {
  const { best } = await look();
  // CONTACT, NOT NEARBY. 130px is outside every melee reach in the game —
  // `reachOf` is about 54-62px plus the target body radius — so the first run of
  // this stood off and filmed twelve frames of "Slash: nothing in reach", which
  // is the probe being wrong rather than the game.
  if (best && best.d <= 60) target = best;
  else if (best) await approach(page, best, 500);
  else await step(page, ["w"], 800);
}
if (!target) {
  console.log("nothing to fight nearby — no shots taken, and an empty field is not a result");
  await browser.close();
  process.exit(0);
}

const keys = await page.evaluate(() => window.__wieldbound.hotbar?.layout?.keys ?? []);
console.log(`fighting a ${target.kind} with a ${WEAPON} (${SKILLS.join(", ")})`);

// A burst across the whole exchange rather than one frame: the interesting
// moments are the swing, the skill landing, and the instant something dies, and
// which frame holds them cannot be predicted from here.
for (let i = 0; i < 12; i++) {
  if (i % 3 === 0 && SKILLS.length) {
    const skill = SKILLS[(i / 3) % SKILLS.length | 0];
    await page.evaluate((x) => window.__wieldbound.socket.sendUseSkill(x), skill);
  } else if (keys.length) {
    await page.keyboard.press(keys[0]);
  }
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${OUT}/combat-${String(i).padStart(2, "0")}.png` });
  const s = await look();
  process.stdout.write(`  ${i}: ${s.alive} alive, you ${s.hp}/${s.maxHp}\n`);
}
console.log(`\n12 frames in ${OUT}/ — look at them.`);
console.log("console errors:", page.__errors.length);
await browser.close();
