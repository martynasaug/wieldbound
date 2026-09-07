// Where a body actually ends up, once everything solid has had its say.
//
// The three resolvers — other bodies, the town, the river — were applied one
// after another, once per frame, and each of them settles on its own.
// `resolveBodyCollision` has iterated since it was written, and
// `resolveTownCollision` iterates and escapes as of the entry before this one.
// Nothing checked that the SEQUENCE settles, and it does not:
//
//   a troll pushes you into a wall
//   the wall pushes you back into the troll
//   next frame, the same
//
// Swept over the town — 1,920 arrangements of a player at building and wall
// range with the largest body in the game overlapping them from eight
// directions — ten never came to rest. That is the classic "pinned against the
// scenery by a mob" bug, and it is the one a player meets most often, because
// melee happens against buildings.
//
// So the sequence gets the same treatment its parts already had: repeat until
// the position stops moving. It lives here, in `shared/`, rather than in the
// client's `resolvePlayerCollision`, because a rule about where a body may
// stand is not a rendering decision and because a pure function is one the test
// can sweep the whole town with in a second.

import { resolveBodyCollision, type BodyCircle } from "./protocol-types.ts";
import { resolveTownCollision } from "./town.ts";
import { resolveRiverCollision } from "./river.ts";

/**
 * How many times the whole sequence is applied before it is accepted as it is.
 *
 * Each part already converges internally, so this is only paying for the
 * ARGUMENT between them, which is settled in two or three rounds when it settles
 * at all. Six leaves room and the loop exits the moment nothing moves, so the
 * ordinary frame — nothing touching the player — costs one pass and a compare.
 */
const PASSES = 6;

/**
 * Pushes a body out of everything solid: other bodies first, then the town, then
 * the river.
 *
 * The ORDER is deliberate and predates this function. Bodies first, so that a
 * monster which has shoved you into the inn leaves you standing outside the inn
 * rather than inside it; the river last, because the town is four kilometres
 * from the water and neither can push into the other.
 */
export function resolvePlayerPosition(
  x: number,
  y: number,
  radiusPx: number,
  bodies: readonly BodyCircle[],
): { x: number; y: number } {
  for (let pass = 0; pass < PASSES; pass++) {
    const fromX = x;
    const fromY = y;

    const off = resolveBodyCollision(x, y, radiusPx, bodies);
    x = off.x;
    y = off.y;

    const clear = resolveTownCollision(x, y, radiusPx);
    x = clear.x;
    y = clear.y;

    const dry = resolveRiverCollision(x, y, radiusPx);
    x = dry.x;
    y = dry.y;

    // Settled. Below a twentieth of a pixel is arithmetic rather than a push.
    if (Math.hypot(x - fromX, y - fromY) < 0.05) break;
  }
  return { x, y };
}
