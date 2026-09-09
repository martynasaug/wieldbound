// THE FIRST TEN MINUTES, AS A NEW CHARACTER ACTUALLY MEETS THEM.
//
// Every driven harness in this directory runs the seeded endgame fixture —
// level 235, 463 spare points, a bag of band-5 gear, every talent mastered.
// That character cannot see the early game: it one-shots band-1 creatures,
// never gathers, never levels in a way that matters, and never meets a wall.
// `death.mjs` is the only thing here that starts from nothing, and it does so
// to measure dying.
//
// So the opening — the part every new player sees and the only part most will
// see — has never been played and looked at. This starts a character that has
// never logged in, plays for a stretch, and reports what actually happened:
// what it fought, what it gathered, what it levelled to, how often it died,
// and whether it could afford anything at the end of it.
//
// No assertions. The point is a picture of the opening, and an assertion would
// only encode what I already expected to find.
//
// WHAT IT MEASURES IS THE NAIVE OPENING, AND THAT IS A LIMITATION TO STATE
// RATHER THAN A FINDING TO REPORT. This bot walks out and punches things, which
// is the one thing the game tells you not to do. Bare-handed at level 1:
// accuracy 50 against a slime's 5 evasion is a 45% hit, average damage 1.5
// times the fist's 0.6 multiplier is ~0.68 a swing, and a swing takes 1152ms —
// so a 15hp slime is about 26 SECONDS of continuous punching, and level 2 is
// four of them. A six-minute run gained 9 of the 20 experience needed, which
// matches that arithmetic exactly.
//
// That reads like a brutal opening and it is not one, because it is not the
// opening. The Herald's own "What should I do first?" says: take work from
// Cabel and Marda, which pays in materials, gather from the bushes in the
// square and the trees outside the wall, then stand at the anvil and forge
// something. And "bare-handed you are an adventurer" — fists are deliberately
// the worst thing in the game to hold. A character that follows the advice has
// a weapon within minutes; this one never had one, and never gathered, because
// the bot does not know how.
//
// So the honest reading of a run: it says what happens if a new player ignores
// every piece of guidance the game gives them. Making it follow the guidance —
// accept the two quests, gather, forge — is the version that would measure the
// intended opening, and it is the obvious next piece of work here.
//
//   node tools/soak/firstminutes.mjs Newcomer7 tools/soak/shots/first 8
import { mkdirSync } from "node:fs";
import { open, login, step, approach, nearestMonster } from "./driver.mjs";
import { SHOP_STOCK } from "../../shared/shop.ts";

const NAME = process.argv[2] ?? `New${Math.floor(Math.random() * 100000)}`;
const OUT = process.argv[3] ?? "tools/soak/shots/first";
const MINUTES = Number(process.argv[4] ?? 8);
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: false, width: 1600, height: 900 });
await page.bringToFront();
const loadMs = await login(page, NAME);

const look = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    return {
      level: g.level, xp: g.xp, hp: g.hp, maxHp: g.maxHp,
      wood: g.wallet?.wood ?? 0, ore: g.wallet?.ore ?? 0, herb: g.wallet?.herb ?? 0,
      items: g.items?.length ?? 0,
      gatherLevel: g.gatherLevel ?? 0,
      x: g.playerX, y: g.playerY,
    };
  });

const start = await look();
console.log(`${NAME} enters the world in ${(loadMs / 1000).toFixed(1)}s at level ${start.level}, ${start.hp}/${start.maxHp} hp, ${start.items} items\n`);

const keys = await page.evaluate(() => window.__wieldbound.hotbar?.layout?.keys ?? []);
const dirs = [["w"], ["w", "d"], ["d"], ["s", "d"], ["s"], ["s", "a"], ["a"], ["w", "a"]];
const t0 = Date.now();
const endAt = t0 + MINUTES * 60000;
let deaths = 0;
let lastLevel = start.level;
let lastHp = start.hp;
let i = 0;
let shots = 0;
// DID IT ACTUALLY PLAY? Reporting "still level 1 after eight minutes" from a run
// that never found a monster would be a statement about the bot, not the game.
let swings = 0;
let sightings = 0;
let closest = Infinity;
let xpGained = 0;

while (Date.now() < endAt) {
  const near = await nearestMonster(page);
  if (near) { sightings++; closest = Math.min(closest, near.d); }
  if (near && near.d < 400) {
    if (near.d > 60) await approach(page, near, 500);
    else if (keys.length) {
      swings++;
      await page.keyboard.press(keys[0]);
      await page.waitForTimeout(220);
    }
  } else {
    await step(page, dirs[i++ % dirs.length], 700);
  }

  const s = await look();
  // A death shows up as health jumping back up while the character is somewhere
  // else entirely; the level is what matters for progression.
  if (s.hp > lastHp + 5 && s.level === lastLevel) deaths++;
  lastHp = s.hp;
  if (s.level !== lastLevel) {
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`  +${mins}min  level ${lastLevel} -> ${s.level}   ${s.hp}/${s.maxHp} hp   wood ${s.wood} ore ${s.ore} herb ${s.herb}`);
    lastLevel = s.level;
    await page.screenshot({ path: `${OUT}/first-level-${String(s.level).padStart(2, "0")}.png` });
    shots++;
  }
}

const end = await look();
console.log(`\nafter ${MINUTES} minutes:`);
console.log(`  level ${start.level} -> ${end.level},  ${end.hp}/${end.maxHp} hp,  ${end.items} items,  gather level ${end.gatherLevel}`);
console.log(`  materials: wood ${end.wood}, ore ${end.ore}, herb ${end.herb}`);
console.log(`  roughly ${deaths} death(s)`);
console.log(`  it saw a monster ${sightings} times, got within ${closest === Infinity ? "never" : closest.toFixed(0) + "px"}, and swung ${swings} times; xp ${start.xp} -> ${end.xp}`);
if (swings === 0) console.log("  !! it never swung at anything — this run says nothing about progression");

// COULD THIS CHARACTER BUY ANYTHING? The shop is the first thing a new player
// is pointed at, and a starter who cannot afford a single row after ten minutes
// of play is being shown a list of things that are not for them.
const afford = SHOP_STOCK.filter((e) =>
  (e.cost.wood ?? 0) <= end.wood && (e.cost.ore ?? 0) <= end.ore && (e.cost.herb ?? 0) <= end.herb,
);
console.log(`  could afford ${afford.length}/${SHOP_STOCK.length} shop rows: ${afford.map((a) => a.id).join(", ") || "nothing"}`);
await page.screenshot({ path: `${OUT}/first-end.png` });
console.log(`\n${shots + 1} shots in ${OUT}/`);
console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 4)) console.log("  ", e);
await browser.close();
