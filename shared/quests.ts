// Work, from the two people in Emberhold who have any.
//
// A deliberately small system, and small in a particular direction: there are
// no chains, no branches, no timers and no phases. A quest is one counter, one
// threshold and one payment. Everything interesting about it is meant to be the
// thing it points you AT — the first camp, the far bushes, the anvil — rather
// than the quest's own structure.
//
// The reason is that this game already has three progressions running (character
// level, per-weapon proficiency, the quality ladder) and a fourth with its own
// currencies and unlock graph would be competing with them for the same
// attention. What was actually missing was direction: a new character spawns in
// the middle of a world with no instruction and every ring equally available,
// and the honest fix for that is somebody saying "go and kill four slimes".
//
// Progress is counted by the SERVER against events it already emits — a kill it
// already credited through the threat table, a gather it already resolved, a
// forge it already paid for. Nothing here introduces a new thing to track.

import type {
  MonsterKind,
  GatherableResource,
  QuestProgressState,
} from "./protocol-types.ts";
import type { MaterialCost, ConsumableId } from "./items.ts";
import { landmarkById, type Landmark } from "./landmarks.ts";

export type QuestObjective =
  | { kind: "kill"; monster: MonsterKind; count: number }
  | { kind: "gather"; resource: GatherableResource; count: number }
  | { kind: "forge"; count: number }
  | { kind: "salvage"; count: number }
  /**
   * Go and stand somewhere.
   *
   * The count is always 1 and that is not a degenerate case, it is the honest
   * shape: a place is somewhere you have been or have not. Keeping it in the
   * same one-counter-one-threshold mould as the rest means the tracker, the
   * offer states, the completion toast and the server's funnel all take it
   * without a branch — the only thing that knows `reach` is different is the
   * line that reads the counter and the line that draws the label.
   *
   * It is the verb this world was always laid out for. Every ring, every camp
   * and every node is measured from spawn precisely so that walking further IS
   * the progression, and until now nothing ever asked anybody to walk.
   */
  | { kind: "reach"; landmark: string; count: 1 };

export interface QuestReward {
  xp: number;
  materials?: MaterialCost;
  consumable?: { id: ConsumableId; count: number };
}

export interface QuestDef {
  id: string;
  /** Which NPC hands it out and takes it back. */
  giver: string;
  name: string;
  /** What they say when they offer it. */
  brief: string;
  /** What they say when you bring it back. */
  done: string;
  objective: QuestObjective;
  /** Hidden until the character is at least this level. */
  requiresLevel: number;
  /** Hidden until this quest is completed. One-deep, on purpose. */
  after?: string;
  reward: QuestReward;
}

