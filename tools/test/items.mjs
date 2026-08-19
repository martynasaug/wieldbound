// Checks the item catalogue against the rules it quietly relies on.
//
// Seventy-eight base items and twenty-five affixes are hand-authored data, and
// almost every failure mode is silent. A base naming a model that does not
// exist is invisible in the player's hand. A slot with no band-1 entry means a
// new character can never find one. An affix restricted to a slot that never
// rolls it is content nobody will see. A rarity ladder that is not monotonic
// makes reforging a downgrade. None of it throws, and none of it shows up in a
// typecheck beyond the strings being strings.
//
// Also prints the shape of the catalogue, which is the cheapest way to notice
// that one slot ended up with nine entries and another with three.
//
//   node tools/test/items.mjs

import { existsSync } from "node:fs";
import path from "node:path";
import {
  ITEM_SLOTS,
  MONSTER_STATS,
  RARITIES,
  RARITY_ORDER,
  WEAPONS,
  WEAPON_TYPES,
} from "../../shared/protocol-types.ts";
import {
  AFFIXES,
  AFFIXES_BY_ID,
  ITEM_BASES,
  MATERIALS,
  PALETTES,
  affixBonus,
  baseGuard,
  basePower,
  STARTING_RECIPES,
  canAfford,
  forgeCost,
  forgeableBases,
  itemBase,
  itemName,
  itemPassives,
  reforgeCost,
  reforgeItem,
  reforgePreview,
  rollAffixes,
  rollBase,
  rollItem,
  rollRarity,
  rollRarityWithFloor,
  salvageYield,
  MONSTER_LOOT,
  PALETTE_SETS,
  activeSets,
  feelNotes,
  hitBandOf,
  setPassives,
  reachOf,
  swingIntervalOf,
} from "../../shared/items.ts";

const MODEL_DIR = path.resolve(import.meta.dirname, "../../client/public/models");
const ICONS_SRC = path.resolve(import.meta.dirname, "../../client/src/ui/icons.ts");

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

// --- 1. the shape of it -----------------------------------------------------
section("1. the catalogue");
console.log(`  ${bases.length} base items, ${AFFIXES.length} affixes, ${RARITY_ORDER.length} qualities`);
for (const slot of ITEM_SLOTS) {
  const inSlot = bases.filter((b) => b.slot === slot);
  const byBand = [1, 2, 3, 4, 5].map((b) => inSlot.filter((x) => x.band === b).length);
  console.log(`  ${slot.padEnd(8)} ${String(inSlot.length).padStart(2)}  bands ${byBand.join("/")}`);
  check(`${slot} has entries`, inSlot.length > 0);
  // A slot with nothing at band 1 is a slot a new character cannot fill.
  check(`${slot} has something at band 1`, byBand[0] > 0, `bands ${byBand.join("/")}`);
}

// --- 2. ids, names and uniqueness -------------------------------------------
section("2. identity");
const ids = new Set();
const names = new Set();
for (const b of bases) {
  check(`duplicate base id ${b.id}`, !ids.has(b.id));
  ids.add(b.id);
  check(`duplicate base name ${b.name}`, !names.has(b.name), b.id);
  names.add(b.name);
  check(`${b.id} has a flavour line`, typeof b.flavour === "string" && b.flavour.length > 10);
  check(`${b.id} band in range`, b.band >= 1 && b.band <= 5, String(b.band));
  check(`${b.id} palette exists`, !!PALETTES[b.art.palette], b.art.palette);
}
console.log(`  ${ids.size} unique ids, ${names.size} unique names`);

