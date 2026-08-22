// Checks the eight weapon talent trees against the rules they quietly rely on.
//
// Seventy-odd nodes are hand-authored data, and every failure mode here is
// silent: a node granting a skill id that no longer exists just never appears
// on the bar; a prerequisite pointing at another tree can never be satisfied,
// so the node is unbuyable forever; a tier gated above the level cap is content
// nobody can reach. None of it throws, and none of it shows up in a typecheck
// beyond the id being a string.
//
// Also reports the shape of each tree, which is the cheapest way to notice that
// one weapon quietly ended up with three actives and another with six.
//
//   node tools/test/talents.mjs

import {
  MAX_WEAPON_LEVEL,
  SKILLS,
  SKILL_IDS,
  TALENT_TIER_LEVELS,
  WEAPONS,
  WEAPON_TREES,
  WEAPON_TYPES,
  canLearnTalent,
  spentTalentPoints,
  talentPassives,
  talentPointsAtLevel,
  unlockedActives,
  weaponProgress,
  weaponXpToNext,
  castMsFor,
  CAST_MIN_MS,
  CAST_MAX_MS,
  CAST_RANGE_FLOOR_PX,
} from "../../shared/protocol-types.ts";

let failures = 0;
const fail = (msg) => {
  console.log(`  FAIL  ${msg}`);
  failures++;
};

const allWeapons = ["fist", ...WEAPON_TYPES];
const grantedSkills = new Set();

console.log("1. every tree is well formed");
for (const weapon of allWeapons) {
  const nodes = WEAPON_TREES[weapon];
  if (!nodes || nodes.length === 0) {
    fail(`${weapon}: no tree at all`);
    continue;
  }
  const ids = new Set(nodes.map((n) => n.id));
  let actives = 0;
  let passiveRanks = 0;

  for (const node of nodes) {
    if (node.weapon !== weapon) fail(`${node.id}: filed under ${weapon} but claims ${node.weapon}`);
    if (!node.active && !node.passive) fail(`${node.id}: neither a skill nor a passive — does nothing`);
    if (node.active && node.passive) fail(`${node.id}: both a skill and a passive; pick one`);
    if (node.maxRank < 1) fail(`${node.id}: maxRank ${node.maxRank}`);
    if (node.active && node.maxRank !== 1) {
      fail(`${node.id}: actives are one rank by design, has ${node.maxRank}`);
    }
    if (node.active) {
      actives++;
      grantedSkills.add(node.active);
      if (!SKILLS[node.active]) fail(`${node.id}: grants unknown skill "${node.active}"`);
    } else {
      passiveRanks += node.maxRank;
      // A passive whose bag is empty is a node that costs a point and does
      // nothing, which no typecheck would catch.
      const keys = Object.keys(node.passive ?? {});
      if (keys.length === 0) fail(`${node.id}: empty passive bag`);
      for (const [key, value] of Object.entries(node.passive ?? {})) {
        if (typeof value !== "number" || value === 0) fail(`${node.id}: ${key} is ${value}`);
      }
    }
    if (node.tier < 0 || node.tier >= TALENT_TIER_LEVELS.length) {
      fail(`${node.id}: tier ${node.tier} has no level gate`);
    }
    if (TALENT_TIER_LEVELS[node.tier] > MAX_WEAPON_LEVEL) {
      fail(`${node.id}: tier needs level ${TALENT_TIER_LEVELS[node.tier]}, cap is ${MAX_WEAPON_LEVEL}`);
    }
    if (node.requires) {
      if (!ids.has(node.requires)) fail(`${node.id}: requires "${node.requires}", not in this tree`);
      else {
        const prereq = nodes.find((n) => n.id === node.requires);
        // A prerequisite in a later tier is unreachable: you would need the
        // child before the parent could be bought.
        if (prereq.tier > node.tier) {
          fail(`${node.id} (tier ${node.tier}) requires ${prereq.id} from the later tier ${prereq.tier}`);
        }
      }
    }
  }

  const total = nodes.reduce((n, x) => n + x.maxRank, 0);
  const budget = talentPointsAtLevel(MAX_WEAPON_LEVEL);
  console.log(
    `  ${weapon.padEnd(7)} ${String(nodes.length).padStart(2)} nodes  ` +
      `${actives} skills  ${passiveRanks} passive ranks  ` +
      `${total} ranks total vs ${budget} points at cap`,
  );
  // If everything is affordable there is no choosing, which is the entire point
  // of a tree rather than a list.
  if (total <= budget) fail(`${weapon}: all ${total} ranks fit in ${budget} points — no choice to make`);
}

