// A contact shadow under everything in this world that stands on the ground.
//
// M55.3 planted the feet: the rig is lifted so no upright pose puts a sole
// through the floor, and the floor it stands on is the mesh you can SEE rather
// than the smooth field that mesh was sampled from. Both were real faults and
// both are fixed, and the character still did not look like it was standing on
// anything. Geometry and perception are different problems.
//
// WHY THE SUN'S OWN SHADOW IS NOT THE ANSWER, EVEN THOUGH THERE IS ONE.
//
// Every actor casts into a 2048px shadow map from the one directional light,
// and that light travels a continuous arc all day. Which means the cast shadow
// is exactly where the contact is at noon and nowhere near it at every other
// hour: at dawn and dusk it is a long streak lying ten units away, and the FEET
// — the place the eye actually checks — have nothing under them at all. It is a
// shadow of the figure, and what is missing is a shadow of the CONTACT.
//
// Those are two different things in the real world too. A cast shadow is the
// light this body is blocking; contact darkening is the ambient light that
// cannot reach the ground because the body is sitting on it. The second is
// ambient occlusion, it does not care where the sun is, and it is the one that
// says "these two surfaces are touching".
//
// THE DECISIONS.
//
// **It multiplies, it does not paint.** `presence.ts` is additive because it is
// light falling on the ground; this is the opposite, so it is a multiply. A
// dark quad blended normally is a grey decal lying on the grass and it looks
// like one at every opacity — the grass has to survive underneath, darker,
// which is what a multiply does and what nothing else does.
//
// **Its strength is CONSTANT, and the multiply does the rest.** The first
// version scaled it by the hemisphere fill's own intensity, on the reasoning
// that occlusion removes ambient light and there is less ambient light at
// night. That is true and it is already paid for: a multiply takes a fraction
// of whatever is on the ground, so darker ground loses less in absolute terms
// without anybody arranging it. Scaling the strength as well charged for the
// same effect twice — measured at midnight it came out at a peak channel delta
// of zero, which is not "weaker", it is "absent". Occlusion is a property of
// the geometry, so it is a constant, and the light it removes is whatever
// light was there.
//
// It is therefore the third thing running on its own schedule under a figure,
// and the three do not overlap: the sun's shadow map is where the light is, the
// pool of light in `presence.ts` is strongest at midnight, and this is
// proportional to whatever the ground already had.
//
// **It is under EVERYTHING, unlike the pool of light.** `presence` is
// deliberately players-only, because it answers "which of these figures am I"
// and a monster already has a nameplate, a target ring and a difficulty colour.
// This answers "is this thing touching the ground", and a wolf's feet are as
// unanchored as yours. Townspeople included: they stand in one place for the
// life of the world, and a permanent dark patch under somebody permanently
// standing there is not a scorch mark, it is correct.
//
// **It is sized from the BODY RADIUS the game already collides with.** A slime
// and a dragon do not want the same patch, and the number that says how much
// room a creature takes up already exists and is already the footprint of the
// model — so a fourth opinion about how big a monster is would be a fourth
// thing to keep true. Same argument `bodies.mjs` makes about hitboxes.

import * as THREE from "three";
import { layOnGround, surfaceHeight } from "./World";

/** How many patches may be drawn at once. A camp plus a node crowd, generously. */
const CAPACITY = 72;

/**
 * How far the patch spreads past the body's own radius.
 *
 * Wider than the footprint, because contact darkening is soft and does not stop
 * at the outline of the thing casting it — and narrower than `presence`'s pool,
 * which is a marker and wants to be found. A patch as wide as the pool would
 * read as a stain rather than as shade.
 */
const SPREAD = 2.1;

/**
 * How far above the ground the patch is seated.
 *
 * The quad is TILTED to the local slope (see `layOnGround`), which takes the
 * median amount the ground rises through it from 86mm to 3mm — so this only
 * has to cover what is left, which is curvature. Measured at 19mm across the
 * ninety-fifth percentile of the world; 35mm covers it, and at this camera
 * 35mm is one pixel of detachment.
 */
const LIFT = 0.035;