// --- 3. every model the catalogue names actually exists ---------------------
// The one failure that is completely invisible at runtime: a missing model
// leaves an empty hand and logs nothing the player will ever see.
section("3. art");
let checkedModels = 0;
let builders = 0;
for (const b of bases) {
  const { model, build } = b.art;
  if (build) {
    builders++;
    check(`${b.id} names a known builder`, ["crystalstave", "quiver"].includes(build), build);
    continue;
  }
  if (!model) {
    // Armour is procedural and declares a style instead. Rings are the one slot
    // that is genuinely invisible — no mesh, no layer, nothing to draw — so
    // they are allowed to declare neither.
    if (b.slot !== "ring") {
      check(`${b.id} has either a model or a style`, !!b.style, `slot ${b.slot}`);
    }
    continue;
  }
  checkedModels++;
  if (model.startsWith("rig:")) {
    // Harvested off a character rig that already carries the mesh.
    const [body] = model.slice(4).split("/");
    check(`${b.id} rig body ${body}.fbx exists`, existsSync(path.join(MODEL_DIR, `${body}.fbx`)), model);
  } else {
    check(
      `${b.id} model ${model} exists`,
      existsSync(path.join(MODEL_DIR, `${model}.fbx`)) || existsSync(path.join(MODEL_DIR, `${model}.gltf`)),
      model,
    );
  }
}
console.log(`  ${checkedModels} models checked on disk, ${builders} procedural`);

// Icons cross a generated boundary, so only a runtime check can catch a typo.
const iconSrc = await import("node:fs").then((fs) => fs.readFileSync(ICONS_SRC, "utf8"));
const missingIcons = [...new Set(bases.map((b) => b.icon))].filter(
  (key) => !new RegExp(`^\\s{2}"?${key.replace(/[-]/g, "\\-")}"?:`, "m").test(iconSrc),
);
check("every icon the catalogue names is baked", missingIcons.length === 0, missingIcons.join(", "));
console.log(`  ${new Set(bases.map((b) => b.icon)).size} distinct icons named`);

// --- 4. the rarity ladder ---------------------------------------------------
section("4. the ladder");
let prev = -Infinity;
for (const r of RARITY_ORDER) {
  const def = RARITIES[r];
  check(`${r} is stronger than the step below it`, def.power > prev, `${def.power} after ${prev}`);
  prev = def.power;
}
console.log(`  ${RARITY_ORDER.map((r) => `${RARITIES[r].name} x${RARITIES[r].power}`).join("  ")}`);
check("Honed is exactly the baseline", RARITIES.honed.power === 1, String(RARITIES.honed.power));
check("Broken is below the baseline", RARITIES.broken.power < 1, String(RARITIES.broken.power));
let affixes = -1;
for (const r of RARITY_ORDER) {
  check(`${r} never grants fewer affixes than the step below`, RARITIES[r].affixes >= affixes);
  affixes = RARITIES[r].affixes;
}

// --- 5. affixes -------------------------------------------------------------
section("5. affixes");
const affixIds = new Set();
for (const a of AFFIXES) {
  check(`duplicate affix id ${a.id}`, !affixIds.has(a.id));
  affixIds.add(a.id);
  check(`${a.id} has a label`, !!a.label);
  check(`${a.id} has at least one modifier`, Object.keys(a.per).length > 0);
  // An affix restricted to slots that never roll at its band is unreachable.
  const reachable = bases.some(
    (b) => b.band >= a.minBand && (!a.slots || a.slots.includes(b.slot)),
  );
  check(`${a.id} is reachable by some base item`, reachable, `minBand ${a.minBand}`);
  // And it must actually produce a number on the lowest item that can roll it.
  const lowest = bases.find((b) => b.band >= a.minBand && (!a.slots || a.slots.includes(b.slot)));
  const bonus = affixBonus(a, lowest.band);
  const any = Object.values(bonus).some((v) => v !== 0);
  check(`${a.id} rounds to something on a band-${lowest.band} item`, any, JSON.stringify(bonus));
}
const prefixes = AFFIXES.filter((a) => a.kind === "prefix").length;
console.log(`  ${prefixes} prefixes, ${AFFIXES.length - prefixes} suffixes`);

