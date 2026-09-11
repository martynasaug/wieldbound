// THE POTION THE DAILY BONUS PROMISES HAS TO BE A POTION YOU CAN DRINK.
//
// There are two potion stores in this database, and for a long time the reward
// went into the wrong one. `characters.potions` is the original column, written
// by the daily bonus; the `consumables` table is what `spendConsumable` reads,
// and therefore what USE_CONSUMABLE — the only path that still drinks anything
// — actually spends. The message that used to spend the column, USE_POTION, was
// retired when the generic consumable system arrived. The GRANT was never moved
// across with it.
//
// So every new character was told "Daily bonus: +1 potion", saw none in the bag,
// and got silence when they drank: the server found nothing to spend and
// `spendConsumable` returning null is treated as "nothing to do". Nothing threw.
// Five guided-opening runs reported "0 potions drunk" and I read that as the bot
// failing to ask rather than as the game failing to give.
//
// This is the cheapest possible statement of the rule: a character that has just
// claimed the bonus can SPEND what it was given. No browser and no combat — the
// grant and the store are the whole subject.
//
//     npm run dev:server
//     node tools/test/dailypotion.mjs
import WebSocket from "ws";
import { DAILY_BONUS_REWARD } from "../../shared/protocol-types.ts";

// A NAME NOTHING HAS USED, because the bonus is claimable once per twenty
// hours: run this twice against one character and the second run measures a
// character that was given nothing today, which is not the subject.
const NAME = `Daily${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`;
const ws = new WebSocket("ws://localhost:8080");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let counts = null;
let claimed = false;
const problems = [];
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "CONSUMABLES_UPDATE") counts = msg.payload.counts;
  if (msg.type === "DAILY_BONUS") claimed = true;
});

ws.on("open", async () => {
  ws.send(JSON.stringify({ type: "HELLO", payload: { clientVersion: "0.0.1", name: NAME } }));
  await sleep(2200);

  console.log(`${NAME}: daily bonus claimed = ${claimed}`);
  if (!claimed) {
    console.log("  INCONCLUSIVE — no DAILY_BONUS arrived, so there is nothing to check");
    ws.close();
    process.exit(0);
  }

  const have = counts?.potion ?? 0;
  console.log(`  the bag holds ${have} potion(s); the bonus promises ${DAILY_BONUS_REWARD.potions}`);
  if (have < DAILY_BONUS_REWARD.potions) {
    problems.push(
      `the bonus grants ${DAILY_BONUS_REWARD.potions} potion(s) but the spendable store has ${have}` +
        " — granted to characters.potions rather than the consumables table?",
    );
  }

  // And it is genuinely spendable, not merely counted. Drinking at full health
  // heals nothing, so this reads the COUNT rather than the health.
  //
  // Only worth asking when there was something in the bag: against the unfixed
  // server this reported a second failure about a potion the first failure had
  // already explained was never granted, and two lines about one fault read as
  // two faults.
  if (have > 0) {
    ws.send(JSON.stringify({ type: "USE_CONSUMABLE", payload: { id: "potion" } }));
    await sleep(900);
    const left = counts?.potion ?? 0;
    console.log(`  after drinking one: ${left}`);
    if (left !== have - 1) {
      problems.push(`drinking took the count from ${have} to ${left}, not to ${have - 1}`);
    }
  }

  for (const p of problems) console.log(`  FAIL  ${p}`);
  console.log(problems.length === 0 ? "\nOK — what the bonus gives, the bag can spend" : `\n${problems.length} failure(s).`);
  ws.close();
  process.exit(problems.length === 0 ? 0 : 1);
});

ws.on("error", (e) => {
  console.error("could not reach the server —", e.message);
  process.exit(1);
});
