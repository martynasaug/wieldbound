// Waystones — the first built things outside the palisade.
//
// Emberhold gave the middle of the world a place to be. Everything past the
// gate was still trees, rocks and monsters: ground with a difficulty rating and
// no features, where the only way to know how far out you had walked was to
// open the minimap and look at a dot. That is a map telling you something the
// world should be telling you.
//
// So: four standing stones, one for each band past the first, spiralling
// outward around the compass so that no two are on the same walk. Each is a
// PLACE — it has a name, it is visible from a distance, it is somewhere a quest
// can send you and somewhere you can say you have been.
//
// They are the reason the `reach` objective is worth having. "Go to (4880,
// 3104)" is not work, it is a coordinate; "get to the Ashen Stone" is a
// destination, and the difference is entirely that there is something there
// when you arrive.
//
// Positions are polar from spawn, in server pixels, like the camps and the node
// rings and the town — because the one rule this world is laid out by is that
// distance from the centre IS difficulty, and a polar coordinate is that rule
// written down. Bearings and radii were chosen against the real camp and node
// tables rather than by eye: a waystone inside a goblin pack is a landmark you
// cannot stand at, and one on top of an ore node is a landmark that eats a
// resource.

import { PLAYER_SPAWN, bandAt } from "./protocol-types.ts";

export interface Landmark {
  id: string;
  name: string;
  /** Placement from spawn, the same polar terms everything else uses. */
  radiusPx: number;
  angleDeg: number;
  /**
   * One line, for the quest brief and the tooltip. Says what is THERE, because
   * the whole argument for these is that arriving is worth something.
   */
  blurb: string;
}

/**
 * How close counts as "you are here".
 *
 * Generous on purpose. This is not a precision task and there is nothing
 * interesting about the last twenty pixels — the work was the walk, and the
 * band it is in is the difficulty. It also has to be comfortably larger than
 * the distance a player can cover between two position updates, or arriving at
 * a run could step straight over the check.
 */
export const LANDMARK_REACH_PX = 180;

/**
 * How far apart two waystones must stand.
 *
 * Not a layout nicety: two landmarks within one reach radius of each other
 * would both be satisfied by standing in one spot, which quietly turns two
 * quests into one. The test asserts it.
 */
export const LANDMARK_SPACING_PX = 600;

export const LANDMARKS: Landmark[] = [
  {
    id: "gatestone",
    name: "The Gate Stone",
    radiusPx: 1560,
    angleDeg: 15,
    blurb:
      "The first stone out of the east gate, close enough that the watch can see it on a " +
      "clear day. Somebody has scratched a tally into the base and given up counting.",
  },
  {
    id: "sunkenstone",
    name: "The Sunken Stone",
    radiusPx: 1980,
    angleDeg: 115,
    blurb:
      "Leaning south, half its height in the ground and still taller than you are. Whatever " +
      "the carving on it said, the weather has had it.",
  },
  {
    id: "hollowstone",
    name: "The Hollow Stone",
    radiusPx: 2400,
    angleDeg: 210,
    blurb:
      "Split top to bottom, and the gap is wide enough to walk through. People who have been " +
      "this far west do not agree about whether that was done on purpose.",
  },
  {
    id: "ashenstone",
    name: "The Ashen Stone",
    radiusPx: 2780,
    angleDeg: 305,
    blurb:
      "The furthest one, and the only one nobody in Emberhold has stood at. It is the colour " +
      "of a cold hearth and the ground around it will not grow anything.",
  },
];

export const LANDMARK_IDS: string[] = LANDMARKS.map((l) => l.id);

export function landmarkById(id: string): Landmark | null {
  return LANDMARKS.find((l) => l.id === id) ?? null;
}

/** World position of a waystone, from its polar placement. */
export function landmarkPosition(l: Landmark): { x: number; y: number } {
  const a = (l.angleDeg * Math.PI) / 180;
  return {
    x: Math.round(PLAYER_SPAWN.x + Math.cos(a) * l.radiusPx),
    y: Math.round(PLAYER_SPAWN.y + Math.sin(a) * l.radiusPx),
  };
}

/**
 * Which difficulty ring a waystone stands in.
 *
 * DERIVED rather than authored, and that is load-bearing: a quest that sends
 * you to a stone is a quest whose real difficulty is the walk, so the level it
 * is gated behind has to follow the band the stone is actually in. Typing the
 * band beside the radius is two numbers that agree until somebody moves one.
 */
export function landmarkBand(l: Landmark): 1 | 2 | 3 | 4 | 5 {
  const at = landmarkPosition(l);
  return bandAt(at.x, at.y);
}

/** Is a player standing at this waystone? The one place that question is asked. */
export function atLandmark(l: Landmark, x: number, y: number): boolean {
  const at = landmarkPosition(l);
  return Math.hypot(x - at.x, y - at.y) <= LANDMARK_REACH_PX;
}

/**
 * Which waystone somebody is standing at, or null.
 *
 * Four square roots, and it is called on every position update the server
 * receives — so it is deliberately the CHEAP half of the check. Whether that
 * arrival advances anything is a question for the quest tables and a database
 * read, and neither of those may happen per movement packet: the server asks
 * this first and only goes looking when the answer has just changed from
 * nothing to something. `LANDMARK_SPACING_PX` is what makes "or null"
 * unambiguous — no two stones are close enough to both answer.
 */
export function landmarkAt(x: number, y: number): Landmark | null {
  for (const l of LANDMARKS) {
    if (atLandmark(l, x, y)) return l;
  }
  return null;
}
