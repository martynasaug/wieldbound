// DOES EQUIPPING ONE ITEM DISTURB THE REST OF THE OUTFIT?
//
//   node tools/soak/reequip.mjs
//
// Reported: "why does when you equip an item your character refresh?" Because
// `applyAppearance` called `clearGear()` and rebuilt EVERY worn piece on any
// change, so swapping a ring stripped the armour, cape, boots and helm and
// re-fetched them — the character flashed bare and the pieces popped back one
// promise at a time.
//
// A screenshot cannot catch that: the flash is over in a few hundred
// milliseconds and lands between frames. Object IDENTITY can. Every worn mesh
// gets a `uuid` when it is built, so if a helm swap leaves the armour's meshes
// with the uuids they already had, the armour was never taken off. If they are
// new uuids, it was rebuilt — which is the refresh, whether or not it was
// visible on the frame you happened to grab.
import { open, login } from "./driver.mjs";

const FULL = {
  armor: { style: "chain", rarity: "honed", palette: "steel" },
  helm: { style: "cap", rarity: "honed", palette: "steel" },
  cape: { style: "cape", rarity: "honed", palette: "steel" },
  boots: { style: "tall", rarity: "honed", palette: "steel" },
};

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await login(page, `Req${Date.now() % 100000}`);
await page.waitForTimeout(2400);

const rows = await page.evaluate(async (full) => {
  const a = window.__wieldbound.localActor;
  const out = [];
  const settle = () => new Promise((r) => setTimeout(r, 1500));

  // What each slot's meshes are, by uuid, keyed off the gear key the actor
  // tags them with.
  const census = () => {
    const by = new Map();
    for (const o of [...(a.worn ?? []), ...(a.held ?? [])]) {
      if (!o) continue;
      const key = o.userData?.gearKey ?? "(untagged)";
      if (!by.has(key)) by.set(key, new Set());
      by.get(key).add(o.uuid);
    }
    return by;
  };

  a.setAppearance({ layers: { ...full } });
  await settle();
  await settle();
  const before = census();
  out.push(["dressed", [...before].map(([k, v]) => `${k}:${v.size}`).join(" ")].join(" | "));

  // Change ONE slot. Everything else must be untouched.
  a.setAppearance({ layers: { ...full, helm: { style: "full", rarity: "honed", palette: "steel" } } });
  await settle();
  await settle();
  const after = census();

  for (const [key, was] of before) {
    const now = after.get(key) ?? new Set();
    const kept = [...was].filter((u) => now.has(u)).length;
    out.push(`${key}|${was.size}|${now.size}|${kept}`);
  }
  return out;
}, FULL);

console.log(rows[0]);
console.log("");
console.log("slot        before  after   kept");
let bad = 0;
for (const row of rows.slice(1)) {
  const [key, was, now, kept] = row.split("|");
  // The helm is the slot that changed; it SHOULD be rebuilt. Everything else
  // must keep every mesh it had.
  const shouldKeep = key !== "helm";
  const ok = shouldKeep ? kept === was : true;
  if (!ok) bad++;
  console.log(`${key.padEnd(12)}${was.padStart(6)}${now.padStart(7)}${kept.padStart(7)}   ${shouldKeep ? (ok ? "ok" : "REBUILT — should not have been") : "(changed on purpose)"}`);
}
console.log(bad ? `\n${bad} slot(s) needlessly rebuilt` : "\nonly the slot that changed was rebuilt");
if (errors.length) console.log("ERRORS:", errors.slice(0, 3));
await browser.close();
process.exitCode = bad ? 1 : 0;
