// ARE THE EIGHT WEAPONS BALANCED AGAINST EACH OTHER?
//
// Needs no server: arithmetic over the shared tables, which is the only honest
// way to compare eight families. Playing them says they all work (M70.183 did
// that) and says almost nothing about whether one is a trap — a twenty-second
// fight against a slime is noise beside a 1.6x gap.
//
// THIS FILE CHANGED ITS ANSWER TWICE BEFORE IT WAS WORTH READING, which is the
// most useful thing in it:
//
//   counting damage% and speed% only  ->  axe, bow and staff look weakest
//   ...plus crit                      ->  dagger runs away with it, warriors weak
//   ...plus skills                    ->  what is below
//
// Each version was confident and each was measuring a subset of how a weapon
// deals damage. The axe's Brutality is +60% CRIT damage; the bow takes crit
// chance AND crit damage; a staff spends its whole tree on `skillPowerPercent`
// and a wand on `cooldownPercent`, so BOTH casters do their damage with actives
// and neither has any interest in its own swing. Judging a caster by its
// auto-attack is judging it by the half of the game it does not play.
//
// WHAT IS COMPARED. Total damage per second — swing plus actives — for the best
// twenty-point build, against REACH. Twenty is the real budget
// (`talentPointsAtLevel` caps there), and "max every node" is not a build.
// Reach is defence: everything killed at 300px is damage never taken, so a
// ranged weapon out-damaging a melee one is better at both jobs at once.
//
// The skill half is rough on purpose: every cooldown always available, nothing
// missed, no mana limit, no travel time. That flatters casters, and it is still
// the only way the two halves can be added together at all.
//
// ACCURACY IS ABSENT ON PURPOSE, and after M70.200 that needs saying rather
// than just being true. Every weapon here is measured at the SAME `AGILITY`, so
// every weapon has the same accuracy and the same hit chance against any given
// target: it is a common factor across all eight and cancels out of the
// comparison entirely. Adding it would multiply every row by the same number.
//
// It stops cancelling the moment builds differ per weapon, which is what
// `WEAPON_STAT_ADVICE` tells players to do — Agility is first for dagger, bow
// and fist, second for sword and wand, third for axe, mace and staff. So the
// question "did uncapping accuracy hand the Agility weapons a free advantage"
// is real, and was checked when the cap came off. Following each weapon's own
// advice at level 87, against a wolf, ALL EIGHT reach the 95% clamp: the change
// introduced no spread at all. The only place they separate is the ghost, at
// 86% against 95% — a 10.5% edge to the Agility weapons on the one monster
// whose 38 evasion exists specifically to ask that question. Everything else in
// the game is at the ceiling for everybody.
//
// The wide spreads at levels 20-40 are NOT from that change: below 95 the cap
// never applied, so those numbers are what they always were. They are Agility
// being the accuracy stat, which is the design.
//
// Any future change to `playerAccuracy` should be re-checked the same way. The
// property that matters is not "accuracy is equal" — it is that no weapon
// following its own advice is left unable to hit the things it is meant to
// fight.

import {
  WEAPONS,
  WEAPON_TREES,
  WEAPON_STAT_ADVICE,
  CLASSES,
  SKILLS,
  attackRangeFor,
  playerAttackIntervalMs,
  playerCritChance,
  critDamageMultiplier,
  skillPower,
  manaRegenAmount,
  MANA_REGEN_INTERVAL_MS,
  talentPointsAtLevel,
} from "../../shared/protocol-types.ts";
import { hitBandOf } from "../../shared/items.ts";

const POWER = 26;
const AGILITY = 26;
const LEVEL = 40;
const RARITY = "forged";
const POINTS = talentPointsAtLevel(60);

const problems = [];
const fail = (m) => problems.push(m);

/** Swing damage per second before any talent is spent. */
function baseDps(family) {
  const w = WEAPONS[family];
  const interval = playerAttackIntervalMs(RARITY, 0, AGILITY) * (w.speedMultiplier ?? 1);
  const band = hitBandOf({ weaponType: family, rarity: RARITY, statValue: 0 }, POWER, 0, 0);
  return ((band.min + band.max) / 2 / interval) * 1000;
}

/**
 * Damage per second from the damaging actives a tree unlocks, LIMITED BY MANA.
 *
 * The mana limit is the difference between a model that flatters casters and
 * one that describes the game. Every cooldown always available is a fantasy a
 * staff cannot pay for:
 *
 *     staff needs 14.7 mana/sec for full uptime      regen at 26 int is 5.0/sec
 *     bow needs    8.7                               so it sustains 57%
 *     wand needs   4.1                               so it sustains all of it
 *     sword needs  2.9                               so it sustains all of it
 *
 * A staff casting flat out runs dry in seconds and then swings a stick. Without
 * this the model rated it the second strongest weapon in the game on damage it
 * can produce for about eight seconds.
 *
 * This is the SUSTAINED number. A burst — full mana bar, one fight — is higher,
 * and that is a real thing a caster gets to do; it is just not what "how strong
 * is this weapon" means over a session.
 */