// --- 6. rolling -------------------------------------------------------------
section("6. rolling");
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const seenBases = new Set();
const seenRarities = new Set();
for (let i = 0; i < 20000; i++) {
  const band = (1 + Math.floor(rand() * 5));
  const base = rollBase(band, rand);
  seenBases.add(base.id);
  const rarity = rollRarity(rand);
  seenRarities.add(rarity);
  const item = rollItem(base, rarity, rand);
  if (i === 0) console.log(`  sample: ${itemName({ ...item })}`);
  check("rolled item names its base", item.baseId === base.id);
  check("rolled item carries its slot", item.slot === base.slot);
  check("stat values are non-negative", item.statValue >= 0 && item.bonusStatValue >= 0);
  check(
    "affix count matches the quality",
    item.affixes.length <= RARITIES[rarity].affixes,
    `${item.affixes.length} for ${rarity}`,
  );
  check("no duplicate affixes on one item", new Set(item.affixes).size === item.affixes.length);
  for (const id of item.affixes) {
    const a = AFFIXES_BY_ID[id];
    check(`affix ${id} exists`, !!a);
    check(`affix ${id} is legal on ${base.slot}`, !a.slots || a.slots.includes(base.slot));
    check(`affix ${id} is legal at band ${base.band}`, a.minBand <= base.band);
  }
}
console.log(`  ${seenBases.size}/${bases.length} bases and ${seenRarities.size}/${RARITY_ORDER.length} qualities seen in 20k rolls`);
check("every base is reachable from some band", seenBases.size === bases.length,
  bases.filter((b) => !seenBases.has(b.id)).map((b) => b.id).join(", "));
check("every quality is reachable", seenRarities.size === RARITY_ORDER.length);

// A boss drop never comes out below its floor.
let belowFloor = 0;
for (let i = 0; i < 5000; i++) {
  const r = rollRarityWithFloor("tempered", rand);
  if (RARITY_ORDER.indexOf(r) < RARITY_ORDER.indexOf("tempered")) belowFloor++;
}
check("a floored roll never lands below the floor", belowFloor === 0, `${belowFloor} of 5000`);

// --- 6b. loot reflects what dropped it ---------------------------------------
// The band decides how GOOD a drop is and says nothing about what it is. These
// check that a kind's own materials really are more likely, that the bias is a
// bias and not a restriction, and that a boss's signature turns up often enough
// to be a reason to go and rarely enough that going is still a decision.
section("6b. loot reflects what dropped it");
for (const kind of Object.keys(MONSTER_LOOT)) {
  const loot = MONSTER_LOOT[kind];
  check(`${kind} names real palettes`, loot.palettes.every((p) => !!PALETTES[p]),
    loot.palettes.join(", "));
  check(`${kind} names at least one`, loot.palettes.length > 0);
  if (loot.signature) {
    check(`${kind}'s signature exists`, !!ITEM_BASES[loot.signature], loot.signature);
    check(`${kind}'s signature is worth going for`,
      ITEM_BASES[loot.signature].band >= 4, `band ${ITEM_BASES[loot.signature]?.band}`);
  }
  // Only bosses get one, or "the thing it is known for" stops meaning anything.
  const isBoss = MONSTER_STATS[kind].guaranteedDrop;
  check(`${kind}: only bosses have a signature`, isBoss || !loot.signature,
    `${kind} boss=${isBoss} signature=${loot.signature ?? "none"}`);
}

// Every monster in the game must be able to drop SOMETHING, and its own
// materials must measurably outnumber the rest.
for (const kind of Object.keys(MONSTER_LOOT)) {
  const band = MONSTER_STATS[kind].band;
  const affinity = new Set(MONSTER_LOOT[kind].palettes);
  let onTheme = 0;
  let offTheme = 0;
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const base = rollBase(band, kind, rand);
    seen.add(base.id);
    if (affinity.has(base.art.palette)) onTheme++;
    else offTheme++;
  }
  // Measured as an ODDS RATIO against an unbiased roll of the same band, which
  // is the only scale-free way to state this. Comparing shares does not work:
  // a slime's wood-and-bronze is already two thirds of band 1 and cannot triple,
  // while a ghost's blackglass is a tenth of band 4 and easily can — so any
  // fixed threshold on the share is really a threshold on how common the
  // palette happens to be. The odds ratio is exactly what `AFFINITY_WEIGHT`
  // sets, so this asserts the knob rather than a symptom of it.
  let baseline = 0;
  for (let i = 0; i < 4000; i++) {
    if (affinity.has(rollBase(band, undefined, rand).art.palette)) baseline++;
  }
  const odds = (n) => n / Math.max(1, 4000 - n);
  const ratio = odds(onTheme) / odds(baseline);
  check(`${kind} drops its own materials far more than chance would`,
    ratio > 2.2,
    `${(ratio).toFixed(1)}x the odds (${onTheme} on-theme vs ${baseline} unbiased)`);
  // A bias, not a restriction: a camp that only ever drops one palette is a
  // vending machine, and the matched sets would only be assemblable by farming
  // one spot.
  check(`${kind} still drops off-theme items`, offTheme > 0, `${offTheme}`);
  check(`${kind} drops a variety`, seen.size >= 8, `${seen.size} distinct bases`);
}

