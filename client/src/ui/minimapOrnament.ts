// THE TWO SERPENTS COILED AROUND THE MINIMAP.
//
// Asked for by reference: RuneScape frames its minimap with a pair of ornamental
// dragons whose heads sit up by the compass and whose bodies curl down around
// the ring. The map stops being a widget parked in a corner and becomes
// something mounted in a piece of ironwork.
//
// GENERATED, NOT DRAWN, because there is no artist on this project — the same
// reason the armour in `gear.ts` is built out of primitives rather than modelled.
// A hand-authored dragon would be a thousand characters of magic numbers nobody
// could adjust; this is a body swept along an arc, which re-aims at any ring
// size from one argument and whose every proportion is a number with a name.
//
// WHAT THE FIRST VERSION GOT WRONG, recorded because the failure is a general
// one and entirely predictable in hindsight. It swept a SHORT arc with a THICK
// body, tapered it smoothly, and capped it with a rounded wedge. A short thick
// smoothly-tapering form with a blunt rounded end does not read as a dragon. It
// was reported, accurately, as looking like two phalluses flanking the map.
//
// The silhouette is what fixes that, not the detailing:
//
//   LONG and THIN, not short and thick     — a serpent's proportions
//   ANGULAR jaw, opened, with teeth        — no rounded cap anywhere
//   HORNS raked back off the skull         — reads as a head at 12px
//   SEGMENTED with scale ribs              — breaks the smooth tube
//   a CURLED tail, not a tapered point     — an end that is clearly an end
//
// Everything is in SVG user units with the ring's centre at the origin.

/** One serpent's parts, as SVG path data. */
export interface Ornament {
  /** The body, from neck to curled tail. */
  body: string;
  /** Skull, jaws and horns — everything above the neck. */
  head: string;
  /** Scale ribs across the body, stroked rather than filled. */
  ribs: string;
  /** Spines along the outer edge. */
  spines: string;
  /** The eye, drawn on top in its own colour. */
  eye: { x: number; y: number; r: number };
}

/**
 * The arc the body follows, measured in screen degrees where -90 is the top of
 * the ring and +90 the bottom.
 *
 * A long sweep down one side is most of what makes this read as a serpent rather
 * than a spur: 150 degrees of arc against a body eleven units wide is a ratio of
 * about twenty to one. The gaps at top and bottom are where the compass and the
 * coordinate plaque live.
 */
const HEAD_DEG = -56;
const SWEEP_DEG = 150;

/** Half-widths along the body, neck to tail. Thin — see the note above. */
const WIDTH_AT_NECK = 5.4;
const WIDTH_AT_TAIL = 1.1;
const MID_SWELL = 1.1;

const f = (n: number): string => n.toFixed(2);

/**
 * Builds one serpent.
 *
 * `radius` is the ring's outer radius; the body rides just outside it. `side`
 * mirrors the whole thing, so the pair is one shape and its reflection rather
 * than two drawings that have to be kept in agreement.
 */
