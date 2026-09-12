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
  // And it must not be a hole either.
  minLuma: { min: 0.05, why: "a piece is too dark to read as anything" },
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
await page.evaluate(() => {
  const g = window.__wieldbound;
  g.world.dayNight.freeze(0.5);
  const a = g.localActor;
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
});
await page.waitForTimeout(1500);

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

/** Pixels, from the same frame the shots come from. */
async function sampleAround(meshFilter) {
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
    const front = [];
    {
      const p = piece.geometry.attributes.position;
      const v = new V();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(piece.matrixWorld);
        front.push(v.clone());
      }
      front.sort((m, n) => n.z - m.z);
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
    const r = armSpan * 0.22;
    const bodyRect = inset(project([
      armAt.clone().add(new V(-r, r, -r)),
      armAt.clone().add(new V(r, -r, r)),
    ]), 0.12);

    // Does any gear sit on the reference? Rectangles, in screen space.
    const overlaps = (p, q) =>
      p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
    let covered = false;
    a.root.traverse((o) => {
      if (covered || !o.isMesh) return;
      if (!o.name.startsWith("gear_") && !o.name.startsWith("hand_") && !o.name.startsWith("held_")) return;
      if (overlaps(bodyRect, inset(project(corners(o)), 0.05))) covered = true;
    });

    return {
      piece: pieceRect,
      body: bodyRect,
      referenceCovered: covered,
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
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let r = 0, g = 0, b = 0, n = 0, sky = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 2] > 150 && d[i + 2] > d[i] + 20) { sky++; continue; }
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      const total = d.length / 4;
      return { luma: n ? (0.2126 * r + 0.7152 * g + 0.0722 * b) / n / 255 : 0, covered: n / total, sky: sky / total };
    }, shot.toString("base64"));
  };
  const piece = await read(boxes.piece);
  const body = await read(boxes.body);
  return { piece, body, proud: boxes.proud };
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
      && !seen.referenceCovered;
    say(`   palette ${palette}; piece luma ${seen.piece.luma.toFixed(3)}, body ${seen.body.luma.toFixed(3)},` +
      ` coverage ${(seen.piece.covered * 100).toFixed(0)}%/${(seen.body.covered * 100).toFixed(0)}%` +
      (seen.referenceCovered ? "; REFERENCE IS UNDER GEAR" : ""));
    if (!verdict("measurement footing", footing,
      seen.referenceCovered
        ? "the bare-body reference is covered by gear — contrast cannot be measured here"
        : "windows on the character and a lit reference")) {
      say("   refusing to judge contrast on this frame");
    } else {
      const contrast = Math.abs(seen.piece.luma - seen.body.luma) / Math.max(seen.body.luma, 0.01);
      verdict("stands out from the body", contrast >= RULES.contrast.min,
        `contrast ${contrast.toFixed(2)}, need ${RULES.contrast.min} — ${RULES.contrast.why}`);
      verdict("not a black hole", seen.piece.luma >= RULES.minLuma.min,
        `luma ${seen.piece.luma.toFixed(3)}, need ${RULES.minLuma.min} — ${RULES.minLuma.why}`);
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
          bands.push(x1 > x0 ? +(x1 - x0).toFixed(3) : 0);
        }
        return { drop: +drop.toFixed(3), hem: bands[0], middle: bands[1], collar: bands[2] };
      });
      if (shape) {
        const taper = shape.hem / Math.max(shape.collar, 1e-6);
        say(`   fall ${shape.drop} tall: collar ${shape.collar}, middle ${shape.middle}, hem ${shape.hem}`);
        verdict("is a garment, not a sheet", taper >= RULES.taper.min,
          `hem is x${taper.toFixed(2)} the collar, need x${RULES.taper.min} — ${RULES.taper.why}`);
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
