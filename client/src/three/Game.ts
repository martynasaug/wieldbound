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
  MONSTER_LABELS,
  NODE_LABELS,
  STATION_LABEL,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  appearanceFromItems,
  attackRangeFor,
  classForWeapon,
  critDamageMultiplier,
  doubleAttackChance,
  equippedBySlot,
  gatherDurationForLevel,
  gearArmor,
  gearCritChance,
  gearDamageBonus,
  gearEvasion,
  gearMoveBonus,
  movePxPerSec,
  playerAccuracy,
  playerAttackIntervalMs,
  playerCritChance,
  playerMaxHit,
  playerMinHit,
  primaryStatValue,
  regenAmountForVitality,
  sellValueFor,
  unlockedActives,
  weaponDef,
  xpBonusPercent,
  xpToNextLevel,
  type Appearance,
  type ItemInstance,
  type ItemRarity,
  type ItemSlot,
  type MonsterKind,
  type MonsterState,
  type PlayerState,
  type ResourceNodeState,
  type CraftingStationState,
  type SkillId,
} from "../../../shared/protocol-types";
import { GameSocket } from "../net/socket";
import { CharacterPanel } from "../ui/CharacterPanel";
import { InventoryPanel } from "../ui/InventoryPanel";
import { CraftPanel } from "../ui/CraftPanel";
import { SkillPanel } from "../ui/SkillPanel";
import { LeaderboardPanel } from "../ui/LeaderboardPanel";
import { CombatLog } from "../ui/CombatLog";
import { TargetFrame } from "../ui/TargetFrame";
import { Hotbar } from "../ui/Hotbar";
import { Actor } from "./Actor";
import { Hud } from "./hud";
import {
  PX_PER_UNIT,
  World,
  terrainHeight,
  toServerX,
  toServerY,
  toWorldX,
  toWorldZ,
} from "./World";
import { instantiate } from "./assets";

const PLAYER_HEIGHT = 1.8;

// Monster art. Slime is a genuine match; the rest are stand-ins until the
// Quaternius Ultimate Monsters pack (Drive-gated, needs one manual download)
// is available. Heights are tuned to the kind's role, not the source model.
const MONSTER_MODELS: Record<MonsterKind, { model: string; height: number }> = {
  slime: { model: "Slime", height: 0.85 },
  goblin: { model: "Skeleton", height: 1.5 },
  wolf: { model: "Bat", height: 1.0 },
  troll: { model: "Dragon", height: 3.0 },
};

const MOVE_SEND_INTERVAL_MS = 60;

interface MonsterVisual {
  actor: Actor;
  kind: MonsterKind;
  state: MonsterState;
  dead: boolean;
}

export class Game {
  private readonly world: World;
  private readonly hud: Hud;
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

  private targetId: string | null = null;

  private readonly players = new Map<string, Actor>();
  private readonly playerNames = new Map<string, string>();
  private readonly monsters = new Map<string, MonsterVisual>();
  private readonly nodes = new Map<string, THREE.Object3D>();
  private readonly nodeStates = new Map<string, ResourceNodeState>();
  private readonly stations = new Map<string, THREE.Object3D>();
  private readonly stationStates = new Map<string, CraftingStationState>();

  private localActor: Actor | null = null;
  private readonly keys = new Set<string>();
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly fadedMaterials = new Set<THREE.Material>();
  private running = false;

