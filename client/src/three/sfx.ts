// Sound cues. The samples are the ones synthesised for the 2D client (see
// tools/art/build_sfx.ps1) — short chiptune blips, deliberately consistent.
//
// THEY RUN ON THE SHARED GRAPH NOW. They used to be `HTMLAudioElement`s with a
// round-robin pool of four per cue, because one element can only play once at a
// time and a second hit while the first was sounding would cut it off. Decoded
// into buffers and played through `audio.ts` instead, that whole mechanism goes
// away: a buffer source is created per play, so there is no such thing as
// interrupting one, and there is nothing to pool.
//
// The reason for moving is not tidiness. `M` has to silence the WORLD as well
// as the cues, and two subsystems with two independent volumes is a mixer with
// a bug in it — one of them would keep playing. One master gain rules both.
//
// The rate limit stays. Auto-attack plus a pack of monsters fires several
// results a second, and stacked copies of one cue are a buzz rather than a hit;
// that was never about the elements.

import { audioContext, isMuted, sfxDestination } from "./audio";

export type SfxName =
  | "swing" | "hit" | "crit" | "miss" | "hurt"
  | "die" | "gather" | "levelup" | "cast" | "heal"
  // Release cues for the two weapon families that do not swing anything.
  | "bow" | "beam"
  // A pack's shout — the one cue with no swing, cast or hit behind it at all.
  | "alert";

const SFX_NAMES: SfxName[] = [
  "swing", "hit", "crit", "miss", "hurt", "die", "gather", "levelup", "cast", "heal",
  "bow", "beam", "alert",
];

const MIN_GAP_MS = 60;

// Per-cue mixing, so a crit reads as louder than the swing that preceded it
// without having to re-synthesise the samples.
const VOLUME: Partial<Record<SfxName, number>> = {
  swing: 0.28,
  miss: 0.22,
  hit: 0.4,
  crit: 0.55,
  hurt: 0.45,
  die: 0.5,
  levelup: 0.6,
  cast: 0.4,
  heal: 0.45,
  gather: 0.3,
  bow: 0.35,
  beam: 0.3,
  alert: 0.4,
};

const buffers = new Map<SfxName, AudioBuffer>();
const loading = new Set<SfxName>();
const lastPlayedAt = new Map<SfxName, number>();

/**
 * Fetches and decodes one cue.
 *
 * A cue that has not arrived yet is silent and asks for itself, which is the
 * behaviour the old pool had for the same reason: the very first swing of a
 * cold session is not worth a stall.
 */
function ensure(name: SfxName): AudioBuffer | null {
  const existing = buffers.get(name);
  if (existing) return existing;
  const ctx = audioContext();
  if (!ctx || loading.has(name)) return null;
  loading.add(name);
  void fetch(`/assets/sfx/${name}.wav`)
    .then((r) => r.arrayBuffer())
    .then((b) => ctx.decodeAudioData(b))
    .then((decoded) => {
      buffers.set(name, decoded);
    })
    .catch(() => {})
    .finally(() => loading.delete(name));
  return null;
}

export function playSfx(name: SfxName, volumeScale = 1): void {
  if (isMuted()) return;
  const now = performance.now();
  if (now - (lastPlayedAt.get(name) ?? -Infinity) < MIN_GAP_MS) return;

  const ctx = audioContext();
  const dest = sfxDestination();
  const buf = ensure(name);
  if (!ctx || !dest || !buf) return;
  lastPlayedAt.set(name, now);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, (VOLUME[name] ?? 0.4) * volumeScale));
  src.connect(gain);
  gain.connect(dest);
  src.start();
}

/** Warms the cache so the first swing is not silent while the file fetches. */
export function preloadSfx(): void {
  for (const name of SFX_NAMES) ensure(name);
}

// Mute and master volume live in `audio.ts` now, because they govern the world
// bed as well. Re-exported here so the several call sites that have imported
// them from this file since Phase 39 keep working.
export { isMuted, setMasterVolume, toggleMuted } from "./audio";
