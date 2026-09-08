// USE EVERY SKILL IN THE GAME, ONCE, AND SEE WHAT THE SERVER SAYS.
//
// `weapons.mjs` played all eight families and only ever pressed the default
// attack. There are forty-three skills behind those trees and none of them had
// been fired by anything in this repository — so a skill that costs mana and
// does nothing, or throws, or reports `ok` and deals no damage, would sit there
// indefinitely.
//
// THE VERDICT COMES FROM THE SERVER, not from the combat log. Every `USE_SKILL`
// is answered by a `SKILL_RESULT` carrying `ok`, a `reason` when it refuses,
// and the per-target `hits` with their damage — which is the difference between
// "the skill did not fire" and "the skill fired and missed" and "the skill
// fired, hit, and dealt nothing". Parsing the log could not tell those apart,
// and `weapons.mjs` already proved that log parsing gets the verb wrong.
//
// Talents are PER WEAPON and so are their points, so each tree is reset and its
// actives learned in turn. A tier-4 node needs weapon level 15; anything still
// locked is reported as such rather than silently skipped.
//
//   node tools/soak/skills.mjs Fighter ./shots

import { open, login, approach, nearestMonster } from "./driver.mjs";
import { WEAPON_TREES, SKILLS, castMsFor } from "../../shared/protocol-types.ts";

const NAME = process.argv[2] ?? "Fighter";
const OUT = process.argv[3] ?? ".";
const ONLY = process.argv[4];

const ALL = ["sword", "axe", "mace", "dagger", "bow", "staff", "wand", "fist"];
const ORDER = ONLY ? ALL.filter((w) => ONLY.split(",").includes(w)) : ALL;

/** Records every SKILL_RESULT the server sends, before any page script runs. */
const TAP = () => {
  window.__skillResults = [];
  window.__castStates = [];
  const OrigWS = window.WebSocket;
  window.WebSocket = function (...args) {
    const ws = new OrigWS(...args);
    ws.addEventListener("message", (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === "SKILL_RESULT") window.__skillResults.push(m.payload);
        // CAST_STATE too, so an interrupted cast can be told apart from silence.
        // A cast cancelled by movement never produces a SKILL_RESULT at all.
        if (m.type === "CAST_STATE") window.__castStates.push({ t: Date.now(), ...m.payload });
      } catch {
        /* not JSON, not ours */
      }
    });
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;
  Object.assign(window.WebSocket, OrigWS);
};

const { browser, page } = await open({ headless: true, width: 1400, height: 800 });
await page.addInitScript(TAP);
await login(page, NAME);

const rows = [];
let shots = 0;

for (const family of ORDER) {
  // Equip it, wipe its tree, and buy every active it will sell us.
  const setup = await page.evaluate(async (fam) => {
    const g = window.__wieldbound;
    const held = g.items.find((i) => i.slot === "weapon" && i.equipped);
    if (fam === "fist") {
      if (held) g.socket.sendEquipItem(held.id);
    } else if (!held || held.weaponType !== fam) {
      const want = g.items.find((i) => i.slot === "weapon" && i.weaponType === fam && !i.equipped);
      if (!want) return { ok: false, why: `no ${fam} owned` };
      g.socket.sendEquipItem(want.id);
    }
    await new Promise((r) => setTimeout(r, 1000));
    g.socket.sendResetTalents(fam);
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, holding: g.appearance?.weaponType ?? "(none)", level: g.weaponProgress?.level ?? null };
  }, family);
  if (!setup.ok) {
    console.log(`${family}: ${setup.why}`);
    continue;
  }

  const actives = Object.values(WEAPON_TREES[family])
    .filter((n) => n.active)
    .map((n) => ({ node: n.id, skill: n.active, tier: n.tier }));

  // BUY THEM, AND BUY WHAT THEY NEED FIRST.
  //
  // `canLearnTalent` gates on three things: the weapon's level for the tier, a
  // `requires` prerequisite node, and points. The first version of this tried
  // each active once in tree order and quietly got four of the sword's six —
  // the ones needing a prerequisite failed, and a skill that was never learned
  // looked exactly like a skill that does not exist.
  //
  // So: work out what each active depends on, and keep passing over the list
  // until nothing new can be bought.
  const tree = Object.values(WEAPON_TREES[family]);
  const byId = Object.fromEntries(tree.map((n) => [n.id, n]));
  const needed = new Set();
  for (const a of actives) {
    let cur = byId[a.node];
    while (cur) {
      needed.add(cur.id);
      cur = cur.requires ? byId[cur.requires] : null;
    }
  }
  const learnedNodes = new Set();
  for (let pass = 0; pass < 4; pass++) {
    let progress = false;
    for (const nodeId of needed) {
      if (learnedNodes.has(nodeId)) continue;
      const before = await page.evaluate(() => JSON.stringify(window.__wieldbound.weaponProgress?.ranks ?? {}));
      await page.evaluate((n) => window.__wieldbound.socket.sendLearnTalent(n), nodeId);
      await page.waitForTimeout(220);
      const after = await page.evaluate(() => JSON.stringify(window.__wieldbound.weaponProgress?.ranks ?? {}));
      if (after !== before) {
        learnedNodes.add(nodeId);
        progress = true;
      }
    }
    if (!progress) break;
  }
  const learned = actives.filter((a) => learnedNodes.has(a.node));
  const locked = actives.filter((a) => !learnedNodes.has(a.node));
  if (locked.length) {
    console.log(
      `${family}: could not learn ${locked.map((a) => a.skill).join(", ")} ` +
        `(weapon level ${setup.level ?? "?"}; tier 4 needs 15)`,
    );
  }

  for (const a of learned) {
    const def = SKILLS[a.skill];
    // Get something in front of us. A skill with a radius still wants a target
    // nearby, and one with a range wants to be inside it.
    const want = Math.max(60, (def?.rangePx ?? 0) || (def?.radiusPx ?? 0) || 120);
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      const t = await nearestMonster(page);
      if (!t) break;
      if (t.d <= want) break;
      await approach(page, t, 500);
    }

    const before = await page.evaluate(() => window.__skillResults.length);
    const castsBefore = await page.evaluate(() => window.__castStates.length);
    await page.evaluate((s) => window.__wieldbound.socket.sendUseSkill(s), a.skill);
    // WAIT PAST THE CAST, and this is why the first run reported a protocol
    // violation that did not exist. A skill with a cast time starts casting,
    // sends CAST_STATE and returns; its SKILL_RESULT arrives when the cast
    // COMPLETES. `rainofarrows` casts for exactly 900ms and this waited exactly
    // 900ms — a dead-on race — so it alone came back with no answer at all,
    // against a protocol comment promising one for every use. Everything else
    // with a cast time finishes in 780ms or less and landed inside the window.
    await page.waitForTimeout(900 + castMsFor(def ?? {}));
    const res = await page.evaluate(
      (n) => window.__skillResults.slice(n),
      before,
    );
    const r = res.find((x) => x.skillId === a.skill) ?? null;
    const casts = await page.evaluate((n) => window.__castStates.slice(n), castsBefore);
    const interrupted = !r && casts.some((c) => c.reason);
    // Let the global cooldown clear before the next one, or every skill after
    // the first reports "not ready" and the pass measures the GCD rather than
    // the skills. Four did on the first run.
    await page.waitForTimeout(Math.max(0, r?.globalCooldownMs ?? 0) + 400);
    const hits = r?.hits ?? [];
    const damage = hits.reduce((sum, h) => sum + (h.damage ?? 0), 0);
    rows.push({
      family,
      skill: a.skill,
      kind: def?.kind ?? "?",
      answered: !!r,
      interrupted,
      ok: r?.ok ?? false,
      reason: r?.reason ?? "",
      targets: hits.length,
      landed: hits.filter((h) => h.hit).length,
      damage,
    });

    if (r?.ok && damage > 0 && shots < 4) {
      await page.screenshot({ path: `${OUT}/skill-${family}-${a.skill}.png` });
      shots++;
    }
  }
}

