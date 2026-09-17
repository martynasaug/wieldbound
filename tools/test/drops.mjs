// Checks the two axes an item drop now has, and the rules that hang off them.
//
// Every failure here is silent in the game and obvious to a player, which is
// the worst combination a table can have:
//
//   A ceiling that does not hold is the whole design gone. If a common base can
//   reach Enchanted through a lucky roll, a boss floor, or enough reforges,
//   then finding things stops mattering and only grinding does — and nothing
//   throws, the item just quietly comes out better than it should have.
//
//   An off-hand with no trait is a slot back to being a stat stick. Fifteen
//   rows, each typed by hand, and a missing `trait:` looks exactly like a row
//   that has one.
//
//   A trait naming a status that does not exist is a rule that silently does
//   nothing: `applyStatus` returns false and combat carries on.
//
//   And a fabled item that is not actually rare, or a "rare" tier that is a
//   third of all drops, is the failure you cannot see at all without counting.
//   So the last section rolls the real drop table a hundred thousand times.
//
//   node tools/test/drops.mjs

import {
  MONSTER_STATS,
  RARITY_ORDER,
  STATUSES,
  statusFits,
  EMPTY_PASSIVES,
} from "../../shared/protocol-types.ts";
import {
  ITEM_BASES,
  SCARCITIES,
  TRAITS,
  atCeiling,
  maxRarityFor,
  nextRarityFor,
  rarityIndex,
  reforgeCost,
  rollBase,
  rollRarityFor,
  rollRarityForWithFloor,
  scarcityOf,
  traitOf,
} from "../../shared/items.ts";

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
}
function section(title) {
  console.log(`\n${title}`);
}

const bases = Object.values(ITEM_BASES);

// A deterministic stream, so a run that fails fails the same way twice.
//
// mulberry32 rather than the classic LCG, and not out of taste: `seed *
// 1103515245` leaves the 2^53 a double can hold on the first multiply, so the
// low bits are gone before the modulo and what comes out is near-uniform. A
// test that measures a WEIGHTED table through a generator like that measures
// the generator.
let seed = 0x9e3779b9;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- 1. the axis itself -----------------------------------------------------
section("1. scarcity");

const tiers = Object.keys(SCARCITIES);
check("there are three tiers", tiers.length === 3, `${tiers.length}`);
check("every tier's id matches its key", tiers.every((t) => SCARCITIES[t].id === t));
check("every tier has a ceiling on the ladder",
  tiers.every((t) => RARITY_ORDER.includes(SCARCITIES[t].ceiling)));
check("every tier has its own colour",
  new Set(tiers.map((t) => SCARCITIES[t].color)).size === 3);

// The tiers have to be ordered on BOTH axes or the second axis says nothing:
// a rarer tier that stopped lower would be strictly worse than a common one,
// and nobody would want to find it.
const byWeight = [...tiers].sort((a, b) => SCARCITIES[b].weight - SCARCITIES[a].weight);
check("rarer means a higher ceiling",
  byWeight.every((t, i) =>
    i === 0 ||
    rarityIndex(SCARCITIES[t].ceiling) > rarityIndex(SCARCITIES[byWeight[i - 1]].ceiling)),
  byWeight.map((t) => `${t}:${SCARCITIES[t].ceiling}`).join(" > "));
check("exactly one tier reaches the top of the ladder",
  tiers.filter((t) => SCARCITIES[t].ceiling === RARITY_ORDER[RARITY_ORDER.length - 1]).length === 1);

check("every base resolves to a tier",
  bases.every((b) => !!SCARCITIES[scarcityOf(b)]));

const fabled = bases.filter((b) => scarcityOf(b) === "fabled");
check("there are fabled items at all", fabled.length > 0);
// Fabled has to be a short list. The moment a fifth of the catalogue is fabled,
// "there are stories about this one" is a thing you own nine of.
check("fabled is a small slice of the catalogue",
  fabled.length / bases.length < 0.15,
  `${fabled.length}/${bases.length}`);

