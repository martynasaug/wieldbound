// Where is this character, and can it move? A one-shot diagnostic for a run
// that reported nothing happening.
import { open, login, step, nearestMonster } from "./driver.mjs";

const { browser, page } = await open({ headless: true });
await login(page, process.argv[2] ?? "Player3619");

const s = await page.evaluate(() => {
  const g = window.__wieldbound;
  return {
    x: Math.round(g.playerX),
    y: Math.round(g.playerY),
    hp: Math.round(g.hp),
    maxHp: Math.round(g.maxHp),
    level: g.level,
    place: g.hud?.placeName ?? null,
    monsters: g.monsters.size,
  };
});
const fromSpawn = Math.hypot(s.x - 8000, s.y - 6000);
console.log(JSON.stringify(s), `distanceFromSpawn=${Math.round(fromSpawn)}px`);
console.log("nearest monster:", JSON.stringify(await nearestMonster(page)));

for (const dirs of [["w"], ["a"], ["s"], ["d"]]) {
  const r = await step(page, dirs, 900);
  console.log(`  press ${dirs[0]} for 900ms -> moved ${r.moved.toFixed(0)}px  (now ${Math.round(r.x)}, ${Math.round(r.y)})`);
}
console.log("console errors:", page.__errors.length);
await browser.close();
