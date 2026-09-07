// The sky, the sun and the hour.
//
// The clock itself lives in `shared/protocol-types.ts`, derived from wall-clock
// time so that every client agrees without a message. What lives here is purely
// how that number is turned into light: which is a client decision, changes
// nothing the server resolves, and is the half that wants to be tweaked by eye.
//
// Everything is driven by a small table of keyframes rather than by formulas
// per channel. Colour grading is a thing you judge by looking at it, so the
// representation that matters is the one where "make dusk a bit more purple" is
// editing one hex value — not tracing which cosine feeds the blue channel.

import * as THREE from "three";
import { seededRandom } from "../../../shared/rng";
import { timeOfDay } from "../../../shared/protocol-types";

/** One moment in the cycle. `at` is the same 0..1 clock `timeOfDay` returns. */
interface Phase {
  at: number;
  name: string;
  /** Sky dome and fog. Fog matches the sky or the horizon shows a hard seam. */
  sky: number;
  /** Directional light — the sun by day, the moon after dark. */
  light: number;
  lightIntensity: number;
  /** Hemisphere fill: what the sky and the ground bounce back. */
  skyFill: number;
  groundFill: number;
  fillIntensity: number;
  /** 0 by day, 1 in full dark. Fades the stars in. */
  starAlpha: number;
  /**
   * Overall exposure.
   *
   * THE NIGHT VALUES USED TO BE BELOW 1 AND THAT WAS BACKWARDS. The comment
   * here said they existed "so night reads dark without crushing everything to
   * black", and they were doing exactly the crushing they claimed to prevent:
   * `tour.mjs` photographed the road north at 03:22 and the scene was 95% pure
   * black with a median pixel luminance of 0.7 out of 255.
   *
   * Four causes were ruled out by measurement before this one was found, each
   * with the scene cropped away from the HUD so the numbers were about the
   * game:
   *
   *   shadows off (with the material recompile three needs, or the toggle does
   *                nothing at all — the first attempt forgot it and produced a
   *                confident wrong answer)        87.8% black, no change
   *   decor hidden                                95.2% black, no change
   *   fog off                                     95.1% black, no change
   *   hemisphere fill x2.5                        69.8% black, barely moved
   *   hemisphere groundColor lightened 3 steps    no change at all
   *
   * Only exposure moved it, and the reason the fill did not is the same reason:
   * ACES tone mapping has a very flat toe, so scaling a MINOR contributor by
   * 2.5x is still nothing after the curve, while exposure scales the whole
   * image — sun included — before it. The sun is what carries the scene even at
   * 0.32, and nothing was scaling the sun.
   *
   * Measured at the same spot and hour: exposure 0.94 -> 74% of the frame
   * near-black; 1.5 -> 60%; 1.9 -> 55%, at which point the canopy, the paving
   * and the ground read while the scene is still unmistakably night.
   *
   * AND THE NIGHT VALUES ARE STILL BELOW 1, BECAUSE RAISING THEM WAS TRIED AND
   * REVERTED. Exposure is global. The town is lit by its own torches against
   * pale paving and already reads correctly at 0.95; the forest is shadowed
   * canopy and needs about 1.9. Shipping 1.70 made Emberhold at 02:52 look like
   * broad afternoon — no stars, no lamp pools, flat daylight on the flagstones.
   * Backing off to 1.22 still read as late afternoon in town while barely
   * helping under the trees. There is no single number that serves both, which
   * is the actual finding: the problem is CONTRAST between a lit place and an
   * unlit one, and a whole-image multiplier cannot raise a floor without also
   * raising the ceiling.
   *
   * What would: something local rather than global. A faint light carried by
   * the player is the standard answer to exactly this and is nearly free here,
   * since `lightPool.ts` already pools PointLights and only one is lit at noon
   * — it would rescue the forest and do nothing in town, where the surroundings
   * are already brighter than it. That is a design decision about how the game
   * should feel after dark, not a bug fix, so it is written down rather than
   * done.
   *
   * These are the four dark keyframes. They are a table of numbers and they are
   * meant to be retuned by eye — `tools/soak/nightlight.mjs` re-runs the whole
   * elimination, and `tools/soak/tour.mjs <name> <dir> 0.12` photographs the
   * world at any hour.
   */
  exposure: number;
}

