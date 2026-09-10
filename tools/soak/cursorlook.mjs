// DOES THE POINTER SAY WHAT IT IS OVER?
//
// The cursor is CSS on the canvas, so nothing about it throws: a malformed SVG
// data URI, a bad hotspot, or a cursor that never changes all render as "the
// ordinary arrow" and look exactly like a feature that was never wired up.
//
// Two questions, and they are different. Whether the right cursor is ASSIGNED —
// read back off the canvas with the pointer on each kind of thing, with the SVG
// parsed rather than merely present. And whether it READS: an axe nobody
// recognises at 38px passes every assertion worth writing. A screenshot of the
// game cannot answer the second, because a screenshot never contains the
// pointer, so the URIs the game actually produced are re-drawn large on light
// and dark ground and photographed on their own.
//
//   node tools/soak/cursorlook.mjs CursorBot
import { open, login, approach, step } from "./driver.mjs";
import { INTERACTION_RANGE_PX } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? `Cur${Math.floor(Math.random() * 90000)}`;
const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, NAME);
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  g.world.setCameraDistance(6.5);
});
await page.waitForTimeout(1200);

/** The cursor the canvas is wearing, with its SVG pulled back out and parsed. */
const cursorNow = () => page.evaluate(() => {
  const css = window.__wieldbound.world.renderer.domElement.style.cursor || "";
  const m = css.match(/url\("(data:image\/svg\+xml;utf8,[^"]+)"\)\s+(\d+)\s+(\d+)/);
  if (!m) return { plain: true };
  const doc = new DOMParser().parseFromString(decodeURIComponent(m[1].split(",").slice(1).join(",")), "image/svg+xml");
  return {
    plain: false,
    url: m[1],
    hotspot: `${m[2]},${m[3]}`,
    parses: !doc.querySelector("parsererror"),
    paths: doc.querySelectorAll("path").length,
  };
});

const seen = {};
const report = (label, r) => {
  console.log(
    `  ${label.padEnd(20)} ` +
      (r.plain
        ? "plain arrow"
        : `${r.parses ? "svg ok" : "!! SVG DOES NOT PARSE"}  hotspot ${r.hotspot}  ${r.paths} paths`),
  );
};

await page.mouse.move(200, 720);
await page.waitForTimeout(250);
report("open ground", await cursorNow());

/** Sweep up an object until the game's own picker agrees we are on it. */
const hoverObject = async (worldOf, agrees) => {
  for (const lift of [0.9, 1.8, 2.8, 0.3, 3.6]) {
    const p = await page.evaluate(([h, w]) => {
      const g = window.__wieldbound;
      const s = g.world.project(w.x, w.y + h, w.z);
      return s ? { x: Math.round(s.x), y: Math.round(s.y) } : null;
    }, [lift, worldOf]);
    if (!p || p.x < 6 || p.y < 6 || p.x > 1274 || p.y > 794) continue;
    await page.mouse.move(p.x, p.y);
    await page.waitForTimeout(170);
    if (await agrees()) return true;
  }
  return false;
};

// A MONSTER, WHICH TAKES MORE CARE THAN IT LOOKS.
//
// Three separate things defeated earlier attempts at this, none of them the
// feature under test:
//
//   * the client builds monsters well beyond the view, so `monsters.size > 0`
//     says nothing about whether a pointer can reach one;
//   * the first ones to appear are at the screen edge, UNDER the dock rail and
//     the panels, which are real DOM above the canvas — a pointermove there
//     never reaches the canvas at all, and `pointerX` stays -1;
//   * and a creature is picked by screen distance, so the pointer has to land
//     near its projected centre rather than merely somewhere on it.
//
// So: walk until something is in the CENTRAL region, clear of the interface,
// then try each on-screen monster by its own projected centre.
for (let i = 0; i < 80; i++) {
  const visible = await page.evaluate(() => {
    const g = window.__wieldbound;
    for (const v of g.monsters.values()) {
      if (v.dead || v.state?.status !== "alive" || !v.actor?.loaded) continue;
      const p = v.actor.position;
      const s = g.world.project(p.x, p.y + 0.4, p.z);
      if (s && s.x > 240 && s.y > 170 && s.x < 1000 && s.y < 600) return true;
    }
    return false;
  });
  if (visible) break;
  await step(page, ["d"], 600);
}
const targets = await page.evaluate(() => {
  const g = window.__wieldbound;
  const out = [];
  for (const [id, v] of g.monsters) {
    if (v.dead || v.state?.status !== "alive" || !v.actor?.loaded) continue;
    const p = v.actor.position;
    const s = g.world.project(p.x, p.y + 0.4, p.z);
    if (!s) continue;
    if (s.x < 240 || s.y < 170 || s.x > 1000 || s.y > 600) continue;
    out.push({ id, kind: v.kind, x: Math.round(s.x), y: Math.round(s.y) });
  }
  return out;
});
let hovered = null;
for (const t of targets) {
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(200);
  if (await page.evaluate(() => window.__wieldbound.hoverId)) { hovered = t; break; }
}
if (hovered) {
  const r = await cursorNow();
  seen.attack = r.url;
  report(`a ${hovered.kind}`, r);
} else {
  console.log(`  could not get the pointer onto a monster (${targets.length} on screen)`);
}

