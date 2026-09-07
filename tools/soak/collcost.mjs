// What does the iterated resolver COST, in the worst place for it?
//
// `resolvePlayerPosition` repeats until nothing moves, and the town resolver it
// calls repeats up to sixteen times over every prop. The common case exits after
// one pass of each, but "common" is not "always", and this runs on every frame
// of movement — so the worst case is worth knowing rather than assuming.
//
// Pure geometry, no browser: the answer is the same either way and this way it
// takes a second.
import { PLAYER_BODY_RADIUS_PX } from "../../shared/protocol-types.ts";
import { TOWN_CENTER, TOWN_RADIUS_PX } from "../../shared/town.ts";
import { resolvePlayerPosition } from "../../shared/collision.ts";

const R = PLAYER_BODY_RADIUS_PX;
const MONSTER_R = 58;

const bench = (label, points, bodies) => {
  // Warm, so the first-call JIT cost is not the measurement.
  for (const p of points) resolvePlayerPosition(p.x, p.y, R, bodies);
  const t0 = performance.now();
  for (const p of points) resolvePlayerPosition(p.x, p.y, R, bodies);
  const ms = performance.now() - t0;
  console.log(`  ${label}: ${(ms / points.length * 1000).toFixed(1)}us per call over ${points.length} positions`);
};

// Open ground far from anything — what a frame costs almost always.
const field = [];
for (let i = 0; i < 4000; i++) {
  field.push({ x: TOWN_CENTER.x + 3000 + (i % 60) * 7, y: TOWN_CENTER.y + 3000 + ((i / 60) | 0) * 7 });
}
// Inside the town, among the props.
const town = [];
for (let i = 0; i < 4000; i++) {
  const a = (i / 4000) * Math.PI * 2 * 7;
  const r = 120 + (i % 640);
  town.push({ x: TOWN_CENTER.x + Math.cos(a) * r, y: TOWN_CENTER.y + Math.sin(a) * r });
}
// Against the wall with a body on top — the case that used to never settle.
const pinned = [];
for (let i = 0; i < 2000; i++) {
  const a = (i / 2000) * Math.PI * 2;
  pinned.push({ x: TOWN_CENTER.x + Math.cos(a) * (TOWN_RADIUS_PX - 20), y: TOWN_CENTER.y + Math.sin(a) * (TOWN_RADIUS_PX - 20) });
}
const bodyOn = (p) => [{ x: p.x + 20, y: p.y, radiusPx: MONSTER_R }];

console.log("cost of one collision resolve:");
bench("open field, nothing near", field, []);
bench("inside town, among the props", town, []);
const first = pinned[0];
bench("against the wall, body overlapping", pinned, bodyOn(first));
console.log("\nA 60fps frame is 16,700us. Anything here under ~50us is noise.");