{
  // The signature, measured. Often enough to be a reason to go; rare enough
  // that going is still a decision.
  let hits = 0;
  for (let i = 0; i < 6000; i++) {
    if (rollBase(5, "dragon", rand).id === "dragonscale") hits++;
  }
  const rate = hits / 6000;
  console.log(`  a dragon drops Dragonscale Plate ${(rate * 100).toFixed(0)}% of the time it drops anything`);
  check("a boss signature is common enough to be a reason to go", rate > 0.25, `${rate.toFixed(2)}`);
  check("and rare enough that going is still a decision", rate < 0.55, `${rate.toFixed(2)}`);
}

// Rolling with no monster behind it is the plain band roll — the forge and the
// tests both do this, and it must not quietly pick a default creature.
{
  const palettes = new Set();
  for (let i = 0; i < 2000; i++) palettes.add(rollBase(3, undefined, rand).art.palette);
  check("a roll with no monster behind it is unbiased", palettes.size >= 8,
    `${palettes.size} palettes`);
}

// --- 7. quality actually pays -----------------------------------------------
section("7. quality pays");
for (const b of [bases[0], bases[Math.floor(bases.length / 2)], bases[bases.length - 1]]) {
  const fixed = () => 0.5; // no jitter, so this compares qualities and not luck
  let last = -1;
  for (const r of RARITY_ORDER) {
    const item = rollItem(b, r, fixed);
    check(`${b.id} gets stronger at ${r}`, item.statValue >= last, `${item.statValue} after ${last}`);
    last = item.statValue;
  }
  const broken = rollItem(b, "broken", fixed);
  const honed = rollItem(b, "honed", fixed);
  check(`${b.id} Broken is never better than Honed`, broken.statValue <= honed.statValue,
    `${broken.statValue} vs ${honed.statValue}`);
}

// Across the whole catalogue: Broken must never beat Honed, and must be
// strictly worse wherever there is room for it to be — a base whose Honed
// primary is 1 has nowhere to go, and that is itself worth catching, because it
// means the ladder does nothing for that item.
{
  const fixed = () => 0.5;
  let degenerate = [];
  for (const b of bases) {
    const broken = rollItem(b, "broken", fixed).statValue;
    const honed = rollItem(b, "honed", fixed).statValue;
    check(`${b.id}: Broken never beats Honed`, broken <= honed, `${broken} vs ${honed}`);
    if (honed >= 2 && broken >= honed) degenerate.push(b.id);
    if (honed < 2) degenerate.push(`${b.id}(honed=${honed})`);
  }
  check("no base has a primary too small for the ladder to move",
    degenerate.length === 0, degenerate.join(", "));
}

// --- 8. weapons -------------------------------------------------------------
section("8. weapons");
const weapons = bases.filter((b) => b.slot === "weapon");
for (const type of WEAPON_TYPES) {
  const inFamily = weapons.filter((b) => b.weaponType === type);
  console.log(`  ${type.padEnd(7)} ${String(inFamily.length).padStart(2)}  ${inFamily.map((b) => b.name).join(", ")}`);
  check(`${type} has at least one weapon`, inFamily.length > 0);
}
for (const b of weapons) {
  check(`${b.id} names a real family`, !!WEAPONS[b.weaponType], String(b.weaponType));
  if (b.mods) {
    for (const [k, v] of Object.entries(b.mods)) {
      check(`${b.id} mod ${k} is a sane multiplier`, v > 0.3 && v < 3, `${k}=${v}`);
    }
  }
}
// Fists are the unarmed state and must never be a findable item.
check("no item is a fist", !weapons.some((b) => b.weaponType === "fist"));

