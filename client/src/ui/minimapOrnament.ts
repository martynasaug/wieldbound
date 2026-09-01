// THE IRONWORK THE MINIMAP IS MOUNTED IN.
//
// Asked for by reference: RuneScape frames its minimap with a pair of ornamental
// dragons whose heads sit up by the compass and whose bodies curl down around
// the ring. The map stops being a widget parked in a corner and becomes
// something mounted in a piece of metalwork.
//
// GENERATED, NOT DRAWN, because there is no artist on this project — the same
// reason the armour in `gear.ts` is built out of primitives rather than modelled.
// A hand-authored dragon would be a thousand characters of magic numbers nobody
// could adjust; these are shapes swept along arcs, which re-aim at any ring size
// from one argument and whose every proportion is a number with a name.
//
// WHAT THE FIRST VERSION GOT WRONG, recorded because the failure is general and
// entirely predictable in hindsight. It swept a SHORT arc with a THICK body,
// tapered it smoothly, and capped it with a rounded wedge. That was reported,
// accurately, as looking like two phalluses flanking the map. Silhouette is what
// fixes it, not detailing: long and thin, an angular jaw, horns, scale ribs to
// break the tube, and a curled tail so the far end is clearly an end.
//
// THREE STYLES, because the second attempt still read as ribbed banding with a
// head on it, and guessing again would have been a fourth blind iteration.
// `serpents` is the reference answer, `ironwork` is the safe one — volutes and
// rivets, which cannot accidentally look like an animal — and `both` mounts the
// serpents on the ironwork.
//
// Everything is in SVG user units with the ring's centre at the origin.

export type OrnamentStyle = "serpents" | "ironwork" | "both" | "none";

const f = (n: number): string => n.toFixed(2);

interface Pt {
  x: number;
  y: number;
}

const poly = (pts: Pt[]): string => `M ${pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" L ")} Z`;

// --- The serpents -----------------------------------------------------------

/**
 * The arc each body follows, in screen degrees where -90 is the top of the ring
 * and +90 the bottom.
 *
 * A long sweep down one side is most of what makes this read as a serpent rather
 * than a spur. The head sits at about ten and two o'clock: further up and it
 * covers the place-name plaque, which is the most useful text on the map.
 */
const HEAD_DEG = -56;
const SWEEP_DEG = 150;
const WIDTH_AT_NECK = 5.4;
const WIDTH_AT_TAIL = 1.1;
const MID_SWELL = 1.1;

interface Serpent {
  body: string;
  head: string;
  /** The dark line between the jaws. */
  mouth: string;
  nostril: Pt;
  ribs: string;
  spines: string;
  eye: Pt;
}

