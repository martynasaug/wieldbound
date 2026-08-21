// Wind, applied to anything that grows.
//
// One shader hook, taken by the ground cover, the six woods and the perimeter
// treeline. `shared/wind.ts` decides what the wind is doing; this file is only
// about getting it into a vertex.
//
// FOUR THINGS IT HAS TO GET RIGHT, and each of them is a way the obvious
// version looks wrong:
//
//   1. THE BASE MUST NOT MOVE. A plant swayed as a whole slides across the
//      ground, which is the single most obvious tell — it reads as an object
//      being dragged rather than as something rooted. The displacement is
//      weighted by height above the instance's own origin, squared, so the tip
//      travels and the foot does not.
//   2. NEIGHBOURS MUST BE OUT OF PHASE. A field where every blade peaks
//      together is a field being shaken rather than a field with wind crossing
//      it. The phase is seeded from WORLD POSITION, which turns the whole
//      scatter into one travelling wave for free — and because it is position
//      and not an index, two plants that happen to be next to each other move
//      almost together while two a hundred units apart do not.
//   3. THE DIRECTION IS THE WORLD'S, NOT THE PLANT'S. Every instance carries a
//      random yaw so its model does not look stamped. Displacing along a local
//      axis would therefore blow each plant a different way, which is confetti,
//      not weather. The world wind is projected onto the instance's own axes on
//      the way in.
//   4. THE PHASE COMES FROM THE CLOCK. Integrating `dt` in the render loop
//      drifts: a tab that was backgrounded for ten minutes comes back ten
//      minutes behind, and two players in the same grass would see it moving
//      differently. It is derived, like the hour.
//
// The shadow pass is deliberately NOT hooked. Three renders shadows with its
// own depth material, so a swaying tree keeps a still shadow — visible only if
// you go looking, and the alternative is a second patched material per species
// and a second full pass of vertex work for a shadow that is a few pixels of
// dapple on a forest floor.

import * as THREE from "three";
import {
  SWAY_FLUTTER_MUL,
  SWAY_LEAN_MUL,
  SWAY_RATE_STEP,
  windAt,
} from "../../../shared/wind";

/**
 * The uniforms, shared by reference across every patched material.
 *
 * One object, handed to all of them, so the per-frame update is three
 * assignments no matter how many hundreds of instanced meshes are in the scene.
 * The same trick the river's flow uniform uses.
 */
const uniforms = {
  windDir: { value: new THREE.Vector3(1, 0, 0) },
  windPower: { value: 1 },
  windPhase: { value: 0 },
};

export interface WindOptions {
  /**
   * How tall this piece of geometry is in its own LOCAL units — the height over
   * which the bend ramps from nothing to full.
   *
   * Per PART and not a constant, because the geometry arriving here has not
   * been normalised: a glTF pine and a glTF clover are authored at whatever
   * size their author chose, and one number would have the clover snapping flat
   * while the pine barely noticed. Taken from the geometry's own bounding box
   * rather than from the species table, so it cannot disagree with what is
   * actually being drawn.
   */
  span: number;
  /**
   * The y the bend starts from — the geometry's own minimum.
   *
   * Not always zero, and assuming it was is a real bug rather than a tidiness
   * point: several models in this kit are authored centred on their origin, so
   * half the mesh sits at negative y. Dividing raw y by the span would clamp
   * that half to zero and hinge the plant about its waist.
   */
  base: number;
  /**
   * How far the tip travels at full wind, as a fraction of `span`.
   *
   * A blade of grass is nearly all bend; a pine is a mast with a bit of give at
   * the top. This is the one number worth tuning by eye.
   */
  amount: number;
  /**
   * How fast it flutters. Small things move quickly and big things do not —
   * the mass is doing the work, and getting this the wrong way round makes a
   * tree look like a shrub.
   */
  rate: number;
}

/**
 * Patches a material so anything drawn with it bends in the wind.
 *
 * CLONES, always. Materials arrive shared from the model cache — the same
 * material object is on every chunk of a species and sometimes across species
 * from the same file — so patching in place would give a fern a pine's span,
 * and patching twice would inject the chunk twice and fail to compile.
 */
