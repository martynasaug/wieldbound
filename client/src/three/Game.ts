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
  weaponDef,
  xpBonusPercent,
  xpToNextLevel,
  type Appearance,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
  type MonsterKind,
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
import { InventoryPanel } from "../ui/InventoryPanel";
import { CraftPanel } from "../ui/CraftPanel";
import { SkillPanel, type WeaponProgressView } from "../ui/SkillPanel";
import { LeaderboardPanel } from "../ui/LeaderboardPanel";
import { CombatLog } from "../ui/CombatLog";
import { TargetFrame } from "../ui/TargetFrame";
import { ATTACK_SLOT, Hotbar, type BarAction } from "../ui/Hotbar";
import { Actor } from "./Actor";
import { CLASS_BODIES } from "./gear";
import { Hud } from "./hud";
import { Floaters, type FloatSpec } from "./floaters";
import { Drops } from "./drops";
// `isUpgrade` is presentation, not a rule: it decides whether to draw a mark,
// and lives beside the other things that decide how an item is shown.
import { isUpgrade } from "../ui/items";
import { Effects, isEffectName, type EffectName } from "./effects";
import { Indicators } from "./indicators";
import { ATTACK_STYLES, Projectiles, attackStyle, impactDelayMs } from "./attacks";
import { playSfx, preloadSfx, toggleMuted } from "./sfx";
import {
  PX_PER_UNIT,
  WORLD_UNITS_H,
  WORLD_UNITS_W,
  World,
  terrainHeight,
  toServerX,
  toServerY,
  toWorldX,
  toWorldZ,
} from "./World";
import { instantiate, whenLoadsSettle } from "./assets";
import {
  CONSUMABLES,
  ITEM_BASES,
  PALETTE_SETS,
  activeSets,
  canForge,
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
const MONSTER_SPAWN_RADIUS_PX = 1150;
const MONSTER_DESPAWN_RADIUS_PX = 1550;

// How long after a monster's swing starts its hit is considered to land.
// Without a beat the damage number appears on the same frame as the wind-up,
// which reads as a number popping out of nowhere rather than as a blow
// connecting. Every monster in the roster fights at contact range, so one
// constant covers them; the PLAYER's beat comes from the weapon instead — see
// `impactDelayMs` in attacks.ts, where a flying attack lands when it arrives.
const IMPACT_DELAY_MS = 170;

// The reach ring fades out once combat traffic stops, so it is not permanently
// drawn under a player who is just walking around.
const COMBAT_INDICATOR_TIMEOUT_MS = 3500;

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

interface MonsterVisual {
  actor: Actor;
  kind: MonsterKind;
  state: MonsterState;
  dead: boolean;
  /** Previous wind-up flag, so the telegraph cue fires on the edge not every tick. */
  windingUp: boolean;
  /** When the current wind-up started, for the target frame's timer bar. */
  windupStartedAt: number;
  /** Latched run/idle decision — see `isMoving`. */
  moving: boolean;
}

// How far a snapshot-driven actor must travel between snapshots to count as
// running, and how still it must go before it counts as stopped. Two
// thresholds rather than one because a single one chatters: a monster holding
// position at the edge of its stop distance drifts a pixel back and forth, and
// on one threshold that flickers the run animation on and off every snapshot.
const MOVE_START_PX = 2.0;
const MOVE_STOP_PX = 0.7;

/**
 * Whether a snapshot-driven actor should be running, measured between the last
 * two SERVER positions rather than between rendered ones.
 *
 * Rendered positions are interpolated, so they lag the truth: reading them says
 * "stopped" while the model is still visibly catching up, which plays the idle
 * animation over a sliding character — the ice-skating this is here to remove.
 * The server positions are the actual motion and have no lag to be fooled by.
 */
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
  tree: [
    "nature/CommonTree_1.gltf", "nature/CommonTree_2.gltf", "nature/CommonTree_3.gltf",
    "nature/CommonTree_4.gltf", "nature/CommonTree_5.gltf",
    "nature/Pine_2.gltf", "nature/Pine_4.gltf",
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
  private readonly inventoryPanel: InventoryPanel;
  private readonly craftPanel: CraftPanel;
  private readonly skillPanel: SkillPanel;
  private readonly leaderboardPanel: LeaderboardPanel;
  private readonly combatLog = new CombatLog();
  private readonly targetFrame = new TargetFrame();
  private readonly hotbar: Hotbar;

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
  private wood = 0;
  private ore = 0;
  private herb = 0;
  /** The fourth material, off kills rather than out of the ground. */
  private essence = 0;
  /** Base ids this character has learned to forge, by taking one apart. */
  private recipes: string[] = [];
  /** Whether the wallet has arrived once, so the opening balance is not
   *  mistaken for something the player just earned. */
  private walletSeen = false;
  /** The same, for the recipe list. */
  private recipesSeen = false;

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

  constructor(container: HTMLElement, characterName: string) {
    this.name = characterName;
    this.world = new World(container);
    this.hud = new Hud(container);
    this.floaters = new Floaters(container);
    this.drops = new Drops(this.world.scene);
    this.minimap = new Minimap(container);
    this.effects = new Effects(this.world.scene);
    this.indicators = new Indicators(this.world.scene);
    this.projectiles = new Projectiles(this.world.scene);
    this.skillFx = new SkillFx(this.world.scene);

    this.characterPanel = new CharacterPanel((stat) => this.socket.sendAllocateStat(stat));
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
        this.wood = p.wood;
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
        const gained = this.walletSeen ? p.essence - this.essence : 0;
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
        this.wood = p.wood;
        this.ore = p.ore;
        this.herb = p.herb;
        this.essence = p.essence;
        this.syncMaterials();
      },
      onConsumables: (p) => {
        this.inventoryPanel.setConsumables(p.counts);
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
        this.herb = p.herb;
        this.syncMaterials();
      },
      onOreUpdate: (p) => {
        this.wood = p.wood;
        this.ore = p.ore;
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
      onBattleResult: (p) => this.onBattleResult(p),
      onMonsterAttack: (p) => this.onMonsterAttack(p),
      onPotionsUpdate: (p) => {
        this.wood = p.wood;
        this.ore = p.ore;
        this.herb = p.herb;
        this.inventoryPanel.setPotions(p.potions);
        this.syncMaterials();
      },
      onTonicsUpdate: (p) => {
        this.wood = p.wood;
        this.ore = p.ore;
        this.herb = p.herb;
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
      PALETTE_SETS,
      activeSets,
      canForge,
      eligibleAffixes,
      gearPassives,
      itemName,
      itemPassives,
      forgeCost,
      reforgeCost,
      salvageYield,
    };
    // Starts as the bare-handed body; WELCOME's appearance re-dresses it, and
    // swaps the rig outright if the saved character is already holding something.
    // `interpolate: false` because this actor's position is recomputed exactly
    // every frame by stepMovement; easing toward it would only add lag, and the
    // lag is what makes the character glide after you let go of the key.
    this.localActor = new Actor({
      model: CLASS_BODIES.adventurer,
      height: PLAYER_HEIGHT,
      interpolate: false,
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
    preloadSfx();
    this.socket.connect();

    const decor = this.world.buildDecor();
    const body = this.localActor.load();
    await Promise.all([decor, body]);
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
    this.localActor.snapTo(toWorldX(this.playerX), 0, toWorldZ(this.playerY));

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
    this.wood = p.wood;
    this.ore = p.ore;
    this.herb = p.herb;

    this.localActor?.snapTo(toWorldX(this.playerX), 0, toWorldZ(this.playerY));

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
    players: PlayerState[];
    nodes: ResourceNodeState[];
    monsters: MonsterState[];
    stations: CraftingStationState[];
    drops?: DroppedItemState[];
  }): void {
    this.syncPlayers(p.players);
    this.syncMonsters(p.monsters);
    // The monsters just moved, so where the player may stand has changed.
    this.resolvePlayerCollision();
    this.localActor?.setTargetPosition(
      toWorldX(this.playerX),
      0,
      toWorldZ(this.playerY),
    );
    this.syncNodes(p.nodes);
    this.syncStations(p.stations);
    // Optional on the wire so a client can outlive a server that predates
    // ground loot; the empty list is the honest reading of "no drops".
    this.dropStates = p.drops ?? [];
    this.drops.sync(this.dropStates, (x, y) => ({ x: toWorldX(x), z: toWorldZ(y) }));
  }

  private syncPlayers(states: PlayerState[]): void {
    const seen = new Set<string>();
    for (const s of states) {
      seen.add(s.id);
      if (s.id === this.playerId) continue; // local player is predicted, not snapped
      this.playerNames.set(s.id, s.name);
      this.playerClasses.set(s.id, appearanceClass(s.appearance));
      let actor = this.players.get(s.id);
      if (!actor) {
        actor = new Actor({ model: CLASS_BODIES.adventurer, height: PLAYER_HEIGHT });
        this.players.set(s.id, actor);
        this.playerMotion.set(s.id, { x: s.x, y: s.y, moving: false });
        void actor.load().then(() => this.world.scene.add(actor!.root));
      }
      // Remote players are dressed from the same `Appearance` the local player
      // renders itself from, so there is one drawing path rather than a
      // self-case and an others-case that can drift apart.
      actor.setAppearance(s.appearance);
      const x = toWorldX(s.x);
      const z = toWorldZ(s.y);
      const motion = this.playerMotion.get(s.id) ?? { x: s.x, y: s.y, moving: false };
      const moving = isMoving(motion.x, motion.y, s.x, s.y, motion.moving);
      actor.setTargetPosition(x, 0, z);
      if (moving) actor.faceDirection(s.x - motion.x, s.y - motion.y);
      actor.play(moving ? "run" : "idle");
      this.playerMotion.set(s.id, { x: s.x, y: s.y, moving });
    }
    for (const [id, actor] of this.players) {
      if (seen.has(id)) continue;
      actor.dispose();
      this.players.delete(id);
      this.playerNames.delete(id);
      this.playerClasses.delete(id);
      this.playerMotion.delete(id);
    }
  }

  private syncMonsters(states: MonsterState[]): void {
    for (const s of states) {
      const distance = Math.hypot(s.x - this.playerX, s.y - this.playerY);
      let vis = this.monsters.get(s.id);

      if (!vis) {
        // Far camps cost nothing at all — no model, no skeleton, no update.
        if (distance > MONSTER_SPAWN_RADIUS_PX) continue;
        const spec = MONSTER_MODELS[s.kind];
        // Seeded from the server id, so every client sees this particular
        // mushnub breathing at the same point in its loop as every other client
        // does — and so a camp of four is four creatures rather than one
        // animation played four times.
        const actor = new Actor({
          model: spec.model,
          height: spec.height,
          variance: (hashString(s.id) % 1000) / 1000,
          idleGlance: true,
        });
        vis = { actor, kind: s.kind, state: s, dead: false, windingUp: false, windupStartedAt: 0, moving: false };
        this.monsters.set(s.id, vis);
        void actor.load().then(() => this.world.scene.add(actor.root));
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

      vis.actor.setTargetPosition(x, 0, z);
      if (moving) vis.actor.faceDirection(s.x - vis.state.x, s.y - vis.state.y);

      // Chill is a gameplay signal (your Frost Nova is still working), so it
      // gets a colour rather than being inferred from the monster moving slower.
      vis.actor.setChilled(s.slowed);

      const nowDead = s.status === "dead";
      if (nowDead && !vis.dead) {
        vis.actor.play("die");
        vis.actor.setChilled(false);
        if (this.lockedId === s.id) this.setTarget(null);
      } else if (!nowDead && vis.dead) {
        vis.actor.revive();
      } else if (!nowDead) {
        vis.actor.play(moving ? "run" : "idle");
      }

      // The wind-up needs a sound the moment it starts, or a player looking at
      // their own character never learns the danger circle appeared.
      if (s.windingUp && !vis.windingUp) {
        playSfx("cast", 0.8);
        vis.windupStartedAt = performance.now();
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
      obj.position.set(toWorldX(s.x), 0, toWorldZ(s.y));
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
      player: { x: self.position.x, z: self.position.z, facing: self.bearing },
      players,
      monsters,
      nodes,
      stations,
      bounds: { halfWidth: WORLD_UNITS_W / 2, halfHeight: WORLD_UNITS_H / 2 },
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
      group.position.set(toWorldX(s.x), 0, toWorldZ(s.y));
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
    if (delta < 0) this.localActor?.play("hit");

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
        this.localActor?.snapTo(toWorldX(p.x), 0, toWorldZ(p.y));
        // A death pose would otherwise persist through the respawn.
        setTimeout(() => this.localActor?.revive(), 900);
      }
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
  }): void {
    const vis = this.monsters.get(p.monsterId);
    this.lastCombatAt = performance.now();
    this.localActor?.play("attack");
    if (vis) this.localActor?.faceToward(vis.actor.position.x, vis.actor.position.z);

    // What the weapon actually does, and — for anything that flies — how long
    // it takes to get there. One table drives both, so the damage number can
    // never appear before its own arrow does.
    const style = attackStyle(this.appearance.weaponType);
    const gap = vis ? this.distanceTo(vis) : 0;
    const delay = impactDelayMs(style, gap);
    playSfx(style.releaseSfx);
    if (vis) this.launchAttack(style, vis, delay);

    const label = vis ? MONSTER_LABELS[vis.kind] : "enemy";

    window.setTimeout(() => {
      const target = this.monsters.get(p.monsterId);
      if (!p.playerHit) {
        this.combatLog.push(`You miss the ${label}.`, "#9a8d76");
        if (target) this.floatOnMonster(target, { kind: "miss", text: "Miss" });
        playSfx("miss");
        return;
      }

      this.combatLog.push(
        `You hit the ${label} for ${p.playerDamage}${p.playerCrit ? " (CRIT)" : ""}.`,
        p.playerCrit ? "#ffd85e" : "#e8dcc0",
      );
      playSfx(p.playerCrit ? "crit" : "hit");

      if (target) {
        const at = target.actor.position;
        // Land the effect at the monster's middle, not a fixed height — a slime
        // is 0.8 units tall and a dragon 3.4, and a constant offset puts the
        // burst inside the ground on one and around the ankles of the other.
        const mid = at.y + MONSTER_MODELS[target.kind].height * 0.55;
        const size = Math.max(1.6, MONSTER_MODELS[target.kind].height * 1.3);

        target.actor.flash(p.playerCrit ? 0xffd85e : 0xffffff, p.playerCrit ? 190 : 120);
        this.floatOnMonster(
          target,
          { kind: "hit", text: `${p.playerDamage}`, crit: p.playerCrit },
          p.playerDamage,
        );
        // The mark the weapon leaves: an arc for blades, a shockwave for a
        // mace, an arcane bloom for a staff. Weight scales with the family, so
        // an axe lands visibly heavier than a dagger.
        this.effects.play(style.impact, at.x, mid, at.z, {
          scale: size * style.impactScale * (p.playerCrit ? 1.5 : 1.15),
          tint: p.playerCrit ? 0xffd85e : style.tint,
          durationMs: 420,
          spin: style.delivery === "melee" ? 0.05 : 0,
        });
        this.effects.play("impact", at.x, mid, at.z, {
          scale: size * style.impactScale * (p.playerCrit ? 1.25 : 0.95),
          tint: p.playerCrit ? 0xffc94a : 0xfff0c8,
          durationMs: 360,
        });
      }
      if (p.playerCrit) this.effects.shake(0.09, 150);

      if (p.monsterDefeated) {
        this.combatLog.push(`You defeated the ${label}.`, "#7ed957");
        playSfx("die");
        if (target) {
          const at = target.actor.position;
          this.effects.play("impact", at.x, at.y + 0.7, at.z, { scale: 2.6, tint: 0xffb066, durationMs: 520 });
        }
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
      this.projectiles.beam(from, to, style.tint);
    } else {
      // A bolt is a travelling fx quad — the effects system already carries
      // the schools and the travel, so this needs no new art.
      this.effects.play(style.impact, to.x, to.y, to.z, {
        scale: 1.5,
        tint: style.tint,
        from,
        durationMs: flightMs,
      });
    }
  }

  private onMonsterAttack(p: { monsterId: string; hit: boolean; crit: boolean; damage: number }): void {
    const vis = this.monsters.get(p.monsterId);
    this.lastCombatAt = performance.now();
    if (vis) {
      vis.actor.play("attack");
      if (this.localActor) vis.actor.faceToward(this.localActor.position.x, this.localActor.position.z);
    }
    const label = vis ? MONSTER_LABELS[vis.kind] : "enemy";

    window.setTimeout(() => {
      if (!p.hit) {
        this.combatLog.push(`The ${label} misses you.`, "#9a8d76");
        playSfx("miss", 0.7);
        return;
      }
      this.combatLog.push(
        `The ${label} ${p.crit ? "CRITs" : "hits"} you for ${p.damage}.`,
        p.crit ? "#ff8f5e" : "#ff9d9d",
      );
      playSfx("hurt");
      if (this.localActor) {
        const at = this.localActor.position;
        this.localActor.flash(0xff6b6b, 130);
        this.floatOnPlayer(this.localActor, { kind: "taken", text: `-${p.damage}`, crit: p.crit }, p.damage);
        this.effects.play("impact", at.x, at.y + 1.0, at.z, {
          scale: p.crit ? 1.9 : 1.35,
          tint: 0xff7a5a,
          durationMs: 320,
        });
      }
      if (p.crit) this.effects.shake(0.11, 170);
    }, IMPACT_DELAY_MS);
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

    switch (fx.shape) {
      case "nova":
        this.skillFx.nova(at.x, 0, at.z, radius, fx.color);
        break;
      case "ground":
        this.skillFx.ground(centre.x, 0, centre.z, radius, fx.color);
        break;
      case "cone": {
        const facing = self.facingVector();
        this.skillFx.cone(at.x, 0, at.z, Math.atan2(facing.x, facing.z), reach, fx.color);
        break;
      }
      case "pillar":
        this.skillFx.pillar(at.x, 0, at.z, fx.color);
        break;
      case "rain":
        this.skillFx.rain(centre.x, 0, centre.z, radius, fx.color);
        break;
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
    hits: { monsterId: string; hit: boolean; damage: number; crit: boolean }[];
    healed?: number;
    buffMs?: number;
    slowMs?: number;
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
      playSfx("swing");
      if (self) {
        this.effects.play(school, self.position.x, self.position.y + 0.8, self.position.z, {
          scale: 2.2, tint: 0xcfe8ff,
        });
      }
      return;
    }

    self?.play("attack");
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

    for (const hit of p.hits) {
      const vis = this.monsters.get(hit.monsterId);
      if (!vis) continue;
      const at = vis.actor.position;

      if (skill.rangePx > 0 && self) {
        this.effects.play(school, at.x, at.y + 0.9, at.z, {
          scale: 1.9,
          from: new THREE.Vector3(self.position.x, self.position.y + 1.1, self.position.z),
          durationMs: 380,
        });
      } else if (skill.radiusPx === 0) {
        this.effects.play(school, at.x, at.y + 0.9, at.z, { scale: 1.9 });
      }

      if (!hit.hit) {
        this.floatOnMonster(vis, { kind: "miss", text: "Miss" });
        continue;
      }
      vis.actor.flash(hit.crit ? 0xffd85e : 0x9ad4ff, 150);
      this.floatOnMonster(vis, { kind: "skill", text: `${hit.damage}`, crit: hit.crit }, hit.damage);
      playSfx(hit.crit ? "crit" : "hit", 0.8);
    }

    if (p.slowMs) this.combatLog.push("Chilled.", "#8fd4ff");
  }

  /**
   * Mobility displacement. `away` sends you directly away from the nearest
   * enemy (Disengage); everything else surges the way you are moving, falling
   * back to your facing when standing still.
   */
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
    this.localActor?.snapTo(toWorldX(this.playerX), 0, toWorldZ(this.playerY));
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
    const wallet = { wood: this.wood, ore: this.ore, herb: this.herb, essence: this.essence };
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
    this.characterPanel.setSources([
      { name: "Talents", bonus: talents },
      { name: "Affixes", bonus: affixTotals },
      { name: "Matched gear", bonus: setPassives(gear) },
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
  private passives(): ReturnType<typeof talentPassives> {
    return talentPassives(this.appearance.weaponType, this.weaponProgress?.ranks ?? {});
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
          this.craftPanel.open(id);
        } else {
          this.hud.toast("Too far from the workbench.", "#c98d5e");
        }
        return;
      }
    }
    this.setTarget(null);
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
    for (const c of candidates) {
      const hits = this.raycaster.intersectObject(c.vis.actor.root, true);
      if (hits.length > 0 && hits[0].distance < hitDepth) {
        hitDepth = hits[0].distance;
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

  private loop = (): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, this.clock.getDelta());

    this.stepMovement(dt);

    this.localActor?.update(dt);
    for (const a of this.players.values()) a.update(dt);
    for (const v of this.monsters.values()) v.actor.update(dt);

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
    this.hotbar.update(this.mana);
    this.effects.update(this.world.camera);
    this.projectiles.update();
    this.skillFx.update();
    this.drops.update(performance.now());
    // After the actors have moved and before the frame is drawn, so a number
    // never lags the body it came off by a frame.
    this.floaters.update(this.projectForFloat);
    this.updateForges();
    this.updateMinimap();
    // Derived before anything draws, so the ring, the frame and the nameplate
    // all agree within a single frame.
    this.updateTargeting();
    this.hoverId =
      this.pointerX >= 0 ? this.pickMonsterAt(this.pointerX, this.pointerY) : null;
    this.updateIndicators();

    this.fadeOccluders();
    this.drawPlates();
    const hour = this.world.updateDayNight();
    this.hud.setPortrait(classForWeapon(this.appearance.weaponType));
    this.hud.syncLayout();
    this.hud.setClock(hour.name, gameClock(hour.clock * DAY_LENGTH_MS), isDaytime(hour.clock * DAY_LENGTH_MS));
    this.world.render();
    requestAnimationFrame(this.loop);
  };

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

    const cam = this.world.camera.position;
    const head = actor.position.clone();
    head.y += 1.0;
    const dir = head.clone().sub(cam);
    const distance = dir.length();
    if (distance < 0.01) return;
    dir.normalize();

    this.raycaster.set(cam, dir);
    this.raycaster.far = distance;
    const blockers = this.raycaster.intersectObjects(
      [...this.nodes.values(), this.world.decor],
      true,
    );

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
      // Screen-space input maps straight to world axes: +x is east, +y is south
      // in server space, which is +z here.
      actor.faceDirection(dx / len, dy / len);
    }

    this.resolvePlayerCollision();
    actor.setTargetPosition(toWorldX(this.playerX), 0, toWorldZ(this.playerY));
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

    for (const [id, actor] of this.players) {
      if (!actor.loaded) continue;
      const p = actor.position;
      this.hud.plate(id, this.world.project(p.x, p.y + 2.05, p.z), {
        kind: "player",
        name: this.playerNames.get(id) ?? "player",
        icon: `class-${this.playerClasses.get(id) ?? "adventurer"}`,
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
      // Remote players' HP is not on the wire, so the frame shows the name and
      // says what the selection is for, rather than inventing a health bar.
      if (ally) {
        this.targetFrame.show(this.playerNames.get(this.allyTargetId) ?? "Ally", 0, 0, "ally", {
          icon: `class-${this.playerClasses.get(this.allyTargetId) ?? "adventurer"}`,
        });
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
