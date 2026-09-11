// WHICH THINGS LOSE THEIR NAMEPLATE WHEN YOU STAND NEXT TO THEM, AND WHY.
//
// Reported twice. The first fix made `World.project` clamp a close subject's
// label to the top of the screen instead of culling it, and a probe watching a
// TREE confirmed that worked — which was true, and was not the report. "Most
// things" means monsters, townspeople and stations, and a tree is the one
// subject whose label sits highest and so the least like any of them.
//
// A plate can be dropped in five different places and the outcome is identical
// in all five: no element on screen. So this WRAPS `Hud.plate` and records what
// it was handed and what it did with it, rather than recomputing the decision
// out here. The first version of this file did recompute it, guessed two field
// names wrong, and reported that there was nothing within 400px to label while
// standing on top of a townsperson.
//
//   node tools/soak/platecheck.mjs
import { open, login, approach } from "./driver.mjs";

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
await login(page, process.argv[2] ?? `Plate${Math.floor(Math.random() * 100000)}`);
await page.waitForTimeout(1800);

await page.evaluate(() => {
  const g = window.__wieldbound;
  const hud = g.hud;
  const orig = hud.plate.bind(hud);
  window.__plateLog = new Map();
  hud.plate = (id, screen, spec) => {
    const r = orig(id, screen, spec);
    // Queried AFTER the call, because the element is created inside it. Present
    // means the plate survived every gate; absent means one of them fired.
    const el = document.querySelector(`#hud3d [data-id="${CSS.escape(id)}"]`);
    // WHERE IT LANDED, not just that it exists. A plate can be present and be
    // in the wrong place — a screenshot from play showed "Tobin Ash" and
    // "Workbench" both pinned to the left edge of the screen, hundreds of
    // pixels from the workbench they name, because a nudge meant to clear a
    // panel was firing against a full-width layout container. "Drawn" was true
    // for both of them.
    const at = el ? { x: Math.round(el.offsetLeft), y: Math.round(el.offsetTop) } : null;
    window.__plateLog.set(id, {
      kind: spec.kind,
      name: spec.name,
      // How far its subject is, because "suppressed" is correct at range and a
      // bug up close, and the two are indistinguishable without it.
      distance: Math.round(spec.distance ?? 0),
      screen: screen ? { x: Math.round(screen.x), y: Math.round(screen.y) } : null,
      drawn: !!el,
      at,
    });
    return r;
  };
});

const report = async (where) => {
  const s = await page.evaluate(() => {
    const g = window.__wieldbound;
    const hud = g.hud;
    const rows = [];
    for (const [id, v] of window.__plateLog) {
      let why = v.drawn ? "drawn" : "?";
      if (!v.drawn) {
        if (!v.screen) why = "project() returned null";
        else if (v.screen.x < 300 && v.screen.y < hud.framesBottom) why = "behind the unit frames";
        else if ((hud.railRects ?? []).some((r) => v.screen.x > r.left && v.screen.x < r.right && v.screen.y > r.top && v.screen.y < r.bottom)) why = "behind an open window";
        else if (v.screen.x > hud.minimapLeft && v.screen.y < hud.minimapBottom) why = "behind the minimap";
        else why = "dropped, and none of the known gates explains it";
      }
      // Displacement between where the label was asked to go and where it is.
      const drift = v.at && v.screen ? Math.round(Math.hypot(v.at.x - v.screen.x, v.at.y - v.screen.y)) : 0;
      rows.push({ id, kind: v.kind, name: v.name, distance: v.distance, x: v.screen?.x ?? null, y: v.screen?.y ?? null, why, drift });
    }
    return {
      rows,
      drawn: document.querySelectorAll("#hud3d .plate").length,
      layout: {
        framesBottom: Math.round(hud.framesBottom),
        openWindows: (hud.railRects ?? []).length,
        minimapLeft: Math.round(hud.minimapLeft),
        minimapBottom: Math.round(hud.minimapBottom),
      },
    };
  });
  console.log(`\n${where}  —  ${s.drawn} plate(s) on screen, ${s.rows.length} asked for`);
  const l = s.layout;
  console.log(
    `  gates: frames x<300 y<${l.framesBottom} | ${l.openWindows} open window(s) | minimap x>${l.minimapLeft} y<${l.minimapBottom}`,
  );
  for (const r of s.rows) {
    const pos = r.x === null ? "   —,   —" : `${String(r.x).padStart(4)},${String(r.y).padStart(4)}`;
    console.log(
      `  ${(r.kind ?? "?").padEnd(8)} ${String(r.name ?? r.id).slice(0, 22).padEnd(23)} ${String(r.distance).padStart(3)}u ${pos}  ${r.why}` +
        (r.drift > 40 ? `  !! shifted ${r.drift}px from its subject` : ""),
    );
  }
  const stranded = s.rows.filter((r) => r.drift > 120);
  if (stranded.length) {
    console.log(`  !! ${stranded.length} plate(s) drawn more than 120px from where they were asked to go`);
  }
  return s;
};

// Let a frame or two run so the wrapper has seen everything.
await page.waitForTimeout(600);
await report("standing where I logged in");

const nearestNpc = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    let best = null;
    for (const [id, n] of g.npcs) {
      const d = Math.hypot(n.x - g.playerX, n.y - g.playerY);
      if (!best || d < best.d) best = { id, x: n.x, y: n.y, d };
    }
    return best;
  });
for (let i = 0; i < 40; i++) {
  const at = await nearestNpc();
  if (!at || at.d < 55) break;
  await approach(page, at, 450);
}
await page.waitForTimeout(600);
await report("standing on top of the nearest townsperson");

await browser.close();
