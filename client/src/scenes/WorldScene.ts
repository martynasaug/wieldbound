import Phaser from "phaser";
import { GameSocket } from "../net/socket";
import { InventoryPanel } from "../ui/InventoryPanel";
import { CharacterPanel } from "../ui/CharacterPanel";
import { CraftPanel } from "../ui/CraftPanel";
import { CombatLog } from "../ui/CombatLog";
import { LeaderboardPanel } from "../ui/LeaderboardPanel";
import { Hotbar } from "../ui/Hotbar";
import { TargetFrame } from "../ui/TargetFrame";
import { SkillPanel } from "../ui/SkillPanel";
import {
  DAILY_BONUS_REWARD,
  INTERACTION_RANGE_PX,
  MONSTER_LABELS,
  NODE_LABELS,
  PLAYER_SPAWN,
  STATION_LABEL,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  battlePowerUpgradeCost,
  critDamageMultiplier,
  doubleAttackChance,
  regenAmountForVitality,
  gatherDurationForLevel,
  gatherUpgradeCost,
  movePxPerSec,
  playerAccuracy,
  playerAttackIntervalMs,
  SKILLS,
  CLASSES,
  unlockedActives,
  maxManaFor,
  attackRangeFor,
  primaryStatValue,
  equippedBySlot,
  gearArmor,
  gearEvasion,
  gearCritChance,
  gearDamageBonus,
  gearMoveBonus,
  weaponDef,
  appearanceClass,
  appearanceFromItems,
  GEAR_STYLES,
  VISIBLE_GEAR_SLOTS,
  WEAPON_TYPES,
  type Appearance,
  type GearStyle,
  type CharacterClass,
  type WeaponType,
  AGGRO_RANGE_PX,
  MONSTER_STATS,
  ENGAGE_RANGE_PX,
  playerCritChance,
  playerMaxHit,
  playerMinHit,
  sellValueFor,
  xpBonusPercent,
  xpToNextLevel,
  type CraftingStationState,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
  type MonsterKind,
  type SkillId,
  type MonsterState,
  type PlayerState,
  type ResourceNodeState,
} from "../../../shared/protocol-types";

const SEND_INTERVAL_MS = 50;
const WORLD_BOUNDS = { width: WORLD_WIDTH, height: WORLD_HEIGHT };
const NODE_COLOR_DEPLETED = 0x3e3e3e;
const MONSTER_COLOR_DEAD = 0x3e3e3e;

// --- Terrain -------------------------------------------------------------
// `grass.png` is baked offline (see PLAN.md): a 16x16-tile mosaic of four
// Kenney grass variants, each randomly flipped, under a gentle wrapping
// brightness field. The field used to be one 16px tile repeated, which read
// as flat and visibly gridded; this pushes the repeat period from 32px on
// screen out to 512px and gives the ground broad light and dark patches.
const GRASS_KEY = "grass";
const GROUND_SCALE = 2;

// --- Props ---------------------------------------------------------------
// `props.png` is every world object that isn't an actor, baked offline into
// one flat 32x32 grid indexed 0..N. Two reasons it isn't indexed straight
// out of the terrain sheet: that sheet is addressed `row * 57 + col`, and
// swapping those two silently yields a valid-but-wrong tile (the crafting
// station shipped as a blinking blue flower exactly this way); and the good
// trees there are two tiles tall, which one frame index cannot express.
// Cells are centred and bottom-aligned like actors.png, so `setOrigin(0.5, 1)`
// means "base sits on the world position" for props and actors alike.
const PROPS_KEY = "props";
const PROP = {
  treeGreen: 0,
  treeAutumn: 1,
  treePine: 2,
  bushTeal: 3,
  bushAmber: 4,
  rockA: 5,
  rockB: 6,
  stationA: 7,
  stationB: 8,
  tuftA: 9,
  tuftB: 10,
  flowerRed: 11,
  flowerWhite: 12,
  flowerBlue: 13,
  pebbles: 14,
} as const;

// --- Ground clutter ------------------------------------------------------
// Weighted by repetition: mostly grass tufts, which read as texture, with
// flowers as occasional colour and pebbles as rare accents. The previous
// pass scattered dense 5-blossom flower tiles uniformly and the field came
// out looking cluttered rather than detailed.
const SCATTER_WEIGHTED = [
  PROP.tuftA, PROP.tuftA, PROP.tuftA, PROP.tuftA,
  PROP.tuftB, PROP.tuftB, PROP.tuftB, PROP.tuftB,
  PROP.flowerRed, PROP.flowerWhite, PROP.flowerBlue,
  PROP.pebbles,
];
const SCATTER_COUNT = 900;
const SCATTER_SCALE = 2;

// --- Resource nodes ------------------------------------------------------
// Several art variants per node kind, picked deterministically from the
// node id, so a stand of trees looks like a wood rather than one tree
// stamped twenty times.
const NODE_VARIANTS: Record<ResourceNodeState["kind"], number[]> = {
  tree: [PROP.treeGreen, PROP.treeAutumn, PROP.treePine],
  bush: [PROP.bushTeal, PROP.bushAmber],
  rock: [PROP.rockA, PROP.rockB],
};
// Height in source pixels of the art inside each 32px cell, for label placement.
const NODE_ART_H: Record<ResourceNodeState["kind"], number> = { tree: 32, bush: 16, rock: 12 };
const NODE_SCALE: Record<ResourceNodeState["kind"], number> = { tree: 3, bush: 3, rock: 3 };

// --- Crafting station ----------------------------------------------------
// A lit forge beside an anvil. The forge's two lit frames alone make a
// convincing fire loop.
const STATION_FRAMES = [PROP.stationA, PROP.stationB];
const STATION_ART_H = 16;
const STATION_SCALE = 3;

// --- Actors --------------------------------------------------------------
// `actors.png` is built offline (see PLAN.md) from 0x72's "16x16
// DungeonTileset II" (CC0) plus two hand-drawn creatures, normalised into
// one uniform 32x36 grid: 8 columns per actor — idle f0-3, then run f0-3 —
// and one row per actor. The source art has wildly irregular frame sizes
// (16x16 through 32x36) that Phaser's fixed-cell spritesheet loader cannot
// express, so normalising up front is what makes `row * ACTOR_COLS + col`
// work at all. Every cell is centred horizontally and bottom-aligned, so
// `setOrigin(0.5, 1)` puts an actor's feet exactly on its world position
// and ground shadows line up without per-actor nudging.
const ACTORS_KEY = "actors";
const ACTOR_COLS = 8;
const ACTOR_SCALE = 3;
// `actors.png` is monsters only now. Players used to live here too — a row
// per class per armour tier, with the garment repainted at build time — but
// that scheme cannot survive class being derived from a weapon you swap
// mid-fight, and it could never show a helm and boots independently of the
// chest. Players are drawn by the paperdoll below instead.
type ActorName = "slime" | "goblin" | "wolf" | "troll";
const ACTOR_ROW: Record<ActorName, number> = { slime: 0, goblin: 1, wolf: 2, troll: 3 };
// Height in source pixels of the art actually drawn inside each 36px cell —
// the only way to park a label just above a sprite's head, since the cell
// itself is the same height for a 16px slime and a 36px troll.
const ACTOR_ART_H: Record<ActorName, number> = { slime: 16, goblin: 23, wolf: 18, troll: 36 };
const MONSTER_ACTOR: Record<MonsterKind, ActorName> = {
  slime: "slime",
  goblin: "goblin",
  wolf: "wolf",
  troll: "troll",
};

// --- Paperdoll -----------------------------------------------------------
// A player is a naked body sprite with one layer sprite per equipped visible
// slot stacked on top. `body.png` is a single 8-frame row; `gear.png` is one
// 8-frame row per style, in `GEAR_STYLES` order. Both use the same 32x36
// bottom-aligned cell grid as `actors.png`, and every layer is drawn from the
// same parametric skeleton as the body at build time — which is what makes
// the overlays track the per-frame bob exactly instead of visibly detaching.
//
// Layers are separate sprites rather than baked-in variants because the whole
// point of this phase is that four slots vary independently: baking would
// need styles x rarities x slots rows, and could never tint armour without
// staining skin.
const BODY_KEY = "body";
const GEAR_KEY = "gear";
const PLAYER_ART_H = 28;
function gearRow(style: GearStyle): number {
  return GEAR_STYLES.indexOf(style);
}
// Rarity only modulates the style's own colours — a light multiply, not a
// recolour. The style is what says "plate vs robe"; rarity is a hint on top,
// so common deliberately gets no tint at all.
const GEAR_TINT: Record<ItemRarity, number> = { common: 0xffffff, rare: 0xc2dcff, epic: 0xe6c2ff };
// Cape hangs behind the body; everything else is worn over it. The offsets
// are fractions of a depth unit so a whole paperdoll still sorts against the
// world as one object at its owner's Y.
const LAYER_DEPTH_OFFSET: Partial<Record<ItemSlot, number>> = {
  cape: -0.25,
  boots: 0.05,
  armor: 0.1,
  helm: 0.15,
};

