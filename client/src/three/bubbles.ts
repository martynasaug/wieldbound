// Speech bubbles — what somebody just said, over their head.
//
// NOT A FLOATER, though it borrows the one idea that matters from them: a thing
// anchored to a world position has to be re-projected every frame, or it hangs
// over empty grass the moment the camera moves. Everything else about the two
// is different. Combat text rises, fans out to avoid its neighbours, scales
// with how much the hit mattered and is gone in under a second, because it is
// reporting an EVENT. A line of speech holds still, wraps, and stays long
// enough to read, because it is reporting a PERSON.
//
// Bending `floaters.ts` to do both would have meant a "does not rise" flag, a
// "does not fan" flag and a "does not scale" flag on a system whose three
// behaviours are exactly those — which is not reuse, it is a second class
// wearing the first one's constructor.
//
// ONE BUBBLE PER SPEAKER. A second line from the same person replaces the
// first rather than stacking under it: two bubbles over one head is a column
// that covers whoever is standing behind them, and the newer line is the one
// worth reading anyway.

const BUBBLE_MS = 7000;
/** Fade at the end rather than vanishing, so a line does not blink out mid-read. */
const FADE_MS = 700;
/**
 * How far above the anchor's own origin the tail sits, in world units.
 *
 * ABOVE THE NAMEPLATE, which is what 2.1 was not: the first version put the
 * bubble exactly where a player's own plate hangs, so the speaker's name was
 * printed twice in the same square of screen, overlapping itself. Floating
 * combat text over a player uses 3.2 and clears the plate comfortably, so the
 * bubble sits just above that band.
 */
const HEAD_Y = 3.5;

const STYLE = `
#chat-bubbles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
#chat-bubbles .bubble {
  position: absolute;
  /* Anchored by its BOTTOM CENTRE, because the thing it is attached to is
     below it — translate(-50%, -100%) puts the tail on the head rather than
     the box's middle on the head. */
  transform: translate(-50%, -100%);
  max-width: 260px;
  padding: 5px 9px;
  border-radius: 9px;
  background: rgba(24, 19, 12, 0.92);
  border: 1px solid rgba(214, 176, 106, 0.55);
  color: #f0e6cc;
  font: 12px/1.4 Georgia, serif;
  text-align: center;
  /* Long words, pasted URLs and somebody leaning on one key all have to stay
     inside the box rather than widening it past the screen. */
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  text-shadow: 0 1px 2px #000;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  transition: opacity 120ms linear;
}
#chat-bubbles .bubble .who {
  display: block;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: #d6b06a;
  margin-bottom: 1px;
}
/* The tail. A rotated square rather than a border triangle so it can carry the
   same 1px edge as the box and read as one shape. */
#chat-bubbles .bubble::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  background: rgba(24, 19, 12, 0.92);
  border-right: 1px solid rgba(214, 176, 106, 0.55);
  border-bottom: 1px solid rgba(214, 176, 106, 0.55);
  transform: rotate(45deg);
}
`;

export interface BubbleAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Bubble {
  el: HTMLElement;
  anchor: BubbleAnchor;
  born: number;
}

export class ChatBubbles {
  private readonly root: HTMLElement;
  /** Keyed by speaker id — see the note at the top about one per head. */
  private readonly live = new Map<string, Bubble>();

  constructor(parent: HTMLElement) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "chat-bubbles";
    parent.appendChild(this.root);
  }

  /**
   * Put a line over somebody's head.
   *
   * `anchor` is the live actor position object rather than a copy of its
   * coordinates, so the bubble follows a speaker who walks away mid-sentence.
   * Passing a snapshot here would leave the words hanging where they were said,
   * which is a ghost rather than a person talking.
   */
  say(speakerId: string, name: string, text: string, anchor: BubbleAnchor): void {
    const existing = this.live.get(speakerId);
    if (existing) existing.el.remove();

    const el = document.createElement("div");
    el.className = "bubble";
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = name;
    el.appendChild(who);
    // `textContent`, never `innerHTML`: this string came off the wire from
    // another player, and the one thing it must never be is markup.
    el.appendChild(document.createTextNode(text));
    this.root.appendChild(el);

    this.live.set(speakerId, { el, anchor, born: performance.now() });
  }

  /** Drop a speaker's bubble — they logged out, or walked out of the world. */
  forget(speakerId: string): void {
    const b = this.live.get(speakerId);
    if (!b) return;
    b.el.remove();
    this.live.delete(speakerId);
  }

  update(project: (x: number, y: number, z: number) => { x: number; y: number } | null): void {
    const now = performance.now();
    for (const [id, b] of this.live) {
      const age = now - b.born;
      if (age >= BUBBLE_MS) {
        b.el.remove();
        this.live.delete(id);
        continue;
      }

      const screen = project(b.anchor.x, b.anchor.y + HEAD_Y, b.anchor.z);
      if (!screen) {
        // Behind the camera or off screen. Hidden rather than dropped, for the
        // same reason a floater is: the camera swings back constantly, and a
        // line that disappeared because the view moved reads as a lost message.
        b.el.style.opacity = "0";
        continue;
      }

      b.el.style.left = `${screen.x}px`;
      b.el.style.top = `${screen.y}px`;
      const fading = age > BUBBLE_MS - FADE_MS;
      b.el.style.opacity = fading ? `${(BUBBLE_MS - age) / FADE_MS}` : "1";
    }
  }
}