const VERT = /* glsl */ `
  attribute float aStrength;
  varying vec2 vUv;
  varying float vStrength;
  varying float vDepth;

  void main() {
    vUv = uv;
    vStrength = aStrength;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec2 vUv;
  varying float vStrength;
  varying float vDepth;

  void main() {
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;

    // Two falloffs added, the same shape the pool of light uses and for the mirrored
    // reason: a broad one so the shade has an outside that fades rather than an
    // edge, and a tight core right under the body where the two surfaces
    // actually meet. One falloff alone is either a hard disc or a haze.
    //
    // THE PROFILE IS FLATTER THAN THE FIRST ATTEMPT, and the reason is that the
    // strongest part of this mark is the part nobody can see. A pair of feet
    // fills the middle third of the patch, so a curve that puts 72% of its
    // darkening at r=0 and 8% at r=0.5 spends almost everything under the body
    // and leaves a faint ring — measured at a peak channel delta of 12 where
    // the eye actually looks. What has to carry the effect is the annulus
    // BETWEEN the soles and the edge.
    float broad = pow(1.0 - r, 1.6);
    float core = pow(max(0.0, 1.0 - r * 1.35), 2.0);
    float a = (broad * 0.45 + core * 0.55) * vStrength;

    // Fog fades it out rather than leaving dark dots at the fog line. Applied
    // by hand because this is a ShaderMaterial and three's fog chunk works on
    // the fragment COLOUR, which for a multiply is the wrong end — a fogged
    // patch should darken LESS, not blend toward grey.
    a *= 1.0 - clamp((vDepth - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
    if (a <= 0.003) discard;

    // Multiply: 1.0 leaves the ground exactly as it was, and the shade is
    // subtracted from it in proportion. Never to black — occlusion removes the
    // ambient and nothing removes all of it, and a patch that reaches zero
    // reads as a hole in the terrain.
    gl_FragColor = vec4(vec3(1.0 - a * 0.62), 1.0);
  }
`;

export interface Contact {
  x: number;
  y: number;
  z: number;
  /** The creature's own body radius, in world units. */
  radius: number;
}

export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly strengths: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();

  constructor(fogNear: number, fogFar: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uFogNear: { value: fogNear },
        uFogFar: { value: fogFar },
      },
      transparent: true,
      blending: THREE.MultiplyBlending,
      // Three refuses to set up a multiply without this and says so, once per
      // frame, forever. It costs nothing here: the shader writes alpha 1, so
      // the premultiplied path multiplies the destination alpha by one.
      premultipliedAlpha: true,
      depthWrite: false,
      // Depth-TESTED. The patch lies on the ground and a wall in front of it
      // hides it, exactly as `presence` argues: this is a rendering fact about
      // a surface, not an X-ray.
      depthTest: true,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.mesh = new THREE.InstancedMesh(geo, this.material, CAPACITY);
    this.mesh.name = "contact-shadows";
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // ABOVE EVERY SURFACE THE GROUND IS MADE OF AND BELOW EVERYTHING STANDING
    // ON IT. Emberhold's plaza is a transparent decal at render order 2 that
    // writes no depth, so a shade at 1 was drawn and then painted over by the
    // cobbles: the patch was measured at a clean 1% of the box on grass and at
    // exactly nothing on paving, from the same code, in the same frame.
    //
    // 4 puts it over the road, the paving and the flagstone island (1, 2 and 3)
    // and under the pool of light at 5 — which is the right way round, because
    // the pool is light falling on the shaded ground rather than a surface for
    // the shade to darken.
    this.mesh.renderOrder = 4;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.strengths = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1);
    this.strengths.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aStrength", this.strengths);

    this.matrix.makeScale(0, 0, 0);
    for (let i = 0; i < CAPACITY; i++) this.mesh.setMatrixAt(i, this.matrix);
  }

  /** One frame. */
  update(contacts: Contact[]): void {
    const n = Math.min(contacts.length, CAPACITY);
    for (let i = 0; i < CAPACITY; i++) {
      if (i >= n) {
        this.matrix.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.matrix);
        this.strengths.setX(i, 0);
        continue;
      }
      const c = contacts[i];
      this.strengths.setX(i, 1);
      const w = Math.max(0.25, c.radius) * SPREAD * 2;
      // Seated on the ground AS DRAWN and tilted to it, rather than on the
      // actor's own y with a constant offset. Those are two different heights
      // the moment anything is standing on a bridge or a levelled apron, and
      // this project has had that argument three times.
      layOnGround(this.matrix, c.x, surfaceHeight(c.x, c.z) + LIFT, c.z, w);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.strengths.needsUpdate = true;
  }
}
