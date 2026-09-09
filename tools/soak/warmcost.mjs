// WHAT EACH DEMAND WARM COSTS, NAMED.
//
// A total tells you the warm is expensive; it does not tell you which object
// is expensive, and those need different answers. This reads the per-object
// log `World.warmHiddenChunked` leaves on the page.
//
// It is how the two worst offenders were found: `flames:town` at 854ms and
// `flames:road` at 380ms, three programs each against a ~50ms-per-program
// average — custom fire shaders, and the reason those two are warmed under
// the loading screen rather than behind it.
//
//   node tools/soak/warmcost.mjs
process.env.WB_CLIENT_URL = "http://localhost:5173/?deferwarm=1";
const { open, login } = await import("./driver.mjs");
const { browser, page } = await open({ headless: false, width: 1200, height: 700 });
await page.bringToFront();
const ms = await login(page, "Player3619");
await page.waitForTimeout(12000);
const r = await page.evaluate(() => window.__wieldboundWarmSlow ?? []);
console.log(`load ${(ms / 1000).toFixed(1)}s; hidden-object warms costing over one frame:`);
for (const x of r) console.log(`   ${String(x.ms).padStart(5)}ms  +${x.programs} programs  ${x.meshes} meshes  ${x.name}`);
console.log(r.length ? "" : "  (none)");
await browser.close();
