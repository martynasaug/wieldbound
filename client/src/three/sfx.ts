// Sound. The cues are the ones synthesised for the 2D client (see
// tools/art/build_sfx.ps1) — short chiptune blips, deliberately consistent.
//
// Two things this has to get right:
//
// 1. Rate limiting. Auto-attack plus a pack of monsters fires several results a
//    second, and stacked copies of the same cue turn into a buzz rather than a
//    hit. Each cue has a minimum gap.
// 2. Overlap. One HTMLAudioElement can only play once at a time, so a second
//    hit while the first is still sounding would cut it off. Each cue keeps a
//    small round-robin pool instead.

export type SfxName =
  | "swing" | "hit" | "crit" | "miss" | "hurt"
  | "die" | "gather" | "levelup" | "cast" | "heal";

const SFX_NAMES: SfxName[] = [
  "swing", "hit", "crit", "miss", "hurt", "die", "gather", "levelup", "cast", "heal",
];

const POOL_SIZE = 4;
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
};

class Cue {
  private pool: HTMLAudioElement[] = [];
  private next = 0;
  private lastPlayedAt = 0;

  constructor(private readonly name: SfxName) {}

  private ensure(): void {
    if (this.pool.length) return;
    for (let i = 0; i < POOL_SIZE; i++) {
      const el = new Audio(`/assets/sfx/${this.name}.wav`);
      el.preload = "auto";
      this.pool.push(el);
    }
  }

  play(volume: number): void {
    const now = performance.now();
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;
    this.ensure();
    const el = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, volume));
    // Browsers reject playback until the user has interacted with the page.
    // That is expected on the very first cue and is not worth surfacing.
    void el.play().catch(() => {});
  }
}

const cues = new Map<SfxName, Cue>();
let muted = false;
let master = 1;

export function playSfx(name: SfxName, volumeScale = 1): void {
  if (muted) return;
  let cue = cues.get(name);
  if (!cue) {
    cue = new Cue(name);
    cues.set(name, cue);
  }
  cue.play((VOLUME[name] ?? 0.4) * volumeScale * master);
}

export function toggleMuted(): boolean {
  muted = !muted;
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

export function setMasterVolume(v: number): void {
  master = Math.max(0, Math.min(1, v));
}

/** Warms the pools so the first swing is not silent while the file fetches. */
export function preloadSfx(): void {
  for (const name of SFX_NAMES) {
    if (!cues.has(name)) cues.set(name, new Cue(name));
  }
}
