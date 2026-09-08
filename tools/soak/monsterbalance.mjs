// WHAT EACH OF THE THIRTEEN MONSTERS COSTS TO KILL.
//
// A REPORT, NOT A TEST, AND THE REASON IS THE POINT. This was written as a
// suite test asserting two things: that kinds within a difficulty band cost
// about the same, and that the bands form a ladder. It failed nine ways, and
// then the premise turned out to be wrong.
//
// Monsters are placed by `ringPack(prefix, KIND, radius, angle)` — every camp
// holds ONE kind. A player at a given radius therefore CHOOSES which camp to
// walk into, so an orcbrute camp being harder than a wolf camp at the same
// distance is not an inconsistency, it is the choice. Enforcing uniformity
// inside a band would flatten exactly the decision the layout exists to offer.
//
// The measurement is still worth having, so it stays as a table. What it will
// not do is fail a build over a design requirement nobody stated.
//
// READ THE NUMBERS WITH THE ASSUMPTIONS. Costs come out at 0-3% of a health bar
// because this models ONE monster fought alone by a character with gear of a
// rarity a real player might not have at that level. Real fights are camps —
// four at once, with the player standing in the middle — which is where the
// bot's health actually goes. The COLUMNS worth reading are relative: time to
// kill, and how the kinds rank against each other.
//
// MEASURED AS THE COST OF A KILL rather than as hit points. A monster is not
// dangerous because it has a lot of health or because it hits hard, but because
// of how much of YOUR bar it takes with it — damage multiplied by how long it
// survives. The two trade off completely: a golem has sixteen times a slime's
// health and swings once every 3.2 seconds.
//
//   node tools/soak/monsterbalance.mjs

import {
  MONSTER_STATS,
  WEAPONS,
  attackRangeFor,
  playerAccuracy,
  playerAttackIntervalMs,
  playerCritChance,
  critDamageMultiplier,
  maxHpForLevel,
  applyResist,
  STAT_POINTS_PER_LEVEL,
} from "../../shared/protocol-types.ts";
import { hitBandOf } from "../../shared/items.ts";

// --- A reference character PER BAND ------------------------------------------
//
// One yardstick for all thirteen does not work, and the first version of this
// proved it: a level-20 character in forged gear clears bands 1 to 4 for nought
// to two health, so the intra-band ratios were dividing rounding noise and duly
// reported an orcbrute as "11.9x a wolf" on 2 against 0.17. That is the
// small-baseline trap, for the third time in this repository.
//
// So each ring is fought by somebody who would plausibly be standing in it. The
// mapping is an assumption and it is stated here rather than buried: the type
// declaration anchors one end — "band 1 — the ring you can clear at level 1" —
// and the rest are spaced along the levelling curve.
const BAND_LEVEL = { 1: 1, 2: 6, 3: 12, 4: 18, 5: 25 };
const RARITY = "forged";
const WEAPON = "sword";
/** Stat points accrue per level and most go to the primary, so power tracks
 *  level closely without needing a build modelled. */
const powerAt = (level) => 5 + Math.round((level - 1) * STAT_POINTS_PER_LEVEL * 0.6);
/** Gear keeps pace with level. These are the only two defensive numbers the
 *  formula needs and neither is worth modelling in detail. */
const armorAt = (level) => Math.round(level * 0.5);
const evasionAt = (level) => Math.round(5 + level * 0.3);

const clampChance = (v) => Math.max(5, Math.min(95, v));

