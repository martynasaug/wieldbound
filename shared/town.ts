// Emberhold — the beginner town.
//
// The world had exactly one built thing in it: a smithy at the centre, which
// doubled as spawn, as the origin of the difficulty bands and as the only place
// a player could tell they were somewhere rather than nowhere. This file makes
// that centre a PLACE — seven buildings, a lantern-lit square, a herb garden
// and five people standing in it.
//
// Everything here is in SERVER PIXELS, like nodes, stations and monsters, so
// the town speaks the same coordinate language as everything else the protocol
// carries. The client divides by PX_PER_UNIT the same way it does for a wolf.
//
// The layout is expressed as (radius, angle) from spawn for the same reason the
// monster camps are: the one rule the world is laid out by is that distance
// from the smithy is difficulty, and a polar coordinate is that rule written
// down. It also means the town follows the world if the world is ever resized.

import { PLAYER_SPAWN } from "./protocol-types.ts";

export const TOWN_NAME = "Emberhold";

/** The square's centre — the smithy, and where every player arrives. */
export const TOWN_CENTER = PLAYER_SPAWN;

/**
 * Where the town stops.
 *
 * The palisade sits here, the light the town adds falls off across it, and the
 * nearest monster stands 130px beyond it — so the boundary is real ground
 * rather than a number: you can see where you stop being safe.
 *
 * 800, up from 560. The first build was measured against how much room the
 * BUILDINGS needed and it was too tight the moment anybody stood in it: this
 * is the one place in the game where several players are in the same twenty
 * metres at once, doing nothing in particular, and a square sized to its
 * architecture is a square you shuffle through rather than one you stand
 * around in. It is also exactly the first resource band now, so "the town" and
 * "the safe ring" are one fact.
 */
export const TOWN_RADIUS_PX = 800;

/**
 * Gate bearings, in degrees. The wall opens where the road runs through.
 *
 * ONE road, east to west, straight through the square — not four spokes. Four
 * gates cut the ring into four 66-degree arcs, and the layout test showed that
 * six buildings do not fit in four arcs that size without pairs of them
 * overlapping at their front corners, which are the widest part of a footprint
 * seen from the centre. Two gates give two 156-degree arcs, three buildings
 * each, and comfortable gaps everywhere. It is also simply what a village on a
 * road looks like.
 */
export const TOWN_GATE_ANGLES = [0, 180] as const;

/** Half-width of a gateway, in degrees of arc. */
export const TOWN_GATE_HALF_DEG = 12;

function at(radiusPx: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round(TOWN_CENTER.x + Math.cos(a) * radiusPx),
    y: Math.round(TOWN_CENTER.y + Math.sin(a) * radiusPx),
  };
}

// --- Buildings --------------------------------------------------------------

/**
 * What a building IS, which decides how it is drawn.
 *
 * A kind rather than a pile of measurements: the client owns proportions, roof
 * pitch and palette, and this file owns where things stand and what they are
 * called. Otherwise every tweak to a roof line would be a change to a file the
 * server imports.
 */
export type BuildingKind = "inn" | "shop" | "watchpost" | "chapel" | "cottage" | "stable";

export interface TownBuilding {
  id: string;
  kind: BuildingKind;
  /** Shown on the hanging sign. Cottages have none, because people live there. */
  name?: string;
  x: number;
  y: number;
  /** Footprint across the front, in server pixels. */
  widthPx: number;
  /** Footprint front to back. */
  depthPx: number;
  /**
   * Which way the front door faces, in degrees (0 = +x). Every building on the
   * ring looks at the square, because a town whose houses face outward reads as
   * a row of sheds.
   */
  facingDeg: number;
  /** Storeys. Two means a jettied upper floor, which is most of the silhouette. */
  storeys: 1 | 2;
}

/**
 * The ring.
 *
 * Radius 560 puts the near wall of every building about twelve units out from
 * the anvil, which leaves a plaza roughly twenty-four units across — big enough
 * that a dozen players can stand in it without anybody having to walk round
 * anybody, and still enclosed enough to read as one room rather than as a field
 * with sheds around it.
 *
 * It was 370 first, sized to the buildings. That is the wrong thing to size a
 * square to.
 *
 * Six buildings, not seven. The first attempt put seven on a tighter ring and
 * the layout test refused it: three pairs overlapped and three roads ran
 * straight into a wall, because a building's ANGULAR width grows as the ring
 * shrinks and 340px could not carry the frontage. Three more attempts followed
 * before the road went from four spokes to one through-road — which is the
 * change that actually made the arithmetic work, and is also the better town.
 *
 * Three buildings north of the road, three south, spaced so that even the front
 * corners — the widest part of a footprint seen from the square — clear their
 * neighbours and both gateways.
 */
