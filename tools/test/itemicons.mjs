// EVERY ITEM'S ICON HAS TO EXIST.
//
//   node tools/test/itemicons.mjs
//
// `ItemBase.icon` is typed `string`, not a union, so nothing stops a row naming
// a picture the icon set does not have — and the failure is SILENT: the bag
// draws a blank square, and finding which of a hundred and eighty rows is blank
// by looking at the running game is the kind of hunt worth designing out. The
// same argument `tools/art/icons.mjs` makes for validating game-icons names
// before it fetches anything, one layer further in.
//
// It also holds the line the icons were added for. Eighty-two weapons used to
// share eight pictures; if that ever comes back — a family of ten sharing one
// icon — this says so, because "they all look the same in the bag" is a
// complaint that arrives about the list, not about any one row.
import { readFileSync } from "node:fs";
import { ITEM_BASES, ITEM_ICON } from "../../shared/items.ts";

const src = readFileSync("client/src/ui/icons.ts", "utf8");
const bases = Object.values(ITEM_BASES);
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : " — " + detail}`);
  if (!ok) failures++;
};

/** Every key the baked module defines, read from its source. */
const baked = new Set([...src.matchAll(/^\s{2}"([a-z0-9-]+)":/gm)].map((m) => m[1]));

console.log(`\n1. every icon an item names is in the baked set  (${baked.size} icons)`);
const missing = [...new Set(bases.map((b) => b.icon))].filter((i) => !baked.has(i));
check(
  `${bases.length} items name ${new Set(bases.map((b) => b.icon)).size} icons`,
  missing.length === 0,
  missing.length ? `not baked: ${missing.join(", ")}` : "",
);

console.log("\n2. every ITEM_ICON entry points at a real item and a real icon");
const ids = new Set(bases.map((b) => b.id));
const strayItem = Object.keys(ITEM_ICON).filter((id) => !ids.has(id));
const strayIcon = Object.values(ITEM_ICON).filter((i) => !baked.has(i));
check(`${Object.keys(ITEM_ICON).length} entries`, strayItem.length === 0 && strayIcon.length === 0,
  [strayItem.length ? `no such item: ${strayItem.join(", ")}` : "",
   strayIcon.length ? `no such icon: ${strayIcon.join(", ")}` : ""].filter(Boolean).join("; "));

// A WHOLE FAMILY BEHIND ONE PICTURE IS THE FAULT THIS EXISTS TO CATCH. Gear
// slots share by STYLE on purpose — a Chain Mail and a Ring Mail are the same
// garment in different metal — so the rule is about weapons and off-hands,
// where every item is its own object.
console.log("\n3. no weapon family hides behind a single icon");
const held = bases.filter((b) => b.slot === "weapon" || b.slot === "offhand");
const families = new Map();
for (const b of held) {
  const k = b.weaponType ?? "offhand";
  if (!families.has(k)) families.set(k, new Set());
  families.get(k).add(b.icon);
}
for (const [family, icons] of [...families].sort()) {
  const n = held.filter((b) => (b.weaponType ?? "offhand") === family).length;
  check(`${family}: ${n} items, ${icons.size} icons`, icons.size >= Math.min(n, 3),
    `${n} items sharing ${icons.size}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nOK — every item has a picture, and no family shares one");
process.exit(failures ? 1 : 0);