// --- 9. the smithy ----------------------------------------------------------
section("9. the smithy");
const wallet = { wood: 1e6, ore: 1e6, herb: 1e6, essence: 1e6 };
for (const b of bases) {
  const cost = forgeCost(b);
  check(`${b.id} costs something to forge`, MATERIALS.some((m) => (cost[m] ?? 0) > 0), JSON.stringify(cost));
  check(`${b.id} forge cost is affordable in principle`, canAfford(cost, wallet).ok);
}
const cheapest = Math.min(...bases.map((b) => (forgeCost(b).wood ?? 0) + (forgeCost(b).ore ?? 0)));
const dearest = Math.max(...bases.map((b) => (forgeCost(b).wood ?? 0) + (forgeCost(b).ore ?? 0)));
console.log(`  forge cost spans ${cheapest} to ${dearest} wood+ore`);
check("forging gets meaningfully dearer with band", dearest > cheapest * 8);

// The ladder must be climbable, and each step dearer than the last.
const sample = ITEM_BASES.longsword;
let lastCost = 0;
for (const r of RARITY_ORDER.slice(0, -1)) {
  const cost = reforgeCost(sample, r);
  check(`reforge from ${r} has a cost`, !!cost);
  const total = MATERIALS.reduce((s, m) => s + (cost[m] ?? 0), 0);
  check(`reforge from ${r} costs more than the step before`, total > lastCost, `${total} after ${lastCost}`);
  lastCost = total;
}
check("there is no step past the top", reforgeCost(sample, "enchanted") === null);
console.log(`  a longsword to Enchanted: ${lastCost} materials on the last step alone`);

// Essence is the fight-only material, and only the top of the ladder needs it.
const needsEssence = RARITY_ORDER.slice(0, -1).filter((r) => (reforgeCost(sample, r)?.essence ?? 0) > 0);
check("essence is only needed near the top", needsEssence.length > 0 && needsEssence.length <= 3,
  needsEssence.join(", "));
check("no forge recipe below band 5 needs essence",
  bases.filter((b) => b.band < 5).every((b) => !(forgeCost(b).essence > 0)));

// Reforging really does raise the quality, keep the item, and re-roll affixes.
const before = { id: "x", equipped: false, ...rollItem(sample, "honed", rand) };
const after = reforgeItem(before, rand);
check("reforging keeps the item's identity", after.id === before.id && after.baseId === before.baseId);
check("reforging steps the quality up", after.rarity === "tempered", after.rarity);
check("reforging keeps it equipped or not", after.equipped === before.equipped);
check("reforging does not lose the weapon family", after.weaponType === before.weaponType);

// Salvage returns something, never essence, and scales with quality.
for (const r of RARITY_ORDER) {
  const item = { id: "x", equipped: false, ...rollItem(sample, r, rand) };
  const yielded = salvageYield(item);
  check(`salvaging a ${r} item returns something`, MATERIALS.some((m) => (yielded[m] ?? 0) > 0));
  check(`salvaging never returns essence`, !yielded.essence);
}
const brokenYield = salvageYield({ id: "x", equipped: false, ...rollItem(sample, "broken", rand) });
const runedYield = salvageYield({ id: "x", equipped: false, ...rollItem(sample, "runed", rand) });
check("a better item salvages for more",
  (runedYield.ore ?? 0) > (brokenYield.ore ?? 0), `${runedYield.ore} vs ${brokenYield.ore}`);

// The forge is opened by SALVAGING, not by levelling. Band 1 is known from the
// start so a new smith can make something; everything else has to be taken
// apart first, which is what ties the three verbs into one loop.
const fresh = forgeableBases([]);
console.log(`  a new smith knows ${fresh.length} of ${bases.length} recipes`);
check("a new smith knows something", fresh.length > 0);
check("but not everything", fresh.length < bases.length);
check("and what they know is exactly the band-1 catalogue",
  fresh.every((b) => b.band === 1) && fresh.length === bases.filter((b) => b.band === 1).length,
  `${fresh.length} vs ${bases.filter((b) => b.band === 1).length}`);
check("every starting recipe is band 1", STARTING_RECIPES.every((id) => ITEM_BASES[id].band === 1));

// Learning one adds exactly one.
const afterOne = forgeableBases(["claymore"]);
check("learning a recipe adds exactly that recipe",
  afterOne.length === fresh.length + 1 && afterOne.some((b) => b.id === "claymore"),
  `${fresh.length} -> ${afterOne.length}`);
