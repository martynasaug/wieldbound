// WHAT THE TWO LOAD-TIME HITCHES ACTUALLY ARE, MEASURED AT THE GPU BOUNDARY.
//
// Every previous attempt to name them failed for the same structural reason:
// the instrument was installed AFTER login, and both hitches land at about
// +9.7s against a ~10s load. The tracker was switched on after the thing it was
// meant to watch had already happened. `texupload.mjs` has this flaw baked in —
// it finds `Texture.prototype` by traversing the scene, which requires a scene,
// which requires the load to be over.
//
// So hook lower down. `WebGLRenderingContext.prototype` exists before any page
// script runs, which means an init script can wrap it, which means there is no
// window at all in which uploads are invisible. It also measures the real thing
// rather than a proxy: three.js registering a texture is a bookkeeping event
// that happens to coincide with an upload, whereas `texImage2D` IS the upload.
//
// Each wrapped call is timed. Cheap ones (the overwhelming majority) are counted
// and thrown away; anything over THRESH_MS is kept with a stack. A hitch is then
// explained by the expensive calls inside it, or explicitly not explained — the
// "nothing here" answer is a real answer and is printed as one.

import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const WATCH_MS = Number(process.argv[3] ?? 20) * 1000;

// Long enough to skip the noise of a thousand trivial buffer writes, short
// enough that four of them still add up to a visible stutter.
const THRESH_MS = 0.8;

