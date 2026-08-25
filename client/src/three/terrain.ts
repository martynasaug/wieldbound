// The ground: four PBR surfaces blended by three noise fields, plus a near-field
// detail layer that only exists where the camera can resolve it.
//
// THE PROBLEM IS NOT RESOLUTION, IT IS INFORMATION. A tiled texture across a
// four-hundred-unit field reads as wallpaper no matter how good the source
// image is, because the eye picks up the PERIOD rather than the pixels — and a
// bigger source image does not change the period. The first version of this
// file solved that with two surfaces and two noise fields, which killed the
// tiling and left something else: a field with exactly one kind of boundary in
// it. Green here, brown there, everywhere, forever. Nothing to find after the
// first second.
//
// So there are three things happening now, at three different scales, and they
// are deliberately independent so that no two of them line up:
//
//   1. A REGIONAL drift between two grasses, over tens of metres. This is the
//      slowest field and it does the most work: it means two patches of "grass"
//      a hundred units apart are visibly not the same grass.
//   2. WEAR — dirt cut into whatever the region is, thresholded hard enough to
//      have a shape rather than a gradient, with gravel showing through the
//      middle of the worst of it. The gravel is what gives a bare patch an edge
//      instead of a fade, and an edge is what makes it read as ground that has
//      been walked on rather than as a stain.
//   3. DETAIL, at a metre or so, faded out with distance from the camera. This
//      is the one that fixes "plain": at this camera the ground nearest the
//      player fills a third of the screen and was being drawn with exactly the
//      same information as the ground at the fog line. Fading it by distance is
//      not an optimisation, it is the whole trick — a high-frequency multiplier
//      that carried on into the distance would alias into shimmering noise, and
//      that is worse than flat.
//
// Everything is driven by WORLD POSITION rather than UV, so a patch stays on the
// ground when the camera moves instead of swimming with it.

import * as THREE from "three";
import { trackLoad } from "./assets";

const TEXTURE_PATH = "/textures/terrain";

/**
 * World units per texture tile.
 *
 * Down from 6. Six metres to a tile put the grass blades in the source image at
 * roughly a pixel each by the time they reached the screen, which is the
 * definition of detail you have paid for and cannot see. At 3.4 the near ground
 * resolves and the tiling that would normally expose is hidden by the three
 * fields above — which is the trade this whole file exists to make.
 */
const TILE_UNITS = 3.4;

/** How far from the camera the detail layer has faded out completely. */
const DETAIL_FADE_UNITS = 34;

/**
 * Poly Haven packs ambient occlusion, roughness and metalness into one image's
 * R, G and B channels. three reads roughness from green and metalness from blue
 * on their own maps, so handing the same texture to both is correct and costs
 * one upload rather than two. Ambient occlusion is deliberately left off: it
 * needs a second UV channel, and a tiled AO map on flat ground contributes
 * almost nothing.
 */