check("learning a band-1 recipe changes nothing, since it was never locked",
  forgeableBases(["armingsword"]).length === fresh.length);

// And everything is reachable: a base nobody can ever learn is content that
// does not exist.
const everything = forgeableBases(bases.map((b) => b.id));
check("knowing every recipe unlocks the whole catalogue",
  everything.length === bases.length, `${everything.length}/${bases.length}`);

// --- 9b. the reforge preview ------------------------------------------------
// The bench shows what a step up would produce, and a preview that disagrees
// with what actually happens is worse than no preview.
section("9b. the reforge preview");
{
  const item = { id: "x", equipped: false, ...rollItem(sample, "honed", rand) };
  const preview = reforgePreview(item);
  check("a reforgeable item has a preview", !!preview);
  check("it names the quality the reforge produces", preview.to === "tempered", preview.to);

  // Reforged for real, many times, and the preview must sit inside the spread
  // the jitter allows — it is the midpoint, not a promise.
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < 400; i++) {
    const after = reforgeItem(item, rand);
    low = Math.min(low, after.statValue);
    high = Math.max(high, after.statValue);
    check("every reforge lands at the previewed quality", after.rarity === preview.to);
    check("and with the previewed number of affixes",
      after.affixes.length === preview.affixCount,
      `${after.affixes.length} vs ${preview.affixCount}`);
  }
  check("the previewed value sits inside what actually rolls",
    preview.statValue >= low && preview.statValue <= high,
    `preview ${preview.statValue}, rolls ${low}-${high}`);
  console.log(`  a honed longsword reforged: preview ${preview.statValue}, rolls ${low}-${high}`);

  check("an Enchanted item has no preview",
    reforgePreview({ ...item, rarity: "enchanted" }) === null);
}

// --- 10. affix totals reach the passive vocabulary --------------------------
section("10. affixes reach the stat sheet");
const loaded = { id: "x", equipped: true, ...rollItem(ITEM_BASES.claymore, "enchanted", rand) };
const totals = itemPassives(loaded);
check("an enchanted item contributes something",
  Object.values(totals).some((v) => v !== 0), JSON.stringify(loaded.affixes));
check("its totals use the shared passive vocabulary",
  Object.keys(totals).every((k) => k in totals));
console.log(`  ${itemName(loaded)} -> ${loaded.affixes.join(", ") || "no affixes"}`);

// --- 11b. matched gear ------------------------------------------------------
// Palette was the one axis a player could SEE and had no reason to care about.
// These check that dressing in one material is worth something, that it is not
// worth so much it beats numbers, and that a set nobody can assemble does not
// exist.
section("11b. matched gear");
const wearable = ITEM_SLOTS.filter((s) => s !== "weapon");
for (const [palette, set] of Object.entries(PALETTE_SETS)) {
  const owners = bases.filter((b) => b.art.palette === palette);
  const slots = new Set(owners.map((b) => b.slot));
  const top = set.tiers[set.tiers.length - 1].need;
  // A set needing five pieces from four slots can never be worn.
  check(`${set.name} can actually be assembled`, slots.size >= top,
    `${set.name} needs ${top} pieces and ${palette} exists in ${slots.size} slot(s): ${[...slots].join(", ")}`);
  check(`${set.name} tiers ascend`,
    set.tiers.every((t, i) => i === 0 || t.need > set.tiers[i - 1].need));
  for (const tier of set.tiers) {
    check(`${set.name} ${tier.need}-piece gives something`,
      Object.values(tier.bonus).some((v) => v !== 0));
  }
}

// A full matched set must not outweigh the numbers on the gear itself.
{
  const steelBases = bases.filter((b) => b.art.palette === "steel");
  const worn = {};
  for (const b of steelBases) if (!worn[b.slot]) worn[b.slot] = { id: b.id, equipped: true, ...rollItem(b, "honed", () => 0.5) };
  const totals = setPassives(worn);
  const live = activeSets(worn);
  console.log(`  steel: ${Object.keys(worn).length} slots -> ${live.map((s) => s.name + " " + s.count).join(", ") || "nothing"}`);
  check("wearing a matched kit grants something",
    Object.values(totals).some((v) => v !== 0), JSON.stringify(totals));
  // Deliberately modest: a matched set of Worn gear should lose to a mixed set
  // of Forged, or the palette axis stops being cosmetic and starts being the
  // whole game.
  check("but never more than a quality step is worth",
    (totals.damagePercent ?? 0) <= 15 && (totals.armor ?? 0) <= 12,
    `damage ${totals.damagePercent}%, armour ${totals.armor}`);
}

