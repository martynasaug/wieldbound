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

// --- What is in flight ------------------------------------------------------
// The client fetches roughly fifty models and twenty megabytes of texture
// before the first frame is worth showing, and until now it did that behind a
// blank page with nothing to say for itself. A loading screen needs a number,
// and the only honest number is one this layer produces: a hardcoded "47
// models" is a constant that goes stale the first time a model is added, and it
// cannot know about the textures each one drags in behind it.
//
// So the counters live where the fetches are. `total` GROWS as work is
// discovered — dressing an FBX starts its textures — which means the bar can
// move backwards in percentage terms early on. That is honest, and the
// alternative (guess the total, then round the last 20% away) is the thing
// every loading bar is mistrusted for.
export interface LoadProgress {
  done: number;
  total: number;
  /** The most recent thing to start, for the line under the bar. */
  label: string;
}

const progress: LoadProgress = { done: 0, total: 0, label: "" };
const progressListeners = new Set<(p: LoadProgress) => void>();
let settleWaiters: (() => void)[] = [];

function beginLoad(label: string): void {
  progress.total++;
  progress.label = label;
  emitProgress();
}

function endLoad(): void {
  progress.done++;
  emitProgress();
  // Deliberately deferred a turn: finishing one model synchronously starts its
  // textures, so resolving on the same tick would report "settled" in the gap
  // between the two.
  if (progress.done >= progress.total && settleWaiters.length) {
    queueMicrotask(() => {
      if (progress.done < progress.total) return;
      const waiting = settleWaiters;
      settleWaiters = [];
      for (const w of waiting) w();
    });
  }
}

function emitProgress(): void {
  for (const fn of progressListeners) fn(progress);
}

/** Subscribe to load progress. Returns an unsubscribe. */
export function onLoadProgress(fn: (p: LoadProgress) => void): () => void {
  progressListeners.add(fn);
  fn(progress);
  return () => progressListeners.delete(fn);
}

/**
 * Registers one fetch this module does not own, and returns the "it finished"
 * callback. The terrain's six Poly Haven maps are the single heaviest thing the
 * client downloads and they are loaded straight off a `TextureLoader` there —
 * so without this the bar would fill while the largest download was still
 * running, which is worse than having no bar.
 */
export function trackLoad(label: string): () => void {
  beginLoad(label);
  let settled = false;
  return () => {
    if (settled) return;
    settled = true;
    endLoad();
  };
}

export function loadProgress(): LoadProgress {
  return progress;
}

/**
 * Resolves when nothing is in flight.
 *
 * Awaiting the models alone is not enough: a texture is requested while its
 * model is being dressed and is not awaited by anything, so a scene can finish
 * "loading" and then visibly repaint as twenty megabytes of albedo arrive one
 * by one. This is what lets the loading screen come down on a frame that is
 * actually finished.
 */
export function whenLoadsSettle(): Promise<void> {
  if (progress.total > 0 && progress.done >= progress.total) return Promise.resolve();
  return new Promise((resolve) => settleWaiters.push(resolve));
}

// A debug handle for the load itself, alongside `__wieldbound` and
// `__wieldboundRules`. A load that never finishes is otherwise completely
// opaque — the screen simply sits there — and this is what can say which file
// is still outstanding.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__wieldboundLoad = {
    progress: () => ({ ...progress }),
    onLoadProgress,
    whenLoadsSettle,
  };
}

function texture(name: string): THREE.Texture {
  let t = textureCache.get(name);
  if (!t) {
    beginLoad(`${name}.png`);
    t = texLoader.load(
      `${TEXTURE_PATH}/${name}.png`,
      endLoad,
      undefined,
      // A missing texture leaves the material untextured, which is a look, not
      // a hang — but it must still count as finished or the bar never fills.
      endLoad,
    );
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
    beginLoad(name);
    p = new Promise<THREE.Group>((resolve, reject) => {
      const fail = (err: unknown) => {
        endLoad();
        reject(new Error(`failed to load ${name}: ${String(err)}`));
      };
      if (isGltf) {
        gltfLoader.load(
          url,
          (gltf) => {
            const group = gltf.scene as THREE.Group;
            // three keeps animations on the parsed result, not the scene graph,
            // so they have to be carried across or instantiate() finds none.
            group.animations = gltf.animations;
            dressGltf(group);
            endLoad();
            resolve(group);
          },
          undefined,
          fail,
        );
      } else {
        fbxLoader.load(
          url,
          (group) => {
            // Dressed before the load is counted off, because dressing is what
            // discovers the textures — counting first would let the total
            // momentarily equal the done count and settle the loader early.
            dressFbx(group);
            endLoad();
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
