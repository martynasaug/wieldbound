// WHERE THE LOAD ACTUALLY SPENDS ITS TIME, ON THE CPU.
//
// `loadhitch.mjs` settled the GPU half: after the ImageBitmap change there is
// about 90ms of expensive GL left in a ten-second load, and the long frames
// that remain — 600ms, 467ms, 350ms — have ZERO milliseconds of GL in them.
// Whatever the load is doing, it is not talking to the driver.
//
// That is as far as a GL hook can see, so this is a different instrument: V8's
// own sampling profiler, over CDP, started before navigation and stopped when
// the loading screen lifts. It reports self time per function and per file,
// which is the question "which of these is worth attacking" in the only form
// that can be answered before doing the work.
//
// WHY SELF TIME AND NOT TOTAL. Total time up a call tree tells you that the
// load calls the loader, which is not news. Self time says which function was
// actually executing when the samples landed, and a sampling profiler is the
// one tool here that cannot be fooled by a wrong guess about what to hook —
// every previous instrument in this directory had to be told what to look for,
// and was wrong twice about that before it was right.
//
// Read this as a shape, not as a stopwatch: sampling at 100us over a ten-second
// load is thousands of samples, plenty to rank the top functions, and not
// precise enough to argue about a 5ms difference between two of them.

import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";

const short = (url) => {
  if (!url) return "(native)";
  const u = url.replace(/^https?:\/\/[^/]+\//, "");
  // Vite's dependency pre-bundle is where three itself lives, and its chunk
  // names are hashes that mean nothing. Name it for what it is.
  if (u.includes("node_modules/.vite/deps")) return "three/deps (" + u.split("/").pop().split("?")[0] + ")";
  return u.split("?")[0];
};

const run = async () => {
  // Headed, for the same reason `loadhitch.mjs` is: headless SwiftShader has no
  // parallel shader compile, and a load measured under it is a measurement of
  // software rasterisation.
  const { browser, page } = await open({ headless: false });
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Profiler.enable");
  // 100us. The default is 1000us, which over a load this size gives a top-ten
  // list where the tail entries are two samples apart and mean nothing.
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
  await cdp.send("Profiler.start");

  const loadMs = await login(page, NAME);
  const { profile } = await cdp.send("Profiler.stop");
  console.log(`load ${(loadMs / 1000).toFixed(1)}s`);

  // SELF TIME FROM THE SAMPLE STREAM, not from `hitCount`.
  //
  // `hitCount` is a sample COUNT, and turning it into milliseconds means
  // assuming every sample cost the nominal interval. The profiler already
  // reports the real gaps in `timeDeltas`, and they are not uniform — the
  // sampler is itself descheduled during the long frames, which are exactly the
  // frames this is trying to explain. Using the deltas costs nothing and
  // removes the assumption.
  const byId = new Map();
  const walk = (n) => {
    byId.set(n.id, n);
    for (const c of n.children ?? []) {
      const child = profile.nodes.find((x) => x.id === c);
      if (child) walk(child);
    }
  };
  for (const n of profile.nodes) byId.set(n.id, n);

  const selfUs = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    // `timeDeltas[i]` is the gap BEFORE sample i, so it is the time attributed
    // to the sample that precedes it.
    const dt = profile.timeDeltas[i] ?? 0;
    if (dt <= 0) continue;
    const id = profile.samples[i];
    selfUs.set(id, (selfUs.get(id) ?? 0) + dt);
    total += dt;
  }

  const label = (n) => {
    const f = n.callFrame;
    const name = f.functionName || "(anonymous)";
    return `${name}  —  ${short(f.url)}${f.lineNumber >= 0 && f.url ? ":" + (f.lineNumber + 1) : ""}`;
  };

  const rows = [...selfUs.entries()]
    .map(([id, us]) => ({ node: byId.get(id), us }))
    .filter((r) => r.node)
    .sort((a, b) => b.us - a.us);

  console.log(`\n${(total / 1000).toFixed(0)}ms of samples across the load\n`);
  console.log("--- top functions by self time ---");
  for (const r of rows.slice(0, 22)) {
    const ms = r.us / 1000;
    if (ms < 3) break;
    console.log(`  ${ms.toFixed(0).padStart(6)}ms  ${((ms * 100000) / total).toFixed(1).padStart(5)}%  ${label(r.node)}`);
  }

  // AND BY FILE, which is the number that decides what to do. One expensive
  // function is a function to optimise; a whole file that dominates is a
  // pipeline choice, and those are different conversations.
  const byFile = new Map();
  for (const r of rows) {
    const k = short(r.node.callFrame.url);
    byFile.set(k, (byFile.get(k) ?? 0) + r.us);
  }
  console.log("\n--- by file ---");
  for (const [k, us] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
    const ms = us / 1000;
    if (ms < 5) break;
    console.log(`  ${ms.toFixed(0).padStart(6)}ms  ${((ms * 100000) / total).toFixed(1).padStart(5)}%  ${k}`);
  }

  console.log("\nconsole errors:", page.__errors.length);
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
