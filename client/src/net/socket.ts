import type {
  HotbarLayout,
  AttributeName,
  ClientToServerMessage,
  ItemRarity,
  ItemSlot,
  SkillId,
  WeaponType,
  ServerToClientMessage,
} from "../../../shared/protocol-types";

const CLIENT_VERSION = "0.0.1";
const RECONNECT_DELAY_MS = 1000;

export interface GameSocketHandlers {
  onWelcome: (payload: Extract<ServerToClientMessage, { type: "WELCOME" }>["payload"]) => void;
  onSnapshot: (payload: Extract<ServerToClientMessage, { type: "STATE_SNAPSHOT" }>["payload"]) => void;
  onInventoryUpdate: (payload: Extract<ServerToClientMessage, { type: "INVENTORY_UPDATE" }>["payload"]) => void;
  onHerbUpdate: (payload: Extract<ServerToClientMessage, { type: "HERB_UPDATE" }>["payload"]) => void;
  /** All four materials at once. Wood, ore and herb each had their own message;
   *  essence made that four, and four ways to say one thing is three chances
   *  for the client's idea of the wallet to drift from the server's. */
  onMaterials: (payload: Extract<ServerToClientMessage, { type: "MATERIALS_UPDATE" }>["payload"]) => void;
  /** What the character has learned to forge. Whole set, not a delta. */
  onRecipes: (payload: Extract<ServerToClientMessage, { type: "RECIPES_UPDATE" }>["payload"]) => void;
  onOreUpdate: (payload: Extract<ServerToClientMessage, { type: "ORE_UPDATE" }>["payload"]) => void;
  onXpUpdate: (payload: Extract<ServerToClientMessage, { type: "XP_UPDATE" }>["payload"]) => void;
  onLootUpdate: (payload: Extract<ServerToClientMessage, { type: "LOOT_UPDATE" }>["payload"]) => void;
  onHpUpdate: (payload: Extract<ServerToClientMessage, { type: "HP_UPDATE" }>["payload"]) => void;
  onItemsUpdate: (payload: Extract<ServerToClientMessage, { type: "ITEMS_UPDATE" }>["payload"]) => void;
  onStatsUpdate: (payload: Extract<ServerToClientMessage, { type: "STATS_UPDATE" }>["payload"]) => void;
  onBattleResult: (payload: Extract<ServerToClientMessage, { type: "BATTLE_RESULT" }>["payload"]) => void;
  onMonsterAttack: (payload: Extract<ServerToClientMessage, { type: "MONSTER_ATTACK" }>["payload"]) => void;
  onPotionsUpdate: (payload: Extract<ServerToClientMessage, { type: "POTIONS_UPDATE" }>["payload"]) => void;
  onTonicsUpdate: (payload: Extract<ServerToClientMessage, { type: "TONICS_UPDATE" }>["payload"]) => void;
  onLeaderboardUpdate: (payload: Extract<ServerToClientMessage, { type: "LEADERBOARD_UPDATE" }>["payload"]) => void;
  onDailyBonus: (payload: Extract<ServerToClientMessage, { type: "DAILY_BONUS" }>["payload"]) => void;
  onInfo: (payload: Extract<ServerToClientMessage, { type: "INFO" }>["payload"]) => void;
  onSkillResult: (payload: Extract<ServerToClientMessage, { type: "SKILL_RESULT" }>["payload"]) => void;
  onManaUpdate: (payload: Extract<ServerToClientMessage, { type: "MANA_UPDATE" }>["payload"]) => void;
  onAttackState: (payload: Extract<ServerToClientMessage, { type: "ATTACK_STATE" }>["payload"]) => void;
  onWeaponProgress: (payload: Extract<ServerToClientMessage, { type: "WEAPON_PROGRESS" }>["payload"]) => void;
}

export class GameSocket {
  private socket: WebSocket | null = null;
  private shouldReconnect = true;

  constructor(
    private readonly url: string,
    private readonly characterName: string,
    private readonly handlers: GameSocketHandlers,
  ) {}

