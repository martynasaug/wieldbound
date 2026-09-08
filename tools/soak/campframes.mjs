// FRAME COST WHERE THE GAME IS BUSIEST: a camp, with area skills going off.
//
// M70.165 established that gameplay does not stutter — 44,257 frames over 12.3
// minutes with zero in-play hitches, p50 16.7ms, p99 16.8ms. But that run was
// wandering and swinging at whatever was nearest, and the camp work in M70.187
// showed what the heavy case actually is: four monsters at once, an area skill
// catching all of them, a volley of floating numbers, a pooled light per
// impact, and four death animations landing together.
//
// That is the frame nobody has measured. It is also the frame a player is most
// likely to notice, because it is the one where they are deciding something.
//
// HEADED, NOT HEADLESS, and the reason is in `driver.mjs`: headless is
// SwiftShader, which rasterises on the CPU and has no parallel shader compile,
// so its frame times describe a software renderer rather than the player's
// machine. The throttle check from `frames.mjs` comes along too — a
// backgrounded Chromium manufactures ~1000ms gaps, and a run with those in it
// has to be thrown away rather than interpreted.
//
//   node tools/soak/campframes.mjs Fighter 5

import { open, login, approach, step } from "./driver.mjs";
import { MONSTER_STATS, SKILLS } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Fighter";
const MINUTES = Number(process.argv[3] ?? 5);
/** Area skills worth firing into a pack, and the weapon that carries them. */
const KIT = { weapon: "sword", nodes: ["sword.cleave", "sword.onslaught"], skills: ["cleave", "onslaught"] };

/** Frame intervals and hitches, recorded in the page where the clock is honest. */
const INSTALL = () => {
  window.__frames = [];
  window.__hitches = [];
  const origWarn = console.warn.bind(console);
  console.warn = (...a) => {
    const text = a.map(String).join(" ");
    if (text.includes("[hitch]")) window.__hitches.push({ t: performance.now(), text: text.slice(0, 200) });
    return origWarn(...a);
  };
  let last = 0;
  const tick = (ts) => {
    if (last > 0) window.__frames.push({ dt: ts - last, at: ts });
    last = ts;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const look = (page) =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    const mobs = [];
    for (const v of g.monsters.values()) {
      const s = v.state;
      if (!s || s.status !== "alive") continue;
      mobs.push({ id: s.id, kind: s.kind, x: s.x, y: s.y, d: Math.hypot(s.x - g.playerX, s.y - g.playerY) });
    }
    return { mobs, hp: g.hp, at: { x: g.playerX, y: g.playerY } };
  });

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const { browser, page } = await open({ headless: false, width: 1600, height: 900 });
await page.addInitScript(INSTALL);
await login(page, NAME);

await page.evaluate(async (k) => {
  const g = window.__wieldbound;
  const held = g.items.find((i) => i.slot === "weapon" && i.equipped);
  if (!held || held.weaponType !== k.weapon) {
    const want = g.items.find((i) => i.slot === "weapon" && i.weaponType === k.weapon && !i.equipped);
    if (want) g.socket.sendEquipItem(want.id);
    await new Promise((r) => setTimeout(r, 1000));
  }
  for (const n of k.nodes) {
    g.socket.sendLearnTalent(n);
    await new Promise((r) => setTimeout(r, 300));
  }
}, KIT);

// The page-clock instant play actually began, so load frames can be told apart
// from gameplay ones. Everything before this is the loading screen.
const playFrom = await page.evaluate(() => performance.now());
const keys = await page.evaluate(() => window.__wieldbound.hotbar?.layout?.keys ?? []);
const t0 = Date.now();
const endAt = t0 + MINUTES * 60000;
let camps = 0;
let casts = 0;
/** Frame index at which each pack fight began, so the busy frames can be told
 *  apart from the walking between them. */
const busy = [];

while (Date.now() < endAt) {
  // Find the densest cluster in sight and go stand in it.
  const { mobs } = await look(page);
  const groups = {};
  for (const m of mobs) (groups[m.kind] ??= []).push(m);
  let target = null;
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const worth = g.length * (MONSTER_STATS[g[0].kind]?.maxHp ?? 0);
    if (!target || worth > target.worth) {
      target = {
        worth,
        x: g.reduce((a, m) => a + m.x, 0) / g.length,
        y: g.reduce((a, m) => a + m.y, 0) / g.length,
        n: g.length,
      };
    }
  }
  if (!target) {
    await step(page, ["w"], 900);
    continue;
  }
  const s = await look(page);
  if (Math.hypot(target.x - s.at.x, target.y - s.at.y) > 90) {
    await approach(page, target, 500);
    continue;
  }

  // In the middle of a pack. Mark the frame range and make as much happen as
  // possible: auto-attacks, both area skills, everything at once.
  camps++;
  const from = await page.evaluate(() => window.__frames.length);
  const fightUntil = Date.now() + 12000;
  while (Date.now() < fightUntil) {
    for (const skill of KIT.skills) {
      await page.evaluate((x) => window.__wieldbound.socket.sendUseSkill(x), skill);
      casts++;
      await page.waitForTimeout(120);
    }
    await page.keyboard.press(keys[0]);
    await page.waitForTimeout(180);
  }
  const to = await page.evaluate(() => window.__frames.length);
  busy.push([from, to]);
}

