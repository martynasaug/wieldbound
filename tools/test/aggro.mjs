// Whether a monster fights the thing that is hurting it.
//
// The complaint was "attack them from long range and they don't attack you",
// and underneath it were two separate mistakes that happened to look like one.
//
//   * DAMAGE DID NOT AGGRO ITS OWN VICTIM. `addThreat` woke every PACKMATE of
//     the creature you hit and explicitly skipped the creature itself, so its
//     friends charged while the thing you were actually shooting stood still.
//     Aggro reached it only by walking inside its perception radius.
//   * AND THE FORGET RADIUS WAS THE PERCEPTION RADIUS. A monster gave up on
//     anyone further than AGGRO_RANGE_PX * 1.4 = 364px. How far something
//     NOTICES A STRANGER is a different question from how far it chases
//     someone who is shooting it, and one number was answering both.
//
// Needs a live server, because the second one is about what happens over
// several seconds of a real chase:
//
//     npm run dev:server
//     node tools/test/aggro.mjs
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import {
  SKILLS,
  AGGRO_RANGE_PX,
  MONSTER_FORGET_PX,
  MONSTER_LEASH_PX,
  ENGAGE_RANGE_PX,
  ATTACK_ORDER_LAPSE_MS,
} from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Puller" + Math.floor(Math.random() * 90000);
const problems = [];
const fail = (m) => problems.push(m);

