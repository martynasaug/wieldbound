// Ground mist: the air itself, in the places and at the hours it would be.
//
// The world has had distance fog since Phase 47 and it does the job distance
// fog does — it hides the far plane and it takes the sky's colour so the
// horizon has no seam. What it cannot do is be somewhere. Fog that is the same
// everywhere is a property of the camera; mist lying in a hollow, or standing
// over water at first light and gone by mid-morning, is a property of the
// WORLD, and it is the difference between a lit scene and a place with weather
// in it.
//
// FIVE DECISIONS.
//
// **It is horizontal sheets, not a volume.** Real volumetrics need a depth
// prepass and a raymarch and would cost more than everything else in this file
// put together. Overlapping soft ground-parallel quads is the old trick and it
// is the RIGHT one at this camera specifically: the pitch is fixed at about 41
// degrees looking down, so a horizontal sheet is always seen at a shallow
// angle, which is exactly the angle at which a flat card reads as depth. A
// camera that could drop to the horizon would see them edge-on and the illusion
// would fail; this one cannot.
//
// **Where it lies is a rule, not a scatter.** `mistAt` answers in the same
// vocabulary `placeNameAt` speaks — over the water, in the hollows, under the
// trees — so the Coldwater at dawn is a different place to stand than the ridge
// above it. Mist that were merely everywhere would be a lens filter.
//
// **It takes the sky's colour.** The scene's fog already tracks the day/night
// keyframes, and mist that did not would be a grey sheet lying on an orange
// dawn. It is handed the same colour and lifted slightly, because suspended
// water is brighter than the air behind it.
//
// **It fades at BOTH ends.** Beyond the neighbourhood, so there is no wall; and
// within a few units of the camera, so walking forward does not put your face
// inside a white card. The near fade is the one that is easy to leave out and
// impossible to unsee afterwards.
//
// **It drifts, and it dissolves.** The sheets ride M54.1's wind field like
// everything else outdoors, and each one's interior is animated noise, so a
// bank of mist changes shape rather than sliding across the ground as a rigid
// texture. Two motions at different rates, for the same reason the wind has
// two: one of anything reads as a loop.

import * as THREE from "three";
import { terrainHeight, riverSurfaceHeight, toServerX, toServerY } from "./World";
import { forestStrengthAt } from "../../../shared/forests";
import { riverAt, RIVER_HALF_WIDTH_PX } from "../../../shared/river";
import { currentWind } from "./wind";

/** How far from the player the sheets live. */
const RADIUS = 62;

/** How many there are. Overlapping is the point, so this is a real number. */
const COUNT = 130;