const RING = 560;

export const TOWN_BUILDINGS: TownBuilding[] = [
  // --- South of the road ----------------------------------------------------
  // The biggest thing in town. Its frontage is why the arc it sits on carries
  // only two neighbours rather than three of equal size.
  {
    id: "inn",
    kind: "inn",
    name: "The Bent Nail",
    ...at(RING, 225),
    widthPx: 250,
    depthPx: 190,
    facingDeg: 45,
    storeys: 2,
  },
  {
    id: "shop",
    kind: "shop",
    name: "The Ledger & Lamp",
    ...at(RING, 285),
    widthPx: 205,
    depthPx: 175,
    facingDeg: 105,
    storeys: 2,
  },
  {
    id: "cottage-east",
    kind: "cottage",
    ...at(RING, 330),
    widthPx: 160,
    depthPx: 145,
    facingDeg: 150,
    storeys: 1,
  },
  // --- North of the road ----------------------------------------------------
  // The watch stands where it can see the east gate, which is the one the first
  // monster camp is nearest to.
  {
    id: "watchpost",
    kind: "watchpost",
    name: "Warden's Post",
    ...at(RING, 45),
    widthPx: 165,
    depthPx: 165,
    facingDeg: 225,
    storeys: 2,
  },
  {
    id: "chapel",
    kind: "chapel",
    name: "The Quiet Lamp",
    ...at(RING, 90),
    widthPx: 170,
    depthPx: 195,
    facingDeg: 270,
    storeys: 1,
  },
  {
    id: "cottage-west",
    kind: "cottage",
    ...at(RING, 135),
    widthPx: 160,
    depthPx: 145,
    facingDeg: 315,
    storeys: 1,
  },
];

// --- Walking into walls -----------------------------------------------------
// Until now the world had no static obstacle in it at all: bodies collided,
// scenery did not, and there was nothing solid enough for that to be
// noticeable. A town is nothing but walls, so it is noticeable immediately —
// walking through the inn is the fastest way to stop believing in a place.
//
// Movement is client-authoritative, so this runs there. It lives in shared/
// anyway, because the moment the server wants to know where a player can stand
// it must agree exactly, and a second copy of a footprint list is a second copy
// that goes stale.

/** A little slack, so a body slides along plaster rather than through it. */
const WALL_PADDING_PX = 12;

function toLocal(dx: number, dy: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

function toWorld(lx: number, ly: number, angleDeg: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: lx * cos - ly * sin, y: lx * sin + ly * cos };
}

/**
 * Slides a point out of any building it has ended up inside.
 *
 * Pushes along the SHALLOWEST axis of penetration, which is what makes a wall
 * feel like a wall rather than like a magnet: walk into a long face and you are
 * moved a few pixels straight back out, walk into a corner and you come out
 * round it. Resolving along the deepest axis instead teleports anyone who clips
 * a corner clean across the building.
 *
 * The local frame has +x running front-to-back (the depth axis, along the
 * facing) and +y across the front, which is why the halves are paired the way
 * they are — getting that round the wrong way makes wide buildings collide as
 * though they were deep ones, and the symptom is invisible until you walk into
 * exactly the wrong wall.
 */
export function pushOutOfBuildings(x: number, y: number, radiusPx = 16): { x: number; y: number } {
  for (const b of TOWN_BUILDINGS) {
    const local = toLocal(x - b.x, y - b.y, b.facingDeg);
    const halfDepth = b.depthPx / 2 + radiusPx + WALL_PADDING_PX;
    const halfWidth = b.widthPx / 2 + radiusPx + WALL_PADDING_PX;
    const overX = halfDepth - Math.abs(local.x);
    const overY = halfWidth - Math.abs(local.y);
    if (overX <= 0 || overY <= 0) continue;

    if (overX < overY) local.x += (local.x < 0 ? -1 : 1) * overX;
    else local.y += (local.y < 0 ? -1 : 1) * overY;

    const world = toWorld(local.x, local.y, b.facingDeg);
    x = b.x + world.x;
    y = b.y + world.y;
  }
  return { x, y };
}

/** True while the point is inside a building's footprint. For the tests. */
export function insideAnyBuilding(x: number, y: number, radiusPx = 0): boolean {
  for (const b of TOWN_BUILDINGS) {
    const local = toLocal(x - b.x, y - b.y, b.facingDeg);
    if (
      Math.abs(local.x) < b.depthPx / 2 + radiusPx &&
      Math.abs(local.y) < b.widthPx / 2 + radiusPx
    ) {
      return true;
    }
  }
  return false;
}

