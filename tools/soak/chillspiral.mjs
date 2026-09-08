// CAN A CHILLED PLAYER GET AWAY FROM THE THING THAT CHILLED THEM?
//
// M70.181 made slows reach the player for the first time, which is correct and
// also a real balance change, and the arithmetic afterwards is uncomfortable:
//
//     a new player, chilled     88 px/s   (220 x 0.4)
//     the ghost that chilled them   168 px/s
//
// The ghost is nearly twice as fast as the character it just slowed, chilled
// lasts 3,500ms, and a ghost swings every 1,700ms with a 25% chance to re-apply
// it. On paper that is a loop with no exit: chilled, caught, chilled again.
//
// On paper is not good enough for a balance claim, because two things might
// save it — a ghost that gives up the chase, or a chill that lapses often
// enough to let a player break contact. So this actually runs it: take the
// chill, then run flat out for fifteen seconds and watch the gap.
//
// A loop with no exit is a different thing from a monster that is dangerous.
// The first is a bug in the tuning; the second is a ghost.
//
//   node tools/soak/chillspiral.mjs Fighter

import { open, login, step, approach } from "./driver.mjs";
import WebSocket from "ws";

// WHERE THE GHOSTS ARE, asked of the server rather than of the client.
//
// The client CULLS what it keeps: standing at the river it knew about four
// monsters while the server's snapshot carried eighty. So a browser probe
// hunting for a ghost by walking and looking is hunting through a keyhole, and
// the first version of this reported "no ghost landed a chill" after two
// minutes of walking away from every ghost in the world.
//
// One brief read-only socket, under a throwaway name because monster positions
// are global and have nothing to do with who is asking.
const ghostSites = () =>
  new Promise((resolve) => {
    const ws = new WebSocket("ws://localhost:8080");
    const done = (v) => { try { ws.close(); } catch {} resolve(v); };
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type !== "STATE_SNAPSHOT") return;
      done((m.payload.monsters ?? []).filter((x) => x.kind === "ghost" && x.status === "alive"));
    });
    ws.on("open", () => ws.send(JSON.stringify({ type: "HELLO", payload: { clientVersion: "0.0.1", name: "GhostScout" } })));
    ws.on("error", () => done([]));
    setTimeout(() => done([]), 8000);
  });

const NAME = process.argv[2] ?? "Fighter";
const RUN_MS = 15000;

const snapshot = (page) =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    let ghost = null;
    let bd = Infinity;
    for (const v of g.monsters.values()) {
      if (v.state?.status !== "alive" || v.state.kind !== "ghost") continue;
      const d = Math.hypot(v.state.x - g.playerX, v.state.y - g.playerY);
      if (d < bd) { bd = d; ghost = { x: v.state.x, y: v.state.y, d }; }
    }
    return {
      ghost,
      hp: g.hp,
      speed: g.moveSpeed(),
      chilled: (g.statusBar?.active ?? []).some((s) => s.id === "chilled"),
      at: { x: g.playerX, y: g.playerY },
    };
  });

const { browser, page } = await open({ headless: true, width: 1000, height: 700 });
await login(page, NAME);

// Close with a ghost and let it land a chill.
const sites = await ghostSites();
if (!sites.length) {
  console.log("NOT RUN — the server reports no live ghost anywhere. INCONCLUSIVE.");
  await browser.close();
  process.exit(0);
}
const here = (await snapshot(page)).at;
sites.sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y));
const site = sites[0];
console.log();

let got = false;
const until = Date.now() + 180000;
while (Date.now() < until && !got) {
  const s = await snapshot(page);
  // Steer by the SITE until the client can see the ghost for itself.
  if (!s.ghost) { await approach(page, site, 700); continue; }
  if (s.ghost.d > 50) { await approach(page, s.ghost, 600); continue; }
  await page.waitForTimeout(600);
  got = (await snapshot(page)).chilled;
}
if (!got) {
  console.log("NOT RUN — no ghost landed a chill. INCONCLUSIVE.");
  await browser.close();
  process.exit(0);
}

const start = await snapshot(page);
console.log(
  `chilled: ${start.speed} px/s against a ghost's 168 px/s, hp ${Math.round(start.hp)}, ` +
    `gap ${start.ghost.d.toFixed(0)}px`,
);

// Run. Directly away from where the ghost was, and keep going.
const away = { x: start.at.x - (start.ghost.x - start.at.x), y: start.at.y - (start.ghost.y - start.at.y) };
const keys = [];
if (away.x > start.at.x) keys.push("d"); else keys.push("a");
if (away.y > start.at.y) keys.push("s"); else keys.push("w");

const samples = [];
const runUntil = Date.now() + RUN_MS;
while (Date.now() < runUntil) {
  await step(page, keys, 700);
  const s = await snapshot(page);
  samples.push({ d: s.ghost ? Math.round(s.ghost.d) : null, chilled: s.chilled, hp: Math.round(s.hp) });
}

const end = samples[samples.length - 1];
const chilledShare = samples.filter((s) => s.chilled).length / samples.length;
const gaps = samples.map((s) => (s.d === null ? "gone" : s.d)).join(" ");
console.log(`gap over ${(RUN_MS / 1000).toFixed(0)}s of running: ${gaps}`);
console.log(
  `chilled for ${(chilledShare * 100).toFixed(0)}% of the run, hp ${Math.round(start.hp)} -> ${end.hp}`,
);

// The question is whether distance was made, not whether it was comfortable.
const escaped = end.d === null || end.d > start.ghost.d + 200;
console.log(
  escaped
    ? `\nESCAPABLE — the gap opened from ${start.ghost.d.toFixed(0)}px to ${end.d ?? "out of sight"}. Dangerous, not a trap.`
    : `\nNOT ESCAPABLE — after ${(RUN_MS / 1000).toFixed(0)}s of running flat out the ghost is still ` +
        `${end.d}px away and the chill held ${(chilledShare * 100).toFixed(0)}% of the time. ` +
        `That is a loop with no exit rather than a dangerous monster.`,
);
await browser.close();
