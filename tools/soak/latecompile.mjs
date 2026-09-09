// WHICH PROGRAM COMPILES LATE, BY NAME.
//
// M70.196 left the demand warm three hitches short of shipping: ~1000ms
// `render` frames as new monster kinds first appear, which is an inline compile
// that `World.warmDraw` was supposed to have prevented. The hypothesis on file
// is the shadow-depth program — `frustumCulled` is switched off for the object,
// but whether that is enough to put it inside the sun's shadow frustum during
// the warm was never checked.
//
// A hypothesis about a program is testable. `renderer.info.programs` carries
// every program and its cache key; watching that list grow frame by frame says
// which key appeared and how long the frame it appeared in took. A program born
// in a 1000ms frame is the one doing the damage, and its key says what it is.
// three builds a shadow with a DEPTH material whose key carries a non-zero
// `depthPacking` — 3200 is `BasicDepthPacking`. That is the signature, and it
// is how a late program was identified once before (M70.91).
//
// IT ALSO REPORTS WHETHER THE RUN STUTTERED AT ALL, and that line is not
// decoration. The first version of this walked around without a weapon, found
// no program in any long frame, and reported "nothing compiled late" — from a
// run that had no long frames in it. A clean answer from an instrument that
// never reproduced the fault is worth nothing, so the fault is reproduced here:
// a sword, both area talents, and casting into whatever is nearest, which is
// what `campframes.mjs` was doing when the hitches showed up.
//
//   node tools/soak/latecompile.mjs             the demand path
//   WB_DEFER=0 node tools/soak/latecompile.mjs  the current one, for comparison
const DEFER = process.env.WB_DEFER !== "0";
process.env.WB_CLIENT_URL = "http://localhost:5173" + (DEFER ? "/?deferwarm=1" : "/?deferwarm=0");
const { open, login, approach, step } = await import("./driver.mjs");

const WATCH = () => {
  window.__newPrograms = [];
  window.__frames = [];
  window.__hitches = [];
  const seen = new Set();
  const warn = console.warn.bind(console);
  console.warn = (...a) => {
    const t = a.map(String).join(" ");
    if (t.includes("[hitch]")) window.__hitches.push({ t: performance.now(), text: t.slice(0, 180) });
    return warn(...a);
  };
  let last = 0;
  const tick = (ts) => {
    // The frame this was NOTICED in. A program created inside a long frame is
    // seen on the next one, carrying that frame's length — which is the join
    // between "a program appeared" and "the picture stopped".
    const dt = last ? ts - last : 0;
    last = ts;
    if (dt) window.__frames.push({ dt, at: ts });
    const r = window.__wieldbound?.world?.renderer;
    if (r?.info?.programs) {
      for (const p of r.info.programs) {
        if (seen.has(p.cacheKey)) continue;
        seen.add(p.cacheKey);
        window.__newPrograms.push({ at: ts, dt, key: p.cacheKey });
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const { browser, page } = await open({ headless: false, width: 1400, height: 800 });
await page.bringToFront();
await page.addInitScript(WATCH);
const loadMs = await login(page, process.argv[2] ?? "Fighter");
// THE DOOR, NOT THE START OF THE FIGHT. Both this probe and campframes.mjs
// stamped their clock AFTER equipping a sword and learning talents, which takes
// a few seconds — so the window right after the loading screen lifts, where the
// deferred tail is still warming and where every reported hitch actually landed,
// was being filed as LOADING and excluded from the in-play numbers. The player
// is playing the moment the screen goes.
const doorFrom = await page.evaluate(() => performance.now());

await page.evaluate(async () => {
  const g = window.__wieldbound;
  const held = g.items.find((i) => i.slot === "weapon" && i.equipped);
  if (!held || held.weaponType !== "sword") {
    const want = g.items.find((i) => i.slot === "weapon" && i.weaponType === "sword" && !i.equipped);
    if (want) g.socket.sendEquipItem(want.id);
    await new Promise((r) => setTimeout(r, 1000));
  }
  for (const n of ["sword.cleave", "sword.onslaught"]) {
    g.socket.sendLearnTalent(n);
    await new Promise((r) => setTimeout(r, 300));
  }
});
const playFrom = await page.evaluate(() => performance.now());

const dirs = [["w"], ["w", "d"], ["d"], ["s", "d"], ["s"], ["s", "a"], ["a"], ["w", "a"]];
const until = Date.now() + 170000;
let i = 0;
while (Date.now() < until) {
  const near = await page.evaluate(() => {
    const g = window.__wieldbound;
    let best = null;
    for (const v of g.monsters.values()) {
      const s = v.state;
      if (!s || s.status !== "alive") continue;
      const d = Math.hypot(s.x - g.playerX, s.y - g.playerY);
      if (!best || d < best.d) best = { x: s.x, y: s.y, d, kind: s.kind };
    }
    return best;
  });
  if (near && near.d > 120) {
    await approach(page, near, 500);
    continue;
  }
  for (const skill of ["cleave", "onslaught"]) {
    await page.evaluate((x) => window.__wieldbound.socket.sendUseSkill(x), skill);
    await page.waitForTimeout(120);
  }
  await step(page, dirs[i++ % dirs.length], 500);
}

const made = await page.evaluate(() => window.__newPrograms);
const frames = await page.evaluate(() => window.__frames);
const hitches = await page.evaluate(() => window.__hitches);
await browser.close();

const describe = (key) => {
  const parts = key.split(",");
  const depth = parts.includes("3200") || parts[0] === "depth";
  return `${depth ? "DEPTH (shadow caster)" : "surface"}  first fields: ${parts.slice(0, 3).join(" ")}`;
};

console.log(`\nload ${(loadMs / 1000).toFixed(1)}s (${DEFER ? "demand path" : "current path"})`);

// DID THIS RUN REPRODUCE THE THING IT IS EXPLAINING? Without this the report
// below is only trustworthy when it finds something: a clean answer from a run
// that never stuttered means nothing at all.
const play = frames.filter((f) => f.at >= doorFrom);
const bad = play.filter((f) => f.dt > 100 && !(f.dt > 900 && f.dt < 1100));
const costlyHitch = hitches.filter((h) => !h.text.includes("BETWEEN") && h.t >= doorFrom);
console.log(`frames since the door opened ${play.length}; ${bad.length} over 100ms; ${costlyHitch.length} frame-cost hitches`);
for (const h of costlyHitch.slice(0, 6)) console.log(`   +${((h.t - doorFrom) / 1000).toFixed(1)}s ${h.text}`);
if (!bad.length && !costlyHitch.length) {
  console.log("   !! this run did not stutter, so it cannot say what causes the stutter");
}

const inPlay = made.filter((p) => p.at >= doorFrom);
console.log(`\n${made.length} programs created in total, ${inPlay.length} after the door opened`);
const costly = inPlay.filter((p) => p.dt > 100).sort((a, b) => b.dt - a.dt);
if (!costly.length) {
  console.log("no program appeared in a frame longer than 100ms.");
} else {
  console.log(`${costly.length} program(s) appeared inside a frame longer than 100ms:`);
  for (const p of costly) {
    console.log(`   +${((p.at - doorFrom) / 1000).toFixed(1)}s into play, in a ${p.dt.toFixed(0)}ms frame`);
    console.log(`      ${describe(p.key)}`);
  }
}
console.log(`(${inPlay.length - costly.length} more appeared in frames under 100ms)`);
