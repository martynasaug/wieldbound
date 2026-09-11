// THE CHARACTER CREATOR: WHAT A LOOK IS, WHO MAY WRITE ONE, AND WHETHER IT STAYS.
//
// A look is a set of ids chosen from tables in `shared/look.ts`, stored on the
// server and broadcast with every player. Three things can quietly go wrong
// with that, and each has a section:
//
//   1. the server accepts something the tables do not contain
//   2. a default or a dice roll produces a look the server would refuse
//   3. the day the creator shipped, an existing character's colouring changed
//
// And then the one thing only a browser can answer: a new character is sent
// into the creator, what they choose survives a fresh login, and they are not
// asked again.
//
//   node tools/test/creator.mjs            (with `npm run dev` up)
import {
  LOOK_OPTIONS,
  defaultLookFor,
  parseStoredLook,
  randomLook,
  sanitizeLook,
} from "../../shared/look.ts";
import { open, login } from "../soak/driver.mjs";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};

console.log("1. the server accepts exactly the looks the tables describe");
{
  const good = defaultLookFor("Alder");
  check("a default look passes", JSON.stringify(sanitizeLook(good)) === JSON.stringify(good));
  check("a missing field is refused", sanitizeLook({ ...good, build: undefined }) === null);
  check("an unknown tone is refused", sanitizeLook({ ...good, skin: "green" }) === null);
  check("a number where an id belongs is refused", sanitizeLook({ ...good, build: 3 }) === null);
  check("a non-object is refused", sanitizeLook("tan") === null && sanitizeLook(null) === null);
  const extra = sanitizeLook({ ...good, admin: true, wings: "big" });
  check("unknown fields are dropped, not stored", !!extra && !("admin" in extra) && !("wings" in extra));
  check("a retired style is refused", sanitizeLook({ ...good, hair: "crest" }) === null);
  check("stored garbage parses as never chosen", parseStoredLook("{not json", "Alder") === null && parseStoredLook(null, "Alder") === null);
  // A look saved before hair existed still loads, with the name's default filled
  // in — rather than sending every player who had chosen back to the creator.
  const old = parseStoredLook(JSON.stringify({ skin: "umber", build: "slight" }), "Alder");
  check(
    "a look stored before a field existed keeps its choices and fills the rest",
    !!old && old.skin === "umber" && old.build === "slight" && old.hair === good.hair &&
      old.beard === good.beard && old.hairColor === good.hairColor,
    JSON.stringify(old),
  );
  check("the wire gets no such allowance", sanitizeLook({ skin: "umber", build: "slight" }) === null);
  for (const option of LOOK_OPTIONS) {
    const ids = option.choices.map((c) => c.id);
    check(`${option.key} has no duplicate ids`, new Set(ids).size === ids.length, ids.join(","));
  }
}

console.log("2. every default and every roll is a look the server would take");
{
  let bad = 0;
  for (let i = 0; i < 500; i++) {
    if (!sanitizeLook(defaultLookFor(`Name${i}`))) bad++;
    if (!sanitizeLook(randomLook())) bad++;
  }
  check("1000 generated looks all pass", bad === 0, `${bad} refused`);
}

console.log("3. nobody's colouring changed on the day the creator shipped");
{
  // The skin byte `client/src/three/look.ts` used before the creator, spelled
  // out on purpose: this is the promise being tested, not a function to share.
  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const SKIN = ["porcelain", "fair", "light", "olive", "tan", "bronze", "umber", "ebony"];
  const moved = ["Alder", "Bryn", "Cass", "Dunmar", "Eira", "Fenn", "Gretel", "Hobb", "Player3619"].filter(
    (name) => defaultLookFor(name).skin !== SKIN[((hash(name) >>> 16) & 0xff) % 8],
  );
  check("skin matches the old derivation", moved.length === 0, moved.join(", "));
}

console.log("4. a new character is sent into the creator, and what they pick stays");
{
  const name = `Creator${Date.now() % 100000}`;
  const chosen = { skin: "umber", build: "slight", hair: "ponytail", beard: "braided", hairColor: "ginger" };
  const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
  try {
    await login(page, name, { creator: true });
    await page.waitForTimeout(800);
    const opened = await page.evaluate(() => !!window.__wieldbound.creator && !!document.getElementById("creator-root"));
    check("the creator opens on a first login", opened);
    if (opened) {
      await page.evaluate((look) => {
        const c = window.__wieldbound.creator;
        for (const [k, v] of Object.entries(look)) c.set(k, v);
      }, chosen);
      const worn = await page.evaluate(() => window.__wieldbound.localActor.currentLook);
      check("each choice goes onto the character as it is made", JSON.stringify(worn) === JSON.stringify(chosen));
      await page.click("#creator-root .cc-done");
      await page.waitForTimeout(1200);
      check("accepting closes it", await page.evaluate(() => !window.__wieldbound.creator && !document.getElementById("creator-root")));
    }
    const again = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await login(again, name, { creator: true });
    await again.waitForTimeout(800);
    const back = await again.evaluate(() => ({ open: !!window.__wieldbound.creator, look: window.__wieldbound.localActor.currentLook }));
    check("a character that has chosen is not asked again", !back.open);
    check("the look survives a fresh login", JSON.stringify(back.look) === JSON.stringify(chosen), JSON.stringify(back.look));
    // A harness login never sees it, or every other test would run through it.
    const skipped = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await login(skipped, `${name}b`);
    await skipped.waitForTimeout(800);
    check("a harness login skips the creator", await skipped.evaluate(() => !window.__wieldbound.creator));
  } finally {
    await browser.close();
  }
}

console.log(failures === 0 ? "\nOK — looks are chosen, checked and kept" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
