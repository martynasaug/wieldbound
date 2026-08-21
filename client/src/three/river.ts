// The Coldwater, drawn: a moving water surface and the bridge the road crosses
// it on.
//
// MOST OF THE WORK IS NOT HERE. The thing that makes a river read as a river is
// the valley cut into the height field for it — see `carveRiver` in World — and
// the shingle the terrain shader lays along its banks. What is left for this
// file is a translucent ribbon and something to walk over, and the ribbon is
// deliberately modest: a flat plane of blue with a couple of scrolling ripples
// on it, sitting in a channel that is genuinely lower than the ground either
// side, is convincing. The same plane laid on flat grass is not, and no amount
// of shader would have rescued it.
//
// THE SURFACE FOLLOWS THE COURSE, NOT THE LAND. Every vertex takes its height
// from `riverSurfaceHeight`, which is the low-passed, forced-monotone profile
// the ground was cut to — so the water runs downhill from east to west, drops
// about three and a half units end to end, and cannot be caught flowing up a
// slope. That the ground and the water get their height from the same function
// is the whole reason the two meet cleanly at the bank.

import * as THREE from "three";
import {
  BRIDGE_HALF_SPAN_PX,
  BRIDGE_HALF_WIDTH_PX,
  RIVER_HALF_WIDTH_PX,
  RIVER_NAME,
  bridgeAt,
  riverAt,
  riverPath,
} from "../../../shared/river";
import { ROAD_HALF_WIDTH_PX } from "../../../shared/road";
import { Builder } from "./town";
import { PX_PER_UNIT, riverSurfaceHeight, terrainHeight, toWorldX, toWorldZ } from "./World";

/** How high the deck sits above the water it spans. */
const BRIDGE_CLEARANCE = 1.9;

/**
 * How far past the waterline the drawn surface reaches.
 *
 * A hair wider than the channel the ground was cut to, so the edge of the plane
 * is under the bank's own slope rather than ending on it. A water plane that
 * stops exactly at the waterline shows a rim of bed geometry at every camera
 * angle, which is the same class of artefact as a hard alpha edge on the ground
 * and just as visible.
 */
const WATER_OVERLAP_UNITS = 0.9;

export class River {
  readonly group = new THREE.Group();
  private material: THREE.MeshStandardMaterial | null = null;
  private readonly flow = { value: 0 };

  build(): THREE.Group {
    this.buildWater();
    this.buildBridge();
    return this.group;
  }