export function windy(material: THREE.Material, opts: WindOptions): THREE.Material {
  const m = material.clone();
  const previous = (m as { onBeforeCompile?: unknown }).onBeforeCompile;

  m.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    if (typeof previous === "function") {
      (previous as (s: THREE.WebGLProgramParametersWithUniforms) => void)(shader);
    }
    shader.uniforms.windDir = uniforms.windDir;
    shader.uniforms.windPower = uniforms.windPower;
    shader.uniforms.windPhase = uniforms.windPhase;
    shader.uniforms.windSpan = { value: opts.span };
    shader.uniforms.windBase = { value: opts.base };
    shader.uniforms.windAmount = { value: opts.amount };
    // SNAPPED, not trusted. The phase wraps at a value that only comes back to
    // itself if every rate is a multiple of the step — see the note in
    // shared/wind.ts — and an unsnapped rate would put a whole-field jump into
    // one species every five minutes, which is exactly the kind of fault that
    // gets blamed on the driver.
    shader.uniforms.windRate = {
      value: Math.max(SWAY_RATE_STEP, Math.round(opts.rate / SWAY_RATE_STEP) * SWAY_RATE_STEP),
    };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 windDir;
        uniform float windPower;
        uniform float windPhase;
        uniform float windSpan;
        uniform float windBase;
        uniform float windAmount;
        uniform float windRate;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        {
          // Where this instance is rooted, in world space, and which way its
          // own axes point. Both come out of the instance matrix when there is
          // one and out of the model matrix when there is not, so the same
          // patched material serves the instanced woods and the cloned
          // treeline without a second code path.
          #ifdef USE_INSTANCING
            mat4 windModel = modelMatrix * instanceMatrix;
          #else
            mat4 windModel = modelMatrix;
          #endif
          vec3 windRoot = windModel[3].xyz;
          vec3 windAxisX = normalize(windModel[0].xyz);
          vec3 windAxisZ = normalize(windModel[2].xyz);

          // Height above the root, squared, so the foot is planted and the
          // motion is all in the top. Linear looks like a hinge.
          float windUp = clamp((position.y - windBase) / max(windSpan, 0.0001), 0.0, 1.0);
          float windLever = windUp * windUp;

          // Two terms. The slow one is the whole plant leaning away from the
          // wind; the fast one is the flutter that stops the lean reading as a
          // single static bend. Seeded from world position, which is what turns
          // a field into a travelling wave instead of a field being shaken.
          float windSeed = windRoot.x * 0.21 + windRoot.z * 0.17;
          float windLean = sin(windPhase * windRate * ${SWAY_LEAN_MUL.toFixed(4)} + windSeed);
          float windFlutter = sin(windPhase * windRate * ${SWAY_FLUTTER_MUL.toFixed(4)} + windSeed * 3.1);
          // Biased positive, so the plant spends most of its time leaning
          // downwind and only occasionally comes back through upright. A
          // symmetric wave reads as a metronome.
          //
          // THE SPLIT BETWEEN THE FIXED AND THE VARYING HALF IS THE WHOLE
          // AMPLITUDE, and the first pass had it wrong at 0.62/0.38: nearly two
          // thirds of the bend was a CONSTANT lean, which is a shape and not a
          // motion. It cost nothing visually and ate most of the budget — the
          // difference image showed the woods barely changing between frames
          // while every tree in them stood permanently bent. Slightly upwind at
          // the extreme, which is the recoil and reads correctly.
          float windBend =
            (0.45 + 0.55 * windLean) * windAmount * windPower * windLever * windSpan;

          // The world's direction, expressed in this instance's own axes —
          // otherwise every random yaw blows its plant a different way.
          transformed.x += dot(windDir, windAxisX) * windBend;
          transformed.z += dot(windDir, windAxisZ) * windBend;
          // And a small cross-wind jitter, which is most of what separates
          // "bending" from "alive".
          transformed.x += dot(windDir, windAxisZ) * windFlutter * windBend * 0.28;
          transformed.z -= dot(windDir, windAxisX) * windFlutter * windBend * 0.28;
        }`,
      );
  };

  // Two materials that compile to different programs must not share a cache
  // entry, and the span is baked into the uniforms rather than the source — so
  // the key only has to separate windy from not.
  const key = (m as { customProgramCacheKey?: () => string }).customProgramCacheKey;
  (m as { customProgramCacheKey?: () => string }).customProgramCacheKey = () =>
    `wieldbound-wind-v2|${typeof key === "function" ? key.call(m) : ""}`;
  m.needsUpdate = true;
  return m;
}

/**
 * Pushes the current wind into the shared uniforms. Once a frame, three writes.
 *
 * Bearings are in the simulation's XY plane, where +y is south; world Z is
 * south too, so the mapping is direct and needs no sign flip — the same
 * relationship every position transform in `World` already keeps.
 */
export function updateWind(nowMs: number = Date.now()): void {
  const w = windAt(nowMs);
  const a = (w.bearingDeg * Math.PI) / 180;
  uniforms.windDir.value.set(Math.cos(a), 0, Math.sin(a));
  uniforms.windPower.value = w.strength;
  uniforms.windPhase.value = w.phase;
}

/** What the wind is doing right now, for anything that is not a shader. */
export function currentWind(nowMs: number = Date.now()) {
  return windAt(nowMs);
}

/**
 * Wraps a geometry's material so the geometry bends, measuring the span off the
 * geometry itself.
 *
 * The one entry point the scatter and the forests both use, so there is exactly
 * one place that decides how a bend is measured. Returns the original material
 * untouched when the piece is too flat to bend — a pebble is geometry with a
 * material like anything else, and swaying it would be absurd.
 */
export function windyGeometry(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  amount: number,
  rate: number,
): THREE.Material {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return material;
  const span = box.max.y - box.min.y;
  if (span <= 0.0001) return material;
  return windy(material, { span, base: box.min.y, amount, rate });
}