// --- The forget radius has to clear every reach in the game ----------------
// A number smaller than a skill's range is a monster that drops the fight on
// the same tick a hit starts it, which is the bug stated arithmetically. The
// longbow talent is the case that matters: five ranks of +8% reach turn the
// longest skill in the game into something well past the old 364.
console.log("== nothing can be killed from where the target may not follow ==");
{
  const src = readFileSync(new URL("../../shared/protocol-types.ts", import.meta.url), "utf8");
  const longbow = src.match(/"longbow"[\s\S]{0,200}?rangePercent: (\d+)/);
  const perRank = longbow ? Number(longbow[1]) : 0;
  const ranks = Number(src.match(/"longbow"[^\n]*?, (\d+), "\+/)?.[1] ?? 5);
  const stretch = 1 + (perRank * ranks) / 100;
  if (perRank === 0) fail("could not read the longbow reach talent — the margin below is unverified");

  const longest = Object.values(SKILLS).reduce((a, s) => (s.rangePx > a.rangePx ? s : a));
  const reach = longest.rangePx * stretch;
  console.log(
    "  longest skill is " + longest.id + " at " + longest.rangePx + "px, " +
      Math.round(reach) + "px with " + ranks + " ranks of longbow (+" + perRank + "%/rank)",
  );
  if (MONSTER_FORGET_PX <= reach) {
    fail(
      "MONSTER_FORGET_PX is " + MONSTER_FORGET_PX + " and " + longest.id + " reaches " +
        Math.round(reach) + "px — a monster gives up on a player who is still hitting it",
    );
  } else {
    console.log("  forget radius " + MONSTER_FORGET_PX + "px clears it by " + Math.round(MONSTER_FORGET_PX - reach) + "px");
  }

  // And it must not be the perception radius. These are two questions and the
  // whole defect was one number answering both.
  if (MONSTER_FORGET_PX <= AGGRO_RANGE_PX * 1.4) {
    fail("forgetting (" + MONSTER_FORGET_PX + ") is no wider than noticing (" + AGGRO_RANGE_PX * 1.4 + ")");
  }
  // What actually bounds a chase is the leash from home, not this.
  if (MONSTER_LEASH_PX >= MONSTER_FORGET_PX) {
    fail(
      "leash " + MONSTER_LEASH_PX + " is not inside forget " + MONSTER_FORGET_PX +
        " — the leash is meant to be the binding limit on a chase",
    );
  } else {
    console.log("  and the leash (" + MONSTER_LEASH_PX + "px from home) is what actually bounds a chase");
  }
}

// --- The chase must not be given up at the perception radius -----------------
console.log("\n== the give-up test does not ask the perception radius ==");
{
  const src = readFileSync(new URL("../../server/src/index.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const chase = src.match(/if \(ai\.state === "chase"\) \{[\s\S]*?\n      \} else \{/);
  if (!chase) {
    fail("could not find the chase branch of the monster AI");
  } else {
    const body = chase[0];
    if (/AGGRO_RANGE_PX/.test(body)) {
      fail("the chase branch still measures against AGGRO_RANGE_PX — that is the perception radius");
    } else {
      console.log("  the chase branch measures against the forget radius, not the aggro radius");
    }
    if (!/MONSTER_FORGET_PX/.test(body)) fail("the chase branch does not use MONSTER_FORGET_PX at all");
  }
}

// --- Being hit is a reason to fight, for the thing that was hit -------------
console.log("\n== damage aggros its own victim, not only its friends ==");
{
  const src = readFileSync(new URL("../../server/src/index.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function addThreat("));
  const guard = fn.indexOf("alertedMonsters.has(");
  const wake = fn.search(/victim\.state = "chase"/);
  if (wake < 0) {
    fail("addThreat never puts the monster it was called for into chase");
  } else if (guard >= 0 && wake > guard) {
    // Everything past that guard runs once per monster, and a solitary
    // creature with no alertRadiusPx returns before reaching it.
    fail("addThreat wakes its victim BELOW the shout guard, so a lone monster never wakes at all");
  } else {
    console.log("  addThreat puts its victim into chase, above the once-per-monster shout guard");
  }
}

// --- And now over a real socket ---------------------------------------------
console.log("\n== and a monster that has been hit keeps coming ==");
const ws = new WebSocket("ws://localhost:8080");
const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let me = null;
let monsters = [];

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") me = msg.payload;
  if (msg.type === "STATE_SNAPSHOT") {
    monsters = msg.payload.monsters ?? monsters;
    if (me) {
      const self = msg.payload.players.find((p) => p.id === me.id);
      if (self) me = { ...me, x: self.x, y: self.y };
    }
  }
});

const gapTo = (m) => Math.hypot(m.x - me.x, m.y - me.y);
const walk = async (x, y, ticks = 1) => {
  for (let i = 0; i < ticks; i++) {
    send({ type: "MOVE", payload: { x, y } });
    await sleep(110);
  }
};

const done = () => {
  for (const p of problems) console.log("FAIL — " + p);
  console.log(problems.length === 0 ? "\nOK — being hit is a reason to fight." : "\n" + problems.length + " failure(s).");
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
};

ws.on("open", async () => {
  send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } });
  await sleep(1600);
  if (!me) { console.log("FAIL — no WELCOME"); process.exit(1); }

  // Shake off anything left standing from a previous run, the way throwers.mjs
  // learned to: a character logs in exactly where the last one left it.
  const start = { x: me.x, y: me.y };
  await walk(start.x + 800, start.y + 800, 45);
  await sleep(ATTACK_ORDER_LAPSE_MS + 600);
  send({ type: "SET_TARGET", payload: { targetId: null } });

  let target = null;
  for (const m of monsters) {
    if (m.status !== "alive") continue;
    if (!target || gapTo(m) < gapTo(target)) target = m;
  }
  if (!target) { console.log("FAIL — no monster in the snapshot"); process.exit(1); }
  const home = { x: target.x, y: target.y };
  console.log("  pulling a " + target.kind);

  // Walk in and land a hit, so this is a monster that has actually been hurt.
  for (let i = 0; i < 90; i++) {
    const m = monsters.find((x) => x.id === target.id);
    if (!m || m.status !== "alive") break;
    if (gapTo(m) <= ENGAGE_RANGE_PX * 0.8) break;
    await walk(m.x, m.y);
  }
  send({ type: "SET_TARGET", payload: { targetId: target.id } });
  send({ type: "USE_ATTACK", payload: {} });
  await sleep(1400);

  const hurt = monsters.find((x) => x.id === target.id);
  if (!hurt || hurt.status !== "alive") {
    console.log("  (target died on the pull — inconclusive, not a failure)");
    done();
    return;
  }

  // Retreat to a distance beyond the OLD give-up radius and inside the new
  // one, then hold still and watch. Under the old rule this monster turned
  // round and walked home.
  const HOLD = Math.round((AGGRO_RANGE_PX * 1.4 + MONSTER_FORGET_PX) / 2);
  const away = Math.atan2(me.y - home.y, me.x - home.x);
  const spot = { x: home.x + Math.cos(away) * HOLD, y: home.y + Math.sin(away) * HOLD };
  for (let i = 0; i < 70; i++) {
    await walk(spot.x, spot.y);
    if (Math.hypot(me.x - spot.x, me.y - spot.y) < 30) break;
  }
  console.log("  holding at " + Math.round(Math.hypot(me.x - home.x, me.y - home.y)) + "px from its post");

  // What to measure is CLOSING, not merely moving. The first version asked
  // whether the monster had left its post, and a monster that gives up still
  // leaves it — it follows during the retreat and only turns round once the
  // gap opens. Under the old rule that read as a pass at a closest approach of
  // 575px, which is the creature walking home. So: it has to actually arrive.
  let best = Infinity;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const m = monsters.find((x) => x.id === target.id);
    if (!m || m.status !== "alive") break;
    send({ type: "MOVE", payload: { x: spot.x, y: spot.y } });
    best = Math.min(best, gapTo(m));
    if (Math.hypot(m.x - home.x, m.y - home.y) >= MONSTER_LEASH_PX * 0.92) break;
  }
  const MUST_CLOSE_TO = Math.round(HOLD * 0.8);
  if (!(best < MUST_CLOSE_TO)) {
    fail(
      "a " + target.kind + " that had just been hit never got closer than " +
        Math.round(best) + "px while the attacker stood still at " + HOLD +
        "px — it forgot the fight it was in",
    );
  } else {
    console.log("  it came after us; closest approach " + Math.round(best) + "px");
  }
  done();
});