const frames = await page.evaluate(() => window.__frames);
const hitches = await page.evaluate(() => window.__hitches);

// THREE BUCKETS, NOT TWO, AND THE THIRD IS WHY THE FIRST REPORT WAS WRONG.
//
// The recorder is installed by `addInitScript`, so it starts counting before the
// game does — every frame of the ten-second load is in the list. "Walking
// between fights" was defined as "not in a fight", which silently swallowed all
// of them, and the load has 600ms, 467ms and 350ms frames in it (M70.169). So
// the alarming `max 1400` attributed to walking around was the LOADING SCREEN,
// and the game's own profiler agreed all along by logging no in-play gap at all.
//
// `playFrom` is the page-clock moment the loading screen lifted.
const busySet = new Set();
for (const [a, b] of busy) for (let i = a; i < b; i++) busySet.add(i);
const busyAt = (f) => busy.some(([a,b]) => { const i = frames.indexOf(f); return i >= a && i < b; });
const loading = frames.filter((f) => f.at < playFrom).map((f) => f.dt);
const inBusy = [];
for (const [a, b] of busy) {
  for (let i = a; i < b && i < frames.length; i++) {
    if (frames[i].at >= playFrom) inBusy.push(frames[i].dt);
  }
}
const idle = frames
  .filter((f, i) => !busySet.has(i) && f.at >= playFrom)
  .map((f) => f.dt);

/** Frames sitting in a tight band around a second are a backgrounded renderer
 *  idling, not the game — see `frames.mjs`, which learned this the hard way. */
const throttleShare = (xs) => xs.filter((f) => f > 900 && f < 1100).length / Math.max(1, xs.length);

const report = (label, xs) => {
  if (!xs.length) return console.log(`${label.padEnd(18)} (no frames)`);
  const s = [...xs].sort((a, b) => a - b);
  // PER SEGMENT, because a blanket verdict throws away a clean measurement. The
  // first run reported the whole thing void when every throttled frame was in
  // the walking between fights and the pack fights themselves were spotless.
  const bad = throttleShare(xs) > 0.005;
  console.log(
    `${label.padEnd(18)} n=${String(xs.length).padStart(6)}  p50 ${pct(s, 0.5).toFixed(1)}ms  ` +
      `p95 ${pct(s, 0.95).toFixed(1)}  p99 ${pct(s, 0.99).toFixed(1)}  max ${s[s.length - 1].toFixed(0)}  ` +
      `>50ms ${xs.filter((f) => f > 50).length}` +
      (bad ? "   <-- THROTTLED, this row is void" : ""),
  );
};

console.log(
  `\n${camps} pack fights, ${casts} area casts, ${((Date.now() - t0) / 60000).toFixed(1)} minutes\n`,
);
report("still loading", loading);
report("in a pack fight", inBusy);
report("walking between", idle);

const throttled = frames.filter((f) => f.dt > 900 && f.dt < 1100).length;
if (throttled) {
  console.log(
    `\n(${throttled} frames across the whole run sit in a band around 1000ms — a backgrounded ` +
      `window idling. Any row marked void above is that; a row without the mark is not.)`,
  );
}

const worst = [...frames].sort((a, b) => b.dt - a.dt).slice(0, 6);
console.log("\nthe six slowest frames of the run, dated on the page clock:");
for (const f of worst) {
  const where = f.at < playFrom ? "LOADING" : busyAt(f) ? "in a fight" : "walking";
  console.log(`   +${(f.at / 1000).toFixed(1)}s  ${f.dt.toFixed(0).padStart(5)}ms  ${where}`);
}

// HITCHES, SPLIT THE SAME WAY. A "BETWEEN frames" hitch is a gap in scheduling,
// which is exactly what throttling manufactures; a "Nms frame" hitch timed real
// work inside a frame and survives a throttled run. Reporting them together
// makes a backgrounded window look like a stuttering game.
const gaps = hitches.filter((h) => h.text.includes("BETWEEN"));
const costly = hitches.filter((h) => !h.text.includes("BETWEEN"));
console.log(
  `\n${costly.length} frame-cost hitches (real work), ${gaps.length} scheduling gaps ` +
    `(mostly the throttle)`,
);
for (const h of costly.slice(0, 10)) console.log(`   +${(h.t / 1000).toFixed(1)}s ${h.text}`);
console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 5)) console.log("  ", e);
await browser.close();
