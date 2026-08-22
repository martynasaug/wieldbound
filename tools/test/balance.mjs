// Can you actually beat the ring you are standing in?
//
// This game's one rule is that DISTANCE FROM SPAWN IS DIFFICULTY — five bands
// radiating out, a level-1 character clears band 1, the reforge ladder priced
// against band 5. Every number behind that has been tuned by argument and none
// of it has ever been played through, so the rule has never been checked. It is
// checkable: `resolveHit` is a pure function in `shared/`, the stat curves are
// pure, and the item catalogue is a table. A fight is a loop.
//
// This exists because M66.1 gave three creatures a ranged attack and a comment
// admitting the balance was unverified: a thrower gets free hits while you close
// the gap, and nothing anywhere said how many.
//
//   node tools/test/balance.mjs
//
// It is a MODEL, not the game. It leaves out skills, potions, statuses,
// crowding and the double-attack roll — deliberately, because those are all
// things the player brings and what is being measured is the floor: an
// auto-attacking character with band-appropriate gear and nothing clever.
// If the floor holds, the ceiling is the player's business.

import {
  AGGRO_RANGE_PX,
  BASE_MOVE_SPEED_PX_PER_SEC,
  MONSTER_LABELS,
  MONSTER_STATS,
  maxHpForLevel,
  playerAccuracy,
  playerAttackIntervalMs,
  playerCritChance,
  primaryStatValue,
  resolveHit,
  critDamageMultiplier,
  classForWeapon,
  resistOf,
  equippedBySlot,
  gearArmor,
  gearEvasion,
} from "../../shared/protocol-types.ts";
import {
  BASES_BY_SLOT,
  hitBandOf,
  itemPassives,
  rollItem,
  weaponSchool,
  swingIntervalOf,
} from "../../shared/items.ts";
import { QUESTS } from "../../shared/quests.ts";

let failures = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failures++;
};

// --- What level is a band FOR ----------------------------------------------
// Derived from the quest table rather than invented here: the lowest level gate
// on a quest that names a monster of that band is the game's own statement of
// when it expects you there. A number typed in this file would be a second
// opinion that stops agreeing the first time a quest is retuned.

const bandLevel = {};
for (const q of QUESTS) {
  const o = q.objective;
  const kind = o.kind === "kill" || o.kind === "slay" ? o.monster : null;
  if (!kind) continue;
  const band = MONSTER_STATS[kind]?.band;
  if (!band) continue;
  if (bandLevel[band] === undefined || q.requiresLevel < bandLevel[band]) {
    bandLevel[band] = q.requiresLevel;
  }
}
// Bands no quest names fall back to the next one down plus the same step the
// rest of the ladder uses, rather than to a guess.
for (let b = 1; b <= 5; b++) {
  if (bandLevel[b] === undefined) bandLevel[b] = (bandLevel[b - 1] ?? 1) + 5;
}
console.log("== what level a band is for (out of the quest table) ==");
console.log("  " + [1, 2, 3, 4, 5].map((b) => `band ${b}: lvl ${bandLevel[b]}`).join(",  "));

// --- A plausible character --------------------------------------------------
// Band-appropriate gear at Honed, which is the rung the ladder is authored at —
// "Honed sits at exactly 1.0 so the catalogue is authored at true values".
// Stat points all into the weapon's own attribute, which is what the game's own
// per-weapon advice tells a player to do.

const seeded = (n) => () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296);