export function serpent(radius: number, side: "left" | "right"): Ornament {
  const dir = side === "left" ? -1 : 1;
  const samples = 60;
  const ride = radius + 3;

  const at = (t: number) => {
    const a = ((HEAD_DEG + t * SWEEP_DEG) * Math.PI) / 180;
    // A slight lift at the middle, so a constant-radius sweep does not read as
    // a rubber band stretched round the ring.
    const r = ride + Math.sin(t * Math.PI) * 2.2;
    return { x: Math.cos(a) * r * dir, y: Math.sin(a) * r, a, r };
  };
  // Radial normal, and the tangent in the direction of increasing t.
  const normal = (a: number) => ({ x: Math.cos(a) * dir, y: Math.sin(a) });
  const tangent = (a: number) => ({ x: -Math.sin(a) * dir, y: Math.cos(a) });

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

  // THE TAIL CURLS. A taper that simply runs out to a point is the blunt end
  // problem again at the other end of the animal; a hook says "this is a tail".
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

  // THE HEAD. Built on the neck's own frame: `up` runs out of the neck away from
  // the body, `out` is radially outward from the ring.
  const h = at(0);
  const out = normal(h.a);
  const up = { x: -tangent(h.a).x, y: -tangent(h.a).y };
  // HEAD_SCALE and HEAD_LIFT are the two numbers that decide whether this reads
  // as a creature or as moulding. At 1.0 and 0 the skull sat flush against a
  // bezel of the same gold and vanished into it — the shape was there and
  // nobody could see it. Bigger, and standing off the ring, gives it a
  // silhouette against the world behind.
  const HEAD_SCALE = 1.65;
  const HEAD_LIFT = 5.5;
  const P = (alongUp: number, alongOut: number) => ({
    x: h.x + up.x * alongUp * HEAD_SCALE + out.x * (alongOut * HEAD_SCALE + HEAD_LIFT),
    y: h.y + up.y * alongUp * HEAD_SCALE + out.y * (alongOut * HEAD_SCALE + HEAD_LIFT),
  });

  // Skull: a wedge, widest at the brow, narrowing to the snout. Angular on
  // purpose — every vertex here is a straight line to the next.
  const skull = [P(1, 6.5), P(7, 7.2), P(13.5, 3.4), P(15.5, -0.6), P(9, -3.2), P(1.5, -4.6)];
  // Lower jaw, hinged at the back and dropped open.
  const jaw = [P(2, -3.6), P(9.5, -5.2), P(15, -6.4), P(12.5, -2.6), P(5, -1.4)];
  // Two horns raked back over the neck.
  const hornA = [P(2.5, 6.4), P(-6.5, 10.5), P(-8.5, 8.2), P(0.5, 4.6)];
  const hornB = [P(0.5, 3.2), P(-7.5, 5.2), P(-8.5, 3.2), P(-1, 1.4)];
  // Three teeth along the upper jaw.
  const teeth = [
    [P(9.4, -3.1), P(9.9, -5.4), P(10.9, -3.0)],
    [P(11.6, -2.3), P(12.1, -4.6), P(13.1, -2.2)],
    [P(13.4, -1.2), P(13.9, -3.3), P(14.7, -1.1)],
  ];
  const poly = (pts: { x: number; y: number }[]): string =>
    `M ${pts.map((p) => `${f(p.x)},${f(p.y)}`).join(" L ")} Z`;
  const head = [skull, jaw, hornA, hornB, ...teeth].map(poly).join(" ");

  // SCALE RIBS. Short strokes across the body at intervals, which is what stops
  // it reading as a smooth tube.
  const ribParts: string[] = [];
  for (let i = 4; i < samples - 4; i += 5) {
    const t = i / samples;
    const p = at(t);
    const n = normal(t === 0 ? p.a : p.a);
    const w = halfWidth(t) * 0.86;
    ribParts.push(`M ${f(p.x - n.x * w)},${f(p.y - n.y * w)} L ${f(p.x + n.x * w)},${f(p.y + n.y * w)}`);
  }

  // SPINES along the outer edge, thinning toward the tail.
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

  const eyeAt = P(8.5, 2.2);
  return {
    body,
    head,
    ribs: ribParts.join(" "),
    spines: spineParts.join(" "),
    eye: { x: eyeAt.x, y: eyeAt.y, r: 1.5 },
  };
}

/**
 * The whole ornament layer, as one SVG string ready to be dropped beside the
 * ring. `size` is the ring's outer diameter.
 */
export function ornamentSvg(size: number): string {
  const radius = size / 2;
  // Room for horns, spines and the drop shadow, so nothing is clipped.
  const pad = 30;
  const box = size + pad * 2;
  const c = box / 2;
  const gold = "url(#mm-orn-gold)";
  const piece = (o: Ornament): string =>
    `<path d="${o.spines}" fill="${gold}" stroke="#1b1207" stroke-width="0.8" stroke-linejoin="round"/>` +
    `<path d="${o.body}" fill="${gold}" stroke="#1b1207" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="${o.ribs}" fill="none" stroke="#6a4f21" stroke-width="0.85" stroke-linecap="round" opacity="0.75"/>` +
    `<path d="${o.head}" fill="${gold}" stroke="#1b1207" stroke-width="1" stroke-linejoin="round"/>` +
    `<circle cx="${f(o.eye.x)}" cy="${f(o.eye.y)}" r="${o.eye.r}" fill="#2a1a08"/>` +
    `<circle cx="${f(o.eye.x)}" cy="${f(o.eye.y)}" r="${o.eye.r * 0.55}" fill="#ffd766"/>`;
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
    `<g transform="translate(${c} ${c})">${piece(serpent(radius, "left"))}${piece(serpent(radius, "right"))}</g>` +
    `</svg>`
  );
}
