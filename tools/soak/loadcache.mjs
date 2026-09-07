// THE LOAD A RETURNING PLAYER ACTUALLY SEES.
//
// Every load measurement in this repository — the 28.6s that started the whole
// investigation, the 10.4s in M70.169, all of it — was taken through
// Playwright, which launches Chromium with a THROWAWAY PROFILE. Chromium keeps
// a GPU program cache on disk, so a throwaway profile means all 126 shader
// programs compile from scratch on every single run. Every number was a
// first-ever load on a fresh machine, and nothing said so.
//
// That matters because 6.5s of a 10.4s load is shader compilation (see the
// phase table in M70.169), and a player pays that once. Measured here:
//
//     cold 10.2s  ->  warm 6.5s, 5.9s
//
// The three warm phases fall from 6.4s to 3.0s. So "the load is dominated by
// shader compilation" is true, and "the load is 10s" is true only of the first
// visit. Both halves have to be said together or the conclusion is wrong.
//
// This runs the same load three times against ONE persistent profile, which is
// the only way to tell those two loads apart. Use it before drawing any
// conclusion about load time, and quote which of the two numbers you mean.

import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLIENT_URL } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const RUNS = Number(process.argv[3] ?? 3);

// The same flags `driver.mjs` uses, minus the headless concerns: this has to be
// headed, because SwiftShader has no real shader cache to warm and no
// KHR_parallel_shader_compile, so a headless run measures the wrong machine.
const ARGS = [
  "--use-gl=angle",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
];

const profile = mkdtempSync(join(tmpdir(), "wb-profile-"));

const once = async (label) => {
  // A NEW BROWSER EACH TIME, THE SAME PROFILE DIRECTORY. Reloading the page in
  // one browser would keep the in-memory program cache too, which is not what a
  // player gets — they close the tab and come back. Restarting the process and
  // keeping only the on-disk cache is the honest reproduction.
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: ARGS,
    viewport: { width: 1600, height: 900 },
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

  const t0 = Date.now();
  await page.goto(CLIENT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#name-input", { timeout: 30000 });
  await page.fill("#name-input", NAME);
  await page.click("#play-button");
  // The loading screen removing its own element, same gate as `driver.login`.
  await page.waitForFunction(
    () => {
      const g = window.__wieldbound;
      const root = document.getElementById("game-root");
      return (
        !!g && !!g.running && !!g.localActor && !!root &&
        getComputedStyle(root).display !== "none" && !document.getElementById("loading")
      );
    },
    { timeout: 180000 },
  );
  const ms = Date.now() - t0;
  const phases = await page.evaluate(() => window.__wieldbound.loadPhases ?? []);
  console.log(`\n${label}: ${(ms / 1000).toFixed(1)}s`);
  for (const p of phases) {
    console.log(`   ${p.ms.toFixed(0).padStart(6)}ms  +${String(p.added).padStart(3)} programs  ${p.name}`);
  }
  if (errors.length) console.log(`   page errors: ${errors.length} — ${errors[0]}`);
  await ctx.close();
  return { ms, phases };
};

const runs = [];
for (let i = 0; i < RUNS; i++) {
  runs.push(await once(i === 0 ? "run 1 (cold GPU program cache)" : `run ${i + 1} (same profile, cache warm)`));
}

const cold = runs[0].ms;
const warm = runs.slice(1);
const warmAvg = warm.length ? warm.reduce((a, r) => a + r.ms, 0) / warm.length : cold;
const warmPhases = (r) => r.phases.filter((p) => p.name.startsWith("warm")).reduce((a, p) => a + p.ms, 0);

console.log(`\n=== cold ${(cold / 1000).toFixed(1)}s  ->  warm ${(warmAvg / 1000).toFixed(1)}s ` +
  `(${(((cold - warmAvg) / cold) * 100).toFixed(0)}% of the first load is one-time shader compilation) ===`);
console.log(`    warm-up phases: ${(warmPhases(runs[0]) / 1000).toFixed(1)}s cold, ` +
  `${(warm.reduce((a, r) => a + warmPhases(r), 0) / (warm.length || 1) / 1000).toFixed(1)}s warm`);
console.log(`\nQuote the COLD number for a new player on a new machine, and the WARM one for`);
console.log(`everybody else. They are different questions and they have different answers.`);

try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* a locked profile directory is the OS's business, not a reason to fail */
}