  connect(): void {
    this.socket = new WebSocket(this.url);

    this.socket.addEventListener("open", () => {
      this.send({
        type: "HELLO",
        payload: { clientVersion: CLIENT_VERSION, name: this.characterName },
      });
    });

    this.socket.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data as string) as ServerToClientMessage;
      if (msg.type === "WELCOME") {
        this.handlers.onWelcome(msg.payload);
      } else if (msg.type === "STATE_SNAPSHOT") {
        this.handlers.onSnapshot(msg.payload);
      } else if (msg.type === "INVENTORY_UPDATE") {
        this.handlers.onInventoryUpdate(msg.payload);
      } else if (msg.type === "MATERIALS_UPDATE") {
        this.handlers.onMaterials(msg.payload);
      } else if (msg.type === "RECIPES_UPDATE") {
        this.handlers.onRecipes(msg.payload);
      } else if (msg.type === "HERB_UPDATE") {
        this.handlers.onHerbUpdate(msg.payload);
      } else if (msg.type === "ORE_UPDATE") {
        this.handlers.onOreUpdate(msg.payload);
      } else if (msg.type === "XP_UPDATE") {
        this.handlers.onXpUpdate(msg.payload);
      } else if (msg.type === "LOOT_UPDATE") {
        this.handlers.onLootUpdate(msg.payload);
      } else if (msg.type === "HP_UPDATE") {
        this.handlers.onHpUpdate(msg.payload);
      } else if (msg.type === "ITEMS_UPDATE") {
        this.handlers.onItemsUpdate(msg.payload);
      } else if (msg.type === "STATS_UPDATE") {
        this.handlers.onStatsUpdate(msg.payload);
      } else if (msg.type === "BATTLE_RESULT") {
        this.handlers.onBattleResult(msg.payload);
      } else if (msg.type === "MONSTER_ATTACK") {
        this.handlers.onMonsterAttack(msg.payload);
      } else if (msg.type === "POTIONS_UPDATE") {
        this.handlers.onPotionsUpdate(msg.payload);
      } else if (msg.type === "TONICS_UPDATE") {
        this.handlers.onTonicsUpdate(msg.payload);
      } else if (msg.type === "LEADERBOARD_UPDATE") {
        this.handlers.onLeaderboardUpdate(msg.payload);
      } else if (msg.type === "DAILY_BONUS") {
        this.handlers.onDailyBonus(msg.payload);
      } else if (msg.type === "INFO") {
        this.handlers.onInfo(msg.payload);
      } else if (msg.type === "SKILL_RESULT") {
        this.handlers.onSkillResult(msg.payload);
      } else if (msg.type === "MANA_UPDATE") {
        this.handlers.onManaUpdate(msg.payload);
      } else if (msg.type === "ATTACK_STATE") {
        this.handlers.onAttackState(msg.payload);
      } else if (msg.type === "WEAPON_PROGRESS") {
        this.handlers.onWeaponProgress(msg.payload);
      }
    });

    this.socket.addEventListener("close", () => {
      if (!this.shouldReconnect) return;
      setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.socket?.close();
  }

  send(msg: ClientToServerMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  sendMove(x: number, y: number): void {
    this.send({ type: "MOVE", payload: { x, y } });
  }


  sendUpgradeGatherSpeed(): void {
    this.send({ type: "UPGRADE_GATHER_SPEED" });
  }


  sendUpgradeBattlePower(): void {
    this.send({ type: "UPGRADE_BATTLE_POWER" });
  }


  sendEquipItem(itemId: string): void {
    this.send({ type: "EQUIP_ITEM", payload: { itemId } });
  }

  sendSalvageItem(itemId: string): void {
    this.send({ type: "SALVAGE_ITEM", payload: { itemId } });
  }

  /** Several at once. The bag holds thirty and loot is frequent. */
  sendSalvageMany(itemIds: string[]): void {
    if (itemIds.length === 0) return;
    this.send({ type: "SALVAGE_MANY", payload: { itemIds } });
  }

  sendAllocateStat(stat: AttributeName): void {
    this.send({ type: "ALLOCATE_STAT", payload: { stat } });
  }

  /** Make a named thing from the catalogue. The forge decides WHAT; the ladder
   *  decides how good, which is why there is no rarity here. */
  sendForgeItem(stationId: string, baseId: string): void {
    this.send({ type: "FORGE_ITEM", payload: { stationId, baseId } });
  }

  /** One step up the ladder on something already owned. */
  sendReforgeItem(stationId: string, itemId: string, affix?: string): void {
    this.send({ type: "REFORGE_ITEM", payload: { stationId, itemId, affix } });
  }

  sendCraftPotion(stationId: string): void {
    this.send({ type: "CRAFT_POTION", payload: { stationId } });
  }

  sendUsePotion(): void {
    this.send({ type: "USE_POTION" });
  }

  sendCraftTonic(stationId: string): void {
    this.send({ type: "CRAFT_TONIC", payload: { stationId } });
  }

  sendUseTonic(): void {
    this.send({ type: "USE_TONIC" });
  }

  sendRequestLeaderboard(): void {
    this.send({ type: "REQUEST_LEADERBOARD" });
  }

  sendSetTarget(targetId: string | null): void {
    this.send({ type: "SET_TARGET", payload: { targetId } });
  }

  sendUseSkill(skillId: SkillId): void {
    this.send({ type: "USE_SKILL", payload: { skillId } });
  }

  sendUseAttack(): void {
    this.send({ type: "USE_ATTACK", payload: {} });
  }

  sendLearnTalent(nodeId: string): void {
    this.send({ type: "LEARN_TALENT", payload: { nodeId } });
  }

  sendSetHotbar(weaponType: WeaponType, layout: HotbarLayout): void {
    this.send({ type: "SET_HOTBAR", payload: { weaponType, layout } });
  }

  sendResetTalents(weaponType: WeaponType): void {
    this.send({ type: "RESET_TALENTS", payload: { weaponType } });
  }
}
