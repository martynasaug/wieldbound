// Checks the bag: what shares a cell, and when one more thing fits.
//
// Its own file rather than another section of items.mjs, because the failures
// it catches are a different kind. The catalogue suite asks whether the DATA is
// coherent — a model that is not on disk, a ladder that is not monotonic. This
// asks whether the one rule the bag and the server share still agrees with
// itself: the client draws cells, the server counts cells to decide whether a
// drop fits, and if those two ever compute a different number the symptom is a
// drop that vanishes into a bag with visible space in it.
//
//   node tools/test/bag.mjs

import { INVENTORY_CAP } from "../../shared/protocol-types.ts";
import {
  ITEM_BASES,
  STACK_LIMIT,
  bagRoomFor,
  bagSlotsUsed,
  bagStacks,
  itemScore,
  stackKeyOf,
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

let nextId = 0;
/** An instance, near enough for the grouping rules — which read four fields. */
function inst(baseId, rarity = "worn", affixes = [], statValue = 5, equipped = false) {
  const base = ITEM_BASES[baseId];
  return {
    id: `i${++nextId}`,
    baseId,
    slot: base.slot,
    rarity,
    statValue,
    bonusStatValue: 2,
    affixes,
    equipped,
    weaponType: base.weaponType,
    style: base.style,
  };
}

const SWORD = Object.values(ITEM_BASES).find((b) => b.slot === "weapon").id;
const HELM = Object.values(ITEM_BASES).find((b) => b.slot === "helm").id;

// --- 1. what counts as the same thing ---------------------------------------
section("1. what shares a cell");

check(
  "the same base, quality and affixes stack",
  stackKeyOf(inst(SWORD, "worn", ["keen"])) === stackKeyOf(inst(SWORD, "worn", ["keen"])),
);
check(
  "a different quality does not",
  stackKeyOf(inst(SWORD, "worn")) !== stackKeyOf(inst(SWORD, "honed")),
);
check(
  "a different base does not",
  stackKeyOf(inst(SWORD)) !== stackKeyOf(inst(HELM)),
);
check(
  "an affix makes it a different thing",
  stackKeyOf(inst(SWORD, "worn", ["keen"])) !== stackKeyOf(inst(SWORD, "worn", [])),
);
// The roll order is an accident of the dice; two items carrying the same two
// affixes are the same item whichever order they came out in.
check(
  "affix order does not matter",
  stackKeyOf(inst(SWORD, "worn", ["keen", "archive"])) ===
    stackKeyOf(inst(SWORD, "worn", ["archive", "keen"])),
);
// Everything a cell shows describes the best of the pile, so if this were not
// true the numbers on the slot would belong to an item a click cannot equip.
const pile = [inst(SWORD, "worn", [], 4), inst(SWORD, "worn", [], 9), inst(SWORD, "worn", [], 6)];
check(
  "a stack's `best` is the best-rolled in it",
  bagStacks(pile)[0].best.statValue === 9,
  String(bagStacks(pile)[0].best.statValue),
);
check(
  "and `best` is what itemScore would pick",
  bagStacks(pile)[0].best === [...pile].sort((a, b) => itemScore(b) - itemScore(a))[0],
);

// --- 2. cells, not instances ------------------------------------------------
section("2. how many cells that is");

const six = Array.from({ length: 6 }, () => inst(SWORD));
check("six of one kind is one cell", bagSlotsUsed(six) === 1, String(bagSlotsUsed(six)));
check("and the cell knows it holds six", bagStacks(six)[0].count === 6);

const spill = Array.from({ length: STACK_LIMIT + 1 }, () => inst(SWORD));
check(
  "a cell holds no more than the limit, and spills into a second",
  bagSlotsUsed(spill) === 2 && bagStacks(spill)[0].count === STACK_LIMIT,
  `${bagSlotsUsed(spill)} cells, first holds ${bagStacks(spill)[0].count}`,
);

// Worn, not carried. The bag's own readout has always excluded equipped items;
// before this the CAP counted them, so a dressed character was refused a drop
// while the panel said there were seven slots free.
const dressed = [inst(SWORD, "worn", [], 5, true), inst(HELM, "worn", [], 5, true), inst(SWORD)];
check(
  "equipped items take no cell",
  bagSlotsUsed(dressed) === 1,
  String(bagSlotsUsed(dressed)),
);

// --- 3. whether one more fits -----------------------------------------------
section("3. room for one more");

// The whole point of asking with the item rather than with a count: a full bag
// can still take another of something it already has.
const full = [];
for (let i = 0; i < INVENTORY_CAP; i++) full.push(inst(ITEM_BASES[SWORD].id, "worn", [`a${i}`]));
check("thirty distinct kinds fills the bag", bagSlotsUsed(full) === INVENTORY_CAP);
check(
  "a full bag refuses a new kind",
  !bagRoomFor(full, { baseId: HELM, rarity: "honed", affixes: [] }, INVENTORY_CAP),
);
check(
  "a full bag still takes another of something in it",
  bagRoomFor(full, { baseId: SWORD, rarity: "worn", affixes: ["a0"] }, INVENTORY_CAP),
);
// ...until that cell is itself full, or the limit would be a suggestion.
const brimming = [];
for (let i = 0; i < INVENTORY_CAP - 1; i++) brimming.push(inst(SWORD, "worn", [`a${i}`]));
for (let i = 0; i < STACK_LIMIT; i++) brimming.push(inst(HELM, "honed"));
check("a bag of full cells is full", bagSlotsUsed(brimming) === INVENTORY_CAP);
check(
  "and a full cell cannot take one more",
  !bagRoomFor(brimming, { baseId: HELM, rarity: "honed", affixes: [] }, INVENTORY_CAP),
);
// The probe must never be counted as though it were already carried.
check(
  "an empty bag has room",
  bagRoomFor([], { baseId: SWORD, rarity: "honed", affixes: [] }, INVENTORY_CAP),
);

// --- 4. the two sides agree -------------------------------------------------
section("4. the drawn grid and the counted cap");

// The client draws `bagStacks` and the server counts `bagSlotsUsed`; these are
// the same call, and this is the check that keeps them so if either grows a
// filter of its own.
const mixed = [
  ...Array.from({ length: 4 }, () => inst(SWORD, "worn")),
  ...Array.from({ length: 2 }, () => inst(SWORD, "honed")),
  inst(HELM, "honed", ["keen"]),
  inst(HELM, "honed", ["keen"], 5, true),
];
check(
  "cells drawn equals cells counted",
  bagStacks(mixed).length === bagSlotsUsed(mixed),
);
check(
  "and every carried item is in exactly one cell",
  bagStacks(mixed).reduce((n, s) => n + s.count, 0) === mixed.filter((i) => !i.equipped).length,
);
console.log(`  ${mixed.filter((i) => !i.equipped).length} items in ${bagSlotsUsed(mixed)} cells`);

// --- done -------------------------------------------------------------------
console.log(failures === 0 ? "\nOK — the bag counts cells" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