export const QUESTS: QuestDef[] = [
  // --- Warden Cabel: the first ring -----------------------------------------
  // Three, walking outward: the camp you can see from the gate, then the thing
  // that bursts, then a real trip. Each names a monster rather than a count of
  // "enemies", because the point is to send somebody somewhere.
  {
    id: "watch-slimes",
    giver: "cabel",
    name: "Thin Them Out",
    brief:
      "Four slimes, east gate, close enough that you can see them from the wall. They do not " +
      "hit hard and they do not run. If you cannot manage four slimes I would rather find out " +
      "now than later.",
    done: "Four. Good. You are hired for the next one, then.",
    objective: { kind: "kill", monster: "slime", count: 4 },
    requiresLevel: 1,
    reward: { xp: 40, materials: { wood: 25, ore: 25 }, consumable: { id: "potion", count: 2 } },
  },
  {
    id: "watch-mushnubs",
    giver: "cabel",
    name: "The Quiet Ones",
    brief:
      "Mushnubs, north and south. Five of them. They do nothing to anybody, which is exactly " +
      "why nobody clears them and exactly why there are always more. Consider it rent.",
    done: "Nobody will thank you. I am thanking you. Take it.",
    objective: { kind: "kill", monster: "mushnub", count: 5 },
    requiresLevel: 2,
    after: "watch-slimes",
    reward: { xp: 90, materials: { wood: 40, ore: 30, herb: 20 } },
  },
  {
    id: "watch-goblins",
    giver: "cabel",
    name: "Past The First Ring",
    brief:
      "Goblins, and they are further out than anything I have sent you at yet. They shout for " +
      "each other, so you will not be fighting one. Six. Come back if it turns.",
    done:
      "Six goblins is a real afternoon. You will find the watch remembers people who finish " +
      "what they take.",
    objective: { kind: "kill", monster: "goblin", count: 6 },
    requiresLevel: 4,
    after: "watch-mushnubs",
    reward: { xp: 220, materials: { wood: 70, ore: 70, herb: 35 } },
  },

  // --- Warden Cabel: the road out --------------------------------------------
  // Four quests that are nothing but a walk, and they are the only work in the
  // game that teaches the rule the whole world is laid out by. Every camp, ring
  // and node is placed by its distance from the centre; nothing had ever said
  // so, and a new character has no way to learn it except by dying further out
  // than they meant to go.
  //
  // Deliberately no kill count attached. "Get to the Hollow Stone AND clear the
  // orcs" would make the walk the boring half of somebody else's quest — the
  // walk IS the work, and the reward is priced as if it were.
  {
    id: "watch-gatestone",
    giver: "cabel",
    name: "As Far As The Stone",
    brief:
      "There is a standing stone out past the east gate — first one on the road, you cannot " +
      "miss it. Walk to it and walk back. I want to know you can leave the wall behind without " +
      "turning round, because everything else I have is further.",
    done:
      "You saw it, then. Good. Everything I send you at from here is measured from that stone " +
      "and not from the gate.",
    objective: { kind: "reach", landmark: "gatestone", count: 1 },
    requiresLevel: 2,
    after: "watch-slimes",
    reward: { xp: 70, materials: { wood: 30, ore: 30 }, consumable: { id: "potion", count: 1 } },
  },
  {
    id: "watch-sunkenstone",
    giver: "cabel",
    name: "The One Leaning South",
    brief:
      "Second stone, and it is not on the road. South and a good way out — past the cactoro, " +
      "though you do not have to fight them if you have any sense about which way you go round.",
    done: "Then you can navigate. That is rarer than swinging a sword and worth more.",
    objective: { kind: "reach", landmark: "sunkenstone", count: 1 },
    requiresLevel: 5,
    after: "watch-gatestone",
    reward: { xp: 200, materials: { wood: 60, ore: 60, herb: 30 } },
  },
  {
    id: "watch-hollowstone",
    giver: "cabel",
    name: "The Split Stone",
    brief:
      "Third stone, west, and further than the Sunken. You will know it when you see it — the " +
      "thing is split top to bottom and you can walk through the middle of it. Trolls that way, " +
      "and a thing that knits itself back together unless you burn it, which is a fight I am " +
      "not asking you to have. Get there, get back.",
    done:
      "Nobody on the watch has been out that far this year. I am putting your name against it " +
      "in the book.",
    objective: { kind: "reach", landmark: "hollowstone", count: 1 },
    requiresLevel: 9,
    after: "watch-sunkenstone",
    reward: { xp: 600, materials: { wood: 140, ore: 140, herb: 70 } },
  },
  {
    id: "watch-ashenstone",
    giver: "cabel",
    name: "Where Nobody Has Stood",
    brief:
      "The last stone. North-west, right out at the edge of anything I have a name for, and " +
      "there is a dragon between here and there. Grey as a cold hearth, they say, with nothing " +
      "growing round it — though nobody living has been close enough to argue. I am not going " +
      "to pretend this is a patrol. If you come back having seen it you will have gone further " +
      "than anybody in this town.",
    done:
      "Then it is real. Forty years I have had that stone on a map and no one to say it was " +
      "actually there.",
    objective: { kind: "reach", landmark: "ashenstone", count: 1 },
    requiresLevel: 14,
    after: "watch-hollowstone",
    // No essence, and the test is what stopped it. Essence comes only off kills
    // by design, and the biggest reward in the game paying some is exactly the
    // back door that would quietly stop that being true — the more so for a
    // quest whose whole point is that you did not have to fight anything.
    reward: { xp: 1600, materials: { wood: 300, ore: 300, herb: 150, ingot: 4 } },
  },

  // --- Marda Quill: the inn needs things -------------------------------------
  // Gathering and crafting, so the two givers do not send you to the same
  // place. Hers are the quests that teach the anvil.
  {
    id: "inn-wood",
    giver: "marda",
    name: "The Fire Wants Feeding",
    brief:
      "Thirty wood. The trees outside the wall will do — you do not have to go far and I would " +
      "rather you did not. Chop, carry, come back.",
    done: "That is a week of evenings. Here, this is worth more to you than to me.",
    objective: { kind: "gather", resource: "wood", count: 30 },
    requiresLevel: 1,
    reward: { xp: 45, materials: { ore: 30, herb: 25 }, consumable: { id: "potion", count: 1 } },
  },
  {
    id: "inn-herb",
    giver: "marda",
    name: "Something For The Pot",
    brief:
      "Forty herb. There are bushes in the square, which is convenient for you and means I have " +
      "no sympathy at all if you take your time about it.",
    done: "Stew tonight, then. You have earned a bowl and something better besides.",
    objective: { kind: "gather", resource: "herb", count: 40 },
    requiresLevel: 2,
    after: "inn-wood",
    reward: { xp: 100, materials: { wood: 50, ore: 40 }, consumable: { id: "tonic", count: 1 } },
  },
  {
    id: "inn-forge",
    giver: "marda",
    name: "Made, Not Found",
    brief:
      "Go and make something. Anything — Tobin will tell you how, and the recipes you were born " +
      "knowing are all band-one. Two things off that anvil and I will call it done. Half my " +
      "guests have never once used it and it shows.",
    done:
      "Now you know what the middle of the square is for. Most people work that out about forty " +
      "levels too late.",
    objective: { kind: "forge", count: 2 },
    requiresLevel: 2,
    after: "inn-herb",
    reward: { xp: 160, materials: { wood: 60, ore: 60, herb: 40 } },
  },
  // The other half of the bench, and the half nobody finds on their own.
  // `salvage` has been in `QuestObjective` since the day quests shipped with
  // nothing pointing at it — the same dangling limb as an element with no
  // weapon made of it. Taking something apart is the ONLY way to learn its
  // recipe, which is the best loop in the item system and is completely
  // invisible until somebody tells you, so it is worth a quest saying it out
  // loud rather than a line in a tooltip.
  {
    id: "inn-salvage",
    giver: "marda",
    name: "Take It Apart",
    brief:
      "Break three things down at the anvil. Anything — the rubbish you are carrying because " +
      "you have not looked in your bag since Tuesday will do. And pay attention to what Tobin " +
      "says afterwards, because it is the part everybody misses.",
    done:
      "A smith knows what they have taken apart. You can make those now, and you could not " +
      "before. That is the whole trick and half the town has never noticed it.",
    objective: { kind: "salvage", count: 3 },
    requiresLevel: 3,
    after: "inn-forge",
    reward: { xp: 240, materials: { ore: 80, herb: 60 }, consumable: { id: "tonic", count: 1 } },
  },
];

