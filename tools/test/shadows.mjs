// THE SHADOW SCHEDULE, and the GPU error it caused when it was written by hand.
//
// The shadow pass is a COMPLETE second render of every casting object in the
// frustum, and it ran at full frame rate whether or not anything had moved.
// Almost everything that casts here is scenery that will never move, so
// Balanced re-renders it every other frame.
//
// Getting that wrong is not subtle in its effect and is completely invisible in
// its cause. `WebGLShadowMap.render` begins:
//
//   if ( scope.enabled === false ) return;
//   if ( scope.autoUpdate === false && scope.needsUpdate === false ) return;
//
// — and it returns BEFORE allocating `light.shadow.map`. Every material in the
// scene is compiled against `shadowMap.enabled`, so they all carry a
// `sampler2DShadow`; with no map to bind, each draws against the renderer's
// default empty texture. That is one GL_INVALID_OPERATION per draw call:
//
//   Mismatch between texture format and sampler type (signed/unsigned/float/shadow)
//
// which is exactly how it was found — hundreds at a time in the console,
// because there are hundreds of draw calls in the frame that produced them.
// Nothing throws in JavaScript and the picture still renders.
//
//   node tools/test/shadows.mjs

import { readFileSync } from "node:fs";
import { QUALITY, QUALITY_ORDER, shadowSchedule } from "../../client/src/three/quality.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

section("1. the map is never left unbound");
{
  // The invariant, stated as the thing that actually goes wrong: on any frame
  // where the map does not exist, the pass MUST run.
  for (const interval of [0, 1, 2, 3, 4]) {
    for (let tick = 0; tick < 5; tick++) {
      const r = shadowSchedule(false, tick, interval);
      check(
        `no map, interval ${interval}, tick ${tick} -> renders`,
        r.needsUpdate === true,
        "materials would draw a sampler2DShadow against no texture",
      );
    }
  }
}

section("2. and once it exists, frames are actually skipped");
{
  let tick = 0;
  let rendered = 0;
  const FRAMES = 60;
  for (let f = 0; f < FRAMES; f++) {
    const r = shadowSchedule(true, tick, 2);
    tick = r.tick;
    if (r.needsUpdate) rendered++;
  }
  check("interval 2 halves the pass", rendered === FRAMES / 2, `${rendered}/${FRAMES}`);

  tick = 0;
  rendered = 0;
  for (let f = 0; f < FRAMES; f++) {
    const r = shadowSchedule(true, tick, 3);
    tick = r.tick;
    if (r.needsUpdate) rendered++;
  }
  check("interval 3 thirds it", rendered === FRAMES / 3, `${rendered}/${FRAMES}`);

  // A gap longer than the interval would be a visibly stale shadow.
  tick = 0;
  let gap = 0;
  let worstGap = 0;
  for (let f = 0; f < 300; f++) {
    const r = shadowSchedule(true, tick, 2);
    tick = r.tick;
    if (r.needsUpdate) { worstGap = Math.max(worstGap, gap); gap = 0; } else gap++;
  }
  check("no frame is skipped twice in a row at interval 2", worstGap <= 1, String(worstGap));
}

section("3. the levels that use it");
{
  for (const level of QUALITY_ORDER) {
    const q = QUALITY[level];
    check(`${level} declares an interval`, typeof q.shadowEveryNFrames === "number");
    check(
      `${level} does not skip shadows it has not enabled`,
      q.shadows || q.shadowEveryNFrames === 0,
      "shadows off should mean interval 0",
    );
  }
  check("High is untouched — every frame, as it always was", QUALITY.high.shadowEveryNFrames === 1);
  check("Balanced halves it", QUALITY.balanced.shadowEveryNFrames === 2);
  check("Performance has no shadows at all", QUALITY.performance.shadows === false);
}

section("4. no knob that silently does nothing");
{
  // PCFSoftShadowMap is deprecated in this three.js: WebGLShadowMap.render
  // warns and reassigns itself to PCFShadowMap on the first frame. A setting
  // for it would read correctly, apply silently and change nothing — the same
  // reason `antialias` is absent (it is fixed at context creation).
  const three = readFileSync(
    new URL("../../node_modules/three/src/renderers/webgl/WebGLShadowMap.js", import.meta.url),
    "utf8",
  );
  const deprecated = three.includes("PCFSoftShadowMap has been deprecated");
  const quality = readFileSync(
    new URL("../../client/src/three/quality.ts", import.meta.url),
    "utf8",
  );
  check(
    "softShadows is not offered while three.js ignores it",
    !deprecated || !/softShadows\s*:/.test(quality),
    "the setting would apply silently and change nothing",
  );
  check("and antialias is not offered either", !/antialias\s*:/.test(quality));
  const world = readFileSync(new URL("../../client/src/three/World.ts", import.meta.url), "utf8");
  check(
    "World asks quality.ts for the schedule rather than inlining it again",
    world.includes("shadowSchedule("),
  );
  check(
    "and changing mapSize still disposes the old map",
    /this\.sun\.shadow\.map\.dispose\(\)/.test(world),
    "three.js keeps rendering into the texture it already allocated otherwise",
  );
}

console.log(
  failures === 0
    ? "\nOK — the shadow pass is skipped only when there is something to keep"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
