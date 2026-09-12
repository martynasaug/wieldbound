// THE ART BENCH: one instrument for judging what this character looks like.
//
// WHY THIS EXISTS. Seven separate harnesses grew out of the gear work —
// handprobe, armprofile, capeprobe, capewalk, contrast, palettecheck,
// armourstyles — and four of them reported confident numbers that were wrong:
//
//   * `contrast` sampled fixed screen rectangles that sat on the street behind
//     the character, so every item in the catalogue measured the same.
//   * then it compared against a strip of bare arm whose lightness moved from
//     0.24 to 0.125 between runs, because the arm was in its own shade.
//   * `armourstyles` equipped styles with no palette, so every plate rendered
//     fallback steel and the palette work looked like it had failed.
//   * `armprofile` mixed bone space with vertex space and reported a
//     seventy-metre forearm.
//
// Each time the number agreed with a screenshot I had already talked myself
// into, and the art got changed on the strength of it. The prayer beads went
// the same way, three passes running. So this replaces them with one bench
// built around the four rules those failures imply:
//
//   1. ONE SPACE. Every measurement comes from the mesh's own vertex positions.
//      No bind matrices, no world-versus-local, no units to convert.
//   2. IT CHECKS ITS OWN FOOTING FIRST. The reference body, the lighting and
//      the sample windows are validated before anything is reported; if they
//      are off, it refuses to report rather than printing a plausible number.
//   3. THE NUMBERS ARE DRAWN INTO THE PICTURE. One frame produces both, so a
//      screenshot can never quietly disagree with the measurement.
//   4. EVERY RULE STATES ITS THRESHOLD AND ITS VERDICT, so nothing rests on me
//      deciding a photograph looks acceptable.
//
//   node tools/soak/artcheck.mjs <subject ...> [--out dir] [--no-shots]
//
// Subjects:
//   body                    the bare character: silhouette, limb profiles
//   armor:plate             one worn style, using its own representative palette
//   item:gildedplate        one catalogue item, with the palette it really has
//   cape:cloak              a cape, standing and running
//   hands                   the hands, and whether the arm steps at the wrist
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

const args = process.argv.slice(2);
const OUT = (() => {
  const i = args.indexOf("--out");
  return i >= 0 ? args[i + 1] : "tools/soak/shots/artcheck";
})();
const SHOTS = !args.includes("--no-shots");
const SUBJECTS = args.filter((a) => !a.startsWith("--") && a !== OUT);
if (!SUBJECTS.length) SUBJECTS.push("hands");
mkdirSync(OUT, { recursive: true });

// A style is a shape; the palette is what it is made of. A style subject with no
// item behind it borrows the palette its most representative item uses, so a
// plate sheet never renders as fallback steel again.
const STYLE_PALETTE = {
  leather: "bronze", chain: "iron", plate: "steel", robe: "wood", scale: "bronze", brigandine: "steel",
  cap: "iron", hood: "wood", full: "steel", horned: "bone", circlet: "gold",
  low: "wood", tall: "wood", plated: "steel", wrapped: "bone",
  cape: "crimson", cloak: "wood", mantle: "silver", tabard: "verdant",
};
const SLOT_OF = {
  leather: "armor", chain: "armor", plate: "armor", robe: "armor", scale: "armor", brigandine: "armor",
  cap: "helm", hood: "helm", full: "helm", horned: "helm", circlet: "helm",
  low: "boots", tall: "boots", plated: "boots", wrapped: "boots",
  cape: "cape", cloak: "cape", mantle: "cape", tabard: "cape",
};

