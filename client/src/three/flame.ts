// Fire, for everything in the world that is actually burning.
//
// Every open flame in this project was the same object: a small emissive
// icosahedron in one flat orange, scaled up and down on two sines. From a
// distance that is a perfectly good pinpoint of light — it is what makes the
// road read at night as a chain of lights going north — and from ten units away
// it is an orange ball on a stick. The fourteen road torches, the two braziers
// in the square and the smithy's coals were all that ball.
//
// A flame is worth doing properly because it is the one thing in a night scene
// the eye goes to. It has structure the ball has none of: a white-hot core, a
// body that narrows and licks as it rises, a tip that breaks up and goes out,
// and a colour that runs from near-white through yellow and orange to a deep
// red before it stops. None of that is expressible as a scale on a sphere.
//
// THE DECISIONS.
//
// **One instanced quad for every fire in the world.** Sixteen flames is sixteen
// draw calls of eight triangles each if they are meshes, and one draw call if
// they are instances of one quad. The number matters less than the fact that
// the town and the road can now share a fire without either of them owning it.
//
// **Billboarded, and CYLINDRICALLY.** A flame must face the camera or it is a
// flat card seen edge-on, and it must stay upright or it tips over as the
// camera pitches. So the quad's horizontal axis is screen-right and its
// vertical axis is world up: it turns to follow you and never leans.
//
// **The shape is in the fragment shader, not the geometry.** The quad is a
// rectangle and the flame is a mask cut out of it — a width profile that
// pinches with height, horizontally displaced by scrolling noise that grows
// with height, so the base is steady and the tip whips. That is what fire does,
// and it is also why it cannot be done by animating a mesh: the silhouette has
// to change every frame.
//
// **Additive, and fog is applied by hand.** Fire adds light, it does not cover
// what is behind it. Three's fog chunk works on the fragment colour, which for
// an additive surface is the wrong end — a fogged flame should contribute LESS
// light, not blend toward grey. So the fog factor multiplies the output.
//
// **It never writes depth.** Two flames overlapping should be brighter, not one
// flame punching a hole in the other, and the glow around a flame should not
// clip against the post it is burning on.
//
// Deterministic per fire from its own seed, and driven by the SAME time the
// point lights are, so the flicker you see and the flicker on the ground under
// it cannot disagree — which is exactly the mistake the torches made before: the
// flame and its light each computed their own sine and only happened to line up.

import * as THREE from "three";

