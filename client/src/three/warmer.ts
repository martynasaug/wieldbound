import { loadModel } from "./assets";

// BACKGROUND ASSET WARMING.
//
// The stall this exists for, straight off the hitch reporter:
//
//   [hitch] 2914ms BETWEEN frames — not the render loop.
//
// Nearly three seconds, mid-fight, with nothing in the render loop to blame —
// because nothing in the render loop was responsible. Loading a glTF parses it
// synchronously on the main thread, and the game fetches models the first time
// it needs them: a monster kind coming into view (fixed in M70.36 by preloading
// all thirteen), and — still lazy until now — every WEAPON AND ARMOUR MODEL, the
// moment a drop is inspected or another player wearing one walks up.
//
// Two ways to fix that, and the obvious one is wrong. Awaiting them all during
// the loading screen would work and would add every item in the catalogue to a
// wait the player already sits through, for gear most characters will never
// hold. The set is small (27 item art models and 10 wardrobe donors) but the
// principle scales badly, and a loading screen is not free just because waiting
// is expected there.
//
// So: after the world is up, one model at a time, in whatever gaps the browser
// has spare. `requestIdleCallback` hands back a deadline and only fires when
// nothing else wants the thread, which is exactly the shape of this work —
// there is no hurry, and the only requirement is that it not land during a
// fight. Serialised rather than fired in parallel for the same reason: three
// parses at once is a three-parse stall, and the whole point is that no single
// pause is long enough to feel.
//
// This does NOT make parsing cheaper. It moves it to a moment when nobody is
// looking, which for a cost that cannot be removed is the entire available win.

/** Fallback for Safari, which still has no `requestIdleCallback`. A timeout is
 *  a worse guarantee — it can fire mid-frame — but a 200ms gap between models
 *  keeps even the unlucky case to one parse per stretch. */
function whenIdle(fn: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (ric) ric(fn);
  else setTimeout(fn, 200);
}

let queue: string[] = [];
let running = false;

/**
 * Queue models to be fetched and parsed whenever the browser is idle.
 *
 * Safe to call more than once and safe to call with names already loaded:
 * `loadModel` caches by name and returns the in-flight promise, so a model the
 * player reaches before the warmer does joins that fetch rather than starting a
 * second one — the warming can never make anything slower, only earlier.
 */
export function warmInBackground(names: Iterable<string>): void {
  for (const n of names) if (n && !queue.includes(n)) queue.push(n);
  if (running) return;
  running = true;
  const step = () => {
    const next = queue.shift();
    if (next === undefined) {
      running = false;
      return;
    }
    void loadModel(next)
      .catch(() => {
        // A model that fails here fails again where it is actually needed,
        // which already has a fallback. Warming must never be a source of
        // errors of its own.
      })
      .finally(() => whenIdle(step));
  };
  whenIdle(step);
}

/** What is still waiting, for diagnosis. */
export function warmQueueLength(): number {
  return queue.length;
}
