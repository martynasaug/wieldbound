// THE PLAYER RIG, ON ITS OWN, SO IT CAN BE LOOKED AT.
//
// `player_rig.py` generates the body and three still renders out of Blender,
// and stills answer some questions and not the ones that matter most: whether
// the idle reads as breathing or as twitching, whether the silhouette holds up
// while it turns, whether a joint pinches when it bends. Those need the thing
// moving, in the same renderer the game uses, at the same scale.
//
// Deliberately NOT the gear contact sheet next door. That page drives
// `Actor.setAppearance` — the whole dressing pipeline — and this body is not
// wired into it yet; the point of this page is to look at the rig BEFORE that
// happens, so a problem with the mesh is not diagnosed as a problem with the
// wardrobe. It loads one file and plays one clip.
//
//   http://localhost:5173/preview/rig.html
//
//   ?model=<path>     another GLB, for comparing against something
//   ?clip=<name>      a clip other than the first
//   ?grid=0           hide the ground grid

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const params = new URLSearchParams(location.search);
const MODEL = params.get("model") ?? "/models/Player_Base.glb";
const WANT_CLIP = params.get("clip");
const SHOW_GRID = params.get("grid") !== "0";

const hud = document.getElementById("hud")!;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14100a);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
// A LIT THREE-QUARTER VIEW, not the game's camera. The game looks down from a
// long way off and flattens everything; this is for inspecting a body, so it is
// closer and lower, where a joint that pinches is actually visible.
let orbit = 0.7;
let pitch = 0.18;
let distance = 3.1;

// Key light from the front-left with a fill behind, which is the arrangement
// that shows a silhouette: one side lit, one side dark, and a rim to lift the
// figure off the background.
const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
key.position.set(3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 20;
scene.add(key);
const rim = new THREE.DirectionalLight(0x88a8ff, 0.9);
rim.position.set(-4, 2.5, -3);
scene.add(rim);
scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x2a2114, 0.7));

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a2114, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
if (SHOW_GRID) {
  // A metre grid, so proportions can be read off rather than guessed at: the
  // body is authored at 1.8 units and "is the head too big" is a question about
  // measurements.
  const grid = new THREE.GridHelper(8, 16, 0x6a5024, 0x3a2f18);
  grid.position.y = 0.002;
  scene.add(grid);
}

let mixer: THREE.AnimationMixer | null = null;
let action: THREE.AnimationAction | null = null;
let skeleton: THREE.SkeletonHelper | null = null;
let paused = false;
let wireframe = false;
const meshes: THREE.Mesh[] = [];

new GLTFLoader().load(
  MODEL,
  (gltf) => {
    const root = gltf.scene;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      meshes.push(m);
    });
    scene.add(root);

    skeleton = new THREE.SkeletonHelper(root);
    skeleton.visible = false;
    scene.add(skeleton);

    let bones = 0;
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones++;
    });

    const clips = gltf.animations;
    if (clips.length) {
      mixer = new THREE.AnimationMixer(root);
      const clip = (WANT_CLIP && clips.find((c) => c.name === WANT_CLIP)) || clips[0];
      action = mixer.clipAction(clip);
      action.play();
    }
    const tris = meshes.reduce(
      (n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3,
      0,
    );
    hud.innerHTML =
      `<b>${MODEL.split("/").pop()}</b><br>` +
      `<span class="dim">${bones} bones · ${Math.round(tris)} triangles</span><br>` +
      `<span class="dim">clips: ${clips.map((c) => c.name).join(", ") || "none"}</span>`;
  },
  undefined,
  (err) => {
    hud.innerHTML = `<b style="color:#e08">could not load ${MODEL}</b><br><span class="dim">${err}</span>`;
  },
);

// --- looking around ---------------------------------------------------------
let dragging = false;
let lastX = 0;
let lastY = 0;
renderer.domElement.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener("pointerup", () => { dragging = false; });
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  orbit -= (e.clientX - lastX) * 0.008;
  pitch = Math.max(-0.4, Math.min(1.2, pitch + (e.clientY - lastY) * 0.005));
  lastX = e.clientX;
  lastY = e.clientY;
});
renderer.domElement.addEventListener("wheel", (e) => {
  e.preventDefault();
  distance = Math.max(1.4, Math.min(12, distance + e.deltaY * 0.002));
}, { passive: false });
addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    paused = !paused;
    e.preventDefault();
  }
  if (e.key === "b" && skeleton) skeleton.visible = !skeleton.visible;
  if (e.key === "w") {
    wireframe = !wireframe;
    for (const m of meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.wireframe = wireframe;
    }
  }
});
addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function frame(): void {
  requestAnimationFrame(frame);
  const dt = clock.getDelta();
  if (mixer && !paused) mixer.update(dt);
  // Aimed at the chest rather than the feet, so turning the camera does not
  // swing the figure across the screen.
  const focus = new THREE.Vector3(0, 0.95, 0);
  camera.position.set(
    focus.x + Math.sin(orbit) * Math.cos(pitch) * distance,
    focus.y + Math.sin(pitch) * distance,
    focus.z + Math.cos(orbit) * Math.cos(pitch) * distance,
  );
  camera.lookAt(focus);
  renderer.render(scene, camera);
}
frame();
