// THE TWO STALLS THAT NEVER HAPPEN INSIDE THE RENDER LOOP.
//
// Both were found by the hitch reporter added in M70.30/M70.32, and neither
// could have been found by optimising the loop, because neither is in it:
//
//   [hitch] 3798ms BETWEEN frames — not the render loop.
//   [hitch]   55ms frame — worst section: render 53.7ms, 0ms outside sections
//
// The first is a monster model being fetched and parsed the first time its kind
// comes into view. Sounds have been preloaded since Phase 39; models never were.
// The second is three.js compiling that model's shaders — which it does
// synchronously, inside `render()` — the first frame the thing is drawn. Steady
// render was 8.9ms and these spikes were six to ten times that, a dozen times
// in ten seconds.
//
// A source test, because both fixes are about WHEN work happens rather than
// what it computes, and neither an asset fetch nor a shader compile exists
// under Node.
//
//   node tools/test/warmup.mjs

import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const game = read("client/src/three/Game.ts");
const world = read("client/src/three/World.ts");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

section("1. every monster model is fetched before it is needed");
{
  check(
    "start() preloads the monster models",
    /for \(const spec of Object\.values\(MONSTER_MODELS\)\) \{[\s\S]{0,200}?loadModel\(spec\.model\)/.test(game),
    "the first sighting of each kind would fetch and parse a glTF mid-play",
  );
  // Written as a loop over the table rather than a hand-written list, so a
  // fourteenth kind is covered the moment it is added. A list would be a second
  // place to remember, and the failure of forgetting is a multi-second freeze
  // that only shows up wherever that one monster lives.
  check(
    "by iterating the table, so a new kind needs no second edit",
    !/loadModel\("(?:GreenBlob|Mushnub|Orc|Dragon_Evolved)\.gltf"\)/.test(game),
    "a hand-written preload list would silently miss new kinds",
  );
  const kinds = [...game.matchAll(/^\s{2}(\w+): \{ model: "([^"]+)"/gm)].map((m) => m[2]);
  check("the table was found", kinds.length >= 10, String(kinds.length));
  console.log(`  ${kinds.length} monster models preloaded through one loop`);
  check(
    "the preload cannot reject its way out of start()",
    /loadModel\(spec\.model\)\.catch\(/.test(game),
    "one bad asset would break the whole start sequence",
  );
}

section("2. nothing is drawn before its shaders exist");
{
  check(
    "World exposes a warm-up",
    /async warmUp\(object: THREE\.Object3D\): Promise<void>/.test(world),
  );
  // `compileSafely`, not three's `compileAsync`. Both compile off the blocking
  // path — the point this section has always been making — but three's version
  // polls `properties.get(material).currentProgram.isReady()` unguarded, and a
  // material disposed mid-poll throws from a TIMEOUT callback, where no
  // `try/catch` around the await can reach it. That hung the loading screen at
  // "dressing your character 100%". So what is asserted is the property, not the
  // spelling: still asynchronous, still never rejecting, and now also bounded.
  check(
    "which uses the async compile, not the blocking one",
    /await this\.compileSafely\(object, this\.scene\)/.test(world),
    "a synchronous renderer.compile() would move the stall rather than remove it",
  );
  check(
    "and never rejects",
    /await this\.compileSafely[\s\S]{0,160}?\} catch \{/.test(world),
    "a failed warm-up must not leave an actor permanently invisible",
  );
  check(
    "and cannot wait forever",
    /performance\.now\(\) >= giveUpAt/.test(world) && /COMPILE_WAIT_LIMIT_MS/.test(world),
    "three's own poll has no timeout, so a program that never reports ready " +
      "hangs whatever awaited it — and the loading screen awaits one",
  );
  check(
    "and tolerates a material disposed while it waits",
    /const program = properties\.get\(material\)\?\.currentProgram;[\s\S]{0,120}?if \(!program \|\| program\.isReady\(\)\)/.test(
      world,
    ),
    "this is the crash: a disposed material has no program, and three " +
      "dereferences it anyway from a setTimeout where the await cannot catch it",
  );

  // Both actor paths — monsters and remote players — must add hidden, warm,
  // then show. Either one left out is a spike that only appears in one
  // situation: walking into a camp, or another player walking up to you.
  // Matched on the load call and the window after it rather than on one exact
  // promise shape: the monster path grew a .finally() when actor builds were
  // bounded in M70.38, and a test recognising only .then(async () => {})
  // reported "both paths found - 1" for a refactor that changed no behaviour.
  const spawns = [...game.matchAll(/\.load\(\)[\s\S]{0,80}?\.then\(async \(\) => \{([\s\S]{0,400}?)\n\s*\}\)/g)];
  check("both actor build paths were found", spawns.length === 2, String(spawns.length));
  for (const [i, m] of spawns.entries()) {
    const body = m[1];
    const hides = /\.root\.visible = false;/.test(body);
    const warms = /await this\.world\.warmUp\(/.test(body);
    const shows = /\.root\.visible = true;/.test(body);
    check(`actor path ${i + 1} adds it hidden`, hides);
    check(`actor path ${i + 1} warms it up`, warms);
    check(`actor path ${i + 1} shows it afterwards`, shows);
    // Order matters: showing before warming is the bug with extra steps.
    check(
      `actor path ${i + 1} warms BEFORE it shows`,
      hides && warms && shows && body.indexOf("warmUp") < body.lastIndexOf("visible = true"),
    );
  }
}

section("3. gear is warmed in the background, not fetched mid-fight");
{
  const warmer = read("client/src/three/warmer.ts");
  check(
    "start() queues the item art models",
    /warmInBackground\(\s*Object\.values\(ITEM_BASES\)/.test(game),
    "weapon and armour models would be parsed the first time one is seen",
  );
  check(
    "rig-harvested models are mapped to the body that carries them",
    /startsWith\("rig:"\) \? m\.slice\(4\)\.split\("\/"\)\[0\] : m/.test(game),
    'loading "rig:Warrior/Sword" as a filename would 404 and warm nothing',
  );
  // Serialised, not parallel: three glTF parses at once is a three-parse stall,
  // and the entire point is that no single pause is long enough to feel.
  check(
    "models are warmed one at a time",
    /\.finally\(\(\) => whenIdle\(step\)\)/.test(warmer) && !/Promise\.all/.test(warmer),
    "firing them together would recreate the stall it exists to avoid",
  );
  check("and only when the browser has nothing better to do", /requestIdleCallback/.test(warmer));
  check(
    "with a fallback where that does not exist",
    /setTimeout\(fn, \d+\)/.test(warmer),
    "Safari has no requestIdleCallback and would warm nothing at all",
  );
  check(
    "a failed warm cannot become an unhandled rejection",
    /loadModel\(next\)[\s\S]{0,40}?\.catch\(/.test(warmer),
  );
  check(
    "warming an already-loaded model is harmless",
    /loadModel` caches by name/.test(warmer),
    "the warmer must never start a second fetch for something already in flight",
  );
}

console.log(
  failures === 0
    ? "\nOK — models arrive before they are needed and compile before they are drawn"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
