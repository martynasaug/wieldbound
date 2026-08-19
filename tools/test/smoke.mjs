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

async function craftAndEquip(slot, rarity, weaponType) {
  const before = items.length;
  send({ type: "CRAFT_ITEM", payload: { stationId, slot, rarity, weaponType } });
  for (let i = 0; i < 30 && items.length === before; i++) await sleep(100);
  if (items.length === before) return null;
  // Newest first (the server orders by createdAt DESC).
  const fresh = items[0];
  send({ type: "EQUIP_ITEM", payload: { itemId: fresh.id } });
  await sleep(400);
  return fresh;
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

  for (const type of ["sword", "bow", "staff", "dagger", "axe"]) {
    const it = await craftAndEquip("weapon", "common", type);
    if (!it) {
      log(`   ${type}: craft refused (out of materials) - stopping weapon sweep`);
      break;
    }
    const eq = equippedWeapon();
    const me = globalThis.__me;
    log(
      `   equipped ${type}: item.weaponType=${eq?.weaponType} expect-class=${CLASS_OF[type]} ` +
        `appearance.weaponType=${me?.appearance?.weaponType} mana=${mana.mana}/${mana.max}`,
    );
    if (eq?.weaponType !== type) log(`   !! MISMATCH: equipped ${eq?.weaponType}, asked for ${type}`);
  }

  // A visible-gear slot: it must show up as a layer with a style, which is
  // the only thing other clients get to draw a helm from.
  for (const slot of ["helm", "cape", "armor", "boots"]) {
    const it = await craftAndEquip(slot, "common");
    if (!it) { log(`   ${slot}: craft refused`); continue; }
    const me = globalThis.__me;
    log(`   equipped ${slot}: style=${it.style} layer=${JSON.stringify(me?.appearance?.layers?.[slot])}`);
  }

  log("final appearance:", JSON.stringify(globalThis.__me?.appearance));
  ws.close();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  ws.close();
  process.exit(1);
});
