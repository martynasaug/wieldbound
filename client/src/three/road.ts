// The North Road, drawn: a dirt ribbon, a signpost, and fourteen torches that
// are lit by the hour whether anybody is out there or not.
//
// The ribbon is the same trick the town's road arms use — vertex alpha down
// both verges so the track fades into the grass instead of stopping at a razor
// edge. That is not a preference: a hard alpha edge on the ground is the single
// most visible artefact this camera produces, and it cost Phase 51 three rounds
// of diagnosis to find out the seam across the square was one.
//
// THE LIGHTS ARE THE INTERESTING PART. Three evaluates every point light
// against every fragment of every lit surface, so a torch every three hundred
// pixels down four kilometres of road would be an unaffordable number of them —
// and it would be paying for lights nobody can see, since the fog closes at 110
// units and the road is 108 units long. So a torch is two separable things:
//
//   * a FLAME, which every torch always has. An unlit emissive ball, one draw
//     call in the merged mesh, visible from as far as the fog allows. This is
//     what makes the road read at night as a chain of lights going north, which
//     is the whole point of lighting it.
//   * a LIGHT, which only the nearest few have. A small pool of PointLights is
//     re-assigned to the closest torches every frame, so the cost is fixed no
//     matter how long the road gets.
//
// The seam between the two is invisible because a torch far enough away to lose
// its light is far enough away that nothing near it is being lit in detail
// anyway — you see the flame, and the ground under it was already dark.

import * as THREE from "three";
import {
  NORTH_TOWN_NAME,
  NORTH_TOWN_SITE,
  ROAD_HALF_WIDTH_PX,
  roadPath,
  roadTorches,
} from "../../../shared/road";
import { Builder, roadTexture } from "./town";
import { PX_PER_UNIT, toWorldX, toWorldZ } from "./World";

/** How many torches get a real light at once. */
const LIT_TORCHES = 5;

/** Height of a torch post, in world units. Taller than a town lamp: it has to
 *  be seen over long grass from a long way down the road. */
const TORCH_HEIGHT = 2.6;

/** The flame's own colour. Warmer and redder than the town's glass lanterns —
 *  a pitch torch is not a lamp. */
const FLAME_COLOR = 0xff9a3c;

interface Torch {
  /** World position of the flame. */
  x: number;
  y: number;
  z: number;
  /** Stable per-torch offset, so fourteen flames are not one flame drawn
   *  fourteen times. Seeded from distance along the road. */
  phase: number;
  flame: THREE.Mesh;
}

const flameMaterial = new THREE.MeshBasicMaterial({ color: FLAME_COLOR, fog: true });

export class NorthRoad {
  readonly group = new THREE.Group();
  private torches: Torch[] = [];
  /** A fixed pool, re-pointed at whichever torches are nearest. */
  private readonly lights: THREE.PointLight[] = [];
  /** Scratch, so the per-frame sort does not allocate. */
  private readonly ranked: { i: number; d: number }[] = [];

  build(): THREE.Group {
    this.buildSurface();
    this.buildTorches();
    this.buildSignpost();
    return this.group;
  }

