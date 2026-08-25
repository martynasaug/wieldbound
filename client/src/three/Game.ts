// The 3D client's orchestrator: owns the socket, the input, the actor pool and
// the frame loop. Replaces Phaser's WorldScene.
//
// Deliberately unchanged from the 2D client: the wire format, every formula in
// shared/, `net/socket.ts`, and all six DOM panels. Movement stays
// client-authoritative with the server validating, exactly as before — the
// renderer swap is not an excuse to change the trust model.

import * as THREE from "three";
import {
  INTERACTION_RANGE_PX,
  EMPTY_PASSIVES,
  ITEM_SLOTS,
  MONSTER_LABELS,
  MONSTER_STATS,
  NODE_LABELS,
  STATUSES,
  statusModifiers,
  type StatusId,
  schoolDef,
  passiveResist,
  ELEMENTAL_SCHOOLS,
  type DamageSchool,
  RARITIES,
  addPassives,
  SKILLS,
  STATION_LABEL,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  appearanceFromItems,
  attackRangeFor,
  classForWeapon,
  critDamageMultiplier,
  defaultAttackFor,
  doubleAttackChance,
  equippedBySlot,
  isRetreating,
  skillIsCast,
  bandAt,
  gatherDurationForLevel,
  gatherYieldFor,
  gearArmor,
  gearCritChance,
  gearDamageBonus,
  gearEvasion,
  gearMoveBonus,
  movePxPerSec,
  PLAYER_BODY_RADIUS_PX,
  resolveBodyCollision,
  playerAccuracy,
  playerAttackIntervalMs,
  playerCritChance,
  playerMaxHit,
  playerMinHit,
  primaryStatValue,
  regenAmountForVitality,
  hasActive,
  talentPassives,
  applyAttackSpeed,
  applyDamagePercent,
  isEnraged,
  weaponDef,
  xpBonusPercent,
  xpToNextLevel,
  type Appearance,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
  type MonsterKind,
  VISIBLE_GEAR_SLOTS,
  DAY_LENGTH_MS,
  appearanceClass,
  gameClock,
  isDaytime,
  type CharacterClass,
  type MonsterState,
  type PlayerState,
  type ResourceNodeState,
  type CraftingStationState,
  type DroppedItemState,
  type SkillId,
} from "../../../shared/protocol-types";
import { SkillFx, fxFor } from "./skillfx";
import { Minimap } from "../ui/Minimap";
import { GameSocket } from "../net/socket";
import { CharacterPanel } from "../ui/CharacterPanel";
import { StatusBar } from "../ui/StatusBar";
import { InventoryPanel } from "../ui/InventoryPanel";
import { CraftPanel } from "../ui/CraftPanel";
import { SkillPanel, type WeaponProgressView } from "../ui/SkillPanel";
import { LeaderboardPanel } from "../ui/LeaderboardPanel";
import { CombatLog } from "../ui/CombatLog";
import { TargetFrame } from "../ui/TargetFrame";
import { ATTACK_SLOT, Hotbar, type BarAction } from "../ui/Hotbar";
import { Actor } from "./Actor";
import { PLAYER_BODY } from "./gear";
import { loadClipLibrary } from "./clips";
import { loadWardrobe } from "./wardrobe";
import { Hud } from "./hud";
import { Floaters, type FloatSpec } from "./floaters";
import { Drops } from "./drops";
// `isUpgrade` is presentation, not a rule: it decides whether to draw a mark,
// and lives beside the other things that decide how an item is shown.
import { isUpgrade } from "../ui/items";
import { Effects, isEffectName, type EffectName } from "./effects";
import { Indicators } from "./indicators";
import { ATTACK_STYLES, Projectiles, attackStyle, impactDelayMs } from "./attacks";
import { LightPool } from "./lightPool";
import { playSfx, preloadSfx, toggleMuted } from "./sfx";
import { unlockAudio } from "./audio";
import { Soundscape } from "./soundscape";
import {
  FOG_FAR,
  FOG_NEAR,
  PX_PER_UNIT,
  WORLD_UNITS_H,
  WORLD_UNITS_W,
  World,
  CAMERA_MAX_DISTANCE,
  terrainHeight,
  surfaceHeight,
  toServerX,
  toServerY,
  toWorldX,
  toWorldZ,
} from "./World";
import { instantiate, loadModel, whenLoadsSettle } from "./assets";
import { warmInBackground } from "./warmer";

/**
 * An XZ position, plus the height of the ground under it.
 *
 * Spread into every call that used to pass a literal 0 for Y. Height is a
 * rendering property and nothing else — every distance in this game is measured
 * in the XZ plane and no formula anywhere reads a Y — so this is the ONLY thing
 * that had to change to put actors on hills.
 */
function onGround(x: number, z: number): [number, number, number] {
  // SURFACE, not terrain. The two are the same everywhere except over the
  // Coldwater, where the terrain is the riverbed and the surface is the bridge
  // deck two units above it — and taking the terrain there is what had the
  // player walking under their own bridge, through the channel, while the road
  // they were following went over the top.
  return [x, surfaceHeight(x, z), z];
}
import { nightAmount } from "./daynight";
import { Town } from "./town";
import { buildNpcs, updateNpcs, type NpcVisual } from "./npcs";
import { profiler } from "./profiler";
import { FramePacer } from "./pacer";
import { DialoguePanel, type DialogueAction } from "../ui/DialoguePanel";
import { QuestTracker } from "../ui/QuestTracker";
import { EXCHANGE_OFFERS, EXCHANGE_RATE, SHOP_STOCK } from "../../../shared/shop";
import {
  QUESTS,
  objectiveLabel,
  offerStateFor,
  questsFrom,
  questSatisfied,
  rewardLabel,
  lockReason,
} from "../../../shared/quests";
import { landmarkById, landmarkPosition } from "../../../shared/landmarks";
import { buildWaystones, WAYSTONE_PLATE_HEIGHT, type WaystoneVisual } from "./waystones";
import { NorthRoad } from "./road";
import { River } from "./river";
import { Ambience } from "./ambience";
import { Mist } from "./mist";
import { Presence, type Mark } from "./presence";
import { ContactShadows, type Contact } from "./contact";
import { currentWind, updateWind } from "./wind";
import { NORTH_TOWN_NAME, NORTH_TOWN_SITE } from "../../../shared/road";
import { resolveRiverCollision } from "../../../shared/river";
import { placeNameAt } from "../../../shared/places";
import { forestStrengthAt } from "../../../shared/forests";
import {
  NPC_TALK_RANGE_PX,
  NPC_TETHER_PX,
  TOWN_CENTER,
  TOWN_NAME,
  TOWN_RADIUS_PX,
  resolveTownCollision,
} from "../../../shared/town";
import {
  CONSUMABLES,
  ITEM_BASES,
  MATERIALS,
  PALETTES,
  PALETTE_SCHOOL,
  PALETTE_SETS,
  type Material,
  activeSets,
  baseSchool,
  describeDropSources,
  canForge,
  describeCost,
  eligibleAffixes,
  forgeCost,
  setPassives,
  gearPassives,
  hitBandOf,
  itemBase,
  itemShortName,
  itemName,
  itemPassives,
  reachOf,
  reforgeCost,
  salvageYield,
  signatureOf,
  describeResists,
  weaponSchool,
  swingIntervalOf,
} from "../../../shared/items";

const PLAYER_HEIGHT = 1.8;

// Monster art, one row per kind. Every model is from Quaternius's Ultimate
// Monsters (CC0, glTF), so the stand-ins from M1 are gone. Height is chosen to
// read the kind's role at a glance — a golem should look like it has 14 armour
// before you attack it — not to match whatever scale the source was authored at.
const MONSTER_MODELS: Record<MonsterKind, { model: string; height: number }> = {
  slime: { model: "GreenBlob.gltf", height: 0.8 },
  mushnub: { model: "Mushnub.gltf", height: 0.95 },
  spikyblob: { model: "GreenSpikyBlob.gltf", height: 1.0 },
  goblin: { model: "Orc.gltf", height: 1.5 },
  armabee: { model: "Armabee.gltf", height: 1.0 },
  wolf: { model: "Dog.gltf", height: 1.0 },
  cactoro: { model: "Cactoro.gltf", height: 1.7 },
  orcbrute: { model: "Orc_Skull.gltf", height: 1.9 },
  ghost: { model: "Ghost.gltf", height: 1.5 },
  troll: { model: "Yeti.gltf", height: 2.3 },
  demon: { model: "Demon.gltf", height: 2.2 },
  golem: { model: "Goleling_Evolved.gltf", height: 2.8 },
  dragon: { model: "Dragon_Evolved.gltf", height: 3.4 },
};

const MOVE_SEND_INTERVAL_MS = 60;

// The world holds ~80 monsters and the server sends all of them in every
// snapshot, which is correct — it is authoritative and the client should not be
// deciding what exists. Rendering all 80 as animated skinned meshes is another
// matter: each one costs a skeleton update per frame. So models are built
// lazily when a camp comes near and torn down once it is well away. The gap
// between the two radii is hysteresis; with a single threshold a player walking
// the boundary would thrash a whole camp in and out every frame.
// 1150px is roughly a screen and a half at this camera, and comfortably beyond
// the 260px a monster will notice you from — so nothing ever pops in while it
// could matter. Set at 1500 initially, which rendered ~54 skinned meshes while
// standing at spawn because bands 1-3 all fell inside it.
/** How many rigs may be part-built at once. See `processMonsterSpawnQueue`. */
const MAX_ACTOR_BUILDS_IN_FLIGHT = 2;
const MAX_SPAWNS_PER_FRAME = 3;
const MONSTER_SPAWN_RADIUS_PX = 1150;
const MONSTER_DESPAWN_RADIUS_PX = 1550;
/** Despawns the engaged/locked target anyway past this distance, so a lock
 *  left on a monster the player has since walked away from cannot keep its
 *  actor alive forever. Well past any real reach or engage radius — this is
 *  a leak guard, not something a fight should ever actually reach. */
const MONSTER_HARD_DESPAWN_RADIUS_PX = 4000;

// How long after a monster's swing starts its hit is considered to land.
// Without a beat the damage number appears on the same frame as the wind-up,
// which reads as a number popping out of nowhere rather than as a blow
// connecting. Used for every melee monster; a thrower overrides this with its
// own real flight time below, and the PLAYER's beat comes from the weapon
// instead — see `impactDelayMs` in attacks.ts, where a flying attack lands
// when it arrives.
//
// Slowed alongside the player's own beats, on request — visual pacing only,
// same as attacks.ts: this does not touch `attackIntervalMs`, which is what
// actually governs how often a monster gets to swing.
const IMPACT_DELAY_MS = 210;

// The reach ring fades out once combat traffic stops, so it is not permanently
// drawn under a player who is just walking around.
const COMBAT_INDICATOR_TIMEOUT_MS = 3500;

/** How long the body may translate with a completely frozen pose before that
 *  counts as the slide bug rather than as one unlucky sample. A second is far
 *  longer than any crossfade and far shorter than a player's patience. */
const SLIDE_FREEZE_MS = 1000;
/** Below this, "moving" is float noise in the position, not travel. */
const SLIDE_MOVE_EPSILON_PX = 0.5;

// How far out an enemy will be picked up automatically. Wider than any weapon
// reaches, so the marker appears while you are still walking in and you know
// what you are about to fight before it is on top of you — but not so wide
// that crossing the map keeps flickering a ring onto distant camps.
const ENGAGE_RADIUS_PX = 340;

// A click within this many screen pixels of a monster counts as a click on it,
// even if the ray missed the mesh. A slime is under a metre tall and renders
// perhaps twenty pixels across at this camera; demanding a pixel-accurate hit
// on one is the difference between a targeting system and a test of aim.
const CLICK_SLACK_PX = 42;
// How much closer a rival has to be before auto-targeting abandons the enemy
// it is already on. Without a margin, two monsters jostling at nearly equal
// range swap the target every frame — which would be a worse experience than
// the clicking this replaces, and would spam the wire with selections.
const TARGET_STICKINESS_PX = 26;
// Only monsters this close to the cursor are raycast at all. Keeps the picking
// cost to a couple of meshes instead of every monster on screen, which matters
// because this runs on pointer move as well as on click.
const PICK_CANDIDATE_PX = 90;

/**
 * How big a hit has to be, as a share of the creature's own health, before it
 * rocks back. Same measure the floating damage numbers size themselves by, so
 * "a hit worth reacting to" means one thing in this file.
 */
const FLINCH_SHARE = 0.07;
/** And how long before it can be rocked again, so a dagger cannot stun-lock it
 *  out of the fight with an animation. */
const FLINCH_COOLDOWN_MS = 900;

interface MonsterVisual {
  actor: Actor;
  kind: MonsterKind;
  state: MonsterState;
  dead: boolean;
  /** Previous wind-up flag, so the telegraph cue fires on the edge not every tick. */
  windingUp: boolean;
  /** When the current wind-up started, for the target frame's timer bar. */
  windupStartedAt: number;
  /** Previous alert flag, so the shout cue fires on the edge, not every tick
   *  the flash is held. */
  alerted: boolean;
  /** Previous flee flag, so the break-and-run line fires on the edge, not
   *  every tick the monster spends running. */
  fleeing?: boolean;
  /** Latched run/idle decision — see `isMoving`. */
  moving: boolean;
  /** Previous opening flag, so the log line fires on the edge not every tick. */
  recovering?: boolean;
  /** Previous enrage flag, so the log line fires on the edge not every tick
   *  the monster spends past its own threshold. */
  enraged?: boolean;
}

// How far a snapshot-driven actor must travel between snapshots to count as
// running, and how still it must go before it counts as stopped. Two
// thresholds rather than one because a single one chatters: a monster holding
// position at the edge of its stop distance drifts a pixel back and forth, and
// on one threshold that flickers the run animation on and off every snapshot.
const MOVE_START_PX = 2.0;
const MOVE_STOP_PX = 0.7;

/**
 * How far out a contact shadow is still worth drawing, in world units.
 *
 * Well inside the fog, because the patch is a metre across and a metre at a
 * hundred units is a couple of pixels of very slightly darker grass. The point
 * of the bound is not the fill rate, it is that the instance pool is finite and
 * a camp behind the camera must never crowd the player's own feet out of it.
 */
const CONTACT_CULL_UNITS = 70;

/**
 * Whether a snapshot-driven actor should be running, measured between the last
 * two SERVER positions rather than between rendered ones.
 *
 * Rendered positions are interpolated, so they lag the truth: reading them says
 * "stopped" while the model is still visibly catching up, which plays the idle
 * animation over a sliding character — the ice-skating this is here to remove.
 * The server positions are the actual motion and have no lag to be fooled by.
 */
let disposeTracerInstalled = false;

/**
 * TEMPORARY DIAGNOSTIC. M70.54-58 chased the shader-recompile churn the F3
 * overlay's `[programs]` count exposed through four files by inferring the
 * culprit from cache-key numbers, each a real bug fixed by reading actual
 * code, none of them THE bug. The `fog === true` filter this carried
 * originally was itself a misread of the cache key — `parameters.fog` in
 * three.js's own `getParameters` is `!!scene.fog` (a scene-wide flag), not
 * `material.fog` (that one is `useFog`) — so it could never have fired on
 * the right thing. No filter this time: every `MeshBasicMaterial`/
 * `SpriteMaterial` dispose gets a short trace, unconditionally, so the
 * actual call site is read directly off the stack rather than inferred a
 * fifth time. Remove once the real source is found and fixed.
 */
function installDisposeTracer(): void {
  if (disposeTracerInstalled) return;
  disposeTracerInstalled = true;
  const proto = THREE.Material.prototype as THREE.Material & { dispose(): void };
  const original = proto.dispose;
  proto.dispose = function (this: THREE.Material) {
    if (this.type === "MeshBasicMaterial" || this.type === "SpriteMaterial") {
      const stack = new Error().stack?.split("\n").slice(1, 6).join("\n") ?? "(no stack)";
      console.warn(`[dispose-trace] ${this.type} disposed:\n${stack}`);
    }
    original.call(this);
  };
}

function isMoving(prevX: number, prevY: number, x: number, y: number, wasMoving: boolean): boolean {
  const travelled = Math.hypot(x - prevX, y - prevY);
  if (travelled > MOVE_START_PX) return true;
  if (travelled < MOVE_STOP_PX) return false;
  return wasMoving;
}

/**
 * The portrait glyph for each monster kind, on the target frame.
 *
 * One per kind rather than a handful of category glyphs. The portrait is the
 * largest thing in the frame, and standing a hood in for a slime reads as a
 * person you are about to fight — worse than no picture at all. The keys are
 * `monster-<kind>`, so adding a monster is a row here and a row in the icon
 * map, in step with the MONSTER_STATS row it already needs.
 */
const MONSTER_PORTRAIT: Record<MonsterKind, string> = Object.fromEntries(
  (Object.keys(MONSTER_STATS) as MonsterKind[]).map((kind) => [kind, `monster-${kind}`]),
) as Record<MonsterKind, string>;

/** The glyph on a resource node's nameplate, so kind reads without the word. */
const NODE_PLATE_ICON: Record<ResourceNodeState["kind"], string> = {
  tree: "wood",
  rock: "ore",
  bush: "herb",
};

/** Model options per harvestable kind, picked by a hash of the node's id. */
const NODE_MODELS: Record<ResourceNodeState["kind"], string[]> = {
  // THE PINES CAME OUT, and that is the rule that makes forests possible.
  //
  // Until this phase nothing scattered inside the play area was allowed to be a
  // tree at all, because the harvestable wood node IS one — so a scenery tree
  // would be scenery the player learns to click on. Six woods with names cannot
  // exist under that rule as written, so it is sharpened instead of broken: the
  // woodcutter's tree is the ROUND-CROWNED BROADLEAF and nothing else, and
  // every conifer, twisted trunk and dead stick belongs to the scenery. Giving
  // up the two pines this list used to borrow is the whole cost, and it buys a
  // silhouette the player can trust. See the header of shared/forests.ts.
  tree: [
    "nature/CommonTree_1.gltf", "nature/CommonTree_2.gltf", "nature/CommonTree_3.gltf",
    "nature/CommonTree_4.gltf", "nature/CommonTree_5.gltf",
  ],
  rock: ["nature/Rock_Medium_1.gltf", "nature/Rock_Medium_2.gltf", "nature/Rock_Medium_3.gltf"],
  // Only the flowering variant. `Bush_Common` ships textured with the kit's
  // TWISTED tree leaves, which are a deep autumnal red — a fine plant, but it
  // reads as dead scrub rather than as the thing you pick herbs off. It lives
  // in the treeline instead, where red is obviously deliberate.
  bush: ["nature/Bush_Common_Flowers.gltf"],
};

/** Longest the first load may hold the screen, however much is still in flight. */
const LOAD_CEILING_MS = 25000;

/** World-unit height range per kind, so a rock cannot come out tree-sized. */
const NODE_HEIGHTS: Record<ResourceNodeState["kind"], [number, number]> = {
  tree: [3.4, 4.6],
  rock: [0.85, 1.25],
  bush: [0.75, 1.05],
};

export class Game {
  private readonly world: World;
  private readonly hud: Hud;
  private readonly floaters: Floaters;
  private readonly drops: Drops;
  /** Last snapshot's drops, for the plates and the minimap. */
  private dropStates: DroppedItemState[] = [];
  private readonly socket: GameSocket;

  private readonly characterPanel: CharacterPanel;
  private readonly statusBar = new StatusBar();
  /** The server's clock, from the last snapshot. Status end times are the
   *  server's, so the sweeps have to drain against its clock rather than
   *  against this machine's — which may be a second out either way. */
  private serverTime = Date.now();
  private readonly inventoryPanel: InventoryPanel;
  private readonly craftPanel: CraftPanel;
  private readonly skillPanel: SkillPanel;
  private readonly leaderboardPanel: LeaderboardPanel;
  private readonly combatLog = new CombatLog();
  private readonly targetFrame = new TargetFrame();
  private readonly hotbar: Hotbar;
  private readonly dialogue = new DialoguePanel();
  private readonly questTracker = new QuestTracker();

  /** Emberhold: the buildings, the palisade, the cobbles and every lantern. */
  private readonly town = new Town();
  /** The five people standing in it. Keyed by NPC id, and deliberately a map of
   *  its own — an NPC in `players` or `monsters` would be selectable as an ally
   *  or attackable as an enemy, and both are wrong. */
  private npcs = new Map<string, NpcVisual>();
  /** The four standing stones. Built once and never touched again. */
  private waystones: WaystoneVisual[] = [];
  /** The way out of town. Its torches are the only lights outside the walls. */
  private readonly northRoad = new NorthRoad();
  private readonly river = new River();
  /** Butterflies, dragonflies, fireflies and birds — see ambience.ts. */
  private readonly ambience = new Ambience();
  /** Ground mist, where and when there would be. See mist.ts. */
  private readonly mist = new Mist();
  /** A pool of light under every person, so a figure is findable. See presence.ts. */
  private readonly presence = new Presence();
  /** And the shade under every body that stands on the ground. See contact.ts. */
  private readonly contacts = new ContactShadows(FOG_NEAR, FOG_FAR);
  private readonly contactList: Contact[] = [];
  /** The world, out loud. Derived like the hour and the wind — see soundscape.ts. */
  private readonly soundscape = new Soundscape();
  /** Scratch for the above, so a frame with five players allocates nothing. */
  private readonly marks: Mark[] = [];

  // --- authoritative local state (server position is in px, as in the 2D game)
  private playerId = "";
  private readonly name: string;
  private playerX = WORLD_WIDTH / 2;
  private playerY = WORLD_HEIGHT / 2;
  private lastSentX = -1;
  private lastSentY = -1;
  private lastSendAt = 0;

  private level = 1;
  private xp = 0;
  private hp = 50;
  private maxHp = 50;
  private mana = 0;
  private maxMana = 0;
  private strength = 0;
  private agility = 0;
  private vitality = 0;
  private intelligence = 0;
  private gatherLevel = 0;
  private battlePowerLevel = 0;
  private weaponRarity: ItemRarity | null = null;
  private armorRarity: ItemRarity | null = null;
  private bootsRarity: ItemRarity | null = null;
  private items: ItemInstance[] = [];
  private appearance: Appearance = { layers: {} };
  /**
   * The wallet, as one record keyed by the shared material list.
   *
   * Four named fields is four edits every time a material is added, and the
   * fourth one is always the one that gets missed — which is how the refined
   * tier would have reached the bench without reaching the bag. There are six
   * now and the next is a row in `shared/items.ts` and nothing here.
   */
  private wallet: Record<Material, number> = Object.fromEntries(
    MATERIALS.map((m) => [m, 0]),
  ) as Record<Material, number>;
  /** Base ids this character has learned to forge, by taking one apart. */
  private recipes: string[] = [];
  /** Runes held, by affix id. Counters, like consumables. */
  private runes: Record<string, number> = {};
  /** Whether the rune stock has arrived once, so an opening balance is not
   *  mistaken for something just drawn. */
  private runesSeen = false;
  /** Whether the wallet has arrived once, so the opening balance is not
   *  mistaken for something the player just earned. */
  private walletSeen = false;
  /** The same, for the recipe list. */
  private recipesSeen = false;
  /** The same again, for wood, ore and herb — the gathering paths that
   *  predate essence and never got essence's own "+N" acknowledgement. Three
   *  flags rather than one: the three messages do not all arrive in the same
   *  breath on connect, so a shared flag would already read true by the time
   *  a later one lands and congratulate a returning gatherer on a balance
   *  they walked in with. */
  private woodSeen = false;
  private oreSeen = false;
  private herbSeen = false;
  /** Quest ids completed as of the last `QUEST_STATE`, so a fresh id in the
   *  next one is a hand-in that just happened rather than the opening list a
   *  returning character always arrives with. */
  private completedQuests: string[] = [];
  private questsSeen = false;

  // Targeting has two halves, and keeping them apart is the whole design.
  //
  // `lockedId` is a deliberate choice: you clicked something, or tabbed to it.
  // It persists until it dies or you pick another, and it is the ONLY thing a
  // click changes.
  //
  // `engagedId` is what you are actually fighting this instant, worked out
  // every frame from the same rule the server auto-attacks by. It exists
  // because the server has always fought the nearest enemy for you whether or
  // not you ever clicked — but the client showed nothing unless you did, so
  // clicking *felt* mandatory when it never was. Deriving and drawing it is
  // what turns a click from a chore into an override.
  private lockedId: string | null = null;
  private engagedId: string | null = null;
  /** What is being channelled, so the pose can be held for its whole length. */
  private castingSkill: SkillId | null = null;
  /** Last selection actually sent, so auto-targeting does not spam the wire. */
  private sentTargetId: string | null = null;
  /** Cursor position, for the hover ring and forgiving clicks. */
  private pointerX = -1;
  private pointerY = -1;
  private hoverId: string | null = null;
  /** Last movement input direction, so a dash with no keys held still has a way to go. */
  private moveInputX = 0;
  private moveInputY = 0;