/** A flame's colour ramp, coolest first. Used by the shader and nothing else. */
const VERT = /* glsl */ `
  // A ShaderMaterial gets the USE_FOG define but NOT the fog chunk that
  // declares its uniforms — three only injects those into its own materials. So
  // they are declared here. Leaving them out compiles cleanly right up until the
  // scene has fog in it, which is every scene this project draws.
  #ifdef USE_FOG
    uniform float fogNear;
    uniform float fogFar;
  #endif

  attribute float aSeed;
  attribute float aLit;
  varying vec2 vUv;
  varying float vSeed;
  varying float vLit;
  varying float vFog;

  void main() {
    vUv = uv;
    vSeed = aSeed;
    vLit = aLit;

    // The instance's own translation is where the fire is; the lengths of its
    // first two columns are how WIDE and how TALL. Nothing else in the matrix is
    // used, because a billboard supplies its own orientation — which leaves the
    // scale columns free to mean two different things, and they need to: a torch
    // is a tongue of rag and pitch held upright and a brazier is a basket of
    // logs, so one is tall and narrow and the other is squat and wide. One
    // shader, two silhouettes, no uniform.
    vec4 origin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float sw = length(instanceMatrix[0].xyz);
    float sh = length(instanceMatrix[1].xyz);

    // Cylindrical billboard: screen-right across, WORLD up along. Taking up
    // from the view matrix rather than from (0,1,0) in view space is what stops
    // the flame leaning over as the camera pitches.
    vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 rightV = normalize(cross(upV, vec3(0.0, 0.0, 1.0)));

    vec4 mv = viewMatrix * origin;
    mv.xyz += rightV * (position.x * sw) + upV * (position.y * sh);

    // Fog by hand — see the header. Linear, matching the scene's own fog.
    #ifdef USE_FOG
      vFog = 1.0 - smoothstep(fogNear, fogFar, -mv.z);
    #else
      vFog = 1.0;
    #endif

    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vSeed;
  varying float vLit;
  varying float vFog;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

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

  /** Two octaves is enough at this size and half the cost of three. */
  float fbm(vec2 p) {
    return noise(p) * 0.65 + noise(p * 2.31 + 7.3) * 0.35;
  }

  void main() {
    float lit = vLit * uIntensity;
    if (lit <= 0.001) discard;

    // Height up the flame, and the horizontal offset from its centreline.
    float h = clamp(vUv.y, 0.0, 1.0);
    float x = vUv.x - 0.5;

    float t = uTime;
    float seed = vSeed;

    // THE LICK. Noise scrolling DOWNWARD in sample space is fire rising, and
    // the amplitude grows with height so the base stays planted on the wick
    // while the tip whips about. Squared rather than linear, because a real
    // flame is rigid for the first third and loose after it.
    float sway = (fbm(vec2(seed * 31.7 + x * 1.6, h * 2.6 - t * 1.45)) - 0.5);
    sway += (fbm(vec2(seed * 11.3, h * 6.1 - t * 3.1)) - 0.5) * 0.55;
    x -= sway * h * h * 0.62;

    // THE WIDTH. Fat and round at the base, pinched to nothing at the tip.
    float w = 0.34 * pow(max(0.0, 1.0 - h), 0.55) * (1.0 - 0.35 * h);
    // A tongue of flame is never symmetric; nudge the waist about.
    w *= 0.82 + 0.35 * fbm(vec2(seed * 5.9, h * 3.4 - t * 1.9));
    float d = abs(x) / max(w, 0.001);

    // THE TOP. Where the flame gives out, wandering on its own slow noise, so
    // it visibly gutters rather than holding one height and merely changing
    // brightness — which is what the old scaled sphere did.
    float top = 0.62 + 0.34 * fbm(vec2(seed * 17.1 + 3.0, t * 1.15));
    float alive = smoothstep(top, top - 0.42, h);

    // Heat: 1 along the spine, 0 at the edge, dying off at the tip and at the
    // very bottom where the flame meets the wick.
    float body = 1.0 - smoothstep(0.30, 1.0, d);
    float foot = smoothstep(0.0, 0.07, h);
    float heat = clamp(body * alive * foot, 0.0, 1.0);

    // THE RAMP, AND IT RUNS ON HEIGHT RATHER THAN ON HEAT.
    //
    // The obvious version ramps colour by temperature — red where it is cool,
    // white where it is hot — and it is wrong twice. A real flame is white at
    // the wick and red at the tip, which is a gradient up the flame and not a
    // gradient in from its edge; and on an ADDITIVE surface the cool end of a
    // colour ramp is not dim, it is a different HUE at full strength, so the
    // low-heat band across the bottom of the quad came out as a solid maroon
    // triangle sitting in the brazier. Height decides the hue and heat decides
    // only the brightness, which is what additive blending actually wants.
    vec3 col = mix(vec3(1.0, 0.95, 0.80), vec3(1.0, 0.74, 0.22), smoothstep(0.02, 0.26, h));
    col = mix(col, vec3(1.0, 0.42, 0.06), smoothstep(0.24, 0.58, h));
    col = mix(col, vec3(0.92, 0.20, 0.03), smoothstep(0.56, 0.95, h));
    // The skin of a flame is cooler than its spine, so redden it toward the
    // edge — a shift in hue, not a drop to a different colour entirely.
    col = mix(col * vec3(1.0, 0.62, 0.38), col, smoothstep(0.0, 0.65, heat));

    // A white-hot core, only right at the wick, and only along the spine.
    float core = pow(max(0.0, 1.0 - d), 4.0) * (1.0 - smoothstep(0.0, 0.34, h)) * alive;

    // A soft halo, so a flame lights the air around itself rather than ending
    // at its own outline. Centred low, where the fire is brightest.
    float gx = (vUv.x - 0.5) * 2.1;
    float gy = (vUv.y - 0.26) * 1.7;
    float glow = exp(-(gx * gx + gy * gy) * 3.8) * 0.34;
    glow *= 0.80 + 0.20 * sin(t * 6.1 + seed * 21.0);

    // 0.72 overall, because additive light on top of a surface a point light is
    // ALREADY brightening saturates long before the shader thinks it has: the
    // first version turned the iron basket it sits in into a flat white disc.
    vec3 outc = (col * heat * 0.86 + vec3(1.0, 0.90, 0.66) * core * 0.5
                 + vec3(1.0, 0.44, 0.12) * glow) * 0.72;
    float a = clamp(heat + glow + core, 0.0, 1.0);
    if (a <= 0.004) discard;
    gl_FragColor = vec4(outc * lit * vFog, a);
  }
`;

