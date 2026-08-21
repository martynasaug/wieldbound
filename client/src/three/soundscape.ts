// The world, out loud.
//
// This game has had sound since Phase 39 and has never had a SOUNDSCAPE. Twelve
// cues fire when something happens and the rest of the time the world is
// silent, which is the loudest remaining thing saying "this is a screen" rather
// than "this is outdoors" — the same sentence M54.1 wrote about grass that
// never moved, one sense across.
//
// EVERY BED IS DERIVED, LIKE THE HOUR AND THE WIND. Nothing here is sent, and
// the reason is the reason it always is: sound drives nothing the server
// resolves, so a message carrying it could arrive late or drift between two
// people standing in the same field. What you hear is a pure function of WHERE
// you are, WHEN it is, and how hard it is blowing — and all three of those are
// already agreed on by every client without a byte crossing the wire.
//
// **It reads the same tables the fauna does.** `forestStrengthAt`, `riverAt`,
// `nightAmount`: the butterflies over open meadow by day and the fireflies in
// the woods after dark answer those questions already, so the soundscape asking
// them too means what you hear and what you can see cannot be two different
// places. A wood at dusk is a different place to stand in, and it has been
// visibly different since Phase 54; now it is audibly different for the same
// reason and out of the same rule.
//
// **It is SYNTHESISED, not downloaded.** Every cue in this game is (see
// `tools/art/build_sfx.ps1`), every texture in town is, and every building is —
// and the argument is the same one Phase 49 made about a downloaded building
// standing in front of Quaternius pines. A field recording of English woodland
// would arrive in a different stylisation from the chiptune blip a sword makes,
// and would be a download measured in megabytes for a bed that is four filters
// over one buffer of noise.
//
// **And it is a floor, never an event.** The whole bus sits well under the
// cues, everything ramps rather than switching, and no bed has a transient in
// it loud enough to be mistaken for something happening. Ambient audio that
// draws attention has failed at its only job.

import {
  ambientDestination,
  audioContext,
  audioRunning,
  noiseSource,
} from "./audio";
import { forestStrengthAt } from "../../../shared/forests";
import { riverAt, RIVER_HALF_WIDTH_PX } from "../../../shared/river";
import { roadTorches } from "../../../shared/road";
import {
  SMITHY_ANGLE_DEG,
  SMITHY_RADIUS_PX,
  TOWN_CENTER,
  TOWN_PROPS,
  propPosition,
} from "../../../shared/town";

/**
 * How long a bed takes to follow a change in the world.
 *
 * Slow on purpose, and it is the single most important number in the file. A
 * bed that tracked position tightly would be a volume knob turning as you walk,
 * which the ear hears as a mechanism; at three quarters of a second the river
 * simply gets closer.
 */
const FOLLOW_S = 0.75;

/** How far a fire carries, in server pixels. About thirty world units. */
const FIRE_RANGE_PX = 1200;
/** And the water, which is much bigger and carries further. */
const WATER_RANGE_PX = 1700;

/** Everything a bed needs to know about where the listener is standing. */
export interface Listening {
  /** The player, in SERVER pixels — the units every world table here speaks. */
  sx: number;
  sy: number;
  /** 0 by day, 1 in the small hours. The same value the lanterns come on by. */
  night: number;
  /** WIND_MIN..WIND_MAX, from the shared wind. */
  windStrength: number;
}

/**
 * One bed: a loop of noise, one or two filters, and a gain that is ramped.
 *
 * Everything outdoors that is not an event is this shape — wind, leaves, water,
 * fire. What separates them is entirely the filter, which is the point: they
 * are the same air moving and the difference is what it is moving through.
 */
class NoiseBed {
  private readonly gain: GainNode;
  private readonly filter: BiquadFilterNode;