function character(level, band, weaponBaseId) {
  const random = seeded(band * 7919 + level);
  const items = [];
  const weaponBase = weaponBaseId
    ? BASES_BY_SLOT.weapon.find((b) => b.id === weaponBaseId)
    : BASES_BY_SLOT.weapon.filter((b) => b.band === band)[0];
  if (weaponBase) items.push({ ...rollItem(weaponBase, "honed", random), equipped: true });
  for (const slot of ["head", "chest", "feet", "offhand", "back", "ring"]) {
    const pool = (BASES_BY_SLOT[slot] ?? []).filter((b) => b.band === band);
    const base = pool[0] ?? (BASES_BY_SLOT[slot] ?? [])[0];
    if (base) items.push({ ...rollItem(base, "honed", random), equipped: true });
  }
  const eq = equippedBySlot(items);
  const weapon = eq.weapon ?? null;
  const cls = classForWeapon(weapon?.weaponType);
  // Every stat point into the attribute that scales this weapon, plus vitality
  // from levelling — the shape the game's own advice describes.
  const points = Math.max(0, (level - 1) * 3);
  const attrs = { strength: 5, agility: 5, vitality: 5, intelligence: 5 };
  const primary = { warrior: "strength", ranger: "agility", mage: "intelligence", adventurer: "strength" }[cls];
  attrs[primary] += Math.round(points * 0.6);
  attrs.vitality += Math.round(points * 0.4);

  const passives = itemPassives(weapon ?? { baseId: "", rarity: "honed", affixes: [] });
  return {
    level,
    cls,
    weapon,
    eq,
    attrs,
    maxHp: maxHpForLevel(level, attrs.vitality, passives.maxHpBonus ?? 0),
    power: primaryStatValue(cls, attrs),
    accuracy: playerAccuracy(attrs.agility, passives.accuracyBonus ?? 0),
    crit: playerCritChance(attrs.agility) + (passives.critChance ?? 0),
    armor: gearArmor(eq),
    evasion: gearEvasion(eq),
    school: weaponSchool(weapon),
    // (item, weaponRarity, battlePowerLevel, agility) — the first version of
    // this passed two arguments and got NaN, which propagated into the fight
    // clock and made every creature in the game win 100% of the time with the
    // player still on full health. A simulation that reports an impossible
    // result is reporting on itself.
    swingMs: swingIntervalOf(weapon, weapon?.rarity ?? null, 0, attrs.agility),
  };
}

// --- One fight --------------------------------------------------------------
// Both sides on their own clocks, stepped in milliseconds, exactly as the server
// runs them. Averaged over many runs, because a single fight is a dice roll.

function fight(pc, kind, random) {
  const m = MONSTER_STATS[kind];
  let mhp = m.maxHp;
  let php = pc.maxHp;
  const band = hitBandOf(pc.weapon, pc.power, 0, 0);
  // (weaponRarity, critDamagePercent). Passing agility here — which is what the
  // first version did — indexes the rarity table with a number, gets undefined,
  // and returns NaN. The multiplier is only reached ON A CRIT, so the fight ran
  // normally until the first one and then silently stopped: `mhp` became NaN,
  // every comparison against it went false, and the result came back as a total
  // defeat at full health. That is the third signature guessed rather than read
  // this session and the second to produce an impossible number.
  const critMul = critDamageMultiplier(pc.weapon?.rarity ?? null, 0);

  // THE APPROACH, and the two cases are opposites rather than one formula.
  //
  // A MELEE MONSTER CHARGES YOU. The gap shuts at the sum of the two speeds,
  // because you are both walking into it — and it is in reach almost at once.
  //
  // A THROWER BACKS OFF. There the gap shuts at the DIFFERENCE, and that
  // difference is the whole cost of a ranged enemy: hits you take crossing
  // ground it is giving away slower than you can take it.
  //
  // The first version used the difference for both, which is what you get by
  // writing one expression for two situations. An armabee runs at 215 against
  // a player's 220, so it reported a 43-second WALK before a single blow was
  // struck, and the suite duly failed the armabee for being a 51-second fight.
  // The creature was fine. The model had it running away from somebody it was
  // charging at.
  let t = 0;
  const gap = Math.max(0, AGGRO_RANGE_PX - m.attackRangePx);
  const closingSpeed = m.keepAwayPx
    ? BASE_MOVE_SPEED_PX_PER_SEC - m.speedPxPerSec * (m.backpedalPace ?? 0.5)
    : BASE_MOVE_SPEED_PX_PER_SEC + m.speedPxPerSec;
  const approachMs = gap > 0 && closingSpeed > 0 ? (gap / closingSpeed) * 1000 : 0;

  let mNext = m.attackIntervalMs;
  let pNext = approachMs + pc.swingMs;
  let freeHits = 0;

  // Guard the clock. A NaN anywhere in it makes every comparison false, the
  // loop never runs, and the result reads as a total defeat at full health.
  if (!Number.isFinite(pc.swingMs) || !Number.isFinite(m.attackIntervalMs)) {
    throw new Error(`fight clock is not a number: swing ${pc.swingMs}, monster ${m.attackIntervalMs}`);
  }

  const LIMIT = 120000;
  while (mhp > 0 && php > 0 && t < LIMIT) {
    t = Math.min(mNext, pNext);
    if (t >= LIMIT) break;
    if (mNext <= pNext) {
      const hit = resolveHit(
        {
          attackerAccuracy: m.accuracy,
          attackerMinHit: m.minHit,
          attackerMaxHit: m.maxHit,
          attackerCritChance: m.critChance,
          attackerCritMultiplier: m.critMultiplier,
          defenderEvasion: pc.evasion,
          defenderArmor: pc.armor,
          school: m.attackSchool ?? "physical",
          defenderResist: 0,
        },
        random,
      );
      if (hit.hit) {
        php -= hit.damage;
        if (t < approachMs) freeHits++;
      }
      mNext += m.attackIntervalMs;
    } else {
      const hit = resolveHit(
        {
          attackerAccuracy: pc.accuracy,
          attackerMinHit: band.min,
          attackerMaxHit: band.max,
          attackerCritChance: pc.crit,
          attackerCritMultiplier: critMul,
          defenderEvasion: m.evasion,
          defenderArmor: m.armor,
          school: pc.school,
          defenderResist: resistOf(m.resist, pc.school),
        },
        random,
      );
      if (hit.hit) mhp -= hit.damage;
      // Guard the health as well as the clock. A NaN here makes every
      // comparison false, the loop stops, and the run reports as a loss with
      // the player untouched — which is impossible, and is exactly what a
      // broken simulation looks like when it is trusted.
      if (!Number.isFinite(mhp) || !Number.isFinite(php)) {
        throw new Error(`fight produced a non-number: monster ${mhp}, player ${php}`);
      }
      pNext += pc.swingMs;
    }
  }
  return { won: mhp <= 0 && php > 0, ms: t, hpLeft: Math.max(0, php), freeHits, approachMs };
}

