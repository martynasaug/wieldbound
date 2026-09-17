// TWO PEOPLE TALKING, WHICH THE GAME COULD NOT DO UNTIL NOW.
//
//   node tools/soak/chattalk.mjs
//
// Chat is the first player-to-player verb in this game, so there is no existing
// harness that can check it: everything else in here drives ONE client, and a
// message has to leave one and arrive at another to have happened at all.
//
// The four things that can be wrong, all of them silent:
//
//   1. The line never arrives. Both ends type-check and the protocol test
//      passes, because both of those are about shape rather than delivery.
//   2. It arrives at the WRONG people. `local` is a radius and `city` is a
//      settlement, and neither reports anything when it lets somebody hear a
//      conversation from the other side of the map.
//   3. THE KEYS STICK. This is the one this codebase has been bitten by before
//      — `Game.bindInput` opens with a typing guard because of it. A player who
//      presses Enter while walking must stop walking, and must be able to walk
//      again afterwards. Nothing throws either way.
//   4. The limits are only in the input box, where they are a suggestion to
//      whoever is running the page.
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login, approach } from "./driver.mjs";
import {
  CHAT_MAX_CHARS,
  CHAT_MIN_INTERVAL_MS,
  LOCAL_CHAT_RANGE_PX,
} from "../../shared/protocol-types.ts";

const OUT = "tools/soak/shots";
mkdirSync(OUT, { recursive: true });
const A = `Talk${Math.floor(Math.random() * 90000)}a`;
const B = `Talk${Math.floor(Math.random() * 90000)}b`;

const a = await open({ headless: true, width: 1280, height: 800 });
const b = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
a.page.on("pageerror", (e) => errors.push(`A: ${e}`));
b.page.on("pageerror", (e) => errors.push(`B: ${e}`));
await login(a.page, A);
await login(b.page, B);
await a.page.waitForTimeout(1600);
await b.page.waitForTimeout(1600);

const lines = (page) =>
  page.evaluate(() => [...document.querySelectorAll("#chat-log .chat-entry")].map((e) => e.textContent));

const posOf = (page) =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

const say = async (page, text) => {
  await page.evaluate((t) => {
    const el = document.getElementById("chat-input");
    el.focus();
    el.value = t;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }, text);
  // LONGER THAN THE RATE LIMIT. At 700ms this harness was sending its second
  // line inside CHAT_MIN_INTERVAL_MS, the server was correctly refusing it, and
  // the report blamed the city channel for a message the limiter had eaten.
  await page.waitForTimeout(CHAT_MIN_INTERVAL_MS + 350);
};

console.log(`${A} and ${B} are both in Emberhold\n`);

// --- 1. a line gets across ---------------------------------------------------
await say(a.page, "hello from A");
const heardB = await lines(b.page);
console.log(`1. local, standing together: B heard ${heardB.length} line(s)`);
for (const l of heardB) console.log(`     ${l}`);

// --- 2. and the speaker sees their own ---------------------------------------
const ownA = await lines(a.page);
console.log(`2. A sees their own line: ${ownA.some((l) => l.includes("hello from A")) ? "yes" : "!! NO"}`);

// --- 3. the bubble -----------------------------------------------------------
const bubble = await b.page.evaluate(() => {
  const el = document.querySelector("#chat-bubbles .bubble");
  return el ? { text: el.textContent, left: el.style.left, opacity: el.style.opacity } : null;
});
console.log(`3. bubble over A's head, as seen by B: ${bubble ? JSON.stringify(bubble) : "!! NONE"}`);
await b.page.waitForTimeout(400);
writeFileSync(`${OUT}/chat-bubble.png`, await b.page.screenshot());

// --- 4. THE KEYS. The one this codebase has been bitten by. -------------------
//
// Hold a walk key, open the box mid-stride, and check the character actually
// stops — then that they can walk again once the box is closed.
await a.page.keyboard.down("w");
await a.page.waitForTimeout(350);
await a.page.evaluate(() => document.getElementById("chat-input").focus());
const heldAt = await posOf(a.page);
await a.page.waitForTimeout(900);
const afterFocus = await posOf(a.page);
const drift = Math.hypot(afterFocus.x - heldAt.x, afterFocus.y - heldAt.y);
await a.page.keyboard.up("w");
console.log(`4. walked ${drift.toFixed(1)}px while typing with W held — ${drift < 12 ? "stopped" : "!! STILL WALKING"}`);