function serpent(radius: number, side: "left" | "right"): Serpent {
  const dir = side === "left" ? -1 : 1;
  const samples = 60;
  const ride = radius + 3;

  const at = (t: number) => {
    const a = ((HEAD_DEG + t * SWEEP_DEG) * Math.PI) / 180;
    const r = ride + Math.sin(t * Math.PI) * 2.2;
    return { x: Math.cos(a) * r * dir, y: Math.sin(a) * r, a };
  };
  const normal = (a: number): Pt => ({ x: Math.cos(a) * dir, y: Math.sin(a) });
  const tangent = (a: number): Pt => ({ x: -Math.sin(a) * dir, y: Math.cos(a) });
  const halfWidth = (t: number): number =>
    WIDTH_AT_NECK +
    (WIDTH_AT_TAIL - WIDTH_AT_NECK) * Math.pow(t, 0.8) +
    Math.sin(t * Math.PI) * MID_SWELL;

  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = at(t);
    const n = normal(p.a);
    const w = halfWidth(t);
    outer.push(`${f(p.x + n.x * w)},${f(p.y + n.y * w)}`);
    inner.push(`${f(p.x - n.x * w)},${f(p.y - n.y * w)}`);
  }
  inner.reverse();

  // The tail hooks rather than running out to a point — the blunt-end problem
  // again at the other end of the animal.
  const tp = at(1);
  const tn = normal(tp.a);
  const tt = tangent(tp.a);
  const curl =
    `M ${f(tp.x)},${f(tp.y)} ` +
    `C ${f(tp.x + tt.x * 9 - tn.x * 2)},${f(tp.y + tt.y * 9 - tn.y * 2)} ` +
    `${f(tp.x + tt.x * 11 - tn.x * 11)},${f(tp.y + tt.y * 11 - tn.y * 11)} ` +
    `${f(tp.x + tt.x * 2.5 - tn.x * 12)},${f(tp.y + tt.y * 2.5 - tn.y * 12)} ` +
    `C ${f(tp.x + tt.x * 6 - tn.x * 8)},${f(tp.y + tt.y * 6 - tn.y * 8)} ` +
    `${f(tp.x + tt.x * 6.5 - tn.x * 3)},${f(tp.y + tt.y * 6.5 - tn.y * 3)} ` +
    `${f(tp.x)},${f(tp.y)} Z`;

  const body = `M ${outer[0]} L ${outer.slice(1).join(" L ")} L ${inner.join(" L ")} Z ${curl}`;

  // THE HEAD, on the neck's own frame: `up` runs out of the neck away from the
  // body, `out` is radially outward from the ring.
  const h = at(0);
  const out = normal(h.a);
  const up = { x: -tangent(h.a).x, y: -tangent(h.a).y };
  const SCALE = 1.6;
  const LIFT = 5.5;
  const P = (alongUp: number, alongOut: number): Pt => ({
    x: h.x + up.x * alongUp * SCALE + out.x * (alongOut * SCALE + LIFT),
    y: h.y + up.y * alongUp * SCALE + out.y * (alongOut * SCALE + LIFT),
  });

  // THE HEAD IS BUILT FROM CONTRAST, NOT FROM OUTLINE.
  //
  // The version before this was five flat polygons in one flat gold, and it was
  // reported as basic and bland — correctly. At thirty pixels a silhouette alone
  // carries almost nothing; what makes a face read at that size is INTERNAL
  // edges. So this adds the things that cast their own line: a stepped muzzle
  // rather than a straight wedge, a jaw drawn as its own shape with a dark mouth
  // between the two, a jowl behind it, a nostril, a frill of spikes off the back
  // of the skull, and horns that CURVE — a straight wedge horn reads as a spike
  // glued on, while a curved one reads as grown.
  //
  // The muzzle is also shorter than the last attempt. Twenty-two units of snout
  // made a gharial; a stepped brow with a blunter nose is what says dragon.
  const skull = [
    P(-1, 5.0), P(4, 7.4), P(9, 7.0), P(12.5, 5.0), // brow, stepped down to the muzzle
    P(17, 4.2), P(19.5, 2.2), P(19, 0.2), // blunt nose
    P(13, -1.4), P(7, -2.6), P(0, -4.0), // upper lip back to the hinge
  ];
  // The lower jaw as its own mass, slightly proud of the upper lip so the mouth
  // is a line between two shapes rather than a notch cut into one.
  const jaw = [P(0.5, -3.6), P(6, -6.2), P(13, -5.6), P(18.5, -2.2), P(12, -2.0), P(4, -1.6)];
  // A jowl behind the jaw, which is what gives the head a back rather than
  // letting it dissolve into the neck.
  const jowl = [P(-3, 3.0), P(1, 1.0), P(2, -4.2), P(-4, -3.0)];
  const brow = [P(2, 5.2), P(7.5, 7.8), P(11, 6.2), P(6.5, 4.4)];
  const teeth = [
    [P(8.0, -2.7), P(8.7, -4.4), P(9.7, -2.6)],
    [P(11.5, -2.1), P(12.2, -3.8), P(13.2, -2.0)],
    [P(15.0, -1.4), P(15.7, -2.9), P(16.6, -1.3)],
  ];
  // A frill off the back of the skull: three spikes, longest in the middle.
  const frill = [
    [P(-1.5, 4.6), P(-9.0, 8.0), P(-4.0, 2.6)],
    [P(-2.5, 2.4), P(-11.0, 3.4), P(-3.5, 0.2)],
    [P(-2.5, 0.0), P(-9.5, -2.2), P(-3.0, -2.4)],
  ];
  const headPolys = [skull, jaw, jowl, brow, ...teeth, ...frill].map(poly);

  // CURVED HORNS, as swept bands rather than quads — the same tapering-offset
  // trick the body uses, on a short arc.
  const horn = (baseUp: number, baseOut: number, len: number, bend: number, thick: number): string => {
    const steps = 10;
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Sweeps back over the neck and lifts outward as it goes.
      const u = baseUp - len * t;
      const o = baseOut + bend * Math.sin(t * 1.5);
      const w = thick * (1 - 0.85 * t);
      a.push(`${f(P(u, o + w).x)},${f(P(u, o + w).y)}`);
      b.push(`${f(P(u, o - w).x)},${f(P(u, o - w).y)}`);
    }
    b.reverse();
    return `M ${a[0]} L ${a.slice(1).join(" L ")} L ${b.join(" L ")} Z`;
  };
  const head = [
    ...headPolys,
    horn(0.5, 5.0, 13, 6.5, 1.7),
    horn(-1.0, 2.4, 11, 3.0, 1.3),
  ].join(" ");

  const ribParts: string[] = [];
  for (let i = 4; i < samples - 4; i += 5) {
    const t = i / samples;
    const p = at(t);
    const n = normal(p.a);
    const w = halfWidth(t) * 0.86;
    ribParts.push(`M ${f(p.x - n.x * w)},${f(p.y - n.y * w)} L ${f(p.x + n.x * w)},${f(p.y + n.y * w)}`);
  }

  const spineParts: string[] = [];
  for (let i = 2; i < samples - 8; i += 6) {
    const t = i / samples;
    const p = at(t);
    const n = normal(p.a);
    const tg = tangent(p.a);
    const w = halfWidth(t);
    const a = { x: p.x + n.x * w - tg.x * 2.2, y: p.y + n.y * w - tg.y * 2.2 };
    const b = { x: p.x + n.x * w + tg.x * 2.2, y: p.y + n.y * w + tg.y * 2.2 };
    const tip = {
      x: p.x + n.x * (w + 4.6 - t * 2.6) - tg.x * 3.4,
      y: p.y + n.y * (w + 4.6 - t * 2.6) - tg.y * 3.4,
    };
    spineParts.push(`M ${f(a.x)},${f(a.y)} L ${f(tip.x)},${f(tip.y)} L ${f(b.x)},${f(b.y)} Z`);
  }

  // The mouth, as a dark stroke between the two jaw masses, and a nostril. These
  // two lines do more for the face than every polygon above them: they are the
  // only high-contrast detail at the size this is actually seen.
  const mouth =
    `M ${f(P(1.5, -3.4).x)},${f(P(1.5, -3.4).y)} ` +
    `Q ${f(P(9, -2.6).x)},${f(P(9, -2.6).y)} ${f(P(18, -1.6).x)},${f(P(18, -1.6).y)}`;
  const nostril = P(17.5, 2.2);
  return {
    body,
    head,
    mouth,
    nostril,
    ribs: ribParts.join(" "),
    spines: spineParts.join(" "),
    eye: P(6.5, 3.0),
  };
}