  constructor(container: HTMLElement, characterName: string) {
    this.name = characterName;
    this.world = new World(container);
    this.hud = new Hud(container);

    this.characterPanel = new CharacterPanel((stat) => this.socket.sendAllocateStat(stat));
    this.inventoryPanel = new InventoryPanel(
      (itemId) => this.socket.sendEquipItem(itemId),
      (itemId) => this.sellItem(itemId),
      () => this.socket.sendUsePotion(),
      () => this.socket.sendUseTonic(),
    );
    this.craftPanel = new CraftPanel(
      (stationId, slot, rarity, weaponType) =>
        this.socket.sendCraftItem(stationId, slot, rarity, weaponType),
      (stationId) => this.socket.sendCraftPotion(stationId),
      (stationId) => this.socket.sendCraftTonic(stationId),
    );
    this.skillPanel = new SkillPanel();
    this.leaderboardPanel = new LeaderboardPanel(characterName);
    this.hotbar = new Hotbar((skillId) => this.useSkill(skillId));

    this.socket = new GameSocket("ws://localhost:8080", characterName, {
      onWelcome: (p) => this.onWelcome(p),
      onSnapshot: (p) => this.onSnapshot(p),
      onInventoryUpdate: (p) => {
        this.wood = p.wood;
        this.gatherLevel = p.gatherLevel;
        this.syncMaterials();
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
        this.xp = p.xp;
        this.level = p.level;
        this.hud.setXp(this.xp, xpToNextLevel(this.level), this.level);
        this.characterPanel.setIdentity(this.name, this.level);
        if (p.leveledUp) {
          this.combatLog.push(`Level up! You are now level ${this.level}.`, "#ffd873");
          this.hud.toast(`Level up — ${this.level}`, "#ffd873");
          this.refreshClassUi();
        }
      },
      onLootUpdate: (p) => {
        this.combatLog.push(`Found ${p.item.rarity} ${p.item.slot}.`, "#c9b47a");
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
    await this.world.buildDecor();

    this.localActor = new Actor({ model: "Warrior", height: PLAYER_HEIGHT });
    await this.localActor.load();
    this.world.scene.add(this.localActor.root);
    this.localActor.snapTo(toWorldX(this.playerX), 0, toWorldZ(this.playerY));

    this.bindInput();
    this.socket.connect();
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
  }): void {
    this.syncPlayers(p.players);
    this.syncMonsters(p.monsters);
    this.syncNodes(p.nodes);
    this.syncStations(p.stations);
  }

  private syncPlayers(states: PlayerState[]): void {
    const seen = new Set<string>();
    for (const s of states) {
      seen.add(s.id);
      if (s.id === this.playerId) continue; // local player is predicted, not snapped
      this.playerNames.set(s.id, s.name);
      let actor = this.players.get(s.id);
      if (!actor) {
        actor = new Actor({ model: "Warrior", height: PLAYER_HEIGHT });
        this.players.set(s.id, actor);
        void actor.load().then(() => this.world.scene.add(actor!.root));
      }
      const x = toWorldX(s.x);
      const z = toWorldZ(s.y);
      const prev = actor.position;
      const moving = Math.hypot(x - prev.x, z - prev.z) > 0.02;
      actor.setTargetPosition(x, 0, z);
      if (moving) actor.faceToward(x, z);
      actor.play(moving ? "run" : "idle");
    }
    for (const [id, actor] of this.players) {
      if (seen.has(id)) continue;
      actor.dispose();
      this.players.delete(id);
      this.playerNames.delete(id);
    }
  }

  private syncMonsters(states: MonsterState[]): void {
    for (const s of states) {
      let vis = this.monsters.get(s.id);
      if (!vis) {
        const spec = MONSTER_MODELS[s.kind];
        const actor = new Actor({ model: spec.model, height: spec.height });
        vis = { actor, kind: s.kind, state: s, dead: false };
        this.monsters.set(s.id, vis);
        void actor.load().then(() => this.world.scene.add(actor.root));
      }
      const prev = vis.actor.position;
      const x = toWorldX(s.x);
      const z = toWorldZ(s.y);
      const moving = Math.hypot(x - prev.x, z - prev.z) > 0.02;

      vis.actor.setTargetPosition(x, 0, z);
      if (moving) vis.actor.faceToward(x, z);

      const nowDead = s.status === "dead";
      if (nowDead && !vis.dead) {
        vis.actor.play("die");
      } else if (!nowDead && vis.dead) {
        vis.actor.revive();
      } else if (!nowDead) {
        vis.actor.play(moving ? "run" : "idle");
      }
      vis.dead = nowDead;
      vis.state = s;
    }
  }

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
    if (state.kind === "tree") {
      // Vary the art per node, keyed off the server id so every player sees the
      // same tree in the same place — the 2D client hashed the id for this too.
      const options = ["Tree_1", "Tree_2", "Tree_3", "Pine_1", "Pine_2"];
      const pick = options[hashString(state.id) % options.length];
      const inst = await instantiate(pick, 3.2 + (hashString(state.id) % 5) * 0.22);
      host.add(inst.object);
      return;
    }
    if (state.kind === "rock") {
      const geo = new THREE.DodecahedronGeometry(0.62, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x8a837a, roughness: 1, flatShading: true });
      const rock = new THREE.Mesh(geo, mat);
      rock.position.y = 0.34;
      rock.rotation.set(0.4, hashString(state.id) % 6, 0.2);
      rock.castShadow = true;
      rock.receiveShadow = true;
      host.add(rock);
      return;
    }
    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x4f8f3c, roughness: 1, flatShading: true }),
    );
    bush.position.y = 0.42;
    bush.castShadow = true;
    bush.receiveShadow = true;
    host.add(bush);
  }

  private syncStations(states: CraftingStationState[]): void {
    for (const s of states) {
      this.stationStates.set(s.id, s);
      if (this.stations.has(s.id)) continue;
      const group = new THREE.Group();
      const anvil = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.55, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.7, metalness: 0.35 }),
      );
      anvil.position.y = 0.5;
      anvil.castShadow = true;
      anvil.receiveShadow = true;
      group.add(anvil);

      const embers = new THREE.PointLight(0xff8b30, 9, 9, 2);
      embers.position.set(0.9, 0.7, 0);
      group.add(embers);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffb257 }),
      );
      glow.position.copy(embers.position);
      group.add(glow);

      group.position.set(toWorldX(s.x), 0, toWorldZ(s.y));
      this.world.scene.add(group);
      this.stations.set(s.id, group);
    }
  }

  private onHpUpdate(p: { hp: number; maxHp: number; defeated: boolean; x?: number; y?: number }): void {
    const took = p.hp < this.hp;
    this.hp = p.hp;
    this.maxHp = p.maxHp;
    this.hud.setHp(this.hp, this.maxHp);
    if (took) this.localActor?.play("hit");
    if (p.defeated) {
      this.combatLog.push("You were defeated.", "#ff6b6b");
      this.hud.toast("You were defeated.", "#ff6b6b");
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

  private onBattleResult(p: {
    monsterId: string;
    playerHit: boolean;
    playerCrit: boolean;
    playerDamage: number;
    monsterDefeated: boolean;
  }): void {
    const vis = this.monsters.get(p.monsterId);
    this.localActor?.play("attack");
    if (vis) this.localActor?.faceToward(vis.actor.position.x, vis.actor.position.z);

    const label = vis ? MONSTER_LABELS[vis.kind] : "enemy";
    if (!p.playerHit) {
      this.combatLog.push(`You miss the ${label}.`, "#9a8d76");
      if (vis) this.floatOver(vis.actor, "MISS", "#cfc4ad");
      return;
    }
    const text = p.playerCrit ? `CRIT ${p.playerDamage}` : `${p.playerDamage}`;
    this.combatLog.push(
      `You hit the ${label} for ${p.playerDamage}${p.playerCrit ? " (CRIT)" : ""}.`,
      p.playerCrit ? "#ffd85e" : "#e8dcc0",
    );
    if (vis) this.floatOver(vis.actor, text, p.playerCrit ? "#ffd85e" : "#ffffff");
    if (p.monsterDefeated) this.combatLog.push(`You defeated the ${label}.`, "#7ed957");
  }

  private onMonsterAttack(p: { monsterId: string; hit: boolean; crit: boolean; damage: number }): void {
    const vis = this.monsters.get(p.monsterId);
    if (vis) {
      vis.actor.play("attack");
      if (this.localActor) {
        vis.actor.faceToward(this.localActor.position.x, this.localActor.position.z);
      }
    }
    const label = vis ? MONSTER_LABELS[vis.kind] : "enemy";
    if (!p.hit) {
      this.combatLog.push(`The ${label} misses you.`, "#9a8d76");
      return;
    }
    this.combatLog.push(
      `The ${label} ${p.crit ? "CRITs" : "hits"} you for ${p.damage}.`,
      p.crit ? "#ff8f5e" : "#ff9d9d",
    );
    if (this.localActor) {
      this.floatOver(this.localActor, `-${p.damage}`, p.crit ? "#ff8f5e" : "#ff6b6b");
    }
  }

  private onSkillResult(p: {
    skillId: SkillId;
    ok: boolean;
    reason?: string;
    cooldownRemainingMs: number;
    globalCooldownMs: number;
    hits: { monsterId: string; hit: boolean; damage: number; crit: boolean }[];
    healed?: number;
  }): void {
    if (!p.ok) {
      this.combatLog.push(`${p.skillId}: ${p.reason ?? "failed"}`, "#c98d5e");
      return;
    }
    this.hotbar.startCooldown(p.skillId, p.cooldownRemainingMs);
    this.hotbar.startGlobalCooldown(p.globalCooldownMs);
    this.localActor?.play("attack");
    for (const hit of p.hits) {
      const vis = this.monsters.get(hit.monsterId);
      if (!vis) continue;
      if (!hit.hit) {
        this.floatOver(vis.actor, "MISS", "#cfc4ad");
        continue;
      }
      this.floatOver(vis.actor, hit.crit ? `CRIT ${hit.damage}` : `${hit.damage}`, "#9ad4ff");
    }
    if (p.healed && this.localActor) {
      this.floatOver(this.localActor, `+${p.healed}`, "#7ed957");
    }
  }

  private floatOver(actor: Actor, text: string, color: string): void {
    const p = actor.position;
    const screen = this.world.project(p.x, p.y + 2.0, p.z);
    if (screen) this.hud.floatText(screen.x, screen.y, text, color);
  }

  // --------------------------------------------------------------------- ui

  private onItemsChanged(): void {
    this.appearance = appearanceFromItems(this.items);
    this.inventoryPanel.setItems(this.items);
    this.characterPanel.setEquipped(this.items);
    this.craftPanel.setEquippedWeapon(this.appearance.weaponType);
    this.refreshClassUi();
    this.refreshStats();
  }

  private syncMaterials(): void {
    this.inventoryPanel.setMaterials(this.wood, this.ore, this.herb);
    this.craftPanel.setResources(this.wood, this.ore, this.herb);
  }

  private refreshClassUi(): void {
    const cls = classForWeapon(this.appearance.weaponType);
    this.hotbar.setCharacter(cls, this.level);
    this.skillPanel.setCharacter(cls, this.level);
    this.hotbar.update(this.mana);
  }

  // Every gear total comes from the same shared aggregator the server resolves
  // combat with, so the sheet cannot quote a number the fight does not use.
  private refreshStats(): void {
    const gear = equippedBySlot(this.items);
    const cls = classForWeapon(this.appearance.weaponType);
    const wpn = weaponDef(this.appearance.weaponType);
    const power = primaryStatValue(cls, {
      strength: this.strength,
      agility: this.agility,
      vitality: this.vitality,
      intelligence: this.intelligence,
    });
    this.characterPanel.setStats({
      moveSpeedPxPerSec: this.moveSpeed(),
      xpBonusPercent: xpBonusPercent(this.armorRarity),
      gatherTimeSec: gatherDurationForLevel(this.gatherLevel, this.agility) / 1000,
      battleTimeSec:
        (playerAttackIntervalMs(this.weaponRarity, this.battlePowerLevel, this.agility) *
          wpn.speedMultiplier) /
        1000,
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

  // Logged from the still-cached item before the server round-trip confirms it,
  // so the line reads in the log at the moment the player clicks.
  private sellItem(itemId: string): void {
    const item = this.items.find((i) => i.id === itemId);
    if (item) {
      this.combatLog.push(
        `Sold ${item.rarity} ${item.slot} for ${sellValueFor(item.rarity)} wood.`,
        "#e2b04f",
      );
    }
    this.socket.sendSellItem(itemId);
  }

  private equippedBonusStatValue(slot: ItemSlot): number {
    return this.items.find((i) => i.slot === slot && i.equipped)?.bonusStatValue ?? 0;
  }

  private moveSpeed(): number {
    return movePxPerSec(this.bootsRarity, this.agility, gearMoveBonus(equippedBySlot(this.items)));
  }

  // ------------------------------------------------------------------ input

  private bindInput(): void {
    window.addEventListener("keydown", (e) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (typing) return;
      this.keys.add(e.key.toLowerCase());

      const key = e.key.toLowerCase();
      if (key === "c") this.characterPanel.toggle();
      else if (key === "i") this.inventoryPanel.toggle();
      else if (key === "k") this.skillPanel.toggle();
      else if (key === "l") {
        this.leaderboardPanel.toggle();
        if (this.leaderboardPanel.isOpen) this.socket.sendRequestLeaderboard();
      } else if (key === "tab") {
        e.preventDefault();
        this.cycleTarget();
      } else if (key === "escape") {
        this.setTarget(null);
      } else {
        const skillId = this.hotbar.skillForKey(key);
        if (skillId) this.useSkill(skillId);
      }
    });

    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());

    this.world.renderer.domElement.addEventListener("pointerdown", (e) => this.onPointerDown(e));
  }

  private onPointerDown(e: PointerEvent): void {
    const ndc = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.world.camera);

    // Test against monsters first, then stations. Ground clicks clear the target.
    for (const [id, vis] of this.monsters) {
      if (vis.dead || !vis.actor.loaded) continue;
      const hits = this.raycaster.intersectObject(vis.actor.root, true);
      if (hits.length > 0) {
        this.setTarget(id);
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
          this.craftPanel.setResources(this.wood, this.ore, this.herb);
          this.craftPanel.open(id);
        } else {
          this.hud.toast("Too far from the workbench.", "#c98d5e");
        }
        return;
      }
    }
    this.setTarget(null);
  }

  private setTarget(id: string | null): void {
    this.targetId = id;
    this.socket.sendSetTarget(id);
    if (!id) this.targetFrame.hide();
  }

  private cycleTarget(): void {
    const alive = [...this.monsters.entries()]
      .filter(([, v]) => !v.dead)
      .sort((a, b) => {
        const da = Math.hypot(a[1].state.x - this.playerX, a[1].state.y - this.playerY);
        const db = Math.hypot(b[1].state.x - this.playerX, b[1].state.y - this.playerY);
        return da - db;
      });
    if (alive.length === 0) return;
    const idx = alive.findIndex(([id]) => id === this.targetId);
    this.setTarget(alive[(idx + 1) % alive.length][0]);
  }

  private useSkill(skillId: SkillId): void {
    const cls = classForWeapon(this.appearance.weaponType);
    if (!unlockedActives(cls, this.level).some((s) => s.id === skillId)) return;
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
    }

    this.fadeOccluders();
    this.drawPlates();
    this.world.render();
    requestAnimationFrame(this.loop);
  };

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

    actor.setTargetPosition(toWorldX(this.playerX), 0, toWorldZ(this.playerY));
    this.maybeSendPosition();
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

    for (const [id, actor] of this.players) {
      if (!actor.loaded) continue;
      const p = actor.position;
      this.hud.plate(id, this.world.project(p.x, p.y + 2.05, p.z), {
        name: this.playerNames.get(id) ?? "player",
      });
    }

    for (const [id, vis] of this.monsters) {
      if (!vis.actor.loaded || vis.dead) continue;
      const p = vis.actor.position;
      const spec = MONSTER_MODELS[vis.kind];
      this.hud.plate(id, this.world.project(p.x, p.y + spec.height + 0.4, p.z), {
        name: MONSTER_LABELS[vis.kind],
        hp: vis.state.hp,
        maxHp: vis.state.maxHp,
        targeted: id === this.targetId,
      });
    }

    // Label height follows the art: a bush label floating at treetop height
    // reads as belonging to nothing.
    const NODE_LABEL_Y: Record<ResourceNodeState["kind"], number> = { tree: 3.6, rock: 1.0, bush: 1.1 };
    for (const [id, state] of this.nodeStates) {
      const obj = this.nodes.get(id);
      if (!obj) continue;
      this.hud.plate(
        `node-${id}`,
        this.world.project(obj.position.x, NODE_LABEL_Y[state.kind], obj.position.z, 34),
        { name: NODE_LABELS[state.kind] },
      );
    }

    for (const [id, obj] of this.stations) {
      this.hud.plate(`st-${id}`, this.world.project(obj.position.x, 1.5, obj.position.z), {
        name: STATION_LABEL,
      });
    }

    this.hud.endPlates();

    // Target frame mirrors the selected monster's live snapshot values.
    const t = this.targetId ? this.monsters.get(this.targetId) : null;
    if (t && !t.dead) {
      const range = attackRangeFor(this.appearance.weaponType);
      const dist = Math.hypot(t.state.x - this.playerX, t.state.y - this.playerY);
      this.targetFrame.show(
        MONSTER_LABELS[t.kind],
        t.state.hp,
        t.state.maxHp,
        dist > range ? "out of reach" : undefined,
      );
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
