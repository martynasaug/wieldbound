// WHY IS THE FOREST BLACK AT NIGHT — isolated by elimination rather than argued.
//
// `tour.mjs` photographed the road north at 03:22 and the frame is about 90%
// black. The obvious readings are both wrong on the evidence:
//
//   "night is tuned too dark"  — the phase table says first light is sun 0.34
//                                with a hemisphere fill of 0.5 and a blue-grey
//                                sky colour. Dim, nowhere near black.
//   "tone mapping crushes it"  — night exposure is 0.92-0.97, barely reduced.
//
// A shadow only blocks the DIRECTIONAL light; the hemisphere fill should
// survive it, and ground faces up so it takes the sky colour at 0.5. By that
// arithmetic shadowed ground should be a dark blue-grey, not black.
//
// So something is taking more light away than the configuration accounts for.
// This freezes the clock at night, stands in the place the tour photographed,
// and removes one suspect at a time. Whichever removal brings the picture back
// is the cause; if none of them does, the assumption behind all of this is
// wrong and that is worth knowing too.
//
//   node tools/soak/nightlight.mjs Player3619 ./shots

import { open, login, approach } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const OUT = process.argv[3] ?? ".";
// Deep enough to be unambiguously night, and the same phase band the tour hit.
const CLOCK = Number(process.argv[4] ?? 0.12);

// Where `tour.mjs` took the black frame.
const SPOT = { x: 8054, y: 2233 };

const me = (page) =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

/** Mean and 5th-percentile luminance of the frame, so "black" is a number.
 *  Read from a screenshot rather than the WebGL canvas, which would need
 *  `preserveDrawingBuffer` and would change what is being measured. */
const luma = async (page, path) => {
  const buf = await page.screenshot({ path, clip: { x: 0, y: 0, width: 1200, height: 620 } });
  // Decode the PNG in the page, where there is a decoder, and hand back stats.
  const b64 = buf.toString("base64");
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const lum = [];
    for (let i = 0; i < px.length; i += 4 * 7) {
      lum.push(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
    }
    lum.sort((a, b) => a - b);
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const near0 = lum.filter((v) => v < 12).length / lum.length;
    return {
      mean: +mean.toFixed(1),
      p50: +lum[Math.floor(lum.length * 0.5)].toFixed(1),
      p95: +lum[Math.floor(lum.length * 0.95)].toFixed(1),
      black: +(near0 * 100).toFixed(1),
    };
  }, b64);
};

const run = async () => {
  const { browser, page } = await open({ headless: false, width: 1200, height: 700 });
  await login(page, NAME);

  // Night, held still, so every variant below is the same moment.
  await page.evaluate((t) => window.__wieldbound.world.dayNight.freeze(t), CLOCK);
  await page.waitForTimeout(600);

  const until = Date.now() + 90000;
  let sign = 1;
  while (Date.now() < until) {
    const p = await me(page);
    if (Math.hypot(SPOT.x - p.x, SPOT.y - p.y) < 220) break;
    if ((await approach(page, SPOT, 650, sign)) < 25) sign = -sign;
  }
  const p = await me(page);
  // Re-freeze: the walk takes a minute of game time and `approach` does not
  // know about the clock.
  await page.evaluate((t) => window.__wieldbound.world.dayNight.freeze(t), CLOCK);
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => {
    const g = window.__wieldbound;
    const w = g.world;
    const r = w.renderer ?? w.__renderer;
    return {
      sun: +w.sun.intensity.toFixed(3),
      sunColor: "#" + w.sun.color.getHexString(),
      fill: +w.fill.intensity.toFixed(3),
      sky: "#" + w.fill.color.getHexString(),
      ground: "#" + w.fill.groundColor.getHexString(),
      exposure: +r.toneMappingExposure.toFixed(3),
      toneMapping: r.toneMapping,
      shadowMap: r.shadowMap.enabled,
      lit: (() => { let n = 0; w.scene.traverse((o) => { if (o.isLight && o.type === "PointLight" && o.intensity > 0) n++; }); return n; })(),
    };
  });
  console.log(`standing at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}), clock frozen at ${CLOCK}`);
  console.log("scene:", JSON.stringify(state));

  const rows = [];
  rows.push(["as it ships", await luma(page, `${OUT}/night-0-asis.png`)]);

  // 1. SHADOWS. At night the sun's elevation is floored at 0.16, so every
  //    shadow in the world is enormously long; in a forest they merge.
  await page.evaluate(() => {
    const w = window.__wieldbound.world;
    (w.renderer ?? w.__renderer).shadowMap.enabled = false;
    w.scene.traverse((o) => { if (o.isLight) o.castShadow = false; });
  });
  await page.waitForTimeout(700);
  rows.push(["shadows off", await luma(page, `${OUT}/night-1-noshadow.png`)]);
  await page.evaluate(() => {
    const w = window.__wieldbound.world;
    (w.renderer ?? w.__renderer).shadowMap.enabled = true;
    w.sun.castShadow = true;
  });
  await page.waitForTimeout(700);

  // 2. TONE MAPPING. ACES crushes the bottom of the range hard.
  await page.evaluate(() => {
    const w = window.__wieldbound.world;
    (w.renderer ?? w.__renderer).toneMapping = 0; // NoToneMapping
    w.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if (m) m.needsUpdate = true; });
  });
  await page.waitForTimeout(900);
  rows.push(["tone mapping off", await luma(page, `${OUT}/night-2-notone.png`)]);
  await page.evaluate(() => {
    const w = window.__wieldbound.world;
    (w.renderer ?? w.__renderer).toneMapping = 4;
    w.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) if (m) m.needsUpdate = true; });
  });
  await page.waitForTimeout(900);

  // 3. THE FILL, doubled. If the answer is simply "not enough ambient", this is
  //    the variant that fixes it and the other two do not.
  await page.evaluate(() => { window.__wieldbound.world.fill.intensity *= 2.5; });
  await page.waitForTimeout(700);
  rows.push(["fill x2.5", await luma(page, `${OUT}/night-3-fill.png`)]);

  console.log("\n  variant             mean   p50   p95   % near-black");
  for (const [name, s] of rows) {
    console.log(
      `  ${name.padEnd(18)} ${String(s.mean).padStart(5)} ${String(s.p50).padStart(5)} ` +
        `${String(s.p95).padStart(5)}   ${s.black}%`,
    );
  }
  console.log("\nconsole errors:", page.__errors.length);
  await browser.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
