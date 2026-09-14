// What bones does the player's rig actually have? Names only.
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Bone${Date.now() % 100000}`);
await page.waitForTimeout(2400);
const names = await page.evaluate(() => {
  const a = window.__wieldbound.localActor;
  let out = [];
  a.root.traverse((o) => { if (o.isSkinnedMesh && !out.length) out = o.skeleton.bones.map((b) => b.name); });
  return out;
});
console.log(names.join(" "));
await browser.close();