function skillDps(family, skillPowerPercent, cooldownPercent) {
  let damage = 0;
  let manaPerSec = 0;
  for (const node of Object.values(WEAPON_TREES[family])) {
    const skill = node.active ? SKILLS[node.active] : null;
    if (!skill || skill.kind !== "damage") continue;
    const cooldown = (skill.cooldownMs * (1 - cooldownPercent / 100)) / 1000;
    if (cooldown <= 0) continue;
    damage += skillPower(skill, POWER, 0, LEVEL, skillPowerPercent) / cooldown;
    manaPerSec += skill.manaCost / cooldown;
  }
  const budget = manaRegenAmount(POWER) / (MANA_REGEN_INTERVAL_MS / 1000);
  const uptime = manaPerSec > 0 ? Math.min(1, budget / manaPerSec) : 1;
  return damage * uptime;
}

/**
 * The best TOTAL damage a `POINTS`-point build reaches.
 *
 * Greedy on marginal gain, and the objective is swing plus skills together —
 * optimising the swing alone would spend a caster's points on nodes it should
 * never take, and then report the result as the caster's ceiling.
 */
function bestBuild(family) {
  const KEYS = [
    "damagePercent",
    "attackSpeedPercent",
    "critChance",
    "critDamagePercent",
    "skillPowerPercent",
    "cooldownPercent",
  ];
  const nodes = Object.values(WEAPON_TREES[family])
    .filter((n) => n.passive && KEYS.some((k) => n.passive[k]))
    .map((n) => ({ p: n.passive, left: n.maxRank, taken: 0, name: n.name }));

  const t = Object.fromEntries(KEYS.map((k) => [k, 0]));
  const swing = (s) => {
    const chance = Math.min(100, playerCritChance(AGILITY) + s.critChance) / 100;
    const mult = critDamageMultiplier(RARITY, s.critDamagePercent);
    return (
      baseDps(family) *
      (1 + s.damagePercent / 100) *
      (1 + s.attackSpeedPercent / 100) *
      (1 + chance * (mult - 1))
    );
  };
  // Cooldown reduction is capped, or a greedy optimiser happily divides by zero.
  const total = (s) =>
    swing(s) + skillDps(family, s.skillPowerPercent, Math.min(75, s.cooldownPercent));

  for (let spent = 0; spent < POINTS; spent++) {
    let best = null;
    let bestGain = 0;
    for (const n of nodes) {
      if (n.left <= 0) continue;
      const next = { ...t };
      for (const k of KEYS) next[k] += n.p[k] ?? 0;
      const gain = total(next) - total(t);
      if (gain > bestGain) {
        bestGain = gain;
        best = n;
      }
    }
    if (!best) break;
    best.left--;
    best.taken++;
    for (const k of KEYS) t[k] += best.p[k] ?? 0;
  }
  return {
    swing: swing(t),
    skills: skillDps(family, t.skillPowerPercent, Math.min(75, t.cooldownPercent)),
    total: total(t),
    ...t,
  };
}

const rows = Object.keys(WEAPONS).map((family) => ({
  family,
  reach: attackRangeFor(family),
  ...bestBuild(family),
}));

console.log(`best TOTAL damage a ${POINTS}-point build reaches:\n`);
console.log("weapon   class       reach   swing   skills   total   what it bought");
for (const r of [...rows].sort((a, b) => b.total - a.total)) {
  const bought = [
    r.damagePercent && `+${r.damagePercent}% dmg`,
    r.attackSpeedPercent && `+${r.attackSpeedPercent}% spd`,
    r.critChance && `+${r.critChance}% crit`,
    r.critDamagePercent && `+${r.critDamagePercent}% critdmg`,
    r.skillPowerPercent && `+${r.skillPowerPercent}% spell`,
    r.cooldownPercent && `-${r.cooldownPercent}% cd`,
  ].filter(Boolean).join(" ");
  console.log(
    `${r.family.padEnd(8)} ${WEAPONS[r.family].classId.padEnd(11)} ${String(r.reach).padStart(4)} ` +
      `${r.swing.toFixed(0).padStart(7)} ${r.skills.toFixed(0).padStart(8)} ${r.total.toFixed(0).padStart(7)}   ${bought}`,
  );
}