  constructor(
    ctx: AudioContext,
    out: AudioNode,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    second?: { type: BiquadFilterType; frequency: number; q: number },
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(out);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = frequency;
    this.filter.Q.value = q;

    if (second) {
      const b = ctx.createBiquadFilter();
      b.type = second.type;
      b.frequency.value = second.frequency;
      b.Q.value = second.q;
      this.filter.connect(b);
      b.connect(this.gain);
    } else {
      this.filter.connect(this.gain);
    }

    const src = noiseSource();
    src?.connect(this.filter);
  }

  private lastLevel = -1;
  private lastCutoff = -1;

  /**
   * Ramps toward a level. Never sets one — see `FOLLOW_S`.
   *
   * Only when the target has actually MOVED, which matters more than it looks:
   * this is called from the render loop, so an unguarded version schedules six
   * automation events a frame for ever, and an AudioParam's event list is a
   * list. Standing still is the common case and it should cost nothing.
   */
  set(ctx: AudioContext, level: number, cutoffHz?: number): void {
    const target = Math.max(0, level);
    if (Math.abs(target - this.lastLevel) > 0.0015) {
      this.lastLevel = target;
      this.gain.gain.setTargetAtTime(target, ctx.currentTime, FOLLOW_S);
    }
    if (cutoffHz !== undefined && Math.abs(cutoffHz - this.lastCutoff) > 4) {
      this.lastCutoff = cutoffHz;
      this.filter.frequency.setTargetAtTime(cutoffHz, ctx.currentTime, FOLLOW_S);
    }
  }
}

/**
 * The cricket chorus: three gated tones, and the gating is the whole thing.
 *
 * A cricket is not a pitch, it is a RATE — a hard on-off at twenty-odd hertz,
 * which is why a square wave driving a gain sounds like one and a tremolo does
 * not. Three voices at rates that are not multiples of each other, so the
 * chorus drifts in and out of phase with itself for ever instead of pulsing
 * together, which is what a field of them actually does.
 */
class Crickets {
  private readonly out: GainNode;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);

    const voices: [number, number][] = [
      [3900, 18.3],
      [4300, 21.7],
      [4750, 25.1],
    ];
    for (const [hz, rate] of voices) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;

      // The gate. Offset to half depth and swung the full depth by the LFO, so
      // the product runs 0..1 rather than -1..1 — a gain that went negative
      // would simply invert the tone, which is inaudible and wastes half the
      // modulation.
      const gate = ctx.createGain();
      gate.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth);
      depth.connect(gate.gain);
      lfo.start();

      // A little of the tone, three times over. A single voice at full level is
      // a smoke alarm; three at a third of it is a hedgerow.
      const trim = ctx.createGain();
      trim.gain.value = 0.34;

      osc.connect(gate);
      gate.connect(trim);
      trim.connect(this.out);
      osc.start();
    }
  }

  private lastLevel = -1;

  /** Same guard as `NoiseBed.set`, and for the same reason. */
  set(ctx: AudioContext, level: number): void {
    const target = Math.max(0, level);
    if (Math.abs(target - this.lastLevel) <= 0.0005) return;
    this.lastLevel = target;
    this.out.gain.setTargetAtTime(target, ctx.currentTime, FOLLOW_S);
  }
}

/**
 * Birdsong: scheduled events rather than a bed, because that is what it is.
 *
 * Everything else in this file is continuous and can be a filter over noise.
 * A bird is a thing that happens, with silence either side of it, and the
 * silence is most of what makes it read as one bird somewhere rather than as an
 * atmosphere track. Two calls, chosen by where you are standing: a fast rising
 * trill in the open and a slow two-note in a wood, which is the same distinction
 * the fauna table draws between a meadow and a canopy.
 */
class Birds {
  private readonly out: GainNode;
  private nextAt = 0;