// Each node kind.
for (const kind of ["tree", "rock", "bush"]) {
  const near = () => page.evaluate((k) => {
    const g = window.__wieldbound;
    let best = null;
    for (const n of g.nodeStates?.values?.() ?? []) {
      if (n.kind !== k) continue;
      const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
      if (!best || d < best.d) best = { x: n.x, y: n.y, d, id: n.id };
    }
    return best;
  }, kind);
  for (let i = 0; i < 60; i++) {
    const at = await near();
    if (!at || at.d <= INTERACTION_RANGE_PX * 1.6) break;
    await approach(page, at, at.d > 250 ? 400 : 140);
  }
  const at = await near();
  if (!at) { console.log(`  no ${kind} found`); continue; }
  const world = await page.evaluate((id) => {
    const o = window.__wieldbound.nodes.get(id);
    return o ? { x: o.position.x, y: o.position.y, z: o.position.z } : null;
  }, at.id);
  const ok = world && (await hoverObject(world, async () =>
    (await page.evaluate(() => window.__wieldbound.hoverNodeId)) === at.id));
  if (!ok) { console.log(`  could not get the pointer onto a ${kind}`); continue; }
  const r = await cursorNow();
  seen[kind] = r.url;
  report(`a ${kind}`, r);
}
// EVERY CURSOR THE GAME BUILT, from its own table — see `publishCursorDebug`.
// The hovers above prove the right cursor is CHOSEN for a tree, a rock and a
// bush; this proves what each one looks like, including the ones a bot cannot
// reliably stand in front of.
const all = await page.evaluate(() => window.__wieldboundCursors ?? null);
if (all) {
  for (const [k, css] of Object.entries(all)) {
    const m = css.match(/url\("([^"]+)"\)/);
    if (m && !seen[k]) seen[k] = m[1];
  }
  console.log(`  cursor table published: ${Object.keys(all).join(", ")}`);
} else {
  console.log("  !! no __wieldboundCursors table — only hovered cursors will be drawn");
}
await browser.close();

// Draw what the game produced, big, on grass and at night.
const kinds = Object.keys(seen);
if (kinds.length === 0) {
  console.log("\nnothing to draw — no cursor was ever assigned");
} else {
  const { chromium } = await import("playwright");
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 190 * kinds.length + 40, height: 470 } });
  const row = (bg, size) =>
    `<div style="background:${bg};padding:16px;display:flex;gap:26px;align-items:flex-start">` +
    kinds.map((k) => `<div style="text-align:center;width:${size}px">
        <img src="${seen[k]}" style="width:${size}px;height:${size}px">
        <div style="color:#fff;font:12px system-ui;margin-top:4px">${k}</div></div>`).join("") +
    "</div>";
  await p.setContent(`<body style="margin:0">${row("#7d8f52", 152)}${row("#20242c", 152)}${row("#7d8f52", 38)}</body>`);
  await p.waitForTimeout(400);
  await p.screenshot({ path: "tools/soak/shots/cursors.png" });
  await b.close();
  console.log(`\n${kinds.length} cursor(s) drawn to tools/soak/shots/cursors.png`);
}