await a.page.evaluate(() => document.getElementById("chat-input").blur());
await a.page.waitForTimeout(150);
const before = await posOf(a.page);
await a.page.keyboard.down("w");
await a.page.waitForTimeout(700);
await a.page.keyboard.up("w");
const after = await posOf(a.page);
const moved = Math.hypot(after.x - before.x, after.y - before.y);
console.log(`5. walked ${moved.toFixed(1)}px after closing the box — ${moved > 20 ? "keyboard returned" : "!! STUCK"}`);

// --- 6. the limits are the server's -----------------------------------------
// Done while they are still standing together, so a failure here is about the
// limit rather than about who was in range.
const longLine = "x".repeat(CHAT_MAX_CHARS + 200);
const beforeLong = (await lines(b.page)).length;
await a.page.evaluate((t) => window.__wieldbound.socket.sendSay(t, "local"), longLine);
await a.page.waitForTimeout(700);
const heardLong = await lines(b.page);
const got = heardLong.length > beforeLong ? heardLong.at(-1) : "";
const body = got.slice(got.indexOf(":") + 2);
console.log(`6. sent ${longLine.length} chars straight down the socket; B received ${body.length}` +
  ` — ${body.length > 0 && body.length <= CHAT_MAX_CHARS ? "capped" : "!! NOT CAPPED"}`);

const beforeSpam = (await lines(b.page)).length;
await a.page.evaluate(() => {
  for (let i = 0; i < 5; i++) window.__wieldbound.socket.sendSay(`spam ${i}`, "local");
});
await a.page.waitForTimeout(900);
const landed = (await lines(b.page)).length - beforeSpam;
console.log(`7. five messages at once; ${landed} landed — ${landed <= 1 ? "rate limited" : "!! NOT LIMITED"}`);

// --- 8. range, with BOTH STILL INSIDE THE WALLS -------------------------------
//
// The first version of this walked B out of town to get past the local radius,
// which made the city test meaningless: B was no longer in the settlement, so
// city chat correctly did not reach them and the harness called a working rule
// a bug. Emberhold is 800px in radius, so two people on opposite sides of the
// square are ~1400px apart and both still indoors — which is exactly the case
// the two channels exist to tell apart.
const town = await a.page.evaluate(() => {
  const g = window.__wieldbound;
  return { x: g.playerX, y: g.playerY };
});
const placeAt = async (page, deg, radius) => {
  const rad = (deg * Math.PI) / 180;
  const to = { x: town.x + Math.cos(rad) * radius, y: town.y + Math.sin(rad) * radius };
  for (let i = 0; i < 60; i++) {
    const at = await posOf(page);
    if (Math.hypot(to.x - at.x, to.y - at.y) < 90) break;
    await approach(page, to, 320);
  }
};
await placeAt(a.page, 0, 660);
await placeAt(b.page, 180, 660);
const pa = await posOf(a.page);
const pb = await posOf(b.page);
const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y);
const inTown = await b.page.evaluate(() => !!document.querySelector("#minimap-place")?.textContent);

const beforeFar = (await lines(b.page)).length;
await say(a.page, "local should not carry");
const afterLocal = (await lines(b.page)).length;
await a.page.evaluate(() => document.getElementById("chat-channel").click());
await say(a.page, "city should carry");
const afterCity = (await lines(b.page)).length;
console.log(`8. ${Math.round(gap)}px apart, both inside the walls (local carries ${LOCAL_CHAT_RANGE_PX}px)`);
console.log(`     local reached B: ${afterLocal > beforeFar ? "!! YES, it should not" : "no"}`);
console.log(`     city reached B:  ${afterCity > afterLocal ? "yes" : "!! NO, it should"}`);

console.log(`\n  shot: ${OUT}/chat-bubble.png`);
if (errors.length) console.log("page errors:", errors.slice(0, 4));
await a.browser.close();
await b.browser.close();
