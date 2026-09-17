// WHAT IS ACTUALLY IN THE CATALOGUE, counted rather than remembered.
//
//   node tools/soak/tally.mjs
//
// Asked, after a long run of adding items: "are we done with items?" The honest
// answer is a count, and a count of the right things — not how many rows there
// are, but how thin the thinnest shelf is, and how many of them share a picture
// in the bag.
import { ITEM_BASES } from "../../shared/items.ts";
import { GEAR_STYLES } from "../../shared/protocol-types.ts";

const bases = Object.values(ITEM_BASES);
const tally = (pick) => {
  const m = new Map();
  for (const b of bases) {
    const k = pick(b);
    if (k == null) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};
const row = (label, pairs) =>
  console.log(`  ${label.padEnd(18)}${pairs.map(([k, n]) => `${k} ${n}`).join("   ")}`);

console.log(`\n${bases.length} base items, ${GEAR_STYLES.length} gear styles\n`);
row("by slot", tally((b) => b.slot));
console.log("");
row("weapon families", tally((b) => b.weaponType));
console.log("");
for (const slot of ["armor", "helm", "boots", "cape"]) {
  row(slot, tally((b) => (b.slot === slot ? b.style : null)));
}

// THE THINNEST SHELF, which is what "are we done" really asks. A band with one
// item in a family is not a choice.
console.log("\nfamilies with only one item in a band:");
const thin = [];
for (const [family] of tally((b) => b.weaponType)) {
  for (let band = 1; band <= 5; band++) {
    const n = bases.filter((b) => b.weaponType === family && b.band === band).length;
    if (n <= 1) thin.push(`${family} band ${band}: ${n}`);
  }
}
for (const slot of ["armor", "helm", "boots", "cape", "offhand", "ring"]) {
  for (let band = 1; band <= 5; band++) {
    const n = bases.filter((b) => b.slot === slot && b.band === band).length;
    if (n <= 1) thin.push(`${slot} band ${band}: ${n}`);
  }
}
console.log(thin.length ? "  " + thin.join("\n  ") : "  none");

// AND HOW MANY ITEMS SHARE A PICTURE. The bag shows an icon, not a model, so
// two hundred items behind twenty icons is two hundred items that look alike
// in the one place a player reads them as a list.
const icons = tally((b) => b.icon);
console.log(`\n${icons.length} distinct icons for ${bases.length} items`);
console.log("  most shared: " + icons.slice(0, 6).map(([k, n]) => `${k} ${n}`).join("   "));
