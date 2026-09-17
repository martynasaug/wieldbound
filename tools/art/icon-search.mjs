// SEARCH THE GAME-ICONS INDEX BY NAME.
//
//   node tools/art/icon-search.mjs sword blade sabre
//
// `icons.mjs` validates every name in `ICON_MAP` against the real index, which
// makes a typo loud instead of silent — but it makes it loud AFTER the guess.
// Picking ninety icons by guessing and then reading a list of failures is the
// slow way round; this searches the same index the validator uses, so a name is
// chosen from what exists rather than proposed and then tested.
//
// The index is the cache `icons.mjs` already writes, so this costs one fetch
// the first time and nothing after.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".icon-cache");
const TREE = "https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1";

async function index() {
  const cached = join(CACHE, "index.json");
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8"));
  const res = await fetch(TREE);
  if (!res.ok) throw new Error(`icon index: HTTP ${res.status}`);
  const tree = await res.json();
  const names = tree.tree.filter((e) => e.path.endsWith(".svg")).map((e) => e.path.replace(/\.svg$/, ""));
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, JSON.stringify(names));
  return names;
}

const terms = process.argv.slice(2).map((t) => t.toLowerCase());
const all = await index();
if (!terms.length) {
  console.log(`${all.length} icons in the index`);
  process.exit(0);
}
for (const term of terms) {
  const hits = all.filter((n) => n.split("/")[1]?.includes(term));
  console.log(`\n${term}  (${hits.length})`);
  console.log(hits.length ? "  " + hits.join("\n  ") : "  none");
}
