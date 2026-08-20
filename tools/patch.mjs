// Dev-only helper: apply exact-string edits to files that may be CRLF.
// Reads a JSON spec on argv[2]: [{file, find, replace}, ...]
// Normalises line endings for matching and restores the file's own on write.
// ABORTS THE WHOLE BATCH if any edit does not match exactly once, and says so —
// a batch that half-applies is worse than one that does not apply at all.
import { readFileSync, writeFileSync } from "node:fs";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const files = new Map();
const problems = [];

for (const [i, edit] of spec.entries()) {
  if (!files.has(edit.file)) {
    const raw = readFileSync(edit.file, "utf8");
    files.set(edit.file, { crlf: raw.includes("\r\n"), text: raw.replace(/\r\n/g, "\n") });
  }
  const f = files.get(edit.file);
  const find = edit.find.replace(/\r\n/g, "\n");
  const n = f.text.split(find).length - 1;
  if (n !== 1) { problems.push(`edit ${i} in ${edit.file}: matched ${n} times, need exactly 1`); continue; }
  f.text = f.text.replace(find, () => edit.replace.replace(/\r\n/g, "\n"));
}

if (problems.length) {
  console.error(`ABORTED — no file was written. ${spec.length} edit(s) in the batch, ${problems.length} bad:`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
for (const [file, f] of files) writeFileSync(file, f.crlf ? f.text.replace(/\n/g, "\r\n") : f.text);
console.log(`applied ${spec.length} edit(s) across ${files.size} file(s)`);