/**
 * Every fire in the world, in one draw call.
 *
 * A fixed capacity taken at construction, because an InstancedMesh cannot grow
 * and every caller here knows how many fires it is building — fourteen torches,
 * two braziers — at the moment it builds them.
 */
export class Flames {
  readonly mesh: THREE.InstancedMesh;
  private readonly seeds: THREE.InstancedBufferAttribute;
  private readonly lits: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly material: THREE.ShaderMaterial;
  private used = 0;

  constructor(capacity: number, name = "flames") {
    // A quad whose ORIGIN IS ITS BOTTOM EDGE, so a caller positions the wick
    // rather than the middle of the fire. Everything that burns is mounted at
    // its base and nothing is mounted at its centre.
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uIntensity: { value: 1 } },
      ]),
      transparent: true,
      // Additive: fire adds light. See the header for why the fog is by hand.
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      fog: true,
    });

    this.mesh = new THREE.InstancedMesh(geo, this.material, capacity);
    this.mesh.name = name;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // Flames sit on posts scattered over four kilometres of road, so the mesh's
    // bounds are the whole world and a frustum test would never cull anything.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;

    this.seeds = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.lits = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.lits.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aSeed", this.seeds);
    geo.setAttribute("aLit", this.lits);

    // Everything starts scaled to nothing, so an unused slot in the pool draws
    // no fragments even before the first update.
    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, this.matrix);
  }

  /**
   * Lights one fire.
   *
   * `height` and `width` are the flame's extent in world units — see the note
   * in the vertex shader for why they are separate. `seed` decides which flame
   * this is: pass something stable and world-derived, so a torch flickers the
   * same way for everybody standing at it.
   *
   * Returns the slot, which the caller keeps only if it wants to put the fire
   * out again.
   */
  add(x: number, y: number, z: number, height: number, seed: number, width = height * 0.68): number {
    const i = this.used++;
    this.matrix.makeScale(width, height, width);
    this.matrix.setPosition(x, y, z);
    this.mesh.setMatrixAt(i, this.matrix);
    this.seeds.setX(i, seed % 97);
    this.lits.setX(i, 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.seeds.needsUpdate = true;
    this.lits.needsUpdate = true;
    return i;
  }

  /** Turns one fire up or down. 0 puts it out. */
  setLit(i: number, lit: number): void {
    if (this.lits.getX(i) === lit) return;
    this.lits.setX(i, lit);
    this.lits.needsUpdate = true;
  }

  /**
   * One frame.
   *
   * Two uniform writes. The whole animation is in the shader, which is the
   * point: a hundred flames cost what one does.
   *
   * `timeSeconds` should be the same clock whatever drives the point lights
   * reads, so the flicker and the light it casts agree.
   */
  update(timeSeconds: number, intensity: number): void {
    this.material.uniforms.uTime.value = timeSeconds;
    this.material.uniforms.uIntensity.value = intensity;
    this.mesh.visible = intensity > 0.004;
  }
}
