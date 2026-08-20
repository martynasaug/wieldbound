// The people standing in Emberhold.
//
// An NPC is an `Actor` that never receives a snapshot. That is the whole trick,
// and it is why this file is short: everything the class bodies already do —
// the rig, the idle clip, the per-actor variance that stops four copies of one
// model breathing in lockstep — arrives free, and the only thing that has to be
// invented is that nobody tells them where to stand.
//
// They are deliberately NOT players and not monsters. A player is something the
// server broadcasts; a monster is something you can hit. An NPC is neither, so
// it gets its own map, its own plate kind and its own click branch rather than
// being smuggled into one of the two collections that already exist — which is
// the shortcut that would make `pickMonsterAt` able to return a shopkeeper.

import * as THREE from "three";
import { TOWN_NPCS, type NpcBody, type TownNpc } from "../../../shared/town";
import { Actor } from "./Actor";
import { toWorldX, toWorldZ } from "./World";

/**
 * Which rig each archetype wears.
 *
 * Four of the five are the class bodies the game already builds players from,
 * which is the point — the Herald is a mage because she is built out of the same
 * thing a player holding a staff is built out of. The Rogue is the one body in
 * the pack with no weapon family behind it, which makes it the obvious face for
 * somebody who is not an adventurer at all.
 */
const NPC_MODELS: Record<NpcBody, string> = {
  adventurer: "Monk",
  warrior: "Warrior",
  ranger: "Ranger",
  mage: "Wizard",
  rogue: "Rogue",
};

/** Everyone is built to the same height as a player, so the square has scale. */
const NPC_HEIGHT = 1.7;

export interface NpcVisual {
  def: TownNpc;
  actor: Actor;
  /** World-space position, cached — nothing here ever moves. */
  x: number;
  z: number;
}

/**
 * Builds every townsperson and adds them to the scene.
 *
 * Loaded in parallel and seated as each arrives, for the reason the smithy's
 * props were: awaiting them in turn queues five FBX parses behind the forty-odd
 * models the ground cover is already fetching, and the last of the five would
 * appear long after the player had walked past where they stand.
 */
export async function buildNpcs(scene: THREE.Scene): Promise<Map<string, NpcVisual>> {
  const out = new Map<string, NpcVisual>();

  await Promise.all(
    TOWN_NPCS.map(async (def) => {
      const actor = new Actor({
        model: NPC_MODELS[def.body],
        height: NPC_HEIGHT,
        // Nothing sends them positions, so there is nothing to smooth toward:
        // interpolation here would be pure lag with no signal behind it.
        interpolate: false,
        // A stable seed from the id. Five people standing in one square, all
        // playing the same idle from the same instant, is the exact failure the
        // variance was added for — and it is more obvious on humans than it ever
        // was on mushnubs.
        variance: hashUnit(def.id),
        // They look around. A player's facing is load-bearing — a skill fired at
        // nothing uses it to aim — but nobody reads an NPC's, and a shopkeeper
        // who never moves their head is a statue of a shopkeeper.
        idleGlance: true,
      });

      const x = toWorldX(def.x);
      const z = toWorldZ(def.y);
      actor.snapTo(x, 0, z);
      // Server bearings are measured in the XY plane where +y is south, and
      // south is +z here — so a bearing turns into a direction with no sign
      // flip at all. Getting this wrong leaves everyone facing out of town,
      // which reads as a bug in the layout rather than in the conversion.
      const a = (def.facingDeg * Math.PI) / 180;
      actor.faceDirection(Math.cos(a), Math.sin(a));

      try {
        await actor.load();
      } catch (err) {
        // A missing body is one absent townsperson, not a broken town. Said out
        // loud, though: silence here is a nameplate over empty ground, which
        // looks like a rendering fault rather than a failed download.
        console.warn(`[town] ${def.name} did not load:`, err);
        return;
      }

      scene.add(actor.root);
      out.set(def.id, { def, actor, x, z });
    }),
  );

  return out;
}

/** 0..1 from a string, so an id maps to the same idle offset on every client. */
function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}