// --- 2. the ceiling holds, everywhere ---------------------------------------
section("2. the ceiling");

// The drop roll.
for (const base of bases) {
  const cap = maxRarityFor(base);
  let worst = null;
  for (let i = 0; i < 400; i++) {
    const got = rollRarityFor(base, rand);
    if (worst === null || rarityIndex(got) > rarityIndex(worst)) worst = got;
  }
  if (rarityIndex(worst) > rarityIndex(cap)) {
    check(`${base.id} never rolls past its ceiling`, false, `rolled ${worst}, cap ${cap}`);
  }
}
// The boss floor. This is the one that matters: a floor is a promise to raise a
// roll, and the ceiling has to be allowed to break that promise.
const top = RARITY_ORDER[RARITY_ORDER.length - 1];
for (const base of bases) {
  const cap = maxRarityFor(base);
  const got = rollRarityForWithFloor(base, top, rand);
  if (rarityIndex(got) > rarityIndex(cap)) {
    check(`${base.id} survives a floor at the top of the ladder`, false, `${got} > ${cap}`);
  }
}
// The forge. Walk each base all the way up and check where it stops.
for (const base of bases) {
  let at = RARITY_ORDER[0];
  let steps = 0;
  while (nextRarityFor(base, at) && steps < 20) {
    at = nextRarityFor(base, at);
    steps++;
  }
  check(`${base.id} reforges up to exactly its ceiling`, at === maxRarityFor(base),
    `stops at ${at}, cap ${maxRarityFor(base)}`);
  check(`${base.id} knows it is capped there`, atCeiling(base, at));
  check(`${base.id} costs nothing to reforge at its cap`, reforgeCost(base, at) === null);
}

// --- 3. every off-hand carries a rule ---------------------------------------
section("3. traits");

const offhands = bases.filter((b) => b.slot === "offhand");
check("there are fifteen off-hands", offhands.length === 15, `${offhands.length}`);
for (const b of offhands) {
  check(`${b.id} has a trait`, !!traitOf(b), b.trait ? `unknown trait "${b.trait}"` : "none set");
}
for (const b of fabled) {
  check(`fabled ${b.id} has a trait`, !!traitOf(b), b.trait ? `unknown trait "${b.trait}"` : "none set");
}

// A trait shared by two items is a trait that is not the reason to carry either.
const owners = {};
for (const b of bases) {
  if (!b.trait) continue;
  (owners[b.trait] ??= []).push(b.id);
}
for (const [id, list] of Object.entries(owners)) {
  check(`${id} belongs to exactly one item`, list.length === 1, list.join(", "));
}
check("every trait in the table is actually worn by something",
  Object.keys(TRAITS).every((id) => owners[id]),
  Object.keys(TRAITS).filter((id) => !owners[id]).join(", "));