export function questDef(id: string): QuestDef | null {
  return QUESTS.find((q) => q.id === id) ?? null;
}

export function questsFrom(giver: string): QuestDef[] {
  return QUESTS.filter((q) => q.giver === giver);
}

/** How the objective reads in a list: "Slimes slain 2 / 4". */
export function objectiveLabel(o: QuestObjective): string {
  if (o.kind === "kill") return `${MONSTER_PLURAL[o.monster] ?? o.monster} slain`;
  if (o.kind === "gather") return `${o.resource} gathered`;
  if (o.kind === "forge") return "things forged";
  if (o.kind === "salvage") return "things salvaged";
  // Named, not counted. "places reached 0 / 1" is technically what the counter
  // holds and it tells the player nothing they want to know; the name of the
  // stone is the whole instruction.
  return landmarkOf(o)?.name ?? o.landmark;
}

/** The waystone a reach objective names, or null for every other kind. */
export function landmarkOf(o: QuestObjective): Landmark | null {
  return o.kind === "reach" ? landmarkById(o.landmark) : null;
}

/**
 * Whether the tracker should show "n / m" after the label.
 *
 * A counter is only worth reading when it can be part way along. Reaching a
 * place cannot: you are there or you are not, and "0 / 1" beside a place name
 * is noise dressed as progress.
 */
export function objectiveIsCounted(o: QuestObjective): boolean {
  return o.kind !== "reach";
}

/**
 * Plurals, because "4 slime slain" is the kind of small wrongness that makes an
 * interface feel unfinished. Only the kinds quests actually name.
 */
const MONSTER_PLURAL: Partial<Record<MonsterKind, string>> = {
  slime: "Slimes",
  mushnub: "Mushnubs",
  goblin: "Goblins",
  wolf: "Wolves",
  spikyblob: "Spiky Blobs",
  armabee: "Armabees",
  cactoro: "Cactoro",
  orcbrute: "Orc Brutes",
};

// --- Per-player state -------------------------------------------------------
// The shape itself lives in protocol-types, beside the message that carries it.
// "Active" means taken and not yet paid out; there is no third state, because a
// quest whose counter is full is still active until somebody walks back and
// says so.

/** True when a quest's counter has reached its threshold. */
export function questSatisfied(def: QuestDef, count: number): boolean {
  return count >= def.objective.count;
}

/**
 * Which of a giver's quests to show, and in what state.
 *
 * One function rather than a branch in the panel and another on the server,
 * because the two have to agree about what is offerable: a client that lists a
 * quest the server will refuse is a button that does nothing, and a server that
 * accepts one the client never showed is a way to skip the level gate.
 */
export type QuestOfferState = "offer" | "in-progress" | "ready" | "locked" | "done";

export function offerStateFor(
  def: QuestDef,
  level: number,
  active: readonly QuestProgressState[],
  completed: readonly string[],
): QuestOfferState {
  if (completed.includes(def.id)) return "done";
  const running = active.find((a) => a.id === def.id);
  if (running) return questSatisfied(def, running.count) ? "ready" : "in-progress";
  if (level < def.requiresLevel) return "locked";
  if (def.after && !completed.includes(def.after)) return "locked";
  return "offer";
}

/** Why a locked quest is locked, for the line under its name. */
export function lockReason(
  def: QuestDef,
  level: number,
  completed: readonly string[],
): string | null {
  if (def.after && !completed.includes(def.after)) {
    return `after "${questDef(def.after)?.name ?? def.after}"`;
  }
  if (level < def.requiresLevel) return `level ${def.requiresLevel}`;
  return null;
}

/** How a reward reads in one line. */
export function rewardLabel(reward: QuestReward): string {
  const parts: string[] = [`${reward.xp} xp`];
  if (reward.materials) {
    for (const [mat, n] of Object.entries(reward.materials)) {
      if (n) parts.push(`${n} ${mat}`);
    }
  }
  if (reward.consumable) {
    parts.push(`${reward.consumable.count}× ${reward.consumable.id}`);
  }
  return parts.join(" · ");
}