// --- The people -------------------------------------------------------------

/**
 * What an NPC is FOR.
 *
 * Four roles, and each does something the game could not do before: `vendor`
 * trades, `quest` hands out work, `guide` explains rules the game has never
 * said out loud, and `flavour` is someone who lives here. A fifth role that
 * only talks would be scenery with a nameplate, so there isn't one.
 */
export type NpcRole = "vendor" | "quest" | "guide" | "flavour";

/**
 * Which body to build them from.
 *
 * Deliberately the abstract archetype rather than a model filename: `shared/`
 * knows nothing about FBX files, and the client already owns the class-to-body
 * table that puts a robe on a mage.
 */
export type NpcBody = "warrior" | "ranger" | "mage" | "rogue" | "adventurer";

export interface NpcTopic {
  /** What the player clicks. */
  q: string;
  /** What they say back. One paragraph; the panel wraps it. */
  a: string;
}

export interface TownNpc {
  id: string;
  name: string;
  /** Under the name, on the plate and in the dialogue header. */
  title: string;
  role: NpcRole;
  body: NpcBody;
  /** Icon key drawn on the plate and beside the name in the panel. */
  icon: string;
  x: number;
  y: number;
  /** Which way they stand, in degrees (0 = +x). Everyone faces the square. */
  facingDeg: number;
  /** The first thing they say, before any topic is picked. */
  greeting: string;
  topics: NpcTopic[];
}

/** How close you have to stand before someone will talk to you. */
export const NPC_TALK_RANGE_PX = 150;

/**
 * Everyone in Emberhold.
 *
 * Five, which is as many as a square this size holds without the player having
 * to pick their way between them. Each stands a little in front of the building
 * they belong to, facing the anvil.
 */