  constructor(private readonly ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest);
  }

  /** `rate` is calls per second at the current place and hour. Zero is silence. */
  update(now: number, rate: number, inWood: boolean, level: number): void {
    if (rate <= 0 || level <= 0.001) {
      // Pushed forward rather than left in the past, so walking out of a wood
      // at dusk and back in at dawn does not fire a backlog of calls at once.
      this.nextAt = now + 2;
      return;
    }
    if (now < this.nextAt) return;
    // Exponential gaps, so the calls are not a metronome. A fixed interval with
    // jitter still has a beat in it; a Poisson process does not.
    this.nextAt = now + (-Math.log(1 - Math.random()) / rate);
    this.chirp(inWood, level);
  }

  private chirp(inWood: boolean, level: number): void {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = inWood ? 2 : 3 + Math.floor(Math.random() * 3);
    const step = inWood ? 0.16 : 0.055;
    const base = (inWood ? 900 : 2200) * (0.9 + Math.random() * 0.25);

    for (let i = 0; i < notes; i++) {
      const at = t + i * step;
      const osc = ctx.createOscillator();
      osc.type = inWood ? "sine" : "triangle";
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      g.connect(this.out);

      // A bird's note SLIDES. A flat tone at any frequency is a beep, and the
      // slide is cheap: two setValueAtTime calls and a ramp.
      const from = base * (inWood ? 1 : 1 + i * 0.08);
      const to = from * (inWood ? 0.78 : 1.35);
      const dur = inWood ? 0.13 : 0.042;
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(to, at + dur);

      const peak = level * (inWood ? 0.16 : 0.1) * (0.7 + Math.random() * 0.5);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + dur * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur * 1.6);

      osc.start(at);
      osc.stop(at + dur * 2);
    }
  }
}

/**
 * Where the nearest fire is, in server pixels, and how much of it is burning.
 *
 * Read off the SAME tables the flames are placed from rather than registered by
 * whatever draws them — the braziers and the smithy out of `shared/town.ts`,
 * the road's torches out of `shared/road.ts`. A registry would be a second list
 * that agrees on the day it is written; this cannot disagree, and it also works
 * before either of those has finished loading its models.
 *
 * The braziers and the torches are weighted by NIGHT, because that is when they
 * are lit — a fade rather than a threshold, so nobody has to keep a second
 * opinion about the hour the lamps come on. The forge burns at every hour,
 * because there is a smith standing at it at every hour.
 */
function firePresence(sx: number, sy: number, night: number): number {
  let best = 0;

  const consider = (fx: number, fy: number, weight: number): void => {
    if (weight <= 0) return;
    const d = Math.hypot(sx - fx, sy - fy);
    if (d >= FIRE_RANGE_PX) return;
    const falloff = 1 - d / FIRE_RANGE_PX;
    const v = falloff * falloff * weight;
    if (v > best) best = v;
  };

  const rad = (SMITHY_ANGLE_DEG * Math.PI) / 180;
  consider(
    TOWN_CENTER.x + Math.cos(rad) * SMITHY_RADIUS_PX,
    TOWN_CENTER.y + Math.sin(rad) * SMITHY_RADIUS_PX,
    1,
  );

  for (const prop of TOWN_PROPS) {
    if (!prop.id.startsWith("brazier")) continue;
    const p = propPosition(prop);
    consider(p.x, p.y, night);
  }

  // The road's torches are four kilometres of them, and only the handful within
  // range can matter — but the list is fourteen entries, so walking it is
  // cheaper than any structure that would avoid walking it.
  for (const torch of roadTorches()) {
    consider(torch.x, torch.y, night);
  }

  return best;
}

export class Soundscape {
  private wind: NoiseBed | null = null;
  private gust: NoiseBed | null = null;
  private leaves: NoiseBed | null = null;
  private water: NoiseBed | null = null;
  private fire: NoiseBed | null = null;
  private crickets: Crickets | null = null;
  private birds: Birds | null = null;
  private built = false;

