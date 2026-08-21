// Clears one character's quest rows, so a live probe can run from a clean slate.
//
// Beside `seed.mjs` and under the same constraint: the server must be stopped,
// because it holds the database. `tools/test/slaying.mjs` takes a quest, kills
// things and fills a counter, and a counter that is already full does not move
// — which reads exactly like the feature being broken. This is what makes that
// suite re-runnable.
//
//     node tools/quests-reset.mjs Slayer
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("server/data/wieldbound.db");
const name = process.argv[2];
const row = db.prepare("SELECT id FROM characters WHERE name = ?").get(name);
if (!row) { console.log(`no character "${name}"`); process.exit(1); }
const n = db.prepare("DELETE FROM quests WHERE characterId = ?").run(row.id);
console.log(`cleared ${n.changes} quest row(s) for ${name}`);
db.close();