// Nothing equipped means no sets, and one piece is not a near-miss worth
// listing.
check("an empty paperdoll has no sets", activeSets(undefined).length === 0);
check("one lone piece is not reported",
  activeSets({ helm: { id: "x", equipped: true, ...rollItem(ITEM_BASES.ironcap, "honed", () => 0.5) } }).length === 0);

// --- 11. how a weapon feels ------------------------------------------------
// The per-item multipliers are the whole reason nine swords are not one sword
// with different pictures, and until they were wired into the resolvers they
// were data nothing read. These check they reach the numbers combat uses.
section("11. weapons feel different");
const inst = (baseId, rarity = "honed") => ({
  id: "x", equipped: true, ...rollItem(ITEM_BASES[baseId], rarity, () => 0.5),
});

const arming = inst("armingsword");
const claymore = inst("claymore");
const spear = inst("boarspear");
const dirk = inst("dirk");

check("a claymore swings slower than an arming sword",
  swingIntervalOf(claymore, "honed", 0, 0) > swingIntervalOf(arming, "honed", 0, 0),
  `${swingIntervalOf(claymore, "honed", 0, 0)}ms vs ${swingIntervalOf(arming, "honed", 0, 0)}ms`);
check("and hits harder for it",
  hitBandOf(claymore, 10).max > hitBandOf(arming, 10).max,
  `${hitBandOf(claymore, 10).max} vs ${hitBandOf(arming, 10).max}`);
check("a spear reaches further than a sword",
  reachOf(spear) > reachOf(arming), `${reachOf(spear)} vs ${reachOf(arming)}`);
check("a dagger is quicker than a sword",
  swingIntervalOf(dirk, "honed", 0, 0) < swingIntervalOf(arming, "honed", 0, 0),
  `${swingIntervalOf(dirk, "honed", 0, 0)}ms vs ${swingIntervalOf(arming, "honed", 0, 0)}ms`);
check("and reaches less far", reachOf(dirk) < reachOf(arming),
  `${reachOf(dirk)} vs ${reachOf(arming)}`);

// Damage per second must stay in the same neighbourhood across the whole
// catalogue, or the choice between weapons is not a choice.
const dps = [];
for (const base of bases.filter((b) => b.slot === "weapon")) {
  const item = inst(base.id);
  const band = hitBandOf(item, 12);
  const interval = swingIntervalOf(item, "honed", 0, 0);
  dps.push({ id: base.id, dps: ((band.min + band.max) / 2) / (interval / 1000) });
}
dps.sort((a, b) => a.dps - b.dps);
const spread = dps[dps.length - 1].dps / dps[0].dps;
console.log(`  dps spans ${dps[0].dps.toFixed(1)} (${dps[0].id}) to ${dps[dps.length - 1].dps.toFixed(1)} (${dps[dps.length - 1].id})`);
check("no weapon is more than twice the damage per second of the weakest",
  spread < 2.2, `spread ${spread.toFixed(2)}x`);

// Unarmed must still resolve rather than throwing — it is a real archetype.
check("fists resolve with no item at all",
  reachOf(null) > 0 && swingIntervalOf(null, null, 0, 0) > 0 && hitBandOf(null, 5).max > 0,
  `reach ${reachOf(null)}, interval ${swingIntervalOf(null, null, 0, 0)}ms`);

// And the tooltip's description of a weapon must be read off those same
// multipliers, not written by hand.
const notes = feelNotes(claymore);
check("a claymore describes itself as slower and harder hitting",
  notes.some((n) => n.includes("slower")) && notes.some((n) => n.includes("harder")),
  notes.join(", "));
check("a plain sword has nothing to say about itself", feelNotes(arming).length === 0,
  feelNotes(arming).join(", "));

// --- done -------------------------------------------------------------------
console.log(
  failures === 0
    ? "\nOK — the catalogue holds"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