// Ordered by `at`, and read as a loop — the last entry interpolates back into
// the first, so midnight is continuous rather than a seam at t=0.
const PHASES: Phase[] = [
  {
    at: 0.0, name: "midnight",
    sky: 0x0a0f1e, light: 0x8fa8d8, lightIntensity: 0.28,
    skyFill: 0x2a3454, groundFill: 0x0d1118, fillIntensity: 0.35,
    starAlpha: 1, exposure: 0.92,
  },
  {
    at: 0.18, name: "first light",
    sky: 0x2b3358, light: 0x9fb0d8, lightIntensity: 0.34,
    skyFill: 0x44507a, groundFill: 0x1a1c22, fillIntensity: 0.5,
    starAlpha: 0.55, exposure: 0.95,
  },
  {
    // A steering stop, not a look of its own. Interpolating navy straight into
    // sunrise orange runs the sky through a muddy brown for a full minute —
    // measured at #9d6c5f — because the midpoint of two opposed hues is grey.
    // Passing through a violet keeps the blend on the colourful side of the
    // wheel, which is also what a real dawn does.
    at: 0.225, name: "dawn",
    sky: 0x7b5a7e, light: 0xc79ac0, lightIntensity: 0.6,
    skyFill: 0x8c6f92, groundFill: 0x2c2430, fillIntensity: 0.58,
    starAlpha: 0.3, exposure: 0.97,
  },
  {
    at: 0.25, name: "sunrise",
    sky: 0xe89a68, light: 0xff9a52, lightIntensity: 1.15,
    skyFill: 0xd8a488, groundFill: 0x4a3a28, fillIntensity: 0.7,
    starAlpha: 0.12, exposure: 1.0,
  },
  {
    at: 0.32, name: "morning",
    sky: 0x9dc0e4, light: 0xffe2b4, lightIntensity: 1.95,
    skyFill: 0xbcd7ff, groundFill: 0x4a5233, fillIntensity: 0.78,
    starAlpha: 0, exposure: 1.05,
  },
  {
    at: 0.5, name: "noon",
    sky: 0xa8c8e8, light: 0xfff4de, lightIntensity: 2.35,
    skyFill: 0xc4dcff, groundFill: 0x515a38, fillIntensity: 0.85,
    starAlpha: 0, exposure: 1.08,
  },
  {
    at: 0.68, name: "afternoon",
    sky: 0x9dc0e4, light: 0xffe0ae, lightIntensity: 1.95,
    skyFill: 0xbcd7ff, groundFill: 0x4a5233, fillIntensity: 0.78,
    starAlpha: 0, exposure: 1.05,
  },
  {
    at: 0.75, name: "sunset",
    sky: 0xe2703c, light: 0xff7c3a, lightIntensity: 1.2,
    skyFill: 0xd4886a, groundFill: 0x46311f, fillIntensity: 0.68,
    starAlpha: 0.1, exposure: 1.0,
  },
  {
    at: 0.81, name: "dusk",
    sky: 0x3c3560, light: 0xa89ad0, lightIntensity: 0.5,
    skyFill: 0x4c4478, groundFill: 0x1c1a24, fillIntensity: 0.5,
    starAlpha: 0.7, exposure: 0.96,
  },
];

function lerpPhase(a: Phase, b: Phase, k: number, out: Phase): Phase {
  const mix = (x: number, y: number) => x + (y - x) * k;
  out.sky = new THREE.Color(a.sky).lerp(new THREE.Color(b.sky), k).getHex();
  out.light = new THREE.Color(a.light).lerp(new THREE.Color(b.light), k).getHex();
  out.skyFill = new THREE.Color(a.skyFill).lerp(new THREE.Color(b.skyFill), k).getHex();
  out.groundFill = new THREE.Color(a.groundFill).lerp(new THREE.Color(b.groundFill), k).getHex();
  out.lightIntensity = mix(a.lightIntensity, b.lightIntensity);
  out.fillIntensity = mix(a.fillIntensity, b.fillIntensity);
  out.starAlpha = mix(a.starAlpha, b.starAlpha);
  out.exposure = mix(a.exposure, b.exposure);
  out.name = k < 0.5 ? a.name : b.name;
  out.at = mix(a.at, b.at);
  return out;
}

/** The graded state at a given point in the cycle. */
export function phaseAt(t: number, out?: Phase): Phase {
  const scratch = out ?? ({ ...PHASES[0] } as Phase);
  const clock = ((t % 1) + 1) % 1;

  let i = 0;
  for (let k = 0; k < PHASES.length; k++) if (PHASES[k].at <= clock) i = k;
  const a = PHASES[i];
  const b = PHASES[(i + 1) % PHASES.length];
  // The wrap segment runs past 1.0, so its span is measured the long way round.
  const span = (b.at > a.at ? b.at : b.at + 1) - a.at;
  const k = span <= 0 ? 0 : (clock - a.at) / span;
  return lerpPhase(a, b, Math.min(1, Math.max(0, k)), scratch);
}