function costOf(kind) {
  const m = MONSTER_STATS[kind];
  const level = BAND_LEVEL[m.band] ?? 1;
  const POWER = powerAt(level);
  const AGILITY = POWER;
  const PLAYER_ARMOR = armorAt(level);
  const PLAYER_EVASION = evasionAt(level);
  const band = hitBandOf({ weaponType: WEAPON, rarity: RARITY, statValue: 0 }, POWER, 0, 0);
  const playerInterval =
    playerAttackIntervalMs(RARITY, 0, AGILITY) * (WEAPONS[WEAPON].speedMultiplier ?? 1);
  const playerCrit = playerCritChance(AGILITY);
  const playerCritMult = critDamageMultiplier(RARITY, 0);
  const playerHp = maxHpForLevel(level);

  // What we do to it. `resolveHit`'s shape: accuracy minus evasion for the
  // chance, then armour off the damage with a floor of 1.
  const ourChance = clampChance(playerAccuracy(AGILITY, 0) - (m.evasion ?? 0));
  const rawAvg = (band.min + band.max) / 2;
  const withCrit = rawAvg * (1 + (playerCrit / 100) * (playerCritMult - 1));
  // Physical, so the only resistance that applies is a physical one if it has
  // it; armour is the general answer and is already separate.
  const afterResist = applyResist(withCrit, m.resist?.physical ?? 0);
  const ourHit = Math.max(1, afterResist - (m.armor ?? 0));
  const ourDps = ((ourChance / 100) * ourHit) / (playerInterval / 1000);
  const ttk = m.maxHp / ourDps;

  // What it does to us over that time.
  const itsChance = clampChance((m.accuracy ?? 50) - PLAYER_EVASION);
  const itsAvg = ((m.minHit + m.maxHit) / 2) * (1 + ((m.critChance ?? 0) / 100) * ((m.critMultiplier ?? 1) - 1));
  const itsHit = Math.max(1, itsAvg - PLAYER_ARMOR);
  const itsDps = ((itsChance / 100) * itsHit) / (m.attackIntervalMs / 1000);

  return {
    kind,
    band: m.band,
    level,
    ttk,
    itsDps,
    cost: itsDps * ttk,
    costPct: ((itsDps * ttk) / playerHp) * 100,
    xpPerSec: (m.xpReward ?? 0) / ttk,
  };
}

const rows = Object.keys(MONSTER_STATS).map(costOf).sort((a, b) => a.band - b.band || a.cost - b.cost);

console.log(
  `${RARITY} ${WEAPON} (${attackRangeFor(WEAPON)}px), each band fought at its own level: ` +
    Object.entries(BAND_LEVEL).map(([b, l]) => `b${b}=lv${l}`).join(" ") +
    `\n`,
);
console.log("band lvl  kind          ttk(s)   its dps   health per kill   % of bar   xp/s");
let lastBand = 0;
for (const r of rows) {
  if (r.band !== lastBand) {
    lastBand = r.band;
    console.log("  --");
  }
  console.log(
    `  ${r.band}  ${String(r.level).padStart(3)}  ${r.kind.padEnd(11)} ${r.ttk.toFixed(1).padStart(6)} ${r.itsDps.toFixed(1).padStart(9)} ` +
      `${r.cost.toFixed(0).padStart(15)} ${r.costPct.toFixed(0).padStart(9)}%  ${r.xpPerSec.toFixed(1).padStart(5)}`,
  );
}


// --- What stands out, stated rather than asserted ----------------------------
const byBand = [1, 2, 3, 4, 5]
  .map((b) => ({ b, rows: rows.filter((r) => r.band === b) }))
  .filter((x) => x.rows.length);
console.log("\nspread within each ring (a player picks which camp to walk into):");
for (const { b, rows: inBand } of byBand) {
  const lo = inBand[0];
  const hi = inBand[inBand.length - 1];
  console.log(
    `  band ${b}: ${lo.kind} is the soft option, ${hi.kind} the hard one ` +
      `(${(hi.cost / Math.max(0.01, lo.cost)).toFixed(1)}x the health)`,
  );
}
console.log(
  "\nxp per second, best first: " +
    [...rows].sort((a, b) => b.xpPerSec - a.xpPerSec).slice(0, 5)
      .map((r) => `${r.kind} ${r.xpPerSec.toFixed(1)}`).join("  "),
);
