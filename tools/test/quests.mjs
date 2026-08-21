// Checks Emberhold's work and Emberhold's shop. No server needed.
//
// Both are content tables that the server enforces and the client draws, and
// both fail silently in the same way: a quest naming a monster that does not
// exist is a counter that never moves, and a shop line naming a base id that
// was renamed is a button that takes your materials and hands back nothing.
// Neither throws, and neither is visible until somebody plays for twenty
// minutes and notices a number stuck at zero.
//
//   node tools/test/quests.mjs

import {
  MONSTER_STATS,
  MONSTER_LABELS,
  ELEMENTAL_SCHOOLS,
  SKILLS,
  SCHOOLS,
  resistOf,
  bandAt,
  PLAYER_SPAWN,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  AGGRO_RANGE_PX,
  xpToNextLevel,
} from "../../shared/protocol-types.ts";
import { ITEM_BASES, CONSUMABLES, MATERIALS, baseSchool } from "../../shared/items.ts";
import { SHOP_STOCK, SHOP_OUTPUT_RARITY } from "../../shared/shop.ts";
import { forgeCost } from "../../shared/items.ts";
import {
  QUESTS,
  questDef,
  questsFrom,
  objectiveLabel,
  offerStateFor,
  rewardLabel,
  lockReason,
  dominantSchoolOf,
} from "../../shared/quests.ts";
import { TOWN_NPCS, TOWN_RADIUS_PX } from "../../shared/town.ts";
import {
  LANDMARKS,
  LANDMARK_REACH_PX,
  LANDMARK_SPACING_PX,
  atLandmark,
  landmarkAt,
  landmarkBand,
  landmarkById,
  landmarkPosition,
} from "../../shared/landmarks.ts";
import { readFileSync } from "node:fs";

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  FAIL  ${msg}`);
};
const section = (name) => console.log(`\n== ${name} ==`);

// --- The shop ---------------------------------------------------------------

section("the shop");
const vendors = TOWN_NPCS.filter((n) => n.role === "vendor");
if (vendors.length === 0) fail("nothing in town sells anything");

const seen = new Set();
for (const entry of SHOP_STOCK) {
  if (seen.has(entry.id)) fail(`two shop lines share the id "${entry.id}"`);
  seen.add(entry.id);

  if (entry.kind === "item") {
    const base = ITEM_BASES[entry.ref];
    if (!base) {
      fail(`shop sells "${entry.ref}", which is not in the catalogue`);
      continue;
    }
    // Nothing past band 2. A vendor with good items in him replaces the world.
    if (base.band > 2) fail(`${base.name} is band ${base.band} — too good to sell`);

    // Buying must cost MORE than making, or the anvil is decoration. Compared
    // per material and in total, because a line that is cheaper in wood and
    // dearer in ore is still a line somebody will exploit.
    const forge = forgeCost(base);
    const forgeTotal = MATERIALS.reduce((n, m) => n + (forge[m] ?? 0), 0);
    const shopTotal = MATERIALS.reduce((n, m) => n + (entry.cost[m] ?? 0), 0);
    if (shopTotal <= forgeTotal) {
      fail(`${base.name} costs ${shopTotal} at the shop and ${forgeTotal} at the anvil`);
    }
    // And it must not want anything a beginner cannot have. Essence only comes
    // off kills, and refined stock only off the bench.
    if (entry.cost.essence || entry.cost.ingot || entry.cost.weave) {
      fail(`${base.name} is priced in something a new character cannot gather`);
    }
  } else {
    if (!CONSUMABLES[entry.ref]) fail(`shop sells "${entry.ref}", which is not a consumable`);
  }

  const total = MATERIALS.reduce((n, m) => n + (entry.cost[m] ?? 0), 0);
  if (total <= 0) fail(`${entry.id} is free`);
  if (!entry.pitch || entry.pitch.length < 12) fail(`${entry.id} has no pitch`);
}
if (!ITEM_BASES[SHOP_STOCK.find((e) => e.kind === "item")?.ref ?? ""]) {
  fail("the shop stocks no items at all");
}
console.log(`  ${SHOP_STOCK.length} lines, all real, all dearer than forging, output ${SHOP_OUTPUT_RARITY}`);

// A first weapon has to be reachable. This is the entire reason the shop
// exists — a character who cannot forge and cannot find one is stuck — so the
// cheapest weapon must be affordable inside a plausible first session.
const weapons = SHOP_STOCK.filter((e) => e.kind === "item" && ITEM_BASES[e.ref]?.slot === "weapon");
if (weapons.length === 0) fail("the shop sells no weapon");
const cheapest = Math.min(
  ...weapons.map((e) => MATERIALS.reduce((n, m) => n + (e.cost[m] ?? 0), 0)),
);
// Band-1 ground yields 2 per gather. Forty gathers is a long but real session.
if (cheapest > 2 * 40) fail(`the cheapest weapon is ${cheapest} materials — too far for a first session`);
console.log(`  cheapest weapon costs ${cheapest} materials (~${Math.ceil(cheapest / 2)} band-1 gathers)`);

// --- The quests -------------------------------------------------------------

section("the work");
const questIds = new Set();
for (const q of QUESTS) {
  if (questIds.has(q.id)) fail(`two quests share the id "${q.id}"`);
  questIds.add(q.id);

  const giver = TOWN_NPCS.find((n) => n.id === q.giver);
  if (!giver) fail(`"${q.name}" is given by "${q.giver}", who does not exist`);
  // This used to demand `role === "quest"`, which stopped being the right
  // question when the Herald was given work: `role` says what somebody IS and
  // the quest table says what they HAVE, and the client now reads the table.
  // What is still worth asserting is the one role that must never have work —
  // a `flavour` NPC is scenery with dialogue, and a quest hidden behind one is
  // a quest nobody is looking for.
  else if (giver.role === "flavour") {
    fail(`"${q.name}" is given by ${giver.name}, who is flavour and not somebody anybody asks for work`);
  }

  if (q.after && !questDef(q.after)) fail(`"${q.name}" follows "${q.after}", which does not exist`);
  if (q.after === q.id) fail(`"${q.name}" follows itself`);

  // The objective must be something the world can actually produce.
  const o = q.objective;
  if (o.count <= 0) fail(`"${q.name}" asks for ${o.count}`);
  if (o.kind === "kill") {
    if (!MONSTER_STATS[o.monster]) {
      fail(`"${q.name}" names the monster "${o.monster}", which does not exist`);
    } else if (MONSTER_STATS[o.monster].band > 3) {
      fail(`"${q.name}" sends a beginner at a band-${MONSTER_STATS[o.monster].band} monster`);
    }
  }
  if (o.kind === "gather" && !["wood", "ore", "herb"].includes(o.resource)) {
    fail(`"${q.name}" asks for "${o.resource}", which is not gatherable`);
  }
  if (o.kind === "slay") {
    if (!MONSTER_STATS[o.monster]) {
      fail(`"${q.name}" names the monster "${o.monster}", which does not exist`);
    }
    // Never physical. Physical is what a blow is when nothing has an opinion
    // about it, so a physical slay objective would be satisfied by accident by
    // most of the characters in the game and would teach nothing at all.
    if (!ELEMENTAL_SCHOOLS.includes(o.school)) {
      fail(`"${q.name}" asks for "${o.school}", which is not an element`);
    }
  }

  if (q.reward.xp <= 0) fail(`"${q.name}" pays no experience`);
  if (q.reward.consumable && !CONSUMABLES[q.reward.consumable.id]) {
    fail(`"${q.name}" pays in "${q.reward.consumable.id}", which is not a consumable`);
  }
  if (q.reward.materials?.essence) {
    // Essence only comes off kills, by design, and a quest reward is the exact
    // back door that would quietly stop being true.
    fail(`"${q.name}" pays essence, which is supposed to come only off kills`);
  }

  // Every line the interface will show has to be non-empty, because a missing
  // string here renders as a blank row rather than as an error.
  if (!q.brief || q.brief.length < 40) fail(`"${q.name}" has no brief`);
  if (!q.done || q.done.length < 10) fail(`"${q.name}" has nothing to say on hand-in`);
  if (!objectiveLabel(q.objective)) fail(`"${q.name}" has no objective label`);
  if (!rewardLabel(q.reward)) fail(`"${q.name}" has no reward label`);
}
console.log(`  ${QUESTS.length} quests, all well-formed`);

// Anybody the table says has work must be somebody standing in the town, and
// every one of them must have a way IN to their own line.
//
// The "way in" rule replaces a stricter one that said every giver's first
// quest has to be takeable at level 1. That was right while the only two
// givers were the watch and the inn, whose whole job is to catch a character
// who has just arrived, and it is wrong as a law: the Herald's line is
// deliberately not beginner work — it starts in band 2 and ends at a golem —
// and a new character walking up to her still gets six topics explaining the
// game, plus a locked row telling them what to come back for. What must be
// true of EVERY giver is that their opening quest is not chained behind
// somebody else's, which is the way a line actually gets stranded.
const givers = [...new Set(QUESTS.map((q) => q.giver))];
let anyOpensAtOne = false;
for (const id of givers) {
  const npc = TOWN_NPCS.find((n) => n.id === id);
  const mine = questsFrom(id);
  const unchained = mine.filter((q) => !q.after);
  if (unchained.length === 0) {
    fail(`${npc?.name ?? id} has ${mine.length} quests and every one of them is behind another`);
    continue;
  }
  const first = unchained.sort((a, b) => a.requiresLevel - b.requiresLevel)[0];
  if (offerStateFor(first, 1, [], []) === "offer") anyOpensAtOne = true;
  console.log(
    `  ${npc?.name ?? id}: ${mine.length} quests, opening with "${first.name}" (level ${first.requiresLevel})`,
  );
}
// And somebody has to be talking to a brand-new character, or the town has
// nothing at all for the person it was built for.
if (!anyOpensAtOne) fail("nobody in Emberhold offers a level-1 character any work");

// --- The chain resolves -----------------------------------------------------

section("the chain");
// Walking every quest in order, at a level high enough for all of them, must
// reach "done" for each — a prerequisite naming a quest from the OTHER giver,
// or a cycle, would strand one forever and nothing would say so.
{
  const completed = [];
  let guard = QUESTS.length * 3;
  let progressed = true;
  while (progressed && guard-- > 0) {
    progressed = false;
    for (const q of QUESTS) {
      if (completed.includes(q.id)) continue;
      if (offerStateFor(q, 60, [], completed) !== "offer") continue;
      completed.push(q.id);
      progressed = true;
    }
  }
  const stranded = QUESTS.filter((q) => !completed.includes(q.id));
  if (stranded.length > 0) {
    fail(`unreachable: ${stranded.map((q) => q.name).join(", ")}`);
  } else {
    console.log(`  all ${QUESTS.length} reachable in order`);
  }
}

// A level gate must never be ahead of what the quests before it can pay for,
// or the chain stalls on a number the player cannot see.
{
  let xp = 0;
  let level = 1;
  const completed = [];
  const order = [...QUESTS].sort((a, b) => a.requiresLevel - b.requiresLevel);
  for (const q of order) {
    const state = offerStateFor(q, level, [], completed);
    if (state === "locked") {
      fail(`"${q.name}" needs level ${q.requiresLevel} but the chain only reaches ${level}: ${lockReason(q, level, completed)}`);
      continue;
    }
    xp += q.reward.xp;
    while (xp >= xpToNextLevel(level)) {
      xp -= xpToNextLevel(level);
      level++;
    }
    completed.push(q.id);
  }
  console.log(`  quest rewards alone carry a character to level ${level}`);
}

// --- Where they send you ----------------------------------------------------

section("where they send you");
// Every kill quest must name something that exists in a band a player at that
// quest's own level requirement can plausibly fight. Band 1 at level 1.
for (const q of QUESTS) {
  if (q.objective.kind !== "kill") continue;
  const band = MONSTER_STATS[q.objective.monster]?.band ?? 9;
  if (band > q.requiresLevel + 1) {
    fail(`"${q.name}" sends a level-${q.requiresLevel} character at band ${band}`);
  }
  console.log(
    `  "${q.name}" — ${q.objective.count}× ${MONSTER_LABELS[q.objective.monster]} (band ${band}, from level ${q.requiresLevel})`,
  );
}
// Spawn is band 1, which is what makes "the first quest is next door" true.
if (bandAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y) !== 1) fail("spawn is not in band 1");

// --- What it folds to -------------------------------------------------------
// The `slay` objective is the only work in the game that names a TECHNIQUE, and
// every way it can be wrong is a way the game tells the player something untrue
// in its own voice — which is strictly worse than saying nothing, because the
// whole reason these quests exist is that the school system was too quiet.
//
// Four failures, none of which throws and none of which is visible from play
// until somebody spends an hour on a counter that will not move:
//
//   * A pair that is not a real vulnerability. "Burn the demon" is a quest that
//     can be finished and should never have been offered, and it is exactly
//     what a retune of one row of `MONSTER_STATS` produces silently.
//   * A school the player has no way to deal. Nature has exactly one weapon in
//     the whole catalogue and it is band 5, so this is a live risk rather than
//     a hypothetical one — the answer there is Poison Arrow, and if that skill
//     were ever moved or retyped the quest would become impossible.
//   * A brief that never names the element. The player cannot see the rule the
//     objective is enforcing, so "Wolves burned 0 / 4" after four dead wolves
//     reads as a bug in the game rather than as an instruction.
//   * An element with no work behind it. `protocol-types.ts` claims of the five
//     that each has "a monster that resists it, a monster that folds to it, a
//     way for a player to deal it and a way to defend against it". A sixth
//     element added without a quest would leave that sentence true and this
//     line's version of it false, and nothing would say so.

section("what it folds to");
{
  const slayers = QUESTS.filter((q) => q.objective.kind === "slay");
  if (slayers.length === 0) fail("nothing in the game points at the damage schools");

  // Every way a player can deal each element, read out of the real catalogue
  // and the real skill table rather than restated here.
  const dealtBy = {};
  for (const base of Object.values(ITEM_BASES)) {
    if (!base.weaponType) continue;
    (dealtBy[baseSchool(base)] ??= []).push(`${base.name} (band ${base.band})`);
  }
  for (const skill of Object.values(SKILLS)) {
    if (!skill.school) continue;
    (dealtBy[skill.school] ??= []).push(`${skill.name} (skill)`);
  }

  for (const q of slayers) {
    const o = q.objective;
    const stats = MONSTER_STATS[o.monster];
    if (!stats) continue;

    // The pair has to be a real weakness, and "real" means the number in the
    // table is negative. Zero is not good enough: a quest that sent somebody
    // at something with no opinion either way would be teaching that the
    // system does nothing.
    const resist = resistOf(stats.resist, o.school);
    if (resist >= 0) {
      fail(
        `"${q.name}" asks for ${o.school} against a ${MONSTER_LABELS[o.monster]}, ` +
          `which resists it by ${resist}% — the game would be teaching a lie`,
      );
    }

    // And there has to be a way to deal it at all.
    const ways = dealtBy[o.school] ?? [];
    if (ways.length === 0) {
      fail(`"${q.name}" asks for ${o.school}, which nothing in the game can deal`);
    }

    // The brief has to say the word. The objective label says it too, but the
    // brief is what somebody reads before they accept.
    //
    // A WHOLE WORD, and the boundaries are the whole check. The first version
    // was a bare substring and it passed a brief with the element deleted out
    // of it, because "a staff learns a firebolt" contains "fire" — so the
    // assertion was being satisfied by a spell name rather than by the
    // instruction it was written to enforce. Every element in this game is a
    // prefix of one of its own spells (firebolt, frostbolt, stormbolt), which
    // makes this the normal case and not a corner of one.
    if (!new RegExp(`\\b${SCHOOLS[o.school].name}\\b`, "i").test(q.brief)) {
      fail(`"${q.name}" never says "${SCHOOLS[o.school].name}" in its brief`);
    }

    // Same shape as the kill-quest gate, loosened by two. These deliberately
    // reach past band 3, which no other quest does, because the technique is
    // what makes a far creature tractable and a line that stopped at band 3
    // would never get to the one with lightning for a seam.
    if (stats.band > q.requiresLevel + 2) {
      fail(`"${q.name}" sends a level-${q.requiresLevel} character at band ${stats.band}`);
    }

    console.log(
      `  "${q.name}" — ${o.count}× ${MONSTER_LABELS[o.monster]} (band ${stats.band}) with ` +
        `${o.school} at ${resist}%, from level ${q.requiresLevel}; ${ways.length} way(s) to deal it`,
    );
  }

  // One per element, and exactly one. Two quests on the same element is a
  // repeated lesson taking a slot from an element that has none.
  for (const school of ELEMENTAL_SCHOOLS) {
    const on = slayers.filter((q) => q.objective.school === school);
    if (on.length === 0) fail(`no work anywhere in the game asks anybody to deal ${school}`);
    else if (on.length > 1) {
      fail(`${school} has ${on.length} quests (${on.map((q) => q.name).join(", ")}) — another element has none`);
    }
  }
  console.log(`  ${slayers.length} quests, one per element, every pair a real weakness`);

  // --- And the rule the counter actually turns on --------------------------
  // `dominantSchoolOf` is the whole of what a slay objective MEANS, and until
  // it was lifted out of the server it was the one part of this milestone that
  // nothing offline could reach — which is the same argument that moved the
  // height field out of `World.ts` a phase ago. What it has to get right is
  // less about arithmetic than about which of three defensible answers it is
  // giving, so the cases below are written as scenarios rather than as sums.

  // Fighting as an element: an Ember Wand does nothing but fire.
  if (dominantSchoolOf({ fire: 240 }) !== "fire") fail("a fight that was all fire is not fire");

  // Garnishing a fight with one: a sword fight with a single firebolt in it is
  // a physical kill, and this is the case the whole rule exists to refuse.
  if (dominantSchoolOf({ physical: 300, fire: 40 }) !== "physical") {
    fail("one firebolt inside a sword fight counts as burning it");
  }

  // A burn that did the work: Immolate lands small and ticks for most of it,
  // so a fire build has to be able to win on the ticks alone.
  if (dominantSchoolOf({ physical: 90, fire: 130 }) !== "fire") {
    fail("a fight won on burn ticks does not count as fire");
  }

  // Only a debuff, and no damage at all. "Nothing" rather than a default.
  if (dominantSchoolOf({}) !== null) fail("a player who dealt no damage killed it with something");

  // Zero entries are not a school. A recorded-but-empty row must not win.
  if (dominantSchoolOf({ frost: 0, nature: 0 }) !== null) fail("zero damage counts as a school");

  // A Map is what the server actually holds, and both shapes must agree.
  const asMap = new Map([["lightning", 500], ["physical", 120]]);
  if (dominantSchoolOf(asMap) !== "lightning") fail("the Map form disagrees with the record form");

  // Deterministic on a tie, whichever way it falls.
  if (dominantSchoolOf({ fire: 50, frost: 50 }) !== dominantSchoolOf({ frost: 50, fire: 50 })) {
    fail("a tie resolves differently depending on insertion order");
  }
  console.log("  \"most of your damage\" holds: a garnish is not a technique, a burn's ticks are");
}

// --- The waystones ----------------------------------------------------------
// Four standing stones in open country, and every way they can be wrong is
// silent in exactly the way a misplaced town prop was:
//
//   * One inside a monster camp is a landmark you cannot stand at without a
//     fight you were never asked to have — and a `reach` quest that is really a
//     kill quest is a quest whose level gate is a lie.
//   * One on top of an ore node is a landmark that eats a resource, and a node
//     drawn inside a five-metre slab.
//   * Two close together are two quests one walk finishes.
//   * One outside the world is a quest that cannot be completed at all.
//
// None of them throws. All of them are one bearing away.

section("the waystones");
{
  const src = readFileSync(new URL("../../server/src/index.ts", import.meta.url), "utf8");
  const at = (r, a) => ({
    x: PLAYER_SPAWN.x + Math.cos((a * Math.PI) / 180) * r,
    y: PLAYER_SPAWN.y + Math.sin((a * Math.PI) / 180) * r,
  });

  // Read the real camp and node tables out of the server rather than restating
  // them. A copy here would agree on the day it was written and quietly stop
  // agreeing the first time a camp moved — which is the whole failure this is
  // meant to catch.
  const camps = [
    ...src.matchAll(/ringPack\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)/g),
  ].map((m) => ({ id: m[1], ...at(+m[3], +m[4]) }));
  const nodes = [];
  for (const m of src.matchAll(
    /ringNodes\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?\d+)/g,
  )) {
    const [, prefix, , radius, count, start] = m;
    for (let i = 0; i < +count; i++) {
      nodes.push({ id: `${prefix}-${i + 1}`, ...at(+radius, +start + (360 / +count) * i) });
    }
  }
  if (camps.length === 0 || nodes.length === 0) fail("could not read the camps or nodes");

  // A pack reaches this far in from its own centre — the same number the town
  // test uses for "nothing spawns inside the walls".
  const PACK_REACH_PX = 70;
  // Comfortably outside aggro, so arriving is not automatically a fight.
  const CAMP_CLEARANCE_PX = AGGRO_RANGE_PX;
  // Far enough that a node is not standing in the stone.
  const NODE_CLEARANCE_PX = 140;

  for (const l of LANDMARKS) {
    const p = landmarkPosition(l);

    if (l.radiusPx <= TOWN_RADIUS_PX) {
      fail(`"${l.name}" stands inside Emberhold — the whole point is that it is out there`);
    }
    // The world is wider than it is tall, so the short axis is the real bound.
    if (
      Math.abs(p.x - PLAYER_SPAWN.x) > WORLD_WIDTH / 2 - 200 ||
      Math.abs(p.y - PLAYER_SPAWN.y) > WORLD_HEIGHT / 2 - 200
    ) {
      fail(`"${l.name}" is outside the world, or close enough to its edge to be unreachable`);
    }

    let worstCamp = Infinity;
    let campId = "";
    for (const c of camps) {
      const d = Math.hypot(c.x - p.x, c.y - p.y) - PACK_REACH_PX;
      if (d < worstCamp) {
        worstCamp = d;
        campId = c.id;
      }
    }
    if (worstCamp < CAMP_CLEARANCE_PX) {
      fail(
        `"${l.name}" stands ${worstCamp.toFixed(0)}px from the "${campId}" pack — ` +
          `inside its aggro, so reaching it is a fight nobody asked for`,
      );
    }

    let worstNode = Infinity;
    let nodeId = "";
    for (const n of nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < worstNode) {
        worstNode = d;
        nodeId = n.id;
      }
    }
    if (worstNode < NODE_CLEARANCE_PX) {
      fail(`"${l.name}" stands ${worstNode.toFixed(0)}px from node "${nodeId}"`);
    }

    if (!l.blurb || l.blurb.length < 40) fail(`"${l.name}" has no blurb`);
    // Standing at it has to satisfy the check, and standing well short must not.
    if (!atLandmark(l, p.x, p.y)) fail(`"${l.name}" does not register when you stand on it`);
    if (atLandmark(l, p.x + LANDMARK_REACH_PX * 2, p.y)) {
      fail(`"${l.name}" registers from twice its own reach away`);
    }

    console.log(
      `  ${l.name}: band ${landmarkBand(l)}, ${l.radiusPx}px out on bearing ${l.angleDeg} — ` +
        `nearest camp ${worstCamp.toFixed(0)}px, nearest node ${worstNode.toFixed(0)}px`,
    );
  }

  // No two close enough that one walk finishes both.
  for (let i = 0; i < LANDMARKS.length; i++) {
    for (let j = i + 1; j < LANDMARKS.length; j++) {
      const a = landmarkPosition(LANDMARKS[i]);
      const b = landmarkPosition(LANDMARKS[j]);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < LANDMARK_SPACING_PX) {
        fail(`${LANDMARKS[i].name} and ${LANDMARKS[j].name} are ${d.toFixed(0)}px apart`);
      }
    }
  }

  // `landmarkAt` has to be unambiguous, which is the property the spacing rule
  // exists to guarantee — assert the consequence rather than trusting it.
  for (const l of LANDMARKS) {
    const p = landmarkPosition(l);
    const found = landmarkAt(p.x, p.y);
    if (found?.id !== l.id) {
      fail(`standing at "${l.name}" resolves to "${found?.id ?? "nothing"}"`);
    }
  }
  if (landmarkAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y)) fail("spawn counts as standing at a waystone");

  // Every `reach` quest must name a real one, and its level gate must follow
  // the band the stone is ACTUALLY in — the walk is the difficulty, so a gate
  // typed independently of the radius is two numbers that agree until one moves.
  for (const q of QUESTS) {
    if (q.objective.kind !== "reach") continue;
    const mark = landmarkById(q.objective.landmark);
    if (!mark) {
      fail(`"${q.name}" sends you to "${q.objective.landmark}", which does not exist`);
      continue;
    }
    if (q.objective.count !== 1) {
      fail(`"${q.name}" asks you to reach a place ${q.objective.count} times`);
    }
    const band = landmarkBand(mark);
    // Roughly the kill-quest rule, loosened by one because walking past a camp
    // is a choice and standing in one is not.
    if (band > q.requiresLevel + 2) {
      fail(
        `"${q.name}" sends a level-${q.requiresLevel} character to band ${band} — ` +
          `too far for the gate it is behind`,
      );
    }
    if (!/stone/i.test(q.brief)) {
      fail(`"${q.name}" never mentions a stone, so nobody knows what they are looking for`);
    }
    console.log(`  "${q.name}" — ${mark.name}, band ${band}, from level ${q.requiresLevel}`);
  }

  // And every stone must be somewhere somebody is sent, or it is scenery with a
  // name and a nameplate that nothing in the game ever refers to.
  const targeted = new Set(
    QUESTS.filter((q) => q.objective.kind === "reach").map((q) => q.objective.landmark),
  );
  for (const l of LANDMARKS) {
    if (!targeted.has(l.id)) fail(`nothing ever sends anybody to "${l.name}"`);
  }
}

console.log(failures === 0 ? "\nOK — the work checks out." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
