// Is the palisade actually in the camera's collider list?
import { open, login } from "./driver.mjs";
const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, process.argv[2] ?? "Player3619");
await new Promise((r) => setTimeout(r, 2500));
const r = await page.evaluate(() => {
  const g = window.__wieldbound;
  return {
    colliders: g.world.cameraColliders?.length ?? null,
    buildings: g.town.buildings?.length ?? null,
    hasPalisadeGroup: !!g.town.palisadeGroup,
    palisadeChildren: g.town.palisadeGroup?.children?.length ?? null,
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
