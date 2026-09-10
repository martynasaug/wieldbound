// THE NINE SENTENCES EVERY PLAYER READS ON EVERY LOAD.
//
// `LOADING_HINTS` is the most-read text in the game — it is on screen for seven
// seconds of every session, before anything else is — and it is nine
// MECHANICAL CLAIMS written in prose, in a client file, beside tables that live
// somewhere else entirely. Exactly the seam that produced M70.211 and M70.215,
// where the Herald and then Marda both promised bushes in a square that has
// none, and neither was noticed because no test read the prose and the table
// together.
//
// All nine hold today. This is here so they go on holding, because a hint is
// the worst place in the game for a lie: it is the first thing a new player
// reads and the last thing anybody thinks to check.
//
// GUARDING THE FACT, NOT THE SENTENCE, which is the rule M70.213 arrived at
// after trying the other way. Each entry below pairs a claim with the
// mechanical thing that makes it true, and the hint text is quoted in the
// failure so whoever broke it knows which sentence just became false. Reword a
// hint freely; move the mechanic and this says so.
//
//   node tools/test/hints.mjs
// READ FROM SOURCE RATHER THAN IMPORTED, and not by choice: `LoadingScreen.ts`
// imports `../three/assets` without an extension, which Vite resolves and
// Node's ESM loader does not, so importing it here fails on a module three
// hops away that has nothing to do with hints. `warmup.mjs` reads source for
// the same class of reason. The block is plain double-quoted strings, so
// pulling them out is exact rather than a guess at parsing TypeScript.
import { readFileSync } from "node:fs";
import {
  DAY_LENGTH_MS,
  MONSTER_STATS,
  WEAPONS,
  WEAPON_TREES,
  CLASSES,
  PLAYER_SPAWN,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from "../../shared/protocol-types.ts";

const source = readFileSync(new URL("../../client/src/ui/LoadingScreen.ts", import.meta.url), "utf8");
/** Read as text for the same reason the hints are: what is being guarded here
 *  is that a MESSAGE TYPE exists, and a type is erased at runtime, so there is
 *  nothing to import and compare against. */
const protocolSource = readFileSync(new URL("../../shared/protocol-types.ts", import.meta.url), "utf8");
const block = source.slice(
  source.indexOf("export const LOADING_HINTS = ["),
  source.indexOf("];", source.indexOf("export const LOADING_HINTS = [")),
);
const LOADING_HINTS = [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
if (LOADING_HINTS.length === 0) {
  console.log("FAIL — could not read LOADING_HINTS out of LoadingScreen.ts; the guard is blind");
  process.exit(1);
}

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
};

/** The hint that makes a claim, so a failure can quote it. Also proves the
 *  claim is still BEING made: reword a hint past recognition and the guard for
 *  it stops applying, which must not happen silently. */
const hintSaying = (...words) =>
  LOADING_HINTS.find((h) => words.every((w) => h.toLowerCase().includes(w.toLowerCase()))) ?? null;

const claims = [
  {
    // "Click a tree, rock or bush to work it." The claim is that gathering
    // takes an ASKING — which is true only while the protocol carries a way to
    // ask. Delete `GatherMessage` or go back to harvesting whatever is
    // underfoot and this hint becomes the most-read lie in the game.
    words: ["click a tree"],
    holds: () => /interface GatherMessage/.test(protocolSource) && /type: "GATHER"/.test(protocolSource),
    detail: () => "no GatherMessage in shared/protocol-types.ts — gathering takes no order",
  },
  {
    words: ["twenty-four minutes"],
    holds: () => DAY_LENGTH_MS === 24 * 60 * 1000,
    detail: () => `DAY_LENGTH_MS is ${DAY_LENGTH_MS}ms (${DAY_LENGTH_MS / 60000} minutes)`,
  },
  {
    // "Pick up a sword and you fight as a Warrior; drop it for a staff and you
    // are a Mage" — the one rule this game has instead of a class picker.
    words: ["no class selection"],
    holds: () => CLASSES[WEAPONS.sword.classId].id === "warrior" && CLASSES[WEAPONS.staff.classId].id === "mage",
    detail: () => `sword -> ${WEAPONS.sword.classId}, staff -> ${WEAPONS.staff.classId}`,
  },
  {
    words: ["bare-handed", "adventurer"],
    holds: () => WEAPONS.fist.classId === "adventurer" && Object.keys(WEAPON_TREES.fist ?? {}).length > 0,
    detail: () =>
      `fist -> ${WEAPONS.fist.classId}, its tree has ${Object.keys(WEAPON_TREES.fist ?? {}).length} nodes`,
  },
  {
    // "Every weapon has its own talent tree, and its own levels."
    words: ["every weapon", "talent tree"],
    holds: () => Object.keys(WEAPONS).every((w) => Object.keys(WEAPON_TREES[w] ?? {}).length > 0),
    detail: () =>
      "without a tree: " +
      (Object.keys(WEAPONS).filter((w) => !Object.keys(WEAPON_TREES[w] ?? {}).length).join(", ") || "none"),
  },
  {
    // "A golem's armour subtracts from every hit... Bring something heavy."
    // Subtractive armour is what makes a fast weapon bad against it, and the
    // hint names the golem specifically, so the golem has to be the wall.
    words: ["golem", "armour"],
    holds: () => {
      const golem = MONSTER_STATS.golem.armor;
      return Object.values(MONSTER_STATS).every((s) => s.armor <= golem) && golem > 0;
    },
    detail: () => {
      const worst = Object.entries(MONSTER_STATS).sort((a, b) => b[1].armor - a[1].armor)[0];
      return `heaviest armour is ${worst[0]} at ${worst[1].armor}; golem has ${MONSTER_STATS.golem.armor}`;
    },
  },
  {
    // "Difficulty radiates from the smithy at the world's centre."
    words: ["difficulty radiates"],
    holds: () => PLAYER_SPAWN.x === WORLD_WIDTH / 2 && PLAYER_SPAWN.y === WORLD_HEIGHT / 2,
    detail: () =>
      `spawn (${PLAYER_SPAWN.x}, ${PLAYER_SPAWN.y}) against a world centre of ` +
      `(${WORLD_WIDTH / 2}, ${WORLD_HEIGHT / 2})`,
  },
  {
    // "A troll winds up before it slams."
    words: ["troll", "winds up"],
    holds: () => (MONSTER_STATS.troll.windupMs ?? 0) > 0 && (MONSTER_STATS.troll.slamRadiusPx ?? 0) > 0,
    detail: () =>
      `troll windup ${MONSTER_STATS.troll.windupMs}ms, slam radius ${MONSTER_STATS.troll.slamRadiusPx}px`,
  },
];

console.log(`${LOADING_HINTS.length} loading hints, ${claims.length} of them making a checkable claim\n`);
for (const c of claims) {
  const hint = hintSaying(...c.words);
  if (!hint) {
    // Not a failure of the game — a failure of this guard to still be pointed at
    // anything. Loud either way, because a silently inapplicable check is worse
    // than no check.
    check(
      `no hint matches [${c.words.join(", ")}] any more`,
      false,
      "the wording moved, so this claim is no longer being guarded — re-point it or drop it",
    );
    continue;
  }
  check(`"${hint.slice(0, 62)}…"`, c.holds(), c.detail());
}

console.log(
  failures === 0
    ? "\nOK — every hint still describes the game it is shown in"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
