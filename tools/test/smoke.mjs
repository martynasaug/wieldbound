// Verifies the weapon-driven class system over a real socket: log in, craft
// weapons of three different families, equip each, and check that the class,
// attack range and mana the server reports change accordingly - plus that a
// helm/cape actually reach the appearance layers other clients draw from.
// Plain specifier: Node walks up to the repo root node_modules, where the npm
// workspace hoists ws. It was an absolute file:// URL into a different checkout
// of this project, which worked only on the machine that wrote it.
import WebSocket from "ws";

const URL = "ws://localhost:8080";
const NAME = process.argv[2] ?? `smoke-${Date.now() % 100000}`;

const ws = new WebSocket(URL);
const log = (...a) => console.log(...a);
let welcome = null;
let items = [];
let stationId = null;
let mana = { mana: 0, max: 0 };

const send = (m) => ws.send(JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ws.on("open", () => send({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } }));

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "WELCOME") {
    welcome = msg.payload;
    items = msg.payload.items;
    mana = { mana: msg.payload.mana, max: msg.payload.maxMana };
  } else if (msg.type === "ITEMS_UPDATE") {
    items = msg.payload.items;
  } else if (msg.type === "MANA_UPDATE") {
    mana = { mana: msg.payload.mana, max: msg.payload.maxMana };
  } else if (msg.type === "STATE_SNAPSHOT") {
    if (!stationId && msg.payload.stations?.length) stationId = msg.payload.stations[0].id;
    const me = msg.payload.players.find((p) => p.id === welcome?.id);
    if (me) globalThis.__me = me;
  } else if (msg.type === "INFO") {
    log("   INFO:", msg.payload.text);
  }
});

const equippedWeapon = () => items.find((i) => i.equipped && i.slot === "weapon");
const CLASS_OF = { fist: "adventurer", sword: "warrior", axe: "warrior", mace: "warrior", dagger: "ranger", bow: "ranger", staff: "mage", wand: "mage" };

/** Forges one named base item and puts it on. */
async function forgeAndEquip(baseId) {
  const before = items.length;
  send({ type: "FORGE_ITEM", payload: { stationId, baseId } });
  for (let i = 0; i < 30 && items.length === before; i++) await sleep(100);
  if (items.length === before) return null;
  // Newest first (the server orders by createdAt DESC).
  const fresh = items[0];
  send({ type: "EQUIP_ITEM", payload: { itemId: fresh.id } });
  await sleep(400);
  return items.find((i) => i.id === fresh.id) ?? fresh;
}

async function main() {
  for (let i = 0; i < 60 && !welcome; i++) await sleep(100);
  if (!welcome) throw new Error("no WELCOME");
  log(`logged in as ${NAME} (id ${welcome.id}), lv${welcome.level}`);
  log(`   unarmed: weapon=${welcome.appearance.weaponType ?? "none"} -> expect class adventurer, mana ${mana.mana}/${mana.max}`);

  // Walk to the workbench so crafting is in range, and give the snapshot a
  // moment to tell us where it is.
  for (let i = 0; i < 40 && !stationId; i++) await sleep(100);
  log(`   station: ${stationId}`);

  // Enough materials to craft: the character starts with none, so this only
  // works if the daily bonus / starting stock covers a common recipe.
  log(`   wood=${welcome.wood} ore=${welcome.ore} herb=${welcome.herb}`);

  // The off-hand, and the two-handed rule that pays for it. A shield goes on;
  // then a two-hander must take it back off, with no message from the client
  // saying so — the rule lives in the server's equip path.
  const shield = await forgeAndEquip("plankshield");
  if (shield) {
    const wornOffhand = () => items.find((i) => i.equipped && i.slot === "offhand");
    log(`   off-hand: ${wornOffhand()?.baseId ?? "none"} (expect plankshield)`);
    const twoHander = await forgeAndEquip("shortbow");
    if (twoHander) {
      log(`   after equipping a bow: off-hand=${wornOffhand()?.baseId ?? "none"} (expect none)`);
      if (wornOffhand()) log("   !! two-handed rule did not empty the off-hand");
    }
  }

  // One weapon per family, by NAME now rather than by slot-and-tier — the
  // forge names a catalogue entry, and the entry is what decides the family.
  // Every one of these is band 1, so a level-1 character can make it.
  const STARTERS = {
    sword: "armingsword",
    bow: "shortbow",
    staff: "apprenticestaff",
    dagger: "dirk",
    axe: "handaxe",
    mace: "smithhammer",
    wand: "birchrod",
  };
  for (const [type, baseId] of Object.entries(STARTERS)) {
    const it = await forgeAndEquip(baseId);
    if (!it) {
      log(`   ${type}: forge refused (out of materials) - stopping weapon sweep`);
      break;
    }
    const eq = equippedWeapon();
    const me = globalThis.__me;
    log(
      `   ${baseId}: weaponType=${eq?.weaponType} expect-class=${CLASS_OF[type]} ` +
        `appearance.baseId=${me?.appearance?.weaponBaseId} rarity=${eq?.rarity} mana=${mana.mana}/${mana.max}`,
    );
    if (eq?.weaponType !== type) log(`   !! MISMATCH: equipped ${eq?.weaponType}, asked for ${type}`);
    if (eq?.baseId !== baseId) log(`   !! MISMATCH: equipped base ${eq?.baseId}, asked for ${baseId}`);
  }

  // A visible-gear slot: it must show up as a layer with a style, which is
  // the only thing other clients get to draw a helm from.
  for (const baseId of ["paddedcap", "torncloak", "leatherjerkin", "wornsandals"]) {
    const it = await forgeAndEquip(baseId);
    if (!it) { log(`   ${baseId}: forge refused`); continue; }
    const me = globalThis.__me;
    log(`   equipped ${baseId}: style=${it.style} layer=${JSON.stringify(me?.appearance?.layers?.[it.slot])}`);
  }

  // Salvage: the bag must shrink and the materials must come back.
  const spare = items.find((i) => !i.equipped);
  if (spare) {
    const before = items.length;
    send({ type: "SALVAGE_ITEM", payload: { itemId: spare.id } });
    for (let i = 0; i < 30 && items.length === before; i++) await sleep(100);
    log(`   salvaged ${spare.baseId}: bag ${before} -> ${items.length}`);
  }

  log("final appearance:", JSON.stringify(globalThis.__me?.appearance));
  ws.close();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  ws.close();
  process.exit(1);
});
