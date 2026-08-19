// The ground: a tiled PBR surface that blends grass into dirt and breaks its
// own repetition.
//
// The problem this solves is that tiling is obvious. A texture repeated every
// few metres across a 120x90 field reads as wallpaper no matter how good the
// source image is, and buying a bigger source image does not help — the eye is
// picking up the PERIOD, not the resolution. So two things happen in the
// shader, both driven by world position rather than by UV:
//
//   1. A second surface (dirt) is mixed in under a low-frequency noise, so the
//      field has worn patches whose shape has nothing to do with the tile grid.
//   2. A much lower-frequency tint multiplies the albedo, so even inside one
//      surface the colour drifts across distances far larger than a tile.
//
// Both are cheap — a handful of noise samples — and between them the tile
// boundary stops being findable.

import * as THREE from "three";

const TEXTURE_PATH = "/textures/terrain";

/** World units per texture tile. Small enough to hold detail underfoot. */
const TILE_UNITS = 6;

/**
 * Poly Haven packs ambient occlusion, roughness and metalness into one image's
 * R, G and B channels. three reads roughness from green and metalness from blue
 * on their own maps, so handing the same texture to both is correct and costs
 * one upload rather than two. Ambient occlusion is deliberately left off: it
 * needs a second UV channel, and a tiled AO map on flat ground contributes
 * almost nothing.
 */
function loadSurface(name: string, repeat: number): {
  map: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
} {
  const loader = new THREE.TextureLoader();
  const get = (suffix: string, srgb: boolean) => {
    const t = loader.load(`${TEXTURE_PATH}/${name}_${suffix}.jpg`);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    // The ground is seen at a grazing angle almost everywhere, which is exactly
    // the case where anisotropy is the difference between crisp and smeared.
    t.anisotropy = 8;
    return t;
  };
  return { map: get("diff", true), normal: get("nor", false), arm: get("arm", false) };
}

// Value noise, four octaves. Written out rather than imported because it has to
// exist in GLSL anyway and a second copy in TypeScript would be a second thing
// to keep in step.
const NOISE_GLSL = /* glsl */ `
  float terrHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float terrNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(terrHash(i), terrHash(i + vec2(1.0, 0.0)), u.x),
      mix(terrHash(i + vec2(0.0, 1.0)), terrHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float terrFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 4; k++) {
      v += a * terrNoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

/**
 * @param spanUnits how wide the ground plane is, in world units. The plane's
 * own UV runs 0..1 across the whole thing, so this is what converts that into
 * a tile count — set on the textures rather than in the shader, so three's own
 * uv transform does the work and `vMapUv` arrives already tiled.
 */
export function createTerrainMaterial(spanUnits: number): THREE.MeshStandardMaterial {
  const repeat = spanUnits / TILE_UNITS;
  const grass = loadSurface("grass", repeat);
  const dirt = loadSurface("dirt", repeat);

  const material = new THREE.MeshStandardMaterial({
    map: grass.map,
    normalMap: grass.normal,
    roughnessMap: grass.arm,
    metalnessMap: grass.arm,
    roughness: 1,
    metalness: 0,
  });
  material.normalScale.set(0.75, 0.75);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.dirtMap = { value: dirt.map };
    shader.uniforms.dirtArm = { value: dirt.arm };

    // World XZ has to reach the fragment shader: every decision below is made
    // in world space so that patches stay put on the ground rather than
    // swimming with the UV.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vTerrainWorld;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vTerrainWorld;
        uniform sampler2D dirtMap;
        uniform sampler2D dirtArm;
        ${NOISE_GLSL}

        // How much dirt shows through, 0..1. One noise field, thresholded with
        // a soft edge so the patches have a definite shape instead of fading
        // everywhere at once.
        // Thresholded high on purpose: this is a grass field with worn patches
        // in it, not an even mix. Dropping the lower bound much below 0.58
        // tips it over into reading as bare dirt with grass on top.
        float terrainDirt(vec2 world) {
          return smoothstep(0.58, 0.80, terrFbm(world * 0.035));
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        float dirtAmount = terrainDirt(vTerrainWorld);

        vec4 grassTexel = texture2D(map, vMapUv);
        // Dirt is sampled at a deliberately incommensurate scale: at the same
        // one the two would line up and the blend would read as a single
        // texture changing colour rather than as two surfaces.
        vec4 dirtTexel = texture2D(dirtMap, vMapUv * 1.37);
        vec4 sampledDiffuseColor = mix(grassTexel, dirtTexel, dirtAmount);

        // Macro tint: a very low frequency drift so colour varies over tens of
        // metres. This is what actually defeats the tiling — the repeat is
        // still there, but no two tiles are the same colour.
        float macro = terrFbm(vTerrainWorld * 0.011);
        // Both ends stay above 1.0 on green: the drift should read as sunlight
        // and season across the field, never as the ground going grey. An
        // earlier pass darkened one end and the whole world looked overcast.
        vec3 tint = mix(vec3(0.88, 1.06, 0.80), vec3(1.14, 1.16, 0.94), macro);
        // A second, faster drift keeps mid-range patches from looking flat.
        tint *= mix(0.95, 1.08, terrFbm(vTerrainWorld * 0.06));
        sampledDiffuseColor.rgb *= tint;

        diffuseColor *= sampledDiffuseColor;
        `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `
        float roughnessFactor = roughness;
        vec4 grassArm = texture2D(roughnessMap, vRoughnessMapUv);
        vec4 dirtArmTexel = texture2D(dirtArm, vRoughnessMapUv * 1.37);
        roughnessFactor *= mix(grassArm.g, dirtArmTexel.g, dirtAmount);
        `,
      );
  };

  // Two materials that compile to different programs must not be cached as one.
  material.customProgramCacheKey = () => "wieldbound-terrain-v1";

  return material;
}
