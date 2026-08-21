// One audio graph, for everything this game makes a noise with.
//
// Sound in this project has been twelve baked WAVs played through
// `HTMLAudioElement` since Phase 39, and that was the right call for what it
// had to do: a swing, a hit, a level-up. Twelve one-shots need no mixer.
//
// What they cannot do is be a PLACE. An ambient bed has to be continuous, it
// has to change while it is playing — a gust rising, a river getting closer —
// and it has to be quiet enough to sit underneath a fight without ever
// competing with it. None of that is expressible as "start a file". So there is
// a real graph now, and the one-shots move onto it too rather than running
// alongside it, because two systems with two independent volumes is a mixer
// with a bug in it: pressing M would silence one of them.
//
// THREE THINGS THIS FILE OWNS.
//
// **The context, and when it is allowed to exist.** Browsers refuse to start
// audio until the user has interacted with the page, and a context created
// before that starts `suspended` and stays there. The game has exactly the
// right moment for it — the Play button — so the context is created on demand
// and resumed from the first gesture, and everything upstream is written to be
// safe before that happens rather than to check.
//
// **The busses.** One master, and under it one bus for cues and one for the
// world. They are separate because they are mixed against different things: a
// cue is an event the player caused and has to land, and the world is a floor
// under everything that must never be the reason a hit is not heard. The
// ambient bus is deliberately capped well below the cue bus.
//
// **Fades, rather than switches.** Nothing here is ever set; everything is
// ramped. An ambient bed that snapped on when you crossed a line would be the
// loudest event in the soundscape, which is the exact opposite of its job.

/** How long a master change takes. Short enough to feel like a control. */
const MASTER_RAMP_S = 0.12;

/** Everything the world makes, relative to the cues. A floor, not a feature. */
const AMBIENT_TRIM = 0.5;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let ambientBus: GainNode | null = null;
let noise: AudioBuffer | null = null;

/**
 * Remembered, like the camera's distance and every minimap preference.
 *
 * Somebody who turns the sound off and reloads has not asked to be asked again,
 * and now that there is a continuous bed rather than twelve occasional blips
 * that is a much bigger difference than it was. Wrapped in a try for the same
 * reason the camera's is: a remembered convenience must never be able to stop
 * the game starting.
 */
const STORAGE_KEY = "wieldbound.audio";

function loadPrefs(): { muted: boolean; volume: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      // Merged over the defaults rather than trusted, exactly as the minimap's
      // blob is: a stored object from an older build is missing whatever has
      // been added since, and a new setting arriving as `undefined` in code
      // that assumes a number is worse than no setting at all.
      const p = JSON.parse(raw) as Partial<{ muted: boolean; volume: number }>;
      return {
        muted: typeof p.muted === "boolean" ? p.muted : false,
        volume: typeof p.volume === "number" ? Math.max(0, Math.min(1, p.volume)) : 1,
      };
    }
  } catch {
    // No storage, or a corrupt blob. Either way the defaults are fine.
  }
  return { muted: false, volume: 1 };
}

function savePrefs(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, volume }));
  } catch {
    // Private browsing, a full quota. Not worth a word to the player.
  }
}

const prefs = loadPrefs();
let muted = prefs.muted;
let volume = prefs.volume;

/**
 * The context, created on first use.
 *
 * Returns null where there is no Web Audio at all — a headless run with the API
 * stubbed out, or a browser old enough not to have it. Every caller in this
 * file and the next is written to do nothing in that case rather than to guard,
 * because sound is the one subsystem whose total absence must not stop the
 * game starting.
 */
export function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(master);

  ambientBus = ctx.createGain();
  ambientBus.gain.value = AMBIENT_TRIM;
  ambientBus.connect(master);

  // A debug handle, alongside `__wieldbound` and `__wieldboundLoad`, and for a
  // stronger reason than either: an audio graph is the one part of this project
  // with NOTHING on screen. "Is it running", "is the bed actually producing
  // anything" and "is it the wind or the water" are three questions no
  // screenshot can answer, and a probe that cannot tap the bus can only listen,
  // which is not a measurement.
  (window as unknown as Record<string, unknown>).__wieldboundAudio = {
    context: () => ctx,
    master: () => master,
    sfx: () => sfxBus,
    ambient: () => ambientBus,
    state: () => ctx?.state ?? "none",
  };

  return ctx;
}

/** Where a one-shot cue goes. */
export function sfxDestination(): GainNode | null {
  audioContext();
  return sfxBus;
}

/** And where the world goes. */
export function ambientDestination(): GainNode | null {
  audioContext();
  return ambientBus;
}

/**
 * Called from the first real gesture — the Play button.
 *
 * `resume` is a promise and is deliberately not awaited by anybody: a context
 * that takes a moment to start costs the first frame of ambience and nothing
 * else, and making the caller wait on the audio device to show a world would be
 * a strange trade.
 */
export function unlockAudio(): void {
  const c = audioContext();
  if (c && c.state !== "running") void c.resume().catch(() => {});
}

/** True while the graph is actually producing sound. */
export function audioRunning(): boolean {
  return !!ctx && ctx.state === "running";
}

function applyMaster(): void {
  if (!ctx || !master) return;
  const target = muted ? 0 : volume;
  // Ramped, never set. `setTargetAtTime` rather than a linear ramp because it
  // needs no end time and therefore cannot be left half-applied by a second
  // change arriving in the middle of the first.
  master.gain.setTargetAtTime(target, ctx.currentTime, MASTER_RAMP_S);
}

export function toggleMuted(): boolean {
  muted = !muted;
  applyMaster();
  savePrefs();
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

export function setMasterVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  applyMaster();
  savePrefs();
}

export function masterVolume(): number {
  return volume;
}

/**
 * A shared loop of noise, which is what most of a soundscape is made of.
 *
 * WHITE noise filtered down is the obvious construction and it is thin: white
 * noise has equal energy per hertz, so a lowpass over it throws away most of
 * what was there and what is left hisses. This is closer to PINK — equal energy
 * per octave — built with the standard Voss-style running sum, which puts the
 * weight at the bottom where wind and water actually live.
 *
 * Four seconds and looped. Long enough that the loop point is not a rhythm, and
 * one buffer serves every bed in the game because each one filters it
 * differently and starts at its own offset.
 */
export function noiseBuffer(): AudioBuffer | null {
  const c = audioContext();
  if (!c) return null;
  if (noise) return noise;

  const seconds = 4;
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);

  // Seven octaves of running average. b0..b6 update at halving rates, so the
  // sum has energy spread evenly across octaves rather than piled at the top.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }

  // THE SEAM. A buffer looped end to end clicks unless the two ends meet, and a
  // click every four seconds is a metronome nobody can find. The last tenth of
  // a second crossfades into the first.
  const tail = Math.floor(c.sampleRate * 0.1);
  for (let i = 0; i < tail; i++) {
    const t = i / tail;
    const j = n - tail + i;
    data[j] = data[j] * (1 - t) + data[i] * t;
  }

  noise = buf;
  return noise;
}

/**
 * A looping noise source, started immediately at a random offset.
 *
 * The offset matters: six beds all reading the same buffer from sample zero
 * would be six filtered copies of one signal, which correlate and comb rather
 * than sum.
 */
export function noiseSource(): AudioBufferSourceNode | null {
  const c = audioContext();
  const buf = noiseBuffer();
  if (!c || !buf) return null;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start(0, Math.random() * buf.duration);
  return src;
}
