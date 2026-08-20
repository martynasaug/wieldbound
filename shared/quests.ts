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

export type QuestObjective =
  | { kind: "kill"; monster: MonsterKind; count: number }
  | { kind: "gather"; resource: GatherableResource; count: number }
  | { kind: "forge"; count: number }
  | { kind: "salvage"; count: number };

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
  return "things salvaged";
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