console.log(`\n${"weapon".padEnd(8)} ${"skill".padEnd(16)} ${"kind".padEnd(9)} ${"ok".padEnd(5)} ${"tgts".padStart(4)} ${"hit".padStart(4)} ${"dmg".padStart(6)}  reason`);
for (const r of rows) {
  console.log(
    `${r.family.padEnd(8)} ${r.skill.padEnd(16)} ${r.kind.padEnd(9)} ` +
      `${(r.answered ? (r.ok ? "yes" : "NO") : r.interrupted ? "cut" : "SILENT").padEnd(6)} ` +
      `${String(r.targets).padStart(4)} ${String(r.landed).padStart(4)} ${String(r.damage).padStart(6)}  ${r.reason}`,
  );
}

// What is worth a second look, stated rather than left in the table.
const silent = rows.filter((r) => !r.answered && !r.interrupted);
const cut = rows.filter((r) => r.interrupted);
const refused = rows.filter((r) => r.answered && !r.ok);
const empty = rows.filter((r) => r.ok && r.kind === "damage" && r.targets === 0);
// LANDED, not merely considered. `hits` is one entry per target the skill
// REACHED, each carrying its own `hit` flag — so `targets > 0 && damage === 0`
// is the ordinary case of a skill that rolled and missed, and reporting it as
// "hit something for zero" invented four bugs on the first pass. Only a blow
// that actually connected and did nothing is worth a second look.
const whiffed = rows.filter(
  (r) => r.ok && r.kind === "damage" && r.landed > 0 && r.damage === 0,
);
const missed = rows.filter(
  (r) => r.ok && r.kind === "damage" && r.targets > 0 && r.landed === 0,
);
console.log(`\n${rows.length} skills used.`);
if (silent.length) console.log(`  NO ANSWER AT ALL: ${silent.map((r) => r.skill).join(", ")}`);
if (cut.length) {
  console.log(
    `  cast interrupted, so no result was ever due: ${cut.map((r) => r.skill).join(", ")}`,
  );
}
if (refused.length) console.log(`  refused: ${refused.map((r) => `${r.skill} (${r.reason})`).join(", ")}`);
if (empty.length) console.log(`  fired at nothing: ${empty.map((r) => r.skill).join(", ")}`);
if (missed.length) console.log(`  rolled and missed (normal): ${missed.map((r) => r.skill).join(", ")}`);
if (whiffed.length) console.log(`  HIT SOMETHING FOR ZERO: ${whiffed.map((r) => r.skill).join(", ")}`);
console.log("console errors:", page.__errors.length);
for (const e of page.__errors.slice(0, 6)) console.log("  ", e);
await browser.close();
