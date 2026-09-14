// WEAR THE GEAR AND ACTUALLY PLAY, AT THE GAME'S OWN CAMERA.
//
//   node tools/soak/wearplay.mjs [out]
//
// Asked for, and rightly: "try to actually play the game yourself with those
// items and see what's wrong for yourself."
//
// Every review sheet in this project photographs ONE piece, on a character
// standing still, from a camera placed to show that piece, with the animation
// frozen at a chosen frame. All three of those are lies about what a player
// sees. A player sees a WHOLE OUTFIT, in motion, from the game's own camera, at
// the distance the game actually puts it — and the things that go wrong there are
// different things: a helm that reads at 300 pixels and vanishes at 90, a cape
// that clips an elbow only while running, gear that is fine alone and fights the
// piece next to it.
//
// So this touches nothing about the camera. It equips a full set, walks, runs,
// swings at something and photographs what is on screen.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, step, nearestMonster } from "./driver.mjs";

const OUT = process.argv[2] ?? "tools/soak/shots/wearplay";
mkdirSync(OUT, { recursive: true });

// A full set, one of each slot, in palettes a player would actually see together.
const OUTFIT = {
  helm: { style: "full", rarity: "honed", palette: "steel" },
  armor: { style: "plate", rarity: "honed", palette: "steel" },
  boots: { style: "plated", rarity: "honed", palette: "steel" },
  cape: { style: "cape", rarity: "honed", palette: "crimson" },
};

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await login(page, `Wear${Date.now() % 100000}`);
await page.waitForTimeout(2500);

await page.evaluate((outfit) => {
  window.__wieldbound.localActor.setAppearance({ layers: outfit });
}, OUTFIT);
await page.waitForTimeout(1800);

const shot = async (name) => {
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  console.log(`  ${name}.png`);
};

console.log("standing in town, game camera untouched");
await shot("01-standing");

// WALKING AND RUNNING, because a cape and a skirt only exist in motion. The
// review sheets freeze the mixer at one frame precisely so pieces can be
// compared, which means no sheet in this project has ever shown cloth moving.
console.log("walking");
await step(page, ["KeyW"], 900);
await shot("02-walking");

console.log("running a longer way");
await step(page, ["KeyW"], 2200);
await shot("03-running");

console.log("turning, so the back comes round");
await step(page, ["KeyA"], 700);
await shot("04-turning");

// And from behind, which is where a third-person camera sits most of the time.
await step(page, ["KeyS"], 900);
await shot("05-backing-up");

const monster = await nearestMonster(page);
if (monster) {
  console.log(`fighting the nearest ${monster.kind ?? "monster"}`);
  await page.evaluate((m) => {
    const g = window.__wieldbound;
    g.moveTo?.(m.x, m.y);
  }, monster).catch(() => {});
  await step(page, ["KeyW"], 1500);
  await page.keyboard.press("Space").catch(() => {});
  await page.waitForTimeout(700);
  await shot("06-swinging");
  await page.waitForTimeout(900);
  await shot("07-swinging-2");
} else {
  console.log("no monster nearby; skipping the swing");
}

console.log(errors.length ? `page errors: ${errors.slice(0, 3).join(" | ")}` : "no page errors");
console.log(`shots in ${OUT}/`);
await browser.close();
