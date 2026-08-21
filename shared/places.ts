// Where you are, in words.
//
// This world has had names in it since Phase 49 and has never told anybody one
// of them. Emberhold is written on the gate in the sense that the buildings are
// there; the four waystones say their names on a nameplate you have to be
// standing at; the North Road says its destination on one signpost; and after
// this phase there are six woods and a river whose names exist only in a table
// and in a quest brief nobody has taken yet.
//
// That is a real gap rather than a nicety. The whole argument for making the
// forests REGIONS instead of a treeline is that they are places — somewhere you
// can be inside, somewhere you can say you have been — and a place you cannot
// name is a texture. One line under the minimap fixes it, and it costs a pure
// function over tables that already exist.
//
// THE ORDER IS THE DESIGN. Several of these overlap: the bridge is on the road,
// which is in a wood, which is beside the river. What you want to be told is
// the most specific thing that is true, and "the most specific" here means the
// smallest — so it runs built things first, then water, then road, then land.

import { inTown, TOWN_NAME } from "./town.ts";
import { landmarkAt } from "./landmarks.ts";
import { distanceToRoad, ROAD_HALF_WIDTH_PX } from "./road.ts";
import { RIVER_NAME, RIVER_HALF_WIDTH_PX, onBridge, riverAt } from "./river.ts";
import { forestAt, forestStrengthAt } from "./forests.ts";

/** How far off the water still counts as being on the bank. */
const BANK_PX = 280;

/**
 * The name of wherever this point is, or null out in open country.
 *
 * NULL IS A REAL ANSWER and not a fallback worth filling in. Most of this map
 * is field, and inventing a name for every square of it — "the Eastern
 * Reaches" — would make the six that are genuinely places worth nothing. The
 * readout goes blank, and going blank is what makes it mean something when it
 * comes back.
 */
export function placeNameAt(x: number, y: number): string | null {
  if (inTown(x, y)) return TOWN_NAME;

  const stone = landmarkAt(x, y);
  if (stone) return stone.name;

  if (onBridge(x, y)) return `The ${RIVER_NAME.replace(/^The /, "")} Bridge`;

  const river = riverAt(x, y);
  if (river.distancePx < RIVER_HALF_WIDTH_PX + BANK_PX) return RIVER_NAME;

  // The road wins over the wood it runs through, because somebody on the road
  // is travelling and somebody off it is somewhere. Only the track itself,
  // though — a verge is already the wood.
  if (distanceToRoad(x, y) < ROAD_HALF_WIDTH_PX) return "The North Road";

  // The canopy rather than the disc: standing in the gap between two spurs of a
  // wood, on ground you can see the sky from, is not being in the wood.
  if (forestStrengthAt(x, y) > 0.12) {
    const wood = forestAt(x, y);
    if (wood) return wood.name;
  }

  return null;
}