  private readonly players = new Map<string, Actor>();
  /**
   * Each remote player's own `Appearance`, kept for `updateWeaponAura` —
   * `setAppearance` consumes it to dress the rig immediately and does not
   * retain it, and the aura needs to re-ask "what is this player wearing"
   * every tick, not only on the frame a snapshot arrives.
   */
  private readonly playerAppearances = new Map<string, Appearance>();
  private readonly playerNames = new Map<string, string>();
  /**
   * What each remote player is wielding, for their nameplate's glyph.
   *
   * Kept from the same `Appearance` their body is dressed from, so the icon on
   * the plate and the rig on the field can never say different things — the
   * same reason the local player rebuilds its own appearance from its items
   * rather than from a second source.
   */
  private readonly playerClasses = new Map<string, CharacterClass>();
  /** Last SERVER position per remote player, so run/idle is decided from real
   *  motion rather than from the interpolated model — see `isMoving`. */
  private readonly playerMotion = new Map<string, { x: number; y: number; moving: boolean }>();
  private readonly monsters = new Map<string, MonsterVisual>();
  // Walking past the town gate can bring an entire camp into spawn radius on
  // the very same tick — a dozen-plus monsters whose models are already
  // cached, so `actor.load()` resolves in the same microtask flush and pays
  // its clone-the-skeleton-and-rebind-the-mixer cost for all of them back to
  // back, in one JS turn, before the browser gets to paint. Queuing new
  // spawns and building only a few per rendered frame spreads that same
  // total cost across enough frames that no single one of them is late.
  private readonly monsterSpawnQueue: string[] = [];
  private readonly pendingMonsterSpawns = new Map<string, MonsterState>();
  private readonly nodes = new Map<string, THREE.Object3D>();
  private readonly nodeStates = new Map<string, ResourceNodeState>();
  private readonly stations = new Map<string, THREE.Object3D>();
  private readonly stationStates = new Map<string, CraftingStationState>();
  /** Per-station forge fire, so it can flicker rather than burn as a flat lamp. */
  private readonly stationEmbers = new Map<
    string,
    { light: THREE.PointLight; glow: THREE.Mesh }
  >();

  private localActor: Actor | null = null;
  private readonly keys = new Set<string>();
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly fadedMaterials = new Set<THREE.Material>();
  private readonly effects: Effects;
  private readonly indicators: Indicators;
  private readonly projectiles: Projectiles;
  private readonly skillFx: SkillFx;
  private readonly minimap: Minimap;
  private readonly shakeScratch = new THREE.Vector3();
  private running = false;
  /** Last moment combat traffic arrived, used to show the reach ring only while fighting. */
  private lastCombatAt = 0;
  private actorBuildsInFlight = 0;
  /** The shared profiler. See profiler.ts — the loop runs about thirty
   *  subsystems and none of them had ever been timed, and the network dispatch
   *  that runs BETWEEN frames had no way to be timed at all. */
  private readonly profiler = profiler;
  /** Previous frame's `renderer.info.programs.length`, so a late shader
   *  compile can be caught by name-adjacent evidence instead of guessed at.
   *  `null` means "no reading yet" — the first frame is never a delta. */
  private lastProgramCount: number | null = null;
  /** Previous frame's program cache keys, so a count change can name what
   *  moved rather than just that something did. */
  private lastProgramKeys: Set<string> = new Set();
  /** Chooses how many display refreshes each frame lasts. See pacer.ts. */
  private readonly pacer = new FramePacer();
  // Watchdog bookkeeping — see `watchForSlide`. Held on the instance rather
  // than in the loop so a lock is measured across frames, which is the only
  // timescale it is visible on.
  private slideLastX = 0;
  private slideLastY = 0;
  private slidePose = -1;
  private slideFrozenMs = 0;
  private slideReported = false;
  /** Whether a standing attack order exists, per the server. */
  private attacking = false;
  private readonly dockButtons: { el: HTMLElement; isOpen: () => boolean }[] = [];
  /** Rail windows in the order they were opened, so the oldest can be evicted
   *  when a new one would not fit. */
  private readonly windowOrder: { id: string; close: () => void }[] = [];
  /** The held weapon's proficiency and learned talents, from the server. */
  private weaponProgress: WeaponProgressView | null = null;
  /** Ally selection is a separate slot from the enemy one, mirroring the server. */
  private allyTargetId: string | null = null;
  /** Last-seen HP for every remote player — see `PlayerState.hp`'s own
   *  comment for why this exists now. */
  private readonly playerHp = new Map<string, { hp: number; maxHp: number }>();
  /** Last-seen statuses for every remote player, same shape and reason as
   *  `playerHp` — see `PlayerState.statuses`'s own comment (M70.17). */
  private readonly playerStatuses = new Map<string, { id: StatusId; endsAt: number }[]>();

