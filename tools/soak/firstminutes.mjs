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
// RATHER THAN A FINDING TO REPORT. This bot walks out and fights, ignoring
// every instruction the game gives it — no quests, no gathering, no anvil.
//
// THE BARE-HANDED NUMBERS THIS PARAGRAPH USED TO QUOTE ARE HISTORY NOW, and
// leaving them here unlabelled would have been the same fault this harness
// exists to catch. They were: accuracy 50 against a slime's 5 evasion is a 45%
// hit, 1.5 average damage times the fist's 0.6 multiplier is ~0.68 a swing at
// 1152ms — about 26 SECONDS of punching per slime, and a six-minute run gained
// 9 of the 20 experience needed for level 2.
//
// No new character can reproduce that, because M70.21x gives every one of them
// a Notched Dirk on creation. Armed, the same fight is 47% for ~3 a swing at
// 1595ms: 10.6 swings, about 17 seconds, and level 2 is four slimes rather than
// a quarter of an hour. The run prints what it is actually holding for exactly
// this reason — a header describing a weapon the character no longer has is
// how a measurement quietly becomes a story about a previous build.
//
// A second quote went stale in here the same way: this paragraph used to
// summarise the Herald as "gather from the bushes in the square". That advice
// was corrected in the game in M70.215 — the bushes ring the town at 1000px and
// nothing gatherable stands inside the walls — but the quote of it survived
// here, one file away from the fix.
//
// So the honest reading of a run: it says what happens if a new player ignores
// every piece of guidance the game gives them, while holding the weapon the
// game now hands them. `guidedopening.mjs` is the other half — the same opening
// played as the Herald describes it.
//
//   node tools/soak/firstminutes.mjs Newcomer7 tools/soak/shots/first 8
import { mkdirSync } from "node:fs";
import { open, login, step, approach, nearestMonster } from "./driver.mjs";
import { SHOP_STOCK } from "../../shared/shop.ts";
import { PLAYER_SPAWN } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `New${Math.floor(Math.random() * 100000)}`;
const OUT = process.argv[3] ?? "tools/soak/shots/first";
const MINUTES = Number(process.argv[4] ?? 8);
mkdirSync(OUT, { recursive: true });

// HEADLESS, AND NOT AS A PREFERENCE.
//
// This is a long-run progression bot, which is precisely the case `driver.mjs`
// says must be headless: a headed Chromium that loses focus throttles rAF to
// about 1Hz, so a bot left running for ten minutes while the machine is used
// for anything else spends most of those minutes moving at one frame a second
// and reports the result as if it had played normally. Nothing here is a load
// measurement, so SwiftShader costs nothing that matters.
//
// It also stops a window appearing over whatever the person at the keyboard is
// doing. Twice a harness window was mistaken for the game misbehaving, which is
// a real cost to a tool whose whole job is to tell truth from artefact.
const { browser, page } = await open({ headless: true, width: 1600, height: 900 });
const loadMs = await login(page, NAME);

const look = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    return {
      level: g.level, xp: g.xp, hp: g.hp, maxHp: g.maxHp,
      wood: g.wallet?.wood ?? 0, ore: g.wallet?.ore ?? 0, herb: g.wallet?.herb ?? 0,
      items: g.items?.length ?? 0,
      gatherLevel: g.gatherLevel ?? 0,
      // WHAT IT IS HOLDING. Not decoration: the header above quotes fist
      // arithmetic that no new character can reproduce since every one of them
      // is handed a Notched Dirk, and the only defence against that paragraph
      // going stale a second time is the run stating the weapon out loud.
      weapon: g.items?.find?.((i) => i.slot === "weapon" && i.equipped)?.weaponType ?? "fists",
      x: g.playerX, y: g.playerY,
    };
  });

const start = await look();
console.log(
  `${NAME} enters the world in ${(loadMs / 1000).toFixed(1)}s at level ${start.level}, ` +
    `${start.hp}/${start.maxHp} hp, ${start.items} items, holding ${start.weapon}\n`,
);

const keys = await page.evaluate(() => window.__wieldbound.hotbar?.layout?.keys ?? []);
// THE SAME CLOSED LOOP `guidedopening.mjs` HAD, and it distorts this run in the
// same direction: eight headings walked in equal legs returns to where it
// started, so a bot meant to be "walking out and fighting" circles inside the
// walls where nothing spawns. `driver.mjs` writes the trap down; both files
// fell into it anyway. A persistent heading, turned by an angle that does not
// divide the circle, and pushed outward while near spawn.
const KEYS_FOR = (angle) => {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const keys = [];
  if (dy < -0.38) keys.push("w");
  if (dy > 0.38) keys.push("s");
  if (dx > 0.38) keys.push("d");
  if (dx < -0.38) keys.push("a");
  return keys.length ? keys : ["w"];
};
let heading = Math.random() * Math.PI * 2;
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
    const here = await look();
    const fromSpawn = Math.hypot(here.x - PLAYER_SPAWN.x, here.y - PLAYER_SPAWN.y);
    if (fromSpawn < 900) {
      heading = Math.atan2(here.y - PLAYER_SPAWN.y, here.x - PLAYER_SPAWN.x) + (Math.random() - 0.5) * 0.8;
    }
    const leg = await step(page, KEYS_FOR(heading), 700);
    if (leg.moved < 20) heading += 2.3;
    if (++i % 8 === 0) heading += 2.3;
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
console.log(
  `  level ${start.level} -> ${end.level},  ${end.hp}/${end.maxHp} hp,  ${end.items} items,  ` +
    `gather level ${end.gatherLevel},  holding ${end.weapon}`,
);
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
