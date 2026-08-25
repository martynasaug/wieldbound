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
import { TOWN_NPCS, npcPoseAt, type NpcBody, type TownNpc } from "../../../shared/town";
import { Actor } from "./Actor";
// SURFACE, not terrain — the same distinction the player's own feet have been
// standing on since M55.3, and townspeople were left behind by it. The drawn
// ground is the smooth field sampled on a 1.63-unit grid and joined with flat
// triangles, so it rides above the field across a quarter of the world; a
// shopkeeper placed on the field is a shopkeeper up to 0.14 units into the
// cobbles. They stand in one place for the life of the world, which makes it
// the one case where being slightly sunk is permanent rather than passing.
import { surfaceHeight, toWorldX, toWorldZ } from "./World";

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
  /**
   * Where they are, in SERVER pixels — the same units their post is in, and the
   * same units every range check in the game is in.
   *
   * It used to be world units and it used to be cached, because nothing here
   * ever moved. Both had to change together: a cached world position is a lie
   * the moment somebody has a beat, and a world position is the wrong thing for
   * the two callers that matter — deciding whether you are close enough to talk
   * and drawing a nameplate — since both of those are in server pixels.
   */
  x: number;
  y: number;
  /** Whether they were walking last frame. The ONE piece of state in here, and
   *  it exists so the standing heading is applied on arrival and then let go —
   *  see `updateNpcs`. */
  walking: boolean;
  /** The `pose.x`/`pose.y` and resulting ground height `surfaceHeight` last
   *  answered for, so an NPC standing still — which is nearly always, since a
   *  town of five people mostly is not mid-patrol — does not pay for the same
   *  terrain sample over again on every frame it has not moved. */
  lastPoseX: number;
  lastPoseY: number;
  groundY: number;
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
        // No through-walls outline. See the note on the option: the feature is
        // about the character you are responsible for, and a resident standing
        // behind a fixed piece of scenery is the one case where it paints a
        // permanent blue figure onto the thing instead of a passing hint.
        silhouette: false,
      });

      const pose = npcPoseAt(def);
      const px = toWorldX(pose.x);
      const pz = toWorldZ(pose.y);
      const groundY = surfaceHeight(px, pz);
      actor.snapTo(px, groundY, pz);
      // Server bearings are measured in the XY plane where +y is south, and
      // south is +z here — so a bearing turns into a direction with no sign
      // flip at all. Getting this wrong leaves everyone facing out of town,
      // which reads as a bug in the layout rather than in the conversion.
      const a = (pose.facingDeg * Math.PI) / 180;
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
      out.set(def.id, {
        def,
        actor,
        x: pose.x,
        y: pose.y,
        walking: pose.walking,
        lastPoseX: pose.x,
        lastPoseY: pose.y,
        groundY,
      });
    }),
  );

  return out;
}

/**
 * Moves everybody along their round.
 *
 * There is no state here and no integration: `npcPoseAt` is a pure function of
 * the wall clock, so this reads the answer rather than advancing toward it.
 * That is what makes it safe — the server resolves "can this player buy
 * something" against the identical call, so the shopkeeper the client draws and
 * the shopkeeper the server prices from are the same person by construction
 * rather than by two systems agreeing to stay in sync. The day/night cycle made
 * the same call for the same reason and has never needed a message either.
 *
 * The actor is SNAPPED rather than eased, and that is correct: these actors are
 * built with `interpolate: false` because nothing sends them positions, and
 * there is nothing to smooth toward when the exact position is already known
 * every frame.
 */
export function updateNpcs(npcs: Map<string, NpcVisual>, nowMs = Date.now()): void {
  for (const vis of npcs.values()) {
    const pose = npcPoseAt(vis.def, nowMs);
    vis.x = pose.x;
    vis.y = pose.y;
    if (!vis.actor.loaded) continue;
    const wx = toWorldX(pose.x);
    const wz = toWorldZ(pose.y);
    // Emberhold is levelled, so this is 0 for all five of them today — but it
    // is the ground's answer rather than an assumption, and it stops being 0
    // the first time anybody's beat crosses the wall.
    //
    // Only resampled on the frames where `pose` actually moved: an NPC's own
    // beat is idle far more often than not, and `surfaceHeight` is the same
    // terrain-sampling chain (bilinear `terrainHeight`, a `riverAt` bucket
    // search, a `FLAT_SPOTS` scan) that turned out to be the dominant per-frame
    // cost in `mist.ts`/`ambience.ts` earlier this session — paid here on
    // every standing townsperson, every frame, for an answer that cannot have
    // changed since the last one.
    if (pose.x !== vis.lastPoseX || pose.y !== vis.lastPoseY) {
      vis.lastPoseX = pose.x;
      vis.lastPoseY = pose.y;
      vis.groundY = surfaceHeight(wx, wz);
    }
    vis.actor.snapTo(wx, vis.groundY, wz);
    // Server bearings are XY with +y south, and south is +z here, so a bearing
    // becomes a direction with no sign flip — the same conversion the initial
    // facing uses, and the same one that leaves everybody staring out of town
    // if it is got wrong.
    const face = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      vis.actor.faceDirection(Math.cos(a), Math.sin(a));
    };

    if (pose.walking) {
      face(pose.facingDeg);
      vis.actor.play("walk");
    } else {
      // ONLY ON ARRIVAL, and this is the whole reason `walking` is remembered.
      // Setting the standing heading every frame would pin it, and the idle
      // glance works by nudging `targetFacing` — so a shopkeeper would be
      // overwritten back to attention a frame after every glance and never
      // move their head again. Handing it over once and letting go is what
      // keeps both behaviours.
      if (vis.walking) face(pose.facingDeg);
      vis.actor.play("idle");
    }
    vis.walking = pose.walking;
  }
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