interface Paperdoll {
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Sprite;
  // One sprite per visible slot, created lazily and destroyed when the slot
  // empties — an absent entry is exactly what "not wearing anything there"
  // means, mirroring how the wire format omits empty slots.
  layers: Partial<Record<ItemSlot, Phaser.GameObjects.Sprite>>;
  weapon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

// --- Weapons -------------------------------------------------------------
// `weapons.png`, bottom-aligned cells: with setOrigin(0.5, 1) the pivot
// lands on the grip, so rotating the sprite swings the blade around the
// hand. All the source art is drawn point-up / hilt-down, which is what
// makes a single rotation tween read as a real swing.
const WEAPONS_KEY = "weapons";
const WEAPON_CELL_H = 40;
// Seven families x three tiers, laid out contiguously by `build_weapons.ps1`
// so a family is three consecutive frames rather than a scattered lookup.
// `fist` has no art at all: bare hands are an empty hand, not a sprite.
const WEAPON_FRAME: Record<WeaponType, Record<ItemRarity, number> | null> = (() => {
  const frames = {} as Record<WeaponType, Record<ItemRarity, number> | null>;
  frames.fist = null;
  WEAPON_TYPES.forEach((type, i) => {
    frames[type] = { common: i * 3, rare: i * 3 + 1, epic: i * 3 + 2 };
  });
  return frames;
})();
const GOBLIN_AXE_FRAME = WEAPON_TYPES.length * 3;
// Where the hand actually closes on each family, in source pixels up from the
// bottom of the 40px cell. A sword is held at the pommel, a bow at its middle
// and a staff about a third up — using one pivot for all of them is what made
// bows and staves float above the wielder's head. Read off the art in
// `build_weapons.ps1`, which draws every family point-up from the cell floor.
const WEAPON_GRIP_FROM_BOTTOM: Record<WeaponType, number> = {
  fist: 0,
  sword: 3,
  axe: 4,
  mace: 4,
  dagger: 2,
  // The bow is the one family not drawn from the cell floor: it is centred
  // in the cell, so its grip is ~13 up rather than the ~20 a naive "half its
  // own length" gives — which planted the bottom limb below the feet.
  bow: 13,
  staff: 8,
  wand: 3,
};
function weaponOriginY(type: WeaponType): number {
  return (WEAPON_CELL_H - WEAPON_GRIP_FROM_BOTTOM[type]) / WEAPON_CELL_H;
}
// The frame a wielded weapon should show, or undefined for an empty hand.
function weaponFrame(type: WeaponType | undefined, rarity: ItemRarity | null | undefined): number | undefined {
  if (!type || !rarity) return undefined;
  return WEAPON_FRAME[type]?.[rarity];
}
// The troll deliberately has none: the ogre art already holds a club, so
// handing it a second weapon just produced two overlapping ones.
const MONSTER_WEAPON: Partial<Record<MonsterKind, number>> = { goblin: GOBLIN_AXE_FRAME };
// Hand position per actor, in source pixels relative to that actor's feet,
// read straight off the sprites' gauntlet pixels. Mirrored with facing.
const GRIP: Record<ActorName, { x: number; y: number }> = {
  goblin: { x: 4, y: -8 },
  troll: { x: 10, y: -14 },
  slime: { x: 0, y: 0 },
  wolf: { x: 0, y: 0 },
};
// Every player shares one body, so there is a single player hand position —
// which is the point of the paperdoll: gear layers change the look without
// moving where the hand is.
const PLAYER_GRIP = { x: 4, y: -11 };
const WEAPON_REST_DEG = -12;
const WEAPON_WINDUP_DEG = -60;
const WEAPON_SWING_DEG = 100;

// --- Effects -------------------------------------------------------------
// `fx.png` is a library rather than just the slash today's melee needs:
// 8 effects x 4 frames on a uniform 32x32 grid, covering the elemental and
// support shapes that spells and skills will want. Adding a spell later
// means picking a row and a tint, not producing new art.
const FX_KEY = "fx";
const FX_COLS = 6;
const FX_ROW = {
  slash: 0,
  impact: 1,
  bolt: 2,
  heal: 3,
  fire: 4,
  frost: 5,
  lightning: 6,
  buff: 7,
} as const;
type EffectName = keyof typeof FX_ROW;

// --- Sound ---------------------------------------------------------------
// Synthesised offline (see PLAN.md). `cast`, `heal`, `bolt`-adjacent cues
// exist ahead of the spell system that will use them.
const SFX = [
  "swing",
  "hit",
  "crit",
  "miss",
  "hurt",
  "die",
  "gather",
  "levelup",
  "cast",
  "heal",
] as const;
type SfxName = (typeof SFX)[number];
// Auto-battle fires several results a second; without a floor between
// repeats of the same cue the mix turns into a buzz.
const SFX_MIN_GAP_MS = 60;

// --- Draw order ----------------------------------------------------------
// Now that actors stand feet-on-position instead of being centred on it,
// draw order has to follow world Y: something further down the screen is
// nearer the camera and must occlude what is behind it. Without this the
// order is creation order, which would leave the player — created before
// any snapshot arrives — permanently drawn behind every tree and monster.
// Everything else is pinned outside the Y range so it can never interleave.
const DEPTH_GROUND = -20000;
const DEPTH_SCATTER = -19000;
const DEPTH_FX = 90000;
const DEPTH_HUD = 100000;

const BAR_WIDTH = 32;
const HUD_BAR_WIDTH = 220;
const RARITY_HEX: Record<ItemRarity, string> = { common: "#9e9e9e", rare: "#42a5f5", epic: "#ab47bc" };

// Stable index from an entity id, so a node keeps the same art variant
// across reloads and across every client — the ids come from the server, so
// two players looking at the same tree see the same tree.
function hashToIndex(id: string, buckets: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % buckets;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

interface RemotePlayerVisual {
  doll: Paperdoll;
  // Remote players are only ever seen through position snapshots, so
  // "are they walking?" has to be inferred by comparing against the last
  // snapshot rather than read from an input state like the local player's.
  lastX: number;
  lastY: number;
}

interface MonsterVisual {
  sprite: Phaser.GameObjects.Sprite;
  // The danger circle drawn while a telegraphed attack charges. Only exists
  // for kinds that have one, and only while it is actually winding up.
  telegraph?: Phaser.GameObjects.Ellipse;
  windingUp: boolean;
  // Monsters chase, so their shadow has to travel with them rather than
  // being fire-and-forget scenery like a tree's.
  shadow: Phaser.GameObjects.Ellipse;
  // Only the armed kinds have one; a slime has no hand to put it in.
  weapon?: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  // Mirrored from the snapshot so the target frame can read them without
  // re-scanning the last payload.
  hp: number;
  maxHp: number;
  slowed: boolean;
  status: string;
  kind: MonsterKind;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
}

// Nodes are Images rather than Sprites: they have no frame animation, and
// their idle motion is a sway tween on the transform instead.
interface NodeVisual {
  shape: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  status: string;
  kind: ResourceNodeState["kind"];
}

interface StationVisual {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
}

// Mirrors the server's standing intent: gathering/battling auto-repeats through
// respawn waits until explicitly stopped, switched, or walked away from.
interface ActiveIntent {
  kind: "gather" | "battle";
  targetId: string;
}

export class WorldScene extends Phaser.Scene {
  private characterName = "Adventurer";
  private socket!: GameSocket;
  private localId: string | null = null;
  // The player's authoritative position. This used to live directly on
  // `localSprite.x/y`, which made the render object double as game state —
  // fine until attack animations needed to shove the sprite around, at
  // which point a purely visual lunge would have corrupted the position
  // sent to the server. Sprite, shadow, label and weapon are now all views
  // onto these two numbers plus `lunge`.
  private playerX = PLAYER_SPAWN.x;
  private playerY = PLAYER_SPAWN.y;
  private lunge = { x: 0, y: 0 };
  // The local player is a Paperdoll like everyone else, so there is one
  // drawing path rather than a self-case and an others-case that drift.
  private localDoll!: Paperdoll;
  // What this character currently looks like, derived from its own equipped
  // items. Also the only thing that decides its class.
  private appearance: Appearance = { layers: {} };
  private mana = 0;
  private maxMana = 0;
  private remotePlayers = new Map<string, RemotePlayerVisual>();
  private nodes = new Map<string, NodeVisual>();
  private monsters = new Map<string, MonsterVisual>();
  private stations = new Map<string, StationVisual>();
  private craftPanel!: CraftPanel;
  private combatLog!: CombatLog;
  private hpBarBg!: Phaser.GameObjects.Rectangle;
  private hpBarFill!: Phaser.GameObjects.Rectangle;
  private hpBarText!: Phaser.GameObjects.Text;
  private xpBarBg!: Phaser.GameObjects.Rectangle;
  private xpBarFill!: Phaser.GameObjects.Rectangle;
  private xpBarText!: Phaser.GameObjects.Text;
  private manaBarBg!: Phaser.GameObjects.Rectangle;
  private manaBarFill!: Phaser.GameObjects.Rectangle;
  private manaBarText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private inventoryPanel!: InventoryPanel;
  private characterPanel!: CharacterPanel;
  private leaderboardPanel!: LeaderboardPanel;
  private dockCharacterBtn = document.getElementById("dock-character")!;
  private dockInventoryBtn = document.getElementById("dock-inventory")!;
  private dockLeaderboardBtn = document.getElementById("dock-leaderboard")!;
  private hp = 1;
  private maxHp = 1;
  private wood = 0;
  private ore = 0;
  private herb = 0;
  private gatherLevel = 0;
  private battlePowerLevel = 0;
  private xp = 0;
  private level = 1;
  private weaponRarity: ItemRarity | null = null;
  private armorRarity: ItemRarity | null = null;
  private bootsRarity: ItemRarity | null = null;
  private strength = 0;
  private agility = 0;
  private vitality = 0;
  private intelligence = 0;
  private statPoints = 0;
  private items: ItemInstance[] = [];
  private upgradeButtonBg!: Phaser.GameObjects.Rectangle;
  private upgradeButtonText!: Phaser.GameObjects.Text;
  private battleUpgradeButtonBg!: Phaser.GameObjects.Rectangle;
  private battleUpgradeButtonText!: Phaser.GameObjects.Text;
  private gatherBarBg!: Phaser.GameObjects.Rectangle;
  private gatherBarFill!: Phaser.GameObjects.Rectangle;
  private activeIntent: ActiveIntent | null = null;
  // 0 means "waiting for target to become ready" — no cycle in flight yet.
  private cycleStartedAt = 0;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyI!: Phaser.Input.Keyboard.Key;
  private keyC!: Phaser.Input.Keyboard.Key;
  private keyL!: Phaser.Input.Keyboard.Key;
  private lastSentAt = 0;
  private lastSentX = -1;
  private lastSentY = -1;
  private lastSfxAt = new Map<string, number>();
  private soundOn = true;
  private keyM!: Phaser.Input.Keyboard.Key;
  private keyTab!: Phaser.Input.Keyboard.Key;
  private hotbar!: Hotbar;
  private targetFrame!: TargetFrame;
  private skillPanel!: SkillPanel;
  private keyK!: Phaser.Input.Keyboard.Key;
  private dockSkillsBtn = document.getElementById("dock-skills")!;
  // The enemy the player has selected. Auto-attack prefers it server-side;
  // here it drives the target ring and the target frame.
  private targetId: string | null = null;
  // The ally selected for support skills. Mutually exclusive with an enemy
  // target: you have one selection, and what it is decides what it means.
  private allyId: string | null = null;
  private targetRing!: Phaser.GameObjects.Ellipse;
  // Last non-zero movement input, so Dash knows which way you were heading.
  private dashHintX = 0;
  private dashHintY = 0;
  // Faint ring showing how close you must be to swing. Ranges were entirely
  // invisible before, so you learned them only by failing.
  private meleeRangeRing!: Phaser.GameObjects.Ellipse;
  // Timestamp of the last combat event either way, used purely to show an
  // "in combat" state — cheaper and more responsive than a protocol flag.
  private lastCombatAt = 0;
  private inCombatText!: Phaser.GameObjects.Text;

  constructor() {
    super("WorldScene");
  }

  // No class is chosen here any more — a character is whatever its equipped
  // weapon makes it, and the server sends that back in WELCOME.
  init(data: { characterName?: string }): void {
    this.characterName = data.characterName?.trim() || "Adventurer";
  }

  preload(): void {
    this.load.image(GRASS_KEY, "/assets/grass.png");
    // Composed atlases: uniform cells, no gaps or margins.
    this.load.spritesheet(ACTORS_KEY, "/assets/actors.png", { frameWidth: 32, frameHeight: 36 });
    this.load.spritesheet(BODY_KEY, "/assets/body.png", { frameWidth: 32, frameHeight: 36 });
    this.load.spritesheet(GEAR_KEY, "/assets/gear.png", { frameWidth: 32, frameHeight: 36 });
    this.load.spritesheet(PROPS_KEY, "/assets/props.png", { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet(WEAPONS_KEY, "/assets/weapons.png", { frameWidth: 16, frameHeight: WEAPON_CELL_H });
    this.load.spritesheet(FX_KEY, "/assets/fx.png", { frameWidth: 48, frameHeight: 48 });
    for (const name of SFX) this.load.audio(name, `/assets/sfx/${name}.wav`);
  }

  // One-shot world effect. The whole effect library is addressed through
  // this, so a future spell is "playEffect('frost', x, y, {...})" rather
  // than new bespoke rendering code.
  private playEffect(
    name: EffectName,
    x: number,
    y: number,
    opts: { scale?: number; tint?: number; angle?: number; depth?: number } = {},
  ): void {
    const sprite = this.add
      .sprite(x, y, FX_KEY, FX_ROW[name] * FX_COLS)
      .setScale(opts.scale ?? 2)
      .setDepth(opts.depth ?? DEPTH_FX)
      .setAngle(opts.angle ?? 0);
    if (opts.tint !== undefined) sprite.setTint(opts.tint);
    sprite.play(`fx-${name}`);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  }

  // Plays a cue unless the same one fired a moment ago. Phaser will happily
  // stack dozens of overlapping copies otherwise, which during auto-battle
  // is just noise.
  private playSfx(name: SfxName, volume = 0.5): void {
    const now = this.time.now;
    if (now - (this.lastSfxAt.get(name) ?? -Infinity) < SFX_MIN_GAP_MS) return;
    this.lastSfxAt.set(name, now);
    if (!this.soundOn) return;
    this.sound.play(name, { volume });
  }

  // A soft dark ellipse under a ground-standing sprite — grounds it visually
  // and adds contrast against the busy grass, which otherwise reads as
  // "floating and hard to spot" for anything close to it in tone.
  private addGroundShadow(x: number, y: number, width: number, height: number): Phaser.GameObjects.Ellipse {
    // Sits a hair behind its own actor in the Y-sort so it never covers the
    // feet it belongs to, while still passing under anything nearer.
    return this.add.ellipse(x, y, width, height, 0x000000, 0.32).setDepth(y - 0.5);
  }

  // Actors are drawn feet-on-position (origin 0.5,1), so anything that
  // belongs above an actor's head has to clear its own art height rather
  // than a shared constant — a troll is more than twice a slime's height.
  private actorLabelY(groundY: number, actor: ActorName): number {
    return groundY - ACTOR_ART_H[actor] * ACTOR_SCALE - 8;
  }

  // Players are all one height, gear included: a helm sits within the same
  // 28px the bare head already occupied, so equipping something never shifts
  // the name plate.
  private playerLabelY(groundY: number): number {
    return groundY - PLAYER_ART_H * ACTOR_SCALE - 8;
  }

  // Switches an actor between its idle and run loop. Phaser restarts an
  // animation if you `play` the one already running, which would freeze the
  // sprite on frame 0 every tick, so the current key is checked first.
  private playActorAnim(sprite: Phaser.GameObjects.Sprite, actor: ActorName, moving: boolean): void {
    const key = `${actor}-${moving ? "run" : "idle"}`;
    if (sprite.anims.currentAnim?.key !== key) sprite.play(key);
  }

  private moveLocalTo(x: number, y: number): void {
    this.playerX = x;
    this.playerY = y;
    this.syncLocalVisuals();
  }

  // Every view of the player is repositioned from one place, so they cannot
  // drift apart. Runs each frame, which is what lets the attack lunge be a
  // pure offset that never touches the authoritative position.
  private syncLocalVisuals(): void {
    const x = this.playerX + this.lunge.x;
    const y = this.playerY + this.lunge.y;
    // Depth stays keyed to the true position: a lunge should not let the
    // player pop in front of something it hasn't actually walked past.
    this.positionPaperdoll(this.localDoll, x, y, this.playerX, this.playerY, this.playerY);
  }

  // Hidden until something is actually equipped — an empty hand is the
  // correct look for a brand new character, and with fists as a real weapon
  // family it is also a correct *class*.
  private createWeaponSprite(): Phaser.GameObjects.Image {
    return this.add
      .image(0, 0, WEAPONS_KEY, 0)
      .setOrigin(0.5, 1)
      .setScale(ACTOR_SCALE)
      .setAngle(WEAPON_REST_DEG)
      .setVisible(false);
  }

  // --- Paperdoll ---------------------------------------------------------

  private createPaperdoll(x: number, y: number, name: string): Paperdoll {
    const shadow = this.add.ellipse(x, y, 22, 8, 0x000000, 0.32);
    const body = this.add.sprite(x, y, BODY_KEY).setOrigin(0.5, 1).setScale(ACTOR_SCALE);
    body.play("player-idle");
    const label = this.add
      .text(x, this.playerLabelY(y), name, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#e8e8e8",
        stroke: "#1b1b1b",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    return { shadow, body, layers: {}, weapon: this.createWeaponSprite(), label };
  }

  // Rebuilds the layer sprites to match an appearance. Only the slots that
  // actually changed are touched, because this runs on every snapshot for
  // every visible player — tearing down and recreating four sprites 20 times
  // a second would churn the display list for nothing.
  private applyAppearance(doll: Paperdoll, appearance: Appearance): void {
    for (const slot of VISIBLE_GEAR_SLOTS) {
      const layer = appearance.layers[slot];
      const existing = doll.layers[slot];
      if (!layer) {
        existing?.destroy();
        delete doll.layers[slot];
        continue;
      }
      const sprite =
        existing ?? this.add.sprite(doll.body.x, doll.body.y, GEAR_KEY).setOrigin(0.5, 1).setScale(ACTOR_SCALE);
      doll.layers[slot] = sprite;
      // Stashed on the sprite so the per-frame sync below knows which row to
      // read without a second map to keep in step with this one.
      sprite.setData("row", gearRow(layer.style));
      sprite.setTint(GEAR_TINT[layer.rarity]);
    }
    this.equipWeaponSprite(doll.weapon, weaponFrame(appearance.weaponType, appearance.weaponRarity), appearance.weaponType);
  }

  // The body owns the animation; layers are slaved to whatever frame it is
  // currently showing. Giving each layer its own animation would let them
  // drift by a frame under load, which on a 4-frame walk cycle is a visibly
  // detached shirt. Reading the body's frame instead makes them exact by
  // construction — the same argument that made the art parametric.
  private syncPaperdollFrames(doll: Paperdoll): void {
    const col = doll.body.frame.name === undefined ? 0 : Number(doll.body.frame.name) % ACTOR_COLS;
    for (const slot of VISIBLE_GEAR_SLOTS) {
      const sprite = doll.layers[slot];
      if (!sprite) continue;
      sprite.setFrame((sprite.getData("row") as number) * ACTOR_COLS + col);
      sprite.setFlipX(doll.body.flipX);
    }
  }

  // Positions every piece of a paperdoll. `x/y` may include an attack lunge;
  // `groundX/groundY` never do, so the shadow stays planted and the label
  // does not jitter when its owner swings.
  private positionPaperdoll(
    doll: Paperdoll,
    x: number,
    y: number,
    groundX: number,
    groundY: number,
    depth: number,
  ): void {
    doll.body.setPosition(x, y).setDepth(depth);
    doll.shadow.setPosition(groundX, groundY).setDepth(depth - 0.5);
    doll.label.setPosition(groundX, this.playerLabelY(groundY)).setDepth(depth + 0.5);
    this.syncPaperdollFrames(doll);
    for (const slot of VISIBLE_GEAR_SLOTS) {
      doll.layers[slot]?.setPosition(x, y).setDepth(depth + (LAYER_DEPTH_OFFSET[slot] ?? 0));
    }
    this.positionPlayerWeapon(doll, x, y, depth);
  }

  private destroyPaperdoll(doll: Paperdoll): void {
    doll.shadow.destroy();
    doll.body.destroy();
    doll.weapon.destroy();
    doll.label.destroy();
    for (const sprite of Object.values(doll.layers)) sprite?.destroy();
  }

  private playPlayerAnim(doll: Paperdoll, moving: boolean): void {
    const key = moving ? "player-run" : "player-idle";
    if (doll.body.anims.currentAnim?.key !== key) doll.body.play(key);
  }

  private refreshLocalAppearance(): void {
    this.appearance = appearanceFromItems(this.items);
    this.applyAppearance(this.localDoll, this.appearance);
    this.craftPanel.setEquippedWeapon(this.appearance.weaponType);
    this.refreshClassUi();
  }

  // Class is not stored anywhere on the client — it is read back out of the
  // equipped weapon every time it is needed, so a swap can never leave the
  // hotbar showing one class's skills while the body fights as another.
  private get characterClass(): CharacterClass {
    return appearanceClass(this.appearance);
  }

  // Everything that keys off class, refreshed together. Called on every
  // equip, because in this system equipping a weapon IS changing class.
  private refreshClassUi(): void {
    this.hotbar.setCharacter(this.characterClass, this.level);
    this.skillPanel.setCharacter(this.characterClass, this.level);
    this.meleeRangeRing.setSize(
      attackRangeFor(this.appearance.weaponType) * 2,
      attackRangeFor(this.appearance.weaponType) * 2,
    );
  }

  // The origin moves with the weapon family, because a bow is gripped at
  // its middle and a staff a third of the way up — using the sword's
  // pommel pivot for all three made bows and staffs float over the head.
  private equipWeaponSprite(
    weapon: Phaser.GameObjects.Image,
    frame: number | undefined,
    type: WeaponType = "fist",
  ): void {
    if (frame === undefined) {
      weapon.setVisible(false);
      return;
    }
    weapon.setFrame(frame).setOrigin(0.5, weaponOriginY(type)).setVisible(true);
  }

  // Wind up against the swing direction, then sweep through. `killTweensOf`
  // matters because auto-battle can land the next swing before the previous
  // one has finished, which would otherwise leave the blade stuck mid-arc.
  private swingWeapon(weapon: Phaser.GameObjects.Image, facingLeft: boolean, crit: boolean): void {
    if (!weapon.visible) return;
    const dir = facingLeft ? -1 : 1;
    this.tweens.killTweensOf(weapon);
    weapon.setAngle(WEAPON_WINDUP_DEG * dir);
    this.tweens.add({
      targets: weapon,
      angle: WEAPON_SWING_DEG * dir * (crit ? 1.15 : 1),
      duration: crit ? 130 : 105,
      ease: "Quad.easeIn",
      yoyo: true,
      hold: 25,
      onComplete: () => weapon.setAngle(WEAPON_REST_DEG * dir),
    });
  }

  // Parks a weapon in its wielder's hand. The grip anchor is per-actor and
  // mirrors with facing; the weapon's own origin is its hilt, so whatever
  // angle a swing tween leaves it at, it still pivots around the hand.
  private positionWeapon(
    weapon: Phaser.GameObjects.Image,
    owner: Phaser.GameObjects.Sprite,
    actor: ActorName,
    x: number,
    y: number,
    depth: number,
  ): void {
    const grip = GRIP[actor];
    const dir = owner.flipX ? -1 : 1;
    weapon.setPosition(x + grip.x * ACTOR_SCALE * dir, y + grip.y * ACTOR_SCALE);
    weapon.setFlipX(owner.flipX);
    weapon.setDepth(depth + 0.25);
    // Re-assert the resting angle whenever no swing is running. Starting a
    // swing kills any in-flight tween, which skips its onComplete and would
    // otherwise strand the weapon at whatever angle it was mid-arc — the
    // cause of goblins standing around holding their axes diagonally. This
    // also mirrors the rest angle when the wielder turns around.
    if (this.tweens.getTweensOf(weapon).length === 0) weapon.setAngle(WEAPON_REST_DEG * dir);
  }

  // Same job for a paperdoll, which has one hand position regardless of what
  // it is wearing.
  private positionPlayerWeapon(doll: Paperdoll, x: number, y: number, depth: number): void {
    const dir = doll.body.flipX ? -1 : 1;
    doll.weapon.setPosition(x + PLAYER_GRIP.x * ACTOR_SCALE * dir, y + PLAYER_GRIP.y * ACTOR_SCALE);
    doll.weapon.setFlipX(doll.body.flipX);
    doll.weapon.setDepth(depth + 0.25);
    if (this.tweens.getTweensOf(doll.weapon).length === 0) doll.weapon.setAngle(WEAPON_REST_DEG * dir);
  }

  // One idle + one run loop per actor row. Every actor shares the same
  // 8-column layout, so this is pure arithmetic rather than a per-actor table.
  private registerActorAnims(): void {
    // The forge fire lives on the props sheet, not the actor atlas, but it
    // is registered here so every animation in the game is declared once in
    // one place.
    this.anims.create({
      key: "station-fire",
      frames: STATION_FRAMES.map((frame) => ({ key: PROPS_KEY, frame })),
      frameRate: 5,
      repeat: -1,
    });

    // Effect library: every row becomes a one-shot `fx-<name>` animation.
    for (const name of Object.keys(FX_ROW) as EffectName[]) {
      const base = FX_ROW[name] * FX_COLS;
      this.anims.create({
        key: `fx-${name}`,
        frames: this.anims.generateFrameNumbers(FX_KEY, { start: base, end: base + FX_COLS - 1 }),
        frameRate: 22,
        repeat: 0,
      });
    }

    for (const name of Object.keys(ACTOR_ROW) as ActorName[]) {
      const base = ACTOR_ROW[name] * ACTOR_COLS;
      this.anims.create({
        key: `${name}-idle`,
        frames: this.anims.generateFrameNumbers(ACTORS_KEY, { start: base, end: base + 3 }),
        frameRate: 6,
        repeat: -1,
      });
      this.anims.create({
        key: `${name}-run`,
        frames: this.anims.generateFrameNumbers(ACTORS_KEY, { start: base + 4, end: base + 7 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // The player body is its own single-row sheet. Gear layers deliberately
    // get no animations of their own — they are driven off whichever frame
    // the body is on (see syncPaperdollFrames).
    this.anims.create({
      key: "player-idle",
      frames: this.anims.generateFrameNumbers(BODY_KEY, { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: "player-run",
      frames: this.anims.generateFrameNumbers(BODY_KEY, { start: 4, end: 7 }),
      frameRate: 10,
      repeat: -1,
    });
  }

  // Sprinkles tufts, flowers and pebbles across the field so the ground
  // isn't one flat wash. These props are transparent, so unlike the earlier
  // full-bleed tiles they can sit at any pixel position rather than being
  // snapped to the grass lattice — which is what stops the clutter from
  // lining up into a visible grid. Drawn from a fixed seed so the world
  // looks the same on every reload instead of reshuffling at each login.
  private scatterGroundDecor(): void {
    let seed = 0x5eed1d1e;
    const rand = (): number => {
      // xorshift32 — deterministic, and avoids pulling in a PRNG dependency
      // just to place decorations.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0xffffffff;
    };

    for (let i = 0; i < SCATTER_COUNT; i++) {
      const frame = SCATTER_WEIGHTED[Math.floor(rand() * SCATTER_WEIGHTED.length)];
      const sprite = this.add
        .image(rand() * WORLD_WIDTH, rand() * WORLD_HEIGHT, PROPS_KEY, frame)
        .setScale(SCATTER_SCALE)
        .setDepth(DEPTH_SCATTER);
      // Mirroring half of them doubles the apparent variety for free.
      if (rand() < 0.5) sprite.setFlipX(true);
    }
  }

  create(): void {
    this.add
      .tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, GRASS_KEY)
      .setTileScale(GROUND_SCALE, GROUND_SCALE)
      .setDepth(DEPTH_GROUND);
    this.scatterGroundDecor();
    this.registerActorAnims();
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keyW = keyboard.addKey("W");
    this.keyA = keyboard.addKey("A");
    this.keyS = keyboard.addKey("S");
    this.keyD = keyboard.addKey("D");
    this.keyI = keyboard.addKey("I");
    this.keyC = keyboard.addKey("C");
    this.keyL = keyboard.addKey("L");
    this.keyM = keyboard.addKey("M");
    this.keyK = keyboard.addKey("K");
    this.keyTab = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    // Tab is "cycle target" in most MMOs; stop the browser stealing it.
    this.input.keyboard?.addCapture("TAB");

    this.hotbar = new Hotbar((skillId) => this.useSkill(skillId));
    this.targetFrame = new TargetFrame();
    this.skillPanel = new SkillPanel();
    this.dockSkillsBtn.addEventListener("click", () => this.skillPanel.toggle());
    // NB: refreshClassUi() is deliberately NOT called here. It touches the
    // melee range ring and the local paperdoll, both created further down,
    // and calling it this early threw inside create() — a blank screen.
    keyboard.on("keydown", (event: KeyboardEvent) => {
      const skillId = this.hotbar.skillForKey(event.key);
      if (skillId) this.useSkill(skillId);
    });

    // Selection ring under the current target. Drawn under everything at
    // ground level so it reads as a marker on the floor, not a halo.
    this.targetRing = this.add
      .ellipse(0, 0, 54, 22, 0xffd873, 0)
      .setStrokeStyle(2, 0xffd873, 0.95)
      .setVisible(false);

    // Only shown while fighting, so it informs during combat without
    // cluttering the screen while you are just walking around.
    this.meleeRangeRing = this.add
      .ellipse(0, 0, ENGAGE_RANGE_PX * 2, ENGAGE_RANGE_PX * 2 * 0.55, 0xffffff, 0)
      .setStrokeStyle(1, 0xffffff, 0.22)
      .setDepth(DEPTH_SCATTER + 1)
      .setVisible(false);

    // Left-click an enemy to fight it, or another player to select them as
    // the ally your support skills will land on. Click empty ground to drop
    // whichever you had.
    this.input.on("gameobjectdown", (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const enemy = [...this.monsters.entries()].find(([, m]) => m.sprite === obj);
      if (enemy && enemy[1].status === "alive") {
        this.setTarget(enemy[0]);
        return;
      }
      const friend = [...this.remotePlayers.entries()].find(([, p]) => p.doll.body === obj);
      if (friend) this.setAllyTarget(friend[0]);
    });
    this.input.on("pointerdown", (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.setTarget(null);
    });

    this.localDoll = this.createPaperdoll(PLAYER_SPAWN.x, PLAYER_SPAWN.y, this.characterName);
    // Your own name plate is green so you can find yourself in a crowd.
    this.localDoll.label.setColor("#a5f3a0").setStroke("#12210f", 3);
    // Safe here, now that the doll and the range ring it reads actually exist.
    this.refreshClassUi();

    this.cameras.main.startFollow(this.localDoll.body, true);

    this.gatherBarBg = this.add
      .rectangle(PLAYER_SPAWN.x, PLAYER_SPAWN.y + 20, BAR_WIDTH, 5, 0x000000, 0.5)
      .setVisible(false);
    this.gatherBarFill = this.add
      .rectangle(PLAYER_SPAWN.x - BAR_WIDTH / 2, PLAYER_SPAWN.y + 20, 0, 5, 0xffc107)
      .setOrigin(0, 0.5)
      .setVisible(false);

    this.add
      .rectangle(4, 4, 300, 104, 0x2b1f12, 0.8)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x8a6a30)
      .setScrollFactor(0).setDepth(DEPTH_HUD);

    // Unit-frame style HUD: a portrait circle beside stacked HP/XP bars,
    // instead of the plain "HP: 50/50" text this replaced.
    this.add
      .circle(34, 44, 22, 0x3c2c1a)
      .setStrokeStyle(2, 0x8a6a30)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.add
    // The portrait was an emoji, which the canvas renderer drew as fallback
    // tofu glyphs (and a stray encoding pass had mangled it further). Using
    // the player's own idle animation instead is legible and actually shows
    // the character you are playing.
    this.add
      .sprite(34, 62, ACTORS_KEY)
      .setOrigin(0.5, 1)
      .setScale(1.3)
      .setScrollFactor(0).setDepth(DEPTH_HUD)
      .play("player-idle");

    const barX = 66;
    const barWidth = HUD_BAR_WIDTH;
    this.hpBarBg = this.add
      .rectangle(barX, 14, barWidth, 18, 0x1c150c)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x8a6a30)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.hpBarFill = this.add
      .rectangle(barX, 14, barWidth, 18, 0x7ed957)
      .setOrigin(0, 0)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.hpBarText = this.add
      .text(barX + barWidth / 2, 23, "50/50", { fontFamily: "Georgia, serif", fontSize: "12px", color: "#1c150c" })
      .setOrigin(0.5)
      .setScrollFactor(0).setDepth(DEPTH_HUD);

    this.xpBarBg = this.add
      .rectangle(barX, 38, barWidth, 14, 0x1c150c)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x8a6a30)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.xpBarFill = this.add
      .rectangle(barX, 38, barWidth, 14, 0xffd873)
      .setOrigin(0, 0)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.xpBarText = this.add
      .text(barX + barWidth / 2, 45, "Lv1  0/20", { fontFamily: "Georgia, serif", fontSize: "11px", color: "#1c150c" })
      .setOrigin(0.5)
      .setScrollFactor(0).setDepth(DEPTH_HUD);

    // Mana completes the HP/XP/mana stack every RPG unit frame has.
    this.manaBarBg = this.add
      .rectangle(barX, 58, barWidth, 12, 0x1c150c)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x8a6a30)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.manaBarFill = this.add
      .rectangle(barX, 58, barWidth, 12, 0x4a90d9)
      .setOrigin(0, 0)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.manaBarText = this.add
      .text(barX + barWidth / 2, 64, "0/0", { fontFamily: "Georgia, serif", fontSize: "10px", color: "#eaf4ff" })
      .setOrigin(0.5)
      .setScrollFactor(0).setDepth(DEPTH_HUD);

    this.inCombatText = this.add
      .text(14, 116, "⚔ In combat", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: "#ff8a65",
        stroke: "#2a1410",
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    this.hintText = this.add.text(14, 82, "WASD move  -  Left-click an enemy (or an ally) to target, Tab to cycle  -  1-6 skills\n[C] Character  [I] Inventory  [L] Leaderboard  [M] Sound", {
      fontFamily: "Georgia, serif",
      fontSize: "13px",
      color: "#b9a06e",
    }).setScrollFactor(0).setDepth(DEPTH_HUD);

    this.inventoryPanel = new InventoryPanel(
      (itemId) => this.socket.sendEquipItem(itemId),
      (itemId) => this.sellItem(itemId),
      () => this.socket.sendUsePotion(),
      () => this.socket.sendUseTonic(),
    );
    this.characterPanel = new CharacterPanel((stat) => this.socket.sendAllocateStat(stat));
    this.leaderboardPanel = new LeaderboardPanel(this.characterName);

    this.dockCharacterBtn.addEventListener("click", () => this.characterPanel.toggle());
    this.dockInventoryBtn.addEventListener("click", () => this.inventoryPanel.toggle());
    this.dockLeaderboardBtn.addEventListener("click", () => {
      this.leaderboardPanel.toggle();
      if (this.leaderboardPanel.isOpen) this.socket.sendRequestLeaderboard();
    });

    const upgradeButtonX = this.scale.width - 110;
    this.upgradeButtonBg = this.add
      .rectangle(upgradeButtonX, 34, 200, 44, 0x2e2214, 0.85)
      .setStrokeStyle(2, 0x8a6a30)
      .setScrollFactor(0).setDepth(DEPTH_HUD)
      .setInteractive({ useHandCursor: true });
    this.upgradeButtonText = this.add
      .text(upgradeButtonX, 34, "", {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#f2e2bd",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.upgradeButtonBg.on("pointerdown", () => this.socket.sendUpgradeGatherSpeed());

    this.battleUpgradeButtonBg = this.add
      .rectangle(upgradeButtonX, 84, 200, 44, 0x2e2214, 0.85)
      .setStrokeStyle(2, 0x8a6a30)
      .setScrollFactor(0).setDepth(DEPTH_HUD)
      .setInteractive({ useHandCursor: true });
    this.battleUpgradeButtonText = this.add
      .text(upgradeButtonX, 84, "", {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#f2e2bd",
        align: "center",
      })
      .setOrigin(0.5)
      .setScrollFactor(0).setDepth(DEPTH_HUD);
    this.battleUpgradeButtonBg.on("pointerdown", () => this.socket.sendUpgradeBattlePower());

    // Canvas fills the browser window (Scale.RESIZE) — keep the camera and
    // the right-anchored HUD buttons in sync when the window is resized.
    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      this.cameras.main.setSize(gameSize.width, gameSize.height);
      const x = gameSize.width - 110;
      this.upgradeButtonBg.setPosition(x, 34);
      this.upgradeButtonText.setPosition(x, 34);
      this.battleUpgradeButtonBg.setPosition(x, 84);
      this.battleUpgradeButtonText.setPosition(x, 84);
    });

    this.craftPanel = new CraftPanel(
      (stationId, slot, rarity, weaponType) => this.socket.sendCraftItem(stationId, slot, rarity, weaponType),
      (stationId) => this.socket.sendCraftPotion(stationId),
      (stationId) => this.socket.sendCraftTonic(stationId),
    );
    this.combatLog = new CombatLog();

    this.socket = new GameSocket("ws://localhost:8080", this.characterName, {
      onWelcome: ({
        id,
        x,
        y,
        wood,
        ore,
        gatherLevel,
        battlePowerLevel,
        xp,
        level,
        hp,
        maxHp,
        strength,
        agility,
        vitality,
        intelligence,
        statPoints,
        mana,
        maxMana,
        weaponRarity,
        armorRarity,
        bootsRarity,
        items,
        potions,
        herb,
        tonics,
      }) => {
        this.localId = id;
        this.moveLocalTo(x, y);
        this.lastSentX = x;
        this.lastSentY = y;
        this.wood = wood;
        this.ore = ore;
        this.herb = herb;
        this.gatherLevel = gatherLevel;
        this.battlePowerLevel = battlePowerLevel;
        this.xp = xp;
        this.level = level;
        this.hp = hp;
        this.maxHp = maxHp;
        this.weaponRarity = weaponRarity;
        this.armorRarity = armorRarity;
        this.bootsRarity = bootsRarity;
        this.strength = strength;
        this.agility = agility;
        this.vitality = vitality;
        this.intelligence = intelligence;
        this.statPoints = statPoints;
        this.mana = mana;
        this.maxMana = maxMana;
        this.refreshManaText();
        this.inventoryPanel.setMaterials(this.wood, this.ore, this.herb);
        this.inventoryPanel.setPotions(potions);
        this.inventoryPanel.setTonics(tonics);
        this.craftPanel.setResources(this.wood, this.ore, this.herb);
        this.refreshXpText();
        this.refreshHpText();
        this.updateUpgradeButton();
        this.updateBattleUpgradeButton();
        this.items = items;
        this.inventoryPanel.setItems(items);
        // Sets the look and, through it, the class — so this has to happen
        // before anything that reads `characterClass`.
        this.refreshLocalAppearance();
        this.characterPanel.setAttributes({ strength, agility, vitality, intelligence, statPoints });
        this.characterPanel.setEquipped(items);
        this.characterPanel.setIdentity(this.characterName, level);
        this.refreshStatsPanel();
      },
      onSnapshot: (payload) => {
        this.applySnapshot(payload.players);
        this.applyNodes(payload.nodes);
        this.applyMonsters(payload.monsters);
        this.applyStations(payload.stations);
      },
      onInventoryUpdate: ({ wood, gatherLevel }) => {
        if (wood > this.wood) this.playSfx("gather", 0.3);
        this.wood = wood;
        this.gatherLevel = gatherLevel;
        this.inventoryPanel.setMaterials(this.wood, this.ore, this.herb);
        this.craftPanel.setResources(this.wood, this.ore, this.herb);
        this.updateUpgradeButton();
        this.updateBattleUpgradeButton();
        this.refreshStatsPanel();
      },
      onHerbUpdate: ({ herb }) => {
        this.herb = herb;
        this.inventoryPanel.setMaterials(this.wood, this.ore, this.herb);
        this.craftPanel.setResources(this.wood, this.ore, this.herb);
      },
      onOreUpdate: ({ wood, ore, battlePowerLevel }) => {
        this.wood = wood;
        this.ore = ore;
        this.battlePowerLevel = battlePowerLevel;
        this.inventoryPanel.setMaterials(this.wood, this.ore, this.herb);
        this.craftPanel.setResources(this.wood, this.ore, this.herb);
        this.updateUpgradeButton();
        this.updateBattleUpgradeButton();
        this.refreshStatsPanel();
      },
      onXpUpdate: ({ xp, level, leveledUp }) => {
        this.xp = xp;
        this.level = level;
        this.refreshXpText();
        if (leveledUp) {
          this.playSfx("levelup", 0.55);
          this.playEffect("buff", this.playerX, this.playerY - 20, { scale: 3, tint: 0xffd873 });
          this.showToast("Level Up!", "#ffc107");
          this.combatLog.push(`Level up! You are now level ${level}.`, "#ffc107");
          this.characterPanel.setIdentity(this.characterName, level);
          this.refreshClassUi();
        }
      },
      onLootUpdate: ({ item }) => {
        this.showToast(`${item.rarity} ${item.slot} found! [I] to equip`, RARITY_HEX[item.rarity]);
        this.combatLog.push(`Found ${item.rarity} ${item.slot} (+${item.statValue}).`, RARITY_HEX[item.rarity]);
      },
      onItemsUpdate: ({ items, weaponRarity, armorRarity, bootsRarity }) => {
        this.weaponRarity = weaponRarity;
        this.armorRarity = armorRarity;
        this.bootsRarity = bootsRarity;
        this.items = items;
        this.inventoryPanel.setItems(items);
        // An equip can change what you are, not just what you are wearing:
        // this message is the only notice the client gets that its class may
        // just have changed, so the whole class-derived UI refreshes here.
        this.refreshLocalAppearance();
        this.characterPanel.setEquipped(items);
        this.refreshStatsPanel();
      },
      onManaUpdate: ({ mana, maxMana }) => {
        this.mana = mana;
        this.maxMana = maxMana;
        this.refreshManaText();
      },
      onSkillResult: (payload) => {
        const skill = SKILLS[payload.skillId];
        if (!payload.ok) {
          // Rejections are quiet: a small note, no cooldown, no effect.
          this.showToast(`${skill.name}: ${payload.reason ?? "unavailable"}`, "#9e9e9e");
          return;
        }
        this.hotbar.startCooldown(payload.skillId, payload.cooldownRemainingMs);
        this.hotbar.startGlobalCooldown(payload.globalCooldownMs);
        this.playSfx(skill.sfx as SfxName, 0.5);
        this.lastCombatAt = this.time.now;

        // Mobility resolves here rather than server-side: it moves the
        // player, and movement is already client-authoritative. The server
        // owned the cooldown, which is the part that had to be trusted.
        if (skill.kind === "mobility") {
          this.performDash(skill.power);
          this.combatLog.push(`${skill.name}!`, "#bdf7c8");
          return;
        }

        // Self-centred skills burst on the player; targeted ones land on
        // whatever they actually hit, which the server just told us.
        if (skill.radiusPx > 0 || payload.hits.length === 0) {
          this.playEffect(skill.effect as EffectName, this.playerX, this.playerY - 26, {
            scale: skill.radiusPx > 0 ? skill.radiusPx / 26 : 3,
          });
        }
        for (const hit of payload.hits) {
          const monster = this.monsters.get(hit.monsterId);
          if (!monster) continue;
          const cy = monster.y - (ACTOR_ART_H[MONSTER_ACTOR[monster.kind]] * ACTOR_SCALE) / 2;
          // Skills roll to hit like any other attack, so a miss has to read
          // as a miss rather than silently doing nothing.
          if (!hit.hit) {
            this.showFloatingText(monster.x, monster.y - 30, "MISS", "#9e9e9e");
            continue;
          }
          this.playEffect(skill.effect as EffectName, monster.x, cy, { scale: hit.crit ? 2.9 : 2.2 });
          this.flashMonsterHit(monster, hit.crit);
          this.showFloatingText(
            monster.x,
            monster.y - 30,
            hit.crit ? `CRIT -${hit.damage}` : `-${hit.damage}`,
            hit.crit ? "#ffeb3b" : "#ffd166",
          );
        }
        if (payload.healed) {
          this.showFloatingText(this.playerX, this.playerLabelY(this.playerY), `+${payload.healed}`, "#7ed957");
        }
        if (payload.buffMs) this.showToast("Enraged!", "#ffc107");
        this.combatLog.push(
          payload.hits.length > 0
            ? `${skill.name} hit ${payload.hits.length} enemy${payload.hits.length > 1 ? "ies" : ""}.`
            : `${skill.name} used.`,
          "#ffd166",
        );
      },
      onHpUpdate: ({ hp, maxHp, defeated, x, y }) => {
        // A heal that isn't a respawn is a potion or regen tick — worth its
        // own cue, and it reuses the support effect the spell system will.
        if (!defeated && hp > this.hp + 1) {
          this.playSfx("heal", 0.4);
          this.playEffect("heal", this.playerX, this.playerY - 20, { scale: 2.4 });
        }
        this.hp = hp;
        this.maxHp = maxHp;
        this.refreshHpText();
        if (defeated && x !== undefined && y !== undefined) {
          this.moveLocalTo(x, y);
          this.lastSentX = x;
          this.lastSentY = y;
          this.showToast("Defeated! Respawned at half HP", "#ef5350");
          this.combatLog.push("You were defeated and respawned at half HP.", "#ef5350");
        }
      },
      onStatsUpdate: ({ strength, agility, vitality, intelligence, statPoints, maxHp, maxMana }) => {
        this.strength = strength;
        this.agility = agility;
        this.vitality = vitality;
        this.intelligence = intelligence;
        this.statPoints = statPoints;
        this.maxHp = maxHp;
        // Intelligence moves the mana ceiling, so the bar has to be told
        // about it even though the current value has not changed.
        this.maxMana = maxMana;
        this.refreshManaText();
        this.characterPanel.setAttributes({ strength, agility, vitality, intelligence, statPoints });
        this.refreshHpText();
        this.refreshStatsPanel();
      },
      onBattleResult: ({ monsterId, playerHit, playerCrit, playerDamage }) => {
        const monster = this.monsters.get(monsterId);
        if (!monster) return;
        const label = MONSTER_LABELS[monster.kind];
        this.lastCombatAt = this.time.now;

        // The swing plays whether or not it lands — a miss is the player
        // attacking and failing, not the player standing still.
        this.faceLocalToward(monster.x);
        this.swingWeapon(this.localDoll.weapon, this.localDoll.body.flipX, playerCrit);
        this.lungeLocalToward(monster.x, monster.y);
        this.playSfx("swing", 0.35);

        if (playerHit) {
          const text = playerCrit ? `CRIT -${playerDamage}` : `-${playerDamage}`;
          this.flashMonsterHit(monster, playerCrit);
          // Impact sits on the near side of the monster, roughly where the
          // blade arrives, rather than dead centre on its sprite.
          const impactX = monster.x + (this.playerX < monster.x ? -14 : 14);
          const impactY = monster.y - (ACTOR_ART_H[MONSTER_ACTOR[monster.kind]] * ACTOR_SCALE) / 2;
          this.playEffect("slash", impactX, impactY, {
            scale: playerCrit ? 2.6 : 2,
            angle: this.playerX < monster.x ? 0 : 180,
            tint: playerCrit ? 0xffd85e : undefined,
          });
          if (playerCrit) {
            this.playEffect("impact", impactX, impactY, { scale: 2.2, tint: 0xffd85e });
            this.cameras.main.shake(140, 0.006);
          }
          this.playSfx(playerCrit ? "crit" : "hit", playerCrit ? 0.6 : 0.45);
          this.showFloatingText(monster.x, monster.y - 24, text, playerCrit ? "#ffeb3b" : "#ffffff");
          this.combatLog.push(
            playerCrit
              ? `You CRIT the ${label} for ${playerDamage}!`
              : `You hit the ${label} for ${playerDamage}.`,
            playerCrit ? "#ffeb3b" : "#e0e0e0",
          );
        } else {
          this.playSfx("miss", 0.35);
          this.showFloatingText(monster.x, monster.y - 24, "MISS", "#9e9e9e");
          this.combatLog.push(`You missed the ${label}.`, "#9e9e9e");
        }
      },
      // Monster's own counter-attack — arrives on the monster's independent
      // attack cadence, not tied to the player's own swing timing.
      onMonsterAttack: ({ monsterId, hit, crit, damage }) => {
        const monster = this.monsters.get(monsterId);
        const label = monster ? MONSTER_LABELS[monster.kind] : "monster";
        const textY = this.playerLabelY(this.playerY);
        this.lastCombatAt = this.time.now;

        if (monster) this.monsterAttackAnim(monster, crit);

        if (hit) {
          const text = crit ? `CRIT -${damage}` : `-${damage}`;
          this.flashLocalHurt(crit);
          this.playSfx("hurt", crit ? 0.6 : 0.45);
          if (crit) this.cameras.main.shake(160, 0.008);
          this.showFloatingText(this.playerX, textY, text, crit ? "#ff1744" : "#ef5350");
          this.combatLog.push(
            crit ? `The ${label} CRITs you for ${damage}!` : `The ${label} hits you for ${damage}.`,
            crit ? "#ff1744" : "#ef5350",
          );
        } else {
          this.playSfx("miss", 0.3);
          this.showFloatingText(this.playerX, textY, "MISS", "#9e9e9e");
          this.combatLog.push(`The ${label} misses you.`, "#9e9e9e");
        }
      },
      onPotionsUpdate: ({ potions, wood, ore, herb }) => {
        this.wood = wood;
        this.ore = ore;
        this.herb = herb;
        this.inventoryPanel.setPotions(potions);
        this.inventoryPanel.setMaterials(this.wood, this.ore, this.herb);
        this.craftPanel.setResources(this.wood, this.ore, this.herb);
        this.updateUpgradeButton();
        this.updateBattleUpgradeButton();
      },
      onTonicsUpdate: ({ tonics, wood, ore, herb }) => {
        this.wood = wood;
        this.ore = ore;
        this.herb = herb;
        this.inventoryPanel.setTonics(tonics);
        this.inventoryPanel.setMaterials(this.wood, this.ore, this.herb);
        this.craftPanel.setResources(this.wood, this.ore, this.herb);
        this.updateUpgradeButton();
        this.updateBattleUpgradeButton();
      },
      onLeaderboardUpdate: ({ entries }) => {
        this.leaderboardPanel.setEntries(entries);
      },
      // Payload is the character's new totals after the reward (same shape
      // DAILY_BONUS_REWARD uses for the flat grant, but this message
      // always carries the post-grant totals, not the delta).
      onDailyBonus: ({ wood, ore, herb, potions }) => {
        this.wood = wood;
        this.ore = ore;
        this.herb = herb;
        this.inventoryPanel.setMaterials(this.wood, this.ore, this.herb);
        this.inventoryPanel.setPotions(potions);
        this.craftPanel.setResources(this.wood, this.ore, this.herb);
        const r = DAILY_BONUS_REWARD;
        const text = `Daily bonus claimed! +${r.wood} wood, +${r.ore} ore, +${r.herb} herb, +${r.potions} potion.`;
        this.showToast(text, "#ffd873");
        this.combatLog.push(text, "#ffd873");
      },
      onInfo: ({ text, color }) => {
        this.showToast(text, color);
        this.combatLog.push(text, color);
      },
    });
    this.socket.connect();
  }

  private equippedBonusStatValue(slot: ItemSlot): number {
    return this.items.find((item) => item.slot === slot && item.equipped)?.bonusStatValue ?? 0;
  }

  private moveSpeed(): number {
    return movePxPerSec(this.bootsRarity, this.agility, gearMoveBonus(equippedBySlot(this.items)));
  }

  private sellItem(itemId: string): void {
    const item = this.items.find((i) => i.id === itemId);
    if (item) {
      this.combatLog.push(`Sold ${item.rarity} ${item.slot} for ${sellValueFor(item.rarity)} wood.`, "#e2b04f");
    }
    this.socket.sendSellItem(itemId);
  }

  // Every gear total here comes from the same shared aggregator the server
  // resolves combat with, so the sheet cannot quote a number the fight does
  // not actually use.
  private refreshStatsPanel(): void {
    const gear = equippedBySlot(this.items);
    const wpn = weaponDef(this.appearance.weaponType);
    // Damage scales off whichever attribute your current weapon's class uses
    // — reading `strength` here was correct only while everyone was a
    // warrior, and would have shown a mage the wrong hit band.
    const power = primaryStatValue(this.characterClass, {
      strength: this.strength,
      agility: this.agility,
      vitality: this.vitality,
      intelligence: this.intelligence,
    });
    this.characterPanel.setStats({
      moveSpeedPxPerSec: this.moveSpeed(),
      xpBonusPercent: xpBonusPercent(this.armorRarity),
      gatherTimeSec: gatherDurationForLevel(this.gatherLevel, this.agility) / 1000,
      // Attack speed is now a property of the character alone, so this is a
      // real stat rather than the old "time to kill a slime" approximation.
      battleTimeSec:
        (playerAttackIntervalMs(this.weaponRarity, this.battlePowerLevel, this.agility) * wpn.speedMultiplier) / 1000,
      // The weapon's damage multiplier is the inverse of its speed one, so a
      // slow axe shows a visibly bigger hit band than a fast dagger.
      minHit: Math.round(playerMinHit(power) * wpn.damageMultiplier),
      maxHit: Math.round(playerMaxHit(power, gearDamageBonus(gear)) * wpn.damageMultiplier),
      accuracy: playerAccuracy(this.agility) + this.equippedBonusStatValue("ring"),
      critChance: playerCritChance(this.agility) + gearCritChance(gear),
      critDamagePercent: Math.round(critDamageMultiplier(this.weaponRarity) * 100),
      armor: gearArmor(gear),
      evasion: gearEvasion(gear),
      doubleAttackPercent: doubleAttackChance(this.agility),
      hpRegen: regenAmountForVitality(this.vitality),
    });
  }

  // Mana sits under HP and XP in the unit frame, the usual RPG stack.
  private refreshManaText(): void {
    const ratio = this.maxMana > 0 ? Phaser.Math.Clamp(this.mana / this.maxMana, 0, 1) : 0;
    this.manaBarFill.width = HUD_BAR_WIDTH * ratio;
    this.manaBarText.setText(`${Math.round(this.mana)}/${this.maxMana}`);
  }

  private refreshHpText(): void {
    const ratio = this.maxHp > 0 ? Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1) : 0;
    const color = ratio > 0.5 ? 0x7ed957 : ratio > 0.25 ? 0xffc107 : 0xef5350;
    this.hpBarFill.width = HUD_BAR_WIDTH * ratio;
    this.hpBarFill.setFillStyle(color);
    this.hpBarText.setText(`${this.hp}/${this.maxHp}`);
  }

  private refreshXpText(): void {
    const threshold = xpToNextLevel(this.level);
    const ratio = threshold > 0 ? Phaser.Math.Clamp(this.xp / threshold, 0, 1) : 0;
    this.xpBarFill.width = HUD_BAR_WIDTH * ratio;
    this.xpBarText.setText(`Lv${this.level}  ${this.xp}/${threshold}`);
  }

  private showToast(text: string, color: string): void {
    this.showFloatingText(this.playerX, this.playerLabelY(this.playerY) - 14, text, color);
  }

  private showFloatingText(x: number, y: number, text: string, color: string): void {
    const toast = this.add
      .text(x, y, text, {
        fontFamily: "monospace",
        fontSize: "14px",
        color,
        stroke: "#101010",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_FX);
    // Drift upward as it fades — a static number is easy to miss when several
    // land in quick succession during auto-battle.
    this.tweens.add({ targets: toast, y: y - 26, alpha: 0, duration: 1800, ease: "Quad.easeOut" });
    this.time.delayedCall(1800, () => toast.destroy());
  }

  private updateUpgradeButton(): void {
    const cost = gatherUpgradeCost(this.gatherLevel);
    this.upgradeButtonText.setText(`Gather Spd Lv${this.gatherLevel}\nUpgrade: ${cost} wood`);
    const affordable = this.wood >= cost;
    this.upgradeButtonBg.setAlpha(affordable ? 1 : 0.5);
    this.upgradeButtonText.setAlpha(affordable ? 1 : 0.5);
  }

  private updateBattleUpgradeButton(): void {
    const cost = battlePowerUpgradeCost(this.battlePowerLevel);
    this.battleUpgradeButtonText.setText(
      `Battle Pwr Lv${this.battlePowerLevel}\nUpgrade: ${cost.wood} wood, ${cost.ore} ore`,
    );
    const affordable = this.wood >= cost.wood && this.ore >= cost.ore;
    this.battleUpgradeButtonBg.setAlpha(affordable ? 1 : 0.5);
    this.battleUpgradeButtonText.setAlpha(affordable ? 1 : 0.5);
  }

  update(_time: number, deltaMs: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keyI)) this.inventoryPanel.toggle();
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) this.characterPanel.toggle();
    if (Phaser.Input.Keyboard.JustDown(this.keyL)) {
      this.leaderboardPanel.toggle();
      if (this.leaderboardPanel.isOpen) this.socket.sendRequestLeaderboard();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) {
      this.soundOn = !this.soundOn;
      this.showToast(this.soundOn ? "Sound on" : "Sound off", "#b9a06e");
    }
    if (Phaser.Input.Keyboard.JustDown(this.keyK)) this.skillPanel.toggle();
    if (Phaser.Input.Keyboard.JustDown(this.keyTab)) this.cycleTarget();

    this.hotbar.update(this.mana);
    this.refreshTargetUi();
    // "In combat" is inferred from recent combat traffic rather than a
    // protocol flag — it only needs to be roughly right, and this way the
    // server stays unaware of a purely cosmetic state.
    const fighting = this.time.now - this.lastCombatAt < 3000;
    this.inCombatText.setVisible(fighting);
    this.meleeRangeRing.setPosition(this.playerX, this.playerY).setVisible(fighting);
    this.dockInventoryBtn.classList.toggle("active", this.inventoryPanel.isOpen);
    this.dockCharacterBtn.classList.toggle("active", this.characterPanel.isOpen);
    this.dockLeaderboardBtn.classList.toggle("active", this.leaderboardPanel.isOpen);
    this.dockSkillsBtn.classList.toggle("active", this.skillPanel.isOpen);

    const dx =
      (this.cursors.left.isDown || this.keyA.isDown ? -1 : 0) +
      (this.cursors.right.isDown || this.keyD.isDown ? 1 : 0);
    const dy =
      (this.cursors.up.isDown || this.keyW.isDown ? -1 : 0) +
      (this.cursors.down.isDown || this.keyS.isDown ? 1 : 0);

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      const deltaSec = deltaMs / 1000;
      const speed = this.moveSpeed();
      const nextX = Phaser.Math.Clamp(this.playerX + (dx / len) * speed * deltaSec, 0, WORLD_BOUNDS.width);
      const nextY = Phaser.Math.Clamp(this.playerY + (dy / len) * speed * deltaSec, 0, WORLD_BOUNDS.height);
      this.moveLocalTo(nextX, nextY);
      // Purely horizontal facing: the art has no back/front variants, so
      // flipping is only meaningful on the X axis and vertical-only movement
      // should leave the sprite facing whichever way it already was.
      if (dx !== 0) this.localDoll.body.setFlipX(dx < 0);
      this.dashHintX = dx;
      this.dashHintY = dy;
    }
    this.playPlayerAnim(this.localDoll, moving);

    // Runs every frame, not just on movement: the attack lunge and the
    // weapon's hand-tracking are both offsets applied here, so they would
    // freeze mid-swing if this only fired while walking.
    this.syncLocalVisuals();

    this.maybeSendPosition();
  }

  // The click-to-start intent system, its progress bar and its duration
  // maths all lived here. Gathering and combat are now decided server-side
  // from proximity alone, so the client has no action state to track: it
  // sends position and reacts to what comes back.

  private maybeSendPosition(): void {
    const now = performance.now();
    const moved = this.playerX !== this.lastSentX || this.playerY !== this.lastSentY;
    if (!moved || now - this.lastSentAt < SEND_INTERVAL_MS) return;

    this.socket.sendMove(this.playerX, this.playerY);
    this.lastSentAt = now;
    this.lastSentX = this.playerX;
    this.lastSentY = this.playerY;
  }

  private applySnapshot(players: PlayerState[]): void {
    const seenIds = new Set<string>();

    for (const player of players) {
      if (player.id === this.localId) continue;
      seenIds.add(player.id);

      let visual = this.remotePlayers.get(player.id);
      if (!visual) {
        visual = {
          doll: this.createPaperdoll(player.x, player.y, player.name),
          lastX: player.x,
          lastY: player.y,
        };
        this.remotePlayers.set(player.id, visual);
      }

      // Their gear comes over the wire on every snapshot, so equipping
      // something is visible to everyone else without a dedicated message.
      this.applyAppearance(visual.doll, player.appearance);
      const movedX = player.x - visual.lastX;
      const moved = movedX !== 0 || player.y !== visual.lastY;
      if (movedX !== 0) visual.doll.body.setFlipX(movedX < 0);
      this.playPlayerAnim(visual.doll, moved);
      visual.lastX = player.x;
      visual.lastY = player.y;

      this.positionPaperdoll(visual.doll, player.x, player.y, player.x, player.y, player.y);
    }

    for (const [id, visual] of this.remotePlayers) {
      if (!seenIds.has(id)) {
        this.destroyPaperdoll(visual.doll);
        this.remotePlayers.delete(id);
      }
    }
  }

  private applyNodes(nodeStates: ResourceNodeState[]): void {
    for (const state of nodeStates) {
      let node = this.nodes.get(state.id);

      if (!node) {
        const scale = NODE_SCALE[state.kind];
        const height = NODE_ART_H[state.kind] * scale;
        const variants = NODE_VARIANTS[state.kind];
        const frame = variants[hashToIndex(state.id, variants.length)];
        // Shadow is sized off the art's *width* footprint, not its height —
        // a 32px-tall tree still stands on a 16px-wide base.
        this.addGroundShadow(state.x, state.y, 16 * scale * 0.6, 16 * scale * 0.22);
        const shape = this.add
          .image(state.x, state.y, PROPS_KEY, frame)
          .setOrigin(0.5, 1)
          .setScale(scale)
          .setDepth(state.y)
          .setInteractive({ useHandCursor: true });
        if (state.status !== "available") shape.setTint(NODE_COLOR_DEPLETED);

        // Foliage sways; rock doesn't. Rotating about the base (origin
        // 0.5,1) reads as a plant bending in wind, where rotating about the
        // centre would look like it was pivoting in mid-air. The random
        // delay keeps a cluster of bushes from swaying in lockstep.
        if (state.kind !== "rock") {
          this.tweens.add({
            targets: shape,
            angle: { from: -1.6, to: 1.6 },
            duration: 1900 + Math.random() * 900,
            delay: Math.random() * 1500,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
        }

        const label = this.add
          .text(state.x, state.y - height - 8, NODE_LABELS[state.kind], {
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#e6f0d8",
            stroke: "#1b2414",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(state.y + 0.5);
        node = { shape, label, x: state.x, y: state.y, status: state.status, kind: state.kind };
        this.nodes.set(state.id, node);
      } else if (node.status !== state.status) {
        if (state.status === "available") node.shape.clearTint();
        else node.shape.setTint(NODE_COLOR_DEPLETED);
        node.status = state.status;
      }
    }
  }

  private applyMonsters(monsterStates: MonsterState[]): void {
    for (const state of monsterStates) {
      let monster = this.monsters.get(state.id);
      const actor = MONSTER_ACTOR[state.kind];
      const barY = this.actorLabelY(state.y, actor);

      if (!monster) {
        const footprint = ACTOR_ART_H[actor] * ACTOR_SCALE;
        const shadow = this.addGroundShadow(state.x, state.y, footprint * 0.55, footprint * 0.2);
        const sprite = this.add
          .sprite(state.x, state.y, ACTORS_KEY)
          .setOrigin(0.5, 1)
          .setScale(ACTOR_SCALE)
          .setDepth(state.y)
          .setInteractive({ useHandCursor: true });
        sprite.play(`${actor}-idle`);

        const weaponFrame = MONSTER_WEAPON[state.kind];
        let weapon: Phaser.GameObjects.Image | undefined;
        if (weaponFrame !== undefined) {
          weapon = this.createWeaponSprite();
          // The goblin's chopper is drawn from the cell floor with the hand
          // at the very bottom, so it grips like an axe rather than at the
          // origin `fist` would default it to.
          this.equipWeaponSprite(weapon, weaponFrame, "axe");
          this.positionWeapon(weapon, sprite, actor, state.x, state.y, state.y);
        }
        if (state.status !== "alive") this.setMonsterDead(sprite, weapon);
        const label = this.add
          .text(state.x, barY - 12, MONSTER_LABELS[state.kind], {
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#ffd7c8",
            stroke: "#2a1410",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(state.y + 0.5);
        const hpBarBg = this.add.rectangle(state.x, barY, BAR_WIDTH, 5, 0x000000, 0.5).setDepth(state.y + 0.5);
        const hpBarFill = this.add
          .rectangle(state.x - BAR_WIDTH / 2, barY, BAR_WIDTH, 5, 0xe53935)
          .setOrigin(0, 0.5)
          .setDepth(state.y + 0.5);
        monster = {
          sprite,
          shadow,
          weapon,
          label,
          x: state.x,
          y: state.y,
          hp: state.hp,
          maxHp: state.maxHp,
          slowed: state.slowed,
          windingUp: false,
          status: state.status,
          kind: state.kind,
          hpBarBg,
          hpBarFill,
        };
        this.monsters.set(state.id, monster);
      } else if (monster.status !== state.status) {
        if (state.status === "alive") {
          this.reviveMonster(monster, actor);
        } else {
          this.killMonster(monster);
        }
        monster.status = state.status;
      }

      const alive = state.status === "alive";
      monster.hpBarBg.setVisible(alive);
      monster.hpBarFill.setVisible(alive);
      monster.label.setVisible(alive);

      // Monsters chase now, so their position is live state rather than
      // something set once at spawn. Everything attached to them has to
      // follow, and the walk animation has to reflect whether they moved.
      const movedX = state.x - monster.x;
      const moving = Math.hypot(movedX, state.y - monster.y) > 0.4;
      monster.x = state.x;
      monster.y = state.y;
      monster.hp = state.hp;
      monster.maxHp = state.maxHp;
      monster.slowed = state.slowed;
      this.updateTelegraph(monster, state);
      // Chilled enemies read blue — the only feedback that Frost Nova is
      // still doing something after its effect animation has finished.
      if (state.status === "alive" && this.tweens.getTweensOf(monster.sprite).length === 0) {
        if (state.slowed) monster.sprite.setTint(0x8fd4ff);
        else monster.sprite.clearTint();
      }

      if (alive) {
        if (Math.abs(movedX) > 0.05) monster.sprite.setFlipX(movedX < 0);
        this.playActorAnim(monster.sprite, actor, moving);
        // Only reposition when a tween isn't shoving the sprite around, or
        // the lunge/recoil animations would be cancelled out every snapshot.
        if (this.tweens.getTweensOf(monster.sprite).length === 0) {
          monster.sprite.setPosition(state.x, state.y);
        }
        monster.shadow.setPosition(state.x, state.y).setDepth(state.y - 0.5);
        monster.sprite.setDepth(state.y);

        const ratio = state.maxHp > 0 ? Phaser.Math.Clamp(state.hp / state.maxHp, 0, 1) : 0;
        monster.hpBarFill.width = BAR_WIDTH * ratio;
        monster.label.setPosition(state.x, barY - 12).setDepth(state.y + 0.5);
        monster.hpBarBg.setPosition(state.x, barY).setDepth(state.y + 0.5);
        monster.hpBarFill.setPosition(state.x - BAR_WIDTH / 2, barY).setDepth(state.y + 0.5);

        // Re-park the weapon every snapshot. positionWeapon restores the
        // rest angle when no swing is running, so this is also what
        // un-sticks a weapon left mid-arc by an interrupted swing.
        if (monster.weapon) {
          this.positionWeapon(monster.weapon, monster.sprite, actor, state.x, state.y, state.y);
        }
      } else {
        monster.shadow.setPosition(state.x, state.y).setDepth(state.y - 0.5);
      }
    }
  }

  // A corpse stops animating as well as darkening — a bobbing dark silhouette
  // still reads as "alive but weirdly coloured", which is what the old
  // tint-only depleted state looked like once the sprites gained animation.
  private setMonsterDead(sprite: Phaser.GameObjects.Sprite, weapon?: Phaser.GameObjects.Image): void {
    sprite.anims.stop();
    sprite.setTint(MONSTER_COLOR_DEAD);
    sprite.setAngle(0);
    weapon?.setVisible(false);
  }

  // Defeat gets a beat of its own: a topple and a burst, then the corpse
  // settles into the dark idle state above. Respawn just undoes it.
  private killMonster(monster: MonsterVisual): void {
    const cx = monster.x;
    const cy = monster.y - (ACTOR_ART_H[MONSTER_ACTOR[monster.kind]] * ACTOR_SCALE) / 2;
    this.playEffect("impact", cx, cy, { scale: 2.4, tint: 0xffc4a3 });
    this.playSfx("die", 0.5);
    monster.sprite.anims.stop();
    monster.weapon?.setVisible(false);
    this.tweens.killTweensOf(monster.sprite);
    this.tweens.add({
      targets: monster.sprite,
      angle: this.playerX < monster.x ? 78 : -78,
      duration: 260,
      ease: "Quad.easeIn",
      onComplete: () => this.setMonsterDead(monster.sprite, monster.weapon),
    });
  }

  private reviveMonster(monster: MonsterVisual, actor: ActorName): void {
    this.tweens.killTweensOf(monster.sprite);
    monster.sprite.setAngle(0).setX(monster.x).clearTint();
    monster.sprite.play(`${actor}-idle`);
    if (monster.weapon) {
      monster.weapon.setVisible(true).setAngle(WEAPON_REST_DEG);
      this.positionWeapon(monster.weapon, monster.sprite, actor, monster.x, monster.y, monster.y);
    }
  }

  // Draws the danger zone for a charging telegraphed attack. Created on the
  // false->true edge and grown over the wind-up, so the fill reaching full
  // size *is* the countdown — the player reads "get out" from the shape
  // rather than from a number.
  private updateTelegraph(monster: MonsterVisual, state: MonsterState): void {
    if (state.windingUp === monster.windingUp) {
      monster.telegraph?.setPosition(state.x, state.y);
      return;
    }
    monster.windingUp = state.windingUp;

    if (!state.windingUp) {
      const done = monster.telegraph;
      monster.telegraph = undefined;
      if (done) {
        // Flash white on impact, then clear.
        done.setFillStyle(0xffffff, 0.5);
        this.tweens.add({ targets: done, alpha: 0, duration: 160, onComplete: () => done.destroy() });
      }
      return;
    }

    const radius = MONSTER_STATS[state.kind].slamRadiusPx;
    const windup = MONSTER_STATS[state.kind].windupMs;
    if (radius === undefined || windup === undefined) return;

    const ring = this.add
      .ellipse(state.x, state.y, radius * 2, radius * 2 * 0.6, 0xff5252, 0.16)
      .setStrokeStyle(2, 0xff5252, 0.85)
      .setDepth(DEPTH_SCATTER + 1)
      .setScale(0.25);
    monster.telegraph = ring;
    this.tweens.add({ targets: ring, scale: 1, duration: windup, ease: "Quad.easeIn" });
    this.playSfx("cast", 0.35);
  }

  private setTarget(monsterId: string | null): void {
    if (this.targetId === monsterId) return;
    this.targetId = monsterId;
    this.allyId = null;
    this.socket.sendSetTarget(monsterId);
    if (!monsterId) {
      this.targetRing.setVisible(false);
      this.targetFrame.hide();
    }
  }

  private setAllyTarget(playerId: string | null): void {
    if (this.allyId === playerId) return;
    this.allyId = playerId;
    this.targetId = null;
    this.targetRing.setVisible(false);
    this.socket.sendSetTarget(playerId);
    if (!playerId) this.targetFrame.hide();
  }

  // Dash is resolved client-side once the server confirms the cooldown: it
  // moves you, and movement is already client-authoritative. Direction is
  // wherever you are steering, or directly away from the nearest enemy if
  // you are standing still — because the moment you most need it is when
  // something has already reached you.
  private performDash(distance: number): void {
    let dx = this.dashHintX;
    let dy = this.dashHintY;
    if (dx === 0 && dy === 0) {
      let nearest: MonsterVisual | null = null;
      let nearestDist = Infinity;
      for (const monster of this.monsters.values()) {
        if (monster.status !== "alive") continue;
        const d = Math.hypot(monster.x - this.playerX, monster.y - this.playerY);
        if (d < nearestDist) {
          nearest = monster;
          nearestDist = d;
        }
      }
      if (nearest) {
        dx = this.playerX - nearest.x;
        dy = this.playerY - nearest.y;
      } else {
        dx = this.localDoll.body.flipX ? -1 : 1;
      }
    }
    const len = Math.hypot(dx, dy) || 1;
    const nextX = Phaser.Math.Clamp(this.playerX + (dx / len) * distance, 0, WORLD_BOUNDS.width);
    const nextY = Phaser.Math.Clamp(this.playerY + (dy / len) * distance, 0, WORLD_BOUNDS.height);

    this.playEffect("buff", this.playerX, this.playerY - 20, { scale: 1.6, tint: 0xbdf7c8 });
    this.moveLocalTo(nextX, nextY);
    this.socket.sendMove(nextX, nextY);
  }

  // Tab-cycling, MMO style: walk the alive monsters in range ordered by
  // distance and step to the one after the current pick, so repeated
  // presses rotate through a pack rather than re-selecting the nearest.
  private cycleTarget(): void {
    const candidates = [...this.monsters.entries()]
      .filter(([, m]) => m.status === "alive" && Math.hypot(m.x - this.playerX, m.y - this.playerY) <= AGGRO_RANGE_PX)
      .sort(
        (a, b) =>
          Math.hypot(a[1].x - this.playerX, a[1].y - this.playerY) -
          Math.hypot(b[1].x - this.playerX, b[1].y - this.playerY),
      );
    if (candidates.length === 0) {
      this.setTarget(null);
      return;
    }
    const current = candidates.findIndex(([id]) => id === this.targetId);
    this.setTarget(candidates[(current + 1) % candidates.length][0]);
  }

  private useSkill(skillId: SkillId): void {
    // Checked locally too, purely so a mashed key doesn't spam the socket —
    // the server is still the authority and re-checks.
    if (!this.hotbar.isReady(skillId)) return;
    this.socket.sendUseSkill(skillId);
  }

  // Keeps the ring and target frame on the selected enemy, and drops the
  // selection when it dies so you are never locked onto a corpse.
  private refreshTargetUi(): void {
    if (this.allyId) {
      const ally = this.remotePlayers.get(this.allyId);
      if (!ally) {
        this.setAllyTarget(null);
        return;
      }
      this.targetRing
        .setPosition(ally.doll.body.x, ally.doll.body.y)
        .setStrokeStyle(2, 0x7ed957, 0.95)
        .setDepth(ally.doll.body.y - 0.6)
        .setVisible(true);
      this.targetFrame.show(ally.doll.label.text, 1, 1, "ally");
      return;
    }

    if (!this.targetId) return;
    const target = this.monsters.get(this.targetId);
    if (!target || target.status !== "alive") {
      this.setTarget(null);
      return;
    }
    // The ring doubles as the range readout: gold means you are close
    // enough to swing, grey means you are not. That is the whole reason
    // ranges stop being something you learn by failing.
    const inReach = Math.hypot(target.x - this.playerX, target.y - this.playerY) <= ENGAGE_RANGE_PX;
    this.targetRing
      .setPosition(target.x, target.y)
      .setStrokeStyle(2, inReach ? 0xffd873 : 0x9e9e9e, inReach ? 0.95 : 0.6)
      .setDepth(target.y - 0.6)
      .setVisible(true);
    this.targetFrame.show(
      MONSTER_LABELS[target.kind],
      Math.max(0, target.hp),
      target.maxHp,
      target.slowed ? "❄" : inReach ? undefined : "out of reach",
    );
  }

  private faceLocalToward(targetX: number): void {
    if (targetX !== this.playerX) this.localDoll.body.setFlipX(targetX < this.playerX);
  }

  // A short shove toward the target and back. This is a purely visual
  // offset — the authoritative position never moves, so a swing can never
  // desync the player or teleport them into a monster.
  private lungeLocalToward(targetX: number, targetY: number): void {
    const dx = targetX - this.playerX;
    const dy = targetY - this.playerY;
    const len = Math.hypot(dx, dy) || 1;
    const reach = 10;
    this.tweens.killTweensOf(this.lunge);
    this.tweens.add({
      targets: this.lunge,
      x: (dx / len) * reach,
      y: (dy / len) * reach,
      duration: 80,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.lunge.x = 0;
        this.lunge.y = 0;
      },
    });
  }

  private flashLocalHurt(crit: boolean): void {
    this.localDoll.body.setTintFill(crit ? 0xff5252 : 0xff8a80);
    this.time.delayedCall(110, () => this.localDoll.body.clearTint());
    this.tweens.killTweensOf(this.lunge);
    // Knocked back, i.e. away from whatever just hit us — the opposite
    // shape to the attack lunge above.
    this.tweens.add({
      targets: this.lunge,
      x: this.lunge.x - 6,
      duration: 70,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.lunge.x = 0;
        this.lunge.y = 0;
      },
    });
  }

  // Monsters don't move, so their sprite can be tweened directly and simply
  // returned to `monster.x` afterwards.
  private monsterAttackAnim(monster: MonsterVisual, crit: boolean): void {
    if (monster.status !== "alive") return;
    const toward = this.playerX < monster.x ? -1 : 1;
    monster.sprite.setFlipX(toward < 0);
    if (monster.weapon) {
      this.positionWeapon(monster.weapon, monster.sprite, MONSTER_ACTOR[monster.kind], monster.x, monster.y, monster.y);
      this.swingWeapon(monster.weapon, monster.sprite.flipX, crit);
    }
    this.tweens.add({
      targets: monster.sprite,
      x: monster.x + toward * 12,
      duration: 90,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => monster.sprite.setX(monster.x),
    });
  }

  // Quick recoil so a landed hit is visible on the monster itself, not just
  // in the floating combat text.
  private flashMonsterHit(monster: MonsterVisual, crit: boolean): void {
    if (monster.status !== "alive") return;
    monster.sprite.setTintFill(crit ? 0xffe082 : 0xffffff);
    this.time.delayedCall(90, () => {
      if (monster.status === "alive") monster.sprite.clearTint();
    });
    this.tweens.add({
      targets: monster.sprite,
      x: monster.x + (crit ? 6 : 3),
      duration: 60,
      yoyo: true,
      ease: "Quad.easeOut",
    });
  }

  private applyStations(stationStates: CraftingStationState[]): void {
    for (const state of stationStates) {
      if (this.stations.has(state.id)) continue;

      const height = STATION_ART_H * STATION_SCALE;
      this.addGroundShadow(state.x, state.y, height * 1.6, height * 0.3);
      const sprite = this.add
        .sprite(state.x, state.y, PROPS_KEY, STATION_FRAMES[0])
        .setOrigin(0.5, 1)
        .setScale(STATION_SCALE)
        .setDepth(state.y)
        .setInteractive({ useHandCursor: true });
      sprite.play("station-fire");
      sprite.on("pointerdown", () => this.tryOpenCraft(state.id, state.x, state.y));
      const label = this.add
        .text(state.x, state.y - height - 8, STATION_LABEL, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#ffe082",
          stroke: "#2a1f0a",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(state.y + 0.5);
      this.stations.set(state.id, { sprite, label });
    }
  }

  private tryOpenCraft(stationId: string, x: number, y: number): void {
    if (Phaser.Math.Distance.Between(this.playerX, this.playerY, x, y) > INTERACTION_RANGE_PX) return;
    this.craftPanel.setResources(this.wood, this.ore, this.herb);
    this.craftPanel.open(stationId);
  }
}

