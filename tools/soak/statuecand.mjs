// Is the statue in the list the fade is allowed to draw from? That is the
// mechanical half of M70.243, and it is checkable without having to stand in
// exactly the right place — the fade itself is already proven for anything in
// the list (M70.141).
import { open, login, approach } from "./driver.mjs";
import { TOWN_CENTER } from "../../shared/town.ts";
const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, process.argv[2] ?? "Player3619");
await new Promise((r) => setTimeout(r, 3000));
// Into the square, so the candidate list is rebuilt near the statue.
for (let i = 0; i < 30; i++) await approach(page, { x: TOWN_CENTER.x, y: TOWN_CENTER.y + 120 }, 450);
await new Promise((r) => setTimeout(r, 800));
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__wieldbound;
  const statue = g.town.ornaments?.[0] ?? null;
  const cands = g.occluderCandidates ?? [];
  let warmed = 0;
  statue?.traverse((o) => { if (o.isMesh && o.material?.userData) warmed++; });
  return {
    ornaments: g.town.ornaments?.length ?? 0,
    candidates: cands.length,
    statueIsCandidate: !!statue && cands.includes(statue),
    statueMeshes: warmed,
  };
}), null, 1));
await browser.close();