function average(pc, kind, runs = 400) {
  const random = seeded(kind.length * 104729 + pc.level * 31);
  let wins = 0, ms = 0, left = 0, free = 0;
  for (let i = 0; i < runs; i++) {
    const r = fight(pc, kind, random);
    if (r.won) wins++;
    ms += r.ms;
    left += r.hpLeft;
    free += r.freeHits;
  }
  return { win: wins / runs, ms: ms / runs, left: left / runs, free: free / runs, maxHp: pc.maxHp };
}

// --- The floor holds --------------------------------------------------------

// WHAT WAS MODELLED, printed, because a balance report that does not say who it
// simulated is a table of numbers nobody can check. The first debugging pass on
// this file reimplemented the character in a scratch script, put the stat points
// in the wrong attribute for a dagger user, and drew conclusions from a
// character the suite had never built.
console.log("\n== the character each band is measured with ==");
for (const b of [1, 2, 3, 4, 5]) {
  const pc = character(bandLevel[b], b);
  console.log(
    `  band ${b}: lvl ${String(pc.level).padStart(2)} ${pc.cls.padEnd(10)}` +
      `${(pc.weapon?.baseId ?? "bare hands").padEnd(14)} ` +
      `hp ${String(pc.maxHp).padStart(4)}  power ${String(pc.power).padStart(3)}  ` +
      `hits ${hitBandOf(pc.weapon, pc.power, 0, 0).min}-${hitBandOf(pc.weapon, pc.power, 0, 0).max}  ` +
      `every ${pc.swingMs}ms  armour ${pc.armor}  acc ${pc.accuracy}`,
  );
}

// EVERY FAMILY, not one. The first version took the first weapon in the band and
// measured that — which is a dagger at every band, so the entire report was one
// ranger's afternoon. "You are whatever you're holding" means a balance check
// that holds one thing has checked one eighth of the game.
function familiesFor(band) {
  const out = [];
  for (const fam of ["sword", "axe", "mace", "dagger", "bow", "staff", "wand"]) {
    // The best of that family at or below this band — what a player who has
    // committed to a weapon would plausibly be carrying.
    const best = BASES_BY_SLOT.weapon
      .filter((b) => b.weaponType === fam && b.band <= band)
      .sort((a, b) => b.band - a.band)[0];
    if (best) out.push(best.id);
  }
  return out;
}