  /**
   * Builds the graph, once, and only once the context is actually running.
   *
   * Deliberately lazy rather than constructed with the game: a bed started
   * against a suspended context begins its loop at time zero and arrives
   * mid-buffer when the context resumes, and an oscillator started against one
   * never runs at all.
   */
  private build(): boolean {
    if (this.built) return true;
    if (!audioRunning()) return false;
    const ctx = audioContext();
    const dest = ambientDestination();
    if (!ctx || !dest) return false;

    // Wind: a lowpass whose corner opens as it blows harder, which is what
    // actually makes a gust read as a gust. Level alone reads as somebody
    // turning it up.
    this.wind = new NoiseBed(ctx, dest, "lowpass", 500, 0.7);
    // And the whistle over the top of it, which only exists in a real blow.
    this.gust = new NoiseBed(ctx, dest, "bandpass", 780, 2.6);
    // Leaves are the same air two octaves up. Under a canopy the wind is quieter
    // and the leaves are the whole sound, which is the handover this pair is for.
    this.leaves = new NoiseBed(ctx, dest, "bandpass", 2600, 0.8);
    // Water: a band, not a hiss. Everything below 300 is a rumble the Coldwater
    // does not have and everything above 2k is rain.
    this.water = new NoiseBed(ctx, dest, "highpass", 320, 0.6, {
      type: "lowpass",
      frequency: 2100,
      q: 0.8,
    });
    // Fire is the opposite end: a low roar with the top taken off it.
    this.fire = new NoiseBed(ctx, dest, "lowpass", 760, 0.9);

    this.crickets = new Crickets(ctx, dest);
    this.birds = new Birds(ctx, dest);

    this.built = true;
    return true;
  }

  /**
   * One frame.
   *
   * Everything here is a pure function of the argument — which is what makes it
   * testable, and is the same property that lets two players standing in one
   * field hear the same thing.
   */
  update(at: Listening): void {
    if (!this.build()) return;
    const ctx = audioContext();
    if (!ctx) return;

    const canopy = forestStrengthAt(at.sx, at.sy);
    const river = riverAt(at.sx, at.sy).distancePx;
    const wet = Math.max(
      0,
      1 - Math.max(0, river - RIVER_HALF_WIDTH_PX) / WATER_RANGE_PX,
    );
    // 0 at the floor of the wind's range and 1 at the top, so every bed below is
    // written against "how hard is it blowing" rather than against a raw gain.
    const blow = Math.max(0, Math.min(1, (at.windStrength - 0.34) / 0.66));

    // A wood is SHELTERED, and that is the whole reason these two are a pair:
    // the open wind drops away as the canopy closes and comes back as the sound
    // of the leaves, so walking into Blackstand is a change rather than an
    // addition. Same shape as the butterflies handing over to the fireflies.
    this.wind!.set(ctx, (0.055 + blow * 0.2) * (1 - canopy * 0.5), 420 + blow * 1100);
    // Cubed, so the whistle is genuinely only in the top of the range. A linear
    // one is present at every strength and stops meaning anything.
    this.gust!.set(ctx, blow * blow * blow * 0.075);
    this.leaves!.set(ctx, canopy * (0.05 + blow * 0.28) * 0.85);
    this.water!.set(ctx, wet * wet * 0.3);
    this.fire!.set(ctx, firePresence(at.sx, at.sy, at.night) * 0.24);

    // The night chorus, over open ground and in the woods and not over the
    // water, and only once it is genuinely dark. Deliberately the same shape as
    // the fireflies' own presence curve, which starts late and comes up fast.
    const dark = Math.max(0, at.night * 1.5 - 0.35);
    this.crickets!.set(ctx, Math.min(1, dark) * (1 - wet * 0.7) * 0.055);

    // And the day one. Twice as often in a wood as in the open, which is true
    // and is also the only way the two calls get heard often enough to be
    // recognised as two.
    const day = Math.max(0, 1 - at.night * 1.9);
    const inWood = canopy > 0.3;
    this.birds!.update(
      ctx.currentTime,
      day * (inWood ? 0.5 : 0.22),
      inWood,
      day,
    );
  }
}
