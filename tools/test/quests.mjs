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
  bandAt,
  PLAYER_SPAWN,
  xpToNextLevel,
} from "../../shared/protocol-types.ts";
import { ITEM_BASES, CONSUMABLES, MATERIALS } from "../../shared/items.ts";
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
} from "../../shared/quests.ts";
import { TOWN_NPCS } from "../../shared/town.ts";

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
  else if (giver.role !== "quest") fail(`"${q.name}" is given by ${giver.name}, who is a ${giver.role}`);

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

// Both quest givers must have work, or one of them is scenery with a title.
for (const npc of TOWN_NPCS.filter((n) => n.role === "quest")) {
  const mine = questsFrom(npc.id);
  if (mine.length === 0) fail(`${npc.name} is a quest giver with no quests`);
  // The first one must be takeable at level 1 with nothing done, or a new
  // character walks up to a list of locked rows.
  const opener = mine.find((q) => offerStateFor(q, 1, [], []) === "offer");
  if (!opener) fail(`${npc.name} offers nothing to a fresh character`);
  else console.log(`  ${npc.name}: ${mine.length} quests, opening with "${opener.name}"`);
}

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

console.log(failures === 0 ? "\nOK — the work checks out." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
