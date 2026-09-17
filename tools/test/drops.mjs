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
  MONSTER_LABELS,
  MONSTER_STATS,
  RARITY_ORDER,
  STATUSES,
  statusFits,
  EMPTY_PASSIVES,
} from "../../shared/protocol-types.ts";
import {
  ITEM_BASES,
  MONSTER_LOOT,
  SCARCITIES,
  TRAITS,
  atCeiling,
  canForge,
  describeDropSources,
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
//
// ORDER IS DECLARED, NOT SORTED BY WEIGHT. `weight` is a share of the ORDINARY
// pool and fabled's is zero, because a fabled base never enters that pool — it
// comes off a keeper at its own fixed count. Sorting by the field put fabled
// between common and scarce and failed, which is the field telling the truth:
// the two numbers are not on one scale and must not be compared.
const ORDER = ["common", "scarce", "fabled"];
check("the declared order covers every tier",
  ORDER.length === tiers.length && ORDER.every((t) => !!SCARCITIES[t]));
check("rarer means a higher ceiling",
  ORDER.every((t, i) =>
    i === 0 ||
    rarityIndex(SCARCITIES[t].ceiling) > rarityIndex(SCARCITIES[ORDER[i - 1]].ceiling)),
  ORDER.map((t) => `${t}:${SCARCITIES[t].ceiling}`).join(" < "));
// And on the pool axis, over the tiers that actually use it.
const pooled = ORDER.filter((t) => SCARCITIES[t].weight > 0);
check("a rarer pooled tier is a smaller share of the pool",
  pooled.every((t, i) => i === 0 || SCARCITIES[t].weight < SCARCITIES[pooled[i - 1]].weight),
  pooled.map((t) => `${t}:${SCARCITIES[t].weight}`).join(" > "));
// The zero is the rule, not an oversight: it is what says "this tier is not in
// the ordinary pool at all".
check("fabled takes no share of the ordinary pool", SCARCITIES.fabled.weight === 0,
  `${SCARCITIES.fabled.weight}`);
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

// --- 4. every fabled item has a keeper ---------------------------------------
section("4. keepers");

const keeperOf = {};
for (const [kind, loot] of Object.entries(MONSTER_LOOT)) {
  for (const id of loot.keeps ?? []) (keeperOf[id] ??= []).push(kind);
}

// The rule the tier rests on. Without it a fabled base is a lottery ticket, and
// four of them were worse than that: frost and verdant are carried by nothing
// at band 4 or 5, so the game's own answer to "where do I find this" was "the
// far corners" and nothing else.
for (const b of fabled) {
  check(`${b.id} has a keeper`, (keeperOf[b.id] ?? []).length > 0);
}
// And the other way, which is the failure a rename causes: a keeps entry that
// names nothing is a creature keeping a ghost, and nothing throws.
for (const [kind, loot] of Object.entries(MONSTER_LOOT)) {
  for (const id of loot.keeps ?? []) {
    check(`${kind} keeps something real`, !!ITEM_BASES[id], id);
    check(`${kind} only keeps fabled things`, scarcityOf(ITEM_BASES[id] ?? {}) === "fabled", id);
  }
}
// ONLY BOSSES KEEP, and this is the rule the rate depends on rather than a
// matter of taste. A boss always drops; everything else drops one kill in
// eight. Let an ordinary creature keep something and the two multiply: the
// first cut of this had a dragon handing over something fabled every 18 kills
// and a ghost every 685, with three of each standing in the world.
for (const [kind, loot] of Object.entries(MONSTER_LOOT)) {
  if (!(loot.keeps ?? []).length) continue;
  check(`${kind} keeps things, so it had better always drop`,
    MONSTER_STATS[kind].guaranteedDrop === true);
}

// A keeper has to be within reach of the item it keeps, or it keeps it in a
// band `rollBase` never pools — which is a promise the tooltip makes and the
// roller cannot honour.
for (const [id, kinds] of Object.entries(keeperOf)) {
  for (const kind of kinds) {
    check(`the ${kind} can actually reach ${id}`,
      Math.abs(MONSTER_STATS[kind].band - ITEM_BASES[id].band) <= 1,
      `band ${MONSTER_STATS[kind].band} vs item band ${ITEM_BASES[id].band}`);
  }
}

// What a player is TOLD. The sentence has to be definite for a fabled base and
// has to name a creature, because "the far corners" is what it said before and
// that is not something anybody can act on.
for (const b of fabled) {
  const said = describeDropSources(b.id);
  check(`${b.id} says where it comes from`, /nothing else alive/.test(said), said);
}

// And it cannot be ordered at the anvil. The recipe gate is "salvage one to
// learn it", which for every other tier is a good loop and for this one undoes
// the tier: one lucky drop, taken apart, and the rarest item in the game
// becomes something you buy with wood and ore.
for (const b of fabled) {
  check(`${b.id} cannot be forged even knowing it`, !canForge(b, [b.id]).ok);
}
check("everything else still forges the way it did",
  bases.filter((b) => scarcityOf(b) !== "fabled").every((b) => canForge(b, [b.id]).ok));

// --- 5. and it is actually rare ---------------------------------------------
section("5. what a hundred thousand kills look like");

// The table the server rolls, at the band a fabled item can appear in.
// PER KIND, not per band, which is how the server calls it: a fabled base comes
// off a keeper, and `rollBase(band, null)` has no keeper to ask. Rolling it
// without a kind measured a table the game never uses.
const kinds = Object.keys(MONSTER_STATS);
for (const kind of kinds) {
  const band = MONSTER_STATS[kind].band;
  const counts = { common: 0, scarce: 0, fabled: 0 };
  const N = 100000;
  for (let i = 0; i < N; i++) counts[scarcityOf(rollBase(band, kind, rand))]++;
  const pct = (n) => ((n / N) * 100).toFixed(2).padStart(5);
  const keeps = (MONSTER_LOOT[kind].keeps ?? []).length;
  console.log(
    `  ${kind.padEnd(10)} band ${band}  common ${pct(counts.common)}%  scarce ${pct(counts.scarce)}%` +
    `  fabled ${pct(counts.fabled)}%  (keeps ${keeps})`,
  );
  // Not a fixed mix — it depends on what exists at that band, and the outer
  // rings genuinely have no plain kit in reach, which is the world being laid
  // out as bands rather than a fault. What must hold everywhere is that the
  // rarest tier is never the one you mostly get.
  check(`${kind} is not mostly fabled`, counts.fabled / N < 0.5, pct(counts.fabled));
  check(`${kind} drops something ordinary more often than something fabled`,
    counts.common + counts.scarce > counts.fabled);
  // A creature that keeps nothing must never produce a fabled item, which is
  // the rule the whole section exists to hold.
  if (keeps === 0) {
    check(`${kind} keeps nothing, so it drops nothing fabled`, counts.fabled === 0, pct(counts.fabled));
  } else {
    check(`${kind} can produce what it keeps`, counts.fabled > 0);
    check(`${kind}'s fabled drops stay rare`, counts.fabled / N < 0.06, pct(counts.fabled));
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

// What a drop actually comes out as, end to end, off the hardest thing in the
// world. Through a real kind, because that is the only way a fabled base can
// enter the pool at all now.
const outer = kinds.reduce((a, b) => (MONSTER_STATS[b].band > MONSTER_STATS[a].band ? b : a));
const quality = {};
for (let i = 0; i < 100000; i++) {
  const got = rollRarityFor(rollBase(MONSTER_STATS[outer].band, outer, rand), rand);
  quality[got] = (quality[got] ?? 0) + 1;
}
console.log(
  `  ${outer} quality  ` +
  RARITY_ORDER.map((r) => `${r} ${(((quality[r] ?? 0) / 100000) * 100).toFixed(2)}%`).join("  "),
);

// What it takes to get a NAMED one, which is the question the keeper system
// exists to give an answer to. Printed rather than asserted: the right number
// is a matter of taste, and an assertion here would only encode today's.
for (const kind of kinds.filter((k) => (MONSTER_LOOT[k].keeps ?? []).length)) {
  const band = MONSTER_STATS[kind].band;
  const N = 200000;
  const hits = {};
  for (let i = 0; i < N; i++) {
    const b = rollBase(band, kind, rand);
    if (scarcityOf(b) === "fabled") hits[b.id] = (hits[b.id] ?? 0) + 1;
  }
  const each = Object.entries(hits).sort((a, b) => b[1] - a[1]);
  const total = each.reduce((s, [, n]) => s + n, 0);
  // A boss always drops, so a roll IS a kill for these three.
  console.log(
    `  ${MONSTER_LABELS[kind]}: something fabled every ${Math.round(N / total)} kills; ` +
    `a named one every ${Math.round(N / (each[each.length - 1]?.[1] ?? 1))} at worst`,
  );
  check(`every one of the ${kind}'s keeps actually turns up`,
    each.length === (MONSTER_LOOT[kind].keeps ?? []).length,
    `${each.length} of ${(MONSTER_LOOT[kind].keeps ?? []).length} seen in ${N} rolls`);
}
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
