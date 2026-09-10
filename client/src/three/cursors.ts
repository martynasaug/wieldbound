// What the pointer says about the thing under it.
//
// The world already answers "what would a click take" with a ground ring, and
// that ring is on the GROUND — you read it by looking away from where you are
// pointing. The cursor is where the eye already is, and it is the one piece of
// interface that can say what kind of thing this is before you commit to
// clicking it. A tree and a slime are both "something under the pointer" until
// something distinguishes them.
//
// AN ARROW WITH A BADGE, NOT A TOOL-SHAPED CURSOR.
//
// The obvious design is to replace the pointer with an axe or a sword. It reads
// well in a screenshot and badly in the hand: the hotspot — the single pixel a
// click actually uses — stops being visible, so aiming at a small bush behind a
// fence becomes guesswork. Keeping the arrow and hanging a small glyph off it
// keeps the point precise and still names the verb. It is what desktop software
// has done for copy, link and no-drop for thirty years, for the same reason.
//
// Drawn as SVG data URIs rather than PNG files: they are a few hundred bytes,
// they need no build step or fetch, and they cannot arrive late — a cursor that
// loads a frame after the pointer moves over a target is worse than no cursor.

/** What the pointer is currently over. */
export type CursorKind = "default" | "attack" | "tree" | "rock" | "bush" | "talk";

/**
 * The arrow, shared by every badged cursor.
 *
 * White with a dark outline, which is the only combination that survives both
 * the grass and a night sky — this world runs a full day cycle and a cursor
 * that vanishes at dusk is a cursor that fails exactly when the game is
 * hardest to read.
 */
const ARROW =
  '<path d="M3 2 L3 22 L8.5 17 L12 25 L15.5 23.2 L12.2 15.6 L19.5 15.2 Z" ' +
  'fill="#ffffff" stroke="#1c1a17" stroke-width="1.6" stroke-linejoin="round"/>';

/**
 * The badges, drawn in a 16x16 box that is placed at the arrow's lower right.
 *
 * Each is the TOOL FOR THE JOB rather than an abstract symbol, because the job
 * is already familiar: an axe means a tree without anyone being told, and a
 * sprig means the thing you pick. Bold shapes only — anything finer than about
 * two pixels of stroke turns to mush at cursor size on a standard display.
 */