const VERT = /* glsl */ `
  #ifdef USE_FOG
    uniform float fogNear;
    uniform float fogFar;
  #endif

  attribute float aSeed;
  attribute float aAlpha;
  varying vec2 vUv;
  varying float vSeed;
  varying float vAlpha;
  varying float vDepth;

  void main() {
    vUv = uv;
    vSeed = aSeed;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uNear;
  uniform float uFar;
  varying vec2 vUv;
  varying float vSeed;
  varying float vAlpha;
  varying float vDepth;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    return noise(p) * 0.55 + noise(p * 2.17 + 3.7) * 0.3 + noise(p * 4.4 + 11.1) * 0.15;
  }

  void main() {
    float a = vAlpha * uStrength;
    if (a <= 0.002) discard;

    // A round sheet with nothing at its rim. Squared falloff rather than a
    // linear one: a hard-edged patch of mist is a disc lying on the grass, and
    // the eye finds the circle instantly.
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    float mask = 1.0 - smoothstep(0.22, 1.0, r);
    mask *= mask;

    // The interior, drifting and re-forming. Two rates, unrelated, so the sheet
    // is never seen to repeat.
    vec2 p = vUv * 2.6 + vec2(vSeed * 7.3, vSeed * 3.1);
    float n = fbm(p + vec2(uTime * 0.019, uTime * -0.013));
    n = mix(n, fbm(p * 1.9 - vec2(uTime * 0.031, uTime * 0.024)), 0.45);
    // Pushed toward its extremes, so a bank has clear air torn through it
    // rather than being an even wash.
    n = smoothstep(0.20, 0.72, n);

    // BOTH ENDS. Beyond the neighbourhood there is nothing, so a sheet does not
    // end at a visible boundary; and within a few units of the eye there is
    // nothing either, so walking forward never puts a white card on the lens.
    float far = 1.0 - smoothstep(uFar * 0.62, uFar, vDepth);
    float near = smoothstep(uNear * 0.35, uNear, vDepth);

    float alpha = mask * n * a * far * near;
    if (alpha <= 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * How misty one place is, 0..1, before the hour is applied.
 *
 * Water first, then low ground, then trees — in that order and blended rather
 * than picked, because a hollow in a wood beside the river is the mistiest
 * place in this world and a rule that chose one of the three would say it was
 * only as misty as its strongest reason.
 */
function mistAt(x: number, z: number): number {
  const sx = toServerX(x);
  const sz = toServerY(z);

  // Over and beside the Coldwater. The strongest single reason, and the one
  // that makes the crossing worth walking to at dawn.
  const river = riverAt(sx, sz);
  const water = 1 - Math.min(1, river.distancePx / (RIVER_HALF_WIDTH_PX + 950));

  // In the hollows. Height is a rendering property in this project — nothing
  // reads a Y — which makes it exactly the right thing to hang mist on: it is
  // the one field that already describes where cold air would sit, and using it
  // costs nothing and desyncs nothing.
  const h = terrainHeight(x, z);
  const low = Math.min(1, Math.max(0, (1.1 - h) / 3.4));

  // And under the trees, where it never quite burns off.
  const wood = Math.min(1, forestStrengthAt(sx, sz) * 1.15);

  return Math.min(1, water * 0.95 + low * 0.45 + wood * 0.4);
}

/**
 * How misty the whole world is at this hour, 0..1.
 *
 * `clock` is the day fraction the sky runs on: 0 midnight, 0.5 noon. Mist is a
 * DAWN phenomenon above all — it forms overnight and it burns off in the first
 * couple of hours of sun — so this is deliberately not symmetric about noon. A
 * curve that treated dusk and dawn alike would be the same shape as the light
 * and would therefore say nothing the light was not already saying.
 */
export function mistStrengthForHour(clock: number): number {
  // Dawn is around 0.25 and dusk around 0.75.
  const dawn = Math.exp(-Math.pow((clock - 0.26) / 0.085, 2));
  const dusk = Math.exp(-Math.pow((clock - 0.80) / 0.10, 2)) * 0.55;
  // A low floor overnight — clear and cold rather than thick — so midnight is
  // not simply dawn with the lights off.
  const night = clock < 0.2 || clock > 0.86 ? 0.38 : 0;
  return Math.min(1, Math.max(night, dawn, dusk));
}

export class Mist {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly seeds: THREE.InstancedBufferAttribute;
  private readonly alphas: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly sheets: {
    x: number;
    z: number;
    spin: number;
    size: number;
    lift: number;
    live: boolean;
  }[] = [];
  private cx = 0;
  private cz = 0;

  constructor() {
    // Flat on the ground. A plane is born standing up, so it is laid down once
    // here rather than by every instance matrix.
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xc9d6e2) },
        uStrength: { value: 0 },
        uNear: { value: 9 },
        uFar: { value: RADIUS },
        fogNear: { value: 55 },
        fogFar: { value: 165 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      // Deliberately NOT additive. Mist is suspended water: it SCATTERS what is
      // behind it, so it covers. The flames in `flame.ts` are the opposite case
      // and are additive for the opposite reason.
      blending: THREE.NormalBlending,
      fog: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, this.material, COUNT);
    this.mesh.name = "mist";
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // Under the flames and over the ground. Sorting matters here in a way it
    // does not for the fire: two transparent sheets that write no depth are
    // drawn in whatever order they were submitted, and a torch seen THROUGH
    // mist is right while mist seen through a torch is not.
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.seeds = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1);
    this.alphas = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1);
    this.alphas.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aSeed", this.seeds);
    geo.setAttribute("aAlpha", this.alphas);

    for (let i = 0; i < COUNT; i++) {
      this.seeds.setX(i, Math.random() * 40);
      this.sheets.push({
        x: 0,
        z: 0,
        // A slow turn, so a bank of mist is never two copies of one texture.
        spin: Math.random() * Math.PI * 2,
        // Big and varied. A sheet smaller than the ground it lies on reads as a
        // puff of smoke; these are meant to be a layer.
        size: 14 + Math.random() * 26,
        lift: 0.25 + Math.random() * 0.9,
        live: false,
      });
    }
    this.seeds.needsUpdate = true;
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < COUNT; i++) this.mesh.setMatrixAt(i, this.matrix);
  }

  /**
   * Where a sheet's underside sits.
   *
   * The water, not the riverbed — the same distinction `flyingGround` draws in
   * `ambience.ts` and the same one M54.1a had to introduce `surfaceHeight` for.
   * Mist over the Coldwater is the whole reason this system exists, and mist
   * anchored to the bottom of the channel would be three units under it.
   */
  private groundAt(x: number, z: number): number {
    const q = riverAt(toServerX(x), toServerY(z));
    if (q.distancePx < RIVER_HALF_WIDTH_PX) return riverSurfaceHeight(q.along);
    return terrainHeight(x, z);
  }

  private place(i: number, fresh: boolean): void {
    const s = this.sheets[i];
    const a = Math.random() * Math.PI * 2;
    const r = fresh ? Math.sqrt(Math.random()) * RADIUS : RADIUS * (0.86 + Math.random() * 0.14);
    s.x = this.cx + Math.cos(a) * r;
    s.z = this.cz + Math.sin(a) * r;
    s.spin = Math.random() * Math.PI * 2;
    s.live = true;
  }

  /**
   * One frame.
   *
   * `clock` is the day fraction; `skyColor` is what the day/night grade has the
   * fog set to, so the mist cannot be a different weather from the sky.
   */
  update(
    dtSeconds: number,
    timeSeconds: number,
    clock: number,
    skyColor: THREE.Color,
    x: number,
    z: number,
  ): void {
    this.cx = x;
    this.cz = z;

    const hour = mistStrengthForHour(clock);
    this.material.uniforms.uTime.value = timeSeconds;
    this.material.uniforms.uStrength.value = hour;
    // Lifted toward white, because suspended water is brighter than the air
    // behind it — and never fully white, because then it stops belonging to the
    // sky it is standing under.
    this.material.uniforms.uColor.value.copy(skyColor).lerp(WHITE, 0.34);
    this.mesh.visible = hour > 0.01;
    if (!this.mesh.visible) return;

    const wind = currentWind();
    const wa = (wind.bearingDeg * Math.PI) / 180;
    // Slower than anything else outdoors. Mist has weight; it does not gust.
    const drift = wind.strength * 0.22 * dtSeconds;
    const dx = Math.cos(wa) * drift;
    const dz = Math.sin(wa) * drift;

    for (let i = 0; i < COUNT; i++) {
      const s = this.sheets[i];
      if (!s.live) this.place(i, true);
      s.x += dx;
      s.z += dz;
      if (Math.hypot(s.x - this.cx, s.z - this.cz) > RADIUS) this.place(i, false);

      const local = mistAt(s.x, s.z);
      // The sheet's own opacity is where it is lying. A sheet on a dry ridge is
      // still there and still drifting; it is simply not visible, which is what
      // lets a bank thin out as it climbs out of a hollow instead of ending.
      this.alphas.setX(i, local * 0.9);

      if (local <= 0.004) {
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        continue;
      }

      this.pos.set(s.x, this.groundAt(s.x, s.z) + s.lift, s.z);
      // A very slow turn on top of the drift, so two overlapping sheets are
      // never the same picture twice.
      this.euler.set(0, s.spin + timeSeconds * 0.008 * (i % 2 ? 1 : -1), 0);
      this.quat.setFromEuler(this.euler);
      this.scale.set(s.size, 1, s.size);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alphas.needsUpdate = true;
  }
}

const WHITE = new THREE.Color(0xffffff);
