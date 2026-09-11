import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 900, height: 620 });
await login(page, `Bones${Math.floor(Math.random()*100000)}`);
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const a = window.__wieldbound.localActor;
  const names = [];
  a.root.traverse((o) => { if (o.isBone) names.push(o.name); });
  return { count: names.length, names, socket: a.weaponSocket?.name ?? null };
});
console.log("socket:", out.socket, " bones:", out.count);
console.log(out.names.join("  "));
await browser.close();