for (const [id, t] of Object.entries(TRAITS)) {
  check(`${id}'s id matches its key`, t.id === id);
  check(`${id} says what it does`, typeof t.blurb === "string" && t.blurb.length > 10);

  // A trait that does nothing is the failure that looks implemented from every
  // screenshot, which is exactly the argument the schools test is written under.
  const triggers = [t.onHit, t.onCrit, t.onKill, t.onStruck].filter(Boolean);
  check(`${id} does something`, triggers.length > 0 || !!t.passive);

  // A status that does not exist means `applyStatus` returns false and combat
  // carries on as if the rule were not there.
  for (const trigger of triggers) {
    check(`${id} names a real status`, !!STATUSES[trigger.status], trigger.status);
  }
  for (const rolled of [t.onHit, t.onStruck].filter(Boolean)) {
    check(`${id}'s chance is a probability`, rolled.chance > 0 && rolled.chance <= 1, `${rolled.chance}`);
    // Above about a third it stops being a trait and becomes the item's damage
    // profile, which is the affixes' job.
    check(`${id}'s chance is a flavour, not a build`, rolled.chance <= 0.35, `${rolled.chance}`);
  }

  // Its passive half has to speak the one vocabulary, or it totals into nothing.
  for (const key of Object.keys(t.passive ?? {})) {
    check(`${id}'s passive uses a real bonus`, key in EMPTY_PASSIVES, key);
  }

  // A trait aimed at the wearer has to be applicable to a player, and one aimed
  // at what you hit has to be applicable to a monster. `applyStatus` checks
  // this at runtime by silently returning false, which is no help at all — the
  // rule would simply never fire, and nothing anywhere would say so.
  for (const [trigger, target] of [[t.onHit, "monster"], [t.onCrit, "monster"],
                                   [t.onKill, "player"], [t.onStruck, "player"]]) {
    if (!trigger || !STATUSES[trigger.status]) continue;
    check(`${id} puts ${trigger.status} on something that can hold it`,
      statusFits(trigger.status, target), `${trigger.status} is ${STATUSES[trigger.status].on}-only`);
  }
}

// --- 4. and it is actually rare ---------------------------------------------
section("4. what a hundred thousand kills look like");

// The table the server rolls, at the band a fabled item can appear in.
const bands = [...new Set(Object.values(MONSTER_STATS).map((m) => m.band))].sort();
for (const band of bands) {
  const counts = { common: 0, scarce: 0, fabled: 0 };
  const N = 100000;
  for (let i = 0; i < N; i++) counts[scarcityOf(rollBase(band, null, rand))]++;
  const pct = (n) => ((n / N) * 100).toFixed(2).padStart(5);
  console.log(
    `  band ${band}  common ${pct(counts.common)}%  scarce ${pct(counts.scarce)}%  fabled ${pct(counts.fabled)}%`,
  );
  // Not a fixed mix — it depends on what exists at that band, and the outer
  // rings genuinely have no plain kit in reach, which is the world being laid
  // out as bands rather than a fault. What must hold everywhere is that the
  // rarest tier is never the one you mostly get.
  check(`band ${band} is not mostly fabled`, counts.fabled / N < 0.5, pct(counts.fabled));
  check(`band ${band} drops something ordinary more often than something fabled`,
    counts.common + counts.scarce > counts.fabled);
  if (fabled.some((b) => b.band === band)) {
    check(`band ${band} can produce a fabled item`, counts.fabled > 0);
    check(`band ${band}'s fabled items stay rare`, counts.fabled / N < 0.05, pct(counts.fabled));
  }
}

// The first ring is where a player learns what a normal item looks like, so it
// has to be entirely normal items — a fabled sword out of the first slime you
// kill would make every drop after it a disappointment.
{
  const N = 20000;
  let plain = 0;
  for (let i = 0; i < N; i++) if (scarcityOf(rollBase(1, null, rand)) === "common") plain++;
  check("the first ring is all plain kit", plain === N, `${plain}/${N}`);
}

// What a drop actually comes out as, end to end, at the outermost band.
const outer = Math.max(...bands);
const quality = {};
for (let i = 0; i < 100000; i++) {
  const got = rollRarityFor(rollBase(outer, null, rand), rand);
  quality[got] = (quality[got] ?? 0) + 1;
}
console.log(
  "  band " + outer + " quality  " +
  RARITY_ORDER.map((r) => `${r} ${(((quality[r] ?? 0) / 100000) * 100).toFixed(2)}%`).join("  "),
);
check("the top of the ladder is something you almost never just find",
  (quality.enchanted ?? 0) / 100000 < 0.005,
  `${(((quality.enchanted ?? 0) / 100000) * 100).toFixed(3)}%`);

// --- done -------------------------------------------------------------------
console.log(
  failures === 0
    ? "\nOK — the ceiling holds, every off-hand has a rule, and fabled means fabled"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