function loadSurface(
  name: string,
  repeat: number,
  withNormal: boolean,
  anisotropy: number,
): { map: THREE.Texture; normal: THREE.Texture | null; arm: THREE.Texture } {
  const loader = new THREE.TextureLoader();
  const get = (suffix: string, srgb: boolean) => {
    // Counted by the shared loader, or the loading screen would fill while the
    // heaviest files in the game were still on the wire.
    const done = trackLoad(`${name}_${suffix}.jpg`);
    const t = loader.load(`${TEXTURE_PATH}/${name}_${suffix}.jpg`, done, undefined, done);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    // The ground is seen at a grazing angle almost everywhere, which is exactly
    // the case where anisotropy is the difference between crisp and smeared.
    // Sixteen rather than eight now that the tile is half the size: a smaller
    // tile is a steeper gradient in UV space, and that is what anisotropy is
    // measured against. Tied to quality (see quality.ts's anisotropyCap) since
    // that gradient-sharpening cost is paid per sample on the largest, most
    // grazing-angle surface on screen, on every one of up to twelve terrain
    // textures — the ground plane is built once, so there is nothing to update
    // live if the setting changes; it takes effect on the next load same as
    // antialias does.
    t.anisotropy = anisotropy;
    return t;
  };
  return {
    map: get("diff", true),
    // NOT EVERY SURFACE GETS ONE. Four normal maps is four more texture reads
    // per fragment on the largest thing on screen, to perturb lighting that at
    // this camera angle is already mostly flat. Grass and dirt carry the two
    // that matter — they are the pair that meets at every wear edge — and the
    // regional grass and the gravel borrow whichever is dominant there.
    normal: withNormal ? get("nor", false) : null,
    arm: get("arm", false),
  };
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
  // Two octaves only. Used for the fields that decide WHERE things are rather
  // than what they look like, where four octaves buys nothing but cost — a
  // biome boundary does not need fine detail, it needs a shape.
  float terrFbm2(vec2 p) {
    return 0.65 * terrNoise(p) + 0.35 * terrNoise(p * 2.07 + 11.3);
  }
`;

/**
 * @param spanUnits how wide the ground plane is, in world units. The plane's
 * own UV runs 0..1 across the whole thing, so this is what converts that into
 * a tile count — set on the textures rather than in the shader, so three's own
 * uv transform does the work and `vMapUv` arrives already tiled.
 */
export function createTerrainMaterial(spanUnits: number, anisotropy: number): THREE.MeshStandardMaterial {
  const repeat = spanUnits / TILE_UNITS;
  const grass = loadSurface("grass", repeat, true, anisotropy);
  const dirt = loadSurface("dirt", repeat, true, anisotropy);
  const dry = loadSurface("drygrass", repeat, false, anisotropy);
  const gravel = loadSurface("gravel", repeat, false, anisotropy);

  const material = new THREE.MeshStandardMaterial({
    map: grass.map,
    normalMap: grass.normal!,
    roughnessMap: grass.arm,
    metalnessMap: grass.arm,
    roughness: 1,
    metalness: 0,
  });
  material.normalScale.set(1.15, 1.15);

  material.onBeforeCompile = (shader) => {
    shader.uniforms.dirtMap = { value: dirt.map };
    shader.uniforms.dirtArm = { value: dirt.arm };
    shader.uniforms.dirtNormal = { value: dirt.normal };
    shader.uniforms.dryMap = { value: dry.map };
    shader.uniforms.dryArm = { value: dry.arm };
    shader.uniforms.gravelMap = { value: gravel.map };
    shader.uniforms.gravelArm = { value: gravel.arm };
    shader.uniforms.detailFade = { value: DETAIL_FADE_UNITS };

    // World XZ and the distance to the camera both have to reach the fragment
    // shader: every decision below is made in world space so that patches stay
    // put on the ground rather than swimming with the UV, and the detail layer
    // needs to know how far away it is being drawn.
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vTerrainWorld;
        varying float vTerrainDist;
        // Baked on the mesh rather than derived here. See World.buildTerrain:
        // a wood is a table of discs and a river is a polyline, and neither is
        // a noise function that a shader can cheaply ask about.
        attribute float aCanopy;
        attribute float aWet;
        varying float vCanopy;
        varying float vWet;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 terrWorld = modelMatrix * vec4(transformed, 1.0);
        vTerrainWorld = terrWorld.xz;
        vTerrainDist = length(cameraPosition - terrWorld.xyz);
        vCanopy = aCanopy;
        vWet = aWet;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vTerrainWorld;
        varying float vTerrainDist;
        varying float vCanopy;
        varying float vWet;
        uniform sampler2D dirtMap;
        uniform sampler2D dirtArm;
        uniform sampler2D dirtNormal;
        uniform sampler2D dryMap;
        uniform sampler2D dryArm;
        uniform sampler2D gravelMap;
        uniform sampler2D gravelArm;
        uniform float detailFade;
        ${NOISE_GLSL}

        // --- The three fields -------------------------------------------
        // Each is sampled at a scale that is not a multiple of the others, so
        // no two of them ever line up into one visible feature. That is the
        // same reason the dirt UV is 1.37x the grass UV rather than 1x.

        // WHICH GRASS. The slowest field in the shader — a full cycle is on the
        // order of a hundred and fifty units, so it reads as the land changing
        // rather than as a patch of anything.
        float terrainRegion(vec2 world) {
          return smoothstep(0.36, 0.64, terrFbm2(world * 0.0062));
        }

        // HOW WORN. Thresholded hard on purpose: this is a grass field with
        // worn patches in it, not an even mix, and a soft threshold gives every
        // patch a hundred-unit gradient instead of a shape. Dropping the lower
        // bound much below 0.55 tips it over into reading as bare dirt with
        // grass on top.
        float terrainWear(vec2 world) {
          float base = terrFbm(world * 0.031);
          // A second, faster field breaks the outline so a patch is not an
          // ellipse. Cheap, and it is the difference between "worn ground" and
          // "somebody airbrushed here".
          base += (terrFbm(world * 0.13) - 0.5) * 0.14;
          return smoothstep(0.55, 0.78, base);
        }

        // Stone under the worst of the wear. Rides ON the wear field rather
        // than being its own, so gravel can only ever appear inside bare earth
        // — which is what stops it turning up in the middle of a lawn.
        float terrainStone(vec2 world, float wear) {
          float m = smoothstep(0.62, 0.9, terrFbm(world * 0.055 + 31.7));
          return m * smoothstep(0.55, 1.0, wear);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        float wear = terrainWear(vTerrainWorld);
        float region = terrainRegion(vTerrainWorld);
        float stone = terrainStone(vTerrainWorld, wear);

        // --- What is standing on it, and what is running through it ---------
        //
        // FOREST FLOOR. Litter, not lawn — so the wear field is pushed up to a
        // floor value under a canopy and the dry regional grass is pushed down,
        // because the one thing a wood's floor is definitely not is the pale
        // sunburnt grass of an open field. Broken with its own noise rather
        // than applied flat, or the wood would have a smooth brown disc under
        // it that reads as a stain and gives the canopy away as a circle.
        float litter = vCanopy * mix(0.55, 1.0, terrFbm(vTerrainWorld * 0.09));
        wear = max(wear, litter * 0.66);
        region *= 1.0 - vCanopy * 0.85;

        // RIVERBANK. Shingle, and it wins outright: gravel normally may only
        // appear inside bare earth, and a bank is the one place in the world
        // where stone at the waterline needs no excuse.
        // Broken with its own noise, because a shingle band of constant width
        // is a hem sewn onto the river. A real bank is stone where the water
        // scours and grass where it does not, and the boundary is ragged.
        float shingle = vWet * vWet;
        shingle *= mix(0.45, 1.25, terrFbm(vTerrainWorld * 0.19));
        shingle = clamp(shingle, 0.0, 1.0);
        wear = max(wear, shingle);
        stone = max(stone, shingle * 0.9);

        // Every surface is sampled at a deliberately incommensurate scale. At
        // the same one they would line up and the blend would read as a single
        // texture changing colour rather than as several surfaces.
        vec4 grassTexel = texture2D(map, vMapUv);
        vec4 dryTexel = texture2D(dryMap, vMapUv * 0.83);
        vec4 dirtTexel = texture2D(dirtMap, vMapUv * 1.37);
        vec4 gravelTexel = texture2D(gravelMap, vMapUv * 1.71);

        vec4 sampledDiffuseColor = mix(grassTexel, dryTexel, region);
        sampledDiffuseColor = mix(sampledDiffuseColor, dirtTexel, wear);
        sampledDiffuseColor = mix(sampledDiffuseColor, gravelTexel, stone);

        // MACRO TINT. A very low frequency drift so colour varies over tens of
        // metres. Both ends stay above 1.0 on green: the drift should read as
        // sunlight and season across the field, never as the ground going grey.
        // An earlier pass darkened one end and the whole world looked overcast.
        float macro = terrFbm(vTerrainWorld * 0.011);
        vec3 tint = mix(vec3(0.86, 1.07, 0.78), vec3(1.16, 1.17, 0.95), macro);
        // A second, faster drift keeps mid-range patches from looking flat.
        tint *= mix(0.94, 1.09, terrFbm(vTerrainWorld * 0.06));
        // A wood is darker than the field it stands in, and that is most of
        // how a canopy reads from outside it — the shadow map cannot do this,
        // because it covers thirty-odd units around the player and a forest is
        // sixty across.
        tint *= mix(1.0, 0.62, vCanopy);
        tint *= mix(1.0, 0.74, shingle);
        sampledDiffuseColor.rgb *= tint;

        // NEAR-FIELD DETAIL. A metre-scale multiplier that exists only where
        // the camera can resolve it and is gone by the time it would alias.
        // This is the single biggest change to how the ground reads underfoot,
        // and it is also why it can be this strong: at range it is not there to
        // shimmer.
        float near = 1.0 - smoothstep(0.0, detailFade, vTerrainDist);
        if (near > 0.001) {
          float grain = terrFbm(vTerrainWorld * 1.9);
          float speck = terrNoise(vTerrainWorld * 7.3);
          float detail = mix(1.0, 0.80 + grain * 0.44, near * 0.85);
          detail *= mix(1.0, 0.93 + speck * 0.15, near * 0.7);
          sampledDiffuseColor.rgb *= detail;
        }

        diffuseColor *= sampledDiffuseColor;
        `,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `
        float roughnessFactor = roughness;
        vec4 grassArm = texture2D(roughnessMap, vRoughnessMapUv);
        vec4 dryArmTexel = texture2D(dryArm, vRoughnessMapUv * 0.83);
        vec4 dirtArmTexel = texture2D(dirtArm, vRoughnessMapUv * 1.37);
        vec4 gravelArmTexel = texture2D(gravelArm, vRoughnessMapUv * 1.71);
        float rough = mix(grassArm.g, dryArmTexel.g, region);
        rough = mix(rough, dirtArmTexel.g, wear);
        // Wet-looking stone is worse than flat stone, so gravel is pushed
        // rougher than its own map claims.
        rough = mix(rough, max(gravelArmTexel.g, 0.72), stone);
        roughnessFactor *= rough;
        `,
      )
      // Two normal maps, blended by the wear field. Grass and dirt are the pair
      // that meets at every worn edge, which is the only place on this ground
      // where the lighting difference between two surfaces is legible.
      .replace(
        "#include <normal_fragment_maps>",
        `
        vec3 grassN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 dirtN = texture2D( dirtNormal, vNormalMapUv * 1.37 ).xyz * 2.0 - 1.0;
        vec3 mapN = normalize( mix( grassN, dirtN, wear ) );
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );
        `,
      );
  };

  // Two materials that compile to different programs must not be cached as one.
  material.customProgramCacheKey = () => "wieldbound-terrain-v3";

  return material;
}