  /**
   * The water.
   *
   * One strip along the course, seven vertices across, with the UV running in
   * METRES along the river rather than 0..1 over the whole thing — the same
   * correction the road's ribbon needed, and for the same reason: a normalised
   * UV over four kilometres puts one ripple across the entire river.
   */
  private buildWater(): void {
    const path = riverPath();
    const halfW = RIVER_HALF_WIDTH_PX / PX_PER_UNIT + WATER_OVERLAP_UNITS;

    const positions: number[] = [];
    const uvs: number[] = [];
    const across = 6;

    let along = 0;
    const rows: { x: number; z: number; nx: number; nz: number; u: number; y: number }[] = [];
    for (let i = 0; i < path.length; i++) {
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      if (i > 0) along += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      rows.push({
        x: toWorldX(path[i].x),
        z: toWorldZ(path[i].y),
        nx: -dy / len,
        nz: dx / len,
        u: (along / PX_PER_UNIT) * 0.14,
        // The whole surface is one height per ROW, not per vertex: water is
        // level across its own width by definition, and interpolating it across
        // the channel would tilt the river sideways wherever the course bends.
        y: riverSurfaceHeight(i / (path.length - 1)),
      });
    }

    const push = (r: (typeof rows)[number], j: number) => {
      const t = (j / across) * 2 - 1;
      positions.push(r.x + r.nx * t * halfW, r.y, r.z + r.nz * t * halfW);
      uvs.push(r.u, (t + 1) / 2);
    };

    // Same winding as the road ribbon, and for the same reason it had to be
    // discovered rather than assumed: built directly in XZ with no rotation,
    // the order that faces up in the town's XY-authored strips faces down here.
    for (let i = 0; i < rows.length - 1; i++) {
      for (let j = 0; j < across; j++) {
        push(rows[i], j);
        push(rows[i + 1], j + 1);
        push(rows[i + 1], j);
        push(rows[i], j);
        push(rows[i], j + 1);
        push(rows[i + 1], j + 1);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: 0x2c5a63,
      roughness: 0.16,
      metalness: 0.0,
      // A FLOOR UNDER THE LIGHTING, and it is not a cheat.
      //
      // A smooth, dark, non-metallic surface with no reflection to catch is
      // very nearly black the moment the sun is low, and at dusk the river
      // vanished into the bank completely — which is wrong in the one way that
      // matters, because the river is the thing you must not walk into. Real
      // water is legible at night precisely because it reflects the sky, and
      // this renderer has no reflection probe to give it one. A constant dim
      // blue standing in for the sky it cannot see costs nothing and keeps the
      // water readable at every hour.
      emissive: 0x0d222a,
      emissiveIntensity: 1,
      transparent: true,
      opacity: 0.86,
      // The bed underneath is drawn first and shows through, which is most of
      // what makes the shallows read as shallow. Writing depth would let the
      // water occlude anything drawn after it at the same depth — including its
      // own far bank at a grazing angle.
      depthWrite: false,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.flow = this.flow;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        varying vec2 vFlowUv;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vFlowUv = uv;`,
      );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec2 vFlowUv;
          uniform float flow;`,
        )
        // TWO RIPPLE FIELDS AT DIFFERENT SPEEDS, perturbing the normal only.
        //
        // Not a normal map, because there is no water texture in this project
        // and adding one would be a download to express two sine waves. Not a
        // displacement either: the surface is seen at a grazing angle, so what
        // the eye reads is the highlight sliding across it and not the height
        // of the wave. Perturbing the normal is the cheap half and the half
        // that shows.
        //
        // The two fields travel at different speeds ALONG the river and drift
        // slightly across it, so the pattern never settles into a repeat and
        // the whole surface reads as moving in one direction.
        .replace(
          "#include <normal_fragment_maps>",
          `
          // EVERY PHASE IS BENT BY A SLOWER TERM, and that is the whole of the
          // correction. The first version was three straight sines, and three
          // straight sines across a river is a diffraction grating: it read as
          // corduroy laid on the water, regular enough that the eye found the
          // period in about a second. Water never has a straight wavefront,
          // because the wave in front of it is in the way. Modulating each
          // phase by a much slower field bends the crests into each other and
          // the pattern stops having a period worth finding — the same argument
          // the ground's three noise fields are built on, one dimension down.
          float bend = sin(vFlowUv.x * 2.3 + vFlowUv.y * 1.9) * 1.8;
          float w1 = sin(vFlowUv.x * 27.0 - flow * 2.6 + vFlowUv.y * 3.4 + bend);
          float w2 = sin(vFlowUv.x * 12.5 - flow * 1.35 - vFlowUv.y * 9.0 + bend * 1.7);
          float w3 = sin(vFlowUv.y * 22.0 + flow * 0.7 + vFlowUv.x * 3.1 - bend);
          vec3 rippleN = normalize(vec3((w1 * 0.15 + w2 * 0.12), 1.0, (w3 * 0.08 + w2 * 0.06)));
          normal = normalize(normal * 0.6 + rippleN * 0.4);
          `,
        )
        // Depth, and a bright line where it meets the bank. The channel is
        // dished, so "how far across" is a stand-in for "how deep" — and the
        // shallow edge of a river being paler than its middle is the single
        // most recognisable thing about looking at one.
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float shore = 1.0 - abs(vFlowUv.y * 2.0 - 1.0);
          float shallow = 1.0 - smoothstep(0.0, 0.26, shore);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.46, 0.44), shallow * 0.7);
          diffuseColor.a *= mix(1.0, 0.5, shallow);
          // A slow drift along the course, so four kilometres of river is not
          // four kilometres of one colour. Deep where it is deep.
          float reach = sin(vFlowUv.x * 0.9) * 0.5 + 0.5;
          diffuseColor.rgb *= mix(0.82, 1.12, reach);
          `,
        );
    };
    material.customProgramCacheKey = () => "wieldbound-water-v2";

    const mesh = new THREE.Mesh(geo, material);
    mesh.name = "coldwater";
    mesh.receiveShadow = true;
    // Rendered after the ground it sits in, so the transparency sorts against a
    // bed that is already there.
    mesh.renderOrder = 1;
    this.group.add(mesh);
    this.material = material;
  }

  /**
   * The bridge.
   *
   * A timber trestle, because the road's own furniture is timber and a stone
   * arch out here would be the only piece of masonry for four kilometres —
   * built by whoever cut the fourteen torch posts, not by a mason sent up from
   * Emberhold.
   *
   * Everything is measured from the water rather than from the ground: the
   * deck sits a fixed clearance above the surface, the piers run from the deck
   * DOWN to whatever the bed happens to be, and the approaches climb from the
   * bank to the deck. Doing it the other way round — deck at ground level plus
   * a constant — puts one end of a bridge in the water on any bank that is not
   * level with the other, which is every bank.
   */
  private buildBridge(): void {
    const at = bridgeAt();
    const b = new Builder();
    const g = new THREE.Group();

    const cx = toWorldX(at.x);
    const cz = toWorldZ(at.y);
    const a = (at.angleDeg * Math.PI) / 180;
    // Along the road, and across it. Built in the bridge's own frame and mapped
    // out, which is the only sane way to place forty pieces on a diagonal.
    const ax = Math.cos(a);
    const az = Math.sin(a);
    const sx = -az;
    const sz = ax;
    // Three's yaw is measured the other way round from a bearing in the XZ
    // plane, which is why this is negated rather than passed straight through.
    const yaw = -a;

    const span = BRIDGE_HALF_SPAN_PX / PX_PER_UNIT;
    const halfW = BRIDGE_HALF_WIDTH_PX / PX_PER_UNIT;
    const deckY = riverSurfaceHeight(riverAt(at.x, at.y).along) + BRIDGE_CLEARANCE;
    const at2 = (along: number, across: number) => ({
      x: cx + ax * along + sx * across,
      z: cz + az * along + sz * across,
    });

    // The deck: planks across, so the grain runs the way you walk over it.
    const plankCount = 42;
    for (let i = 0; i < plankCount; i++) {
      const along = -span + ((i + 0.5) / plankCount) * span * 2;
      const p = at2(along, 0);
      b.box("plank", 0.34, 0.14, halfW * 2, p.x, deckY, p.z, yaw);
    }
    // Two stringers under them, carrying the deck between the piers.
    for (const side of [-1, 1]) {
      const p = at2(0, side * (halfW - 0.4));
      b.box("timber", span * 2, 0.4, 0.5, p.x, deckY - 0.4, p.z, yaw);
    }

    // Piers. Four pairs, and the two inner ones stand in the water — which is
    // the detail that makes it a bridge over a river rather than a plank over a
    // ditch.
    for (const along of [-span * 0.82, -span * 0.3, span * 0.3, span * 0.82]) {
      for (const side of [-1, 1]) {
        const p = at2(along, side * (halfW - 0.5));
        const foot = terrainHeight(p.x, p.z);
        const h = Math.max(0.6, deckY - 0.4 - foot);
        b.cyl("timber", 0.22, h, p.x, foot, p.z, 7);
      }
      // A cross-brace between each pair, at knee height under the deck.
      const mid = at2(along, 0);
      b.box("timber", 0.16, 0.16, halfW * 1.9, mid.x, deckY - 1.0, mid.z, yaw);
    }

    // Parapets: a post every so often with two rails run between them. Waist
    // high, so the deck reads as somewhere you are held on rather than as a
    // raft.
    const posts = 11;
    for (let i = 0; i < posts; i++) {
      const along = -span + (i / (posts - 1)) * span * 2;
      for (const side of [-1, 1]) {
        const p = at2(along, side * (halfW - 0.18));
        b.cyl("timber", 0.11, 1.05, p.x, deckY + 0.07, p.z, 6);
      }
    }
    for (const side of [-1, 1]) {
      for (const railY of [0.5, 0.95]) {
        const p = at2(0, side * (halfW - 0.18));
        b.box("plank", span * 2, 0.11, 0.09, p.x, deckY + railY, p.z, yaw);
      }
    }

    // The approaches. Earth ramped up to the deck at either end, so you walk
    // onto the bridge instead of stepping up onto it — the road ribbon does the
    // same climb in `roadDeckHeight`, and these are the shoulders it sits on.
    const rampLen = 5.0;
    const rampSteps = 9;
    for (const dir of [-1, 1]) {
      for (let i = 0; i < rampSteps; i++) {
        const t = (i + 0.5) / rampSteps;
        const along = dir * (span + t * rampLen);
        const p = at2(along, 0);
        const ground = terrainHeight(p.x, p.z);
        const top = deckY + (ground - deckY) * (t * t * (3 - 2 * t));
        const h = Math.max(0.12, top - ground + 0.5);
        b.box(
          "dirt",
          (rampLen / rampSteps) * 1.35,
          h,
          (ROAD_HALF_WIDTH_PX / PX_PER_UNIT) * 2.05,
          p.x,
          top - h,
          p.z,
          yaw,
        );
      }
    }

    b.finish(g);
    this.group.add(g);
  }

  /** Where the bridge deck is, in world units. Read by the road ribbon. */
  static deckHeight(): number {
    const at = bridgeAt();
    return riverSurfaceHeight(riverAt(at.x, at.y).along) + BRIDGE_CLEARANCE;
  }

  /**
   * Moves the water.
   *
   * One uniform, driven off the same clock everything else animated in this
   * game uses. It is not tied to the hour — a river runs at night — but it IS
   * the only thing here that needs a frame at all, which is why this class has
   * no other per-frame work.
   */
  update(timeSeconds: number): void {
    if (this.material) this.flow.value = timeSeconds;
  }

  get name(): string {
    return RIVER_NAME;
  }
}