console.log("\n== every weapon family, band gear, no skills or potions ==");
console.log("  kind        band  lvl  worst win%   slowest kill   worst hp left   weapon");
const byBand = {};
for (const [kind, s] of Object.entries(MONSTER_STATS)) {
  const level = bandLevel[s.band];
  let worst = null;
  let slowest = null;
  for (const id of familiesFor(s.band)) {
    const pc = character(level, s.band, id);
    const r = { ...average(pc, kind), weapon: id };
    if (!worst || r.win < worst.win || (r.win === worst.win && r.left < worst.left)) worst = r;
    if (!slowest || r.ms > slowest.ms) slowest = r;
  }
  (byBand[s.band] ??= []).push({ kind, ...worst, slowestMs: slowest.ms, slowestWith: slowest.weapon });
  console.log(
    "  " + MONSTER_LABELS[kind].padEnd(12) +
      String(s.band).padStart(3) + String(level).padStart(5) +
      (worst.win * 100).toFixed(0).padStart(11) + "%" +
      ((slowest.ms / 1000).toFixed(1) + "s").padStart(15) +
      (((worst.left / worst.maxHp) * 100).toFixed(0) + "%").padStart(16) +
      "   " + worst.weapon,
  );
}

// A fight nobody would sit through is a balance problem even when it is a win.
// The auto-attack is the floor, so this is generous — but a minute of holding
// still against one ordinary creature is not a fight, it is a wait.
const SLOG_MS = 45000;
for (const rows of Object.values(byBand)) {
  for (const r of rows) {
    if (r.slowestMs > SLOG_MS) {
      fail(
        `a ${MONSTER_LABELS[r.kind]} takes ${(r.slowestMs / 1000).toFixed(0)}s to kill with a ` +
          `${r.slowestWith} — that is not a fight, it is a wait`,
      );
    }
  }
}

// A band you cannot clear at the level the game sends you there is the one rule
// this world is laid out by, broken.
for (const [band, rows] of Object.entries(byBand)) {
  for (const r of rows) {
    if (r.win < 0.9) {
      fail(
        `a level-${bandLevel[band]} character loses to a ${MONSTER_LABELS[r.kind]} ` +
          `${((1 - r.win) * 100).toFixed(0)}% of the time, and band ${band} is where the game sends them`,
      );
    }
  }
}

// --- And a thrower is not a different game ----------------------------------
// The check M66.1 said it needed. Free hits while closing are the cost of a
// ranged enemy and are meant to be felt; what they may not be is a different
// order of magnitude from what its melee neighbours in the same band ask.

// --- What the model DOES NOT know ------------------------------------------
//
// It simulates the approach and then a stationary exchange. A thrower does not
// stand still: you close, it gives ground, you close again — so the real cost of
// one is spread across the whole fight and this measures only the opening walk.
// **These numbers are a LOWER BOUND**, and saying so is the difference between a
// model and a claim.
//
// The opening walk turns out to be nearly free, and that is worth recording
// rather than passing over: the aggro radius is 260 and a thrower reaches 185 to
// 210, so it notices you about half a second before you are on it and mostly
// does not get a shot away. Whatever a ranged creature is worth here, it is not
// worth an opening volley — it is the giving-ground that makes the fight.

console.log("\n== what closing the gap costs (opening walk only — see the note above) ==");
for (const [kind, s] of Object.entries(MONSTER_STATS)) {
  if (!s.keepAwayPx) continue;
  const level = bandLevel[s.band];
  const pc = character(level, s.band);
  const r = average(pc, kind);
  const peers = Object.entries(MONSTER_STATS).filter(([k, o]) => o.band === s.band && !o.keepAwayPx);
  const peerLoss =
    peers.map(([k]) => 1 - average(character(level, s.band), k).left / pc.maxHp)
      .reduce((a, b) => a + b, 0) / Math.max(1, peers.length);
  const loss = 1 - r.left / r.maxHp;
  console.log(
    `  ${MONSTER_LABELS[kind].padEnd(12)} costs ${(loss * 100).toFixed(0)}% of your health; ` +
      `its band-${s.band} melee neighbours cost ${(peerLoss * 100).toFixed(0)}% ` +
      `(${r.free.toFixed(1)} free hits closing)`,
  );
  // How long it has to shoot at you before you arrive, against how often it
  // shoots. Under one this creature will usually not get a shot away at all,
  // which means its reach is doing nothing on the approach.
  const volley = (r.approachMs ?? 0) / s.attackIntervalMs;
  void volley;
  if (peers.length > 0 && loss > peerLoss * 2.5 + 0.1) {
    fail(
      `a ${MONSTER_LABELS[kind]} costs ${(loss * 100).toFixed(0)}% of your health against ` +
        `${(peerLoss * 100).toFixed(0)}% for its melee neighbours — closing the gap is not a ` +
        `change of pace, it is a different game`,
    );
  }
}

console.log(failures === 0 ? "\nOK — every ring is clearable at the level it is for." : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