  /**
   * The dirt track itself.
   *
   * One triangle strip following the smoothed centreline, with the verge alpha
   * tapered across it. The UV runs in METRES along the road rather than 0..1
   * over the whole thing, so the rut texture keeps a constant density whether
   * the road is a hundred units long or a thousand — the same reason the back
   * lane writes its own world-scale UVs instead of letting the material repeat.
   */
  private buildSurface(): void {
    const path = roadPath();
    const halfW = ROAD_HALF_WIDTH_PX / PX_PER_UNIT;

    const positions: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const across = 6;
    // Full down the middle, gone at both verges. Matches `roadStrip`'s 0.24,
    // which is the value the town settled on after a wider taper came out as a
    // dark smear on the grass rather than as something carts use.
    const alphaAcross = (t: number) => Math.min(1, Math.max(0, (1 - Math.abs(t)) / 0.24));

    // Ends taper too, so the road does not begin and end with a straight cut.
    // The near end hands over inside the town's own road fade; the far end
    // simply runs out, because nothing is built there yet.
    const alphaAlong = (i: number) => {
      const fadeIn = Math.min(1, i / 6);
      const fadeOut = Math.min(1, (path.length - 1 - i) / 10);
      return Math.min(fadeIn, fadeOut);
    };

    let along = 0;
    const rows: { x: number; z: number; nx: number; nz: number; u: number; a: number }[] = [];
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
        // Perpendicular, in world units.
        nx: -dy / len,
        nz: dx / len,
        u: (along / PX_PER_UNIT) * 0.34,
        a: alphaAlong(i),
      });
    }

    const push = (r: (typeof rows)[number], j: number) => {
      const t = (j / across) * 2 - 1;
      positions.push(r.x + r.nx * t * halfW, 0, r.z + r.nz * t * halfW);
      uvs.push(r.u, (t + 1) / 2);
      colors.push(1, 1, 1, r.a * alphaAcross(t));
    };

    // WOUND THE OTHER WAY ROUND from the town's strips, and it has to be.
    //
    // `roadStrip` and `beltPath` emit this exact vertex order and come out
    // facing up, because they are authored in XY and then rotated -90 degrees
    // about X — which flips the handedness on the way. This one is built
    // directly in XZ with no rotation, so the same order produces the mirror
    // image: the first version had all 5,184 normals pointing at the ground and
    // the road was invisible from every angle a player can occupy, while the
    // torches beside it stood there looking correct.
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
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    geo.computeVertexNormals();

    const tex = roadTexture();
    // The UVs above are already in road-metres, so the material must not repeat
    // on top of them — the same correction the back lane needed, where the
    // road's own 26x repeat multiplied out to three hundred tiles and the lane
    // aliased into flat noise.
    tex.repeat.set(1, 1);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: tex,
        color: 0x6f6047,
        transparent: true,
        vertexColors: true,
        roughness: 1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    mesh.name = "north-road";
    mesh.position.y = 0.03;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildTorches(): void {
    const b = new Builder();
    const posts = new THREE.Group();

    for (const t of roadTorches()) {
      const x = toWorldX(t.x);
      const z = toWorldZ(t.y);
      // A post, a cross-brace and a burnt head. Timber rather than iron: this
      // is a road somebody maintains with what is to hand, not a town's
      // ironmongery, and the difference is most of why it reads as a frontier.
      b.cyl("timber", 0.09, TORCH_HEIGHT, x, 0, z, 6);
      b.box("timber", 0.42, 0.07, 0.07, x, TORCH_HEIGHT * 0.62, z, t.alongPx * 0.01);
      b.add("iron", new THREE.ConeGeometry(0.2, 0.34, 6), x, TORCH_HEIGHT + 0.1, z);
      // A ring of stones at the foot, which is what stops a torch post from
      // looking like a stick pushed into the ground.
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + t.alongPx;
        b.add(
          "rockDark",
          new THREE.IcosahedronGeometry(0.16, 0),
          x + Math.cos(a) * 0.28,
          0.06,
          z + Math.sin(a) * 0.28,
          a,
        );
      }

      const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), flameMaterial);
      flame.position.set(x, TORCH_HEIGHT + 0.3, z);
      posts.add(flame);

      this.torches.push({
        x,
        y: TORCH_HEIGHT + 0.3,
        z,
        // Distance along the road, so no two neighbours flicker together and
        // every client agrees about which is which.
        phase: (t.alongPx * 0.017) % (Math.PI * 2),
        flame,
      });
    }

    b.finish(posts);
    this.group.add(posts);

    for (let i = 0; i < LIT_TORCHES; i++) {
      // Range is generous and the decay is physical, so a torch lights its own
      // patch of road and nothing beyond it.
      const light = new THREE.PointLight(FLAME_COLOR, 0, 16, 2);
      light.visible = false;
      this.group.add(light);
      this.lights.push(light);
    }
  }

  /**
   * The signpost at the near end, and a cairn at the far one.
   *
   * The signpost exists because a road with no destination written on it is a
   * dirt track, and a player who walks out of the postern has no way to know
   * that this one goes anywhere. The cairn at the far end is the opposite
   * problem: the site is empty and will be for some time, and arriving at
   * nothing at all reads as the road being unfinished rather than the town
   * being unbuilt.
   */
  private buildSignpost(): void {
    const b = new Builder();
    const g = new THREE.Group();

    const path = roadPath();
    const near = path[3];
    const sx = toWorldX(near.x) + 2.4;
    const sz = toWorldZ(near.y);
    b.cyl("timber", 0.1, 2.5, sx, 0, sz, 6);
    b.box("plank", 1.7, 0.34, 0.07, sx + 0.6, 2.0, sz, -0.35);
    // The arm points the way the road goes, so it is information rather than
    // furniture.
    b.add("iron", new THREE.ConeGeometry(0.14, 0.3, 4), sx + 1.5, 2.17, sz, -0.35, 0, Math.PI / 2);

    // The far end: a cairn, and the biggest stone in it faces back down the road.
    const cx = toWorldX(NORTH_TOWN_SITE.x);
    const cz = toWorldZ(NORTH_TOWN_SITE.y);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.9 - i * 0.06;
      b.add(
        "rock",
        new THREE.IcosahedronGeometry(0.42 - i * 0.02, 0),
        cx + Math.cos(a) * r,
        0.1 + i * 0.16,
        cz + Math.sin(a) * r,
        a,
        0.2,
      );
    }
    b.box("plank", 1.3, 0.3, 0.08, cx, 1.9, cz + 0.5);
    b.cyl("timber", 0.09, 2.0, cx, 0, cz + 0.5, 6);

    b.finish(g);
    this.group.add(g);
  }

  /**
   * Lights the road for the hour, and hands the light pool to whoever is nearest.
   *
   * `night` is the same 0..1 the town's lanterns run on, so the road and the
   * square come up together — a road that lit on its own schedule would read as
   * two different times of day in one frame.
   */
  update(night: number, playerX: number, playerZ: number, timeSeconds: number): void {
    const lit = night;

    for (const t of this.torches) {
      const flicker =
        0.82 +
        Math.sin(timeSeconds * 7.3 + t.phase) * 0.11 +
        Math.sin(timeSeconds * 2.9 + t.phase * 2) * 0.07;
      t.flame.visible = lit > 0.04;
      if (t.flame.visible) t.flame.scale.setScalar(0.8 + flicker * 0.4);
    }

    if (lit <= 0.04) {
      for (const l of this.lights) l.visible = false;
      return;
    }

    // Nearest few, by squared distance — no square roots and no allocation.
    this.ranked.length = 0;
    for (let i = 0; i < this.torches.length; i++) {
      const t = this.torches[i];
      const dx = t.x - playerX;
      const dz = t.z - playerZ;
      this.ranked.push({ i, d: dx * dx + dz * dz });
    }
    this.ranked.sort((a, c) => a.d - c.d);

    for (let k = 0; k < this.lights.length; k++) {
      const pick = this.ranked[k];
      const light = this.lights[k];
      if (!pick) {
        light.visible = false;
        continue;
      }
      const t = this.torches[pick.i];
      const flicker =
        0.82 +
        Math.sin(timeSeconds * 7.3 + t.phase) * 0.11 +
        Math.sin(timeSeconds * 2.9 + t.phase * 2) * 0.07;
      light.position.set(t.x, t.y, t.z);
      light.intensity = lit * 15 * flicker;
      light.visible = true;
    }
  }

  /** What the signpost says, for the nameplate the HUD draws over it. */
  get destination(): string {
    return NORTH_TOWN_NAME;
  }
}
