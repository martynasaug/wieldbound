// EVERY MESSAGE HAS SOMEBODY LISTENING.
//
// The wire is two discriminated unions in `shared/protocol-types.ts` and two
// long if/else chains — one in `client/src/net/socket.ts`, one in the server's
// message handler. Adding a message means touching four places, and the one
// that can be forgotten fails in total silence: the message is sent, it
// arrives, no branch matches, and it is dropped. Nothing throws. TypeScript
// does not help either — a union is only exhaustive if somebody wrote a switch
// with a `never` check, and these are if/else chains.
//
// That is a growth problem rather than a today problem, which is exactly why it
// is worth a test: there are 61 message types now and there will be more, and
// the cost of a dropped one is a feature that half-works in a way no error ever
// mentions.
//
// Read from SOURCE rather than imported. These are TYPES — erased at runtime,
// so there is nothing to import and reflect over. `hints.mjs` reads its subject
// out of source for the same reason.
//
//   node tools/test/protocol.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
// NORMALISED LINE ENDINGS, because the working tree is CRLF on Windows and the
// paragraph lookup below searches for a blank line. A two-newline search never
// matches a CRLF blank line, so every `@retired` marker read as absent and four
// deliberately retired messages were reported as unhandled — a test failing
// about the one thing it had just been taught to allow.
const read = (rel) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
const protocol = read("shared/protocol-types.ts");
const clientSocket = read("client/src/net/socket.ts");
const server = read("server/src/index.ts");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

/** The interface names listed in a union, in declaration order. */
function unionMembers(name) {
  const start = protocol.indexOf(`export type ${name} =`);
  if (start < 0) return [];
  const end = protocol.indexOf(";", start);
  return [...protocol.slice(start, end).matchAll(/\|\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

/**
 * Whether a message has been explicitly retired.
 *
 * A retired message is one nothing sends and nothing handles, left declared so
 * the union still describes everything that could ever arrive. It is marked at
 * the DECLARATION with `@retired` rather than listed here, so the exemption
 * lives next to the thing being exempted and cannot rot into a list of names
 * that no longer exist.
 */
function isRetired(iface) {
  const at = protocol.indexOf(`interface ${iface} {`);
  if (at < 0) return false;
  // Look back over the comment block immediately above the declaration.
  const before = protocol.slice(Math.max(0, at - 1400), at);
  const lastBlank = before.lastIndexOf("\n\n");
  return before.slice(lastBlank).includes("@retired");
}

/** The string literal a message interface discriminates on. */
function typeLiteralOf(iface) {
  const at = protocol.indexOf(`interface ${iface} {`);
  if (at < 0) return null;
  const body = protocol.slice(at, protocol.indexOf("\n}", at));
  return body.match(/type:\s*"([A-Z_0-9]+)"/)?.[1] ?? null;
}

const toClient = unionMembers("ServerToClientMessage");
const toServer = unionMembers("ClientToServerMessage");
check("the server-to-client union was found", toClient.length > 0);
check("the client-to-server union was found", toServer.length > 0);

section("1. every message the server sends, the client handles");
{
  const unhandled = [];
  for (const iface of toClient) {
    const lit = typeLiteralOf(iface);
    check(`${iface} declares a type literal`, !!lit, "no `type: \"...\"` in the interface");
    if (!lit) continue;
    // The dispatch tests `msg.type === "X"`; a handler may also be reached by a
    // switch case, so both shapes count.
    const wired =
      clientSocket.includes(`msg.type === "${lit}"`) || clientSocket.includes(`case "${lit}"`);
    if (!wired) unhandled.push(`${lit} (${iface})`);
  }
  check(
    "no server message is silently dropped",
    unhandled.length === 0,
    unhandled.length ? `nothing in socket.ts matches: ${unhandled.join(", ")}` : "",
  );
  console.log(`  ${toClient.length} server-to-client messages, ${toClient.length - unhandled.length} wired`);
}

section("2. every message the client sends, the server handles");
{
  const unhandled = [];
  const retired = [];
  for (const iface of toServer) {
    const lit = typeLiteralOf(iface);
    check(`${iface} declares a type literal`, !!lit, "no `type: \"...\"` in the interface");
    if (!lit) continue;
    const wired = server.includes(`msg.type === "${lit}"`) || server.includes(`case "${lit}"`);
    if (!wired && !isRetired(iface)) unhandled.push(`${lit} (${iface})`);
    if (!wired && isRetired(iface)) retired.push(lit);
  }
  check(
    "no client message is ignored by the server",
    unhandled.length === 0,
    unhandled.length ? `nothing in index.ts matches: ${unhandled.join(", ")}` : "",
  );
  console.log(
    `  ${toServer.length} client-to-server messages, ` +
      `${toServer.length - unhandled.length - retired.length} wired` +
      (retired.length ? `, ${retired.length} retired (${retired.join(", ")})` : ""),
  );
}

section("3. nothing is dispatched that the wire cannot carry");
{
  // The other direction: a branch for a message type no union declares is dead
  // code at best, and at worst a handler somebody wired to a typo that will
  // never fire.
  const declared = new Set(
    [...toClient, ...toServer].map(typeLiteralOf).filter(Boolean),
  );
  const dispatched = new Set(
    [...clientSocket.matchAll(/msg\.type === "([A-Z_0-9]+)"/g)].map((m) => m[1]),
  );
  const orphans = [...dispatched].filter((t) => !declared.has(t));
  check(
    "every branch in socket.ts matches a declared message",
    orphans.length === 0,
    orphans.join(", "),
  );
  console.log(`  ${dispatched.size} branches in socket.ts, all declared`);
}

console.log(failures === 0 ? "\nOK — both ends of the wire agree" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
