import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Cn${Date.now() % 100000}`);
await page.waitForTimeout(2400);
const names = await page.evaluate(async () => {
  const a = window.__wieldbound.localActor;
  a.setAppearance({ layers: { cape: { style: "cape", rarity: "honed", palette: "steel" } } });
  await new Promise((r) => setTimeout(r, 1500));
  const out = [];
  a.root.traverse((o) => {
    if (o.isMesh && o.visible && /cape/i.test(o.name)) {
      out.push(`${o.name}  tris=${(o.geometry.attributes.position.count / 3) | 0}`);
    }
  });
  return out;
});
for (const n of names) console.log(n);
await browser.close();