/**
 * How dark it is, 0 by day and 1 in the small hours.
 *
 * Derived from the graded sun intensity rather than from the clock, so it can
 * never disagree with what the scene actually looks like: change a keyframe to
 * make dusk gloomier and everything that lights itself after dark comes on
 * earlier, with no second table to remember.
 *
 * `starAlpha` was the obvious candidate and is the wrong one — it is authored
 * for a star dome and stays at 0.1 through a sunset that is already too dim to
 * read a shopfront by, which would leave the town's lanterns off for the whole
 * of the prettiest part of the day.
 */
export function nightAmount(t: number): number {
  const light = phaseAt(t).lightIntensity;
  return Math.max(0, Math.min(1, (1.35 - light) / 1.1));
}

/**
 * A dome of points, only visible after dark.
 *
 * Deliberately a fixed dome parented to nothing: it is drawn far outside the
 * fog and never moves with the player, which is what makes it read as sky
 * rather than as objects hanging over the field.
 */
function buildStars(count = 900, radius = 260): THREE.Points {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  // Seeded, so the constellations are the same every session — a sky that
  // reshuffles on reload reads as noise, not as a sky.
  const rand = seededRandom(20260819);

  for (let i = 0; i < count; i++) {
    // Upper hemisphere only; nothing below the horizon is ever seen.
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand() * 0.92 + 0.05);
    const r = radius * (0.85 + rand() * 0.15);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i] = 0.7 + rand() * 2.1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: 0xdfe8ff,
    size: 1.4,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // Fog would swallow them: they sit far past the far plane of the fog range,
    // and they are meant to be the one thing distance does not dim.
    fog: false,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}

/**
 * Owns everything the hour changes. One `update` a frame; it is cheap, and the
 * alternative — recomputing only on a phase boundary — makes the transitions
 * step rather than glide.
 */
export class DayNight {
  readonly stars: THREE.Points;
  /** Unit vector from the player toward the light. Read by the camera rig. */
  readonly lightDirection = new THREE.Vector3(0.4, 0.75, 0.3).normalize();

  private readonly scratch = { ...PHASES[0] } as Phase;
  private readonly fogColor = new THREE.Color();
  /** Set to a fixed clock value to freeze the cycle; null follows real time. */
  private frozen: number | null = null;

  constructor() {
    this.stars = buildStars();
  }

  /** Freezes the cycle at a point, for screenshots and tests. */
  freeze(t: number | null): void {
    this.frozen = t;
  }

  get clock(): number {
    return this.frozen ?? timeOfDay();
  }

  update(
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    sun: THREE.DirectionalLight,
    fill: THREE.HemisphereLight,
  ): Phase {
    const t = this.clock;
    const phase = phaseAt(t, this.scratch);

    // Sun angle. Elevation is a sine over the day; the azimuth swings with it so
    // shadows sweep across the field instead of pivoting on the spot.
    const angle = (t - 0.25) * Math.PI * 2;
    const elevation = Math.sin(angle);
    const azimuth = Math.cos(angle);

    // One directional light for the whole cycle, following one continuous arc.
    //
    // The astronomically correct version — sun by day, moon on the OPPOSITE
    // side by night — was the first attempt and it is visibly wrong: the moon
    // rises exactly as the sun sets, so the light teleports across the sky at
    // both horizon crossings and every shadow in the world flips end for end in
    // a single frame. Measuring the direction either side of sunrise showed it
    // going from x=-0.90 to x=+0.91.
    //
    // So the light simply keeps travelling, and its elevation is floored rather
    // than allowed to go negative — at night it sits low instead of underneath,
    // which is the one thing that would look actually broken. Nobody tracks
    // which way moonlight falls; everybody notices shadows snapping round.
    const y = Math.max(0.16, elevation);
    this.lightDirection.set(azimuth * 0.88, y, 0.34).normalize();

    sun.color.setHex(phase.light);
    sun.intensity = phase.lightIntensity;

    fill.color.setHex(phase.skyFill);
    fill.groundColor.setHex(phase.groundFill);
    fill.intensity = phase.fillIntensity;

    this.fogColor.setHex(phase.sky);
    if (scene.background instanceof THREE.Color) scene.background.copy(this.fogColor);
    else scene.background = this.fogColor.clone();
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(this.fogColor);

    renderer.toneMappingExposure = phase.exposure;

    const mat = this.stars.material as THREE.PointsMaterial;
    mat.opacity = phase.starAlpha;
    this.stars.visible = phase.starAlpha > 0.01;

    return phase;
  }
}