const INSTALL = () => {
  window.__gl = { events: [], counts: {}, totals: {} };
  const S = window.__gl;

  // Both context flavours: the game asks for webgl2, but a fallback would
  // otherwise be silently unmeasured, and an unmeasured path is how the last
  // three of these investigations went wrong.
  const protos = [
    typeof WebGL2RenderingContext !== "undefined" && WebGL2RenderingContext.prototype,
    typeof WebGLRenderingContext !== "undefined" && WebGLRenderingContext.prototype,
  ].filter(Boolean);

  // The calls that can actually block: sending pixels, compiling and linking
  // programs, and the queries that force a sync with the driver.
  const WATCH = [
    "texImage2D", "texSubImage2D", "texImage3D", "texStorage2D",
    "compressedTexImage2D", "generateMipmap",
    "compileShader", "linkProgram", "getProgramParameter", "getShaderParameter",
    "bufferData", "bufferSubData", "readPixels", "finish", "drawArrays", "drawElements",
  ];

  const describe = (fn, args) => {
    // Enough identity to tell a 2048px atlas from a 16px swatch, without
    // stringifying anything that could be enormous.
    if (fn.startsWith("tex") || fn === "compressedTexImage2D") {
      const img = [...args].find((a) => a && (a.width || a.videoWidth));
      if (img) {
        const w = img.width ?? img.videoWidth;
        const h = img.height ?? img.videoHeight;
        return w + "x" + h + " " + (img.constructor ? img.constructor.name : "?");
      }
      const buf = [...args].find((a) => a && a.byteLength !== undefined);
      if (buf) return (buf.byteLength / 1024).toFixed(0) + "KB";
      return [...args].filter((a) => typeof a === "number").slice(0, 4).join(",");
    }
    if (fn.startsWith("buffer")) {
      const buf = [...args].find((a) => a && a.byteLength !== undefined);
      return buf ? (buf.byteLength / 1024).toFixed(1) + "KB" : "";
    }
    return "";
  };

  for (const proto of protos) {
    for (const fn of WATCH) {
      const orig = proto[fn];
      if (typeof orig !== "function") continue;
      proto[fn] = function (...args) {
        const t0 = performance.now();
        const r = orig.apply(this, args);
        const dt = performance.now() - t0;
        S.counts[fn] = (S.counts[fn] ?? 0) + 1;
        S.totals[fn] = (S.totals[fn] ?? 0) + dt;
        if (dt >= 0.8 && S.events.length < 40000) {
          S.events.push({
            t: t0,
            dt,
            fn,
            what: describe(fn, args),
            stack: (new Error().stack || "").split("\n").slice(2, 6).map((s) => s.trim()).join(" | "),
          });
        }
        return r;
      };
    }
  }

  // The hitch recorder, page-side, so hitches carry the SAME clock as the GL
  // events above. Node's console event carries the Node clock and cannot be
  // lined up against `performance.now()` at all — that mismatch is why every
  // earlier hitch report in this directory was undated.
  window.__hitches = [];
  const origWarn = console.warn.bind(console);
  console.warn = (...a) => {
    const text = a.map(String).join(" ");
    if (text.includes("[hitch]")) window.__hitches.push({ t: performance.now(), text: text.slice(0, 240) });
    return origWarn(...a);
  };

  // Frame intervals, from before the first frame, so the load's own stutters
  // are in the record and not just the ones the game chose to log.
  window.__fr = [];
  let last = 0;
  const tick = (ts) => {
    if (last > 0) window.__fr.push({ t: ts, dt: ts - last });
    last = ts;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const run = async () => {
  const { browser, page } = await open({ headless: false });
  await page.addInitScript(INSTALL);

  const loadMs = await login(page, NAME);
  console.log(`load ${(loadMs / 1000).toFixed(1)}s`);
  await page.waitForTimeout(WATCH_MS);

  const { events, counts, totals } = await page.evaluate(() => ({
    events: window.__gl.events,
    counts: window.__gl.counts,
    totals: window.__gl.totals,
  }));
  const hitches = await page.evaluate(() => window.__hitches);
  const frames = await page.evaluate(() => window.__fr);

  const watched = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n=== ${events.length} GL calls over ${THRESH_MS}ms, out of ${watched} watched calls ===`);
  for (const [fn, n] of Object.entries(counts).sort((a, b) => (totals[b[0]] ?? 0) - (totals[a[0]] ?? 0)).slice(0, 10)) {
    console.log(`  ${fn.padEnd(22)} ${String(n).padStart(7)} calls  ${(totals[fn] ?? 0).toFixed(0)}ms total`);
  }

  // THE LOAD, SECOND BY SECOND. Where the expensive calls sit says which phase
  // is slow far more directly than any phase timer the game prints about itself.
  const bucket = new Map();
  for (const e of events) {
    const s = Math.floor(e.t / 1000);
    const rec = bucket.get(s) ?? { ms: 0, n: 0 };
    rec.ms += e.dt;
    rec.n++;
    bucket.set(s, rec);
  }
  console.log(`\n--- expensive GL time per second ---`);
  for (const [s, rec] of [...bucket.entries()].sort((a, b) => a[0] - b[0])) {
    if (rec.ms < 5) continue;
    console.log(`  +${String(s).padStart(3)}s  ${rec.ms.toFixed(0).padStart(6)}ms across ${rec.n} calls`);
  }

  // The long frames, whether or not the game noticed them. A frame the profiler
  // missed still stutters.
  const longFrames = frames.filter((f) => f.dt > 60).sort((a, b) => b.dt - a.dt);
  console.log(`\n--- ${longFrames.length} frames over 60ms (of ${frames.length}) ---`);
  for (const f of longFrames.slice(0, 12)) {
    const near = events.filter((e) => e.t > f.t - f.dt - 20 && e.t <= f.t);
    const gl = near.reduce((a, e) => a + e.dt, 0);
    console.log(`  +${(f.t / 1000).toFixed(1)}s  ${f.dt.toFixed(0)}ms frame, ${gl.toFixed(0)}ms of it in GL (${near.length} calls)`);
    const by = new Map();
    for (const e of near) by.set(`${e.fn} ${e.what}`, (by.get(`${e.fn} ${e.what}`) ?? 0) + e.dt);
    for (const [k, ms] of [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
      console.log(`        ${ms.toFixed(1).padStart(7)}ms  ${k}`);
    }
  }

  console.log(`\n--- ${hitches.length} hitches the game logged ---`);
  for (const h of hitches) {
    const near = events.filter((e) => e.t > h.t - 500 && e.t <= h.t + 50);
    const gl = near.reduce((a, e) => a + e.dt, 0);
    console.log(`\n  +${(h.t / 1000).toFixed(1)}s ${h.text}`);
    console.log(`      ${gl.toFixed(0)}ms of GL in the 500ms before it, ${near.length} slow calls`);
    const by = new Map();
    for (const e of near) {
      const k = `${e.fn} ${e.what}`;
      const rec = by.get(k) ?? { ms: 0, n: 0, stack: e.stack };
      rec.ms += e.dt;
      rec.n++;
      by.set(k, rec);
    }
    for (const [k, rec] of [...by.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 5)) {
      console.log(`      ${rec.ms.toFixed(1).padStart(7)}ms  ${rec.n}x  ${k}`);
      console.log(`               ${rec.stack}`);
    }
    if (!near.length) console.log(`      NOTHING in GL — this hitch is CPU-side, not an upload.`);
  }

  console.log("\nconsole errors:", page.__errors.length);
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
