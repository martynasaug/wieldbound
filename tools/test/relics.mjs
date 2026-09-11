// THE TOP OF THE LADDER, AND THE HOLES UNDER IT.
//
// Two things this file guards, both of which fail in total silence.
//
// FIRST, WEAPON FAMILY COVERAGE. The weapon decides the class in this game, so
// a family with a gap at some band is a BUILD with a gap at that band: a mage
// reaching the third ring with no band-3 staff either skips a tier or stops
// being a mage. Counted before M70.248 there were three such holes — mace at
// band 2, staff at band 3, wand at band 2 — and nothing anywhere would ever
// have said so. The catalogue is a list; a list cannot notice its own absences.
//
// SECOND, THE RELICS. Three late-game uniques, each reachable only by killing a
// particular boss, taking its trophy apart, and paying in essence. Every link
// in that chain is a field in a table pointing at another table, and every one
// of them can be broken by an edit that looks harmless:
//
//   * a signature that stops naming a relic, or names one that does not exist,
//     leaves the boss dropping a trophy that teaches how to make another
//     trophy — and the relic unreachable by any route at all;
//   * a relic that becomes a basic recipe is forgeable from the first login;
//   * a relic whose cost loses its essence is payable by standing at a tree,
//     which is the one thing the whole essence rule exists to prevent.
//
//   node tools/test/relics.mjs
import { ITEM_BASES, MONSTER_LOOT, forgeCost, isBasicRecipe } from "../../shared/items.ts";
import { MONSTER_STATS } from "../../shared/protocol-types.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

section("1. every weapon family is buildable at every band");
{
  const families = {};
  for (const b of Object.values(ITEM_BASES)) {
    if (b.slot !== "weapon" || !b.weaponType) continue;
    (families[b.weaponType] ??= new Set()).add(b.band);
  }
  // `fist` is the bare-handed archetype and has no items by design — being
  // unarmed is the whole of it.
  for (const [family, bands] of Object.entries(families)) {
    const missing = [1, 2, 3, 4, 5].filter((n) => !bands.has(n));
    check(
      `${family} has something at every band`,
      missing.length === 0,
      `nothing at band ${missing.join(", ")} — that tier cannot be played as a ${family} user`,
    );
  }
  console.log(`  ${Object.keys(families).length} families, bands 1-5`);
}

section("2. no slot is a uniform at any band");
{
  // One option at a band means every character passing through that tier wears
  // the same thing. Not a failure — some slots are genuinely sparse — but worth
  // printing, because it is where the catalogue is thin.
  const grid = {};
  for (const b of Object.values(ITEM_BASES)) (grid[b.slot] ??= {})[b.band] = ((grid[b.slot] ?? {})[b.band] ?? 0) + 1;
  const thin = [];
  for (const [slot, bands] of Object.entries(grid)) {
    for (const band of [1, 2, 3, 4, 5]) {
      const n = bands[band] ?? 0;
      if (n === 0) check(`${slot} exists at band ${band}`, false, "no option at all");
      else if (n === 1) thin.push(`${slot} b${band}`);
    }
  }
  console.log(`  single-option slots: ${thin.length ? thin.join(", ") : "none"}`);
}

section("3. the relics are reachable, and only the hard way");
{
  // Found by walking the signatures rather than by a second list of relic ids:
  // a hand-written list is the thing that goes stale when a signature is
  // retargeted, and this must follow the same pointer the game follows.
  const taught = [];
  for (const [kind, loot] of Object.entries(MONSTER_LOOT)) {
    if (!loot.signature) continue;
    const sig = ITEM_BASES[loot.signature];
    check(`${kind}'s signature exists`, !!sig, `"${loot.signature}" is not in the catalogue`);
    if (!sig) continue;
    check(
      `${kind} is worth the trip`,
      MONSTER_STATS[kind]?.guaranteedDrop === true,
      "a signature on something that does not always drop is a trophy nobody can rely on",
    );
    if (!sig.teaches) continue;
    const relic = ITEM_BASES[sig.teaches];
    check(`${sig.name} teaches something real`, !!relic, `teaches "${sig.teaches}", which is not a base`);
    if (!relic) continue;
    taught.push({ kind, sig, relic });
  }

  check("every boss signature opens a relic", taught.length === 3, `${taught.length} of 3`);
  for (const { kind, sig, relic } of taught) {
    const cost = forgeCost(relic);
    check(`${relic.name} is not forgeable from scratch`, !isBasicRecipe(relic.id), "a basic recipe needs no boss");
    check(`${relic.name} costs essence`, (cost.essence ?? 0) > 0, "payable by standing at a tree");
    check(`${relic.name} prices itself`, !!relic.forge, "falling back to the band price makes it an ordinary band-5 item");
    // Lopsided on purpose: a top tier of items that are the old ones with
    // bigger numbers is a tier with no decision in it.
    const lopsided = (relic.power ?? 1) >= 1.25 || (relic.guard ?? 1) >= 1.25;
    check(`${relic.name} is lopsided rather than simply bigger`, lopsided, "no trade-off in it");
    console.log(
      `  ${kind} -> ${sig.name} -> ${relic.name} (${relic.slot}, ${cost.essence} essence)`,
    );
  }

  // Nothing ELSE may teach a relic, or the boss is decoration.
  const relicIds = new Set(taught.map((t) => t.relic.id));
  for (const b of Object.values(ITEM_BASES)) {
    if (!b.teaches) continue;
    const isSignature = Object.values(MONSTER_LOOT).some((l) => l.signature === b.id);
    check(`${b.name} teaching a relic is a boss signature`, isSignature, "a second route around the boss");
  }
  check("relics are not taught by themselves", ![...relicIds].some((id) => ITEM_BASES[id]?.teaches), "");
}

console.log(failures === 0 ? "\nOK — the ladder has a top and no holes in it" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
