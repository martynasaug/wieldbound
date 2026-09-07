// WHAT THE LOAD IS WAITING FOR.
//
// `loadcpu.mjs` established that the load is 46% idle: neither the CPU nor the
// GPU is the bottleneck, so it is waiting on bytes. This says which bytes, how
// many, and how long each kind sat on the wire — the numbers an asset decision
// needs, since "use fewer/smaller textures" is worth doing only if textures are
// actually what the load is spending its time on.
//
// READ THE CAVEAT BEFORE QUOTING ANY OF THIS. The dev server serves
// uncompressed and from localhost, so:
//
//   * transfer sizes here are RAW sizes. In production the text assets (glTF
//     JSON, JS) would gzip to a fraction; the JPEGs and PNGs are already
//     compressed and would not move.
//   * the durations are localhost durations. They are a floor, not a forecast —
//     a real network makes every one of them worse, and makes the BYTE COUNTS
//     matter far more than they do here.
//
// So the byte column is the durable finding and the millisecond column is the
// weakest possible version of the problem.

import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";

const kindOf = (url) => {
  const u = url.split("?")[0].toLowerCase();
  if (/\.(jpg|jpeg|png|webp|ktx2|basis)$/.test(u)) return "texture";
  if (/\.(glb|gltf)$/.test(u)) return "model (glTF)";
  if (/\.fbx$/.test(u)) return "model (FBX)";
  if (/\.(mp3|ogg|wav|m4a)$/.test(u)) return "audio";
  if (/\.(js|mjs|ts)$/.test(u)) return "script";
  if (/\.(css|woff2?|ttf)$/.test(u)) return "style/font";
  return "other";
};

const kb = (n) => (n / 1024).toFixed(0) + "KB";
const mb = (n) => (n / 1048576).toFixed(2) + "MB";

const run = async () => {
  const { browser, page } = await open({ headless: false });

  const loadMs = await login(page, NAME);

  // THE PAGE'S OWN RESOURCE TIMING, not Playwright's request events.
  //
  // The first version of this read `request.timing()` and printed a wall time
  // of 0ms for all 417 requests — every single one — which is the instrument
  // reporting nothing and calling it a measurement. Resource Timing is the
  // browser's own record: real durations, and `transferSize === 0` marks a
  // cache hit, which is the difference between "we downloaded this twice" and
  // "we asked for it twice and the second was free."
  const rows = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((e) => ({
      url: e.name,
      wall: e.duration,
      start: e.startTime,
      end: e.responseEnd,
      transfer: e.transferSize,
      // The decoded size, which is what the decoder and the GPU actually deal
      // with, and what survives any amount of gzip.
      decoded: e.decodedBodySize,
    })),
  );
  for (const r of rows) r.kind = kindOf(r.url);
  for (const r of rows) r.bytes = r.decoded || r.transfer;
  console.log(`load ${(loadMs / 1000).toFixed(1)}s, ${rows.length} requests\n`);

  const byKind = new Map();
  for (const r of rows) {
    const k = byKind.get(r.kind) ?? { n: 0, bytes: 0, wall: 0, worst: 0, worstUrl: "" };
    k.n++;
    k.bytes += r.bytes;
    k.wall += r.wall;
    if (r.wall > k.worst) {
      k.worst = r.wall;
      k.worstUrl = r.url;
    }
    byKind.set(r.kind, k);
  }

  const totalBytes = rows.reduce((a, r) => a + r.bytes, 0);
  console.log("--- by kind ---");
  console.log("  kind            files      bytes   share    summed wall time");
  for (const [kind, k] of [...byKind.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(
      `  ${kind.padEnd(14)} ${String(k.n).padStart(5)}  ${mb(k.bytes).padStart(9)}  ` +
        `${((k.bytes / totalBytes) * 100).toFixed(1).padStart(5)}%  ${(k.wall / 1000).toFixed(1).padStart(6)}s`,
    );
  }
  console.log(`  ${"TOTAL".padEnd(14)} ${String(rows.length).padStart(5)}  ${mb(totalBytes).padStart(9)}`);

  console.log("\n--- the 15 heaviest single files ---");
  for (const r of [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 15)) {
    console.log(
      `  ${kb(r.bytes).padStart(8)}  ${(r.wall).toFixed(0).padStart(6)}ms  ${r.kind.padEnd(12)}  ` +
        r.url.split("/").slice(-2).join("/").split("?")[0],
    );
  }

  // AND THE CRITICAL PATH, which is not the same as the heaviest file. A load
  // waits for whatever finishes LAST, so the request that ends latest is the
  // one holding the loading screen up.
  console.log("\n--- longest single requests (queue included) ---");
  for (const r of [...rows].sort((a, b) => b.wall - a.wall).slice(0, 8)) {
    console.log(
      `  ${r.wall.toFixed(0).padStart(6)}ms  ${kb(r.bytes).padStart(8)}  ends +${(r.end / 1000).toFixed(1)}s  ` +
        r.url.split("/").pop().split("?")[0],
    );
  }
  console.log("\n--- what finishes LAST, which is what the loading screen waits for ---");
  for (const r of [...rows].sort((a, b) => b.end - a.end).slice(0, 8)) {
    console.log(`  ends +${(r.end / 1000).toFixed(1)}s  ${r.wall.toFixed(0).padStart(6)}ms  ${kb(r.bytes).padStart(8)}  ${r.url.split("/").pop().split("?")[0]}`);
  }

  // FETCHED MORE THAN ONCE. The raw request log showed `grass_nor.jpg` and
  // `gravel_diff.jpg` twice each, which is either a duplicate download or a
  // second free hit on the cache — a distinction worth 1.4MB apiece, and one
  // the request log cannot make but `transferSize` can.
  const byUrl = new Map();
  for (const r of rows) {
    const k = byUrl.get(r.url) ?? { n: 0, transfer: 0, bytes: r.bytes, kind: r.kind };
    k.n++;
    k.transfer += r.transfer;
    byUrl.set(r.url, k);
  }
  const repeats = [...byUrl.entries()].filter(([, k]) => k.n > 1).sort((a, b) => b[1].transfer - a[1].transfer);
  const wasted = repeats.reduce((a, [, k]) => a + Math.max(0, k.transfer - k.bytes), 0);
  console.log(`\n--- ${repeats.length} URLs fetched more than once (${mb(wasted)} actually re-transferred) ---`);
  for (const [url, k] of repeats.slice(0, 12)) {
    const note = k.transfer > k.bytes * 1.5 ? "RE-DOWNLOADED" : "second hit was cached/free";
    console.log(`  ${k.n}x  ${kb(k.bytes).padStart(8)} each, ${kb(k.transfer).padStart(8)} transferred  ${note}  ${url.split("/").pop().split("?")[0]}`);
  }

  console.log("\nconsole errors:", page.__errors.length);
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
