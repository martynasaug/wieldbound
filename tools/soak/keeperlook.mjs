// WHAT A KEEPER LOOKS LIKE WHEN YOU WALK UP TO ONE.
//
//   node tools/soak/keeperlook.mjs [Name]
//
// The keeper system's whole value is telling a player where to go BEFORE they
// own the thing. An item's tooltip naming its keeper is no use for that — you
// can only read it once you already have the item. So the line lives on the
// target frame, and a line on the target frame can be clipped, wrapped wrong,
// coloured into the background, or simply never shown, and every one of those
// looks exactly like a working build from the data side.
//
// This targets one of each boss and photographs the frame.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach, unstick } from "./driver.mjs";
import { MONSTER_LOOT, keepsOf, signatureOf } from "../../shared/items.ts";
import { MONSTER_LABELS, PLAYER_SPAWN } from "../../shared/protocol-types.ts";

// Where each keeper actually stands. The server lays camps out as a radius and
// an angle from spawn, so this is that arithmetic rather than a second table
// that would go stale the first time a camp moved.
const RING = { troll: [2350, 190], golem: [2750, 140], dragon: [2750, 320] };
const where = (kind) => {
  const [r, deg] = RING[kind];
  const a = (deg * Math.PI) / 180;
  return { x: PLAYER_SPAWN.x + Math.cos(a) * r, y: PLAYER_SPAWN.y + Math.sin(a) * r };
};

const NAME = process.argv[2] ?? `Keep${Math.floor(Math.random() * 90000)}`;
const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });

const keepers = Object.keys(MONSTER_LOOT).filter((k) => (MONSTER_LOOT[k].keeps ?? []).length);
for (const k of keepers) {
  console.log(`${MONSTER_LABELS[k].padEnd(8)} known for ${signatureOf(k)?.name ?? "-"}`);
  console.log(`         only source of ${keepsOf(k).map((b) => b.name).join(", ")}`);
}

const { browser, page } = await open({ headless: true, width: 1400, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, NAME);
await page.waitForTimeout(1500);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.5));

console.log("");
for (const kind of keepers) {
  // Target it directly rather than walking to it: the frame is the subject, and
  // the walk out to a band-5 boss is a different harness's job.
  // Walk out to it. A boss stands two and a half thousand pixels from spawn and
  // the client is only told about what is near the player, so "not in view" was
  // the harness never having left town rather than anything about the frame.
  const to = where(kind);
  let best = Infinity;
  let stalled = 0;
  for (let i = 0; i < 420; i++) {
    const at = await page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));
    const d = Math.hypot(to.x - at.x, to.y - at.y);
    if (d < 420) break;
    // Progress, not motion. A bot grinding along a palisade is moving the whole
    // time and getting no closer, and the old `moved < 5` check never fired for
    // it — which is how two of these three "walked" for seventy seconds and
    // ended up further from the camp than they started.
    if (d < best - 20) { best = d; stalled = 0; } else { stalled++; }
    if (stalled > 0 && stalled % 12 === 0) await unstick(page, 200);
    if (i % 60 === 0) console.log(`    ${kind}: ${Math.round(d)}px to go`);
    await approach(page, to, d > 900 ? 900 : 350);
  }
  const found = await page.evaluate((k) => {
    const g = window.__wieldbound;
    for (const [id, v] of g.monsters) {
      if (v.state?.kind === k && v.state?.status === "alive") {
        // `setTarget` is what a click calls, and calling it is the whole point:
        // poking `targetId` sets the field and never redraws the frame, which
        // reported "NOTHING SHOWN" about a frame that was working.
        g.setTarget(id);
        return id;
      }
    }
    return null;
  }, kind);
  if (!found) {
    const at = await page.evaluate(() => ({
      x: Math.round(window.__wieldbound.playerX), y: Math.round(window.__wieldbound.playerY),
    }));
    console.log(`  ${kind}: not in view (stopped at ${at.x},${at.y}, wanted ${Math.round(to.x)},${Math.round(to.y)})`);
    continue;
  }
  await page.waitForTimeout(600);
  const shown = await page.evaluate(() => {
    const el = document.getElementById("target-known");
    if (!el || !el.classList.contains("shown")) return null;
    const keeps = el.querySelector(".k-keeps");
    return {
      text: el.textContent,
      keeps: keeps?.textContent ?? null,
      // A clipped list of the only things in the world that carry a fabled item
      // is worse than no list, and `white-space: nowrap` on the parent is
      // exactly how that happens.
      clipped: keeps ? keeps.scrollWidth > keeps.clientWidth + 1 : false,
      height: el.getBoundingClientRect().height,
    };
  });
  console.log(`  ${kind.padEnd(8)} ${shown ? shown.text : "NOTHING SHOWN"}${shown?.clipped ? "  << CLIPPED" : ""}`);
  const frame = await page.$("#target-frame");
  if (frame) writeFileSync(`${OUT}/keeper-${kind}.png`, await frame.screenshot());
}
console.log(`\n  shots: ${OUT}/keeper-*.png`);
if (errors.length) console.log("  page errors:", errors.slice(0, 3));
await browser.close();
