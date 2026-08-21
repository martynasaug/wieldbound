// The small living things: butterflies, fireflies, dragonflies and birds.
//
// M54.1 made everything ROOTED move — grass, plants, trees, a whole treeline
// bending in one wind. This is the other half of a world that is alive: things
// that move because they want to rather than because something is pushing them.
// It is the cheapest scenery in the project and very close to the highest
// return, because motion with intent behind it is what the eye reads as life,
// and there was none of it anywhere outside combat.
//
// FOUR DECISIONS, and the first one is the whole architecture.
//
// **They live around the PLAYER, not in the world.** Everything else scattered
// in this project — the ground cover, the woods, the treeline — is placed once
// across four hundred by three hundred units and left there, because it is
// ground and ground does not move. Doing that here would be badly wrong twice
// over: the fog closes at 165 units, so ninety-nine per cent of them would be
// paid for and never seen, and a butterfly is not a landmark — nobody will ever
// notice that the one over the east gate is always over the east gate. So there
// is a fixed pool that lives in a moving neighbourhood: anything that falls
// outside the radius is respawned on the far side, which means the count on
// screen is the count that exists.
//
// **What is out is decided by WHERE AND WHEN.** Butterflies over open meadow by
// day, dragonflies over the water, fireflies in the woods and along the river
// after dark, birds high over anything. That is deliberately the same
// vocabulary `placeNameAt` speaks: a wood should not merely look different from
// a meadow, it should be a different place to stand in at dusk.
//
// **They drift downwind.** Every wanderer's anchor is pushed by the same wind
// field the grass bends in, so a gust crossing a field moves the butterflies in
// it. That is one line and it is most of what stops them reading as sprites on
// invisible rails.
//
// **They are NOT derived from the clock, and that is a departure worth stating.**
// The hour is shared, the wind is shared, the woods and the road and the river
// are shared — because all of those are PLACES or RULES, and two players who
// disagree about them disagree about the world. A butterfly is neither. It does
// not persist, nothing can be told to go to one, and no screenshot of two
// clients should ever be compared over it. Making it deterministic would mean
// carrying a seeded sequence through a system whose whole point is that it is
// respawning constantly, in exchange for an agreement nobody can observe.
//
// Nothing here is interactive, nothing carries a nameplate, and nothing is
// larger than a fist — the same rule that keeps the ground cover from looking
// like a resource node, applied to things that fly.

import * as THREE from "three";
import { terrainHeight, riverSurfaceHeight, toServerX, toServerY } from "./World";
import { forestStrengthAt } from "../../../shared/forests";
import { riverAt, RIVER_HALF_WIDTH_PX } from "../../../shared/river";
import { currentWind } from "./wind";

/**
 * How far from the player anything lives.
 *
 * Set by DENSITY, not by the fog — which is what the first value got wrong. 74
 * was picked to sit inside the fog's far end so a respawn would arrive already
 * faded, and the arithmetic nobody did is that a 74-unit disc is seventeen
 * thousand square units. The camera sits about fifteen units behind the player
 * looking down at 41 degrees; the ground it can actually resolve is a wedge of
 * perhaps sixteen hundred, and half the disc is behind it.
 *
 * The number that settled this is not a screenshot. It is the count of pool
 * instances that PROJECT INSIDE THE VIEWPORT: at radius 74 with 76 butterflies
 * it was three, and at radius 42 with 118 it was four. Both look like an empty
 * field, which is exactly what the first two rounds of screenshots said and
 * neither said why.
 *
 * 26 is roughly what the camera can see, so the pool is spent where it is
 * looked at. Beyond it the air is empty — which is not a compromise: you cannot
 * see a butterfly forty metres away either, and `edgeFade` makes the boundary a
 * thinning rather than a wall.
 */
const RADIUS = 26;

/**
 * How a mote arrives and leaves: a fade on DISTANCE from the player rather than
 * on age.
 *
 * Age would need a birthday on every mote and would still pop things out of
 * existence at the rim, because a thing that has been alive for ten seconds is
 * at full size the frame it crosses the boundary. Distance fades both ends with
 * no state at all, and it is the same number that decides whether the mote is
 * still in the neighbourhood, so the two can never disagree about where the
 * edge is.
 */