// --- The ironwork -----------------------------------------------------------

/**
 * A volute — the spiral scroll at the end of a piece of wrought iron.
 *
 * Swept the same way the serpent's body is, but along a spiral instead of an
 * arc: the radius falls away as it turns, so the band coils inward and thins as
 * it goes. Two back to back make a bracket, and four brackets on the diagonals
 * make a frame.
 */
function volute(originX: number, originY: number, angleDeg: number, scale: number, turn: number): string {
  const samples = 34;
  const a0 = (angleDeg * Math.PI) / 180;
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const r = scale * (1 - 0.45 * t);
    const a = a0 + turn * t * Math.PI * 0.82;
    const cx = originX + Math.cos(a) * r;
    const cy = originY + Math.sin(a) * r;
    const w = scale * (0.27 - 0.17 * t);
    outer.push(`${f(cx + Math.cos(a) * w)},${f(cy + Math.sin(a) * w)}`);
    inner.push(`${f(cx - Math.cos(a) * w)},${f(cy - Math.sin(a) * w)}`);
  }
  inner.reverse();
  return `M ${outer[0]} L ${outer.slice(1).join(" L ")} L ${inner.join(" L ")} Z`;
}

interface Ironwork {
  scrolls: string;
  rivets: Pt[];
}

function ironwork(radius: number): Ironwork {
  const scrolls: string[] = [];
  // Four brackets on the diagonals: the corners get the decoration and the
  // compass, the plaques and the orbs stay clear.
  for (const deg of [-135, -45, 45, 135]) {
    const a = (deg * Math.PI) / 180;
    const ox = Math.cos(a) * (radius + 1);
    const oy = Math.sin(a) * (radius + 1);
    scrolls.push(volute(ox, oy, deg - 90, radius * 0.175, 1));
    scrolls.push(volute(ox, oy, deg + 90, radius * 0.175, -1));
    // A bar joining the pair, which is what makes them one bracket rather than
    // two curls that happen to touch.
    const tx = -Math.sin(a);
    const ty = Math.cos(a);
    const w = radius * 0.03;
    const l = radius * 0.14;
    scrolls.push(
      poly([
        { x: ox + tx * l + Math.cos(a) * w, y: oy + ty * l + Math.sin(a) * w },
        { x: ox - tx * l + Math.cos(a) * w, y: oy - ty * l + Math.sin(a) * w },
        { x: ox - tx * l - Math.cos(a) * w, y: oy - ty * l - Math.sin(a) * w },
        { x: ox + tx * l - Math.cos(a) * w, y: oy + ty * l - Math.sin(a) * w },
      ]),
    );
  }

  // Rivets around the bezel, skipped where the compass, the readout and the orbs
  // already are.
  const rivets: Pt[] = [];
  const count = 24;
  for (let i = 0; i < count; i++) {
    const deg = -90 + (i / count) * 360;
    const near = (d: number) => Math.abs(((deg - d + 540) % 360) - 180) < 18;
    if (near(-90) || near(90) || near(0) || near(180)) continue;
    const a = (deg * Math.PI) / 180;
    const r = radius - 5.5;
    rivets.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return { scrolls: scrolls.join(" "), rivets };
}

// --- Assembly ---------------------------------------------------------------

const GOLD = "url(#mm-orn-gold)";
/**
 * Drawn under every filled shape, wider and almost black.
 *
 * Without it, gold ornament on a gold bezel is a shape nobody can see — which is
 * exactly what happened to the first legible version of the serpents: the form
 * was correct and it read as moulding because nothing separated it from the ring
 * behind it.
 */
const HALO = `stroke="#140d05" stroke-width="4.5" stroke-linejoin="round" fill="#140d05"`;

function serpentPiece(s: Serpent): string {
  return (
    `<path d="${s.spines}" ${HALO}/>` +
    `<path d="${s.body}" ${HALO}/>` +
    `<path d="${s.head}" ${HALO}/>` +
    `<path d="${s.spines}" fill="${GOLD}" stroke="#1b1207" stroke-width="0.8" stroke-linejoin="round"/>` +
    `<path d="${s.body}" fill="${GOLD}" stroke="#1b1207" stroke-width="1" stroke-linejoin="round"/>` +
    `<path d="${s.ribs}" fill="none" stroke="#6a4f21" stroke-width="0.85" stroke-linecap="round" opacity="0.75"/>` +
    `<path d="${s.head}" fill="${GOLD}" stroke="#1b1207" stroke-width="1" stroke-linejoin="round"/>` +
    `<path d="${s.mouth}" fill="none" stroke="#160e05" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="${f(s.nostril.x)}" cy="${f(s.nostril.y)}" r="1.15" fill="#241505"/>` +
    `<circle cx="${f(s.eye.x)}" cy="${f(s.eye.y)}" r="2.5" fill="#1c1005"/>` +
    `<circle cx="${f(s.eye.x)}" cy="${f(s.eye.y)}" r="1.25" fill="#ffd766"/>` +
    `<circle cx="${f(s.eye.x - 0.4)}" cy="${f(s.eye.y - 0.4)}" r="0.5" fill="#fff6d8"/>`
  );
}

function ironPiece(w: Ironwork): string {
  // A THINNER HALO THAN THE SERPENTS GET. The scrolls are narrow bands, and at
  // 4.5px the outline met itself across the middle of each coil and filled it
  // in — four dark blobs on the diagonals where there should have been gold
  // spirals. The serpent's body is three times as wide and does not have the
  // problem, which is why this is per-piece rather than one constant.
  const thin = `stroke="#140d05" stroke-width="2.2" stroke-linejoin="round" fill="none"`;
  return (
    `<path d="${w.scrolls}" ${thin}/>` +
    `<path d="${w.scrolls}" fill="${GOLD}" stroke="#1b1207" stroke-width="1" stroke-linejoin="round"/>` +
    w.rivets
      .map(
        (r) =>
          `<circle cx="${f(r.x)}" cy="${f(r.y)}" r="2.6" fill="#2a1d0b"/>` +
          `<circle cx="${f(r.x - 0.5)}" cy="${f(r.y - 0.6)}" r="1.4" fill="#e9c877"/>`,
      )
      .join("")
  );
}

/**
 * The whole ornament layer, as one SVG string ready to be dropped beside the
 * ring. `size` is the ring's outer diameter.
 */
export function ornamentSvg(size: number, style: OrnamentStyle = "serpents"): string {
  if (style === "none") return "";
  const radius = size / 2;
  // Room for horns, scrolls and the drop shadow, so nothing is clipped.
  const pad = 34;
  const box = size + pad * 2;
  const c = box / 2;

  let inner = "";
  if (style === "ironwork" || style === "both") inner += ironPiece(ironwork(radius));
  if (style === "serpents" || style === "both") {
    inner += serpentPiece(serpent(radius, "left")) + serpentPiece(serpent(radius, "right"));
  }

  return (
    `<svg class="mm-orn" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}" aria-hidden="true">` +
    `<defs>` +
    `<linearGradient id="mm-orn-gold" x1="0" y1="0" x2="0.35" y2="1">` +
    `<stop offset="0" stop-color="#f6dfa8"/>` +
    `<stop offset="0.4" stop-color="#c69c46"/>` +
    `<stop offset="0.72" stop-color="#7c5c25"/>` +
    `<stop offset="1" stop-color="#4a3616"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<g transform="translate(${c} ${c})">${inner}</g>` +
    `</svg>`
  );
}