console.log("\n2. no skill is stranded");
for (const id of SKILL_IDS) {
  if (!grantedSkills.has(id)) fail(`skill "${SKILLS[id].name}" (${id}) is in no tree — unreachable`);
}
console.log(`  ${grantedSkills.size} of ${SKILL_IDS.length} skills reachable`);

console.log("\n3. every tree can actually be walked");
for (const weapon of allWeapons) {
  // Buy greedily from the top down and confirm the points land somewhere; this
  // catches a tier whose only nodes all depend on something unbuyable.
  const ranks = {};
  let bought = 0;
  for (let level = 1; level <= MAX_WEAPON_LEVEL; level++) {
    let progress = true;
    while (progress && talentPointsAtLevel(level) - spentTalentPoints(weapon, ranks) > 0) {
      progress = false;
      for (const node of WEAPON_TREES[weapon]) {
        if (canLearnTalent(weapon, ranks, node.id, level).ok) {
          ranks[node.id] = (ranks[node.id] ?? 0) + 1;
          bought++;
          progress = true;
          break;
        }
      }
    }
  }
  const budget = talentPointsAtLevel(MAX_WEAPON_LEVEL);
  const actives = unlockedActives(weapon, ranks).length;
  const passives = talentPassives(weapon, ranks);
  const nonZero = Object.entries(passives).filter(([, v]) => v !== 0).length;
  if (bought < budget) fail(`${weapon}: only ${bought} of ${budget} points could be spent`);
  console.log(
    `  ${weapon.padEnd(7)} spent ${String(bought).padStart(2)}/${budget}  ` +
      `-> ${actives} skills, ${nonZero} passive stats affected`,
  );
}

console.log("\n4. the proficiency curve");
const totalXp = Array.from({ length: MAX_WEAPON_LEVEL - 1 }, (_, i) => weaponXpToNext(i + 1)).reduce((a, b) => a + b, 0);
const atCap = weaponProgress(totalXp);
if (atCap.level !== MAX_WEAPON_LEVEL) fail(`curve does not reach the cap: ${totalXp} xp gives level ${atCap.level}`);
if (weaponProgress(0).level !== 1) fail("zero xp is not level 1");
console.log(`  ${totalXp} xp spans levels 1 to ${atCap.level}; ${weaponXpToNext(1)} for the first, ${weaponXpToNext(MAX_WEAPON_LEVEL - 1)} for the last`);

// --- Cast times -------------------------------------------------------------
// Derived from the cooldown rather than typed, so the RULE is the thing worth
// checking rather than eleven numbers. Every way it can go wrong is silent:
// a melee skill that grew a cast is one you get killed holding, and a survival
// cooldown that grew one is a survival cooldown that does not work.

console.log("\n== cast times ==");
{
  const cast = Object.values(SKILLS).filter((s) => castMsFor(s) > 0);

  for (const s of Object.values(SKILLS)) {
    const ms = castMsFor(s);
    if (ms === 0) continue;
    // Nothing you have to plant your feet for may be a reaction.
    if (s.kind !== "damage" && s.kind !== "heal") {
      fail(`${s.id} is a ${s.kind} with a ${ms}ms cast — only damage and heals may have one`);
    }
    if (s.rangePx < CAST_RANGE_FLOOR_PX) {
      fail(
        `${s.id} casts for ${ms}ms at ${s.rangePx}px, which is melee — standing still there ` +
          `while something winds up is a death sentence with no counterplay`,
      );
    }
    if (ms < CAST_MIN_MS || ms > CAST_MAX_MS) {
      fail(`${s.id} casts for ${ms}ms, outside ${CAST_MIN_MS}..${CAST_MAX_MS}`);
    }
  }

  // An escape with a wind-up is not an escape.
  for (const s of Object.values(SKILLS)) {
    if (s.kind === "mobility" && castMsFor(s) > 0) fail(`${s.id} is an escape with a cast on it`);
  }

  // The cheap rhythm skills stay instant on purpose. If these ever grow one,
  // the basic loop has become sluggish and somebody should have chosen that.
  for (const id of ["arcanebolt", "powershot"]) {
    if (castMsFor(SKILLS[id]) > 0) fail(`${id} carries the moment-to-moment rhythm and must stay instant`);
  }

  // And the rule has to select something, or it is decoration.
  if (cast.length === 0) fail("no skill in the game has a cast time at all");
  else {
    console.log(
      `  ${cast.length} skills cast, ${Object.keys(SKILLS).length - cast.length} are instant`,
    );
    console.log(
      `  ${Math.min(...cast.map(castMsFor))}ms to ${Math.max(...cast.map(castMsFor))}ms — ` +
        cast.map((s) => s.id).join(", "),
    );
  }
}

console.log(failures === 0 ? "\nOK — all talent trees hold" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