function edgeFade(d: number): number {
  const t = Math.min(1, Math.max(0, (RADIUS - d) / (RADIUS * 0.22)));
  return t * t * (3 - 2 * t);
}

/**
 * A pool is declared as a DENSITY, not as a headcount.
 *
 * This is the whole reason the field was full of butterflies, and the failure is
 * worth writing out because every individual number in it was defended in
 * writing at the time.
 *
 * M54.2 did two things in one milestone. It cut the butterfly pool from 150 to
 * 62 because forty on screen read as a hatch — and it cut `RADIUS` from 74 to
 * 26, because a 74-unit disc is seventeen thousand square units and most of it
 * is not looked at. Each change is right on its own. Together they raised the
 * DENSITY by a factor of six, because the disc they were spread over got eight
 * times smaller while the count only halved. The milestone's own note says "26
 * is roughly what the camera can see, so the pool is spent where it is looked
 * at", which is true and is exactly what makes it worse: at that radius the
 * whole neighbourhood projects inside the viewport, so the pool size IS the
 * on-screen count and there is nowhere for a surplus to hide.
 *
 * And there are TWO butterfly kinds. Every sentence in that milestone reasons
 * about "62", and the cabbage-white's 34 was never once added in. Measured
 * afterwards: ninety on screen at once in an open meadow at noon, against forty
 * that had already been reported as too many.
 *
 * A density cannot make that mistake. The count is derived from `RADIUS`, so
 * moving the neighbourhood moves the pool with it and the air stays as busy as
 * it was — which is the call `PLAN` already recorded for the treeline and the
 * ground cover, arriving here one phase late.
 */
function poolFor(perThousandSquareUnits: number): number {
  const area = Math.PI * RADIUS * RADIUS;
  return Math.max(1, Math.round((perThousandSquareUnits * area) / 1000));
}

/** How high above the ground a low-flying kind stays, unless it says otherwise. */
const LOW_BAND: [number, number] = [0.35, 2.4];

/**
 * And how high the birds are.
 *
 * Twelve, not thirty, and the reason is the camera rather than ornithology. The
 * pitch is fixed at about 41 degrees looking DOWN — a decided thing, argued in
 * PLAN — so the top of the frame is a little above the horizon and anything
 * twenty-two units over your head is behind you and out of shot. Measured: nine
 * birds, and never once did one of them project inside the viewport.
 */
const HIGH_BAND: [number, number] = [11, 18];

/**
 * What a flying thing measures its height from.
 *
 * NOT `terrainHeight`, and that is the whole reason this exists: over the
 * Coldwater the terrain is the RIVERBED, three units under the water, so a
 * dragonfly anchored to it would be skimming the bottom of the channel. This is
 * the same mistake `surfaceHeight` was introduced for in M54.1a — the crossing
 * being three opinions about where the ground is — arriving one more time, in
 * the one system whose whole job is to be over the water. It is not
 * `surfaceHeight` itself, because that answers with the bridge DECK and a
 * dragonfly is perfectly entitled to fly under a bridge.
 */
function flyingGround(x: number, z: number): number {
  const q = riverAt(toServerX(x), toServerY(z));
  if (q.distancePx < RIVER_HALF_WIDTH_PX) return riverSurfaceHeight(q.along);
  return terrainHeight(x, z);
}

interface Mote {
  /** Where it is drifting around. Pushed by the wind; the mote orbits it. */
  ax: number;
  az: number;
  ay: number;
  /** Phase offsets, so no two of them are the same animation. */
  p1: number;
  p2: number;
  /** How far and how fast it wanders around its anchor. */
  spread: number;
  rate: number;
  /** 0 while asleep — a firefly between blinks, a butterfly in the wrong hour. */
  scale: number;
  size: number;
  /** Set false when the kind's conditions do not hold, so it draws nothing. */
  live: boolean;
}