  constructor(container: HTMLElement, characterName: string) {
    this.name = characterName;
    this.world = new World(container);
    this.hud = new Hud(container);
    this.floaters = new Floaters(container);
    this.drops = new Drops(this.world.scene);
    this.minimap = new Minimap(container);
    this.effects = new Effects(this.world.scene);
    this.indicators = new Indicators(this.world.scene);
    // Shared by both, so combat's bolts and skill flashes draw from one fixed
    // set of lights rather than each churning its own — see lightPool.ts.
    const lightPool = new LightPool(this.world.scene);
    this.projectiles = new Projectiles(this.world.scene, lightPool);
    this.skillFx = new SkillFx(this.world.scene, lightPool);

    this.characterPanel = new CharacterPanel(
      (stat) => this.socket.sendAllocateStat(stat),
      (itemId) => this.socket.sendEquipItem(itemId),
    );
    this.inventoryPanel = new InventoryPanel(
      (itemId) => this.socket.sendEquipItem(itemId),
      (itemId) => this.salvageItem(itemId),
      (id) => this.socket.sendUseConsumable(id),
      (itemIds) => this.socket.sendSalvageMany(itemIds),
    );
    this.craftPanel = new CraftPanel(
      (stationId, baseId) => this.socket.sendForgeItem(stationId, baseId),
      (stationId, itemId, affix) => this.socket.sendReforgeItem(stationId, itemId, affix),
      (itemId) => this.salvageItem(itemId),
      (itemIds) => this.socket.sendSalvageMany(itemIds),
      (stationId, id) => this.socket.sendCraftConsumable(stationId, id),
      (stationId, id, count) => this.socket.sendRefineMaterial(stationId, id, count),
      (stationId, itemId, affix) => this.socket.sendDrawRune(stationId, itemId, affix),
      (stationId, itemId, affix, replacing) =>
        this.socket.sendEtchAffix(stationId, itemId, affix, replacing),
    );
    this.skillPanel = new SkillPanel(
      (nodeId) => this.socket.sendLearnTalent(nodeId),
      (weapon) => this.socket.sendResetTalents(weapon),
    );
    this.leaderboardPanel = new LeaderboardPanel(characterName);
    this.hotbar = new Hotbar(
      (action) => this.useAction(action),
      (weapon, layout) => this.socket.sendSetHotbar(weapon ?? "fist", layout),
    );

    this.socket = new GameSocket("ws://localhost:8080", characterName, {
      onWelcome: (p) => this.onWelcome(p),
      onSnapshot: (p) => this.onSnapshot(p),
      onInventoryUpdate: (p) => {
        // Wood, ore and herb are the gathering loop this whole game opens with,
        // and the one reward in it with no acknowledgement at all — "gather"
        // has been a real, mixed, preloaded sound cue since Phase 39 with no
        // caller anywhere, and essence/runes/recipes all got a "+N" floater
        // long before the material that started the loop did.
        const gained = this.woodSeen ? p.wood - this.wallet.wood : 0;
        this.woodSeen = true;
        if (gained > 0 && this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "loot", text: `+${gained} wood`, color: "#c9a26a", headY: 3.2, weight: 0.15,
          });
          playSfx("gather", 0.6);
        }
        this.wallet.wood = p.wood;
        this.gatherLevel = p.gatherLevel;
        this.syncMaterials();
      },
      // One message for the whole wallet. Wood, ore and herb each still have
      // their own for the gathering paths that predate essence, but anything
      // that spends — the smithy's three verbs — reports through this.
      onMaterials: (p) => {
        // Essence is the one material with no gathering animation and no node to
        // stand at — it simply appears off a kill — so it is the one that most
        // needs saying. Floated over the character in its own colour rather
        // than left as a line in the corner.
        // Not on the first message: a returning character's whole balance
        // arrives at once and is not something they just earned.
        const gained = this.walletSeen ? (p.essence ?? 0) - this.wallet.essence : 0;
        // Ingot and Wardweave are the forge's own output (REFINE_MATERIAL) and
        // arrive through this exact same message — the identical "reward with
        // no acknowledgement" gap M70.1 fixed for wood/ore/herb, one verb over:
        // a refine can mint up to 50 in a single click and nothing said so.
        // Read as a real delta rather than assumed +1, for the same reason.
        const ingotGained = this.walletSeen ? (p.ingot ?? 0) - this.wallet.ingot : 0;
        const weaveGained = this.walletSeen ? (p.weave ?? 0) - this.wallet.weave : 0;
        this.walletSeen = true;
        if (gained > 0 && this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "loot",
            text: `+${gained} essence`,
            color: "#c0a6ff",
            headY: 3.2,
            weight: 0.15,
          });
        }
        if (ingotGained > 0 && this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "loot",
            text: `+${ingotGained} ingot`,
            color: "#c7d0da",
            headY: 3.2,
            weight: 0.15,
          });
        }
        if (weaveGained > 0 && this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "loot",
            text: `+${weaveGained} wardweave`,
            color: "#c9935a",
            headY: 3.2,
            weight: 0.15,
          });
        }
        // Copied by the shared list rather than field by field, so a material
        // the server knows about cannot go missing on the way to the panels.
        for (const m of MATERIALS) this.wallet[m] = p[m] ?? 0;
        this.syncMaterials();
      },
      onConsumables: (p) => {
        this.inventoryPanel.setConsumables(p.counts, p.cooldownRemainingMs);
      },
      onQuestState: (p) => {
        // Handing a quest in is arguably the biggest single moment this loop
        // has — a story beat and a reward at once — and it was the one with
        // no acknowledgement beyond the tracker panel quietly losing a row.
        // Essence, runes and recipes all got a floater or a sound for far
        // smaller moments than this one long before it did.
        if (this.questsSeen) {
          const justDone = p.completed.filter((id) => !this.completedQuests.includes(id));
          for (const id of justDone) {
            const def = QUESTS.find((q) => q.id === id);
            const label = def ? def.name : "Quest";
            if (this.localActor) {
              this.floaters.spawn(this.localActor.position, {
                kind: "loot", text: `Quest complete: ${label}`, color: "#ffd873", headY: 3.2, weight: 0.2,
              });
            }
            this.hud.toast(label, "#ffd873");
            playSfx("levelup", 0.6);
          }
        }
        this.questsSeen = true;
        this.completedQuests = p.completed;
        this.questTracker.setState(p.active, p.completed);
        // A conversation open on the giver is redrawn in place, so accepting or
        // handing in changes the list you are looking at rather than leaving a
        // stale row that does nothing when clicked.
        const openId = this.dialogue.openNpcId;
        const npc = openId ? this.npcs.get(openId) : null;
        if (npc) this.dialogue.setActions(this.dialogueActionsFor(npc));
      },
      onRunes: (p) => {
        // A rune arriving is the payoff for having destroyed something, so it
        // gets the same acknowledgement essence does rather than a line in the
        // log. Guarded against the opening state on its own flag, like the
        // wallet and the recipe list: all three land within a moment of each
        // other on connect, and borrowing one flag for another congratulates a
        // returning smith on everything they already had.
        const before = Object.values(this.runes).reduce((n, v) => n + v, 0);
        const after = Object.values(p.counts).reduce((n, v) => n + v, 0);
        if (this.runesSeen && after > before && this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "loot", text: "rune drawn", color: "#c0a6ff", headY: 3.2, weight: 0.15,
          });
          playSfx("levelup", 0.5);
        }
        this.runesSeen = true;
        this.runes = p.counts;
        this.craftPanel.setRunes(this.runes);
      },
      onRecipes: (p) => {
        // Learning a recipe is the moment the smithy's loop closes, and it
        // arrives as one line among several after a salvage. Worth a sound of
        // its own, or a player who is not reading the log never notices that
        // salvaging taught them anything.
        // Its own flag, not the wallet's: the two messages arrive one after the
        // other on connect, so borrowing `walletSeen` would already be true by
        // the time the opening recipe set lands and a returning smith would be
        // congratulated on everything they already knew.
        const isNew = this.recipesSeen && p.known.length > this.recipes.length;
        this.recipesSeen = true;
        if (isNew) {
          playSfx("levelup", 0.55);
        }
        this.recipes = p.known;
        this.craftPanel.setRecipes(this.recipes);
      },
      onHerbUpdate: (p) => {
        const gained = this.herbSeen ? p.herb - this.wallet.herb : 0;
        this.herbSeen = true;
        if (gained > 0 && this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "loot", text: `+${gained} herb`, color: "#8fd15a", headY: 3.2, weight: 0.15,
          });
          playSfx("gather", 0.6);
        }
        this.wallet.herb = p.herb;
        this.syncMaterials();
      },
      onOreUpdate: (p) => {
        const gained = this.oreSeen ? p.ore - this.wallet.ore : 0;
        this.oreSeen = true;
        if (gained > 0 && this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "loot", text: `+${gained} ore`, color: "#9fa8b3", headY: 3.2, weight: 0.15,
          });
          playSfx("gather", 0.6);
        }
        // Ore's own message resends wood alongside it (a rock-gathering tick
        // touches the same wallet snapshot the tree path does), so this is
        // not a second gain — the diff above is keyed to `ore` alone.
        this.wallet.wood = p.wood;
        this.wallet.ore = p.ore;
        this.battlePowerLevel = p.battlePowerLevel;
        this.syncMaterials();
      },
      onXpUpdate: (p) => {
        // XP was the one reward with no acknowledgement anywhere in the world —
        // it moved a bar in the corner and nothing else. A kill should say what
        // it was worth where the player is looking, which is at the corpse.
        const gained = p.leveledUp ? 0 : p.xp - this.xp;
        if (gained > 0 && this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "xp", text: `+${gained} XP`, headY: 2.6, weight: 0.1,
          });
        }
        this.xp = p.xp;
        this.level = p.level;
        this.hud.setXp(this.xp, xpToNextLevel(this.level), this.level);
        this.characterPanel.setIdentity(this.name, this.level);
        if (p.leveledUp) {
          this.combatLog.push(`Level up! You are now level ${this.level}.`, "#ffd873");
          this.hud.toast(`Level up — ${this.level}`, "#ffd873");
          this.refreshClassUi();
          playSfx("levelup");
          const self = this.localActor;
          if (self) {
            this.effects.play("holy", self.position.x, self.position.y + 1.0, self.position.z, {
              scale: 3.4, tint: 0xffd873, durationMs: 900,
            });
          }
        }
      },
      onLootUpdate: (p) => {
        // Named, and coloured by its quality — "Found honed weapon" was the
        // anonymity the catalogue exists to remove, still leaking out of the
        // one line the player reads at the moment something drops.
        const colour = RARITIES[p.item.rarity]?.color ?? "#c9b47a";
        this.combatLog.push(`Found ${itemName(p.item)}.`, colour);
        // And the character bends down for it. `PickUp` is the other clip M55.1
        // harvested and nothing ever played: taking a thing off the ground was
        // walking over it and a line appearing in the log.
        this.localActor?.play("pickup");
        // Over the character, where they are looking, rather than only in a
        // corner. Picking something up is now a thing that happens in the
        // world — you walked to it — so the acknowledgement belongs there too.
        if (this.localActor) {
          this.floaters.spawn(this.localActor.position, {
            kind: "loot",
            text: itemShortName(p.item),
            color: colour,
            headY: 2.9,
            weight: 0.45,
          });
        }
        // The toast stays for the top two qualities only: a line in the corner
        // for every Worn dagger is noise, and noise is what makes a player stop
        // reading the corner at all.
        if (RARITIES[p.item.rarity]?.glow) {
          this.hud.toast(itemName(p.item), colour);
          playSfx("levelup", 0.7);
        }
      },
      onHpUpdate: (p) => this.onHpUpdate(p),
      onItemsUpdate: (p) => {
        this.items = p.items;
        this.weaponRarity = p.weaponRarity;
        this.armorRarity = p.armorRarity;
        this.bootsRarity = p.bootsRarity;
        this.onItemsChanged();
      },
      onStatsUpdate: (p) => {
        this.strength = p.strength;
        this.agility = p.agility;
        this.vitality = p.vitality;
        this.intelligence = p.intelligence;
        this.maxHp = p.maxHp;
        this.maxMana = p.maxMana;
        this.characterPanel.setAttributes({
          strength: p.strength,
          agility: p.agility,
          vitality: p.vitality,
          intelligence: p.intelligence,
          statPoints: p.statPoints,
        });
        this.hud.setHp(this.hp, this.maxHp);
        this.hud.setMana(this.mana, this.maxMana);
        this.refreshStats();
      },
      // A cast is the one thing in this game the player is in the middle of
      // rather than the owner of, so it gets a bar of its own and a pose to
      // match — a caster who stands in their idle for three quarters of a
      // second and then throws something has not cast anything, they have
      // paused.
      onCastState: (p) => {
        if (p.skillId) {
          this.castingSkill = p.skillId;
          this.hud.startCast(SKILLS[p.skillId]?.name ?? "Casting", p.castMs);
          // Channelling holds the cast pose for the length of the bar, which is
          // the whole visual point of a cast time — a character standing in
          // their idle for three quarters of a second and then throwing
          // something has not cast anything, they have paused.
          this.localActor?.play("cast");
          playSfx("cast", 0.55);
        } else {
          this.castingSkill = null;
          this.hud.endCast(p.reason === "moved" ? "Interrupted" : p.reason ? "Interrupted" : undefined);
          if (p.reason) {
            this.combatLog.push(`Cast interrupted — you moved.`, "#c98d5e");
            this.localActor?.play("idle");
          }
        }
      },
      onStatusUpdate: (p) => {
        this.statusBar.set(p.statuses);
        // The sheet reads statuses now, so it has to be redrawn when they
        // change — otherwise Rallied moves the armour the server resolves with
        // and the character window goes on showing the old figure.
        this.refreshStats();
        // `chilled`/`burning` have been monster-only calls since either
        // existed — the HUD status bar told a player they were slowed or
        // burning, but the character they were looking at never did. Same
        // states, same priority chain, now read off the player's own
        // statuses instead of only a monster's. `poisoned`/`bleeding` join
        // them here rather than being left to share chill's steady tint —
        // see `Actor.setPoisoned`.
        this.localActor?.setChilled(p.statuses.some((x) => x.id === "chilled"));
        this.localActor?.setBurning(p.statuses.some((x) => x.id === "burning"));
        this.localActor?.setPoisoned(p.statuses.some((x) => x.id === "poisoned"));
        this.localActor?.setBleeding(p.statuses.some((x) => x.id === "bleeding"));
      },
      onStatusTick: (p) => this.onStatusTick(p),
      onBattleResult: (p) => this.onBattleResult(p),
      onMonsterAttack: (p) => this.onMonsterAttack(p),
      onPotionsUpdate: (p) => {
        this.wallet.wood = p.wood;
        this.wallet.ore = p.ore;
        this.wallet.herb = p.herb;
        this.inventoryPanel.setPotions(p.potions);
        this.syncMaterials();
      },
      onTonicsUpdate: (p) => {
        this.wallet.wood = p.wood;
        this.wallet.ore = p.ore;
        this.wallet.herb = p.herb;
        this.inventoryPanel.setTonics(p.tonics);
        this.syncMaterials();
      },
      onLeaderboardUpdate: (p) => this.leaderboardPanel.setEntries(p.entries),
      onDailyBonus: (p) => {
        this.hud.toast(
          `Daily bonus: +${p.wood} wood, +${p.ore} ore, +${p.herb} herb, +${p.potions} potion`,
          "#7ed957",
        );
        this.combatLog.push("Daily bonus claimed.", "#7ed957");
      },
      onInfo: (p) => {
        this.hud.toast(p.text, p.color);
        this.combatLog.push(p.text, p.color);
      },
      onSkillResult: (p) => this.onSkillResult(p),
      onAttackState: (p) => this.onAttackState(p),
      onWeaponProgress: (p) => this.onWeaponProgress(p),
      onManaUpdate: (p) => {
        this.mana = p.mana;
        this.maxMana = p.maxMana;
        this.hud.setMana(this.mana, this.maxMana);
        this.hotbar.update(this.mana);
      },
    });
  }

  async start(): Promise<void> {
    this.running = true;
    // Debug handle. Movement and targeting are hard to diagnose from a
    // screenshot alone, and this is how the "keys stick after a panel steals
    // focus" bug was found.
    (window as unknown as Record<string, unknown>).__wieldbound = this;
    // The rule tables alongside the live state, so a console session can ask
    // "should these two be touching?" without guessing at the numbers. Body
    // radii in particular are invisible — there is nothing on screen that
    // draws them.
    (window as unknown as Record<string, unknown>).__wieldboundRules = {
      MONSTER_STATS,
      ATTACK_STYLES,
      impactDelayMs,
      // The catalogue too, since "why is this item called that" and "what does
      // this affix actually give me" are questions a console session asks
      // constantly, and neither is answerable from the item instance alone.
      ITEM_BASES,
      RARITIES,
      CONSUMABLES,
      // The three axes an item has, and what each of them MEANS: the palette
      // table itself, which element a material reads as, and which matched kit
      // it belongs to. "Why is this weapon dealing frost" is answered by two of
      // these together and by neither of them alone.
      PALETTES,
      PALETTE_SCHOOL,
      PALETTE_SETS,
      STATUSES,
      activeSets,
      baseSchool,
      weaponSchool,
      describeDropSources,
      canForge,
      eligibleAffixes,
      gearPassives,
      itemName,
      itemPassives,
      forgeCost,
      reforgeCost,
      salvageYield,
      // And the two conversions everything in the renderer goes through: where
      // the ground is at a point, and how a server pixel becomes a world unit.
      // A console session — or a probe — that keeps its own copy of either has
      // a second opinion about where things are, and this project has now
      // spent rounds on exactly that mistake three times.
      surfaceHeight,
      toWorldX,
      toWorldZ,
    };
    // Starts as the bare-handed body; WELCOME's appearance re-dresses it, and
    // swaps the rig outright if the saved character is already holding something.
    // `interpolate: false` because this actor's position is recomputed exactly
    // every frame by stepMovement; easing toward it would only add lag, and the
    // lag is what makes the character glide after you let go of the key.
    this.localActor = new Actor({
      model: PLAYER_BODY,
      height: PLAYER_HEIGHT,
      interpolate: false,
      // Yours is the strongest, because yours is the one you must never lose.
      rim: 0.5,
      // And the body is coloured from the name. See `tintBody` in Actor.ts.
      identity: this.name,
      warmUp: (object) => this.world.warmUp(object),
    });
    this.localActor.setAppearance(this.appearance);

    // Everything here used to run in a queue: the decor's forty-odd models,
    // then the character's rig, then the socket. None of the three depends on
    // either of the others, so the queue was pure waiting — the same mistake the
    // smithy's six props made inside one loop (M4.5), one level further up.
    //
    // Connecting FIRST matters most: the handshake, the character row and the
    // first snapshot all travel while the models download, so the world is
    // already populated the moment there is something to draw it into, instead
    // of appearing a beat after the ground does.
    this.bindInput();
    // `start` is reached from the Play button, which is the one gesture a
    // browser will let audio begin on. Everything downstream is written to be
    // safe before this, but nothing will make a sound until it has happened.
    unlockAudio();
    preloadSfx();
    // EVERY MONSTER MODEL, NOW, WHILE THERE IS A LOADING SCREEN TO HIDE IT.
    //
    // Sounds have been preloaded since Phase 39 and models never were, so the
    // first time each of the thirteen kinds came into view its glTF was fetched
    // and parsed on the main thread, mid-play. That is what the profiler was
    // reporting as multi-second stalls BETWEEN frames — 3798ms and 1161ms in
    // one session — which no amount of work on the render loop could ever have
    // touched, because none of it happens inside the loop.
    //
    // Deliberately not awaited: the loading screen already counts these through
    // `beginLoad`/`endLoad` inside `loadModel`, and blocking on them would
    // hold the world back for models the player will not meet for minutes. The
    // cache is keyed by name and `loadModel` returns the in-flight promise, so
    // a monster that does arrive early joins the same fetch rather than
    // starting a second one.
    for (const spec of Object.values(MONSTER_MODELS)) {
      void loadModel(spec.model).catch(() => {
        // A model that fails here fails again at spawn, where there is already
        // a path for it. Swallowed so one bad asset cannot reject its way out
        // of the start sequence.
      });
    }
    // And every weapon and armour model, in the background, whenever the
    // browser is idle. These were the OTHER lazy fetch — the one M70.36 did not
    // find, because preloading the monsters removed the stalls it was looking
    // at and left these behind: a 2914ms freeze mid-fight, still reported as
    // "BETWEEN frames". Not added to the loading screen, since most characters
    // will never hold most of this gear. See warmer.ts.
    warmInBackground(
      Object.values(ITEM_BASES)
        .map((base) => base.art?.model)
        .filter((m): m is string => typeof m === "string")
        // "rig:Warrior/Sword" means the mesh is harvested off a body rig, so
        // what has to be warmed is the body, not the path.
        .map((m) => (m.startsWith("rig:") ? m.slice(4).split("/")[0] : m)),
    );
    // Skill and weapon VFX, same as the gear above and for the same reason:
    // never a loaded model, so none of the warming above ever reaches it,
    // and a live cast was the first thing to pay for it — see
    // `SkillFx.prewarm`/`Projectiles.prewarm`.
    this.skillFx.prewarm(this.world);
    this.projectiles.prewarm(this.world);
    this.effects.prewarm(this.world);
    this.drops.prewarm(this.world);
    installDisposeTracer();
    this.socket.connect();

    // The town is generated rather than downloaded, so it costs a few
    // milliseconds and is on screen before the first tree arrives. Built before
    // the awaits for exactly that reason: spawn is inside it, and a player who
    // materialises on bare grass and watches a town assemble around them has
    // seen the seams.
    this.town.build(this.world.scene);
    // The one thing in the world the camera may not sit behind. See
    // World.clearDistance — walls move the camera, trees are faded instead.
    this.world.setCameraColliders(this.town.buildings);

    // The waystones, for the same reason and at the same moment: they are boxes
    // in the town's own palette, they cost a millisecond, and one of them is
    // the first thing a player walks toward once the watch has sent them out.
    // Into `decor`, which is the group the camera fades — see the note in
    // waystones.ts.
    this.waystones = buildWaystones(this.world.decor);

    // The road, and the fourteen torches down it. Into the scene rather than
    // `decor`: the ribbon is flat on the ground and can never stand between the
    // camera and the player, and fading a road would be fading the thing the
    // player is standing on.
    // The river, and it has to be built BEFORE the road: the road ribbon asks
    // the bridge how high its deck is, and the deck is measured from the water.
    // Both are cheap merged geometry, so this costs nothing but an order.
    this.world.scene.add(this.river.build());
    this.world.scene.add(this.northRoad.build());

    // The small living things. AFTER the river, because a dragonfly asks the
    // water how high it is; into the scene rather than `decor`, because the
    // camera-fade group exists for things that can stand between you and your
    // character, and nothing here is solid enough to.
    this.world.scene.add(this.ambience.build());

    // The mist, after everything it lies over. It writes no depth and sorts by
    // `renderOrder`, so where it goes in the graph decides nothing — but it
    // reads the river's surface height, which the river has to have built.
    this.world.scene.add(this.mist.mesh);
    // The shade first and the pool of light second, which is also their render
    // order: light falls ON the shaded ground rather than being eaten by it.
    this.world.scene.add(this.contacts.mesh);
    this.world.scene.add(this.presence.mesh);

    const decor = this.world.buildDecor();
    // Every animation a person can perform, harvested from all five character
    // files. Eagerly and in parallel with the body, because a clip fetched on
    // demand arrives after the swing it was fetched for — you would press
    // attack, stand still, and see it on the second blow, which reads as input
    // lag rather than as a missing file.
    const anims = loadClipLibrary();
    // And the kit's own cosmetic pieces, harvested off the four rigs nobody
    // wears any more. Same reason as the clips: a pauldron fetched at the moment
    // you equip a breastplate arrives after the breastplate does.
    const kit = loadWardrobe();
    const body = this.localActor.load();
    const people = buildNpcs(this.world.scene).then((npcs) => {
      this.npcs = npcs;
    });
    await Promise.all([decor, anims, kit, body, people]);
    // The models have parsed; their textures have not necessarily arrived, and
    // a first frame that repaints itself twenty megabytes at a time is exactly
    // what a loading screen exists to hide.
    //
    // Raced against a ceiling, though. A fetch that never settles — a proxy
    // holding a connection open, a file that 404s into an HTML page — would
    // otherwise leave the player watching a loading screen forever, and a world
    // missing one plant is enormously better than a world that never appears.
    await Promise.race([
      whenLoadsSettle(),
      new Promise<void>((resolve) => window.setTimeout(resolve, LOAD_CEILING_MS)),
    ]);

    this.world.scene.add(this.localActor.root);
    this.localActor.snapTo(...onGround(toWorldX(this.playerX), toWorldZ(this.playerY)));

    // COMPILE THE WHOLE WORLD BEFORE THE FIRST FRAME DRAWS IT.
    //
    // three.js compiles a material the first time it is rendered, so the very
    // first frame of a session compiles the terrain, the town, the river, the
    // road, every ground-cover species and every tree at once, inside
    // `render()`. The profiler caught it exactly: a 496ms frame whose worst
    // section was `render` at 465.8ms, immediately after the world finished
    // building. It is the single worst frame of a session by an order of
    // magnitude and it lands on the first one the player sees.
    //
    // Doing it here costs the same work — this is a compile either way — but it
    // happens while the loading screen is still up, where a pause is what the
    // screen is FOR, rather than as the opening stutter of the game.
    await this.world.warmUp(this.world.scene);

    // AND ONE FULL FRAME, WITH EVERYTHING STILL VISIBLE, TO UPLOAD IT.
    //
    // `warmUp` compiles programs; it does not touch buffers. WebGL uploads a
    // geometry's buffers the first time it is DRAWN, so every one of the 4542
    // ground-cover chunks and 584 forest chunks was paying for its own upload
    // the first frame it appeared — and M70.28's distance culling made that
    // worse rather than better, because it means most of the world is still
    // waiting to be drawn for the first time long after loading has finished.
    // Walking somewhere new then uploads a batch of them inside one `render()`,
    // which is what the profiler kept catching as 500ms and 919ms frames whose
    // worst section was `render` with nothing outside it.
    //
    // The culler has not run yet at this point — it is driven from `follow`,
    // inside the loop — so everything is still visible and one render touches
    // all of it. Buffers stay resident once uploaded, and `.visible = false`
    // never frees them, so this is paid once per session rather than per
    // chunk-first-seen. Expensive, and it happens under the loading screen.
    this.world.render();

    this.loop();
  }

  // ------------------------------------------------------------------ socket

  private onWelcome(p: Parameters<
    ConstructorParameters<typeof GameSocket>[2]["onWelcome"]
  >[0]): void {
    this.playerId = p.id;
    this.playerX = p.x;
    this.playerY = p.y;
    this.level = p.level;
    this.xp = p.xp;
    this.hp = p.hp;
    this.maxHp = p.maxHp;
    this.mana = p.mana;
    this.maxMana = p.maxMana;
    this.strength = p.strength;
    this.agility = p.agility;
    this.vitality = p.vitality;
    this.intelligence = p.intelligence;
    this.gatherLevel = p.gatherLevel;
    this.battlePowerLevel = p.battlePowerLevel;
    this.weaponRarity = p.weaponRarity;
    this.armorRarity = p.armorRarity;
    this.bootsRarity = p.bootsRarity;
    this.items = p.items;
    this.appearance = p.appearance;
    this.wallet.wood = p.wood;
    this.wallet.ore = p.ore;
    this.wallet.herb = p.herb;

    this.localActor?.snapTo(...onGround(toWorldX(this.playerX), toWorldZ(this.playerY)));

    this.hud.setIdentity(this.name, this.level);
    this.hud.setHp(this.hp, this.maxHp);
    this.hud.setMana(this.mana, this.maxMana);
    this.hud.setXp(this.xp, xpToNextLevel(this.level), this.level);

    this.characterPanel.setIdentity(this.name, this.level);
    this.characterPanel.setAttributes({
      strength: p.strength,
      agility: p.agility,
      vitality: p.vitality,
      intelligence: p.intelligence,
      statPoints: p.statPoints,
    });
    this.inventoryPanel.setPotions(p.potions);
    this.inventoryPanel.setTonics(p.tonics);
    this.onItemsChanged();
    this.syncMaterials();
    this.refreshClassUi();
    this.combatLog.push(`Welcome, ${this.name}.`, "#ffd873");
  }

  private onSnapshot(p: {
    serverTime?: number;
    players: PlayerState[];
    nodes: ResourceNodeState[];
    monsters: MonsterState[];
    stations: CraftingStationState[];
    drops?: DroppedItemState[];
  }): void {
    // Every status end time in the game is stamped on the server's clock, so
    // the sweeps drain against the server's clock. A machine an hour out of
    // step would otherwise show every buff as already expired.
    if (p.serverTime) this.serverTime = p.serverTime;
    this.syncPlayers(p.players);
    this.syncMonsters(p.monsters);
    // The monsters just moved, so where the player may stand has changed.
    this.resolvePlayerCollision();
    this.localActor?.setTargetPosition(
      ...onGround(toWorldX(this.playerX), toWorldZ(this.playerY)),
    );
    this.syncNodes(p.nodes);
    this.syncStations(p.stations);
    // Optional on the wire so a client can outlive a server that predates
    // ground loot; the empty list is the honest reading of "no drops".
    this.dropStates = p.drops ?? [];
    this.drops.sync(this.dropStates, (x, y) => ({
      x: toWorldX(x),
      y: surfaceHeight(toWorldX(x), toWorldZ(y)),
      z: toWorldZ(y),
    }));
  }

  private syncPlayers(states: PlayerState[]): void {
    const seen = new Set<string>();
    for (const s of states) {
      seen.add(s.id);
      if (s.id === this.playerId) continue; // local player is predicted, not snapped
      this.playerNames.set(s.id, s.name);
      this.playerClasses.set(s.id, appearanceClass(s.appearance));
      this.playerHp.set(s.id, { hp: s.hp, maxHp: s.maxHp });
      this.playerStatuses.set(s.id, s.statuses ?? []);
      let actor = this.players.get(s.id);
      if (!actor) {
        // Other players get one too, weaker: they are people rather than
        // scenery, and telling a player from a monster at a glance is worth as
        // much in a crowd as finding yourself is.
        actor = new Actor({
          model: PLAYER_BODY,
          height: PLAYER_HEIGHT,
          rim: 0.3,
          identity: s.name,
          warmUp: (object) => this.world.warmUp(object),
        });
        this.players.set(s.id, actor);
        this.playerMotion.set(s.id, { x: s.x, y: s.y, moving: false });
        // Warmed before it is shown, same as a monster — a player walking into
        // view compiles the same kind of shaders a monster does.
        const built = actor;
        void actor.load().then(async () => {
          built.root.visible = false;
          this.world.scene.add(built.root);
          await this.world.warmUp(built.root);
          built.root.visible = true;
          this.world.warmBuffers(built.root, "player");
        });
      }
      // Remote players are dressed from the same `Appearance` the local player
      // renders itself from, so there is one drawing path rather than a
      // self-case and an others-case that can drift apart.
      actor.setAppearance(s.appearance);
      this.playerAppearances.set(s.id, s.appearance);
      const x = toWorldX(s.x);
      const z = toWorldZ(s.y);
      const motion = this.playerMotion.get(s.id) ?? { x: s.x, y: s.y, moving: false };
      const moving = isMoving(motion.x, motion.y, s.x, s.y, motion.moving);
      actor.setTargetPosition(...onGround(x, z));
      if (moving) actor.faceDirection(s.x - motion.x, s.y - motion.y);
      actor.play(moving ? "run" : "idle");
      this.playerMotion.set(s.id, { x: s.x, y: s.y, moving });
      // Same four calls the local player's own body and every monster
      // already get (M70.9) — a remote party-mate's status was landing on
      // the wire (see `PlayerState.statuses`'s own comment) with nowhere
      // to go until now, so a burning or chilled ally read as untouched to
      // everyone standing next to them.
      const remoteStatuses = s.statuses ?? [];
      actor.setChilled(remoteStatuses.some((x) => x.id === "chilled"));
      actor.setBurning(remoteStatuses.some((x) => x.id === "burning"));
      actor.setPoisoned(remoteStatuses.some((x) => x.id === "poisoned"));
      actor.setBleeding(remoteStatuses.some((x) => x.id === "bleeding"));
    }
    for (const [id, actor] of this.players) {
      if (seen.has(id)) continue;
      actor.dispose();
      this.players.delete(id);
      this.playerNames.delete(id);
      this.playerClasses.delete(id);
      this.playerMotion.delete(id);
      this.playerAppearances.delete(id);
      this.nextGearAuraAt.delete(id);
      this.playerHp.delete(id);
      this.playerStatuses.delete(id);
    }
  }

  /**
   * Builds a few queued monster spawns, so a whole camp coming into range on
   * one snapshot does not pay every one of their skeleton-clone costs in a
   * single frame. See `monsterSpawnQueue` for why this exists.
   */
  private processMonsterSpawnQueue(): void {
    // BOUNDED BY WHAT IS STILL BEING BUILT, not only by how many are started.
    //
    // Three starts a frame reads like a throttle and only limits the cheap half.
    // `actor.load()` returns immediately; the expensive part — cloning the rig
    // through SkeletonUtils, cloning a material per mesh, binding six actions,
    // measuring lifts, building the silhouette and rim — happens in the
    // continuation, whenever the promise resolves. Nothing bounded THOSE, so
    // walking into a camp started a dozen builds within a few frames and their
    // continuations landed together, between frames, where no frame timer could
    // see them. That is the multi-second freeze the hitch reporter kept
    // attributing to "BETWEEN frames".
    //
    // Two in flight keeps a camp filling in visibly fast while never putting
    // more than two rig clones in one gap.
    if (this.actorBuildsInFlight >= MAX_ACTOR_BUILDS_IN_FLIGHT) return;
    for (let i = 0; i < MAX_SPAWNS_PER_FRAME; i++) {
      if (this.actorBuildsInFlight >= MAX_ACTOR_BUILDS_IN_FLIGHT) return;
      const id = this.monsterSpawnQueue.shift();
      if (id === undefined) return;
      const s = this.pendingMonsterSpawns.get(id);
      this.pendingMonsterSpawns.delete(id);
      // Already built by the time its turn came (should not happen, but a
      // stale queue entry must never overwrite a live actor), or the player
      // has since wandered far enough away that it is not worth building.
      if (!s || this.monsters.has(id)) continue;
      const distance = Math.hypot(s.x - this.playerX, s.y - this.playerY);
      if (distance > MONSTER_DESPAWN_RADIUS_PX) continue;
      const spec = MONSTER_MODELS[s.kind];
      // Seeded from the server id, so every client sees this particular
      // mushnub breathing at the same point in its loop as every other client
      // does — and so a camp of four is four creatures rather than one
      // animation played four times.
      const actor = new Actor({
        model: spec.model,
        height: spec.height,
        variance: (hashString(id) % 1000) / 1000,
        idleGlance: true,
        // NO THROUGH-WALLS SILHOUETTE, for the same reason the presence light
        // below is players-only: a monster behind a tree already has a
        // nameplate, a target ring, a difficulty colour and a minimap blip, and
        // the silhouette exists to answer "where am I / where is that person",
        // which nothing about a monster is asking.
        //
        // It is not free. `buildSilhouette` builds a SkinnedMesh GHOST of every
        // mesh in the rig, bound to the same skeleton — so every monster on
        // screen was a second full set of skinned draw calls, skinned again in
        // the shadow pass, and a second set of meshes to build in
        // `finishBody`, which the profiler was reporting at 60-100ms per rig.
        // Twenty monsters in view is twenty duplicate bodies drawn to say
        // something four other pieces of UI already say.
        silhouette: false,
      });
      const vis: MonsterVisual = { actor, kind: s.kind, state: s, dead: false, windingUp: false, windupStartedAt: 0, moving: false, alerted: false, fleeing: false };
      // Placed immediately, same as the old inline path did — otherwise the
      // model pops in at the scene origin for a frame before the next
      // snapshot ever reaches it.
      actor.setTargetPosition(...onGround(toWorldX(s.x), toWorldZ(s.y)));
      this.monsters.set(id, vis);
      // Added hidden, shown once its shaders are ready. Otherwise the first
      // frame that draws it compiles them inline — see `World.warmUp`. The
      // monster appears a beat later than it used to and no frame is spent
      // on it.
      this.actorBuildsInFlight++;
      void actor
        .load()
        .then(async () => {
          actor.root.visible = false;
          this.world.scene.add(actor.root);
          await this.world.warmUp(actor.root);
          actor.root.visible = true;
          this.world.warmBuffers(actor.root, s.kind);
        })
        .finally(() => {
          this.actorBuildsInFlight--;
        });
    }
  }

  private syncMonsters(states: MonsterState[]): void {
    for (const s of states) {
      const distance = Math.hypot(s.x - this.playerX, s.y - this.playerY);
      let vis = this.monsters.get(s.id);

      if (!vis) {
        // Far camps cost nothing at all — no model, no skeleton, no update.
        if (distance > MONSTER_SPAWN_RADIUS_PX) continue;
        // Queued rather than built here — see monsterSpawnQueue above. A
        // monster already waiting in the queue just gets its latest state
        // refreshed so `processMonsterSpawnQueue` places it correctly
        // whenever its turn comes.
        if (!this.pendingMonsterSpawns.has(s.id)) this.monsterSpawnQueue.push(s.id);
        this.pendingMonsterSpawns.set(s.id, s);
        continue;
      } else if (
        distance > MONSTER_DESPAWN_RADIUS_PX &&
        distance <= MONSTER_HARD_DESPAWN_RADIUS_PX &&
        (s.id === this.engagedId || s.id === this.lockedId)
      ) {
        // NOT while it is the thing being fought or the thing selected. A big
        // pack fight has the player kiting and the pack repositioning at the
        // same time, and the two together cross a fixed 400px hysteresis band
        // far more than a single approach ever does — so the monster actually
        // being fought was the one most likely to get torn down and rebuilt
        // mid-swing, which is exactly the moment a rebuild's cost (skeleton
        // clone, warm-up, first-draw pipeline finalization) is most visible as
        // a hitch.
        //
        // Bounded by `MONSTER_HARD_DESPAWN_RADIUS_PX` rather than exempted
        // outright: `engagedId` falls back to a stale `lockedId` even out of
        // reach (see `updateTargeting`'s case 3), so a lock left on something
        // the player has since walked well away from must still let go of its
        // actor eventually, or a long session accumulates one abandoned rig
        // per forgotten lock.
        continue;
      } else if (distance > MONSTER_DESPAWN_RADIUS_PX) {
        vis.actor.dispose();
        this.monsters.delete(s.id);
        // The server would still happily resolve a skill against something the
        // player can no longer see, so drop the selection with the model.
        if (this.lockedId === s.id) this.setTarget(null);
        continue;
      }
      const x = toWorldX(s.x);
      const z = toWorldZ(s.y);
      // Measured in server pixels between snapshots — see `isMoving`.
      const moving = isMoving(vis.state.x, vis.state.y, s.x, s.y, vis.moving);
      vis.moving = moving;

      vis.actor.setTargetPosition(...onGround(x, z));
      if (moving) vis.actor.faceDirection(s.x - vis.state.x, s.y - vis.state.y);

      // Chill is a gameplay signal (your Frost Nova is still working), so it
      // gets a colour rather than being inferred from the monster moving
      // slower. Read off the STATUS ITSELF now, not `s.slowed` — that flag is
      // true for anything with a moveMultiplier under 1 (poisoned, staggered
      // and chilled alike), so a poisoned or staggered monster used to glow
      // the exact blue meant to say "your Frost Nova worked," which taught
      // the wrong lesson about what had actually landed.
      const monsterStatuses = s.statuses ?? [];
      vis.actor.setChilled(monsterStatuses.some((x) => x.id === "chilled"));
      vis.actor.setBurning(monsterStatuses.some((x) => x.id === "burning"));
      vis.actor.setPoisoned(monsterStatuses.some((x) => x.id === "poisoned"));
      vis.actor.setBleeding(monsterStatuses.some((x) => x.id === "bleeding"));
      // THE BURST IS THE WHOLE MECHANIC, and until now it was invisible: the
      // server has moved this body at several times its own speed and the run
      // cycle kept playing at its ordinary rate, legs cycling as if nothing had
      // changed under them. Driving the same clip faster for the leap's own
      // duration is what makes closing the gap read as a lunge rather than a
      // glide.
      // Leaping and fleeing are mutually exclusive states on the AI's own
      // state machine, so one run-speed knob covers both: whichever burst is
      // in progress drives the clip, and the ordinary rate applies to neither.
      vis.actor.setLeaping(
        s.leaping
          ? MONSTER_STATS[vis.kind].leapSpeedMultiplier ?? 1
          : s.fleeing
            ? MONSTER_STATS[vis.kind].fleeSpeedMultiplier ?? 1
            : 1,
      );
      // The window a big creature leaves after committing a swing. Read off the
      // broadcast statuses rather than timed on the client, so what glows and
      // what actually takes half again as much damage are one answer.
      const opening = (s.statuses ?? []).some((x) => x.id === "recovering");
      vis.actor.setRecovering(opening);
      // SAID ONCE, ON THE EDGE. The window is the one genuinely skill-based
      // thing in the fight and it is worth nothing if the player has to infer
      // it from a damage number being larger than usual — so the first time
      // they open one, the log says what they have done and what it is for.
      // On the edge rather than every tick, because a line repeated sixty times
      // a second is not a line anybody reads.
      if (opening && !vis.recovering) {
        this.combatLog.push(`The ${MONSTER_LABELS[vis.kind]} overcommits — hit it now.`, "#ffa63d");
      }
      vis.recovering = opening;

      // SAID ONCE, ON THE EDGE, same as the wind-up and the shout: a monster
      // breaking off is a real turn in the fight, not something to notice
      // only once its HP bar is already gone.
      if (s.fleeing && !vis.fleeing) {
        this.combatLog.push(`The ${MONSTER_LABELS[vis.kind]} breaks and runs!`, "#ffa63d");
      }
      vis.fleeing = s.fleeing;

      // The opposite of fleeing: derived from hp/maxHp exactly like the
      // server derives it, rather than a wire flag — see `isEnraged`. Same
      // once-on-the-edge treatment as every other real turn in the fight.
      const enraged = isEnraged(s.hp, s.maxHp, MONSTER_STATS[vis.kind].enrageThreshold);
      if (enraged && !vis.enraged) {
        playSfx("alert", 0.9);
        vis.actor.flash(0xd6247f, 260);
        this.combatLog.push(`The ${MONSTER_LABELS[vis.kind]} enrages!`, "#ff4d6a");
      }
      vis.actor.setEnraged(enraged);
      vis.enraged = enraged;

      const nowDead = s.status === "dead";
      if (nowDead && !vis.dead) {
        vis.actor.play("die");
        vis.actor.setChilled(false);
        vis.actor.setRecovering(false);
        if (this.lockedId === s.id) this.setTarget(null);
        // THE BURST IS THE THING THAT HURT YOU, and until now nothing said so:
        // a slime or spiky blob's parting shot applied damage with no visual of
        // its own, which read as an ordinary hit landing a beat late. Drawn for
        // every nearby client rather than only whoever it damaged — the same
        // call the wind-up ring already makes — because a corpse detonating is
        // worth seeing whether or not you were standing close enough to feel it.
        const burstRadius = MONSTER_STATS[vis.kind].deathBurstRadiusPx;
        if (burstRadius) {
          const at = vis.actor.position;
          const tint = Number.parseInt(
            schoolDef(MONSTER_STATS[vis.kind].attackSchool).color.slice(1),
            16,
          );
          this.skillFx.nova(at.x, surfaceHeight(at.x, at.z), at.z, burstRadius / PX_PER_UNIT, tint);
        }
      } else if (!nowDead && vis.dead) {
        vis.actor.revive();
      } else if (!nowDead) {
        vis.actor.play(moving ? "run" : "idle");
      }

      // SOCIAL AGGRO WAS SILENT AND INVISIBLE. One hit on a monster with an
      // alert radius flips every same-kind packmate nearby into `chase` on the
      // same tick, and until now the only evidence was several bodies starting
      // to move at once — indistinguishable from wandering into four separate
      // aggro radii. A flash and a bark on the edge say the shout happened,
      // for whoever it woke and whoever raised it.
      if (s.alerted && !vis.alerted) {
        playSfx("alert", 0.8);
        vis.actor.flash(0xfff2b0, 220);
      }
      vis.alerted = s.alerted;

      // The wind-up needs a sound the moment it starts, or a player looking at
      // their own character never learns the danger circle appeared.
      if (s.windingUp && !vis.windingUp) {
        playSfx("cast", 0.8);
        vis.windupStartedAt = performance.now();
        // The body tells the same story the ring does. Stretched to the real
        // wind-up length so the swing finishes exactly as the slam lands,
        // rather than snapping out only at the moment of impact.
        const windupMs = MONSTER_STATS[vis.kind].windupMs;
        if (windupMs) vis.actor.playTelegraph("attack", windupMs);
      }
      vis.windingUp = s.windingUp;

      vis.dead = nowDead;
      vis.state = s;
    }
  }

  /**
   * The art for each harvestable kind.
   *
   * These are the three things in the world a player is meant to walk up to and
   * click, which is exactly why `scatter.ts` contains no tree, no boulder and no
   * bush: the ground cover has to stay unmistakably scenery. Rocks and bushes
   * used to be a bare dodecahedron and icosahedron — placeholders from M1 that
   * outlasted their welcome once everything around them had real art.
   */
  private async syncNodes(states: ResourceNodeState[]): Promise<void> {
    for (const s of states) {
      this.nodeStates.set(s.id, s);
      let obj = this.nodes.get(s.id);
      if (!obj) {
        // Claim the slot synchronously so a slow load cannot spawn duplicates
        // when several snapshots arrive before the model resolves.
        const placeholder = new THREE.Group();
        this.nodes.set(s.id, placeholder);
        this.world.scene.add(placeholder);
        obj = placeholder;
        void this.buildNode(s, placeholder);
      }
      obj.position.set(...onGround(toWorldX(s.x), toWorldZ(s.y)));
      // Depleted nodes dim rather than vanish, so the player can see where
      // they will come back — the same reasoning as the 2D tint. Stored as a
      // base rather than applied directly, because the occlusion fade below
      // multiplies against it and the two would otherwise fight each frame.
      const depleted = s.status !== "available";
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) m.userData.baseOpacity = depleted ? 0.35 : 1;
      });
    }
  }

  private async buildNode(state: ResourceNodeState, host: THREE.Group): Promise<void> {
    // Every kind varies its art by a hash of the server id, so each node looks
    // like itself and every player sees the same one — the 2D client hashed
    // ids for exactly this too.
    const variant = hashString(state.id);
    const options = NODE_MODELS[state.kind];
    const pick = options[variant % options.length];
    const [minH, maxH] = NODE_HEIGHTS[state.kind];
    const height = minH + ((variant >> 3) % 5) * ((maxH - minH) / 4);

    const inst = await instantiate(pick, height);
    // A node is a thing you walk up to and click, so it is always turned a
    // different way — three rocks in a row facing identically read as one rock
    // stamped three times.
    inst.object.rotation.y = (variant % 360) * (Math.PI / 180);
    host.add(inst.object);
  }

  /**
   * The workbench, which is a small smithy rather than one object.
   *
   * It was a grey box with a point light next to it — the last M1 placeholder
   * on screen, and once the ground and the treeline had real art it was the
   * only thing left that looked unfinished. It is also the one fixed landmark
   * in the world (spawn is here, and the difficulty bands radiate from it), so
   * it is worth more than a single prop.
   *
   * Laid out by hand rather than scattered: this is a place someone built, and
   * a random arrangement of a bench and a barrel reads as debris.
   */
  /**
   * Flickers every forge fire.
   *
   * Two sine waves at unrelated frequencies rather than a random walk: random
   * flicker is what everyone reaches for and it reads as a fault in the light
   * rather than as a fire, because real flame varies smoothly. Incommensurate
   * periods keep it from ever settling into an obvious loop.
   */
  /**
   * Hands the minimap a snapshot of where everything is.
   *
   * Built fresh each frame rather than kept in sync incrementally: the map is
   * a pure view of state that already exists, and an incrementally-maintained
   * copy is one more thing that can drift out of agreement with the world —
   * the same reasoning that keeps class derived from the equipped weapon
   * rather than cached. A few dozen objects a frame costs nothing.
   */
  private updateMinimap(): void {
    const self = this.localActor;
    if (!self) return;

    const monsters = [];
    for (const [id, vis] of this.monsters) {
      monsters.push({
        x: vis.actor.position.x,
        z: vis.actor.position.z,
        dead: vis.dead,
        engaged: id === this.engagedId,
        locked: id === this.lockedId,
        targetingMe: vis.state.targetId === this.playerId,
      });
    }

    const nodes = [];
    for (const state of this.nodeStates.values()) {
      nodes.push({
        x: toWorldX(state.x),
        z: toWorldZ(state.y),
        kind: state.kind,
        depleted: state.status !== "available",
      });
    }

    const stations = [];
    for (const state of this.stationStates.values()) {
      stations.push({ x: toWorldX(state.x), z: toWorldZ(state.y) });
    }

    const players = [];
    for (const actor of this.players.values()) {
      players.push({ x: actor.position.x, z: actor.position.z });
    }

    // Loot carries its quality's colour onto the map, so a violet dot at the
    // edge means the same thing there as it does on the plate and in the bag.
    const dropBlips = this.dropStates.map((d) => ({
      x: toWorldX(d.x),
      z: toWorldZ(d.y),
      color: RARITIES[d.item.rarity]?.color ?? "#dfe6e4",
    }));

    this.minimap.setSnapshot({
      drops: dropBlips,
      guides: this.objectiveGuides(),
      player: { x: self.position.x, z: self.position.z, facing: self.bearing },
      players,
      monsters,
      nodes,
      stations,
      bounds: { halfWidth: WORLD_UNITS_W / 2, halfHeight: WORLD_UNITS_H / 2 },
      place: placeNameAt(this.playerX, this.playerY),
    });
  }

  private updateForges(): void {
    const t = performance.now() / 1000;
    for (const { light, glow } of this.stationEmbers.values()) {
      const flicker = 0.82 + Math.sin(t * 7.3) * 0.11 + Math.sin(t * 2.9) * 0.07;
      light.intensity = 9 * flicker;
      // The visible coal breathes with the light, or the glow and the lighting
      // it is supposed to be casting visibly disagree.
      glow.scale.setScalar(0.9 + flicker * 0.16);
    }
  }

  private syncStations(states: CraftingStationState[]): void {
    for (const s of states) {
      this.stationStates.set(s.id, s);
      if (this.stations.has(s.id)) continue;

      const group = new THREE.Group();
      group.position.set(...onGround(toWorldX(s.x), toWorldZ(s.y)));
      this.world.scene.add(group);
      this.stations.set(s.id, group);

      // The forge fire, built first so the station is lit even while the models
      // are still loading — a dark hole at spawn for a second reads as a bug.
      const embers = new THREE.PointLight(0xff8b30, 9, 9, 2);
      // Beside the anvil, at about the height of a forge's coals.
      embers.position.set(1.5, 0.55, -0.9);
      group.add(embers);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffb257, fog: false }),
      );
      glow.position.copy(embers.position);
      group.add(glow);
      this.stationEmbers.set(s.id, { light: embers, glow });

      void this.buildStation(group);
    }
  }

  /** Places the smithy's pieces. Each is loaded and seated independently. */
  private async buildStation(group: THREE.Group): Promise<void> {
    // model, HEIGHT in world units, position, y-rotation.
    //
    // `instantiate` scales a model to a given height, so anything much wider
    // than it is tall comes out oversized: the bench at 1.15 units tall was
    // nearly three units long and dwarfed the player. Same trap the ground
    // cover hit — the dimension you normalise against encodes an assumption
    // about the model's proportions. These are tuned against a player, who
    // stands about 1.7 units.
    //
    // Nothing sits at the origin. The station's own position is where players
    // spawn and where they stand to craft, so leaving it clear is what stops a
    // character materialising inside the anvil.
    const pieces: [string, number, [number, number, number], number][] = [
      ["props/Anvil_Log.gltf", 0.85, [0.75, 0, -0.55], 0.5],
      ["props/Workbench.gltf", 0.72, [-1.25, 0, -0.35], 1.15],
      ["props/WeaponStand.gltf", 1.0, [0.35, 0, -1.75], -0.35],
      ["props/Barrel.gltf", 0.8, [1.5, 0, 0.85], 0.3],
      ["props/Crate_Wooden.gltf", 0.5, [-1.15, 0, 1.15], -0.7],
      ["props/Whetstone.gltf", 0.3, [0.15, 0, 1.15], 1.9],
    ];

    // Loaded in parallel, placed in order. Awaiting each in turn made the
    // smithy assemble itself over about twenty-four seconds, because these six
    // queue behind the forty-odd models the ground cover is fetching at the
    // same time — so the last pieces appeared long after the player had walked
    // away from spawn. They do not depend on each other, so nothing was being
    // bought by loading them one at a time.
    const loaded = await Promise.all(
      pieces.map(([model, height]) =>
        instantiate(model, height).catch((err) => {
          // A missing prop is a sparser smithy, not a broken station — but it
          // is still worth saying so. Swallowing this silently is how two of
          // the six went missing with no sign that anything had failed.
          console.warn(`[station] ${model} did not load:`, err);
          return null;
        }),
      ),
    );

    for (let i = 0; i < pieces.length; i++) {
      const inst = loaded[i];
      if (!inst) continue;
      const [, , [x, y, z], rotY] = pieces[i];
      inst.object.position.set(x, y, z);
      inst.object.rotation.y = rotY;
      group.add(inst.object);
    }
  }

  private onHpUpdate(p: { hp: number; maxHp: number; defeated: boolean; x?: number; y?: number }): void {
    const delta = p.hp - this.hp;
    this.hp = p.hp;
    this.maxHp = p.maxHp;
    this.hud.setHp(this.hp, this.maxHp);
    // NOT HERE ANY MORE. This was `play("hit")` on any HP decrease at all,
    // which caught every damage-over-time tick as well as every blow — see
    // `maybeFlinch` for what that measured out at. The reaction is driven from
    // `onMonsterAttack` now, which is where real blows arrive.

    // Healing was completely silent before — a potion looked identical to
    // nothing happening. The threshold keeps passive regen (1-5 HP every 5s)
    // from spraying numbers, while a potion or a Mend always shows.
    if (delta >= 8 && this.localActor) {
      const at = this.localActor.position;
      this.floatOnPlayer(this.localActor, { kind: "heal", text: `+${delta}` }, delta);
      this.effects.play("heal", at.x, at.y + 1.0, at.z, { scale: 2.4, tint: 0x7ed957, durationMs: 620 });
      playSfx("heal");
    }
    if (p.defeated) {
      this.combatLog.push("You were defeated.", "#ff6b6b");
      this.hud.toast("You were defeated.", "#ff6b6b");
      // The fight is over, so the numbers describing it should not outlive it
      // and drift over the respawn.
      this.floaters.clear();
      this.localActor?.play("die");
      if (p.x !== undefined && p.y !== undefined) {
        this.playerX = p.x;
        this.playerY = p.y;
        this.localActor?.snapTo(...onGround(toWorldX(p.x), toWorldZ(p.y)));
      }
      // OUTSIDE the coordinate check, and that is the whole point of the line.
      //
      // `play("die")` is unconditional and sets `oneShotUntil` to
      // MAX_SAFE_INTEGER, which is the one value in the animation state machine
      // that never expires on its own: while `currentAnim` is "die", every
      // `play("idle"/"walk"/"run")` hits a `busy` guard and returns silently,
      // forever. `revive` is the only thing that clears it — and it used to be
      // scheduled only when the server had also sent respawn coordinates, so a
      // defeat that arrived without them left the character permanently
      // animation-locked while `stepMovement` kept translating it: sliding
      // across the ground with no walk cycle and nothing in the console.
      //
      // All four of the server's defeat sites do pass a respawn position today.
      // That is exactly the kind of fact that is true until one of them is
      // added or edited, and there is no reason for the CLIENT's recovery from
      // its own pose to depend on the payload at all.
      setTimeout(() => this.localActor?.revive(), 900);
    }
  }

  // A swing is a beat, not an instant. The server tells us the outcome all at
  // once, but playing the wind-up and the impact on the same frame reads as the
  // number simply appearing — so the release goes now and the hit lands later.
  //
  // How much later is the weapon's business. A sword has a fixed beat because a
  // swing's timing belongs to the swing; an arrow's is its flight time over the
  // actual gap, so the number appears exactly when the arrow arrives, at every
  // range rather than at one lucky one.
  private onBattleResult(p: {
    monsterId: string;
    playerHit: boolean;
    playerCrit: boolean;
    playerDamage: number;
    monsterDefeated: boolean;
    school?: DamageSchool;
    resisted?: number;
  }): void {
    const vis = this.monsters.get(p.monsterId);
    this.lastCombatAt = performance.now();
    // FORCED, because Agility's double-attack lands as two of these messages
    // back to back — two independent rolls, two log lines, two floating
    // numbers — and `play`'s own guard (`currentAnim === anim` is a no-op
    // without this) swallowed the second swing outright: the pose was still
    // mid-clip from the first, so the body swung once for two hits that read
    // as one oddly generous number. Forcing it restarts the clip from frame
    // zero on every BATTLE_RESULT, which costs nothing on an ordinary single
    // swing — the guard only ever mattered for two arriving this close.
    this.localActor?.play("attack", true);
    // Instant, not eased — `launchAttack` below reads the muzzle bone's
    // position in this same tick, and the ordinary turn only closes a
    // fraction of the angle per frame. See `Actor.faceToward`'s own
    // comment: without this, a shot fired while turning to face a target
    // (backing off, then landing a swing) launched from wherever the
    // character had been facing a moment before, which read as firing
    // backwards.
    if (vis) this.localActor?.faceToward(vis.actor.position.x, vis.actor.position.z, true);

    // What the weapon actually does, and — for anything that flies — how long
    // it takes to get there. One table drives both, so the damage number can
    // never appear before its own arrow does.
    const style = attackStyle(this.appearance.weaponType);
    const gap = vis ? this.distanceTo(vis) : 0;
    const delay = impactDelayMs(style, gap);
    playSfx(style.releaseSfx);
    // A FROSTBRAND SWINGS THE SAME WHITE ARC A PLAIN SWORD DOES, because
    // every visual downstream of `style.tint` reads the WEAPON FAMILY and
    // never what it actually deals — the school only ever reached the
    // floating number and the log line. `p.school` is already on the wire
    // for exactly this; it had just never been asked.
    const elementTint =
      p.school && p.school !== "physical"
        ? Number.parseInt(schoolDef(p.school).color.slice(1), 16)
        : style.tint;
    if (vis) this.launchAttack(style, vis, delay, elementTint);

    const label = vis ? MONSTER_LABELS[vis.kind] : "enemy";

    window.setTimeout(() => {
      const target = this.monsters.get(p.monsterId);
      if (!p.playerHit) {
        this.combatLog.push(`You miss the ${label}.`, "#9a8d76");
        if (target) this.floatOnMonster(target, { kind: "miss", text: "Miss" });
        playSfx("miss");
        return;
      }

      // The school is SAID rather than merely coloured when the target has an
      // opinion about it. A tinted number tells a player which element landed;
      // it cannot tell them the thing in front of them shrugged most of it off,
      // and that second fact is the one that changes what they do next.
      const sch = schoolDef(p.school);
      const verdict = Game.resistNoteOf(p.resisted);
      this.combatLog.push(
        `You ${p.school && p.school !== "physical" ? sch.verb : "hit"} the ${label} for ` +
          `${p.playerDamage}${p.playerCrit ? " (CRIT)" : ""}${verdict}.`,
        p.playerCrit ? "#ffd85e" : sch.color,
      );
      playSfx(p.playerCrit ? "crit" : "hit");

      if (target) {
        this.maybeFlinch(target.actor, target.state.id, p.playerDamage, target.state.maxHp, p.playerCrit, FLINCH_SHARE);
        const at = target.actor.position;
        // Land the effect at the monster's middle, not a fixed height — a slime
        // is 0.8 units tall and a dragon 3.4, and a constant offset puts the
        // burst inside the ground on one and around the ankles of the other.
        const mid = at.y + MONSTER_MODELS[target.kind].height * 0.55;
        const size = Math.max(1.6, MONSTER_MODELS[target.kind].height * 1.3);

        target.actor.flash(p.playerCrit ? 0xffd85e : 0xffffff, p.playerCrit ? 190 : 120);
        // A crit is a fact about the SWING, not only about what it hit — every
        // other crit signal (the gold number, the bigger burst, the shake)
        // lands on the target or the screen, and the one body that never
        // showed anything for landing one was the player's own.
        if (p.playerCrit) this.localActor?.flash(0xffd85e, 150);
        this.floatOnMonster(
          target,
          {
            kind: "hit",
            text: `${p.playerDamage}`,
            crit: p.playerCrit,
            // A crit keeps its own gold, because "that was a crit" is a louder
            // fact than which element it was and two colours competing for one
            // number is two colours nobody reads.
            color: p.playerCrit ? undefined : schoolDef(p.school).color,
          },
          p.playerDamage,
        );
        // The mark the weapon leaves: an arc for blades, a shockwave for a
        // mace, an arcane bloom for a staff. Weight scales with the family, so
        // an axe lands visibly heavier than a dagger.
        this.effects.play(style.impact, at.x, mid, at.z, {
          scale: size * style.impactScale * (p.playerCrit ? 1.5 : 1.15),
          tint: p.playerCrit ? 0xffd85e : elementTint,
          durationMs: 420,
          spin: style.delivery === "melee" ? 0.05 : 0,
        });
        this.effects.play("impact", at.x, mid, at.z, {
          scale: size * style.impactScale * (p.playerCrit ? 1.25 : 0.95),
          tint: p.playerCrit ? 0xffc94a : elementTint,
          durationMs: 360,
        });
        // A real sparkle at the point of impact, not another flat atlas
        // frame — the same spark/glow/light `bolt` already earns its keep as
        // a bolt's core and the beam's muzzle flash, reused here as a
        // stationary flourish. Crit-only: every hit already gets a burst
        // from `fx.png`, and a sparkle on all of them would be noise rather
        // than the one moment it is meant to mark.
        if (p.playerCrit) {
          const flourish = new THREE.Vector3(at.x, mid, at.z);
          this.projectiles.bolt(flourish, flourish.clone().add(new THREE.Vector3(0, 0.06, 0)), 260, 0xffd85e);
        }
      }
      if (p.playerCrit) this.effects.shake(0.09, 150);

      if (p.monsterDefeated) {
        // A BOSS DYING IS NOT THE SAME MOMENT AS A SLIME DYING, and the game
        // already knows it — `guaranteedDrop` is the same flag the framed
        // nameplate and the target frame's elite border read — but the kill
        // itself played the identical burst either way. The three things
        // with a guaranteed drop are what a player walks a long way to find;
        // the death should say so.
        const boss = vis ? MONSTER_STATS[vis.kind].guaranteedDrop : false;
        this.combatLog.push(
          boss ? `You have defeated the ${label}!` : `You defeated the ${label}.`,
          boss ? "#ffd873" : "#7ed957",
        );
        playSfx("die");
        if (target) {
          const at = target.actor.position;
          this.effects.play("impact", at.x, at.y + 0.7, at.z, {
            scale: boss ? 4.2 : 2.6,
            tint: 0xffb066,
            durationMs: boss ? 760 : 520,
          });
        }
        if (boss) this.effects.shake(0.16, 260);
      }
    }, delay);
  }

  /**
   * Sends the blow on its way: an arrow or bolt in flight, a beam drawn
   * straight to the target, or nothing at all for melee, where the swing
   * animation is already the whole story.
   *
   * Everything leaves the weapon socket rather than the body, so an arrow
   * comes off the bow instead of out of the archer's chest.
   */
  private launchAttack(
    style: ReturnType<typeof attackStyle>,
    vis: MonsterVisual,
    flightMs: number,
    tint: number,
  ): void {
    const self = this.localActor;
    if (!self || style.delivery === "melee") return;

    const from = self.muzzlePosition(new THREE.Vector3());
    const at = vis.actor.position;
    const to = new THREE.Vector3(
      at.x,
      at.y + MONSTER_MODELS[vis.kind].height * 0.55,
      at.z,
    );

    if (style.delivery === "arrow") {
      this.projectiles.arrow(from, to, flightMs);
    } else if (style.delivery === "beam") {
      // Tinted by the school actually dealt, not the wand's own generic
      // purple — a fire wand's zap has to look like fire, not like every
      // other wand with a different number attached.
      this.projectiles.beam(from, to, tint);
    } else {
      // A bolt used to be a travelling fx quad from the 14-cell atlas, on the
      // reasoning that the effects system already carried the schools and the
      // travel so it needed no new art. True, and it made the mage's MAIN
      // ATTACK the least visible thing in the game: a soft 1.5-unit smudge
      // crossing three hundred pixels in a fifth of a second. It is real lit
      // geometry now.
      this.projectiles.bolt(from, to, flightMs, tint);
    }
  }

  private onMonsterAttack(p: {
    monsterId: string;
    hit: boolean;
    crit: boolean;
    damage: number;
    school?: DamageSchool;
    deathBurst?: boolean;
  }): void {
    const vis = this.monsters.get(p.monsterId);
    this.lastCombatAt = performance.now();
    if (vis) {
      // A TELEGRAPHING CREATURE HAS NO ORDINARY ATTACK (see the server's own
      // monster AI) — every MONSTER_ATTACK for one of these kinds is the slam,
      // and its swing was already playing, stretched across the wind-up that
      // just closed. Re-triggering it here would snap the pose back to frame
      // zero and play the whole thing again a beat after the hit already read.
      //
      // A DEATH BURST HAS NO SWING AT ALL — the corpse that sent it is about
      // to play `die` on the very next snapshot, and without this guard the
      // body lunged into an attack pose for a single frame before falling
      // over, which read as a lagged extra hit rather than the explosion it
      // actually was.
      if (MONSTER_STATS[vis.kind].windupMs === undefined && !p.deathBurst) {
        vis.actor.play("attack");
      }
      if (this.localActor) vis.actor.faceToward(this.localActor.position.x, this.localActor.position.z);
    }
    const label = vis ? MONSTER_LABELS[vis.kind] : "enemy";

    // WHAT IT THREW, IF IT THREW ANYTHING.
    //
    // A creature with a `keepAwayPx` fights from two hundred pixels off, and
    // without this the player takes fire damage from something standing across
    // the clearing with nothing whatsoever in between — which is worse than the
    // melee-only world it replaced, because at least a thing that touches you
    // is visibly touching you.
    //
    // Tinted by the school it deals, off the same table the player's own bolts
    // read, so a demon throws fire-coloured fire and a golem throws lightning.
    let flight = IMPACT_DELAY_MS;
    if (vis && this.localActor && MONSTER_STATS[vis.kind].keepAwayPx !== undefined) {
      const from = vis.actor.position.clone();
      from.y += MONSTER_MODELS[vis.kind].height * 0.6;
      const to = this.localActor.position.clone();
      to.y += 1.0;
      const gapPx = from.distanceTo(to) * PX_PER_UNIT;
      // Its own flight time over the real gap, the same rule the player's
      // arrows follow, so the damage number cannot beat the thing that caused
      // it to the target. Slowed alongside the player's own bolt, same reason.
      flight = Math.round(Math.max(140, Math.min(780, (gapPx / 680) * 1000)));
      const tint = Number.parseInt(schoolDef(p.school).color.slice(1), 16);
      this.projectiles.bolt(from, to, flight, tint);
    }

    window.setTimeout(() => {
      if (!p.hit) {
        this.combatLog.push(`The ${label} misses you.`, "#9a8d76");
        playSfx("miss", 0.7);
        return;
      }
      // Incoming damage keeps its red. Whose damage it is matters more to a
      // player mid-fight than what it was made of, and that is the one thing
      // the log's colours have always separated — so the school is in the WORD
      // ("burns you") and never in the colour.
      const verb = p.crit ? "CRITs" : p.school && p.school !== "physical" ? schoolDef(p.school).verb : "hits";
      if (p.crit) {
        // A crit stays its own line always — see `CombatLog.pushHit`'s own
        // comment for why merging it into a running count would bury it.
        this.combatLog.push(`The ${label} ${verb} you for ${p.damage}.`, "#ff8f5e");
      } else {
        // One shared key rather than `p.monsterId` — the whole point is
        // catching several DIFFERENT monsters landing hits close together,
        // which a per-attacker key would never merge at all (each kind's
        // own `attackIntervalMs` is seconds, not the couple hundred
        // milliseconds a merge window needs to be to mean "at once").
        this.combatLog.pushHit("monster-hit", label, verb, p.damage, "#ff9d9d");
      }
      playSfx("hurt");
      if (this.localActor) {
        const at = this.localActor.position;
        // A real blow, so it can rock you — and only a real blow reaches here.
        // Gated on the cooldown alone: see `maybeFlinch` for why a share of
        // health is the wrong ruler for a player.
        this.maybeFlinch(this.localActor, "self", p.damage, this.maxHp, p.crit, 0);
        this.localActor.flash(0xff6b6b, 130);
        this.floatOnPlayer(this.localActor, { kind: "taken", text: `-${p.damage}`, crit: p.crit }, p.damage);
        this.effects.play("impact", at.x, at.y + 1.0, at.z, {
          scale: p.crit ? 1.9 : 1.35,
          tint: 0xff7a5a,
          durationMs: 320,
        });
        // The mirror of the player's own outgoing sparkle — red rather than
        // gold, because incoming damage keeps its red regardless of school.
        if (p.crit) {
          const flourish = new THREE.Vector3(at.x, at.y + 1.0, at.z);
          this.projectiles.bolt(flourish, flourish.clone().add(new THREE.Vector3(0, 0.06, 0)), 260, 0xff6b4a);
        }
      }
      if (p.crit) this.effects.shake(0.11, 170);
    }, flight);
  }

  /**
   * Draws the geometry half of a skill's effect: the ring, cone, disc, pillar,
   * volley or chain that says what KIND of thing just happened.
   *
   * Placement follows the skill's own numbers rather than a per-skill constant,
   * so a rebalance that widens a radius widens the effect drawn for it — the
   * same rule M3.7 established when it derived a projectile's timing from its
   * real flight rather than from a matching constant.
   */
  private playSkillShape(
    skill: (typeof SKILLS)[SkillId],
    hits: { monsterId: string }[],
  ): void {
    const self = this.localActor;
    if (!self) return;
    const fx = fxFor(skill.id);
    const at = self.position;
    const radius = Math.max(1.2, skill.radiusPx / PX_PER_UNIT);
    const reach = Math.max(1.6, skill.rangePx / PX_PER_UNIT);

    // Where an area skill lands: on what it hit, or at the caster's feet when
    // it hit nothing — the same fallback the server uses when resolving one.
    const first = hits.length > 0 ? this.monsters.get(hits[0].monsterId)?.actor.position : undefined;
    const centre = first ?? at;

    // EVERY ONE OF THESE USED TO PASS A LITERAL ZERO for Y, and had since the
    // day skill shapes were added — which was fine for exactly as long as the
    // ground was a plane, and has been wrong since M53.3 gave it relief.
    // `onGround`'s own note says it was "spread into every call that used to
    // pass a literal 0 for Y"; these five were missed, and nothing catches a
    // number that is right everywhere the ground happens to be at sea level.
    //
    // Measured over the five bands the game is played in, where the surface
    // runs from -5.5 to +5.7 units: a shape drawn at zero is more than half a
    // unit off the ground across 38.7% of it and more than a whole unit —
    // over half a character's height — across 28.3%. So a nova rings out
    // underneath a hill, and a poison pool hangs in the air over a hollow.
    switch (fx.shape) {
      case "nova":
        this.skillFx.nova(at.x, surfaceHeight(at.x, at.z), at.z, radius, fx.color);
        break;
      case "ground":
        this.skillFx.ground(centre.x, surfaceHeight(centre.x, centre.z), centre.z, radius, fx.color);
        break;
      case "cone": {
        const facing = self.facingVector();
        this.skillFx.cone(
          at.x, surfaceHeight(at.x, at.z), at.z,
          Math.atan2(facing.x, facing.z), reach, fx.color,
        );
        break;
      }
      case "pillar":
        this.skillFx.pillar(at.x, surfaceHeight(at.x, at.z), at.z, fx.color);
        break;
      case "rain":
        this.skillFx.rain(centre.x, surfaceHeight(centre.x, centre.z), centre.z, radius, fx.color);
        break;
      // Both land ON A BODY rather than on the ground, so they are placed at the
      // struck creature's own middle — a slime is 0.8 units tall and a dragon
      // 3.4, and a constant offset puts the ring round one's ankles and inside
      // the other, which is the same trade the impact burst already makes.
      case "mark":
      case "strike": {
        const hit = hits.length > 0 ? this.monsters.get(hits[0].monsterId) : undefined;
        const on = hit?.actor.position ?? centre;
        const mid = hit ? on.y + MONSTER_MODELS[hit.kind].height * 0.55 : on.y + 1.0;
        if (fx.shape === "mark") this.skillFx.mark(on.x, mid, on.z, fx.color);
        else this.skillFx.strike(on.x, mid, on.z, fx.color);
        break;
      }
      case "chain": {
        // Hops caster -> first -> second -> ..., which is what the skill
        // actually does; drawing a bolt to each target from the caster would
        // show a fan and the skill is not one.
        let from = new THREE.Vector3(at.x, at.y + 1.1, at.z);
        for (const hit of hits) {
          const vis = this.monsters.get(hit.monsterId);
          if (!vis) continue;
          const to = new THREE.Vector3(vis.actor.position.x, vis.actor.position.y + 0.9, vis.actor.position.z);
          this.projectiles.beam(from, to, fx.color, 220);
          from = to;
        }
        break;
      }
      case "none":
      default:
        break;
    }

    if (fx.light) this.skillFx.flash(centre.x, 0, centre.z, fx.color);
  }

  private onSkillResult(p: {
    skillId: SkillId;
    ok: boolean;
    reason?: string;
    cooldownRemainingMs: number;
    globalCooldownMs: number;
    hits: {
      monsterId: string;
      hit: boolean;
      damage: number;
      crit: boolean;
      school?: DamageSchool;
      resisted?: number;
      empowered?: boolean;
    }[];
    healed?: number;
    buffMs?: number;
    slowMs?: number;
    consumed?: StatusId;
  }): void {
    const skill = SKILLS[p.skillId];

    if (!p.ok) {
      // A refusal has to say why, in the player's words rather than the
      // protocol's. Silently doing nothing is the single worst thing a hotbar
      // can do, and "cooling down" arriving as a log line nobody reads is
      // barely better — so it goes on screen where the press happened.
      this.hud.toast(`${skill.name}: ${p.reason ?? "failed"}`, "#c98d5e");
      this.combatLog.push(`${skill.name} — ${p.reason ?? "failed"}`, "#c98d5e");
      // Still honour a cooldown the server reports, or the bar lies about
      // readiness until the next successful cast.
      if (p.cooldownRemainingMs > 0) this.hotbar.startCooldown(p.skillId, p.cooldownRemainingMs);
      if (p.globalCooldownMs > 0) this.hotbar.startGlobalCooldown(p.globalCooldownMs);
      return;
    }

    this.lastCombatAt = performance.now();
    this.hotbar.startCooldown(p.skillId, p.cooldownRemainingMs);
    this.hotbar.startGlobalCooldown(p.globalCooldownMs);
    this.combatLog.push(`You cast ${skill.name}.`, "#9ad4ff");

    const school: EffectName = isEffectName(skill.effect) ? skill.effect : "arcane";
    const self = this.localActor;

    // The skill's own signature shape, on top of the atlas flash below. This is
    // what makes a nova, a cone and a chain look like three different things
    // rather than three tints of the same flash.
    this.playSkillShape(skill, p.hits);

    if (skill.kind === "mobility") {
      // Resolved client-side by design: movement is already client-authoritative
      // and the server's job was only to own the cooldown. Without this the
      // mobility skills consumed a cooldown and did nothing at all.
      this.performDash(skill.power, skill.id === "disengage");
      // A dash was a character sliding sideways in its running pose. The rig
      // has shipped a roll since M55.1 pooled the clips and nothing had ever
      // played it.
      self?.play("roll", true);
      playSfx("swing");
      if (self) {
        this.effects.play(school, self.position.x, self.position.y + 0.8, self.position.z, {
          scale: 2.2, tint: 0xcfe8ff,
        });
      }
      return;
    }

    // SWUNG OR CAST, by what the skill is and what is in your hands. This was
    // one `play("attack")` for all forty-three skills, so a sword user pressing
    // Mend did a sword swing and War Cry was a sword swing — while `Spell1` and
    // `Spell2` sat in the pooled library reachable only as a wand's ordinary
    // attack. See `skillIsCast` for the rule and for why a bow is the exception.
    self?.play(skillIsCast(skill, this.appearance.weaponType) ? "cast" : "attack");
    playSfx(skill.kind === "heal" ? "heal" : "cast");

    if (skill.kind === "heal" || skill.kind === "buff") {
      const beneficiary = this.allyTargetId ? this.players.get(this.allyTargetId) : null;
      const on = beneficiary ?? self;
      if (on) {
        this.effects.play(school, on.position.x, on.position.y + 1.0, on.position.z, {
          scale: 2.6,
          tint: skill.kind === "heal" ? 0x7ed957 : 0xffd873,
          durationMs: 620,
        });
      }
      if (p.healed && on) this.floatOnPlayer(on, { kind: "heal", text: `+${p.healed}` }, p.healed);
      if (p.buffMs) this.hud.toast(`${skill.name} active`, "#ffd873");
      // A cleanse that lifts something and says nothing is a cleanse the player
      // has to verify by watching an indicator disappear. Name what went.
      if (p.consumed) {
        const lifted = STATUSES[p.consumed]?.name ?? p.consumed;
        this.hud.toast(`${lifted} lifted`, "#7ed957");
        this.combatLog.push(`${lifted} lifted.`, "#7ed957");
      }
      return;
    }

    // Offensive. Radius skills burst at the caster; targeted ones travel.
    if (skill.radiusPx > 0 && skill.rangePx === 0 && self) {
      this.effects.play(school, self.position.x, self.position.y + 0.5, self.position.z, {
        scale: (skill.radiusPx / PX_PER_UNIT) * 2.1,
        durationMs: 560,
      });
      this.effects.shake(0.07, 160);
    }

    // Fired into empty air. The skill really did go off — mana and cooldown
    // are spent — so it has to look like it, or a press with nothing in range
    // is indistinguishable from a press that was ignored.
    if (p.hits.length === 0 && self && skill.radiusPx === 0) {
      const facing = self.facingVector();
      const throwPx = Math.min(skill.rangePx, 120) / PX_PER_UNIT;
      this.effects.play(
        school,
        self.position.x + facing.x * throwPx,
        self.position.y + 1.0,
        self.position.z + facing.z * throwPx,
        {
          scale: 1.7,
          from: new THREE.Vector3(self.position.x, self.position.y + 1.1, self.position.z),
          durationMs: 380,
        },
      );
      this.combatLog.push(skill.name + " finds nothing.", "#9a8d76");
    }

    let saidResist = false;
    // Said once per cast for the same reason `saidResist` is: a detonator that
    // finds the condition on four bodies is one event, not four log lines.
    let saidEmpowered = false;
    for (const hit of p.hits) {
      const vis = this.monsters.get(hit.monsterId);
      if (!vis) continue;
      const at = vis.actor.position;

      // A RANGED SKILL THROWS WHAT YOUR WEAPON THROWS.
      //
      // Every ranged skill used to be a travelling atlas quad — the same soft
      // 1.9-unit smudge whether it was a firebolt, an arrow or a bolt of
      // storm — and the three signature caster missiles (`arcanebolt`,
      // `firebolt`, `frostbolt`) had `shape: "none"` in `skillfx`, so on top of
      // that they threw nothing of their own at all. Reported as "you can
      // barely see them", which was generous.
      //
      // It reads the SAME `ATTACK_STYLES` table the ordinary attack does, so a
      // bow's Power Shot looses a real arrow and a staff's Firebolt throws a
      // lit bolt, without a second per-skill table to keep true. That is the
      // one rule this game is named for, one system across: what you are
      // holding decides how the spell arrives.
      //
      // And the number waits for it. A projectile that lands after its own
      // damage has already been counted is the exact defect the auto-attack
      // was fixed for in Phase 47 — so the impact, the flash and the floater
      // are all held back by the flight time.
      // Tinted by the SCHOOL the blow actually landed as, not by the skill's
      // own swatch: a Frostbrand-wielding warrior throwing a skill throws frost
      // and it should look like it.
      const tint = Number.parseInt(schoolDef(hit.school).color.slice(1), 16);
      let impactDelay = 0;
      if (skill.rangePx > 0 && self) {
        const muzzle = self.muzzlePosition(new THREE.Vector3());
        const strike = new THREE.Vector3(at.x, at.y + MONSTER_MODELS[vis.kind].height * 0.55, at.z);
        const style = attackStyle(this.appearance.weaponType);
        const gap = muzzle.distanceTo(strike) * PX_PER_UNIT;
        impactDelay = impactDelayMs(style, gap);
        if (style.delivery === "arrow") {
          this.projectiles.arrow(muzzle, strike, impactDelay);
        } else if (style.delivery === "beam") {
          this.projectiles.beam(muzzle, strike, tint);
        } else {
          // Melee families get one too when they cast at range — a thrown
          // skill is still something leaving your hands, and drawing nothing
          // is what the old "none" shapes did.
          this.projectiles.bolt(muzzle, strike, impactDelay, tint);
        }
      }

      const landImpact = () => {
        if (skill.rangePx > 0 || skill.radiusPx === 0) {
          this.effects.play(school, at.x, at.y + 0.9, at.z, { scale: 1.9 });
        }
      };
      if (impactDelay > 0) window.setTimeout(landImpact, impactDelay);
      else landImpact();

      // Held back by the flight time, so the number arrives with the thing
      // that caused it rather than before it.
      const land = () => {
        if (!hit.hit) {
          this.floatOnMonster(vis, { kind: "miss", text: "Miss" });
          return;
        }
        // A conditional the player cannot see is the failure this whole
        // feature has to avoid: Execute against something bleeding just does a
        // bigger number, and a bigger number is indistinguishable from a lucky
        // roll. So an empowered hit gets its own flash colour and its own mark
        // on the floater, and the log says which condition paid.
        this.maybeFlinch(vis.actor, vis.state.id, hit.damage, vis.state.maxHp, hit.crit || !!hit.empowered, FLINCH_SHARE);
        vis.actor.flash(hit.empowered ? 0xffa63d : hit.crit ? 0xffd85e : 0x9ad4ff, hit.empowered ? 220 : 150);
        this.floatOnMonster(
          vis,
          {
            kind: "skill",
            text: hit.empowered ? `${hit.damage}!` : `${hit.damage}`,
            crit: hit.crit,
            color: hit.crit ? undefined : hit.empowered ? "#ffa63d" : schoolDef(hit.school).color,
          },
          hit.damage,
        );
        playSfx(hit.crit ? "crit" : "hit", 0.8);
      };
      if (impactDelay > 0) window.setTimeout(land, impactDelay);
      else land();
      if (!hit.hit) continue;
      if (hit.empowered && !saidEmpowered) {
        saidEmpowered = true;
        const on = p.consumed ? STATUSES[p.consumed]?.name : null;
        this.combatLog.push(
          on
            ? `${skill.name} spends the ${on.toLowerCase()}.`
            : `${skill.name} finds its opening.`,
          "#ffa63d",
        );
      }
      // Said once for the cast rather than once per target: a Rain of Arrows
      // into six trolls should not write "it recoils" six times, and every
      // monster a single cast lands on shares a kind more often than not.
      const note = Game.resistNoteOf(hit.resisted);
      if (note && !saidResist) {
        saidResist = true;
        this.combatLog.push(
          `${MONSTER_LABELS[vis.kind]}${note}.`,
          schoolDef(hit.school).color,
        );
      }
    }

    if (p.slowMs) this.combatLog.push("Chilled.", "#8fd4ff");
  }

  /**
   * Mobility displacement. `away` sends you directly away from the nearest
   * enemy (Disengage); everything else surges the way you are moving, falling
   * back to your facing when standing still.
   */
  /**
   * Rocking back when something lands hard enough to rock you.
   *
   * ONE FUNCTION, TWO THRESHOLDS, and the asymmetry is the finding rather than
   * an inconsistency. The first version of this passed the same share of
   * health for both and the arithmetic said it could not work:
   *
   *     share of the player's health      burn tick   wolf max   troll SLAM
   *       level  1 (50 hp)                  12.0%       8.0%       54.4%
   *       level 40 (640 hp)                  0.9%       0.6%        4.3%
   *
   * A player's health grows far faster than anything's damage, so one share
   * threshold is simultaneously too loose at level 1 — where a burn TICK clears
   * it and locks you — and too tight at level 40, where a troll's slam does not
   * and you would never react to anything again.
   *
   * So the two are gated on what is actually wrong with each:
   *
   *   A MONSTER'S PROBLEM IS MAGNITUDE. A dagger lands three blows a second and
   *   a troll has a great deal of health, so chip damage must not rock it —
   *   hence a share, the same measure the floating numbers size themselves by.
   *
   *   A PLAYER'S PROBLEM IS FREQUENCY. Measured, a burning character in a pack
   *   of three wolves took 3.1 separate HP decreases a second, and since the
   *   hit clip is a one-shot that interrupts, they were stun-locked out of
   *   their own swing by the animation meant to acknowledge being hit. A hit is
   *   a hit whatever it was worth; what it may not do is happen twice in a
   *   beat. So: no share, and the cooldown does the work.
   *
   * And a damage-over-time tick never flinches ANYBODY, which is a categorical
   * rule rather than a threshold — you do not stagger from a burn. It is
   * enforced by where this is CALLED from: real blows arrive as
   * `MONSTER_ATTACK`, which the burst, the slam and the ordinary swing all
   * send and a tick does not.
   *
   * A crit always shows. That is the one moment the player most wants
   * acknowledged, and it is rare enough to be safe.
   */
  private readonly flinchReadyAt = new Map<string, number>();

  private maybeFlinch(
    actor: Actor | null | undefined,
    key: string,
    damage: number,
    maxHp: number,
    crit: boolean,
    shareGate: number,
  ): void {
    if (!actor) return;
    const now = performance.now();
    if (now < (this.flinchReadyAt.get(key) ?? 0)) return;
    if (!crit && damage / Math.max(1, maxHp) < shareGate) return;
    this.flinchReadyAt.set(key, now + FLINCH_COOLDOWN_MS);
    actor.play("hit");
  }

  private performDash(distancePx: number, away: boolean): void {
    let dx = this.moveInputX;
    let dz = this.moveInputY;

    if (away || (dx === 0 && dz === 0)) {
      let nearest: MonsterVisual | null = null;
      let best = Infinity;
      for (const v of this.monsters.values()) {
        if (v.dead) continue;
        const d = Math.hypot(v.state.x - this.playerX, v.state.y - this.playerY);
        if (d < best) {
          best = d;
          nearest = v;
        }
      }
      if (nearest) {
        const sign = away ? -1 : 1;
        dx = ((nearest.state.x - this.playerX) / (best || 1)) * sign;
        dz = ((nearest.state.y - this.playerY) / (best || 1)) * sign;
      }
    }
    if (dx === 0 && dz === 0) {
      // Standing still with nothing nearby used to abandon the dash here —
      // after the server had already charged the cooldown and the mana. Facing
      // is always defined, so there is always a direction to go.
      const facing = this.localActor?.facingVector();
      dx = facing?.x ?? 0;
      dz = facing?.z ?? 1;
    }

    const len = Math.hypot(dx, dz) || 1;
    this.playerX = clamp(this.playerX + (dx / len) * distancePx, 0, WORLD_WIDTH);
    this.playerY = clamp(this.playerY + (dz / len) * distancePx, 0, WORLD_HEIGHT);
    this.localActor?.snapTo(...onGround(toWorldX(this.playerX), toWorldZ(this.playerY)));
    this.socket.sendMove(this.playerX, this.playerY);
  }

  /**
   * Combat text over a monster. The weight is the share of THAT monster's
   * health the hit took, which is what lets the same number be drawn loud on a
   * slime and quiet on a dragon — the one piece of information a flat number
   * cannot carry on its own.
   */
  /** Bound once: the loop passes it every frame and a fresh closure per frame
   *  is a per-frame allocation for nothing. */
  private readonly projectForFloat = (x: number, y: number, z: number) =>
    this.world.project(x, y, z, 90);

  /**
   * How a resistance reads in the log, or nothing at all.
   *
   * Only spoken when the target actually has an opinion, so an ordinary hit on
   * an ordinary creature is still the plain sentence it always was — a suffix
   * on every line is a suffix nobody reads.
   */
  private static resistNoteOf(resisted: number | undefined): string {
    if (!resisted) return "";
    if (resisted >= 40) return " — it barely notices";
    if (resisted > 0) return " — resisted";
    if (resisted <= -40) return " — it recoils";
    return " — it feels that";
  }

  private floatOnMonster(vis: MonsterVisual, spec: Omit<FloatSpec, "weight" | "headY">, damage = 0): void {
    const maxHp = Math.max(1, vis.state.maxHp);
    this.floaters.spawn(vis.actor.position, {
      ...spec,
      weight: damage > 0 ? damage / maxHp : undefined,
      // Above the model rather than at a fixed height, for the same reason the
      // impact effect is: a slime is 0.8 units tall and a dragon 3.4.
      headY: MONSTER_MODELS[vis.kind].height + 0.45,
    });
  }


  /**
   * One tick of a poison, a burn or a bleed.
   *
   * Its own path rather than the battle-result one, because nobody swung: there
   * is no attacker to animate and no swing sound to play. What it needs is a
   * number over the right body and a line in the log — which is the whole
   * difference between a debuff that feels like a decision and one that is an
   * invisible subtraction from a health bar.
   */
  private onStatusTick(p: {
    entityId: string;
    statusId: StatusId;
    damage: number;
    school: DamageSchool;
    monster: boolean;
  }): void {
    const def = STATUSES[p.statusId];
    const colour = schoolDef(p.school).color;
    if (p.monster) {
      const vis = this.monsters.get(p.entityId);
      if (!vis) return;
      this.floatOnMonster(
        vis,
        { kind: "skill", text: `${p.damage}`, color: colour },
        p.damage,
      );
      return;
    }
    // On the player. Red, like every other thing that takes health off you —
    // whose damage it is matters more mid-fight than what it was made of, which
    // is the same call the monster-attack line makes.
    if (this.localActor) {
      this.floatOnPlayer(this.localActor, { kind: "taken", text: `-${p.damage}` }, p.damage);
    }
    this.combatLog.push(`${def.name} takes ${p.damage} off you.`, colour);
  }

  /** Combat text over a player — yours or an ally's. */
  private floatOnPlayer(actor: Actor, spec: Omit<FloatSpec, "weight" | "headY">, amount = 0): void {
    this.floaters.spawn(actor.position, {
      ...spec,
      weight: amount > 0 ? amount / Math.max(1, this.maxHp) : undefined,
      headY: 2.05,
    });
  }

  // --------------------------------------------------------------------- ui

  private onItemsChanged(): void {
    this.appearance = appearanceFromItems(this.items);
    this.inventoryPanel.setItems(this.items);
    this.characterPanel.setEquipped(this.items);
    // The bench lists the bag twice — Reforge and Salvage both read it — so it
    // has to hear about every change, not only about the ones made at the bench.
    this.craftPanel.setItems(this.items);
    this.craftPanel.setEquippedWeapon(this.appearance.weaponType);
    // Which attributes are worth points depends on what is in your hand.
    this.characterPanel.setWeapon(this.appearance.weaponType, this.weaponProgress?.level ?? null);
    // The local player rebuilds its own look from its item list rather than
    // waiting for a snapshot to tell it what it is wearing, which is what makes
    // equipping read as instant.
    this.localActor?.setAppearance(this.appearance);
    this.refreshClassUi();
    this.refreshStats();
  }

  /**
   * How far the player can currently reach, item tuning included.
   *
   * Four places read this — the target ring, the indicator, the auto-attack
   * test and the minimap — and all four used to call the family-only helper,
   * which meant a spear drew a ring it could not actually hit to once items
   * gained their own reach.
   */
  private reach(): number {
    return reachOf(equippedBySlot(this.items).weapon ?? null, this.passives().rangePercent);
  }

  private syncMaterials(): void {
    // Copied on the way out, or the two panels would hold a live reference to
    // the field they are meant to be a snapshot of.
    const wallet = { ...this.wallet };
    this.inventoryPanel.setMaterials(wallet);
    this.craftPanel.setMaterials(wallet);
  }

  /**
   * Proficiency and talents for the weapon in hand. Everything downstream of
   * the tree — the bar, the panel, the stat sheet — is rebuilt from here, so
   * there is one place a talent change lands rather than three.
   */
  private onWeaponProgress(p: WeaponProgressView & { reason?: string }): void {
    const gained = p.pointsAvailable - (this.weaponProgress?.pointsAvailable ?? 0);
    this.weaponProgress = p;
    this.skillPanel.setProgress(p);
    this.hotbar.setLayout(p.weaponType, p.hotbar);
    this.characterPanel.setWeapon(p.weaponType, p.level);
    this.refreshClassUi();
    this.refreshStats();
    if (p.reason) this.hud.toast(p.reason, "#c98d5e");
    else if (gained > 0 && p.pointsAvailable > 0) {
      this.hud.toast(`${p.pointsAvailable} talent point${p.pointsAvailable === 1 ? "" : "s"} — press K`, "#ffd873");
    }
  }

  private refreshClassUi(): void {
    // The bar's contents are the player's own layout, pushed by the server
    // with WEAPON_PROGRESS; all that is left to do per frame is the cooldowns.
    this.hotbar.update(this.mana);
  }

  // Every gear total comes from the same shared aggregator the server resolves
  // combat with, so the sheet cannot quote a number the fight does not use.
  private refreshStats(): void {
    const gear = equippedBySlot(this.items);
    const cls = classForWeapon(this.appearance.weaponType);
    // The item itself, not just its family: a claymore and an arming sword are
    // both swords and swing nothing alike.
    const held = gear.weapon ?? null;
    const power = primaryStatValue(cls, {
      strength: this.strength,
      agility: this.agility,
      vitality: this.vitality,
      intelligence: this.intelligence,
    });
    // Talents feed every one of these. The sheet quoting a number the fight
    // does not use is the exact failure this file has always been written to
    // avoid, and a tree full of percentages is the easiest way to reintroduce
    // it — so they go through the same shared helpers the server calls.
    const talents = this.passives();

    // Split back into its four sources for the breakdown. Deliberately
    // recomputed from the same shared functions the server totals with rather
    // than tracked separately — a second bookkeeping of where a number came
    // from is a second thing that can disagree with the number.
    const affixTotals = { ...EMPTY_PASSIVES };
    for (const slot of ITEM_SLOTS) {
      const item = gear[slot];
      if (item) addPassives(affixTotals, itemPassives(item));
    }
    // `talents` already has the running statuses folded in, so the breakdown
    // subtracts them back out to show each source on its own. Recomputed from
    // the same shared function rather than tracked separately, for the same
    // reason the other three are: a second bookkeeping of where a number came
    // from is a second thing that can disagree with the number.
    const statusTotals = statusModifiers(this.statusBar.active);
    const talentOnly = { ...talents };
    for (const key of Object.keys(talentOnly) as (keyof typeof talentOnly)[]) {
      talentOnly[key] -= statusTotals[key];
    }
    this.characterPanel.setSources([
      { name: "Talents", bonus: talentOnly },
      { name: "Affixes", bonus: affixTotals },
      { name: "Matched gear", bonus: setPassives(gear) },
      { name: "Running effects", bonus: statusTotals },
    ]);

    this.characterPanel.setStats({
      moveSpeedPxPerSec: this.moveSpeed(),
      xpBonusPercent: xpBonusPercent(this.armorRarity),
      gatherTimeSec: gatherDurationForLevel(this.gatherLevel, this.agility) / 1000,
      // Through the same resolvers the server swings with, so the sheet cannot
      // quote a number combat does not use — which is the whole reason these
      // live in shared rather than being computed twice.
      battleTimeSec:
        swingIntervalOf(
          held,
          this.weaponRarity,
          this.battlePowerLevel,
          this.agility,
          talents.attackSpeedPercent,
        ) / 1000,
      minHit: hitBandOf(held, power, gearDamageBonus(gear), talents.damagePercent).min,
      maxHit: hitBandOf(held, power, gearDamageBonus(gear), talents.damagePercent).max,
      accuracy:
        playerAccuracy(this.agility, talents.accuracyBonus) + this.equippedBonusStatValue("ring"),
      critChance: playerCritChance(this.agility) + gearCritChance(gear) + talents.critChance,
      critDamagePercent: Math.round(
        critDamageMultiplier(this.weaponRarity, talents.critDamagePercent) * 100,
      ),
      armor: gearArmor(gear) + talents.armor,
      evasion: gearEvasion(gear) + talents.evasion,
      doubleAttackPercent: doubleAttackChance(this.agility),
      hpRegen: regenAmountForVitality(this.vitality),
      // Read off the weapon actually in hand, through the same resolver the
      // server swings with — so "what am I dealing" on this sheet and what the
      // monster resists are one answer rather than two.
      school: (() => {
        const s = schoolDef(weaponSchool(gear.weapon ?? null));
        return { name: s.name, color: s.color };
      })(),
      // `talents` is the fully totalled bag — talents, affixes and matched sets
      // all summed — which is the same bag `passiveResist` reads on the server.
      resists: ELEMENTAL_SCHOOLS.map((school) => ({
        name: schoolDef(school).name,
        color: schoolDef(school).color,
        value: passiveResist(talents, school),
      })),
    });
  }

  // Logged from the still-cached item before the server round-trip confirms it,
  // so the line reads in the log at the moment the player clicks. What it
  // actually yields is the server's answer and arrives as an INFO line.
  private salvageItem(itemId: string): void {
    const item = this.items.find((i) => i.id === itemId);
    if (item) this.combatLog.push(`Salvaged ${itemName(item)}.`, "#c9b47a");
    this.socket.sendSalvageItem(itemId);
  }

  private equippedBonusStatValue(slot: ItemSlot): number {
    return this.items.find((i) => i.slot === slot && i.equipped)?.bonusStatValue ?? 0;
  }

  private moveSpeed(): number {
    return movePxPerSec(
      this.bootsRarity,
      this.agility,
      gearMoveBonus(equippedBySlot(this.items)) + this.passives().moveSpeedBonus,
    );
  }

  /** Passive totals from the held weapon's learned talents — the same shared
   *  aggregation the server resolves combat with. */
  /**
   * The player's talent totals, plus whatever is running on them.
   *
   * Statuses have to be in here, and the reason is the oldest rule in this
   * file: the stat sheet must compute exactly what the server resolves combat
   * with. `passivesOf` on the server folds the same bag in, so leaving it out
   * here meant Rallied gave you eight armour in a fight and the character
   * window went on reporting the number you had before you cast it — which is
   * the same class of disagreement the gear-aggregation helpers were written
   * to make impossible.
   *
   * The gear affixes and matched sets are added by the CALLER rather than here,
   * because two of the three call sites want them split out by source for the
   * Statistics tab's breakdown.
   */
  private passives(): ReturnType<typeof talentPassives> {
    const total = talentPassives(this.appearance.weaponType, this.weaponProgress?.ranks ?? {});
    return addPassives(total, statusModifiers(this.statusBar.active));
  }

  // ------------------------------------------------------------------ input

  private bindInput(): void {
    window.addEventListener("keydown", (e) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (typing) return;
      // A pending rebind is capturing the keyboard; anything pressed belongs
      // to it, not to movement or a panel toggle.
      if (this.hotbar.isRebinding) return;
      this.keys.add(e.key.toLowerCase());

      const key = e.key.toLowerCase();
      // Graphics quality, beside F3's profiler on purpose: the two are meant to
      // be used together, one to see what a frame costs and the other to change
      // it. Said out loud as a toast because going up a level indoors, or down
      // one where there is nothing casting a shadow, can change nothing you can
      // see at the moment you press it — and a setting that appears to do
      // nothing is a setting people press twice and then stop trusting.
      if (e.key === "F4") {
        e.preventDefault();
        const q = this.world.cycleQuality();
        this.hud.toast(`Graphics: ${q.label}`, "#8fd15a");
        this.combatLog.push(`Graphics quality set to ${q.label}. F4 to cycle, F3 for the frame cost.`, "#8fd15a");
        return;
      }
      // The keys and the dock buttons are two ways to do one thing, so both
      // finish by re-lighting the dock.
      if (key === "c") {
        this.characterPanel.toggle();
        this.fitWindows(this.characterPanel.isOpen ? "dock-character" : undefined);
      } else if (key === "i") {
        this.inventoryPanel.toggle();
        this.fitWindows(this.inventoryPanel.isOpen ? "dock-inventory" : undefined);
      } else if (key === "k") {
        this.skillPanel.toggle();
        this.fitWindows(this.skillPanel.isOpen ? "dock-skills" : undefined);
      } else if (key === "l") {
        this.leaderboardPanel.toggle();
        if (this.leaderboardPanel.isOpen) this.socket.sendRequestLeaderboard();
        this.fitWindows(this.leaderboardPanel.isOpen ? "dock-leaderboard" : undefined);
      } else if (key === "tab") {
        e.preventDefault();
        this.cycleTarget();
      } else if (key === "escape") {
        // Releases the lock rather than clearing targeting outright — with
        // auto-targeting there is no such thing as fighting nothing while
        // something is in front of you.
        if (this.lockedId) this.hud.toast("Target released.", "#c9b47a");
        this.setTarget(null);
        this.allyTargetId = null;
      } else if (key === "m") {
        const nowMuted = toggleMuted();
        this.hud.toast(nowMuted ? "Sound off" : "Sound on", "#c9b47a");
      } else {
        const action = this.hotbar.skillForKey(key);
        if (action) this.useAction(action);
      }
    });

    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());

    // The dock buttons have existed since the 2D client and were never wired
    // to anything after the Three.js port — the markup survived, its listeners
    // did not, so every icon was decorative. Bound here alongside the keys
    // they mirror, and kept lit while their window is open.
    this.bindDock();

    this.world.renderer.domElement.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    this.world.renderer.domElement.addEventListener("pointermove", (e) => {
      this.pointerX = e.clientX;
      this.pointerY = e.clientY;
    });
    // The wheel zooms. Bound to the canvas rather than the window so scrolling
    // a panel that has overflowed — the talent tree and the bag both do — moves
    // that list instead of hauling the camera around behind it.
    this.world.renderer.domElement.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        // deltaY is reported in wildly different units per device and per
        // browser (pixels, lines, pages), so only its SIGN is trustworthy.
        this.world.zoomBy(Math.sign(e.deltaY));
      },
      { passive: false },
    );

    this.world.renderer.domElement.addEventListener("pointerleave", () => {
      this.pointerX = -1;
      this.pointerY = -1;
      this.hoverId = null;
    });
  }

  private bindDock(): void {
    const buttons: [string, () => void, () => boolean][] = [
      ["dock-character", () => this.characterPanel.toggle(), () => this.characterPanel.isOpen],
      ["dock-inventory", () => this.inventoryPanel.toggle(), () => this.inventoryPanel.isOpen],
      ["dock-skills", () => this.skillPanel.toggle(), () => this.skillPanel.isOpen],
      [
        "dock-leaderboard",
        () => {
          this.leaderboardPanel.toggle();
          if (this.leaderboardPanel.isOpen) this.socket.sendRequestLeaderboard();
        },
        () => this.leaderboardPanel.isOpen,
      ],
    ];
    for (const [id, toggle, isOpen] of buttons) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener("click", () => {
        toggle();
        this.fitWindows(isOpen() ? id : undefined);
      });
      this.dockButtons.push({ el, isOpen });
    }
    this.refreshDock();
  }

  /** Keeps the dock lit in step with the windows, however they were opened. */
  private refreshDock(): void {
    for (const { el, isOpen } of this.dockButtons) el.classList.toggle("active", isOpen());
  }

  /** Every window the rail lays out, with the handles the fitter needs. */
  private get railWindows(): { id: string; isOpen: () => boolean; close: () => void }[] {
    return [
      { id: "dock-character", isOpen: () => this.characterPanel.isOpen, close: () => this.characterPanel.close() },
      { id: "dock-inventory", isOpen: () => this.inventoryPanel.isOpen, close: () => this.inventoryPanel.close() },
      { id: "dock-skills", isOpen: () => this.skillPanel.isOpen, close: () => this.skillPanel.close() },
      { id: "dock-leaderboard", isOpen: () => this.leaderboardPanel.isOpen, close: () => this.leaderboardPanel.close() },
    ];
  }

  /**
   * Keeps the rail inside the screen by closing the oldest window when a new
   * one will not fit.
   *
   * Windows lay out right-to-left and never overlap, which is the point — but
   * all four together are wider than any screen, and the alternative to
   * evicting is a panel sitting half off the left edge with no way to reach
   * it. Oldest first, because the one just opened is the one being looked at.
   */
  private fitWindows(justOpened?: string): void {
    if (justOpened) {
      const existing = this.windowOrder.findIndex((w) => w.id === justOpened);
      if (existing >= 0) this.windowOrder.splice(existing, 1);
      const entry = this.railWindows.find((w) => w.id === justOpened);
      if (entry) this.windowOrder.push({ id: entry.id, close: entry.close });
    }
    // Forget anything closed by other means before measuring.
    for (let i = this.windowOrder.length - 1; i >= 0; i--) {
      const entry = this.railWindows.find((w) => w.id === this.windowOrder[i].id);
      if (!entry?.isOpen()) this.windowOrder.splice(i, 1);
    }

    const rail = document.getElementById("window-rail");
    if (rail) {
      let guard = this.railWindows.length;
      while (guard-- > 0 && this.windowOrder.length > 1) {
        const used = Array.from(rail.querySelectorAll<HTMLElement>(".window.open")).reduce(
          (total, el) => total + el.getBoundingClientRect().width + 10,
          0,
        );
        if (used <= rail.clientWidth) break;
        this.windowOrder.shift()?.close();
      }
    }
    this.refreshDock();
  }

  private onPointerDown(e: PointerEvent): void {
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.world.camera);

    // Enemies first, then allies, then stations. Ground clicks clear both.
    const picked = this.pickMonsterAt(e.clientX, e.clientY);
    if (picked) {
      // Clicking what is already locked unlocks it, which is how you hand
      // control back to auto-targeting without hunting for empty ground.
      this.setTarget(picked === this.lockedId ? null : picked);
      return;
    }
    // Townspeople, before players and before the bench. They stand in the one
    // place every player passes through, so a click that fell through to "clear
    // your target" while the cursor was on a shopkeeper would be the single
    // most-hit dead click in the game.
    for (const [id, npc] of this.npcs) {
      if (!npc.actor.loaded) continue;
      if (this.raycaster.intersectObject(npc.actor.root, true).length === 0) continue;
      // Live position again: you clicked the person, so the distance that
      // decides whether they answer has to be to the person.
      const dist = Math.hypot(this.playerX - npc.x, this.playerY - npc.y);
      if (dist <= NPC_TALK_RANGE_PX) this.talkTo(id);
      else this.hud.toast(`${npc.def.name} is too far away.`, "#c98d5e");
      return;
    }
    // One selection covers enemies and allies — the server looks the id up in
    // both and stores it as whichever it turns out to be, so clicking a player
    // is how you give Mend and War Cry someone to help.
    for (const [id, actor] of this.players) {
      if (!actor.loaded) continue;
      const hits = this.raycaster.intersectObject(actor.root, true);
      if (hits.length > 0) {
        this.setAllyTarget(id);
        return;
      }
    }
    for (const [id, obj] of this.stations) {
      const hits = this.raycaster.intersectObject(obj, true);
      if (hits.length > 0) {
        const s = this.stationStates.get(id);
        if (!s) return;
        const dist = Math.hypot(this.playerX - s.x, this.playerY - s.y);
        if (dist <= INTERACTION_RANGE_PX) {
          // The bench needs three things the moment it opens: what you can
          // spend, what you own (Reforge and Salvage both list the bag), and
          // what level you are (which recipes are learned).
          this.syncMaterials();
          this.craftPanel.setItems(this.items);
          this.craftPanel.setRecipes(this.recipes);
          this.craftPanel.setRunes(this.runes);
          this.craftPanel.open(id);
        } else {
          this.hud.toast("Too far from the workbench.", "#c98d5e");
        }
        return;
      }
    }
    this.setTarget(null);
  }

  /**
   * Opens a conversation.
   *
   * The NPC turns to face whoever is speaking to them, which costs one line and
   * is most of what stops these reading as furniture: a shopkeeper who carries
   * on staring at the wall while you talk to their ear is worse than no
   * shopkeeper.
   */
  private talkTo(id: string): void {
    const npc = this.npcs.get(id);
    if (!npc) return;
    const dx = this.playerX - npc.x;
    const dy = this.playerY - npc.y;
    const len = Math.hypot(dx, dy) || 1;
    npc.actor.faceDirection(dx / len, dy / len);
    this.dialogue.open(npc.def, this.dialogueActionsFor(npc));
  }

  /**
   * What this person can DO for you, above their small talk.
   *
   * Empty for Tobin, and that is not a gap: his whole function is the topics
   * themselves. The list is built fresh on every open so it reflects the bag
   * and the level as they are now.
   */
  private dialogueActionsFor(npc: NpcVisual): DialogueAction[] {
    const actions: DialogueAction[] = [];

    if (npc.def.role === "vendor") {
      // The counter, which is a SUB-MENU and not six more rows.
      //
      // The stock is nine lines and every ordered pair of three materials is
      // six more; fifteen rows in a dialogue box is the shop window this file
      // deliberately does not have. So the exchange is one row that swaps the
      // list, exactly as taking a quest already does — the mechanism was
      // already here and it only had to be pointed at something else.
      actions.push({
        label: "Trade materials",
        note: `${EXCHANGE_RATE} for 1, any of the three`,
        onPick: () => {
          this.dialogue.say(
            "Wood, ore or herb — I will take any of it and give you any other. " +
              `Four for one, and before you pull a face: I have to carry it.`,
          );
          this.dialogue.setActions([
            ...EXCHANGE_OFFERS.map((offer) => {
              const held = this.wallet[offer.from] ?? 0;
              const afford = held >= offer.give;
              return {
                label: `${offer.give} ${offer.from} → ${offer.get} ${offer.to}`,
                note: afford ? `you have ${held}` : `you have ${held}, need ${offer.give}`,
                primary: afford,
                disabled: !afford,
                onPick: () => {
                  this.socket.sendExchangeMaterial(npc.def.id, offer.id);
                  // Redrawn after the reply lands, for the reason the stock is:
                  // rebuilding from a wallet the server has not changed yet
                  // shows the old balances and the old greying.
                  window.setTimeout(() => {
                    if (this.dialogue.openNpcId === npc.def.id) {
                      this.dialogue.setActions(this.dialogueActionsFor(npc));
                    }
                  }, 260);
                },
              };
            }),
            {
              label: "Never mind.",
              onPick: () => {
                this.dialogue.say(npc.def.greeting);
                this.dialogue.setActions(this.dialogueActionsFor(npc));
              },
            },
          ]);
        },
      });

      // The stock, priced and greyed out when it cannot be afforded. Shown
      // inline rather than in a shop window: nine lines is not a panel, and a
      // second overlay for it would cover the conversation that opened it.
      for (const entry of SHOP_STOCK) {
        const name =
          entry.kind === "item"
            ? (ITEM_BASES[entry.ref]?.name ?? entry.ref)
            : (CONSUMABLES[entry.ref as keyof typeof CONSUMABLES]?.name ?? entry.ref);
        const afford = this.canAfford(entry.cost);
        actions.push({
          label: `Buy ${name}`,
          note: describeCost(entry.cost),
          primary: afford,
          disabled: !afford,
          onPick: () => {
            this.socket.sendBuyFromVendor(npc.def.id, entry.id);
            this.dialogue.say(entry.pitch);
            // Rebuilt after the reply lands, so a purchase that emptied the
            // wallet greys out what is no longer affordable. Without the delay
            // the list is redrawn from the balance the server has not yet
            // changed, and everything still looks purchasable.
            window.setTimeout(() => {
              if (this.dialogue.openNpcId === npc.def.id) {
                this.dialogue.setActions(this.dialogueActionsFor(npc));
              }
            }, 260);
          },
        });
      }
    }

    // WHETHER SOMEBODY HAS WORK IS A FACT OF THE QUEST TABLE, not of their
    // role. This used to read `role === "quest"`, which is a second opinion
    // about the same thing and was wrong the moment the Herald was given a
    // line of work: `role` says what a person IS — Elsbet is a guide, and her
    // portrait and her plate should keep saying so — and `questsFrom` says what
    // they have. Deriving it from the table is the same call this project makes
    // about where the fires are, and it means adding a giver is one entry in
    // `shared/quests.ts` and nothing else anywhere.
    if (questsFrom(npc.def.id).length > 0) {
      const active = this.questTracker.activeQuests;
      const completed = this.questTracker.completedQuests;
      for (const def of questsFrom(npc.def.id)) {
        const state = offerStateFor(def, this.level, active, completed);
        // Finished work is not listed at all. A permanent row saying "done"
        // beside two live ones is a list that grows forever and never says
        // anything.
        if (state === "done") continue;

        if (state === "locked") {
          actions.push({
            label: def.name,
            note: lockReason(def, this.level, completed) ?? "not yet",
            disabled: true,
            onPick: () => {},
          });
          continue;
        }

        if (state === "offer") {
          actions.push({
            label: `${def.name}`,
            note: rewardLabel(def.reward),
            primary: true,
            onPick: () => {
              this.dialogue.say(def.brief);
              this.dialogue.setActions([
                {
                  label: "I'll do it.",
                  primary: true,
                  onPick: () => {
                    this.socket.sendAcceptQuest(npc.def.id, def.id);
                    this.dialogue.say(def.brief);
                    window.setTimeout(() => {
                      if (this.dialogue.openNpcId === npc.def.id) {
                        this.dialogue.setActions(this.dialogueActionsFor(npc));
                      }
                    }, 260);
                  },
                },
              ]);
            },
          });
          continue;
        }

        const count = this.questTracker.progressOf(def.id) ?? 0;
        const progress = `${objectiveLabel(def.objective)} ${Math.min(count, def.objective.count)} / ${def.objective.count}`;
        if (state === "ready") {
          actions.push({
            label: `Hand in: ${def.name}`,
            note: rewardLabel(def.reward),
            primary: true,
            onPick: () => {
              this.socket.sendTurnInQuest(npc.def.id, def.id);
              this.dialogue.say(def.done);
              window.setTimeout(() => {
                if (this.dialogue.openNpcId === npc.def.id) {
                  this.dialogue.setActions(this.dialogueActionsFor(npc));
                }
              }, 260);
            },
          });
        } else {
          actions.push({
            label: def.name,
            note: progress,
            disabled: true,
            onPick: () => {},
          });
        }
      }
    }

    return actions;
  }

  /** Whether the wallet covers a cost. Presentation only — the server re-checks
   *  it, and has to, because a greyed-out button is not a rule. */
  private canAfford(cost: Partial<Record<Material, number>>): boolean {
    for (const [material, amount] of Object.entries(cost)) {
      if (!amount) continue;
      if ((this.wallet[material as Material] ?? 0) < amount) return false;
    }
    return true;
  }

  /**
   * Closes the box when the player walks away.
   *
   * Range is checked every frame rather than only on open, because the game
   * never stops while you are talking: monsters still chase, and a conversation
   * that stayed on screen while its other half was thirty units behind you
   * would be a panel you had to dismiss by hand after being chased out of town.
   * A little slack past the talk range, so standing at the very edge does not
   * flicker the box open and shut.
   */
  private updateDialogueRange(): void {
    const openId = this.dialogue.openNpcId;
    if (!openId) return;
    const npc = this.npcs.get(openId);
    if (!npc) {
      this.dialogue.close();
      return;
    }
    // AGAINST THEIR POST, and this is the one place that is deliberately not
    // the live position. A conversation you opened must not be closed by the
    // other person taking three steps, so the tether is the doorstep they never
    // leave rather than their feet — see `NPC_TETHER_PX`, which is exactly the
    // talk range plus the furthest anybody strays, so anything the click let
    // you open survives for as long as you stand still.
    const dist = Math.hypot(this.playerX - npc.def.x, this.playerY - npc.def.y);
    if (dist > NPC_TETHER_PX) this.dialogue.close();
  }

  /**
   * Where the player has been told to go, for the map's rim arrows.
   *
   * Only ACTIVE reach quests, and only the ones not yet satisfied. Marking all
   * four waystones permanently would make the map a tourist guide; marking the
   * one you took work for makes it an instruction. It is also why the arrow can
   * be trusted: if it is there, somebody asked you to walk that way.
   */
  private objectiveGuides(): { x: number; z: number; label: string; distancePx: number }[] {
    const out: { x: number; z: number; label: string; distancePx: number }[] = [];
    for (const entry of this.questTracker.activeQuests) {
      const def = QUESTS.find((q) => q.id === entry.id);
      if (!def || def.objective.kind !== "reach") continue;
      if (questSatisfied(def, entry.count)) continue;
      const mark = landmarkById(def.objective.landmark);
      if (!mark) continue;
      const at = landmarkPosition(mark);
      out.push({
        x: toWorldX(at.x),
        z: toWorldZ(at.y),
        label: mark.name,
        distancePx: Math.hypot(this.playerX - at.x, this.playerY - at.y),
      });
    }
    return out;
  }

  /** Distance from the player to a monster, in server pixels. */
  private distanceTo(vis: MonsterVisual): number {
    return Math.hypot(vis.state.x - this.playerX, vis.state.y - this.playerY);
  }

  private aliveMonsters(): [string, MonsterVisual][] {
    return [...this.monsters.entries()].filter(
      ([, v]) => !v.dead && v.state.status === "alive",
    );
  }

  /**
   * Nearest living enemy within `limit` px, biased toward the one already
   * engaged. A pack shuffles constantly — separation alone moves bodies every
   * tick — so plain "nearest" would hand the target back and forth between two
   * monsters standing shoulder to shoulder. Sticking until something is
   * meaningfully closer is what makes an auto-picked target feel chosen.
   */
  private nearestMonster(limit: number): string | null {
    let best: string | null = null;
    let bestDist = limit;
    for (const [id, vis] of this.aliveMonsters()) {
      const d = this.distanceTo(vis);
      if (d <= bestDist) {
        best = id;
        bestDist = d;
      }
    }

    const held = this.engagedId ? this.monsters.get(this.engagedId) : undefined;
    if (!held || held.dead || held.state.status !== "alive") return best;
    const heldDist = this.distanceTo(held);
    if (heldDist > limit) return best;
    return bestDist > heldDist - TARGET_STICKINESS_PX ? this.engagedId : best;
  }

  /**
   * Works out what the player is fighting, and keeps the server's idea of it
   * in step. Runs every frame.
   *
   * The order matters and mirrors how the server resolves a swing:
   *   1. the locked target, if it is alive and in reach — a deliberate choice
   *      beats proximity, which is the entire point of having made it
   *   2. otherwise the nearest enemy in reach, because that is what auto-attack
   *      is hitting whether or not anyone clicked
   *   3. otherwise the locked target even out of reach, so walking toward
   *      something you chose keeps showing it as yours
   *   4. otherwise the nearest enemy inside the engage radius, dimmed — the
   *      marker that appears as you approach a camp
   */
  private updateTargeting(): void {
    const reach = this.reach();
    const locked = this.lockedId ? this.monsters.get(this.lockedId) : undefined;
    const lockedAlive = locked && !locked.dead && locked.state.status === "alive";
    if (this.lockedId && !lockedAlive) {
      // It died or streamed out; drop the lock so auto-targeting resumes
      // instead of leaving the player pointed at nothing.
      this.lockedId = null;
    }

    const lockedInReach = lockedAlive && this.distanceTo(locked!) <= reach;
    this.engagedId =
      (lockedInReach ? this.lockedId : null) ??
      this.nearestMonster(reach) ??
      (lockedAlive ? this.lockedId : null) ??
      this.nearestMonster(ENGAGE_RADIUS_PX);

    // Keep the server's selection matching what the player can see, so a
    // single-target skill hits the thing the ring is drawn around. Skipped
    // while an ally is selected: that selection is what Mend and War Cry read,
    // and quietly overwriting it would break co-op for the sake of a ring.
    if (this.lockedId || this.allyTargetId) return;
    if (this.engagedId === this.sentTargetId) return;
    this.sentTargetId = this.engagedId;
    this.socket.sendSetTarget(this.engagedId);
  }

  /**
   * The monster a click at these screen coordinates should take.
   *
   * Two passes, because a raycast alone is a poor pointing device here. It is
   * narrowed to the handful of monsters near the cursor (cheap enough to run on
   * pointer move), then resolved by depth so the one in FRONT wins — the old
   * code returned whichever came first in map order, so with two bodies
   * overlapping you could select the one behind. If the ray misses everything,
   * the nearest silhouette within a few dozen pixels is taken instead, which is
   * what makes small monsters clickable at all.
   */
  private pickMonsterAt(clientX: number, clientY: number): string | null {
    const candidates: { id: string; vis: MonsterVisual; screenDist: number }[] = [];
    for (const [id, vis] of this.aliveMonsters()) {
      if (!vis.actor.loaded) continue;
      const spec = MONSTER_MODELS[vis.kind];
      const p = vis.actor.position;
      const screen = this.world.project(p.x, p.y + spec.height * 0.5, p.z);
      if (!screen) continue;
      const screenDist = Math.hypot(screen.x - clientX, screen.y - clientY);
      if (screenDist <= PICK_CANDIDATE_PX) candidates.push({ id, vis, screenDist });
    }
    if (candidates.length === 0) return null;

    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.world.camera);
    let hitId: string | null = null;
    let hitDepth = Infinity;
    // A SPHERE, NOT THE MESH. `intersectObject(root, true)` walks into the
    // SkinnedMesh, and three.js resolves a skinned raycast by computing the
    // posed world position of every vertex in the rig before it tests a single
    // triangle. That is thousands of bone-weighted transforms per candidate,
    // and this runs on every frame the pointer is over the canvas — it showed
    // up in the profiler as `targeting` spiking to 45ms, six times in one
    // ten-second window, against a 0.04ms average.
    //
    // Triangle-exact picking was never worth that here. These are creatures
    // between 0.8 and 3.4 units tall being clicked on with a mouse, the
    // candidate list is already filtered to things within `PICK_CANDIDATE_PX`
    // of the cursor on screen, and the whole function falls back to nearest-on-
    // screen anyway when nothing is hit. A capsule-ish sphere around the body
    // answers the only question the ray is actually being asked: of the things
    // under the cursor, which is in front?
    for (const c of candidates) {
      const spec = MONSTER_MODELS[c.vis.kind];
      const p = c.vis.actor.position;
      this.pickSphere.center.set(p.x, p.y + spec.height * 0.5, p.z);
      // Half the height is the body radius, floored so a slime is still
      // comfortably clickable and not a marble.
      this.pickSphere.radius = Math.max(0.45, spec.height * 0.5);
      if (!this.raycaster.ray.intersectsSphere(this.pickSphere)) continue;
      const depth = this.world.camera.position.distanceTo(this.pickSphere.center);
      if (depth < hitDepth) {
        hitDepth = depth;
        hitId = c.id;
      }
    }
    if (hitId) return hitId;

    candidates.sort((a, b) => a.screenDist - b.screenDist);
    return candidates[0].screenDist <= CLICK_SLACK_PX ? candidates[0].id : null;
  }

  private setTarget(id: string | null): void {
    this.lockedId = id;
    if (id) this.allyTargetId = null; // one selection at a time, as the server models it
    // Recorded so auto-targeting knows what the server was last told and does
    // not either re-send it or skip a send it actually owes.
    this.sentTargetId = id;
    this.socket.sendSetTarget(id);
    if (!id) this.targetFrame.hide();
  }

  private setAllyTarget(id: string | null): void {
    this.allyTargetId = id;
    if (id) this.lockedId = null;
    this.sentTargetId = id;
    this.socket.sendSetTarget(id);
    if (id) {
      this.combatLog.push(`Assisting ${this.playerNames.get(id) ?? "ally"}.`, "#9ad4ff");
    }
  }

  /**
   * Next enemy, nearest first.
   *
   * Scoped to the engage radius rather than to every monster with a model:
   * models are built out to 1150px, so the old version cycled through some
   * thirty creatures across four camps and reaching the one in front of you
   * meant pressing Tab a dozen times. It also starts from whatever you are
   * currently fighting, not from your last click, so Tab means "not that one,
   * the next one" even when you never clicked at all.
   */
  private cycleTarget(): void {
    const reach = this.reach();
    const limit = Math.max(ENGAGE_RADIUS_PX, reach * 1.2);
    const near = this.aliveMonsters()
      .filter(([, v]) => this.distanceTo(v) <= limit)
      .sort((a, b) => this.distanceTo(a[1]) - this.distanceTo(b[1]));
    if (near.length === 0) {
      this.hud.toast("Nothing in range.", "#c98d5e");
      return;
    }
    const from = this.lockedId ?? this.engagedId;
    const idx = near.findIndex(([id]) => id === from);
    this.setTarget(near[(idx + 1) % near.length][0]);
  }

  /** One entry point for the bar, whichever slot was pressed. */
  private useAction(action: BarAction): void {
    if (action === ATTACK_SLOT) {
      this.socket.sendUseAttack();
      return;
    }
    this.useSkill(action);
  }

  /**
   * The swing clock and whether an attack order stands. Both come from the
   * server, which owns the timer; the client only draws it.
   */
  private onAttackState(p: {
    attacking: boolean;
    readyInMs: number;
    intervalMs: number;
    reason?: string;
  }): void {
    const wasAttacking = this.attacking;
    this.attacking = p.attacking;
    this.hotbar.setAttackState(p.attacking, p.readyInMs, p.intervalMs);
    if (p.reason) {
      const attack = defaultAttackFor(this.appearance.weaponType);
      this.hud.toast(`${attack.name}: ${p.reason}`, "#c98d5e");
    }
    // Worth a line in the log: with combat no longer starting itself, knowing
    // whether you are actually fighting is something the player has to be able
    // to check without counting damage numbers.
    if (p.attacking && !wasAttacking) this.combatLog.push("You engage.", "#ffd873");
    else if (!p.attacking && wasAttacking) this.combatLog.push("You break off.", "#9a8d76");
  }

  private useSkill(skillId: SkillId): void {
    // Cheap local guard against a stale keybinding; the server re-checks the
    // same rule against the same tree, so this only saves a round trip.
    const ranks = this.weaponProgress?.ranks ?? {};
    if (!hasActive(this.appearance.weaponType, ranks, skillId)) return;
    this.socket.sendUseSkill(skillId);
  }

  // ------------------------------------------------------------------- loop

  /** Roughly where each slot sits on the body, for a wisp with no bone of
   *  its own to ride — a ring or a cape has no socket the way a weapon's
   *  hand does, so this is a body-relative height rather than a bone. */
  private static readonly WISP_SLOT_HEIGHT: Record<ItemSlot, number> = {
    helm: 1.7,
    boots: 0.15,
    armor: 1.0,
    cape: 0.95,
    weapon: 1.1,
    offhand: 1.1,
    ring: 1.05,
  };

  /** Which slots an `Appearance` carries a rarity for, and where. `weapon`
   *  and `offhand` are fields of their own; the rest ride in `layers`, and
   *  `ring` is in neither — nothing renders a ring mesh, so there is no
   *  slot for a wisp to come from even though the item itself is real. */
  private static readonly APPEARANCE_RARITY_SLOTS: readonly ItemSlot[] = [
    "weapon",
    "offhand",
    ...VISIBLE_GEAR_SLOTS,
  ];

  private static rarityOf(appearance: Appearance, slot: ItemSlot): ItemRarity | undefined {
    if (slot === "weapon") return appearance.weaponRarity;
    if (slot === "offhand") return appearance.offhandRarity;
    return appearance.layers[slot]?.rarity;
  }

  /** Next tick of a glowing-gear wisp, per actor — `"__local__"` for the
   *  player, the player id for everyone else, so two people in enchanted
   *  gear standing together do not fight over one shared timer. */
  private readonly nextGearAuraAt = new Map<string, number>();

  /**
   * A wisp trailing EVERY piece of runed or enchanted gear worn — the
   * player's own, and everyone else's standing nearby.
   *
   * The top two rarities already get an emissive lift on the mesh itself
   * (see gear.ts), which says "this is special" while standing still — every
   * MMORPG with a rarity ladder gives its best drops a look that keeps
   * paying off once someone is actually moving and fighting in them, and
   * this game never did it for anyone, on either side of the connection.
   *
   * `Appearance` is what makes the OTHER half of this simple: it is already
   * broadcast for every remote player, already the single source their rig
   * is dressed from, and already carries a rarity for every slot that can
   * glow — nothing new had to reach the wire. The tempting shortcut was
   * `weaponRarity`/`armorRarity`/`bootsRarity`, three fields the server also
   * sends, but those exist for their own gameplay bonuses (crit damage, XP,
   * move speed) and were never a complete answer to "what is glowing"; a
   * cape or a helm has no bonus riding on its rarity and so no field of its
   * own, but glows on the mesh exactly the same as a weapon does.
   *
   * More glowing pieces means more frequent wisps, cycling between whichever
   * of them are actually worn — a character in a full glowing set should
   * read as more radiant than someone wearing one glowing item, the same way
   * the mesh's own emissive lift already stacks visually piece by piece.
   *
   * Reuses `wisp`, the ambient-weight sibling of `bolt`, rather than the
   * full spark/glow/light combo a real hit gets: gear that flashed like a
   * crit every third of a second would stop reading as ambient and start
   * reading as broken.
   */
  private updateWeaponAura(): void {
    if (this.localActor) this.tickGearAura("__local__", this.localActor, this.appearance);
    for (const [id, actor] of this.players) {
      const appearance = this.playerAppearances.get(id);
      if (appearance) this.tickGearAura(id, actor, appearance);
    }
  }

  private tickGearAura(key: string, actor: Actor, appearance: Appearance): void {
    const glowing = Game.APPEARANCE_RARITY_SLOTS.map((slot) => ({
      slot,
      rarity: Game.rarityOf(appearance, slot),
    })).filter((p): p is { slot: ItemSlot; rarity: ItemRarity } => !!p.rarity && !!RARITIES[p.rarity]?.glow);
    if (glowing.length === 0) return;
    const now = performance.now();
    if (now < (this.nextGearAuraAt.get(key) ?? 0)) return;
    // Staggered rather than a fixed beat, so it never reads as a metronome —
    // and faster with more glowing pieces worn, floored so a fully-enchanted
    // character does not become a strobe.
    this.nextGearAuraAt.set(key, now + Math.max(140, 300 - glowing.length * 35) + Math.random() * 180);
    const piece = glowing[Math.floor(Math.random() * glowing.length)];
    const tint = Number.parseInt(RARITIES[piece.rarity].color.slice(1), 16);
    const at =
      piece.slot === "weapon"
        ? actor.muzzlePosition(new THREE.Vector3())
        : actor.position
            .clone()
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 0.4,
                Game.WISP_SLOT_HEIGHT[piece.slot],
                (Math.random() - 0.5) * 0.4,
              ),
            );
    this.projectiles.wisp(at, tint);
  }

  private loop = (ts = 0): void => {
    if (!this.running) return;
    // EVERY FRAME MUST RESCHEDULE ITSELF, WHATEVER HAPPENS INSIDE IT. This
    // function reaches into a couple dozen subsystems and iterates Maps that
    // combat is constantly mutating underneath it (a monster dying and being
    // removed mid-frame, an actor whose model has not finished loading yet) —
    // and it used to call `requestAnimationFrame(this.loop)` as its very last
    // statement, with nothing catching what came before it. One uncaught
    // exception anywhere in a 150-line function, and the reschedule never
    // happened: the whole game stopped rendering, forever, with no crash and
    // no error the player could see — reported as "the game freezes
    // completely", worst during a fight because that is when the most state
    // is changing under the loop's feet. The `try`/`finally` below cannot
    // fix whatever throws, but it guarantees a bad frame costs exactly one
    // bad frame rather than the rest of the session.
    // PACED. See pacer.ts — on a display faster than this frame can be drawn,
    // rendering whenever we happen to be ready produces frames that last two
    // refreshes and three refreshes alternately, which reads as stutter even at
    // a respectable average. Rendering on a fixed whole number of refreshes
    // makes every frame last exactly as long as the last one.
    //
    // The skipped frames skip the WHOLE body, not just the render: the point is
    // to fit the work into the budget, and doing the logic anyway would spend a
    // third of it. `clock.getDelta()` is only read inside `loopBody`, so it
    // returns the accumulated time and movement stays correct.
    const render = this.pacer.onRaf(ts);
    try {
      if (render) {
        const started = performance.now();
        this.loopBody();
        this.pacer.onFrameCost(performance.now() - started, started);
      }
    } catch (err) {
      console.error("[loop] frame threw and was skipped:", err);
    } finally {
      requestAnimationFrame(this.loop);
    }
  };

  private loopBody(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.profiler.frameBegin();

    this.profiler.begin("actors");
    this.stepMovement(dt);

    this.localActor?.update(dt);
    this.watchForSlide(dt);
    for (const a of this.players.values()) a.update(dt);
    for (const v of this.monsters.values()) v.actor.update(dt);
    this.processMonsterSpawnQueue();
    this.profiler.end("actors");
    // Nobody sends the townspeople anything, so these two lines are the only
    // thing that moves them at all — drop either and Emberhold is five statues.
    // `updateNpcs` places them off the shared clock and must run BEFORE the
    // actors tick, so the facing it hands over is eased this frame rather than
    // next one.
    this.profiler.begin("npcs");
    updateNpcs(this.npcs);
    for (const n of this.npcs.values()) n.actor.update(dt);
    this.updateDialogueRange();
    this.profiler.end("npcs");
    // The tracker's own no-op guard is the thing that makes this free: it keys
    // on a distance rounded to fifty pixels, so this rebuilds the panel about
    // twice a second while walking and never while standing still.
    this.questTracker.setPlayerPosition(this.playerX, this.playerY);

    if (this.localActor) {
      this.world.follow(this.localActor.position.x, this.localActor.position.z, dt);

      // Shake is applied after the camera is placed, so it reads as a knock to
      // the view rather than fighting the follow easing.
      const shake = this.effects.shakeOffset(this.shakeScratch);
      this.world.camera.position.add(shake);
    }

    // The hotbar's curtains are driven per frame, not per message. Calling this
    // only from onManaUpdate (as M1 did) left every cooldown visually frozen at
    // whatever it was when mana last changed.
    this.profiler.begin("fx");
    this.hotbar.update(this.mana);
    this.effects.update(this.world.camera);
    this.updateWeaponAura();
    this.projectiles.update();
    this.skillFx.update();
    this.drops.update(performance.now());
    this.profiler.end("fx");
    // After the actors have moved and before the frame is drawn, so a number
    // never lags the body it came off by a frame.
    this.floaters.update(this.projectForFloat);
    // Advanced locally between snapshots, so the sweeps move smoothly rather
    // than in the ten steps a second the snapshots arrive in.
    this.serverTime += dt * 1000;
    this.profiler.begin("ui");
    this.statusBar.update(this.serverTime);
    this.profiler.end("ui");
    // What is on you and what is on whatever you are fighting, handed to the bar
    // so a skill that READS a condition can say when its condition is met.
    // Refreshed every frame because the answer changes as fast as the fight
    // does — a bleed lands, a stagger wears off — and this is the moment the
    // player is deciding what to press.
    //
    // The engaged target rather than the locked one: `engagedId` is what you are
    // ACTUALLY hitting this instant, which is what the skill will land on.
    const facing = this.engagedId ? this.monsters.get(this.engagedId) : null;
    this.hotbar.setConditions(
      this.statusBar.active,
      // The broadcast carries ids and end times only — "the client already has
      // the table, so sending what a status DOES on every snapshot would be
      // sending a constant sixty times a second" — and `findRead` only ever
      // looks at the id, so that is all this needs.
      (facing?.state.statuses ?? []).map((s) => ({ id: s.id, endsAt: s.endsAt })),
    );
    this.updateForges();
    this.profiler.begin("minimap");
    this.updateMinimap();
    this.profiler.end("minimap");
    // Derived before anything draws, so the ring, the frame and the nameplate
    // all agree within a single frame.
    this.profiler.begin("targeting");
    this.updateTargeting();
    this.hoverId =
      this.pointerX >= 0 ? this.pickMonsterAt(this.pointerX, this.pointerY) : null;
    this.updateIndicators();
    this.profiler.end("targeting");

    this.profiler.begin("occluders");
    this.fadeOccluders();
    this.profiler.end("occluders");
    this.profiler.begin("plates");
    this.drawPlates();
    this.profiler.end("plates");
    this.profiler.begin("daynight");
    const hour = this.world.updateDayNight();
    this.profiler.end("daynight");
    // After updateDayNight, so the town is lit against the sky it is standing
    // under rather than against last frame's.
    // The road runs on the town's clock. A frontier that lit on its own
    // schedule would put two times of day in one frame.
    // River, road, ambience, mist and town, all driven per frame off the same
    // clock. Timed as one because they are one kind of work — living scenery —
    // and twelve one-line sections would bury the list they appear in.
    this.profiler.begin("world");
    this.northRoad.update(
      nightAmount(hour.clock),
      this.localActor?.position.x ?? 0,
      this.localActor?.position.z ?? 0,
      performance.now() / 1000,
    );
    // Not on the clock, unlike everything else updated here: a river runs at
    // night.
    this.river.update(performance.now() / 1000);
    // The small living things, beside the river and for the same reason: they
    // move because they are alive rather than because the clock says so, so
    // they run on `performance.now` and take the real frame delta. They do take
    // the HOUR, because who is out is a question about the light.
    this.ambience.update(
      dt,
      performance.now() / 1000,
      nightAmount(hour.clock),
      this.localActor?.position.x ?? 0,
      this.localActor?.position.z ?? 0,
    );
    // And the mist, which takes the raw CLOCK rather than `nightAmount`: it is
    // a dawn phenomenon above all, and night-ness cannot tell dawn from dusk.
    // It is also handed the scene's own fog colour, so mist and sky can never
    // be two different weathers in one frame.
    this.mist.update(
      dt,
      performance.now() / 1000,
      hour.clock,
      (this.world.scene.fog as THREE.Fog).color,
      this.localActor?.position.x ?? 0,
      this.localActor?.position.z ?? 0,
    );
    this.updatePresence(nightAmount(hour.clock));
    this.updateContacts();
    // In SERVER pixels, because every table the beds read — the woods, the
    // river, the braziers, the road's torches — is written in them.
    this.soundscape.update({
      sx: this.playerX,
      sy: this.playerY,
      night: nightAmount(hour.clock),
      windStrength: currentWind().strength,
    });
    // And the outlines, which run the OTHER way from the pool of light at the
    // feet — see `outlineWeight` in Actor.ts. A pale line needs weight to
    // register against a lit field and almost none against black.
    const outline = 0.95 - nightAmount(hour.clock) * 0.62;
    this.localActor?.setOutlineWeight(outline);
    for (const actor of this.players.values()) actor.setOutlineWeight(outline);
    // Three uniform writes, shared by reference across every patched foliage
    // material in the scene — so this costs the same whether fifty thousand
    // plants are swaying or none are. Fed the WALL clock rather than
    // `performance.now`, because the field is derived and two players in the
    // same grass have to see the same gust.
    updateWind();
    this.town.update(
      nightAmount(hour.clock),
      Math.hypot(this.playerX - TOWN_CENTER.x, this.playerY - TOWN_CENTER.y) / PX_PER_UNIT,
      performance.now() / 1000,
    );
    this.profiler.end("world");
    this.profiler.begin("hud");
    this.hud.setPortrait(classForWeapon(this.appearance.weaponType));
    this.hud.syncLayout();
    this.hud.setClock(hour.name, gameClock(hour.clock * DAY_LENGTH_MS), isDaytime(hour.clock * DAY_LENGTH_MS));
    this.profiler.end("hud");

    // The GPU submission on its own line. This is the number that separates
    // "the scene is too heavy" from "the JavaScript above it is too heavy",
    // and they are completely different problems with completely different
    // fixes — so it is the first thing worth being able to read.
    this.profiler.begin("render");
    this.world.render();
    this.profiler.end("render");

    if (this.profiler.enabled) {
      // Read AFTER the render, because three.js resets the per-frame counters
      // at the start of each one — sampled before, these are last frame's.
      const info = this.world.renderer.info;
      // A NEW SHADER PROGRAM, IF ONE JUST GOT COMPILED. Three warming passes
      // (M70.53's actor buffers, and the two `prewarm` calls started this
      // session) have all been confirmed live not to be the cause of the
      // remaining `render`-section spikes — so rather than warm a fourth
      // thing on a guess, this answers the only question left directly:
      // did `renderer.info.programs` — the same count the overlay already
      // shows — actually grow on the frame that spiked. If it did, some
      // material somewhere is still compiling cold and this says so by
      // name-adjacent evidence (the count and how it moved) rather than by
      // guessing which one. If it did NOT, shader compilation is eliminated
      // as a cause entirely, the same way M70.52 eliminated the loader.
      const programCount = info.programs?.length ?? 0;
      // The count alone says something churns; the keys say WHAT — the
      // string three.js hashes a material's defines into, which is what
      // actually decides whether two materials share a program or each pay
      // for their own. Computed every frame (cheap: at most ~70 short
      // strings) but only ever LOGGED on the frames where the count moved,
      // diffed against the previous frame's set rather than dumped
      // wholesale, so a stack of ninety keys does not bury the one or two
      // that actually changed.
      const keys = new Set((info.programs ?? []).map((p) => p.cacheKey));
      if (this.lastProgramCount !== null && programCount !== this.lastProgramCount) {
        const added = [...keys].filter((k) => !this.lastProgramKeys.has(k));
        const removed = [...this.lastProgramKeys].filter((k) => !keys.has(k));
        console.warn(
          `[programs] ${this.lastProgramCount} -> ${programCount} this frame ` +
            `(${programCount - this.lastProgramCount > 0 ? "+" : ""}${programCount - this.lastProgramCount})` +
            (added.length ? `\n  +added: ${added.join(" | ")}` : "") +
            (removed.length ? `\n  -removed: ${removed.join(" | ")}` : ""),
        );
      }
      this.lastProgramCount = programCount;
      this.lastProgramKeys = keys;
      this.profiler.setLabel(
        `quality ${this.world.qualityLabel} (F4)  ·  ` +
          `${this.pacer.refreshHz.toFixed(0)}Hz display, 1 frame per ` +
          `${this.pacer.divisor} refresh${this.pacer.divisor === 1 ? "" : "es"} ` +
          `= ${this.pacer.targetFps.toFixed(0)}fps target`,
      );
      this.profiler.setStats({
        "draw calls": info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        actors: this.players.size + this.monsters.size + this.npcs.size,
        // Chunks the distance cut left standing, out of every chunk there is.
        // The ratio is the whole story of whether culling.ts is earning its
        // place, and it is the first thing to look at if the world starts
        // looking bare.
        "cover chunks": this.world.culler.perTier.get("cover") ?? 0,
        "tree chunks": this.world.culler.perTier.get("trees") ?? 0,
        "chunks total": this.world.culler.totalChunks,
      });
    }
    // Unconditional — unlike the block above, hitches are logged whether or
    // not F3 is open (see profiler.ts), so this cannot live behind the same
    // `enabled` gate or the very reports this exists to explain would go back
    // to saying nothing about what the player was doing. "It stutters
    // randomly" is real information every time it happens; the player just
    // has no way to hand it over. This folds it into the hitch line itself.
    {
      const moving =
        this.keys.has("w") ||
        this.keys.has("a") ||
        this.keys.has("s") ||
        this.keys.has("d") ||
        this.keys.has("arrowup") ||
        this.keys.has("arrowdown") ||
        this.keys.has("arrowleft") ||
        this.keys.has("arrowright");
      const townDist = Math.hypot(this.playerX - TOWN_CENTER.x, this.playerY - TOWN_CENTER.y);
      let nearMonsters = 0;
      for (const v of this.monsters.values()) {
        if (Math.hypot(v.state.x - this.playerX, v.state.y - this.playerY) < 2000) nearMonsters++;
      }
      this.profiler.setContext(
        `${moving ? "moving" : "idle"} ${townDist < TOWN_RADIUS_PX ? "town" : "field"} ` +
          `monsters=${nearMonsters}/${this.monsters.size} players=${this.players.size} ` +
          `engaged=${this.engagedId ? "yes" : "no"}`,
      );
    }
    this.profiler.frameEnd();
  }

  /**
   * The pool of light under each person. See presence.ts for why it is a pool
   * and not a ring.
   *
   * Players only — you and whoever else is out here. NOT monsters, which have
   * nameplates, a target ring and a difficulty colour already, and not
   * townspeople, who stand in one place for the life of the world and would
   * therefore wear a permanent scorch mark on the flagstones.
   */
  private updatePresence(night: number): void {
    this.marks.length = 0;
    if (this.localActor) {
      this.marks.push({
        x: this.localActor.position.x,
        y: this.localActor.position.y,
        z: this.localActor.position.z,
        self: true,
      });
    }
    for (const actor of this.players.values()) {
      this.marks.push({ x: actor.position.x, y: actor.position.y, z: actor.position.z, self: false });
    }
    // Under a canopy is the other way this world gets dark, and it is the one
    // the day/night value cannot see: noon in Blackstand is dimmer than dusk on
    // the road. Read from the same field the woods themselves are drawn from.
    const gloom = forestStrengthAt(this.playerX, this.playerY);
    this.presence.update(this.marks, night, gloom, performance.now() / 1000);
  }

  /**
   * The shade under every body that is standing on the ground.
   *
   * EVERYTHING, unlike the pool of light above — players, monsters and
   * townspeople alike. See `contact.ts` for why the two features have opposite
   * scopes: one answers "which of these figures is mine", which only a player
   * can be, and this one answers "is this thing touching the floor", which a
   * wolf and a shopkeeper are as entitled to as you are.
   *
   * Bounded by distance rather than by luck. The pool is finite, and a camp of
   * twenty behind you must never be able to push your own feet out of it — so
   * the local player goes in first and anything past the cull is simply too
   * small to read anyway.
   */
  private updateContacts(): void {
    this.contactList.length = 0;
    const self = this.localActor;
    if (self) {
      this.contactList.push({
        x: self.position.x,
        y: self.position.y,
        z: self.position.z,
        radius: PLAYER_BODY_RADIUS_PX / PX_PER_UNIT,
      });
    }
    const cx = self?.position.x ?? 0;
    const cz = self?.position.z ?? 0;
    const near = (p: THREE.Vector3): boolean =>
      (p.x - cx) * (p.x - cx) + (p.z - cz) * (p.z - cz) < CONTACT_CULL_UNITS * CONTACT_CULL_UNITS;

    for (const actor of this.players.values()) {
      if (!near(actor.position)) continue;
      this.contactList.push({
        x: actor.position.x,
        y: actor.position.y,
        z: actor.position.z,
        radius: PLAYER_BODY_RADIUS_PX / PX_PER_UNIT,
      });
    }
    for (const monster of this.monsters.values()) {
      const p = monster.actor.position;
      if (!near(p)) continue;
      // The radius the game already collides with, so the shade and the body
      // cannot disagree about how much room the creature takes up.
      const radiusPx = MONSTER_STATS[monster.kind]?.bodyRadiusPx ?? PLAYER_BODY_RADIUS_PX;
      this.contactList.push({ x: p.x, y: p.y, z: p.z, radius: radiusPx / PX_PER_UNIT });
    }
    for (const npc of this.npcs.values()) {
      const p = npc.actor.position;
      if (!near(p)) continue;
      this.contactList.push({
        x: p.x,
        y: p.y,
        z: p.z,
        radius: PLAYER_BODY_RADIUS_PX / PX_PER_UNIT,
      });
    }
    this.contacts.update(this.contactList);
  }

  private updateIndicators(): void {
    const self = this.localActor;
    if (!self) return;

    const reach = this.reach();

    // Target ring, doubling as a range readout. Drawn around whatever is
    // actually being fought, chosen or not.
    const engaged = this.engagedId ? this.monsters.get(this.engagedId) : null;
    if (engaged && !engaged.dead) {
      const spec = MONSTER_MODELS[engaged.kind];
      this.indicators.showTarget(
        engaged.actor.position.x,
        engaged.actor.position.z,
        this.distanceTo(engaged) <= reach,
        Math.max(0.7, spec.height * 0.5),
      );
    } else {
      this.indicators.hideTarget();
    }

    // The lock ring sits just outside it. Same monster almost always, in which
    // case the two read as one thicker marker.
    const locked = this.lockedId ? this.monsters.get(this.lockedId) : null;
    if (locked && !locked.dead) {
      const spec = MONSTER_MODELS[locked.kind];
      this.indicators.showLock(
        locked.actor.position.x,
        locked.actor.position.z,
        Math.max(0.7, spec.height * 0.5),
      );
    } else {
      this.indicators.hideLock();
    }

    // Hover: what a click would take right now.
    const hovered =
      this.hoverId && this.hoverId !== this.engagedId && this.hoverId !== this.lockedId
        ? this.monsters.get(this.hoverId)
        : null;
    if (hovered && !hovered.dead) {
      const spec = MONSTER_MODELS[hovered.kind];
      this.indicators.showHover(
        hovered.actor.position.x,
        hovered.actor.position.z,
        Math.max(0.7, spec.height * 0.5),
      );
    } else {
      this.indicators.hideHover();
    }

    // Reach ring, only while a fight is actually happening.
    if (performance.now() - this.lastCombatAt < COMBAT_INDICATOR_TIMEOUT_MS) {
      this.indicators.showReach(self.position.x, self.position.z, reach / PX_PER_UNIT);
    } else {
      this.indicators.hideReach();
    }

    // Boss telegraphs. The radius is a static per-kind stat, which is exactly
    // why the snapshot only needs to carry the boolean.
    this.indicators.beginDanger();
    for (const [id, vis] of this.monsters) {
      if (vis.dead || !vis.state.windingUp) continue;
      const slam = MONSTER_STATS[vis.kind].slamRadiusPx;
      if (!slam) continue;
      this.indicators.danger(id, vis.actor.position.x, vis.actor.position.z, slam / PX_PER_UNIT);
    }
    this.indicators.endDanger();
  }

  /**
   * Fades anything standing between the camera and the player.
   *
   * This problem simply does not exist in 2D — the old renderer Y-sorted, so
   * the player was always drawn over anything nearer the camera. In 3D a tree
   * genuinely occludes, and standing in a wood meant fighting a fight you could
   * not see. Every MMO solves it this way rather than with camera collision,
   * which fights the player for control of the view.
   */
  /**
   * Candidates for the fade ray, rebuilt only when the player has moved.
   *
   * `fadeOccluders` used to hand the raycaster `[...nodes, decor,
   * ...buildings]` with `recursive = true` — every tree, rock, bush and
   * building in the world, traversed and bounds-tested on every single frame.
   * It measured 1.60ms, a tenth of the frame budget, to answer a question about
   * a segment at most twenty-two units long.
   *
   * Because that is the whole insight: a blocker has to intersect the line from
   * the camera to the player's head, and BOTH ends of that line are within the
   * camera's own leash (`CAMERA_MAX_DISTANCE`, 22) of the player. So anything
   * whose bounds are further than that from the player cannot possibly be on
   * it, whatever direction the camera is facing. The filter is exact rather
   * than heuristic, which is why it can be this aggressive.
   */
  private occluderCandidates: THREE.Object3D[] = [];
  private occluderBuiltAt = { x: Infinity, z: Infinity };
  private readonly occluderBox = new THREE.Box3();
  private readonly guideTargets = new Set<string>();
  private readonly pickSphere = new THREE.Sphere();
  private readonly rayHead = new THREE.Vector3();
  private readonly rayDir = new THREE.Vector3();

  private refreshOccluderCandidates(px: number, pz: number): void {
    const dx = px - this.occluderBuiltAt.x;
    const dz = pz - this.occluderBuiltAt.z;
    if (dx * dx + dz * dz < 4) return; // two units, same threshold the culler uses
    this.occluderBuiltAt = { x: px, z: pz };

    this.occluderCandidates.length = 0;
    const reach = CAMERA_MAX_DISTANCE + 6; // the leash, plus a little for large bounds
    const consider = (obj: THREE.Object3D) => {
      // Bounds are computed once and cached: every one of these is static
      // scenery that will not move for the life of the world, and
      // `setFromObject` walks the whole subtree.
      let sphere = obj.userData.occluderSphere as THREE.Sphere | undefined;
      if (!sphere) {
        sphere = this.occluderBox.setFromObject(obj).getBoundingSphere(new THREE.Sphere());
        obj.userData.occluderSphere = sphere;
      }
      const ox = sphere.center.x - px;
      const oz = sphere.center.z - pz;
      const r = reach + sphere.radius;
      if (ox * ox + oz * oz <= r * r) this.occluderCandidates.push(obj);
    };
    for (const n of this.nodes.values()) consider(n);
    for (const d of this.world.decor.children) consider(d);
    for (const b of this.town.buildings) consider(b);
  }

  private fadeOccluders(): void {
    for (const m of this.fadedMaterials) {
      const base = (m.userData.baseOpacity as number) ?? 1;
      m.opacity = base;
      m.transparent = base < 1;
      m.depthWrite = true;
    }
    this.fadedMaterials.clear();

    const actor = this.localActor;
    if (!actor) return;

    // Scratch vectors rather than clones. Two allocations a frame is nothing on
    // its own; a hundred and twenty a second of them, alongside every other
    // per-frame allocation in the loop, is the collector pressure that shows up
    // as a pause BETWEEN frames — which is exactly the class of stutter left
    // unexplained, so the cheap ones are worth removing on principle.
    const cam = this.world.camera.position;
    const head = this.rayHead.copy(actor.position);
    head.y += 1.0;
    const dir = this.rayDir.copy(head).sub(cam);
    const distance = dir.length();
    if (distance < 0.01) return;
    dir.normalize();

    this.raycaster.set(cam, dir);
    this.raycaster.far = distance;
    // Buildings are in here as well as the treeline now, and they are why this
    // is a guarantee rather than a nicety. The camera already pulls in when a
    // wall gets between it and the character (World.clearDistance), and that
    // handles almost everything — but a player standing flat against a wall
    // puts it closer than any camera can retreat past, and at that point moving
    // the lens cannot help. Fading the wall can. Each building owns its own
    // materials, so only the one actually in the way goes translucent.
    this.refreshOccluderCandidates(actor.position.x, actor.position.z);
    const blockers = this.raycaster.intersectObjects(this.occluderCandidates, true);

    for (const hit of blockers) {
      const mesh = hit.object as THREE.Mesh;
      if (!mesh.isMesh) continue;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const base = (m.userData.baseOpacity as number) ?? 1;
        m.transparent = true;
        m.opacity = base * 0.2;
        // Without this the faded trunk still writes depth and punches a
        // player-shaped hole in whatever is behind it.
        m.depthWrite = false;
        this.fadedMaterials.add(m);
      }
    }
    this.raycaster.far = Infinity;
  }

  /**
   * THE SLIDE WATCHDOG.
   *
   * Reported four times now: attack a monster, a few seconds of lag, and then
   * the walking animation is gone and the character glides across the ground
   * forever. M70.22 and M70.23 fixed a real WebGL context-loss bug that fits
   * every detail of it, and the report survived both — so this stops trying to
   * name the cause and instead detects the SYMPTOM, which is exact and which
   * nothing else in the game can produce.
   *
   * The symptom is: the body is translating and the pose is not. Both halves
   * are measurable here — `stepMovement` is the only thing that moves the local
   * player and it runs one line above this, and `poseClock()` is the mixer's
   * own advancement. Neither is a guess about why.
   *
   * WHY THIS IS A LEGITIMATE THING TO ADD rather than a bandage over a bug that
   * should be found properly: `Actor.play` is six early returns, every one of
   * them a deliberate silent no-op, and one of them — a `currentAnim` of "die",
   * whose `oneShotUntil` is `MAX_SAFE_INTEGER` — can never expire on its own.
   * A locked actor and a healthy one are byte-for-byte identical from outside:
   * `play("run")` is called every frame and returns without a word in both
   * cases, `mixer.update()` is called on a `?.` that swallows a missing rig,
   * and nothing throws. That is a class of failure the codebase currently has
   * NO way to observe, which is exactly why three sessions of reading the call
   * graph have not settled it.
   *
   * So it logs, loudly and once per episode, with the full state at the moment
   * it is still true — the console line the bug has never produced — and then
   * recovers, because a player should not have to reload to walk again.
   */
  private watchForSlide(dt: number): void {
    const actor = this.localActor;
    if (!actor) return;

    // A frame the mixer did not advance is not evidence about anything. `dt` is
    // clamped to 50ms at the top of the loop, so a stall shows up as a run of
    // ordinary frames rather than one huge one — which is the case this has to
    // survive, since "a few seconds of lag" is in every report.
    if (dt <= 0) return;

    const moved =
      Math.abs(this.playerX - this.slideLastX) + Math.abs(this.playerY - this.slideLastY);
    this.slideLastX = this.playerX;
    this.slideLastY = this.playerY;

    const pose = actor.poseClock();
    // Standing still proves nothing: a static pose is what idle looks like when
    // idle is a single-frame clip, and nobody is sliding if nobody is moving.
    if (moved < SLIDE_MOVE_EPSILON_PX) {
      this.slideFrozenMs = 0;
      this.slidePose = pose;
      this.slideReported = false;
      return;
    }

    if (pose !== this.slidePose) {
      this.slidePose = pose;
      this.slideFrozenMs = 0;
      this.slideReported = false;
      return;
    }

    // Moving, and the pose has not advanced by so much as a float. Real
    // animation cannot do this for a whole second: every base state the local
    // player can be in is a looping clip whose time advances on every update.
    this.slideFrozenMs += dt * 1000;
    if (this.slideFrozenMs < SLIDE_FREEZE_MS || this.slideReported) return;
    this.slideReported = true;

    const state = actor.animationState();
    console.error(
      `[slide] the character has moved for ${Math.round(this.slideFrozenMs)}ms with a frozen ` +
        `pose — the animation state machine is stuck. Recovering. State at the lock:`,
      state,
    );
    const ok = actor.unstick();
    if (ok) {
      console.error("[slide] recovered — the base animation is playing again.");
    } else {
      // A different problem entirely, and one worth saying out loud rather than
      // retrying forever: the rig has no clip for the state it is being asked
      // for, so no amount of unsticking will animate it.
      console.error(
        "[slide] could NOT recover: this rig has no action bound for its base state.",
        state,
      );
    }
  }

  private stepMovement(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) dy -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dy += 1;

    const actor = this.localActor;
    if (!actor) return;

    if (dx !== 0 || dy !== 0) {
      this.moveInputX = dx;
      this.moveInputY = dy;
    }

    if (dx === 0 && dy === 0) {
      actor.play("idle");
    } else {
      const len = Math.hypot(dx, dy) || 1;
      const eq = equippedBySlot(this.items);
      const speed = movePxPerSec(null, this.agility, gearMoveBonus(eq));
      this.playerX = clamp(this.playerX + (dx / len) * speed * dt, 0, WORLD_WIDTH);
      this.playerY = clamp(this.playerY + (dy / len) * speed * dt, 0, WORLD_HEIGHT);
      actor.play("run");
      // YOU FACE WHAT YOU ARE FIGHTING, not the way your feet are going.
      //
      // Reported from play: "you attack while facing away". This line was the
      // whole of it — facing was set from movement input every frame, so the
      // moment you moved at all your body turned away from the thing your
      // weapon was landing on, and `onBattleResult`'s `faceToward` was
      // overwritten before it could be seen.
      //
      // Circling a monster, closing on it at an angle and sidestepping a
      // telegraph all keep you pointed at it now, which is what a fight looks
      // like. RUNNING AWAY is the exception and it is not an exception at all:
      // the same `isRetreating` the server refuses to swing on says you have
      // left, so the body turns and goes — because fleeing should look like
      // fleeing, and because a character moonwalking away from a wolf while
      // staring at it is a worse picture than the one being fixed.
      //
      // Screen-space input maps straight to world axes: +x is east, +y is south
      // in server space, which is +z here.
      const engaged = this.engagedId ? this.monsters.get(this.engagedId) : null;
      const facingTarget =
        engaged &&
        !isRetreating(dx, dy, engaged.state.x - this.playerX, engaged.state.y - this.playerY);
      if (facingTarget && engaged) {
        actor.faceToward(engaged.actor.position.x, engaged.actor.position.z);
      } else {
        actor.faceDirection(dx / len, dy / len);
      }
    }

    this.resolvePlayerCollision();
    actor.setTargetPosition(...onGround(toWorldX(this.playerX), toWorldZ(this.playerY)));
    this.maybeSendPosition();
  }

  /**
   * Pushes the player out of any body they are overlapping.
   *
   * Resolved on the client because movement is client-authoritative, and
   * collision that waited for a server round trip would feel like lag rather
   * than like a wall. The server re-runs the same shared function on whatever
   * position arrives, so honesty is not assumed.
   *
   * Called from two places, and it needs both. Once per frame, because the
   * player moves; and again the moment a snapshot lands, because the monsters
   * move too — a body walking into a standing player closes the gap from its
   * own side, and between the snapshot and the next rendered frame the player
   * would otherwise be left standing inside it. At a low frame rate that gap is
   * long enough to see.
   */
  private resolvePlayerCollision(): void {
    const solved = resolveBodyCollision(
      this.playerX,
      this.playerY,
      PLAYER_BODY_RADIUS_PX,
      this.monsterBodies(),
    );
    this.playerX = solved.x;
    this.playerY = solved.y;

    // And out of everything the town is built of — walls, the palisade, the
    // well, the monument, the stall, the benches, the lamp posts. Applied AFTER
    // the bodies, because a monster that has shoved you into the inn should
    // leave you standing outside the inn; the other order lets a body park you
    // inside a building until it wanders off.
    const clear = resolveTownCollision(this.playerX, this.playerY, PLAYER_BODY_RADIUS_PX);
    this.playerX = clear.x;
    this.playerY = clear.y;

    // And out of the Coldwater. The only solid thing outside the palisade, and
    // the exception is argued in shared/river.ts: it is one shape, it is the
    // reason the bridge exists, and a river you can walk across is a blue
    // stripe painted on the grass. Applied last, because the town is four
    // kilometres from the water and nothing either resolves can push you into
    // the other.
    const dry = resolveRiverCollision(this.playerX, this.playerY, PLAYER_BODY_RADIUS_PX);
    this.playerX = dry.x;
    this.playerY = dry.y;
  }

  /** Living monster bodies near enough to matter, as plain circles. Only the
   *  ones with models exist here, which is exactly right: everything beyond the
   *  cull radius is far too distant to be standing on. */
  private monsterBodies(): { x: number; y: number; radiusPx: number }[] {
    const out: { x: number; y: number; radiusPx: number }[] = [];
    for (const vis of this.monsters.values()) {
      if (vis.dead || vis.state.status !== "alive") continue;
      out.push({
        x: vis.state.x,
        y: vis.state.y,
        radiusPx: MONSTER_STATS[vis.kind].bodyRadiusPx,
      });
    }
    return out;
  }

  private maybeSendPosition(): void {
    const now = performance.now();
    if (now - this.lastSendAt < MOVE_SEND_INTERVAL_MS) return;
    if (Math.abs(this.playerX - this.lastSentX) < 0.5 && Math.abs(this.playerY - this.lastSentY) < 0.5) {
      return;
    }
    this.lastSendAt = now;
    this.lastSentX = this.playerX;
    this.lastSentY = this.playerY;
    this.socket.sendMove(this.playerX, this.playerY);
  }

  private drawPlates(): void {
    this.hud.beginPlates();

    // Distance is measured to the camera rather than to the player, because it
    // drives how big the label is ON SCREEN and that is a property of the view.
    // At a close zoom the player is metres from a monster the camera is right
    // behind, and sizing off the player would shrink it for no visible reason.
    const eye = this.world.camera.position;
    const rangeTo = (x: number, z: number) => Math.hypot(x - eye.x, z - eye.z);

    // Which stones are currently somebody's business. Built once per frame
    // rather than per plate, because it walks the quest list.
    // Reused rather than rebuilt. Same reasoning as the scratch vectors in
    // `fadeOccluders`: one Set a frame is invisible on its own and the loop is
    // full of ones like it, and the only stutter left unexplained is a pause
    // between frames, which is what a collector does.
    const guideTargets = this.guideTargets;
    guideTargets.clear();
    for (const entry of this.questTracker.activeQuests) {
      const def = QUESTS.find((q) => q.id === entry.id);
      if (def?.objective.kind === "reach" && !questSatisfied(def, entry.count)) {
        guideTargets.add(def.objective.landmark);
      }
    }

    for (const [id, actor] of this.players) {
      if (!actor.loaded) continue;
      const p = actor.position;
      // hp/maxHp have been tracked since M70.13 (the ally target frame's own
      // fix), but the passive nameplate — visible without selecting anyone —
      // never read them: Hud.plate() already draws a bar off any hp/maxHp it
      // is handed, gated on nothing but their presence.
      const hp = this.playerHp.get(id);
      this.hud.plate(id, this.world.project(p.x, p.y + 2.05, p.z), {
        kind: "player",
        name: this.playerNames.get(id) ?? "player",
        icon: `class-${this.playerClasses.get(id) ?? "adventurer"}`,
        hp: hp?.hp,
        maxHp: hp?.maxHp,
        distance: rangeTo(p.x, p.z),
      });
    }

    for (const [id, vis] of this.monsters) {
      if (!vis.actor.loaded || vis.dead) continue;
      const p = vis.actor.position;
      const model = MONSTER_MODELS[vis.kind];
      const stats = MONSTER_STATS[vis.kind];
      // Only the kinds that telegraph have a windup, and only they set the
      // flag — so the bar appears exactly when there is something to time.
      const windupMs = stats.windupMs;
      const windup =
        vis.state.windingUp && windupMs
          ? (performance.now() - vis.windupStartedAt) / windupMs
          : undefined;

      this.hud.plate(id, this.world.project(p.x, p.y + model.height + 0.4, p.z), {
        kind: "monster",
        name: MONSTER_LABELS[vis.kind],
        hp: vis.state.hp,
        maxHp: vis.state.maxHp,
        band: stats.band,
        // Bosses are the ones that already guarantee a drop, so the frame and
        // the reward are the same fact rather than two lists to keep in step.
        elite: stats.guaranteedDrop,
        engaged: id === this.engagedId,
        locked: id === this.lockedId,
        targetingMe: vis.state.targetId === this.playerId,
        windup,
        distance: rangeTo(p.x, p.z),
      });
    }

    // Label height follows the art: a bush label floating at treetop height
    // reads as belonging to nothing.
    const NODE_LABEL_Y: Record<ResourceNodeState["kind"], number> = { tree: 4.4, rock: 1.4, bush: 1.4 };
    for (const [id, state] of this.nodeStates) {
      const obj = this.nodes.get(id);
      if (!obj) continue;
      this.hud.plate(
        `node-${id}`,
        this.world.project(obj.position.x, NODE_LABEL_Y[state.kind], obj.position.z, 34),
        {
          kind: "node",
          // What it is worth, on the label. The rule — richer the further out
          // you go — is invisible otherwise: a player would have to gather at
          // two distances and compare two numbers in a corner to notice it, and
          // almost nobody does that.
          name: `${NODE_LABELS[state.kind]} ×${gatherYieldFor(bandAt(state.x, state.y), this.gatherLevel)}`,
          icon: NODE_PLATE_ICON[state.kind],
          dim: state.status !== "available",
          distance: rangeTo(obj.position.x, obj.position.z),
        },
      );
    }

    for (const [id, obj] of this.stations) {
      this.hud.plate(`st-${id}`, this.world.project(obj.position.x, 1.9, obj.position.z), {
        kind: "station",
        name: STATION_LABEL,
        icon: "dock-craft",
        distance: rangeTo(obj.position.x, obj.position.z),
      });
    }

    // The waystones. A `node` plate rather than a `station` banner: a standing
    // stone is a place, not a thing you use, and the dim pill is the hierarchy's
    // way of saying "this is here, it is not asking anything of you". It goes
    // gold and loses the dimming only while it is what somebody has told you to
    // walk to, which is the one moment it IS asking something.
    for (const stone of this.waystones) {
      const wanted = guideTargets.has(stone.def.id);
      this.hud.plate(
        `waystone-${stone.def.id}`,
        this.world.project(stone.x, WAYSTONE_PLATE_HEIGHT, stone.z, 40),
        {
          kind: wanted ? "station" : "node",
          name: stone.def.name,
          icon: "waystone",
          dim: !wanted,
          distance: rangeTo(stone.x, stone.z),
        },
      );
    }

    // Where the road goes. One plate, over the cairn at the far end, because a
    // road with nothing written on it is a dirt track and a player who walks
    // out of the postern has no way to know this one leads anywhere. It is a
    // `station` banner rather than a `node` pill on purpose — the gold is the
    // interface saying "this is a destination", which is exactly what it is,
    // even though there is nothing there yet.
    {
      const sx = toWorldX(NORTH_TOWN_SITE.x);
      const sz = toWorldZ(NORTH_TOWN_SITE.y);
      this.hud.plate("north-town", this.world.project(sx, 2.6, sz, 48), {
        kind: "station",
        name: NORTH_TOWN_NAME,
        subtitle: "nothing here yet",
        icon: "waystone",
        distance: rangeTo(sx, sz),
      });
    }

    // Townspeople. `engaged` is reused to mean "close enough to talk", which is
    // what the plate's own styling reads to add the prompt — the same field
    // meaning "this is the one you are acting on" that it means for a monster.
    for (const [id, npc] of this.npcs) {
      if (!npc.actor.loaded) continue;
      // Against where they ARE, not where their post is. A plate that says "too
      // far" over somebody standing next to you is worse than one that never
      // moved at all.
      const inRange = Math.hypot(this.playerX - npc.x, this.playerY - npc.y) <= NPC_TALK_RANGE_PX;
      const wx = toWorldX(npc.x);
      const wz = toWorldZ(npc.y);
      // Same fact `dialogueActionsFor` already derives when the box opens —
      // read here too so the nameplate can say it before the box does.
      // Only "offer" and "ready" are worth a walk over; "locked" has
      // nothing to do yet and "done"/"in-progress" already show nowhere
      // else, so a badge for either would be a mark with nothing behind it.
      const hasQuest = questsFrom(npc.def.id).some((def) => {
        const state = offerStateFor(def, this.level, this.questTracker.activeQuests, this.questTracker.completedQuests);
        return state === "offer" || state === "ready";
      });
      this.hud.plate(`npc-${id}`, this.world.project(wx, 2.05, wz, 46), {
        kind: "npc",
        name: npc.def.name,
        subtitle: npc.def.title,
        icon: npc.def.icon,
        engaged: inRange,
        hasQuest,
        distance: rangeTo(wx, wz),
      });
    }

    // Loot on the ground, named and coloured by its quality. This is the one
    // place a player reads an item from across a field, so it carries the same
    // colour the bag slot will — and its own icon, since "a Runed something"
    // is not worth walking over and a Runed Claymore is.
    const now = Date.now();
    for (const drop of this.dropStates) {
      const x = toWorldX(drop.x);
      const z = toWorldZ(drop.y);
      // Whether it is worth walking to, on the label. The same conservative
      // rule the bag uses — nothing given up and something gained — because a
      // mark that appears on sidegrades is one players learn to ignore, and
      // this one is read at a distance where the tooltip cannot help.
      const better = isUpgrade(drop.item, this.items);
      // Somebody else's, for now. Dimmed rather than hidden: knowing what fell
      // is worth something even when you cannot pick it up yet, and it comes
      // free in a moment anyway.
      const mine = drop.ownerId === this.playerId || now >= drop.freeAt;
      this.hud.plate(`drop-${drop.id}`, this.world.project(x, 1.35, z, 48), {
        kind: "drop",
        name: (better ? "▲ " : "") + itemShortName(drop.item),
        icon: itemBase(drop.item.baseId).icon,
        tint: RARITIES[drop.item.rarity]?.color,
        dim: !mine,
        distance: rangeTo(x, z),
      });
    }

    this.hud.endPlates();

    // Target frame mirrors the selected monster's live snapshot values. The
    // hide branch is not optional: without it the frame stayed on screen
    // showing a dead monster's last known health forever.
    const shownId = this.lockedId ?? this.engagedId;
    const t = shownId ? this.monsters.get(shownId) : null;
    if (t && !t.dead) {
      const range = this.reach();
      const dist = this.distanceTo(t);
      // "locked" is worth saying out loud: it is the difference between the
      // game having picked this for you and you having insisted on it.
      const note =
        dist > range
          ? this.lockedId === shownId
            ? "locked · out of reach"
            : "approaching"
          : this.lockedId === shownId
            ? "locked"
            : undefined;
      const tStats = MONSTER_STATS[t.kind];
      this.targetFrame.show(MONSTER_LABELS[t.kind], t.state.hp, t.state.maxHp, note, {
        band: tStats.band,
        elite: tStats.guaranteedDrop,
        icon: MONSTER_PORTRAIT[t.kind],
        // Read from the loot table itself rather than from a list beside it, so
        // the frame cannot promise something the roller does not carry. Only
        // bosses have one, which is why this needs no `elite` check of its own.
        knownFor: signatureOf(t.kind)?.name,
        // Derived from the same profile the server resolves damage against, so
        // the frame cannot tell a player to bring fire to something that does
        // not mind it. Mapped to names and colours here because the frame is a
        // renderer-agnostic panel and has no business importing the bestiary.
        // Read off the snapshot rather than tracked locally: the server owns
        // when a status ends, and a client counting its own timers would show
        // a poison still running after it had stopped doing anything.
        statuses: (t.state.statuses ?? [])
          .map((s) => STATUSES[s.id])
          .filter(Boolean)
          .map((d) => ({ id: d.id, name: d.name, icon: d.icon, kind: d.kind, blurb: d.blurb })),
        enrageThreshold: tStats.enrageThreshold,
        ...(() => {
          const { resists, weakTo } = describeResists(tStats.resist);
          const tag = (e: { school: DamageSchool }) => ({
            school: e.school,
            name: schoolDef(e.school).name,
            color: schoolDef(e.school).color,
          });
          return { resists: resists.map(tag), weakTo: weakTo.map(tag) };
        })(),
      });
      // Only the kinds that telegraph have a windup duration, and only they
      // ever set the flag, so the bar appears exactly when there is something
      // to time.
      const windup = MONSTER_STATS[t.kind].windupMs;
      this.targetFrame.setWindup(
        t.state.windingUp && windup
          ? (performance.now() - t.windupStartedAt) / windup
          : null,
      );
    } else if (this.allyTargetId) {
      const ally = this.players.get(this.allyTargetId);
      // Real numbers now — see `PlayerState.hp`'s own comment. Falls back to
      // 0/0 (TargetFrame's own "unknown, hide the bar" case) only for the
      // one tick between an ally appearing in `this.players` and their first
      // snapshot actually landing in `playerHp`.
      if (ally) {
        const hp = this.playerHp.get(this.allyTargetId);
        // Same treatment the monster branch already gives its own statuses
        // (see the comment there) — an ally's War Cry or a poison landing on
        // them was visible on their body (M70.17) but not on the one panel
        // built to summarise a selected target's condition.
        const statuses = (this.playerStatuses.get(this.allyTargetId) ?? [])
          .map((st) => STATUSES[st.id])
          .filter(Boolean)
          .map((d) => ({ id: d.id, name: d.name, icon: d.icon, kind: d.kind, blurb: d.blurb }));
        this.targetFrame.show(
          this.playerNames.get(this.allyTargetId) ?? "Ally",
          hp?.hp ?? 0,
          hp?.maxHp ?? 0,
          "ally",
          { icon: `class-${this.playerClasses.get(this.allyTargetId) ?? "adventurer"}`, statuses },
        );
      }
      else this.targetFrame.hide();
    } else {
      this.targetFrame.hide();
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Stable per-id variation, so every client picks the same art for a node. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
