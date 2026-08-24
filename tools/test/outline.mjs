// THE OUTLINE HAS TO TRACE WHAT YOU CAN SEE, not what is underneath it.
//
// Reported as a running character showing "a secondary copy of the body mesh,
// possibly the base rig before armor attachment", a translucent warm ghost
// offset from the armoured figure, worst while moving.
//
// It was exactly that. `buildRim` builds an inverted-hull outline from the mesh
// it is handed, and `finishBody` hands it `instance.object` — the naked rig —
// at a point where no gear exists yet, because armour and held items attach
// afterwards and asynchronously. So the figure on screen was armoured and its
// outline was the body underneath: wherever the two shapes disagree the body
// hull surfaces outside the armour, and running is when they disagree most.
//
// `buildRim`'s own comment had been reasoning about "the hood over the head, a
// bracer over a forearm" the whole time. Both are gear. Neither was ever in its
// `sources`.
//
// A SOURCE test: outlines are inverted hulls resolved by depth order on a GPU,
// and what went wrong is WHICH MESHES GET ONE — a question the source answers
// completely.
//
//   node tools/test/outline.mjs

import { readFileSync } from "node:fs";

const actor = readFileSync(
  new URL("../../client/src/three/Actor.ts", import.meta.url),
  "utf8",
);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

section("1. everything the actor wears is outlined, not just the body");
{
  check(
    "the per-mesh hull is reusable rather than inlined in buildRim",
    /private rimFor\(mesh: THREE\.Mesh\): void \{/.test(actor),
  );
  check(
    "buildRim goes through it",
    /for \(const mesh of sources\) this\.rimFor\(mesh\);/.test(actor),
  );
  // `trackMaterials` is the single path every held item and worn piece takes —
  // the file already relies on that for render order, and says so.
  const track = actor.slice(
    actor.indexOf("private trackMaterials("),
    actor.indexOf("private trackMaterials(") + 700,
  );
  check("worn and held gear go through it too", /this\.rimFor\(/.test(track),
    "the outline would trace the bare rig under the armour");
  check("and still get their render order there", /this\.trackMesh\(/.test(track));
}

section("2. swapping armour must not strip the whole figure");
{
  // The hulls are children of the gear meshes, so `clearGear` traverses into
  // them — but the outline and silhouette materials belong to the ACTOR and are
  // shared by every hull it owns. Disposing one because a breastplate changed
  // would take the outline off everything until the next full body rebuild.
  const clear = actor.slice(
    actor.indexOf("private clearGear("),
    actor.indexOf("private clearGear(") + 1400,
  );
  check(
    "clearGear skips the shared outline material",
    /m === this\.outlineMaterial/.test(clear),
    "an equip change would dispose the outline for the entire actor",
  );
  check("and the shared silhouette material", /m === this\.silhouetteMaterial/.test(clear));
  check(
    "and drops the hulls that left with their gear",
    /this\.rims = this\.rims\.filter/.test(clear),
    "the list would grow for the life of the actor across equip changes",
  );
}

section("3. the layering the whole effect depends on");
{
  // Silhouette 1, body and gear 2, outline 3. The outline is drawn AFTER the
  // figure and depth-tested against it, which is what makes it one line round
  // the outside instead of a loop round each of the eleven meshes a person is
  // made of.
  const order = (name) =>
    Number(new RegExp(`const ${name} = ([0-9]+);`).exec(actor)?.[1] ?? NaN);
  const sil = order("SILHOUETTE_RENDER_ORDER");
  const body = order("ACTOR_RENDER_ORDER");
  const out = order("OUTLINE_RENDER_ORDER");
  check("all three render orders are declared", [sil, body, out].every(Number.isFinite));
  check("silhouette draws before the figure", sil < body, `${sil} vs ${body}`);
  check("the outline draws after it", out > body, `${out} vs ${body}`);
  console.log(`  silhouette ${sil}, body and gear ${body}, outline ${out}`);
}

section("4. monsters pay for none of it");
{
  const game = readFileSync(
    new URL("../../client/src/three/Game.ts", import.meta.url),
    "utf8",
  );
  const spawn = game.slice(
    game.indexOf("const actor = new Actor({"),
    game.indexOf("const actor = new Actor({") + 1600,
  );
  check(
    "the monster rig asks for no silhouette",
    /silhouette: false/.test(spawn),
    "every monster would carry a duplicate skinned body",
  );
  check("and no rim, so rimFor is a no-op for its gear", !/rim:/.test(spawn));
}

console.log(
  failures === 0
    ? "\nOK — the outline traces the dressed figure"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