interface Kind {
  name: string;
  mesh: THREE.InstancedMesh;
  motes: Mote[];
  /** How high above the ground this kind flies, low end and high end. */
  band: [number, number];
  /** How many of the pool may be awake right now, 0..1, from the hour. */
  presence: (night: number) => number;
  /** True where one may be spawned. Server pixels. */
  suits: (sx: number, sy: number) => boolean;
  /** Per-frame animation, writing the instance matrix. */
  animate: (m: Mote, t: number, out: THREE.Matrix4, scratch: Scratch) => void;
}

interface Scratch {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  euler: THREE.Euler;
  scale: THREE.Vector3;
}

/**
 * A butterfly: two wings and nothing else.
 *
 * Built rather than downloaded, like every other small thing in this project.
 * The kit has no insects, and a butterfly at this camera is about a dozen
 * pixels — a modelled one would be a dozen pixels that cost a file.
 *
 * The wings are two planes that meet at a shallow angle, and the flap is done
 * by SQUASHING the whole thing on one axis rather than by rotating each wing:
 * at twelve pixels the two are indistinguishable, and one of them needs no
 * per-instance bone.
 */
function butterflyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Four triangles: two wings, each a pair, with a STEEP dihedral.
  //
  // The first version's wings rose 0.12 over a 0.5 span — about thirteen
  // degrees, which is flat. Flat is fatal here for a reason that only shows up
  // once you look at one: the flap is a squash along the wing axis, and
  // squashing a horizontal wing seen from above changes its width and nothing
  // else, so forty of them read as cream-coloured chevrons sliding about. At
  // forty degrees the same squash folds the V shut and opens it again, which is
  // a wingbeat, and it costs exactly the same.
  const v: number[] = [];
  const tri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ) => v.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  for (const s of [-1, 1]) {
    // Forewing: the big one, swept forward.
    tri(0, 0, 0, s * 0.46, 0.4, 0.3, s * 0.4, 0.34, -0.26);
    // Hindwing: smaller, behind it, and lower — so the pair is never one
    // silhouette even at the top of the beat.
    tri(0, 0, 0, s * 0.4, 0.34, -0.26, s * 0.22, 0.15, -0.44);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** A firefly, a pollen mote, a distant bird: one small billboard-ish diamond. */
function speckGeometry(): THREE.BufferGeometry {
  return new THREE.OctahedronGeometry(0.5, 0);
}

/** A bird, seen from below and a long way off: a shallow V. */
function birdGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const v = [
    0, 0, 0, -1, 0.34, -0.5, -0.94, 0.14, -0.16,
    0, 0, 0, 0.94, 0.14, -0.16, 1, 0.34, -0.5,
  ];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export class Ambience {
  readonly group = new THREE.Group();
  private kinds: Kind[] = [];
  private readonly scratch: Scratch = {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    euler: new THREE.Euler(),
    scale: new THREE.Vector3(),
  };
  private readonly matrix = new THREE.Matrix4();
  private readonly fadeScale = new THREE.Vector3();
  /** Where the neighbourhood was centred last frame, so respawns can chase it. */
  private cx = 0;
  private cz = 0;

  build(): THREE.Group {
    const wing = butterflyGeometry();
    const speck = speckGeometry();
    const bird = birdGeometry();

    // UNLIT, all of them, and it is not a shortcut. Every one of these is a few
    // pixels across, so a lit surface would spend a normal and a light loop to
    // decide a shade nobody can resolve — and worse, a butterfly lit correctly
    // at dusk is a butterfly you cannot see, which is the opposite of the
    // point. `fog: true` keeps them from punching through the distance.
    const flat = (color: number, opacity = 1) =>
      new THREE.MeshBasicMaterial({
        color,
        fog: true,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      });

    // A firefly is the one thing here that is a LIGHT rather than an object, so
    // it is the one thing here that adds rather than covers. Additive against a
    // dark wood is a glow; the same green on an opaque material is a painted
    // dot, which is what it looked like on the first pass — the counter said
    // ninety-two were lit and the picture said the wood was empty.
    const emissive = (color: number) =>
      new THREE.MeshBasicMaterial({
        color,
        fog: true,
        side: THREE.DoubleSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

    this.addKind({
      name: "butterfly",
      geometry: wing,
      material: flat(0xd8b856),
      // Reported from play twice. The first round cut the pool from 150 and cut
      // the neighbourhood by more, which raised the density sixfold and put
      // NINETY on screen — see `poolFor`. The two flutterers between them are
      // budgeted at about twenty in frame now, which is the band the two
      // failures bracket: three read as an empty field and forty read as a
      // hatch, and both of those are measured rather than remembered.
      density: 6.6,
      band: LOW_BAND,
      // Twice life size, and that is the same call M54.1 made when it raised
      // the grass: a real butterfly is four pixels at this camera, which is not
      // a small butterfly, it is dirt on the screen. It went too far the other
      // way first — at 0.58 they were sixteen pixels of flat cream, and an
      // untextured polygon that big does not read as an insect, it reads as
      // paper. Reported from play in exactly those words.
      size: [0.2, 0.3],
      // Gone by dusk. Nothing about a butterfly says night, and leaving them out
      // after dark is what makes the fireflies arriving read as a change.
      presence: (night) => Math.max(0, 1 - night * 2.2),
      // Open ground only: a meadow's worth of flowers, not a wood's floor.
      suits: (sx, sy) => forestStrengthAt(sx, sy) < 0.25,
      animate: butterflyAnimate,
    });

    this.addKind({
      name: "cabbage-white",
      geometry: wing,
      // Bone rather than white. A pure cream wing is the brightest thing in a
      // dawn or a dusk frame — brighter than the sky it is under — and the eye
      // goes to the brightest thing whether or not it is the subject.
      material: flat(0xcdc5b2),
      // Roughly half the yellow, as it always was. The ratio was never the
      // problem; that this pool existed at all and was left out of the
      // arithmetic was.
      density: 3.8,
      band: LOW_BAND,
      size: [0.18, 0.27],
      presence: (night) => Math.max(0, 1 - night * 2.2),
      suits: (sx, sy) => forestStrengthAt(sx, sy) < 0.25,
      animate: butterflyAnimate,
    });

    this.addKind({
      name: "dragonfly",
      geometry: wing,
      // Dark, not bright. A cyan this saturated at fifteen pixels is a piece of
      // blue card; a dragonfly seen over water is a dark dart that catches the
      // light for an instant, and the catching is done by the flap rather than
      // by the colour.
      material: flat(0x2f7d86),
      // Down with the butterflies, and for the same reason measured the same
      // way: seventeen of them in frame over the Coldwater is a swarm, and a
      // dragonfly hunting a river is a thing you notice one of.
      density: 6.0,
      // Skimming. The one kind with a band of its own: a dragonfly hunting a
      // river holds a hand's breadth off the surface, and putting it in the
      // same column as the butterflies loses the only thing that says water.
      band: [0.25, 0.9],
      size: [0.19, 0.28],
      // Over the water and out at first light, which is when a river actually
      // has them.
      presence: (night) => Math.max(0, 1 - night * 1.7),
      suits: (sx, sy) => riverAt(sx, sy).distancePx < RIVER_HALF_WIDTH_PX + 260,
      animate: dragonflyAnimate,
    });

    this.addKind({
      name: "firefly",
      geometry: speck,
      material: emissive(0xd6ff8a),
      // The largest pool in the system and it still shows the fewest at once,
      // because the blink below spends most of the cycle dark. The count is the
      // size of the swarm; the blink is how much of it you can see — measured at
      // thirty-four lit at midnight out of a hundred and ninety, which is the
      // one pool in this file whose reasoning survived being checked.
      density: 89.5,
      band: [0.3, 1.9],
      size: [0.26, 0.42],
      // The mirror of the butterflies: nothing until the light goes, then all of
      // them. The two never overlap, so dusk is a handover rather than a crowd.
      presence: (night) => Math.max(0, night * 1.5 - 0.35),
      // Woods and water. Both are places you would actually find them, and both
      // are places this game now has names for.
      suits: (sx, sy) =>
        forestStrengthAt(sx, sy) > 0.3 ||
        riverAt(sx, sy).distancePx < RIVER_HALF_WIDTH_PX + 320,
      animate: fireflyAnimate,
    });

    this.addKind({
      name: "bird",
      geometry: bird,
      material: flat(0x2e2a26),
      density: 2.8,
      band: HIGH_BAND,
      // A BIRD WAS THREE TIMES THE HEIGHT OF THE PLAYER, and the old note here
      // is why: "bigger than the rest and still small on screen, because a bird
      // up here is a dozen units further away than anything else in this file".
      // That is arithmetic nobody did. The camera sits forty-six units out, so
      // a dozen units of extra distance costs about a quarter of the size — not
      // an order of magnitude. Measured: seventy-three pixels across on average
      // and a hundred and six at worst, against a whole character twenty-eight
      // pixels tall. What that draws is a black chevron the size of a hang
      // glider lying in the grass, which reads as a rendering fault rather than
      // as a bird, and it was in every frame this phase photographed.
      //
      // A bird overhead should be SMALLER than the person you are playing. This
      // puts it at about eighteen pixels: bigger than a butterfly beside you and
      // unmistakably further away, which is the whole relationship the two are
      // meant to have.
      size: [0.26, 0.44],
      presence: (night) => Math.max(0, 1 - night * 1.9),
      suits: () => true,
      animate: birdAnimate,
    });

    return this.group;
  }

  private addKind(spec: {
    name: string;
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    /** Per thousand square units of the neighbourhood. See `poolFor`. */
    density: number;
    band: [number, number];
    size: [number, number];
    presence: (night: number) => number;
    suits: (sx: number, sy: number) => boolean;
    animate: Kind["animate"];
  }): void {
    const count = poolFor(spec.density);
    const mesh = new THREE.InstancedMesh(spec.geometry, spec.material, count);
    mesh.name = `ambience:${spec.name}`;
    // Never casts and never receives: a shadow from something this small is a
    // few pixels of noise, and every caster is paid for twice.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // The pool moves with the player, so a bounding sphere computed once is
    // wrong by the second frame. Skipping the frustum test entirely is the
    // right answer for five draw calls.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);

    const motes: Mote[] = [];
    for (let i = 0; i < count; i++) {
      motes.push({
        ax: 0, az: 0, ay: 0,
        p1: Math.random() * Math.PI * 2,
        p2: Math.random() * Math.PI * 2,
        spread: 0.6 + Math.random() * 1.9,
        rate: 0.6 + Math.random() * 0.9,
        scale: 0,
        size: spec.size[0] + Math.random() * (spec.size[1] - spec.size[0]),
        live: false,
      });
    }
    this.kinds.push({
      name: spec.name,
      mesh,
      motes,
      band: spec.band,
      presence: spec.presence,
      suits: spec.suits,
      animate: spec.animate,
    });
  }

  /**
   * Finds somewhere for one mote to be.
   *
   * Rejection sampling against the kind's own `suits`, bounded — the same shape
   * and the same reason as the ground cover's placement: a firefly looking for
   * a wood in the middle of a plain must give up rather than spin, because this
   * runs every frame and a player standing in open country at midnight would
   * otherwise pay for a hundred and thirty unbounded searches a frame.
   *
   * Spawning in an ANNULUS rather than a disc, so a respawned mote arrives at
   * the edge of the neighbourhood and drifts in. Respawning in the middle would
   * pop things into existence in front of the player.
   */
  private place(kind: Kind, m: Mote, fresh: boolean): boolean {
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2;
      // A fresh pool fills the whole disc so the first frame is not a ring.
      const r = fresh
        ? Math.sqrt(Math.random()) * RADIUS
        : RADIUS * (0.82 + Math.random() * 0.18);
      const x = this.cx + Math.cos(a) * r;
      const z = this.cz + Math.sin(a) * r;
      if (!kind.suits(toServerX(x), toServerY(z))) continue;
      m.ax = x;
      m.az = z;
      m.ay =
        flyingGround(x, z) + kind.band[0] + Math.random() * (kind.band[1] - kind.band[0]);
      m.p1 = Math.random() * Math.PI * 2;
      m.p2 = Math.random() * Math.PI * 2;
      m.live = true;
      return true;
    }
    m.live = false;
    return false;
  }

  /**
   * One frame.
   *
   * Three hundred and twenty-nine matrices at worst, which is nothing — the
   * cost of this system is five draw calls and a handful of trigonometry, and
   * that is the entire argument for a pooled neighbourhood over a placed one.
   * It is also why the counts could be moved by a factor of six in both
   * directions across one afternoon without anybody having to think about it.
   */
  update(dtSeconds: number, timeSeconds: number, night: number, x: number, z: number): void {
    this.cx = x;
    this.cz = z;
    const wind = currentWind();
    const wa = (wind.bearingDeg * Math.PI) / 180;
    // Drift, in units a second. Deliberately far slower than the wind reads on
    // the grass: a butterfly is not a leaf, and one that tracked the gust
    // exactly would look like it was being blown away rather than flying in it.
    const drift = wind.strength * 0.55 * dtSeconds;
    const dx = Math.cos(wa) * drift;
    const dz = Math.sin(wa) * drift;

    for (const kind of this.kinds) {
      const share = kind.presence(night);
      const awake = Math.round(kind.motes.length * Math.min(1, share));
      for (let i = 0; i < kind.motes.length; i++) {
        const m = kind.motes[i];

        if (i >= awake) {
          // Asleep. Scaled to nothing rather than removed, because an
          // InstancedMesh has a fixed count and a zero matrix is free.
          m.live = false;
          this.matrix.makeScale(0, 0, 0);
          kind.mesh.setMatrixAt(i, this.matrix);
          continue;
        }

        if (!m.live) {
          // A first placement fills the disc; every later one arrives at the rim.
          if (!this.place(kind, m, m.scale === 0)) {
            this.matrix.makeScale(0, 0, 0);
            kind.mesh.setMatrixAt(i, this.matrix);
            continue;
          }
          m.scale = 1;
        }

        m.ax += dx;
        m.az += dz;
        // Out of the neighbourhood, or over ground that no longer suits it —
        // walking into a wood should empty the butterflies out of the air
        // around you rather than carry a meadow's worth of them in.
        const d = Math.hypot(m.ax - this.cx, m.az - this.cz);
        if (d > RADIUS || !kind.suits(toServerX(m.ax), toServerY(m.az))) {
          m.live = false;
          this.matrix.makeScale(0, 0, 0);
          kind.mesh.setMatrixAt(i, this.matrix);
          continue;
        }

        kind.animate(m, timeSeconds, this.matrix, this.scratch);
        // The rim fade, applied to the composed matrix rather than inside every
        // `animate` — `Matrix4.scale` touches the basis columns and leaves the
        // translation alone, so a mote shrinks where it is rather than sliding
        // toward the origin as it goes.
        const fade = edgeFade(d);
        if (fade < 1) {
          this.fadeScale.set(fade, fade, fade);
          this.matrix.scale(this.fadeScale);
        }
        kind.mesh.setMatrixAt(i, this.matrix);
      }
      kind.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// --- How each kind moves ------------------------------------------------------
//
// All four are the same two ideas at different settings: a wander around the
// anchor, and a flap. What separates them is entirely in the numbers, which is
// the point — a dragonfly is a butterfly that darts and holds, and a firefly is
// a butterfly that barely moves and goes out.

function butterflyAnimate(m: Mote, t: number, out: THREE.Matrix4, s: Scratch): void {
  const a = t * m.rate + m.p1;
  // A figure of eight rather than a circle. A circling butterfly reads as a
  // moth round a lamp; the doubled frequency on one axis is the whole
  // difference and costs nothing.
  const x = m.ax + Math.sin(a) * m.spread;
  const z = m.az + Math.sin(a * 2 + m.p2) * m.spread * 0.6;
  const y = m.ay + Math.sin(a * 1.7 + m.p2) * 0.34;
  s.pos.set(x, y, z);
  // Facing the way it is going, worked out from the derivative of the path
  // rather than from the last position — no state, and correct on the frame it
  // turns rather than one behind.
  const heading = Math.atan2(Math.cos(a) * m.spread, Math.cos(a * 2 + m.p2) * m.spread * 1.2);
  const flap = Math.sin(t * 11 * m.rate + m.p1);
  s.euler.set(0.25, heading, 0);
  s.quat.setFromEuler(s.euler);
  // The flap is a squash on the wing axis. At a dozen pixels this and a hinged
  // wing are the same picture, and one of them needs no second bone.
  //
  // It goes NEARLY TO NOTHING at the closed end, and that is the single change
  // that stopped these reading as shapes: a butterfly at the top of its beat is
  // edge-on and effectively invisible, so what the eye actually receives is an
  // intermittent flicker rather than a polygon that is continuously present and
  // merely changing width. 0.35 kept a solid sliver on screen at all times,
  // which is what a piece of paper does.
  s.scale.set(m.size * (0.08 + 0.92 * Math.abs(flap)), m.size, m.size);
  out.compose(s.pos, s.quat, s.scale);
}

function dragonflyAnimate(m: Mote, t: number, out: THREE.Matrix4, s: Scratch): void {
  const a = t * m.rate * 1.6 + m.p1;
  // Darts and holds: a sine pushed toward its extremes spends most of its time
  // at one end or the other, which is exactly how a dragonfly crosses water.
  const dart = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.35);
  const x = m.ax + dart * m.spread * 1.6;
  const z = m.az + Math.sin(a * 0.7 + m.p2) * m.spread;
  const y = m.ay + Math.sin(a * 2.3) * 0.12;
  s.pos.set(x, y, z);
  s.euler.set(0.1, Math.atan2(Math.cos(a) * 2, Math.cos(a * 0.7 + m.p2)), 0);
  s.quat.setFromEuler(s.euler);
  // Barely flaps — the wings are a blur at this size, so a shallow squash reads
  // better than a full one. Long and low, which is the dragonfly's whole
  // silhouette.
  s.scale.set(m.size * (0.6 + 0.4 * Math.abs(Math.sin(t * 24))), m.size * 0.6, m.size * 1.7);
  out.compose(s.pos, s.quat, s.scale);
}

function fireflyAnimate(m: Mote, t: number, out: THREE.Matrix4, s: Scratch): void {
  const a = t * m.rate * 0.4 + m.p1;
  s.pos.set(
    m.ax + Math.sin(a) * m.spread * 0.5,
    m.ay + Math.sin(a * 1.3 + m.p2) * 0.5,
    m.az + Math.cos(a * 0.8 + m.p2) * m.spread * 0.5,
  );
  // THE BLINK IS THE WHOLE EFFECT. A steadily glowing dot is a firefly-coloured
  // pixel; one that comes on, holds and goes out is an insect. Sharpened hard
  // so most of the cycle is dark — a field where they were all lit at once
  // would read as fairy lights strung between the trees.
  const pulse = Math.sin(t * 1.9 * m.rate + m.p2);
  // Sharp, but not as sharp as it was: at a threshold of 0.45 barely a fifth of
  // the swarm was alight at any moment and a wood at midnight had four visible
  // sparks in it. 0.22 keeps most of the cycle dark — which is the effect —
  // while leaving enough of them lit to read as a swarm.
  const lit = Math.max(0, pulse - 0.22) / 0.78;
  const k = m.size * lit * lit;
  s.quat.identity();
  s.scale.set(k, k, k);
  out.compose(s.pos, s.quat, s.scale);
}

function birdAnimate(m: Mote, t: number, out: THREE.Matrix4, s: Scratch): void {
  // A long slow circle, high up. The anchor drifts with the wind like
  // everything else, so a flock crosses the sky over minutes rather than
  // orbiting one spot forever.
  const a = t * m.rate * 0.18 + m.p1;
  const r = 9 + m.spread * 3;
  s.pos.set(m.ax + Math.cos(a) * r, m.ay + Math.sin(a * 0.6 + m.p2) * 1.6, m.az + Math.sin(a) * r);
  // Facing along the tangent of its own circle.
  s.euler.set(0, -a + Math.PI / 2, Math.sin(a * 0.6) * 0.2);
  s.quat.setFromEuler(s.euler);
  const flap = 0.55 + 0.45 * Math.sin(t * 3.4 * m.rate + m.p1);
  s.scale.set(m.size, m.size * flap, m.size);
  out.compose(s.pos, s.quat, s.scale);
}