/** What the bench considers acceptable, in one place, with the reason. */
const RULES = {
  // A limb should not jump in width from one slice to the next. A hand is a
  // little wider than the wrist; a gauntlet is nearly double, which is what
  // "the whole arm width goes and then at the gloves place" describes.
  limbStep: { max: 1.3, why: "a limb steps out at a joint" },
  // Weber contrast against the bare body beside it. Below this a piece reads as
  // painted on rather than worn.
  contrast: { min: 0.25, why: "a piece blends into the body" },
  // AND THE SAME QUESTION ASKED ABOUT COLOUR. Luma weights red at 0.2126, so a
  // vivid crimson cape and brown skin land within a hundredth of each other in
  // lightness: the rule above scored an unmissable red drape at 0.02 and failed
  // it. Either kind of separation is enough for a piece to read, so the verdict
  // takes whichever the piece has.
  //
  // THE NUMBER CAME FROM THE TEN SUBJECTS, NOT FROM ME. Measured: silver 58.3,
  // verdant 52.9, brigandine 42.6, bronze 37.9, crimson 36.0, wood 36.9/25.2,
  // steel 33.3, iron mail 20.4 — the weakest of ten that all read clearly on the
  // character. A just-noticeable CIE76 difference is about 2.3, so 15 sits well
  // above noise and below every piece I judged acceptable by eye.
  //
  // AND THIS FLOOR IS NOT YET TRUSTWORTHY. It was read off a table of ten
  // subjects measured across several runs — and the bench logs in as a fresh
  // player each time, with a RANDOMISED SKIN TONE, so the bare body every piece
  // was compared against was a different colour in every run of that table. A
  // tan cloak against pale skin and the same cloak against brown skin are
  // honestly different numbers. The wood cloak looked like a negative control at
  // 9.7, was "fixed" onto the accent, measured 10.5, and was reverted: nothing
  // about the cloth ever changed.
  //
  // The appearance is pinned below from this run on. Until the table is taken
  // again on a fixed body, treat 15 as provisional and compare figures only
  // WITHIN one run, never across two.
  colour: { min: 15, why: "a piece is the same colour as the body" },
  // And it must not be a hole either.
  minLuma: { min: 0.05, why: "a piece is too dark to read as anything" },
  // THE SAME BLINDNESS, ONE RULE LOWER. The crimson cape measured luma 0.109,
  // 0.119 and 0.033 across three runs of the same build and failed the third as
  // "too dark to read as anything" — from frames showing a vivid red drape.
  // Luma weights red at 0.2126, so a strongly saturated red is dark by that
  // measure however well it reads. A piece is only a hole if it is dark AND has
  // no colour in it; chroma is the a*b* radius in CIELAB.
  //
  // PROVISIONAL, and marked so: unlike the colour floor, this number is not yet
  // read off measured subjects — chroma is printed with every piece from this
  // run on, and the floor should be reset once there are figures to set it from.
  chroma: { min: 12, why: "a piece is dark and colourless — it reads as a hole" },
  // A worn piece has to stand off the body enough to have a silhouette.
  proud: { min: 0.012, why: "a piece hugs the body and has no outline of its own" },
  // A cape has to actually move between frames of a run.
  swing: { min: 0.05, why: "a hanging piece does not move when the character does" },
  // AND IT HAS TO BE A SHAPE. Reported: capes "just look like squares on the
  // back" — and the bench passed one on every other rule while it was exactly
  // that. A garment narrows at the collar and opens at the hem; a sheet of
  // cloth cut square has the same width all the way down and an aspect close to
  // one. Measured on the piece's own vertices, in its own space.
  taper: { min: 1.15, why: "a hanging piece is the same width top to bottom — a square" },
  // A PIECE MUST NOT BE A FEATURELESS SHEET — and this rule is deliberately much
  // narrower than the question I wanted to answer, so read what it does NOT say.
  //
  // Every other rule here asks whether a piece separates from the BODY. None
  // asked whether it has anything ON it, so ten subjects passed everything while
  // the catalogue plates showed capes as one untextured trapezoid and five robes
  // as a rounded rectangle. Measured over each piece's full projected extent, at
  // 100% non-sky coverage, edge density came out:
  //
  //   chain .112   robe .062   brigandine .055   scale .054   cloak .054
  //   leather .044   plate .038   tabard .0004   cape 0   mantle 0
  //
  // THE MODELLED AND THE FLAT INTERLEAVE. The robe I judged flat on the plate
  // outranks brigandine, scale and plate; the flat cloak ties scale exactly. So
  // this CANNOT rank how much art a piece has, and no threshold in that range
  // would mean anything — a cut anywhere passes a slab or fails a garment.
  //
  // What it can do is find a piece with NO features at all: cape, mantle and
  // tabard sit an order of magnitude below everything else, and they are exactly
  // the three the plates condemned. A measurement and a picture agreeing
  // independently is the only reason this rule exists. The floor sits in the
  // empty gap between .0099 and .044.
  //
  // It will pass a piece with one crease on it. "Does this look good" is still
  // not measurable here, and nothing in this file should be read as claiming it.
  detail: { min: 0.02, why: "a piece has no features on it at all — a flat sheet" },
};

const { browser, page } = await open({ headless: true, width: 1280, height: 800 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`error: ${m.text()}`);
});
await login(page, `Art${Date.now() % 100000}`);

// --- the rig ---------------------------------------------------------------------------------
// Frozen and identical for every subject, so two runs are comparable: noon, the
// character facing the sun, one pose, one camera distance.
//
// AND THE BODY ITSELF, which this comment claimed for a whole session while it
// was not true. Every piece here is judged against a patch of BARE SKIN, and the
// bench logs in as `Art<clock>` — a new name every run. `defaultLookFor` derives
// the skin tone from a hash OF THE NAME, over eight tones spanning lightness
// 0.24 (ebony) to 0.72 (porcelain). So the reference was a different colour in
// every run: the bare-body window read 0.114, 0.121, 0.135, 0.190, 0.235, 0.255
// across runs of identical builds, and I read those swings as the art changing.
//
// The wood cloak is what it cost. It was failed at deltaE 9.7, moved to the
// palette's accent, measured 10.5, and moved back — three passes over cloth that
// was never the problem, which is the prayer-beads pattern exactly. Figures from
// before this pin cannot be compared with figures after it, or with each other.
//
// `tan` is mid-scale (0.39), so neither a very pale nor a very dark reference
// flatters a piece; `average` build is scale 1.0, so limb figures stay in the
// units the rest of this file is written in; no beard, because a full one is a
// large dark mass right beside the collar windows.
const PINNED_LOOK = { skin: "tan", build: "average", hair: "short", beard: "none", hairColor: "black" };
await page.evaluate((look) => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  const a = g.localActor;
  a.setLook(look);
  a.heading = Math.PI;
  a.root.rotation.y = Math.PI;
  const render = g.world.renderer.render.bind(g.world.renderer);
  g.world.renderer.render = (s, c) => {
    g.__artHold?.();
    render(s, c);
  };
  window.__art = {
    /** Freeze one pose, so nothing is measured mid-stride unless asked. */
    pose(anim, frac) {
      const actor = g.localActor;
      if (!actor.__realPlay) {
        actor.__realPlay = actor.play.bind(actor);
        actor.play = () => {};
      }
      actor.mixer.stopAllAction();
      actor.mixer.timeScale = 1;
      actor.__realPlay(anim, true);
      const action = actor.actions.get(anim);
      if (action) {
        actor.mixer.stopAllAction();
        action.reset().setEffectiveWeight(1).play();
        action.time = action.getClip().duration * frac;
      }
      actor.mixer.update(0.0001);
      actor.mixer.timeScale = 0;
    },
    body() {
      const actor = g.localActor;
      let mesh = null;
      actor.root.traverse((o) => { if (!mesh && o.isSkinnedMesh) mesh = o; });
      return mesh;
    },
  };
}, PINNED_LOOK);
await page.waitForTimeout(1500);

