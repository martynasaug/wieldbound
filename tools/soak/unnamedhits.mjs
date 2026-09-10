// HOW OFTEN DOES SOMETHING HIT YOU THAT THE GAME CANNOT NAME?
//
// A tour frame on the North Road reads "The enemy misses you." and "The enemy
// hits you for 1." Every other frame names the creature — "The Armabee misses
// you", "The Spiky Blob hits you for 1" — and the difference is that the client
// labels a blow from `MONSTER_LABELS[vis.kind]`, where `vis` is its own copy of
// the monster. `MONSTER_ATTACK` carries `monsterId` and no kind, so a blow from
// anything the client has not loaded arrives anonymous.
//
// Whether that is worth a protocol field depends entirely on how often it
// happens, which nothing has measured. So: play, and count.
import { open, login, probe, nearestMonster, approach } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const MINUTES = Number(process.argv[3] ?? 4);

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);

// Count on the wire, not in the log text: the log is what we are judging.
await page.evaluate(() => {
  const g = window.__wieldbound;
  window.__hits = { total: 0, unnamed: 0, kinds: {} };
  const ws = g.socket.socket;
  ws.addEventListener("message", (e) => {
    try {
      const m = JSON.parse(e.data);
      if (m.type !== "MONSTER_ATTACK") return;
      const vis = g.monsters.get(m.payload.monsterId);
      window.__hits.total++;
      if (!vis) window.__hits.unnamed++;
      else window.__hits.kinds[vis.kind] = (window.__hits.kinds[vis.kind] ?? 0) + 1;
    } catch {}
  });
});

const until = Date.now() + MINUTES * 60000;
let laps = 0;
while (Date.now() < until) {
  const m = await nearestMonster(page);
  if (m) await approach(page, m, 900);
  else await page.waitForTimeout(900);
  // Swing at whatever is there, so monsters keep dying and respawning and the
  // client's set keeps churning — which is when an unloaded attacker is likeliest.
  await page.keyboard.press("1");
  laps++;
  if (laps % 40 === 0) {
    const h = await page.evaluate(() => window.__hits);
    console.log(`  ${((until - Date.now()) / 1000).toFixed(0)}s left: ${h.total} blows, ${h.unnamed} from something unnamed`);
  }
}

const h = await page.evaluate(() => window.__hits);
const pct = h.total ? ((h.unnamed / h.total) * 100).toFixed(1) : "0.0";
console.log(`\n${h.total} blows taken over ${MINUTES} minutes`);
console.log(`${h.unnamed} of them (${pct}%) came from a monster the client had not loaded, and read as "The enemy"`);
console.log(`named attackers: ${JSON.stringify(h.kinds)}`);
const st = await probe(page);
console.log(`ended at hp ${st?.hp}`);
await browser.close();
