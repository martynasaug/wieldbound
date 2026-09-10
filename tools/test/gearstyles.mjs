// EVERY STYLE THE CATALOGUE USES HAS TO BE BUILT BY SOMETHING.
//
// `GEAR_STYLES` declares five head styles — cap, hood, full, horned, circlet —
// and `helmParts` branched on two of them. `horned` and `circlet` fell straight
// through to the closed great helm at the bottom of the function, so a Gilded
// Crown, a Silver Circlet, a Galecrown, a Horned Helm and a Bone Helm all put a
// face-hiding bucket on the character: five of the twelve helms in the game
// wearing somebody else's hat.
//
// NOTHING COULD HAVE CAUGHT IT. It does not throw, the slot is filled, the mesh
// tints by rarity, the outline traces it and the paperdoll shows the right
// name. It is only wrong to look at, and it survived weeks of screenshots
// because the seeded character happens to wear a Dread Helm, which is a great
// helm and so was correct all along.
//
// So this is driven by the CATALOGUE rather than by a hand-written list: every
// style any item actually uses must be named in its slot's builder. Add an item
// with a new style and this fails until something draws it.
import { readFileSync } from "node:fs";
import { ITEM_BASES } from "../../shared/items.ts";
import { GEAR_STYLES, VISIBLE_GEAR_SLOTS } from "../../shared/protocol-types.ts";

const src = readFileSync("client/src/three/gear.ts", "utf8");
const problems = [];
const check = (what, ok, detail = "") => {
  // Detail is the FAILURE reason, so it only belongs on a failure. Printing it
  // on a passing row gave "ok  helm -> helmParts — not found in gear.ts",
  // which is a sentence that contradicts itself.
  console.log(`  ${ok ? "ok  " : "FAIL"} ${what}${!ok && detail ? "  — " + detail : ""}`);
  if (!ok) problems.push(what + (detail ? ": " + detail : ""));
};

/** A builder's source, from its declaration to the next top-level function.
 *  NOT a fixed number of characters: `outline.mjs` sliced 1400 and silently
 *  stopped guarding the moment somebody wrote a long enough comment inside. */
function body(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const next = src.indexOf("\nfunction ", start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

/** Does this source name that style, as a literal or as a lookup-table key? */
function names(text, style) {
  return text.includes(`"${style}"`) || new RegExp(`(^|[^\\w])${style}\\s*:`, "m").test(text);
}

const BUILDER = { helm: "helmParts", armor: "armorParts", boots: "bootsParts", cape: "capeParts" };

console.log("1. every builder named in SLOT_BUILDERS exists");
for (const [slot, fn] of Object.entries(BUILDER)) {
  check(`${slot} -> ${fn}`, body(fn) !== null, "not found in gear.ts");
}

console.log("\n2. every style the catalogue actually uses is branched on");
// What each slot's items really ask for, straight from the item table.
const used = new Map();
for (const base of Object.values(ITEM_BASES)) {
  if (!base.style || !VISIBLE_GEAR_SLOTS.includes(base.slot)) continue;
  if (!used.has(base.slot)) used.set(base.slot, new Map());
  const byStyle = used.get(base.slot);
  if (!byStyle.has(base.style)) byStyle.set(base.style, []);
  byStyle.get(base.style).push(base.name);
}

for (const slot of VISIBLE_GEAR_SLOTS) {
  const styles = used.get(slot);
  if (!styles) continue;
  const fn = BUILDER[slot];
  const text = body(fn);
  if (!text) continue;
  // A BUILDER MAY DECLINE STYLE ALTOGETHER, and says so in its signature:
  // `capeParts(_style, ...)` draws one drape for every back item on purpose,
  // because at this scale a cloak and a mantle are the same hanging cloth. The
  // underscore is the author stating that, so read it rather than keeping a
  // hand-written exemption list here that would rot.
  if (text.startsWith(`function ${fn}(_style`)) {
    check(`${slot}: style is declined by ${fn}, deliberately`, true);
    continue;
  }
  // A style counts as handled if the builder NAMES it — either as a string
  // literal in a comparison (`style === "plated"`) or as a key in a lookup
  // table (`plated: "metal"`). Both are real ways to handle one, and insisting
  // on the first would push code into a shape to satisfy a test.
  const list = [...styles.keys()].sort();
  const missing = list.filter((s) => !names(text, s));
  const wearers = missing.map((s) => `${s} (${styles.get(s).join(", ")})`);
  check(
    `${slot}: ${list.length} style(s) used — ${list.join(", ")}`,
    missing.length === 0,
    wearers.length ? `${fn} never mentions ${wearers.join("; ")}` : "",
  );
}

console.log("\n3. no style is declared that nothing can draw");
// The reverse direction, which is a smaller problem but the same mistake: a
// style in GEAR_STYLES that no builder knows about is a trap waiting for the
// first item that uses it.
const allBuilders = Object.values(BUILDER).map(body).filter(Boolean).join("\n");
const orphans = GEAR_STYLES.filter((s) => !names(allBuilders, s));
// `cape` takes no style at all — `capeParts(_style, ...)` draws one drape for
// every back item on purpose — so its four styles are expected here.
const capeStyles = new Set([...(used.get("cape")?.keys() ?? [])]);
const real = orphans.filter((s) => !capeStyles.has(s));
check(
  `${GEAR_STYLES.length} styles declared, ${real.length} that no builder names`,
  real.length === 0,
  real.length ? real.join(", ") : "",
);

console.log(
  problems.length
    ? `\n${problems.length} FAILURE(S)`
    : "\nOK — every style an item asks for is drawn by its slot's builder",
);
process.exit(problems.length ? 1 : 0);