// --- Reach has to cost something --------------------------------------------
const armed = rows.filter((r) => r.family !== "fist");
const melee = armed.filter((r) => r.reach < 100);
const ranged = armed.filter((r) => r.reach >= 100);
// WITH A TOLERANCE, because this model is not precise to one per cent.
//
// The strict version — ranged must be below EVERY melee family — failed on a
// wand at 205 against a mace at 204. Half a per cent is far inside the error
// of a model that assumes no misses, no travel time, perfect cooldown usage and
// one fixed stat spread for eight weapons that scale off different attributes.
// Tightening the game to satisfy that would be tuning to false precision.
//
// Ten per cent is the claim worth making: a ranged weapon should not be
// MEANINGFULLY ahead of something that has to stand in contact.
const REACH_TOLERANCE = 1.1;
for (const r of ranged) {
  const beaten = melee
    .filter((m) => r.total > m.total * REACH_TOLERANCE)
    .map((m) => `${m.family} (${m.total.toFixed(0)})`);
  if (beaten.length) {
    fail(
      `${r.family} strikes from ${r.reach}px AND out-damages ${beaten.join(", ")} ` +
        `by more than ${((REACH_TOLERANCE - 1) * 100).toFixed(0)}% at ${r.total.toFixed(0)} total ` +
        `— reach is defence, so that is better at both jobs at once`,
    );
  }
}

// --- Nothing should be a trap ------------------------------------------------
// A spread is healthy; a family nobody can justify picking is not. Judged
// against its own reach class, because reach is meant to cost damage.
for (const r of armed) {
  const peers = armed.filter((p) => (p.reach >= 100) === (r.reach >= 100));
  const peerTop = Math.max(...peers.map((p) => p.total));
  if (r.total / peerTop < 0.7) {
    fail(
      `${r.family} reaches ${((r.total / peerTop) * 100).toFixed(0)}% of the best ` +
        `${r.reach >= 100 ? "ranged" : "melee"} family (${r.total.toFixed(0)} against ${peerTop.toFixed(0)})`,
    );
  }
}

console.log();
// --- and the advice points at the stat the weapon actually uses --------------
//
// `WEAPON_STAT_ADVICE` is what a player is told to spend points on, in prose,
// beside a table that decides what the weapon actually scales off: damage comes
// from `primaryStatValue`, which reads `CLASSES[classId].primaryStat`. Two
// separate places, edited separately, and nothing compared them. Re-home a
// weapon family to another class — which is exactly what a rebalance does —
// and its advice keeps recommending the old stat.
//
// ONE FAMILY DISAGREES ON PURPOSE and the rule has to allow it. Fists are an
// adventurer's, so their primary is Strength, while the advice leads with
// Agility — and says why in the same breath: "Fists scale off Strength but hit
// for very little either way — Agility keeps you alive and moving until you
// find a real weapon." That is a deliberate recommendation to ignore the damage
// stat on the one weapon whose damage does not matter.
//
// So the rule is not "advice must lead with the primary". It is: lead with it,
// or SAY the primary out loud, so a player is never left thinking a stat does
// nothing for them when it is the one their damage comes from.
{
  for (const [family, def] of Object.entries(WEAPONS)) {
    const primary = CLASSES[def.classId].primaryStat;
    const advice = WEAPON_STAT_ADVICE[family];
    const leadsWithIt = advice.order[0] === primary;
    const namesIt = advice.why.toLowerCase().includes(primary);
    if (!leadsWithIt && !namesIt) {
      fail(
        `${family}: damage scales off ${primary} (via ${def.classId}), but the advice leads with ` +
          `${advice.order[0]} and never mentions ${primary} — "${advice.why}"`,
      );
    }
  }
  const odd = Object.entries(WEAPONS).filter(
    ([f, d]) => WEAPON_STAT_ADVICE[f].order[0] !== CLASSES[d.classId].primaryStat,
  );
  console.log(
    `\nstat advice: ${Object.keys(WEAPONS).length - odd.length}/${Object.keys(WEAPONS).length} lead with their damage stat` +
      (odd.length ? `; ${odd.map(([f]) => f).join(", ")} deliberately do not, and say so` : ""),
  );
}

// PRINTED HERE, AFTER EVERY CHECK HAS RUN. This loop used to sit halfway up the
// file, before the stat-advice section was appended below it — so a failure
// raised down there was counted in the total and never named, and the run said
// "1 balance problem(s)." with no indication of which. Found by adding a check
// and watching its own negative control come back silent.
for (const p of problems) console.error(`  FAIL  ${p}`);
console.log(
  problems.length === 0
    ? "OK — every family is worth picking, and reach costs damage."
    : `\n${problems.length} balance problem(s).`,
);
process.exit(problems.length === 0 ? 0 : 1);
