// Checks that every icon the game asks for is an icon the game actually has.
//
// The failure mode this exists to catch is silent by construction: an icon key
// that is not in the baked set renders as nothing at all, so a mistyped skill
// icon is an empty square on the action bar and no error anywhere. There are
// well over a hundred keys spread across the class table, the weapon table, the
// default attacks, twenty-seven skills, seventy-three talent nodes and the DOM
// panels, and each one is a plain string.
//
// Also checks the reverse — icons baked but never referenced — which is not a
// failure but is worth reporting, since an unused icon is usually a rename that
// only got done on one side.
//
//   node tools/test/icons.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLASSES,
  DEFAULT_ATTACKS,
  ITEM_SLOTS,
  SKILLS,
  WEAPONS,
  WEAPON_TREES,
  WEAPON_TYPES,
} from "../../shared/protocol-types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

// Read the baked keys out of the generated module rather than importing it:
// it is a client-side .ts file full of DOM helpers, and this test has no DOM.
const generated = readFileSync(join(REPO, "client", "src", "ui", "icons.ts"), "utf8");
const baked = new Set([...generated.matchAll(/^  "([^"]+)": "/gm)].map((m) => m[1]));

let failures = 0;
const used = new Set();

function require_(key, where) {
  used.add(key);
  if (baked.has(key)) return;
  console.log(`  MISSING  ${String(key).padEnd(24)} (${where})`);
  failures++;
}

console.log(`\nbaked icons: ${baked.size}\n`);

console.log("1. the tables in shared/");
for (const cls of Object.values(CLASSES)) require_(cls.icon, `class ${cls.id}`);
for (const w of Object.values(WEAPONS)) require_(w.icon, `weapon ${w.type}`);
for (const [weapon, def] of Object.entries(DEFAULT_ATTACKS)) require_(def.icon, `default attack ${weapon}`);
for (const skill of Object.values(SKILLS)) require_(skill.icon, `skill ${skill.id}`);
for (const weapon of Object.keys(WEAPON_TREES)) {
  for (const node of WEAPON_TREES[weapon]) require_(node.icon, `talent ${node.id}`);
}
console.log(`  checked ${used.size} distinct keys from the shared tables`);

console.log("\n2. the keys the interface names directly");
// Slots, materials, consumables, dock and stat icons are named in the DOM
// panels rather than in shared data, so they are listed here explicitly.
for (const slot of ITEM_SLOTS) require_(`slot-${slot}`, `equipment slot ${slot}`);
for (const m of ["wood", "ore", "herb"]) require_(m, `material ${m}`);
for (const c of ["potion", "tonic"]) require_(c, `consumable ${c}`);
for (const d of ["character", "inventory", "skills", "craft", "leaderboard"]) require_(`dock-${d}`, `dock button ${d}`);
for (const s of ["strength", "agility", "vitality", "intelligence"]) require_(s, `attribute ${s}`);
for (const f of ["hp", "mana", "xp", "gear", "sort", "sell", "settings"]) require_(f, `interface ${f}`);
for (const r of [1, 2, 3]) require_(`rank-${r}`, `leaderboard place ${r}`);
for (const c of ["sun", "moon"]) require_(c, `day/night clock ${c}`);

console.log("\n3. every weapon can draw its own bar");
// The one composite check: a player holding any weapon sees that weapon's
// default attack and every active in its tree, so those must all resolve.
for (const weapon of WEAPON_TYPES.concat("fist")) {
  const attack = DEFAULT_ATTACKS[weapon];
  const actives = WEAPON_TREES[weapon].filter((n) => n.active);
  let ok = baked.has(attack.icon) && actives.every((n) => baked.has(n.icon));
  console.log(`  ${weapon.padEnd(8)} attack + ${String(actives.length).padStart(2)} actives  ${ok ? "ok" : "BROKEN"}`);
  if (!ok) failures++;
}

const unused = [...baked].filter((k) => !used.has(k));
if (unused.length) {
  console.log(`\nbaked but never referenced (${unused.length}): ${unused.join(", ")}`);
}

console.log(failures === 0 ? "\nOK — every icon the game names exists\n" : `\nFAILED — ${failures} problem(s)\n`);
process.exit(failures === 0 ? 0 : 1);
