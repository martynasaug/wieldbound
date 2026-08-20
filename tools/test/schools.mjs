// Checks that damage having a school means something, and that it can never
// mean too much.
//
// Almost every failure here is silent, which is why this is a test rather than
// a matter of care:
//
//   A resistance past the cap is an IMMUNITY, and an immunity contradicts the
//   premise the whole game is built on — you may pick up anything and go
//   anywhere. Nothing throws when a hand-typed row says 95.
//
//   An element with nothing that deals it, or nothing that resists it, is a
//   word in a tooltip. `lightning` was exactly that for the entire life of the
//   project: an effect row and a spell, and no creature in the world with an
//   opinion about it.
//
//   A weapon whose school does not match its material is Frostbrand dealing
//   physical, which reads as a bug in the item and is a bug in a table two
//   files away.
//
//   And a school that changes nothing is the worst outcome of all — it looks
//   implemented from every screenshot. So the last section actually ROLLS
//   damage through the real resolver and checks the numbers move.
//
//   node tools/test/schools.mjs

import {
  DAMAGE_SCHOOLS,
  ELEMENTAL_SCHOOLS,
  MAX_RESIST,
  MONSTER_LABELS,
  MONSTER_STATS,
  RESIST_KEY,
  SCHOOLS,
  SKILLS,
  WEAPON_TYPES,
  applyResist,
  passiveResist,
  resistOf,
  resolveHit,
  schoolDef,
  EMPTY_PASSIVES,
  addPassives,
} from "../../shared/protocol-types.ts";
import {
  AFFIXES,
  ITEM_BASES,
  PALETTE_SCHOOL,
  PALETTE_SETS,
  affixBonus,
  baseSchool,
  describeResists,
  itemBase,
  weaponSchool,
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
const kinds = Object.keys(MONSTER_STATS);

// A deterministic stream, so a run that fails fails the same way twice.
let seed = 7;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

// --- 1. the vocabulary ------------------------------------------------------
section("1. the schools");
check("physical is one of them", DAMAGE_SCHOOLS.includes("physical"));
check("and is not one of the elements", !ELEMENTAL_SCHOOLS.includes("physical"));
check("every school has a definition", DAMAGE_SCHOOLS.every((s) => !!SCHOOLS[s]));
check("every school has its own colour",
  new Set(DAMAGE_SCHOOLS.map((s) => SCHOOLS[s].color)).size === DAMAGE_SCHOOLS.length);
check("every school has its own verb",
  new Set(DAMAGE_SCHOOLS.map((s) => SCHOOLS[s].verb)).size === DAMAGE_SCHOOLS.length);
// Armour is the physical answer and has been since Phase 14. A second stat
// doing that job is how a number becomes impossible to tune.
check("there is no such thing as physical resistance",
  passiveResist({ resistFire: 40 }, "physical") === 0);
check("every element has a passive key", ELEMENTAL_SCHOOLS.every((s) => !!RESIST_KEY[s]));
check("and each key is its own", new Set(Object.values(RESIST_KEY)).size === ELEMENTAL_SCHOOLS.length);
check("every resist key exists in the passive vocabulary",
  Object.values(RESIST_KEY).every((k) => k in EMPTY_PASSIVES));
console.log(`  ${DAMAGE_SCHOOLS.length} schools: ${DAMAGE_SCHOOLS.join(", ")}`);

// --- 2. never immunity ------------------------------------------------------
// The one rule this system has to obey. A resistance may make a choice better
// or worse and must never make one unplayable, because the premise of the game
// is that you may pick up any weapon and walk in any direction.
section("2. never immunity");
for (const kind of kinds) {
  const profile = MONSTER_STATS[kind].resist;
  if (!profile) continue;
  for (const [school, raw] of Object.entries(profile)) {
    check(`${kind}'s ${school} is inside the cap`, Math.abs(raw) <= MAX_RESIST, `${raw}`);
    check(`${kind}'s ${school} names a real school`, DAMAGE_SCHOOLS.includes(school));
  }
}
// Clamped on READ as well as authored inside the cap, so no future hand-typed
// row can author an immunity even by accident.
check("a rogue 95 is clamped on read", resistOf({ fire: 95 }, "fire") === MAX_RESIST);
check("and a rogue -95 is too", resistOf({ fire: -95 }, "fire") === -MAX_RESIST);
check("the worst case still lets damage through", applyResist(100, MAX_RESIST) > 0);
// The floor of 1 is what makes "slowly" rather than "never" true at every
// magnitude, including a one-damage chip against the most resistant thing.
check("even a 1-damage hit lands for something", applyResist(1, MAX_RESIST) >= 1);

// Player resistance is clamped by the same rule, and it stacks from three
// sources that know nothing about each other — so the cap has to hold on the
// TOTAL rather than per source.
{
  const stacked = { ...EMPTY_PASSIVES };
  addPassives(stacked, { resistFire: 40 });
  addPassives(stacked, { resistFire: 40 });
  check("stacked player resistance is capped too",
    passiveResist(stacked, "fire") === MAX_RESIST, `${passiveResist(stacked, "fire")}`);
}

// --- 3. every element earns its place ---------------------------------------
// An element with no way to deal it, nothing that resists it and nothing weak
// to it is a word in a tooltip. This is the check `lightning` would have failed
// for the entire life of the project.
section("3. every element earns its place");
for (const school of DAMAGE_SCHOOLS) {
  const skills = Object.values(SKILLS).filter((s) => (s.school ?? "physical") === school);
  const weapons = bases.filter((b) => b.weaponType && baseSchool(b) === school);
  const resistant = kinds.filter((k) => resistOf(MONSTER_STATS[k].resist, school) > 0);
  const weak = kinds.filter((k) => resistOf(MONSTER_STATS[k].resist, school) < 0);

  check(`something deals ${school}`, skills.length + weapons.length > 0);
  check(`something resists ${school}`, resistant.length > 0);
  check(`something is weak to ${school}`, weak.length > 0,
    "an element nothing folds to is an element nobody has a reason to bring");
  console.log(
    `  ${school.padEnd(9)} ${String(weapons.length).padStart(2)} weapons, ` +
      `${String(skills.length)} skills · resisted by ${resistant.length}, weak: ${weak.join(", ") || "nothing"}`,
  );
}

// A player must be able to DEFEND against every element too, or the monsters
// that deal one are a stat check rather than a decision.
for (const school of ELEMENTAL_SCHOOLS) {
  const key = RESIST_KEY[school];
  const fromAffix = AFFIXES.some((a) => (a.per[key] ?? 0) > 0);
  const fromSet = Object.values(PALETTE_SETS).some((s) =>
    s.tiers.some((t) => (t.bonus[key] ?? 0) > 0),
  );
  check(`${school} can be resisted by something a player can wear`, fromAffix || fromSet,
    `affix ${fromAffix}, set ${fromSet}`);
}

// --- 4. what a weapon is made of --------------------------------------------
// Two sources and a fixed precedence: the family sets the floor, the material
// overrides it. Getting that backwards makes every staff physical, which is
// invisible until a player takes one to a golem.
section("4. what a weapon deals");
{
  const counts = new Map();
  for (const base of bases) {
    if (!base.weaponType) continue;
    const school = baseSchool(base);
    counts.set(school, (counts.get(school) ?? 0) + 1);
    const material = PALETTE_SCHOOL[base.art.palette];
    if (material) {
      check(`${base.id} deals what it is made of`, school === material,
        `${base.art.palette} palette, ${school} damage`);
    }
  }
  // The named ones, spelled out. These are the whole reason this exists: an
  // item called Frostbrand that deals physical reads as a bug in the item.
  for (const [id, expected] of [
    ["frostbrand", "frost"],
    ["starcaller", "frost"],
    ["emberwand", "fire"],
    ["ruinstring", "fire"],
    ["venomkiss", "nature"],
    ["arcwand", "arcane"],
    ["runewood", "arcane"],
    ["armingsword", "physical"],
    ["warhammer", "physical"],
    // A staff of plain wood is still arcane: the family is the floor, and a
    // mage's plain attack has never been a blow.
    ["apprenticestaff", "arcane"],
    ["birchrod", "arcane"],
  ]) {
    check(`${ITEM_BASES[id].name} deals ${expected}`, baseSchool(ITEM_BASES[id]) === expected,
      baseSchool(ITEM_BASES[id]));
  }

  // Most weapons are ordinary. If every material were an element then
  // "elemental" would be the default and would mean nothing.
  const physical = counts.get("physical") ?? 0;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  check("most of the catalogue is still plain steel", physical / total > 0.5,
    `${physical}/${total} physical`);
  console.log(`  ${[...counts].map(([s, n]) => `${s} ${n}`).join(", ")}`);

  // Unarmed resolves rather than throwing — a real archetype, not a broken
  // state, which is the same rule every other weapon function here follows.
  check("bare hands are physical", weaponSchool(null) === "physical");
  check("every family resolves to a real school",
    WEAPON_TYPES.every((t) => DAMAGE_SCHOOLS.includes(weaponSchool({ weaponType: t, baseId: "nope" }))));
}

// --- 5. the first ring teaches nothing about schools ------------------------
// A lesson about elements in band 1 is a lesson nobody has the vocabulary for.
section("5. where the lesson starts");
for (const kind of kinds) {
  const stats = MONSTER_STATS[kind];
  if (stats.band > 1) continue;
  check(`${kind} has no resistances`, !stats.resist,
    "band 1 is where a player learns that swinging works at all");
}
check("something in band 2 does have one",
  kinds.some((k) => MONSTER_STATS[k].band === 2 && !!MONSTER_STATS[k].resist));

// Readability: a creature with four resistances and three weaknesses is a
// creature nobody models. The target frame shows these as two short lists.
for (const kind of kinds) {
  const { resists, weakTo } = describeResists(MONSTER_STATS[kind].resist);
  check(`${kind} is legible at a glance`, resists.length <= 3 && weakTo.length <= 2,
    `${resists.length} resistances, ${weakTo.length} weaknesses`);
  // A creature that resists everything and folds to nothing is a wall, which
  // is the immunity rule again one level up.
  if (resists.length > 0) {
    check(`${kind} has something that hurts it`, weakTo.length > 0 || resists.length < 3,
      "every profile needs an answer a player can go and find");
  }
}

// --- 6. bosses can be answered ----------------------------------------------
// The three creatures worth going for are the ones where bringing the wrong
// school hurts most, so they are the ones that most need a right answer to
// exist at all.
section("6. the bosses have answers");
for (const kind of kinds) {
  if (!MONSTER_STATS[kind].guaranteedDrop) continue;
  const { weakTo } = describeResists(MONSTER_STATS[kind].resist);
  check(`the ${kind} folds to something`, weakTo.length > 0);
  // And that something has to be reachable: a weakness no weapon or skill in
  // the game can deal is a hint pointing at nothing.
  for (const w of weakTo) {
    const dealable =
      Object.values(SKILLS).some((s) => (s.school ?? "physical") === w.school) ||
      bases.some((b) => b.weaponType && baseSchool(b) === w.school);
    check(`and ${w.school} is something a player can actually deal`, dealable);
  }
  console.log(`  ${MONSTER_LABELS[kind]}: weak to ${weakTo.map((w) => w.school).join(", ")}`);
}

// --- 7. it actually changes the numbers -------------------------------------
// The section that can fail when everything above passes. A school that is
// wired through every table and applied nowhere looks finished in a screenshot
// and does nothing in a fight, so this rolls real damage through the real
// resolver and measures it.
section("7. it changes what lands");
{
  const swing = (school, resist) => {
    let total = 0;
    const runs = 4000;
    for (let i = 0; i < runs; i++) {
      const r = resolveHit(
        {
          attackerAccuracy: 100,
          attackerMinHit: 40,
          attackerMaxHit: 60,
          attackerCritChance: 0,
          attackerCritMultiplier: 1.5,
          defenderEvasion: 0,
          defenderArmor: 0,
          school,
          defenderResist: resist,
        },
        rand,
      );
      total += r.damage;
    }
    return total / runs;
  };

  const plain = swing("fire", 0);
  const resisted = swing("fire", 40);
  const vulnerable = swing("fire", -40);
  check("a resistance really reduces damage", resisted < plain * 0.7,
    `${resisted.toFixed(1)} vs ${plain.toFixed(1)}`);
  check("a vulnerability really increases it", vulnerable > plain * 1.3,
    `${vulnerable.toFixed(1)} vs ${plain.toFixed(1)}`);
  console.log(
    `  50 average: ${plain.toFixed(1)} plain, ${resisted.toFixed(1)} at +40, ${vulnerable.toFixed(1)} at -40`,
  );

  // The result carries what landed, so the client can tint the number and say
  // "it recoils" without computing its own copy of a server fact.
  const one = resolveHit(
    {
      attackerAccuracy: 100, attackerMinHit: 10, attackerMaxHit: 10,
      attackerCritChance: 0, attackerCritMultiplier: 1, defenderEvasion: 0,
      defenderArmor: 0, school: "frost", defenderResist: -30,
    },
    rand,
  );
  check("a hit reports its school", one.school === "frost");
  check("and what the target thought of it", one.resisted === -30);

  // Order is load-bearing: resistance scales with the blow and armour does not,
  // so resistance has to come first. Subtracting armour first would make a
  // resistance worth LESS against a heavily armoured thing, which is backwards.
  const armoured = resolveHit(
    {
      attackerAccuracy: 100, attackerMinHit: 100, attackerMaxHit: 100,
      attackerCritChance: 0, attackerCritMultiplier: 1, defenderEvasion: 0,
      defenderArmor: 10, school: "fire", defenderResist: 50,
    },
    rand,
  );
  check("resistance applies before armour", armoured.damage === 40,
    `got ${armoured.damage}, expected 100 -> 50 -> 40`);

  // Untyped callers still work and are physical, so nothing that has not been
  // taught about schools yet silently deals an element.
  const bare = resolveHit(
    {
      attackerAccuracy: 100, attackerMinHit: 10, attackerMaxHit: 10,
      attackerCritChance: 0, attackerCritMultiplier: 1,
      defenderEvasion: 0, defenderArmor: 0,
    },
    rand,
  );
  check("a caller with no opinion deals physical", bare.school === "physical");
  check("and takes no resistance with it", bare.damage === 10);
}

// --- 8. what a player can wear ----------------------------------------------
// The defensive half. A monster that deals fire is a stat check unless there is
// gear that answers it, and a set bonus that is strictly better than every
// affix would make the affixes pointless.
section("8. the defensive half");
{
  const attackers = kinds.filter((k) => (MONSTER_STATS[k].attackSchool ?? "physical") !== "physical");
  check("something in the world deals elemental damage AT you", attackers.length > 0);
  for (const kind of attackers) {
    const school = MONSTER_STATS[kind].attackSchool;
    check(`${kind}'s ${school} can be resisted`, ELEMENTAL_SCHOOLS.includes(school));
  }
  console.log(
    `  ${attackers.map((k) => `${k}:${MONSTER_STATS[k].attackSchool}`).join(", ")}`,
  );

  // A five-piece matched kit and a band-5 suffix should be in the same
  // neighbourhood, so gearing for a fight and dressing in one material are two
  // routes to the same answer rather than one obsoleting the other.
  for (const school of ELEMENTAL_SCHOOLS) {
    const key = RESIST_KEY[school];
    const bestSet = Math.max(
      0,
      ...Object.values(PALETTE_SETS).flatMap((s) => s.tiers.map((t) => t.bonus[key] ?? 0)),
    );
    const bestAffix = Math.max(
      0,
      ...AFFIXES.filter((a) => (a.per[key] ?? 0) > 0).map((a) => affixBonus(a, 5)[key] ?? 0),
    );
    if (bestSet === 0 || bestAffix === 0) continue;
    const ratio = bestSet / bestAffix;
    check(`neither route to ${school} resistance obsoletes the other`,
      ratio > 0.5 && ratio < 2, `set ${bestSet}, band-5 affix ${bestAffix}`);
  }

  // A resistance is situational, so it must not roll on the gear a player has
  // no choice about — and band 1 and 2 creatures have no schools at all, which
  // is exactly the stretch where it would do nothing.
  for (const affix of AFFIXES) {
    const resisty = ELEMENTAL_SCHOOLS.some((s) => (affix.per[RESIST_KEY[s]] ?? 0) !== 0);
    if (!resisty) continue;
    check(`${affix.id} does not roll on opening-hour gear`, affix.minBand >= 3,
      `minBand ${affix.minBand}`);
  }
}

// --- done -------------------------------------------------------------------
console.log(
  failures === 0
    ? "\nOK — damage has a school, and it never has an immunity"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