export const TOWN_NPCS: TownNpc[] = [
  {
    id: "herald",
    name: "Elsbet Vane",
    title: "Herald of Emberhold",
    role: "guide",
    body: "mage",
    icon: "class-mage",
    ...at(215, 272),
    facingDeg: 92,
    greeting:
      "New in Emberhold? Then let me save you a few deaths. This place has one rule, " +
      "and almost everything else follows from it.",
    topics: [
      {
        q: "What is the one rule?",
        a:
          "You are whatever you're holding. There is no class to choose — pick up a sword and " +
          "you fight as a warrior, drop it for a staff and you are a mage before the sword " +
          "hits the ground. Your skills, your reach, your mana and your body all come from " +
          "the thing in your hand. Bare-handed you are an adventurer, which is weak but is " +
          "not broken.",
      },
      {
        q: "Where is it safe?",
        a:
          "Here. Nothing spawns inside the walls. Walk out of any gate and the ground gets " +
          "worse the further you go — slimes and mushnubs within shouting distance, goblins " +
          "and blobs past that, then wolves and orcs, then trolls and demons, and at the far " +
          "edge a golem and a dragon. Distance from the anvil IS the difficulty. Nobody will " +
          "stop you walking straight to the dragon.",
      },
      {
        q: "How do I fight?",
        a:
          "You start fights; they do not start themselves. Press your weapon's own attack — " +
          "the first slot, and it is different for every weapon family — and the swings keep " +
          "coming until you walk away. The curtain on that slot is your swing timer, so a " +
          "dagger lands three blows in the time an axe lands one.",
      },
      {
        q: "What is damage made of?",
        a:
          "Six schools: physical, fire, frost, nature, arcane and lightning. Your weapon's " +
          "family sets the floor and its material overrides it, so a Frostbrand really does " +
          "deal frost. Every creature folds to something and shrugs off something else — a " +
          "troll knits itself back together unless you burn it, a golem has lightning for a " +
          "seam. Never immunity, though. A wrong build kills a golem slowly, not never.",
      },
      {
        q: "What should I do first?",
        a:
          "Take work from Cabel at the Warden's Post and from Marda at the inn — both pay in " +
          "materials, which is what the anvil eats. Gather from the bushes here in the square " +
          "and the trees outside the wall. Then stand at the anvil and forge something. " +
          "Salvaging a thing teaches you to make it, so break open anything you will not wear.",
      },
      {
        q: "Why is the town lit at night?",
        a:
          "Because the watch pays for lamp oil, and because a player who cannot see their own " +
          "feet stops playing. Step outside the wall after dark and you will notice the " +
          "difference immediately. That is deliberate too.",
      },
    ],
  },
  {
    id: "oswyn",
    name: "Oswyn Thale",
    title: "Provisioner",
    role: "vendor",
    body: "adventurer",
    icon: "dock-bag",
    ...at(415, 285),
    facingDeg: 105,
    greeting:
      "Wood, ore, herb, essence — I take all four, and I part with rather less than I take. " +
      "Have a look.",
    topics: [
      {
        q: "Why don't you take coin?",
        a:
          "Coin is a promise somebody else has to keep. Ore is ore. Bring me what came out of " +
          "the ground and I will hand you something that came out of a workshop, and neither " +
          "of us has to trust a mint.",
      },
      {
        q: "Anything you won't sell?",
        a:
          "Anything past the second ring. I stock what keeps a beginner alive long enough to " +
          "learn the anvil — potions, a serviceable blade, boots that do not fall apart. If " +
          "you want a Frostbrand you will have to take one off something.",
      },
    ],
  },
  {
    id: "cabel",
    name: "Warden Cabel",
    title: "Watch Captain",
    role: "quest",
    body: "warrior",
    icon: "class-warrior",
    ...at(415, 45),
    facingDeg: 225,
    greeting:
      "You are armed and you are standing still. I can fix the second of those. The watch has " +
      "work, and the watch pays.",
    topics: [
      {
        q: "What is the watch for?",
        a:
          "Keeping the first ring thin. We do not clear it — you cannot clear it, it comes " +
          "back — we keep it from thickening until it leans on the wall. That is the whole job " +
          "and it never ends, which is why I am always hiring.",
      },
      {
        q: "What is out there worth knowing?",
        a:
          "Everything in the first ring dies to anything. Past that they start having opinions. " +
          "A blob bursts when you kill it, so do not be standing on it. A wolf is faster than " +
          "you are. And do not go looking at the golem until you have something with lightning " +
          "in it.",
      },
    ],
  },
  {
    id: "marda",
    name: "Marda Quill",
    title: "Innkeeper",
    role: "quest",
    body: "rogue",
    icon: "dock-craft",
    ...at(420, 225),
    facingDeg: 45,
    greeting:
      "The Bent Nail. Beds upstairs, stew if you can pay, and a list of things I need fetched " +
      "that is longer every week.",
    topics: [
      {
        q: "Why the name?",
        a:
          "The first one went in crooked and the smith who drove it said leaving it was cheaper " +
          "than an apology. It is still there, third beam from the door. People touch it on " +
          "their way out, which I have never discouraged.",
      },
      {
        q: "What does an inn need from me?",
        a:
          "Wood for the fire, herb for the pot, ore for the smith who fixes what my guests " +
          "break. None of it is heroic and all of it is short. Bring it and I will pay you in " +
          "things you can use at the anvil.",
      },
    ],
  },
  {
    id: "tobin",
    name: "Tobin Ash",
    title: "Smith's Apprentice",
    role: "flavour",
    body: "ranger",
    icon: "dock-craft",
    ...at(130, 78),
    facingDeg: 258,
    greeting:
      "Mind the coals. Master's away and I am not allowed to sell you anything, but I am " +
      "allowed to talk.",
    topics: [
      {
        q: "What can the anvil do?",
        a:
          "Five things. Forge makes a named thing you have learned. Refine turns raw wood and " +
          "ore into ingots and wardweave, which the good recipes are priced in. Reforge walks " +
          "an item up the quality ladder. Etch cuts a rune you have drawn onto something you " +
          "are keeping. Salvage takes a thing apart — and teaches you to make it.",
      },
      {
        q: "So how do I learn a recipe?",
        a:
          "By destroying one. That is the loop and it is not a joke: find a Frostbrand, salvage " +
          "it, and now you can forge Frostbrands. Everything in the first ring you know already.",
      },
      {
        q: "Is reforging safe?",
        a:
          "It re-rolls what the dice gave you, so no. But it leaves etched runes standing, so " +
          "anything you paid a rune for survives the fire. Cut every slot and you have bought " +
          "your way out of the gamble entirely.",
      },
    ],
  },
];

export function npcById(id: string): TownNpc | null {
  return TOWN_NPCS.find((n) => n.id === id) ?? null;
}

/** True inside the walls. Used for the town's own light and for "am I safe". */
export function inTown(x: number, y: number): boolean {
  return Math.hypot(x - TOWN_CENTER.x, y - TOWN_CENTER.y) <= TOWN_RADIUS_PX;
}