// AND PROVE THE PIN TOOK. `setLook` returns early unless the actor has both an
// identity and a loaded instance, so asking for a look is not the same as
// wearing one — and a pin that quietly does nothing would leave every number
// below measured against a random body while this file says otherwise. That is
// the failure this whole bench exists to refuse, so it is checked, not assumed.
{
  const got = await page.evaluate(() => window.__wieldbound.localActor.currentLook);
  const wrong = !got || Object.entries(PINNED_LOOK).filter(([k, v]) => got[k] !== v);
  if (!got || wrong.length) {
    console.error(`artcheck: the look did not pin — asked for ${JSON.stringify(PINNED_LOOK)},` +
      ` got ${JSON.stringify(got)}. Every measurement here is against bare skin, so a body that is` +
      ` not the one named above makes the whole run uncomparable. Refusing to measure.`);
    await browser.close();
    process.exit(1);
  }
  console.log(`body pinned: ${Object.entries(PINNED_LOOK).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

/** Measurements that live entirely in the body mesh's own vertex space. */
async function geometry(spec) {
  return page.evaluate((spec) => {
    const a = window.__wieldbound.localActor;
    const body = window.__art.body();
    if (!body) return { ok: false, why: "no skinned body" };
    const V = a.position.constructor;
    const names = body.skeleton.bones.map((b) => b.name);
    const pos = body.geometry.attributes.position;
    const index = body.geometry.attributes.skinIndex;
    const weight = body.geometry.attributes.skinWeight;
    const dominant = (i) => {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > weight.getComponent(i, best)) best = k;
      return names[index.getComponent(i, best)];
    };
    const centroid = (want) => {
      const wanted = new Set(want);
      const sum = new V();
      const v = new V();
      let n = 0;
      for (let i = 0; i < pos.count; i++) {
        if (!wanted.has(dominant(i))) continue;
        sum.add(v.fromBufferAttribute(pos, i));
        n++;
      }
      return n ? { at: sum.divideScalar(n), n } : null;
    };

    // The whole body, for scale and for the footing check.
    const lo = new V(1e9, 1e9, 1e9);
    const hi = new V(-1e9, -1e9, -1e9);
    const v = new V();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      lo.min(v);
      hi.max(v);
    }
    const height = hi.z - lo.z;

    const from = centroid(spec.from);
    const to = centroid(spec.to);
    if (!from || !to) return { ok: false, why: `no vertices for ${spec.from} or ${spec.to}` };
    const axis = to.at.clone().sub(from.at);
    const span = axis.length();
    axis.normalize();

    // UNITS CHECK. Everything here is in the mesh's own space, where the body is
    // about 2.9 tall; a limb that measures a fifth of that or more is a limb,
    // and anything else means the axis is wrong.
    if (!(span > height * 0.05 && span < height * 0.9)) {
      return { ok: false, why: `axis span ${span.toFixed(2)} is not a limb on a body ${height.toFixed(2)} tall` };
    }

    const wanted = new Set(spec.of);
    const slices = [];
    const reach = spec.reach ?? 1.6;
    for (let s = 0; s < spec.slices; s++) {
      const t0 = (s / spec.slices) * reach;
      const t1 = ((s + 1) / spec.slices) * reach;
      let n = 0;
      let max = 0;
      let sum = 0;
      for (let i = 0; i < pos.count; i++) {
        if (!wanted.has(dominant(i))) continue;
        v.fromBufferAttribute(pos, i).sub(from.at);
        const t = v.dot(axis) / span;
        if (t < t0 || t >= t1) continue;
        const r = v.sub(axis.clone().multiplyScalar(t * span)).length();
        max = Math.max(max, r);
        sum += r;
        n++;
      }
      if (n >= 3) slices.push({ t: +((t0 + t1) / 2).toFixed(2), n, max: +max.toFixed(3), mean: +(sum / n).toFixed(3) });
    }
    return { ok: true, height: +height.toFixed(3), span: +span.toFixed(3), slices };
  }, spec);
}

/**
 * THE MEASUREMENT CAMERA, PINNED.
 *
 * The same forearm patch read 0.270 on every subject in one run and 0.131 in
 * the next, minutes apart, with the same rig and the same pose — because the
 * tile loop leaves the camera wherever the last shot put it, and the next
 * subject was measured from there. A contrast figure is only comparable if the
 * view it was taken from is identical every time, so every measurement starts
 * by putting the camera back.
 */
async function measurementCamera(yaw) {
  return page.evaluate((yaw) => {
    const g = window.__wieldbound;
    const a = g.localActor;
    // THE POSE, TOO, NOT JUST THE CAMERA. With the camera pinned the piece
    // readings became identical across runs — plate 0.410 both times — while the
    // bare-forearm reference still moved, 0.220 without sheets against 0.186
    // with. The piece window comes from the piece's own vertices and does not
    // care how the body stands; the reference is taken from POSED BONES, and the
    // shots path had played a pose in between. Same frame means same pose.
    window.__art.pose("idle", 0.25);
    g.__artHold = () => {
      const target = a.position.clone();
      target.y += 0.95;
      // WHICH SIDE THIS IS, stated once and consistently with the shot tiles
      // below. Cameras here are placed at `heading + yaw` and the rig turns the
      // character to `heading = PI`, so yaw = PI looks at the FACE and yaw = 0
      // looks at the BACK.
      //
      // This took no yaw at all and used `heading` — the back — while the
      // comment here claimed it was the lit front. Both halves of that mistake
      // did damage: the claim is what made "the piece's front face" seem like
      // the right surface to sample, and the silence about the real side is why
      // a cape could be measured for three passes without anyone asking whether
      // the fall was in frame. The side is now chosen per piece, by what is
      // actually visible, and reported with the numbers.
      const f = a.heading + yaw;
      g.world.camera.position.set(target.x + Math.sin(f) * 3.0, target.y + 0.3, target.z + Math.cos(f) * 3.0);
      g.world.camera.lookAt(target);
    };
    // WHERE THIS WAS MEASURED FROM, reported with the numbers. The robe read
    // 0.205 and failed in one run, then 0.121 and passed seconds later on the
    // same build — because the with-shots and no-shots paths were not looking
    // from the same place, and nothing in the output said so. A measurement
    // that cannot name its own viewpoint cannot be compared with another.
    g.__artHold();
    const c = g.world.camera.position;
    return [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)];
  }, yaw);
}

/**
 * ONE SIDE, AND IT IS THE LIT ONE.
 *
 * I briefly measured each piece from whichever of two sides "saw" more of it.
 * That run reported every one of ten subjects from yaw PI at 100% visible —
 * because the visibility test could not find its reference bone and defaulted to
 * "visible", so both sides tied and the first won. What it actually sampled was
 * the character's shaded face: every piece dropped (plate 0.368 to 0.143, robe
 * 0.260 to 0.045), the reference rose to 0.255, and everything "passed contrast"
 * by being DARKER than the body while two pieces failed as black holes. That is
 * the mirror-image failure this file already records once.
 *
 * Yaw 0 is the sunlit side, and it is also the side a cape's fall faces — the
 * yaw-0 tile on every sheet is the one showing the drape. So it is the only
 * viewpoint here, and the visibility test below is a REFUSAL, never a chooser.
 */
const SIDES = [{ name: "lit side", yaw: 0 }];

/** Pixels, from the same frame the shots come from, taken from ONE side. */
async function sampleFrom(meshFilter, side) {
  const cameraAt = await measurementCamera(side.yaw);
  await page.waitForTimeout(280);
  const boxes = await page.evaluate((meshFilter) => {
    const g = window.__wieldbound;
    const a = g.localActor;
    const cam = g.world.camera;
    const V = a.position.constructor;
    a.root.updateMatrixWorld(true);
    const canvas = g.world.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const project = (points) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const p of points) {
        const q = p.clone().project(cam);
        x0 = Math.min(x0, ((q.x + 1) / 2) * w);
        x1 = Math.max(x1, ((q.x + 1) / 2) * w);
        y0 = Math.min(y0, ((1 - q.y) / 2) * h);
        y1 = Math.max(y1, ((1 - q.y) / 2) * h);
      }
      return { x0, y0, x1, y1 };
    };
    const corners = (mesh) => {
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox;
      const out = [];
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) out.push(mesh.localToWorld(new V(x, y, z)));
        }
      }
      return out;
    };
    let piece = null;
    a.root.traverse((o) => {
      if (!o.isMesh || !o.name.startsWith(meshFilter)) return;
      if (!piece || o.name.includes("Torso")) piece = o;
    });
    if (!piece) return null;
    // THE PIECE'S OWN SURFACE, NOT ITS BOUNDING BOX. A cuirass that stands proud
    // of the chest has shadowed body and background inside its box — between the
    // pauldrons, under the arms — so sampling the box measured the gaps as if
    // they were the armour and scored a plainly visible steel plate at 0.11
    // against a sunlit arm. The window is taken from the piece's own vertices
    // instead: the middle of the front face, where the plate actually is.
    // One camera position, shared by the facing sort and the visibility test
    // below — they have to be talking about the same viewpoint.
    const camPos = cam.position.clone();
    const front = [];
    {
      const p = piece.geometry.attributes.position;
      const v = new V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(piece.matrixWorld);
        front.push(v.clone());
      }
      // NEAREST THE CAMERA HAS TO MEAN NEAREST THE CAMERA. This sorted on world
      // z and called the result "the nearest quarter of the piece's vertices to
      // the camera", which is only true for a camera on the +z side. The
      // measurement camera is placed from `heading`, which puts it at LOWER z —
      // so this picked the FAR quarter every time. On a cape that is the top of
      // the fall where it meets the neck, and the window landed on the body:
      // `cape:cloak` was scored 0.186 against a body at 0.195 and failed for
      // blending in, from a frame that plainly shows a broad tan drape. The
      // number was the body's own value, measured twice.
      front.sort((m, n) => m.distanceTo(camPos) - n.distanceTo(camPos));
    }
    // A PATCH OF BARE BODY THE GEAR CANNOT REACH, and proved so rather than
    // assumed. The reference was a strip of UPPER arm — which the pauldrons
    // then grew over, so the piece and the "bare body" were the same pixels and
    // three styles in a row scored contrast 0.01. It sits on the FOREARM now,
    // between elbow and wrist, and every gear mesh on the character is checked
    // against it: if anything covers it, the bench refuses to judge contrast.
    //
    // Taken from the BONES, not from vertex positions: this mesh is skinned, so
    // its stored vertices are the bind pose and projecting them would put the
    // window where the arm is not.
    const boneAt = (name) => {
      let found = null;
      a.root.traverse((o) => { if (o.isBone && o.name === name) found = o; });
      if (!found) return null;
      const p = new V();
      found.getWorldPosition(p);
      return p;
    };
    const elbow = boneAt("LowerArmL");
    const wrist = boneAt("FistL");
    if (!elbow || !wrist) return null;
    // Two thirds along the forearm: past anything a sleeve or a pauldron reaches.
    const armAt = elbow.clone().lerp(wrist, 0.66);
    const armSpan = elbow.distanceTo(wrist);
    const inset = (r, k) => ({
      x: Math.round(r.x0 + (r.x1 - r.x0) * k),
      y: Math.round(r.y0 + (r.y1 - r.y0) * k),
      width: Math.max(6, Math.round((r.x1 - r.x0) * (1 - 2 * k))),
      height: Math.max(6, Math.round((r.y1 - r.y0) * (1 - 2 * k))),
    });
    // The nearest quarter of the piece's vertices to the camera: its facing
    // surface, which is what a player sees and what "does it read" is about.
    const facing = front.slice(0, Math.max(8, Math.round(front.length * 0.25)));
    const pieceRect = inset(project(facing), 0.18);
    // AND IS THAT SURFACE IN VIEW AT ALL? A projected rectangle says nothing
    // about what stands in front of it. A cape's fall projects onto the torso's
    // own silhouette from the front, so the sampler read body pixels, called the
    // coverage 100%, and reported them as the cape — the footing check only ever
    // asked whether the REFERENCE was covered, never the piece.
    //
    // A piece's facing vertices have to lie nearer the camera than the body's
    // core; if they do not, the body is between the camera and the piece.
    // AND IF THE TEST CANNOT RUN, IT HAS NOT PASSED. This defaulted to 1 when the
    // core bone was not found, which is exactly how ten subjects in a row
    // reported "100% of the facing surface is clear of the body" from a side
    // that cannot see a cape at all. An unrunnable check is a refusal.
    // DEPTH ALONG THE VIEW AXIS, NOT DISTANCE TO A BONE POINT. The first version
    // of this compared each vertex's distance to the `Torso` bone's distance, and
    // scored a cloak 100% clear from a camera that cannot see its fall at all:
    // the collar wraps the shoulders and is genuinely nearer the camera than the
    // spine, while the torso stands squarely in front of the cloth below it.
    // "Something is between the camera and this" is a statement about depth.
    const core = boneAt("Torso") ?? boneAt("Abdomen") ?? boneAt("Body");
    const forward = new V();
    cam.getWorldDirection(forward);
    const depth = (p) => p.clone().sub(camPos).dot(forward);
    const coreDepth = core ? depth(core) : null;
    const visible = core
      ? +(facing.filter((v) => depth(v) < coreDepth).length / facing.length).toFixed(2)
      : null;
    // AND A SECOND WINDOW, FOR A SECOND QUESTION. The window above is the nearest
    // quarter of the piece inset hard, which is exactly right for colour: it has
    // to be uncontaminated piece pixels or the mean is the body's. It is exactly
    // wrong for detail. Banding, plackets, scales, hems and folds are spread
    // across a whole garment, and a small patch cut from the middle of a large
    // fall can sit entirely inside ONE flat facet — which is how `cape:cape` and
    // `cape:mantle` both reported variance 0.0000 and edges 0.0000, a reading no
    // lit surface can honestly produce.
    //
    // So detail is measured over the piece's FULL projected extent. This does
    // admit background at the silhouette's edges, and that matters: the bare
    // body scores the highest edge density of anything here (0.152) almost
    // entirely from its arm outline against the street. Edge density rewards
    // OUTLINE unless you know how much of the window is piece, so the non-sky
    // coverage of this window is reported beside the figures rather than folded
    // into them.
    const detailRect = inset(project(front), 0.10);
    const r = armSpan * 0.22;
    const bodyRect = inset(project([
      armAt.clone().add(new V(-r, r, -r)),
      armAt.clone().add(new V(r, -r, r)),
    ]), 0.12);

    // Does any gear sit on the reference? Rectangles, in screen space.
    const overlaps = (p, q) =>
      p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
    // THE CLOTH, NOT THE BOX AROUND IT. This projected each gear mesh's bounding
    // box, and a cape link's box is large, tilted and swinging — so `cape:cloak`
    // refused to measure contrast at all, reporting the forearm reference as
    // covered by gear while no cloth was within a foot of the arm. A box is not
    // a garment; the mesh's own vertices are.
    const hull = (mesh) => {
      const p = mesh.geometry.attributes.position;
      const step = Math.max(1, Math.floor(p.count / 200));
      const out = [];
      const v = new V();
      for (let i = 0; i < p.count; i += step) {
        out.push(v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).clone());
      }
      return out.length ? out : corners(mesh);
    };
    let covered = false;
    a.root.traverse((o) => {
      if (covered || !o.isMesh) return;
      if (!o.name.startsWith("gear_") && !o.name.startsWith("hand_") && !o.name.startsWith("held_")) return;
      if (overlaps(bodyRect, inset(project(hull(o)), 0.05))) covered = true;
    });

    return {
      piece: pieceRect,
      detail: detailRect,
      body: bodyRect,
      referenceCovered: covered,
      visible,
      proud: (() => {
        // How far the piece stands off the body, in world units: the piece's own
        // half-depth against the torso's.
        piece.geometry.computeBoundingBox();
        const b = piece.geometry.boundingBox;
        return +(Math.max(b.max.y - b.min.y, b.max.x - b.min.x) * 0.5 * piece.getWorldScale(new V()).x).toFixed(4);
      })(),
    };
  }, meshFilter);
  if (!boxes) return null;

  const read = async (clip) => {
    const shot = await page.screenshot({ clip });
    return page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const w = c.width;
      const h = c.height;
      const d = ctx.getImageData(0, 0, w, h).data;
      // Walked as a grid rather than a flat run, because the detail figures below
      // are about a pixel's NEIGHBOURS and a flat index cannot name them.
      const isSky = (i) => d[i + 2] > 150 && d[i + 2] > d[i] + 20;
      const lumaAt = (i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      let r = 0, g = 0, b = 0, n = 0, sky = 0;
      const lumas = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (isSky(i)) { sky++; continue; }
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
          lumas.push(lumaAt(i));
        }
      }
      const total = w * h;
      const mean = n ? (0.2126 * r + 0.7152 * g + 0.0722 * b) / n / 255 : 0;

      // DOES THE PIECE HAVE ANYTHING ON IT? Every other rule here asks whether a
      // piece separates from the BODY — lightness, colour, standing proud, taper.
      // None asks whether it has any internal detail, so a flat slab of one
      // colour passes all of them: ten subjects passed while the plates showed
      // capes as one untextured trapezoid and five robes as a rounded rectangle.
      //
      // TWO MEASURES, BECAUSE THEY FAIL DIFFERENTLY. A smoothly lit slab carries
      // real variance across it with no features at all, so variance alone would
      // call a gradient "detail". Edge density is the one that separates banding,
      // plackets, scales and folds from a smooth panel: neighbouring pixels that
      // actually step. Both ignore sky, as the mean does.
      let variance = 0;
      if (n > 1) {
        let acc = 0;
        for (const l of lumas) acc += (l - mean) ** 2;
        variance = Math.sqrt(acc / n);
      }
      let edges = 0;
      let pairs = 0;
      const STEP = 0.045; // a luma step a viewer would read as a line, not shading
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (isSky(i)) continue;
          const here = lumaAt(i);
          if (x + 1 < w) {
            const j = i + 4;
            if (!isSky(j)) { pairs++; if (Math.abs(lumaAt(j) - here) > STEP) edges++; }
          }
          if (y + 1 < h) {
            const j = i + w * 4;
            if (!isSky(j)) { pairs++; if (Math.abs(lumaAt(j) - here) > STEP) edges++; }
          }
        }
      }

      // THE MEAN COLOUR, NOT ONLY ITS LIGHTNESS. Luma weights red at 0.2126, so
      // a saturated crimson cape and brown skin come out within a hundredth of
      // each other in luma while being obviously different colours — `cape:cape`
      // was scored 0.04 from a frame showing a vivid red drape. A rule about
      // whether a piece reads against the body has to be able to see hue.
      return {
        luma: mean,
        rgb: n ? [r / n / 255, g / n / 255, b / n / 255] : [0, 0, 0],
        covered: n / total,
        sky: sky / total,
        variance: +variance.toFixed(4),
        edges: pairs ? +(edges / pairs).toFixed(4) : null,
      };
    }, shot.toString("base64"));
  };
  const piece = await read(boxes.piece);
  const body = await read(boxes.body);
  const detail = await read(boxes.detail);
  return {
    piece, body, detail, proud: boxes.proud, referenceCovered: boxes.referenceCovered,
    visible: boxes.visible, side: side.name, cameraAt,
  };
}

/**
 * THE SIDE THE PIECE ACTUALLY FACES.
 *
 * A cuirass is a ring and reads from either side; a cape is on the back and
 * reads from one. Measuring every piece from one fixed side is how a cloak got
 * judged on the pixels of the torso in front of it. Both sides are tried and
 * the one that genuinely sees the piece is used — and named in the output, so a
 * figure can never again be compared against one taken from elsewhere.
 *
 * Both windows still come from a single frame, so the piece and the bare-body
 * reference are lit alike whichever side wins.
 */
async function sampleAround(meshFilter) {
  let best = null;
  for (const side of SIDES) {
    const seen = await sampleFrom(meshFilter, side);
    if (!seen) continue;
    if (!best || seen.visible > best.visible) best = seen;
  }
  return best;
}

/**
 * PERCEPTUAL DISTANCE, because "blends into the body" is about colour.
 *
 * CIELAB, D65, and a plain CIE76 difference over it — enough to separate a red
 * cape from brown skin, which Weber contrast on luma cannot do at all. Both
 * figures are printed; the threshold below is set from measured subjects rather
 * than chosen, so a rule is never invented to fit one piece.
 */
function lab([r, g, b]) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a, b) {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const report = [];
const say = (line) => { console.log(line); report.push(line); };
const verdict = (name, ok, detail) => {
  say(`   ${ok ? "PASS" : "FAIL"}  ${name.padEnd(26)} ${detail}`);
  return ok;
};

for (const subject of SUBJECTS) {
  const [kind, which] = subject.includes(":") ? subject.split(":") : [subject, null];
  say(`\n${subject}`);

  if (kind === "hands" || kind === "body") {
    await page.evaluate(() => {
      window.__wieldbound.localActor.setAppearance({ layers: {} });
      window.__art.pose("idle", 0.25);
    });
    await page.waitForTimeout(900);
    const arm = await geometry({
      from: ["UpperArmR"],
      to: ["Fist2R"],
      of: ["LowerArmR", "FistR", "Fist1R", "Fist2R", "Thumb1R", "Thumb2R"],
      slices: 12,
      reach: 1.35,
    });
    // Did the geometry pass that is supposed to slim the hand actually run?
    const work = await page.evaluate(() => {
      const body = window.__art.body();
      return body?.geometry?.userData?.armWork ?? null;
    });
    say(work
      ? `   arm pass moved ${work.pulled} vertices; reference ${work.reference.map((r) => `${r.side} radius ${r.radius} over ${r.hands} hand verts`).join(", ")}`
      : "   arm pass left no record — it did not run on this geometry");

    if (!arm.ok) {
      verdict("arm profile", false, `cannot measure: ${arm.why}`);
    } else {
      say(`   body ${arm.height} tall, arm axis ${arm.span}`);
      // A SLICE OF SIX VERTICES IS NOT A LIMB. Two of the three "steps" this
      // reported sat on slivers — a handful of vertices where the mesh happens
      // to have a seam — and a verdict that rests on those is the instrument
      // inventing a fault. Slivers are printed but cannot decide the rule; the
      // threshold is a twentieth of the arm's vertices.
      const solid = Math.max(8, Math.round(arm.slices.reduce((n, s) => n + s.n, 0) / 20));
      let worst = { ratio: 1, at: null };
      let prev = null;
      for (const s of arm.slices) {
        const ratio = prev ? s.max / Math.max(prev, 1e-6) : 1;
        const sliver = s.n < solid;
        if (!sliver && prev !== null && ratio > worst.ratio) worst = { ratio, at: s.t };
        say(`     t ${String(s.t).padStart(4)}  n ${String(s.n).padStart(3)}  max ${s.max.toFixed(3)}  mean ${s.mean.toFixed(3)}` +
          (sliver ? "   (sliver, ignored)" : prev && ratio > RULES.limbStep.max ? `   steps x${ratio.toFixed(2)}` : ""));
        if (!sliver) prev = s.max;
      }
      verdict(
        "arm has no step",
        worst.ratio <= RULES.limbStep.max,
        `worst jump x${worst.ratio.toFixed(2)}${worst.at !== null ? ` at t ${worst.at}` : ""} over slices of ${solid}+ verts,` +
          ` limit x${RULES.limbStep.max} — ${RULES.limbStep.why}`,
      );
    }
  } else {
    const base = kind === "item" ? ITEM_BASES[which] : null;
    const style = base ? base.style : which;
    const slot = base ? base.slot : SLOT_OF[which];
    const palette = base ? base.art.palette : STYLE_PALETTE[which];
    if (!style || !slot) {
      verdict("subject", false, `unknown: ${subject}`);
      continue;
    }
    await page.evaluate(({ slot, style, palette }) => {
      window.__wieldbound.localActor.setAppearance({ layers: { [slot]: { style, rarity: "honed", palette } } });
      window.__art.pose("idle", 0.25);
    }, { slot, style, palette });
    await page.waitForTimeout(1100);

    const seen = await sampleAround(`gear_${slot}_${style}`);
    if (!seen) {
      verdict("drawn at all", false, "no mesh with that name is in the scene");
      continue;
    }
    // FOOTING FIRST. If the windows are not on the character, or the reference
    // is in shadow, nothing below this line is worth printing.
    const footing = seen.piece.covered > 0.5 && seen.body.covered > 0.5 && seen.body.luma > 0.08
      && !seen.referenceCovered && seen.visible !== null && seen.visible >= 0.5;
    say(`   palette ${palette}; piece luma ${seen.piece.luma.toFixed(3)}, body ${seen.body.luma.toFixed(3)},` +
      ` coverage ${(seen.piece.covered * 100).toFixed(0)}%/${(seen.body.covered * 100).toFixed(0)}%` +
      (seen.referenceCovered ? "; REFERENCE IS UNDER GEAR" : ""));
    say(`   measured from ${JSON.stringify(seen.cameraAt)}, the ${seen.side} — ` +
      (seen.visible === null
        ? "VISIBILITY UNMEASURED: no core bone to test occlusion against"
        : `${(seen.visible * 100).toFixed(0)}% of the piece's facing surface is clear of the body`));
    if (!verdict("measurement footing", footing,
      seen.referenceCovered
        ? "the bare-body reference is covered by gear — contrast cannot be measured here"
        : seen.visible === null
          ? "occlusion could not be tested — refusing to assume the piece is in view"
          : seen.visible < 0.5
            ? `the body stands in front of the piece (${(seen.visible * 100).toFixed(0)}% clear) — this is not a window on the piece`
            : "windows on the character and a lit reference")) {
      say("   refusing to judge contrast on this frame");
    } else {
      const contrast = Math.abs(seen.piece.luma - seen.body.luma) / Math.max(seen.body.luma, 0.01);
      const dE = deltaE(seen.piece.rgb, seen.body.rgb);
      // EITHER KIND OF SEPARATION COUNTS, and the verdict names which one carried
      // it, so a piece that reads only by colour can never again be failed by a
      // rule that cannot see colour.
      const byLuma = contrast >= RULES.contrast.min;
      const byColour = dE >= RULES.colour.min;
      verdict("stands out from the body", byLuma || byColour,
        `contrast ${contrast.toFixed(2)} (need ${RULES.contrast.min}), colour deltaE ${dE.toFixed(1)}` +
        ` (need ${RULES.colour.min})` +
        (byLuma && byColour ? " — separates by both" : byLuma ? " — separates by lightness" : byColour ? " — separates by colour alone" : "") +
        ` — ${RULES.contrast.why}`);
      // CALIBRATION ONLY, no rule yet. The positives and the negatives both exist
      // in this one build — chain, plate, brigandine, dragonscale, bone, scale and
      // both mantles are modelled; the robes, the jerkin and the plain cloaks are
      // flat — so for once a threshold can be set with evidence at both ends.
      // Printed before any rule is written, because choosing the number first and
      // finding support for it afterwards is the mistake this bench keeps making.
      say(`   detail over the whole piece: variance ${seen.detail.variance}, edges ${seen.detail.edges},` +
        ` ${(seen.detail.covered * 100).toFixed(0)}% of that window is not sky` +
        ` (bare body: variance ${seen.body.variance}, edges ${seen.body.edges})`);
      verdict("has features on it", (seen.detail.edges ?? 0) >= RULES.detail.min,
        `edge density ${seen.detail.edges}, need ${RULES.detail.min} — ${RULES.detail.why}`);
      const chroma = Math.hypot(...lab(seen.piece.rgb).slice(1));
      verdict("not a black hole",
        seen.piece.luma >= RULES.minLuma.min || chroma >= RULES.chroma.min,
        `luma ${seen.piece.luma.toFixed(3)} (need ${RULES.minLuma.min}), chroma ${chroma.toFixed(1)}` +
        ` (need ${RULES.chroma.min}) — ${RULES.minLuma.why}`);
    }
    verdict("has its own silhouette", seen.proud >= RULES.proud.min,
      `stands ${seen.proud.toFixed(4)} off the body, need ${RULES.proud.min} — ${RULES.proud.why}`);

    if (kind === "cape" || slot === "cape") {
      const frames = [];
      for (let i = 0; i < 4; i++) {
        frames.push(await page.evaluate(() => {
          const a = window.__wieldbound.localActor;
          if (!a.__realPlay) {
            a.__realPlay = a.play.bind(a);
            a.play = () => {};
          }
          a.__realPlay("run", true);
          const dt = 1 / 30;
          a.root.position.x += Math.sin(a.heading) * 3 * dt;
          a.root.position.z += Math.cos(a.heading) * 3 * dt;
          a.update(dt);
          return (a.capeLinks ?? []).map((j) => +j.rotation.x.toFixed(3));
        }));
        await page.waitForTimeout(90);
      }
      const hem = frames.map((f) => f[f.length - 1] ?? 0);
      const travel = Math.max(...hem) - Math.min(...hem);
      say(`   hem angle across ${frames.length} frames: ${hem.join(", ")}`);
      verdict("moves when the character does", travel >= RULES.swing.min,
        `hem travels ${travel.toFixed(3)} rad, need ${RULES.swing.min} — ${RULES.swing.why}`);

      // IS IT A SQUARE? Widths sampled down the fall, from the cape's own
      // vertices: collar, middle, hem.
      const shape = await page.evaluate(() => {
        const a = window.__wieldbound.localActor;
        const V = a.position.constructor;
        const bands = [];
        let lo = 1e9;
        let hi = -1e9;
        const parts = [];
        a.root.traverse((o) => {
          if (o.isMesh && o.name.includes("Cape")) parts.push(o);
        });
        if (!parts.length) return null;
        a.root.updateMatrixWorld(true);
        const pts = [];
        for (const mesh of parts) {
          const pos = mesh.geometry.attributes.position;
          const v = new V();
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
            pts.push(v.clone());
            lo = Math.min(lo, v.y);
            hi = Math.max(hi, v.y);
          }
        }
        const drop = hi - lo;
        for (let b = 0; b < 3; b++) {
          const y0 = lo + (drop * b) / 3;
          const y1 = lo + (drop * (b + 1)) / 3;
          let x0 = 1e9;
          let x1 = -1e9;
          for (const p of pts) {
            if (p.y < y0 || p.y >= y1) continue;
            x0 = Math.min(x0, p.x);
            x1 = Math.max(x1, p.x);
          }
          // AN EMPTY BAND IS NOT A WIDTH OF ZERO. A short fall can leave a third
          // with no vertices in it — `cape:cape` reported `middle 0` — and a
          // zero silently entering a ratio is how a rule passes by luck. Null
          // says "not measured" and the verdict below refuses it.
          //
          // AND NEITHER IS A SLIVER. The first version of this guard only caught
          // a band with NO vertices, so the same cape came back with `middle
          // 0.003`: two vertices clipped by a band edge, reported as a width.
          // A band has to hold a real slice of the fall to count as measured —
          // a hundredth of the character is the floor for that.
          const width = x1 > x0 ? +(x1 - x0).toFixed(3) : null;
          bands.push(width !== null && width >= 0.01 ? width : null);
        }
        return { drop: +drop.toFixed(3), hem: bands[0], middle: bands[1], collar: bands[2] };
      });
      if (shape) {
        say(`   fall ${shape.drop} tall: collar ${shape.collar}, middle ${shape.middle}, hem ${shape.hem}`);
        if (shape.hem === null || shape.collar === null) {
          verdict("is a garment, not a sheet", false,
            "the fall has a band with no geometry in it — shape cannot be measured");
        } else {
          const taper = shape.hem / Math.max(shape.collar, 1e-6);
          verdict("is a garment, not a sheet", taper >= RULES.taper.min,
            `hem is x${taper.toFixed(2)} the collar, need x${RULES.taper.min} — ${RULES.taper.why}`);
        }
      }
    }
  }

  if (SHOTS) {
    // THE SAME FRAME THE NUMBERS CAME FROM, with those numbers drawn onto it.
    const lines = report.slice(report.findIndex((l) => l.trim() === subject) + 1).filter((l) => l.trim());
    // FAR ENOUGH TO SEE THE JOINT, IN FRONT OF IT. The first rig put the camera
    // 1.1m from the fist bone — inside the character — so the close tile was a
    // wall of blurred forearm, and the wide tile looked at the BACK of a figure
    // three metres away where a hand is a few pixels. Neither could confirm or
    // deny the very thing the numbers were about. The arm hangs at the side, so
    // the useful view is from the front and slightly outboard.
    // THE RIG ALREADY TURNED THE CHARACTER. `heading` is set to PI at setup so
    // the body faces the sun, and every camera here is placed at `heading + yaw`
    // — so a yaw of 0 is BEHIND the character, not in front of it. Two rounds of
    // "close-up" tiles were the back of an upper arm for exactly that reason.
    // Facing views are therefore yaw = PI, and the hand hangs at the character's
    // side, so the arm views stand off to that side as well.
    const views = kind === "hands" || kind === "body"
      ? [
          { bone: "FistR", yaw: Math.PI - 0.5, dist: 1.5, lift: 0.15 },
          { bone: "LowerArmR", yaw: Math.PI + 0.3, dist: 2.2, lift: 0.25 },
        ]
      : [{ bone: null, yaw: Math.PI, dist: 3.0, lift: 0.3 }, { bone: null, yaw: 0, dist: 3.0, lift: 0.3 }];
    const tiles = [];
    for (const view of views) {
      await page.evaluate((view) => {
        const g = window.__wieldbound;
        const a = g.localActor;
        g.__artHold = () => {
          const target = a.position.clone();
          target.y += 0.95;
          if (view.bone) a.root.traverse((o) => { if (o.isBone && o.name === view.bone) o.getWorldPosition(target); });
          const f = a.heading + view.yaw;
          g.world.camera.position.set(target.x + Math.sin(f) * view.dist, target.y + view.lift, target.z + Math.cos(f) * view.dist);
          g.world.camera.lookAt(target);
        };
      }, view);
      await page.waitForTimeout(280);
      tiles.push((await page.screenshot({ clip: { x: 440, y: 120, width: 400, height: 560 } })).toString("base64"));
    }
    const png = await page.evaluate(async ({ tiles, lines, subject }) => {
      const tileW = 400, tileH = 560, pad = 8;
      const canvas = document.createElement("canvas");
      canvas.width = tileW * tiles.length + 520;
      canvas.height = tileH + 40;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#15110d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const [i, data] of tiles.entries()) {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        ctx.drawImage(img, i * tileW, 32, tileW, tileH);
      }
      ctx.fillStyle = "#f0dcaa";
      ctx.font = "18px Georgia";
      ctx.fillText(subject, 8, 22);
      // THE VERDICTS, ON THE PICTURE. A screenshot and a number that disagree is
      // how every mistake in this work survived review.
      ctx.font = "13px monospace";
      let y = 56;
      for (const line of lines.slice(0, 26)) {
        ctx.fillStyle = line.includes("FAIL") ? "#e0664a" : line.includes("PASS") ? "#8fbf7a" : "#b8a684";
        ctx.fillText(line.trim().slice(0, 62), tiles.length * tileW + pad, y);
        y += 18;
      }
      return canvas.toDataURL("image/png").split(",")[1];
    }, { tiles, lines, subject });
    const name = subject.replace(":", "-");
    writeFileSync(`${OUT}/${name}.png`, Buffer.from(png, "base64"));
    say(`   sheet: ${OUT}/${name}.png`);
  }
}

console.log(errors.length ? `\npage errors:\n  ${errors.slice(0, 3).join("\n  ")}` : "\nno page errors");
await browser.close();
