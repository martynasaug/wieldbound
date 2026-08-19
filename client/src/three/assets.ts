// Model loading, caching and instancing for the 3D client.
//
// Two things here are not optional and are easy to get wrong:
//
// 1. Skinned meshes MUST be cloned with SkeletonUtils.clone(). Object3D.clone()
//    copies the mesh but keeps pointing at the ORIGINAL skeleton, so every
//    monster of a kind ends up sharing one pose — they all play whatever
//    animation the last one started. SkeletonUtils rebuilds the bone graph.
//
// 2. Textures keep three's default flipY. The usual advice for FBX is to force
//    flipY = false; doing that here put every UV island on the wrong part of
//    the atlas and rendered the warrior's steel plate as the brown leather that
//    sits directly above it in the sheet.

import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

const MODEL_PATH = "/models";
const TEXTURE_PATH = "/textures";

// The texture files actually present. Material names only mostly match them:
// weapons add a `_Texture` suffix, `Birch_Leaves` has colour variants, and
// plain `Bark` has no file at all — hence exact, then suffixed, then prefix.
const TEXTURE_FILES = [
  "Warrior_Texture", "Ranger_Texture", "Wizard_Texture",
  "Monk_Texture", "Rogue_Texture", "Cleric_Texture",
  "Warrior_Sword_Texture",
  "Ranger_Bow_Texture", "Ranger_Arrow_Texture", "Wizard_Staff_Texture",
  "Rogue_Dagger_Texture", "Cleric_Staff_Texture",
  "Bark_Dead", "Birch_Bark", "Birch_Bark_Dead",
  "Birch_Leaves_Green", "Birch_Leaves_Yellow",
  "Tree_Leaves", "Pine_Leaves", "Pine_Leaves_Light", "Pine_Leaves_Red",
  "Leaves_Blue", "Leaves_Cyan", "Leaves_DarkRed", "Leaves_Light",
  "Leaves_Orange", "Leaves_Pink", "Leaves_Purple", "Leaves_Red",
];

// Materials with no texture file get a deliberate colour rather than whatever
// the FBX happened to author (which is usually flat white).
const MATERIAL_COLORS: Record<string, number> = {
  Bark: 0x6b4b2f,
  Body: 0x57c26a,
  Eyes: 0x141414,
  Skeleton: 0xd8d2be,
  Bat: 0x4a3b52,
  Dragon: 0x8a5a3c,
};

// Material names that do not resolve by any rule. The Ranger rig calls its bow
// material `Bow_Texture` while the file shipped as `Ranger_Bow_Texture`, and no
// amount of prefix matching bridges that.
const TEXTURE_ALIASES: Record<string, string> = {
  Bow_Texture: "Ranger_Bow_Texture",
};

function resolveTexture(name: string | undefined): string | null {
  if (!name) return null;
  if (TEXTURE_ALIASES[name]) return TEXTURE_ALIASES[name];
  if (TEXTURE_FILES.includes(name)) return name;
  if (TEXTURE_FILES.includes(`${name}_Texture`)) return `${name}_Texture`;
  return TEXTURE_FILES.find((f) => f.startsWith(`${name}_`)) ?? null;
}

const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
const modelCache = new Map<string, Promise<THREE.Group>>();

function texture(name: string): THREE.Texture {
  let t = textureCache.get(name);
  if (!t) {
    t = texLoader.load(`${TEXTURE_PATH}/${name}.png`);
    t.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(name, t);
  }
  return t;
}

/** Shadow flags only. glTF already arrives with correct PBR materials and its
 *  texture embedded, so touching the materials would only lose the map. */
function dressGltf(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

/**
 * Replaces the FBX's authored materials with lit standard materials, binds
 * textures where a matching file exists, and turns on shadow casting.
 */
function dressFbx(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const dressed = source.map((m) => {
      const src = m as THREE.MeshPhongMaterial;
      const std = new THREE.MeshStandardMaterial({
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        roughness: 0.86,
        metalness: 0.0,
        transparent: src.transparent,
        alphaTest: src.transparent ? 0.5 : 0,
      });
      std.name = src.name;
      const tex = resolveTexture(src.name);
      if (tex) {
        std.map = texture(tex);
        std.color.setHex(0xffffff);
      } else if (MATERIAL_COLORS[src.name] !== undefined) {
        std.color.setHex(MATERIAL_COLORS[src.name]);
      }
      return std;
    });
    mesh.material = dressed.length === 1 ? dressed[0] : dressed;
  });
}

/**
 * Loads (and caches) one model. The cached object is a prototype — never added
 * to a scene; callers get their own copy via instantiate().
 *
 * `name` carries its extension so both formats can coexist: the characters and
 * trees are FBX, and the monster pack is glTF, which is ~2.7x smaller for the
 * same model, ships its texture embedded, and needs none of the FBX material
 * and UV fixing below.
 */
export function loadModel(name: string): Promise<THREE.Group> {
  let p = modelCache.get(name);
  if (!p) {
    const isGltf = name.endsWith(".gltf") || name.endsWith(".glb");
    const url = `${MODEL_PATH}/${name}${isGltf ? "" : ".fbx"}`;
    p = new Promise<THREE.Group>((resolve, reject) => {
      const fail = (err: unknown) => reject(new Error(`failed to load ${name}: ${String(err)}`));
      if (isGltf) {
        gltfLoader.load(
          url,
          (gltf) => {
            const group = gltf.scene as THREE.Group;
            // three keeps animations on the parsed result, not the scene graph,
            // so they have to be carried across or instantiate() finds none.
            group.animations = gltf.animations;
            dressGltf(group);
            resolve(group);
          },
          undefined,
          fail,
        );
      } else {
        fbxLoader.load(
          url,
          (group) => {
            dressFbx(group);
            resolve(group);
          },
          undefined,
          fail,
        );
      }
    });
    modelCache.set(name, p);
  }
  return p;
}

export interface Instance {
  object: THREE.Group;
  animations: THREE.AnimationClip[];
  /** Uniform scale applied to reach the requested height, for placing attachments. */
  scale: number;
}

/**
 * An independent, animatable copy of a model, scaled so it stands `height`
 * world units tall with its feet on y=0.
 */
export async function instantiate(name: string, height: number): Promise<Instance> {
  const proto = await loadModel(name);
  const object = cloneSkinned(proto) as THREE.Group;
  const animations = proto.animations ?? [];

  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = size.y > 0 ? height / size.y : 1;
  object.scale.setScalar(scale);

  // Re-seat on the ground after scaling. Box3 reads matrixWorld, which is stale
  // on a fresh clone that has not been added to a scene yet.
  object.updateMatrixWorld(true);
  const seated = new THREE.Box3().setFromObject(object);
  object.position.y -= seated.min.y;

  return { object, animations, scale };
}

/** Finds the first descendant whose name matches every pattern (case-insensitive). */
export function findNode(root: THREE.Object3D, ...patterns: string[]): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    if (patterns.every((p) => new RegExp(p, "i").test(o.name))) found = o;
  });
  return found;
}

/** Strips the Blender armature prefix that FBX bakes into every clip name. */
export function clipName(raw: string): string {
  return raw.replace(/^.*\|/, "");
}

export function findClip(
  clips: THREE.AnimationClip[],
  ...preferred: string[]
): THREE.AnimationClip | null {
  for (const want of preferred) {
    const exact = clips.find((c) => clipName(c.name).toLowerCase() === want.toLowerCase());
    if (exact) return exact;
  }
  for (const want of preferred) {
    const loose = clips.find((c) => new RegExp(want, "i").test(clipName(c.name)));
    if (loose) return loose;
  }
  return null;
}