const BADGES: Record<Exclude<CursorKind, "default">, string> = {
  // A blade, angled, with a crossguard. Red-tinted steel: this is the one badge
  // that means a fight, and it is worth being the only warm colour here.
  // A SWORD, and the first draft read as a diagonal scratch with a red dot.
  //
  // A blade drawn as a thin quad disappears at this size — what survives is
  // MASS plus the two features that make a sword a sword rather than a knife or
  // a stick: a crossguard wider than the blade, and a pommel closing the grip.
  // Both are drawn as separate bold strokes so they stay distinct when the
  // whole badge is sixteen pixels across.
  attack:
    // Blade: tip upper right, tapering into the guard.
    '<path d="M14.2 0.9 L15.9 2.6 L8.4 10.6 L5.9 11.4 L6.7 8.9 Z" ' +
    'fill="#e8e2d6" stroke="#1c1a17" stroke-width="1.4" stroke-linejoin="round"/>' +
    // Crossguard, deliberately overhanging the blade on both sides.
    '<path d="M4.2 7.9 L9.4 12.8" stroke="#c9a24a" stroke-width="2.6" stroke-linecap="round"/>' +
    // Grip and pommel.
    '<path d="M3.4 10.6 L5.6 12.7" stroke="#7a4a26" stroke-width="2.8" stroke-linecap="round"/>' +
    '<circle cx="2.4" cy="13.6" r="1.7" fill="#c4543f" stroke="#1c1a17" stroke-width="1.1"/>',
  // AN AXE, and the first draft of it was a shovel.
  //
  // A rounded blob on a stick is what an axe head becomes when it is drawn
  // symmetrically. What makes an axe an axe is the FLARE: a narrow throat where
  // it meets the haft opening out to a wide curved bit. Drawn large enough that
  // the curve survives, because at this size a subtle one is a smudge.
  tree:
    '<path d="M4 15 L10.5 5.5" stroke="#8a5a30" stroke-width="2.8" stroke-linecap="round"/>' +
    '<path d="M8.8 3.4 L12.8 2.4 C15.8 4.8 15.8 10 12.8 12.4 L8.8 8.6 Z" ' +
    'fill="#cfd4d8" stroke="#1c1a17" stroke-width="1.4" stroke-linejoin="round"/>',
  // A PICK, and the first draft of that was a sickle.
  //
  // One curved arc over a haft is a scythe. A pick is two points on opposite
  // sides of the haft, so this is a wide flat diamond crossing it near the top —
  // the silhouette everything from a mining icon to a road sign uses.
  rock:
    '<path d="M5.5 15.5 L10.5 4" stroke="#8a5a30" stroke-width="2.8" stroke-linecap="round"/>' +
    '<path d="M2.2 9.2 L14.4 3.2 L15.6 5.4 L3.4 11.4 Z" ' +
    'fill="#b9bec3" stroke="#1c1a17" stroke-width="1.4" stroke-linejoin="round"/>',
  // A sprig. Picking is not a tool job, so the badge is the thing itself.
  bush:
    '<path d="M8.5 15 L8.5 6" stroke="#5d7f3a" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M8.5 8 C5 8 3.5 6 3.5 3.5 C6.5 3.5 8.5 5 8.5 8 Z" fill="#74ad4c" stroke="#1c1a17" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<path d="M8.5 10 C12 10 13.5 8 13.5 5.5 C10.5 5.5 8.5 7 8.5 10 Z" fill="#8fc45f" stroke="#1c1a17" stroke-width="1.2" stroke-linejoin="round"/>',
  // Speech, for the people you can talk to.
  talk:
    '<path d="M2 3.5 h13 a1.5 1.5 0 0 1 1.5 1.5 v5 a1.5 1.5 0 0 1 -1.5 1.5 h-7 L4 15 v-3.5 h-2 a1.5 1.5 0 0 1 -1.5 -1.5 v-5 A1.5 1.5 0 0 1 2 3.5 Z" ' +
    'fill="#f0d9a8" stroke="#1c1a17" stroke-width="1.3" stroke-linejoin="round"/>',
};

function build(kind: Exclude<CursorKind, "default">): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">' +
    ARROW +
    `<g transform="translate(20 20)">${BADGES[kind]}</g>` +
    "</svg>";
  // The hotspot is the arrow's own point, at (3, 2) in the viewBox — NOT the
  // middle of the image. Getting this wrong is invisible in a screenshot and
  // maddening in play: every click lands a little below and right of where the
  // player aimed, and small targets become unhittable.
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 3 2, auto`;
}

const CACHE = new Map<CursorKind, string>();


function cssFor(kind: CursorKind): string {
  if (kind === "default") return "";
  let css = CACHE.get(kind);
  if (!css) {
    css = build(kind);
    CACHE.set(kind, css);
  }
  return css;
}

/**
 * Applies a cursor to the canvas, doing nothing when it has not changed.
 *
 * Called every frame from the render loop, so the guard is the point: writing
 * `style.cursor` unconditionally is a style mutation sixty times a second, and
 * some browsers will restart the cursor's own rendering when it is reassigned —
 * which shows up as a pointer that flickers while it sits still.
 */
export class CursorHint {
  private current: CursorKind | null = null;

  constructor(private readonly element: HTMLElement) {}

  set(kind: CursorKind): void {
    if (kind === this.current) return;
    this.current = kind;
    this.element.style.cursor = cssFor(kind);
  }
}

/**
 * A debug handle, alongside `__wieldbound`, `__wieldboundClips` and the rest.
 *
 * A cursor is the one piece of this interface a screenshot can never contain,
 * so without a way to read the built URIs out, the only check available is to
 * choreograph a hover over each kind of thing in a live world and photograph
 * everything except the thing under test. Publishing the table means the art
 * can be drawn and looked at directly.
 */
export function publishCursorDebug(): void {
  const table: Record<string, string> = {};
  for (const kind of ["attack", "tree", "rock", "bush", "talk"] as const) table[kind] = cssFor(kind);
  (window as unknown as Record<string, unknown>).__wieldboundCursors = table;
}
