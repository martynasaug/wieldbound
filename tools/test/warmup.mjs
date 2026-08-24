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
  check(
    "which uses the async compile, not the blocking one",
    /this\.renderer\.compileAsync\(object, this\.camera, this\.scene\)/.test(world),
    "renderer.compile() would move the stall rather than remove it",
  );
  check(
    "and never rejects",
    /await this\.renderer\.compileAsync[\s\S]{0,120}?\} catch \{/.test(world),
    "a failed warm-up must not leave an actor permanently invisible",
  );

  // Both actor paths — monsters and remote players — must add hidden, warm,
  // then show. Either one left out is a spike that only appears in one
  // situation: walking into a camp, or another player walking up to you.
  const spawns = [...game.matchAll(/void actor\.load\(\)\.then\(async \(\) => \{([\s\S]{0,400}?)\}\);/g)];
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

console.log(
  failures === 0
    ? "\nOK — models arrive before they are needed and compile before they are drawn"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
