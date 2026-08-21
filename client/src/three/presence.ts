// A soft light on the ground under every person in the world.
//
// The game already has three mechanisms for "you can always see your
// character": the camera pulls in when something gets between it and you, a
// blocking building fades where it physically cannot, and every actor carries a
// silhouette that draws where it is behind something else. All three answer the
// same question — what if my character is OCCLUDED — and none of them answers
// the other one, which is: **what if my character is simply hard to pick out.**
//
// That happens constantly and nothing was covering it. A brown-and-leather
// figure standing in long grass at dusk is not hidden behind anything; it is
// the same size, the same value and nearly the same colour as eighty thousand
// plants. Walk into a wood at night, or into a crowd of four other players at a
// resource node, and the thing you most need to find is the thing you have the
// least help finding.
//
// SO: A POOL OF LIGHT, NOT A RING.
//
// A ring is the obvious answer and it is the wrong one here, because this game
// already SPEAKS in ground rings and they all mean something else — gold for
// your target, a wider gold for a locked target, pale for hover, a wide faint
// one for your reach, and a red disc for a telegraphed slam. Another ring would
// be a fifth dialect of a language with four words in it, and worse, it would
// say "selected" rather than "here".
//
// A soft radial pool of light says neither. It has no edge to read as a
// boundary, it never overlaps a telegraph in a way that could be mistaken for
// one, and it reads as a property of the FIGURE rather than as a mark placed
// under it — which is the difference between finding your character and being
// told where to look.
//
// THREE THINGS THAT MAKE IT WORK RATHER THAN LOOK CHEAP.
//
// **It is strongest exactly when it is needed.** Scaled by darkness: at noon in
// an open field it is almost nothing, because at noon in an open field you can
// see perfectly well. At midnight under trees it is doing real work. A constant
// marker would be a permanent smudge for the eighteen minutes of every day when
// nothing needs marking.
//
// **You and everyone else are different colours.** Warm for you, cool for other
// players. That is the same distinction the nameplates already draw and it
// costs nothing to honour it here, and it means a busy node reads as "me and
// three others" at a glance rather than as five identical marks.
//
// **It breathes.** Very slightly, and slowly — enough that it never reads as a
// decal stuck to the terrain. The same argument the wind was built on.
//
// It is one instanced quad and one draw call for every person on screen.

import * as THREE from "three";

/** How many people may be marked at once. A node crowd, generously. */
const CAPACITY = 48;

/** How wide the pool is, in world units. A shade wider than a body. */
const RADIUS = 1.15;

const VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aStrength;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStrength;

  void main() {
    vUv = uv;
    vColor = aColor;
    vStrength = aStrength;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vStrength;

  void main() {
    if (vStrength <= 0.002) discard;
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;

    // A pool, not a disc. Two falloffs added: a broad one that reaches the whole
    // radius and gives the light somewhere to go, and a tight one at the middle
    // that puts the brightest part under the feet where the body meets the
    // ground. One falloff alone is either a hard puddle or an invisible haze.
    float broad = pow(1.0 - r, 2.2);
    float core = pow(max(0.0, 1.0 - r * 2.3), 2.0) * 0.85;

    // The breath. Slow, shallow, and out of phase with nothing — it exists only
    // so the mark is never perfectly still against ground that is.
    float breathe = 0.93 + 0.07 * sin(uTime * 1.35);

    float a = (broad * 0.5 + core) * vStrength * breathe;
    if (a <= 0.004) discard;
    // Additive: this is light falling ON the ground, so it must not cover the
    // grass it is lying across. Covering is what makes a marker read as a decal.
    gl_FragColor = vec4(vColor, clamp(a, 0.0, 1.0));
  }
`;

export interface Mark {
  x: number;
  z: number;
  y: number;
  /** True for the local player. Decides the colour and a little of the weight. */
  self: boolean;
}

/** Warm for you. */
const SELF_COLOR = new THREE.Color(0xffd9a0);
/** Cool for everyone else — the distinction the nameplates already draw. */
const OTHER_COLOR = new THREE.Color(0x9fd0ee);

export class Presence {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly colors: THREE.InstancedBufferAttribute;
  private readonly strengths: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly scratch = new THREE.Vector3();

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      // Depth-TESTED, though. The pool is on the ground and a wall in front of
      // it should hide it — this is a light, not an X-ray. That job belongs to
      // the silhouette in `Actor.ts`, which is the mechanism built for it.
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, this.material, CAPACITY);
    this.mesh.name = "presence";
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // Above the ground and the mist, below the actors and the fires.
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.colors = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    this.strengths = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    this.strengths.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aColor", this.colors);
    geo.setAttribute("aStrength", this.strengths);

    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < CAPACITY; i++) this.mesh.setMatrixAt(i, this.matrix);
  }

  /**
   * One frame.
   *
   * `night` is the same 0..1 the town's lanterns and the road's torches run on,
   * and `gloom` is anything else darkening the view — being under a canopy. The
   * two are added rather than maxed, because a wood at night is harder to pick a
   * figure out of than either on its own.
   */
  update(marks: Mark[], night: number, gloom: number, timeSeconds: number): void {
    this.material.uniforms.uTime.value = timeSeconds;
    const dark = Math.min(1, night * 0.85 + gloom * 0.6);

    const n = Math.min(marks.length, CAPACITY);
    for (let i = 0; i < CAPACITY; i++) {
      if (i >= n) {
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        this.strengths.setX(i, 0);
        continue;
      }
      const m = marks[i];
      const c = m.self ? SELF_COLOR : OTHER_COLOR;
      this.colors.setXYZ(i, c.r, c.g, c.b);
      // A FLOOR, then most of the range from the dark. In broad daylight there
      // is just enough to hold the figure to the ground; by midnight it is
      // carrying the readability of the whole scene.
      const base = m.self ? 0.1 : 0.07;
      const swing = m.self ? 0.5 : 0.36;
      this.strengths.setX(i, base + dark * swing);

      // Barely off the ground. Any higher and the pool detaches from the feet
      // as the camera pitches; any lower and it z-fights the terrain, which the
      // depth test would resolve as a flicker rather than as a mark.
      this.scratch.set(m.x, m.y + 0.035, m.z);
      this.matrix.makeScale(RADIUS * 2, 1, RADIUS * 2);
      this.matrix.setPosition(this.scratch);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.strengths.needsUpdate = true;
  }
}
