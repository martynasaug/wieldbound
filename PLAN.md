# WieldBound — Build Plan

Named in Phase 46. It was "idlekin-clone" for the first 45 phases, and the
references to Idlekin below are kept as written: they are a record of what
was actually being copied at the time, and by Phase 40 the idle model they
refer to had been deliberately removed. The name now comes from the rule that
replaced it — your class is whatever weapon you are holding.

Reference: originally modeled after app.playidlekin.com (Phaser 3 client,
WebSocket real-time sync, server-authoritative state). This plan is the source
of truth for progress — update checkboxes as steps complete, add notes under a
step if decisions are made that future-us needs to remember.

Everything runs 100% local: Node process on localhost = "server", SQLite file = "database".
No hosting/cloud DB until we explicitly decide to go live.

## Phase 0 — Scaffolding
- [x] Root workspace: `package.json` with npm workspaces (`client`, `server`, `shared`)
- [x] `client/`: Vite + TypeScript + Phaser 3 installed, blank scene renders in browser
- [x] `server/`: Node + TypeScript + `ws` installed, server boots and logs "listening"
- [x] `shared/`: protocol-types.ts with message type placeholders
- [x] Confirm `npm run dev` (or equivalent) starts both client and server together

## Phase 1 — Movement + sync (prove multiplayer loop works)
- [x] One Phaser scene with a placeholder tilemap (can be a colored grid before real art)
- [x] Player sprite moves via WASD/arrow keys, client-side
- [x] WebSocket client connects to server, sends HELLO + position updates
- [x] Server holds authoritative player list, broadcasts snapshots to all connected clients
- [x] Open two browser tabs — each sees the other's player move
- [x] Basic reconnect handling (don't need full backoff yet, just don't crash on drop)

## Phase 2 — Persistence (SQLite)
- [x] `server/src/db.ts`: SQLite file created on first run, schema for `characters`
- [x] Simple name-entry "login" (no real auth yet) creates/loads a character row
- [x] Character position persists across server restart

## Phase 3 — Idle gathering loop
- [x] Resource nodes placed in the world (e.g. trees) as simple sprites
- [x] Walking into / clicking a node starts a gather timer, fills a progress bar
- [x] On completion, resource count increments, syncs to server, persists to SQLite
- [x] Nodes respawn after a cooldown

## Phase 4 — Inventory + first progression hook
- [x] Inventory UI (simple DOM/HUD overlay) shows resource counts, updates live
- [x] One spendable upgrade (e.g. increase gather speed) using collected resources
- [x] Upgrade persists per character

## Phase 5 — Monsters + XP/levels (PvE-lite, mirrors Idlekin's `xp_pve_rate`)
- [x] Monster mobs in the world (reuse the node interaction pattern: channel-in-range to defeat)
- [x] Player level + XP, persisted per character
- [x] Monsters respawn after a cooldown, like resource nodes
- [x] Generalize the client's "active action" (gather vs. battle) so both share one progress bar

## Phase 6 — Equipment + rarity (Idlekin's weapon/head/armor/gloves/boots/rings/earrings, common→mythic)
- [x] Start with a single slot (weapon), a couple of rarity tiers
- [x] Gear drops from monsters or is craftable from wood, affects gather/battle speed
- [x] Equip/unequip UI, persists per character

## Phase 7 — Second resource + crafting/lifeskills taste
- [x] A second gatherable (e.g. ore, mirrors Idlekin's separate collection types)
- [x] A simple recipe: spend resources to craft something (gear, or a consumable)

## Phase 8 — Offline progress (mirrors Idlekin's offline-summary popup)
- [x] Track `lastSeenAt` per character
- [x] On reconnect, grant passive wood for elapsed time away, capped at a max duration
- [x] Show an "away for X, earned Y wood" toast on login
- [x] (Course-corrected mid-phase) Gathering/battling redesigned as a standing,
      auto-repeating intent instead of one-shot-per-click, after user flagged that
      real Idlekin doesn't require re-clicking after every respawn — this also
      made offline continuation actually make sense

## Phase 9 — Monster variety + armor slot
- [x] Second monster kind (goblin: tougher/slower, more XP) alongside slimes
- [x] Armor slot (rarity-tiered like weapon), drops split 50/50 with weapon on kill
- [x] Armor grants an XP bonus on monster kills (mirrors Idlekin's `xp_pve_rate` bonus type)
- [x] UI: Armor HUD line, goblin visually distinct from slime (color + size)

## Phase 10 — Boots slot (third equipment slot)
- [x] Boots slot, rarity-tiered like weapon/armor, drops split evenly across all 3 slots
- [x] Rarity grants a movement-speed bonus — the one gear effect that's immediately
      visible rather than a subtle timing change
- [x] UI: Boots HUD line

## Phase 11 — Boss monster (troll)
- [x] Third monster kind, much tougher (4x base duration) and slower to respawn (3x)
- [x] Guaranteed loot drop on kill, floored at rare rarity — a boss kill never whiffs
- [x] UI: visually distinct (larger, purple) from slime/goblin
- [x] Generalized via `MonsterStats.guaranteedDrop` + `respawnMultiplier`, not a
      one-off special case, so a 4th monster kind is just another table row

## Phase 12 — Player HP / combat risk
- [x] Player has HP (`maxHpForLevel`), persisted per character
- [x] Monsters have a per-kind chance to counter-hit during battle (slime 15%/4dmg,
      goblin 30%/8dmg, troll 50%/18dmg) — rolled once per battle cycle completion,
      same cadence as XP/loot, not a separate tick loop
- [x] Defeat (HP ≤ 0): teleport to spawn, HP restored to half max, battle intent
      cancelled — a setback, not a punishment
- [x] UI: HP HUD line (color shifts green→yellow→red), damage/defeat toasts
- [x] Confirmed damage lands and persists (`hp: 46` on a level-12, max-160 character);
      defeat path not observed live (character's HP pool too large to drain in a
      test session) but shares the exact `applyDamage` code path as confirmed damage

## Phase 13 — Real inventory + Character panel UI
- [x] Items are real DB rows (`items` table), not just "best rarity per slot" —
      picking up loot no longer auto-equips, it sits in your bag
- [x] DOM character panel (press `I`): equipped-slot summary (weapon/armor/boots)
      + a clickable grid of every item you own, click an unequipped item to equip it
- [x] Server validates equip ownership, unequips the slot's old item, keeps the
      old item in inventory rather than deleting it
- [x] Confirmed via DB: multiple items coexist per character, e.g. a common boots
      item sitting unequipped right alongside an equipped rare boots item

## Phase 14 — Primary attributes (Strength/Agility/Vitality) + real combat resolution
- [x] Strength/Agility/Vitality attributes, 3 points per level-up, spent freely via
      the character panel; persisted per character
- [x] Real hit/miss/crit/damage combat resolution (`resolveHit`) replacing the old
      "roll a flat chance, instant kill" model — monsters now have actual HP and
      take multiple attack exchanges to defeat, with a visible HP bar
- [x] Strength → damage range (min/max hit), Agility → accuracy + crit chance,
      Vitality → max HP (unchanged from Phase 12)
- [x] Items now roll a real numeric `statValue` on drop (rarity-ranged): weapon →
      bonus damage, armor → flat damage reduction, boots → evasion%
- [x] Weapon rarity also grants a crit-damage multiplier bonus (on top of its
      existing attack-speed bonus)
- [x] Monsters have their own combat stats (accuracy/evasion/armor/crit) per kind,
      not just a flat "hitChance/hitDamage" pair
- [x] UI: monster HP bars, floating combat-log text (damage numbers/MISS/CRIT) on
      both sides of the exchange, full stat breakdown in the character panel
- [x] Confirmed live: HP bar depletes over multiple hits, floating text appears,
      stats panel shows the new combat numbers

## Phase 15 — Passive HP regeneration
- [x] 1 HP every 5s while below max HP, for every connected player regardless of
      what they're doing (not just idle) — checked once per server tick, throttled
      so it only sends an `HP_UPDATE` (and touches the DB) once per interval, not
      every 100ms tick
- [x] Confirmed live and persisted: HP climbed from 85 → 104 while standing idle

## Phase 16 — World expansion, object titles, crafting
- [x] World grown from 800x600 to 1600x1200 (`WORLD_WIDTH`/`WORLD_HEIGHT` in
      shared, `PLAYER_SPAWN` derived as world center instead of hardcoded)
- [x] Populated layout: 12 resource nodes (8 trees, 4 rocks), 10 monsters
      (4 slime, 4 goblin, 2 troll) spread across the map instead of clustered
      near spawn
- [x] Camera follows the player (`cameras.main.startFollow`), all HUD
      elements (HP/wood/ore/xp text, upgrade buttons) pinned to the screen
      via `setScrollFactor(0)` now that the world is bigger than the canvas
- [x] Name/title labels rendered above every node, monster, and station
      (`NODE_LABELS`/`MONSTER_LABELS`/`STATION_LABEL` in shared)
- [x] Crafting station ("Workbench") at map center: `CRAFT_ITEM` message,
      `CRAFT_COSTS` per slot (wood+ore), spends resources and mints a new
      common-rarity item via the existing `addItem`/loot-update pipeline
- [x] Client `CraftPanel` (DOM overlay, same pattern as the inventory panel):
      click the workbench in range to open, shows cost per slot, disables
      unaffordable crafts
- [x] Confirmed live: camera scroll, titles visible, crafted item received
      and resources deducted
- [x] Crafting extended to all 3 rarity tiers (not just common): `craftCostFor`
      scales the base wood/ore cost by a per-rarity multiplier (1x/4x/12x for
      common/rare/epic) rather than needing a full slot x rarity cost table —
      panel shows 9 rows (3 slots x 3 rarities), each independently
      affordability-gated

## Phase 17 — Independent monster attack cadence
- [x] Monsters now counter-attack on their own clock (`MonsterStats.attackIntervalMs`
      — slime 2.2s, goblin 1.8s, troll 3s) instead of being forced to trade
      blows 1-for-1 with the player's own attack cycle
- [x] Upgrading battle power / equipping a faster weapon now purely increases
      your own attack rate — it no longer incidentally makes the monster hit
      you more often too, which is what happened when both sides shared one
      timer
- [x] New `MONSTER_ATTACK` message carries the monster's counter-attack
      combat-log entry (hit/crit/damage) separately from `BATTLE_RESULT`
      (now player-attack-only); player HP changes still arrive via the
      existing `HP_UPDATE`
- [x] Client floating combat text unchanged in appearance (still shows
      CRIT/-N/MISS above the monster for your swing and above you for the
      monster's), just re-wired to the new message split

## Phase 18 — Persistent combat log
- [x] New always-visible DOM panel (bottom-left, `#combat-log`) instead of
      relying solely on floating text that vanishes after ~2s — every hit,
      miss, crit, loot drop, level-up, and defeat gets a text-log line
- [x] Older entries fade (dim after the most recent 8) rather than
      disappearing, capped at 40 lines total, auto-scrolls to newest
- [x] Client-only addition — reuses existing message payloads
      (`BATTLE_RESULT`, `MONSTER_ATTACK`, `XP_UPDATE`, `LOOT_UPDATE`,
      `HP_UPDATE`), no protocol changes

## Phase 19 — True auto-battler (monster packs, auto-retarget, offline combat)
- [x] World grown again, 1600x1200 → 2200x1600, to make room for spread-out
      monster camps without them crowding into each other or the spawn/
      workbench area
- [x] Monsters regrouped from individually-scattered spawns into tight packs
      (`spawnPack` helper + diamond/triangle offset patterns): 2 slime packs
      of 4, 2 goblin packs of 4, 1 troll pack of 3 — 19 monsters total, up
      from 10
- [x] New `BATTLE_RANGE_PX` (110, vs. gathering's 40) — battle's own
      interaction/leash range, sized so adjacent pack members stay in range
      of each other from one spot, used for `BATTLE_START`, the ongoing
      battle-intent tick check, and the monster's own counter-attack tick
      check (gathering keeps the tighter `INTERACTION_RANGE_PX`)
- [x] True auto-battler behavior: on kill, the server automatically
      retargets the player's battle intent to the nearest still-alive
      monster of the *same kind* within `BATTLE_RANGE_PX`
      (`findNearestAliveMonsterOfKind`) — the player mows through an entire
      pack without re-clicking, only stopping when the whole pack is dead
      (falls back to the old "wait for this one to respawn" behavior if nothing
      else in range)
- [x] Offline progress extended to battling, mirroring gathering's model:
      disconnecting mid-battle now records `offlineBattleMonsterKind`
      (new character column, mutually exclusive with `offlineGatherResource`)
      and reconnecting simulates `awayMs / battleDurationMs(...)` kills
      (capped at the same 8h `OFFLINE_CAP_MS`), granting full XP per kill but
      loot at a heavily reduced rate (`OFFLINE_COMBAT_LOOT_MULTIPLIER` = 0.2x
      the normal drop chance, capped at 5 items) — "idle while offline, but
      much less loot than actually playing," per explicit direction
- [x] New `OFFLINE_COMBAT_SUMMARY` message (sibling of the existing
      gather-only `OFFLINE_SUMMARY`) — client shows a toast + combat-log line
      on reconnect: "Auto-battled Goblins while away 2h 14m: 41 kills,
      +410 XP, +2 items."
- [x] `db.applyOfflineProgress` signature changed to take weapon/armor
      rarity + battle-power level (needed for the battle-duration/XP-bonus
      formulas) and now returns a discriminated result (`resourceKind`+
      `amount` for gather, `battle` object for combat) instead of
      gather-only fields

## Phase 20 — MMO-style UI dock
- [x] Split the old single "Character" overlay (equip slots + attrs + stats
      + item grid all in one panel) into two separate panels, matching how
      real MMOs separate the character sheet from the bag: `CharacterPanel`
      (equip summary, attribute allocation, derived combat stats) and a
      slimmed-down `InventoryPanel` (item grid only)
- [x] New bottom-right icon dock (`#ui-dock`) with two square icon buttons
      (🧙 Character, 🎒 Inventory) — click or keyboard shortcut (`C`/`I`)
      opens the matching panel, active panel's icon gets a highlighted
      border so it's clear which one (if any) is open
- [x] Character icon shows a small badge with the number of unspent
      attribute points whenever you have any — a passive nudge, mirrors the
      "you have upgrades available" indicator most MMO UIs put on the
      relevant menu icon
- [x] Crafting panel/workbench interaction unchanged (still opens by
      walking up to the station and clicking it, not from the dock) — it's
      a location-gated action, not a character-state panel, so it doesn't
      belong in the same icon row
- [x] **Bug fix**: the dock/combat-log were positioned relative to
      `#game-root`, which spans the *full browser viewport* (it flex-centers
      the canvas but has no size of its own) — so `right/bottom`-anchored
      elements landed at the true corner of the browser window, not the
      corner of the 800x600 game canvas, which is what the user actually
      saw ("it's at the very bottom right of the screen"). Fixed by adding
      a `#game-frame` wrapper and moving every DOM overlay (character/
      inventory/craft panels, combat log, dock, tooltip) inside it instead
      of the full-viewport `#game-root`
- [x] Canvas changed from a fixed 800x600 box to filling the whole browser
      window: Phaser `scale.mode: Phaser.Scale.RESIZE` against a
      `#game-frame` sized to 100%/100%, with a `resize` listener that keeps
      the camera and the two right-anchored HUD buttons (gather/battle
      upgrade) repositioned against `this.scale.width` live — the game
      window is now genuinely "bigger" (the whole tab) rather than a larger
      fixed box
- [x] Inventory/equipment visuals overhauled from plain text-in-a-box to a
      real item-grid look: square slots, rarity-colored border (with a
      glow on rare/epic), a slot-type icon (⚔️/🛡️/🎒/👢) instead of a
      text label, and a hover tooltip (`ItemTooltip.ts`, a small
      cursor-following DOM box) showing full stat details instead of
      cramming a stat line onto every card
- [x] Dock re-centered from bottom-right to bottom-center and enlarged
      (48px → 60px icons) per follow-up feedback once the user could
      actually see it in the right place

## Phase 21 — Fantasy-RPG-inspired panel redesign
User shared a reference screenshot (mobile RPG inventory: character
silhouette with equip slots arranged around it, category tabs, item grid,
name/level banner) and asked for something similar. Confirmed via
AskUserQuestion to keep the Character/Inventory split from Phase 20 (not
merge back into one screen) and restyle each to match the reference's
structural ideas while staying in the game's existing dark palette (not a
full brown/gold parchment reskin).
- [x] Character panel: new name+level banner header (`char-name-label`/
      `char-level-label`, fed by a new `CharacterPanel.setIdentity()`
      called on WELCOME and on level-up), equip slots repositioned around
      a centered placeholder character silhouette (dimmed 🧍 emoji — no
      real sprite art yet, consistent with the Phase 0 decision to keep
      placeholder visuals until real assets are worth adding) instead of
      a plain horizontal row
- [x] Inventory panel: widened (380px → 460px), 4 → 5 column grid, and new
      category tabs (All / ⚔️ / 🛡️ / 👢) that filter the grid client-side
      by `item.slot` — mirrors the reference's tab row, scoped to our 3
      actual slot types instead of the reference's weapon/armor/potion mix
- [x] **Follow-up**: user clarified the actual gap was the *visual style*
      (warm gold/leather fantasy skin, glossy depth) not the layout —
      confirmed via AskUserQuestion to extend the reskin to the whole game
      UI, not just these two panels. Added a CSS custom-property theme
      (`--gold`/`--gold-bright`/`--gold-dim`/`--parchment`/`--muted`/
      `--panel-grad`/`--slot-grad`) applied across every DOM surface: login
      screen, character/inventory/craft panels and headers, item/equip
      slots, buttons, combat log, tooltip, and the icon dock. Serif
      (Georgia) replaced monospace as the UI font throughout. Also
      restyled the Phaser-rendered HUD to match: added a background panel
      behind the top-left HP/Wood/Ore/XP text block (previously floated
      bare over the world), recolored that text and the gather/battle
      upgrade buttons to the same gold/parchment palette. Deliberately
      left functional signal colors alone (HP bar green/yellow/red by
      threshold, combat floating-text colors, item rarity border colors)
      since those carry gameplay meaning, not just decoration — rarity
      colors already read fine against the new warmer backgrounds.

## Phase 22 — Materials as inventory items
User asked whether wood/ore should also be items rather than plain HUD
counters. Confirmed via AskUserQuestion: move fully into the inventory,
dropping the separate HUD text entirely (not "also show them in both
places").
- [x] Removed the `woodText`/`oreText` Phaser HUD lines — the HP/HUD
      background panel shrunk from 5 lines to 3 (HP, XP, hint) accordingly
- [x] Wood/ore now render as stackable material slots in the Inventory
      grid (🪵/🪨 icons, `xN` quantity badge, distinct warm-green
      `rarity-material` border since they're not equippable and shouldn't
      be confused with a rarity tier) via new `InventoryPanel.setMaterials()`
- [x] New "Materials" tab (🪵) alongside the existing weapon/armor/boots
      filters — `Filter` type extended to `ItemSlot | "material" | "all"`
- [x] `ItemTooltip.ts` generalized: extracted a shared `attachTooltip()`
      helper so both the existing equipment tooltip and a new
      `attachMaterialTooltip()` (name + quantity, no rarity/stat line)
      reuse the same hover/position/hide logic instead of duplicating it
- [x] `this.wood`/`this.ore` still tracked internally in `WorldScene` (used
      by the craft-panel and upgrade-button affordability checks) — only
      the *display* moved into the inventory, the underlying values are
      unchanged and still arrive via the same `WELCOME`/`INVENTORY_UPDATE`/
      `ORE_UPDATE` messages as before

## Phase 23 — Item selling (a real sink for the bag)
Proceeding autonomously (standing "keep improving it, use Idlekin/other
MMOs as reference" direction) — the bag could only ever grow (loot +
crafting, no way back out), which stops being sustainable now that
crafting can mint items on demand. Sell is the standard MMO fix.
- [x] Unequipped items can be sold for wood, scaled by rarity
      (`sellValueFor`: common 5 / rare 20 / epic 60) — a shared formula
      function, not a table duplicated per call site
- [x] New `SELL_ITEM` message; server validates ownership and that the
      item isn't currently equipped (`db.sellItem`: select-check-delete-
      credit, mirrors the existing `equipItem`/`craftItem` validation shape)
      before deleting the row and crediting wood
- [x] Client: a small "Sell for N🪵" button fades in on hover over any
      unequipped item card (`opacity: 0` → `1` on `:hover`, doesn't compete
      for space when not hovering), `stopPropagation()` so clicking it
      doesn't also trigger the equip click handler on the same card
- [x] Confirmed via combat-log entry on sell ("Sold rare weapon for 20
      wood."), looked up client-side from the still-cached item before the
      server round-trip confirms it

## Phase 24 — Consumables: craftable Health Potions
Proceeding autonomously (standing "keep improving it" direction) — picked
the "more crafting recipes (consumables)" candidate from Phase 23+, since
crafting so far only ever produced equipment and combat had no player-side
recovery tool besides passive regen.
- [x] Consumables modeled as a plain stack count on the character (new
      `potions` column, mirrors `wood`/`ore`) rather than `items` table
      rows — nothing to equip or roll a stat on, just a quantity
- [x] Workbench gained a 4th recipe row (Health Potion, +30 HP, costs 8
      wood + 6 ore) alongside the existing weapon/armor/boots rows
- [x] New `USE_POTION` message: consumes one potion, heals
      `POTION_HEAL_AMOUNT` HP (capped at max via the existing `addHp`),
      resets the regen timer so it doesn't stack awkwardly with passive
      regen's next tick
- [x] Inventory: potions render as a stack card (🧪, xN badge) — clicking
      the card itself uses one (no separate button, unlike sell/equip,
      since "use" is the only thing you'd ever do with a potion card) —
      plus a new "potion" filter tab
- [x] `POTIONS_UPDATE` message reused for both craft and use (both mutate
      the same stack + possibly wood/ore), keeping the message count down
      rather than a separate message per mutation source

## Phase 25 — Second stat roll per item
Proceeding autonomously — picked "more item stats (2nd roll per item)"
from the candidates list, since gear so far only ever had one number worth
checking (the primary roll), and this session already built a proper
tooltip for exactly this kind of extra detail.
- [x] Every item now rolls two independent stats on drop/craft: the
      existing primary (weapon dmg / armor reduction / boots evasion) plus
      a new secondary of a *different* flavor per slot — weapon → bonus
      crit chance%, armor → bonus evasion% (stacks with boots), boots →
      bonus move speed. Smaller ranges than the primary (`SECONDARY_STAT_
      ROLL_RANGES`), since it's a bonus, not the main reason to equip
      something
- [x] New `bonusStatValue` column on `items` (mirrors how `statValue` was
      added originally — an `ALTER TABLE` migration, not a schema rewrite)
- [x] Wired into live combat and movement: player crit chance now adds
      the equipped weapon's bonus, defender evasion (both in the player's
      own attack resolution as attacker-side irrelevant, and in the
      monster's counter-attack as defender-side) now sums boots' primary
      *and* armor's secondary, move speed now takes a third
      `bootsBonusSpeed` parameter
- [x] Tooltip shows the secondary line only when non-zero (a common item
      can roll as low as 0 on some slots) — avoids "Crit chance: +0"
      noise on the common end of the roll table
- [x] Stats panel (Character sheet) reflects the same combined totals as
      combat actually uses, not just the primary — no separate "what you
      see" vs. "what the server computes" formula

## Phase 26 — HUD unit frame (HP/XP bars replace plain text)
Proceeding autonomously — picked "character portrait with HP/XP bars for a
full MMO-style unit frame" from the candidates list.
- [x] Top-left HUD replaced plain "HP: 50/50" / "Lv1 XP: 0/20" text with a
      real unit frame: a portrait circle (🧙 placeholder, no sprite art
      yet) beside two stacked bars — HP (color-shifts green/yellow/red by
      threshold, same thresholds as before) and XP (gold fill), both with
      the numbers overlaid on the bar itself rather than as separate text
- [x] Bars are plain rectangles (`hpBarBg`/`hpBarFill` + text, same for xp)
      with fill width scaled by ratio each refresh — same pattern already
      used for the in-world gather/battle progress bar and monster HP
      bars, just applied to the corner HUD instead of a new mechanism
- [x] HUD background panel grew slightly (268x70 → 300x84) to fit the
      portrait + bars; hint text shifted down accordingly

## Phase 27 — Agility double-attack chance
Proceeding autonomously — picked "agility-based double-attack chance" from
the candidates list, the last of Agility's originally-promised effects
(accuracy, crit chance, move speed already existed) not yet built.
- [x] `doubleAttackChance(agility)` = agility%, capped at 25% — a 4th thing
      Agility buys, alongside accuracy/crit/move-speed
- [x] Implemented as an independent extra swing, not a damage multiplier:
      the player's attack-cycle handler now loops up to 2 times (capped by
      `!monsterDefeated` so a kill on the first swing skips the second),
      each swing rolling its own hit/miss/crit via `resolveHit` and
      sending its own `BATTLE_RESULT` — so a double attack shows as two
      separate combat-log lines/floating-text hits, not one bigger number
- [x] Character sheet gained a "Double Attack" stat row showing the
      current %, computed the same way client-side as the server actually
      rolls it

## Phase 28 — New monster kind: Wolf
Proceeding autonomously — picked "more monster/item variety" from the
candidates list. Added a 4th monster kind rather than reusing an existing
one for a new pack, since the design already generalizes cleanly to that
(per the Phase 9 decision: adding a kind is one `MONSTER_STATS` row, not
new branching logic).
- [x] Wolf: fast/evasive glass-cannon profile distinct from all 3 existing
      kinds — lowest HP after slime (22), highest evasion for its tier
      (20), and the fastest attack cadence of any monster (1.4s, faster
      even than goblin) — a "death by a thousand cuts" pack fight,
      deliberately the opposite feel from the troll's slow-heavy-hits
- [x] New wolf den (4-wolf pack, reuses the existing `DIAMOND_OFFSETS`
      pack shape) placed at (1100, 1500) — the one remaining open spot in
      the world layout, symmetric with the troll lair at (1100, 100)
- [x] Client: distinct color (slate gray, mid-sized radius between slime
      and goblin) so it's visually identifiable at a glance in its pack

## Phase 29 — Fourth equipment slot: Ring
Proceeding autonomously — picked "more item variety" from the candidates
list. The equipment system was explicitly built to make this cheap (Phase
10 decision: "adding a 4th slot later is a one-line addition to each
table") — this phase confirms that held up: `tsc` found every touch point
via exhaustiveness errors on `Record<ItemSlot, ...>` once `ITEM_SLOTS`
grew a 4th entry, nothing missed silently.
- [x] Ring: primary = bonus damage (stacks additively with weapon's, a
      pure-offense slot with no defensive/utility side effect — the other
      3 slots each already do one of those), secondary = bonus accuracy%
- [x] No new equipped-rarity tracking needed server-side beyond extending
      the existing `EquippedItems`/`computeEquipped` — unlike weapon/
      armor/boots, nothing needed a *cached* "ringRarity" column on the
      character row, since ring's effects only ever come from the
      equipped item's own `statValue`/`bonusStatValue`, consumed directly
      via the `equippedItems` map already built for combat. Client mirrors
      this: no `ringRarity` field over the wire, `equippedRingRarity()`
      just scans the already-synced `items` array instead
- [x] Silhouette layout: ring placed bottom-left, mirroring boots at
      bottom-right — weapon left-middle, armor top-right unchanged
- [x] Fully wired through crafting (workbench got a 4th recipe row for
      free — `CraftPanel`'s `SLOTS` list is the only thing that needed
      updating), loot drops (`rollItemSlot` already picks uniformly from
      `ITEM_SLOTS`), inventory tabs, and tooltips

## Phase 30 — Leaderboard
Proceeding autonomously — picked "leaderboards" from the candidates list,
a natural fit given this is already a real multiplayer server with
persisted characters, not just single-player-with-a-server.
- [x] New 🏆 dock icon / `L` shortcut opens a ranked list (top 10 by
      level, xp as tiebreaker) — top 3 get medal emoji instead of a `#N`
      rank number
- [x] Pull-based, not pushed: client sends `REQUEST_LEADERBOARD` when the
      panel opens rather than the server broadcasting it continuously to
      everyone every tick — nobody needs a live-updating leaderboard
      second-to-second, and this avoids adding leaderboard computation to
      the already-busy 100ms tick loop
- [x] Reads straight from SQLite (`ORDER BY level DESC, xp DESC LIMIT 10`)
      rather than from in-memory `playerLevels`, so offline characters
      still rank (in-memory maps only exist for currently-connected
      players) — this is also why it "just works" without needing to be
      told about disconnects/reconnects
- [x] Own row highlighted (gold border) by matching character name client-
      side — no server-side "is this you" flag needed since the client
      already knows its own name

## Phase 31 — Third material: Herb, potions rebalanced, HP Regen stat
User asked for a new gatherable ("herb") used for potions and "maybe some
other things," plus more stats — improvised the specifics.
- [x] Herb: 3rd gatherable resource alongside wood/ore, gathered from a new
      `bush` node kind (green, distinct from tree/rock). `GatherableResource`
      and `ResourceNodeKind` both extended; a new `resourceForNodeKind()`
      helper replaced the old inline `kind === "tree" ? wood : ore`
      ternary (which had no room for a 3rd branch) everywhere a node's
      harvested resource needs to be known, including offline-gather
      resumption on reconnect
- [x] 4 herb bushes placed as a small cluster right next to the workbench/
      spawn (950–1250, 680–920) — convenient since potions (the thing herb
      is for) are crafted at that same station
- [x] Health Potion recipe reworked from wood+ore to mostly herb (8 herb +
      2 wood, dropped the ore requirement entirely) — thematically potions
      should come from herbs, not lumber and stone
- [x] New `HERB_UPDATE` message (parallel to `INVENTORY_UPDATE`/
      `ORE_UPDATE`) rather than overloading an existing message shape;
      `POTIONS_UPDATE` and `WELCOME` extended to carry herb too since both
      already carry wood/ore for the same "affordability" purpose
- [x] More stats (the open-ended half of the ask): Vitality now also
      governs passive HP regen amount (`regenAmountForVitality`, 1 hp/5s
      base up to 5 hp/5s at high vitality) instead of a flat 1 hp/5s for
      everyone — a second payoff for the stat beyond max HP, shown as a
      new "HP Regen" row on the character sheet

## Phase 32 — Daily login bonus
Proceeding autonomously — picked "daily bonuses" from the candidates list.
- [x] Claimable once per 20h (not calendar-day, so timezone/midnight
      rollover isn't a concern — just elapsed time since last claim,
      gated server-side in `claimDailyBonus`) — grants a flat 20 wood /
      20 ore / 15 herb / 1 potion
- [x] Checked on every `HELLO` (i.e. every connect/reconnect), same place
      offline-progress is resolved — stacks additively on top of whatever
      offline gathering/battling already granted this session, using the
      DB's post-offline-update values as the base so the two don't race
- [x] New `DAILY_BONUS` message carries the character's post-grant totals
      (not the delta) — client applies them as an absolute assignment to
      wood/ore/herb/potions rather than an increment, avoiding any
      double-counting if a client reconnect briefly overlaps with a
      pending balance update
- [x] No new UI panel — reuses the existing toast + combat-log pattern
      already used for offline-summary/level-up/combat events, consistent
      with how every other "something happened while you weren't looking"
      moment in this game is communicated

## Phase 33 — Second consumable: XP Tonic
Proceeding autonomously — picked "more crafting recipes (other consumables
using herb)" from the candidates list, delivering on the "herb used for
potions and maybe some other things" ask from a couple phases back.
- [x] XP Tonic: same stack-count consumable model as potions (craft at
      workbench, stored as a plain counter, click the inventory card to
      use), but grants flat XP (+25) instead of HP — costs 12 herb + 4 ore
      (no wood), a different resource mix than the potion's herb+wood so
      the two recipes don't feel identical
- [x] `CraftPanel`/`InventoryPanel` refactored to share a small
      `renderConsumableRow`/`renderConsumableCard` helper between potion
      and tonic instead of duplicating the DOM-building code a second
      time — paid off immediately by making the tonic addition mostly a
      one-line call rather than a copy-paste block
- [x] Tonic and potion share the same inventory filter tab (🧪) rather than
      getting a dedicated 8th tab — both are "consumables," and the tab
      row was already getting crowded (weapon/armor/boots/ring/material/
      potion = 6 tabs plus All)
- [x] Using a tonic reuses the exact same `addXp`/level-up/stat-point
      plumbing as a monster kill (`XP_UPDATE`, and `STATS_UPDATE` if it
      crosses a level) — no special-cased "tonic XP" path, it's the same
      XP pipe with a different trigger

## Phase 34 — Inventory cap
Proceeding autonomously — picked "inventory cap" from the candidates list.
The bag could only ever grow (loot + crafting, no cap) even after selling
was added, so selling was purely optional busywork rather than something
the bag ever actually needed.
- [x] 30-item cap (equipment only — materials/potions/tonics are plain
      counters, not affected) enforced in all three places items get
      added: monster loot drops, workbench crafting, and offline-battle
      loot simulation
- [x] New generic `INFO` message (`{text, color}`) rather than a dedicated
      "bag full" message type — a reusable server-initiated toast for any
      future one-off notification, not just this one
- [x] Crafting checks the cap *before* spending resources — a blocked
      craft costs nothing, rather than charging wood/ore/herb and then
      failing to deliver the item
- [x] Inventory panel header shows a live "(N/30)" counter (turns red at
      cap) so the constraint is visible before you hit it, not just when
      a drop silently fails

## Phase 35 — Real terrain/environment sprites
Proceeding autonomously — picked "real sprite art" from the candidates
list, scoped to terrain/environment only (world background + resource
nodes); monsters and players stay as-is since no matching creature
sprites were found in the chosen pack.
- [x] Downloaded Kenney's "Roguelike/RPG Pack" (CC0, kenney.nl) — a single
      16x16-tile spritesheet with a 1px gap between frames
      (`client/public/assets/tiles.png` + `TILES_LICENSE.txt`)
- [x] World background switched from a plain colored `Grid` to a grass
      `TileSprite` covering the full world bounds
- [x] Resource nodes (tree/rock/bush) render as real cropped tile sprites
      (`Phaser.GameObjects.Image` + frame index) instead of plain colored
      circles; depleted state now uses `setTint`/`clearTint` instead of
      `setFillStyle` (not available on `Image`)

## Phase 36 — Sprite visibility fixes + character/monster art
User feedback on Phase 35: nodes were "barely visible" against the grass
TileSprite, and the rock frame borrowed from the Roguelike/RPG Pack "does
not look like rock at all." Also asked to find character/NPC packs for
"everything we need" — i.e. players and monsters too, not just terrain.
- [x] Every ground-standing sprite (nodes, monsters, local + remote
      players) now gets a soft dark ellipse drawn just before it (shares
      insertion-order-based depth with no explicit `setDepth`) — grounds
      it visually and adds contrast against the busy grass texture, which
      was the real cause of "barely visible," not sprite size
- [x] `NODE_SPRITE_SCALE` bumped 2.5 → 3 for a bit more presence
- [x] Rock replaced with a hand-drawn 16x16 transparent-background boulder
      (`client/public/assets/rock.png`) after confirming the Roguelike/RPG
      Pack has no standalone rock prop at all — its gray "rock" tiles are
      cave-floor pieces with an opaque dirt-color background baked into
      every tile, which would've rendered as a visible dirt-colored square
      over grass, not a floating rock
- [x] Downloaded Kenney's "Tiny Dungeon" (CC0, kenney.nl) for character/
      monster art (`client/public/assets/characters.png` +
      `CHARACTERS_LICENSE.txt`) — its bust-style icons (unlike the terrain
      pack) sit on a genuinely transparent background, confirmed by
      checking corner-pixel alpha before committing to the pack
- [x] Local player, remote players, and all 4 monster kinds now render as
      real bust sprites instead of colored circles: villager bust for the
      player, a second bust for other players, slime/wolf busts used
      as-is, goblin reskinned via `setTint` on a barbarian bust (no green
      humanoid bust exists in the pack), troll using the pack's
      ogre-like bust. Dead/depleted state still reads via tint
      (`MONSTER_COLOR_DEAD`), same mechanism as Phase 35's node depletion
- [x] No walk-cycle frames exist in either pack, so movement stays a
      static bust sliding to its new position rather than an animated
      sprite — treated as acceptable for an idle game where most
      "motion" is auto-battling in place, not deliberate exploration

## Phase 37 — Full art pass: animated actors, custom sprites, Y-sorting
User asked to upgrade every model/sprite, give everything animations where
needed, and make or download proper animated character art — "improvise,
just make the game look good."
- [x] `pixelArt: true` on the Phaser config. Everything in this game is
      16px-grid art drawn at 2-4x, and the default bilinear filtering was
      quietly blurring all of it; this alone sharpened the whole screen
- [x] New source pack: 0x72's "16x16 DungeonTileset II" (CC0), which unlike
      either Kenney pack ships real 4-frame idle **and** run animations for
      25 creatures. Found via a GitHub mirror that also publishes the
      per-frame PNGs, so individual frames could be pulled without
      scraping itch.io's download flow
- [x] Built `client/public/assets/actors.png` offline: source frames are
      wildly irregular (16x16 to 32x36), which Phaser's fixed-cell
      `load.spritesheet` cannot express, so they are composed into one
      uniform 32x36 grid — 8 columns per actor (idle f0-3, run f0-3), one
      row per actor. Cells are centre-aligned horizontally and
      bottom-aligned vertically, so `setOrigin(0.5, 1)` makes every actor
      stand feet-on-position and ground shadows need no per-actor nudging
- [x] Hand-drew the two creatures the pack has no equivalent for — slime
      (squash-and-stretch bob) and wolf (4-leg walk cycle, side profile) —
      via a shape-mask → auto-outline → shade pipeline rather than
      hand-typed pixel maps, so they stay symmetric and iterable
- [x] Player, other players and all 4 monsters are now animated `Sprite`s:
      idle loop at rest, run loop while moving, `flipX` for facing.
      Monsters keep an idle loop; a corpse stops animating *and* tints
      dark, since a bobbing dark silhouette still read as alive
- [x] Landing a hit now flashes the monster white (yellow on crit) and
      recoils it — combat was previously only legible in floating text
- [x] Crafting station is an animated forge (the pack's two lit fire
      frames on a loop) instead of a plain yellow rectangle — the last
      object in the game with no real sprite
- [x] Trees and bushes sway on a randomised tween, rotating about their
      base so it reads as wind rather than a mid-air pivot; rock doesn't
- [x] ~320 flower/detail tiles scattered on the grass lattice from a fixed
      seed (identical every reload). These decorated tiles are full-bleed,
      but their base green is byte-identical to the plain grass tile, so
      on the 32px lattice they blend instead of reading as pasted squares
- [x] Real Y-depth sorting (`setDepth(y)`), forced by the origin change:
      draw order had been creation order, which would have left the
      player — created before any snapshot arrives — permanently behind
      every tree and monster. Background/scatter/FX/HUD are pinned outside
      the Y range. This also fixed a latent bug where world objects could
      draw over the HUD
- [x] Floating combat text now drifts up while fading, and all world
      labels gained a dark stroke so they stay readable over any sprite
- [x] Dropped the Tiny Dungeon pack and its static busts entirely;
      consolidated provenance into `client/public/assets/ASSET_CREDITS.txt`

## Phase 38 — Visual bug fixes + world art quality
First look at Phase 37 running. User reported the workbench rendering as a
"blinking flower", asked for other visual bugs fixed and the graphics
improved / "more HD", and separately that the grass looked "very bland and
low quality".
- [x] **Workbench bug**: `STATION_FRAMES` was written `13 * TILESET_COLS + 0`
      — row 13, column 0 — when the forge is at column 13, **row 0**. Row
      and column swapped, which silently resolves to a real but wrong tile:
      a blue flower. Nothing can catch this, which is why the fix is
      structural (below) rather than just corrected numbers
- [x] **`props.png`**: every non-actor object baked offline into one flat
      32x32 grid indexed 0..14, so world objects are addressed by a single
      meaningful index and the row/col class of bug cannot recur. It also
      unlocks two-tile-tall trees, which a single sheet frame index simply
      cannot express
- [x] **Washed-out trees/bushes**: the tree at (13,9) and bush at (19,9)
      are almost exactly the grass hue, which is why they read as flat
      ghost outlines in-game. Switched to the teal and autumn variants,
      and to the two-tile trees, which have real trunks and contrast
- [x] **Bland grass**: was one 16px tile repeated, so the field was flat
      and visibly gridded. `grass.png` now bakes a 16x16-tile mosaic of
      four grass variants, each randomly flipped (16 distinct-looking
      cells from 4 sources), under a wrapping value-noise brightness field
      for broad light/dark patches. On-screen repeat period goes 32px → 512px
- [x] **Cluttered ground**: the scatter tiles were dense 5-blossom
      bouquets on a locked 32px lattice. Replaced with hand-drawn tufts,
      small flowers and pebbles — mostly tufts, weighted — and because
      they are transparent they now sit at arbitrary positions instead of
      snapping to a grid. Drawing them was necessary, not preference: the
      sheet's flower tiles bleed a stone-path fragment in from the
      neighbouring tile, and its white flowers are themselves grey, so no
      colour key can separate artwork from artifact
- [x] **Broken HUD portrait**: was the 🧙 emoji, which the canvas renderer
      drew as fallback tofu glyphs. Now the player's own idle animation
      plays in the portrait circle
- [x] Node art varies per node (3 trees, 2 bushes, 2 rocks), picked by
      hashing the server-assigned node id — stable across reloads and
      identical for every player looking at the same object
- [x] Redrawn rocks with proper faceting, a specular chip and moss, plus a
      second smaller variant
- [x] `ACTOR_SCALE` 2 → 3; actors were noticeably undersized against the
      world once the trees gained real height

## Phase 39 — Combat animation, held weapons, effect + sound systems
User asked for "good combat with good animations", for an equipped weapon
to actually be held in hand with animations, and — mid-phase — for the
effect and sound work to be built so future spells/skills can use it.
- [x] **Held weapons**: `weapons.png`, bottom-aligned so `setOrigin(0.5, 1)`
      puts the pivot on the grip — the source art is all drawn point-up /
      hilt-down, so one rotation tween reads as a real swing around the
      hand. Rarity picks the art (worn iron → clean steel → ornate gold),
      since rarity is the only thing distinguishing one weapon item from
      another, and it makes an upgrade visible in the world
- [x] Monsters wield too, reusing the same code: goblin an axe, troll a
      big hammer; slime and wolf have no hand to put one in
- [x] Other players' weapons are visible as well — needed a new
      `weaponRarity` on `PlayerState`. The server merges it in at
      broadcast time from the existing `weaponRarities` map rather than
      storing a second copy on the player record, so it cannot drift
- [x] **Position/render split**: the player's position used to live on
      `localSprite.x/y`, i.e. the render object doubled as game state. An
      attack lunge would then have corrupted the position sent to the
      server, so `playerX/playerY` are now authoritative and sprite,
      shadow, label and weapon are all views onto them plus a `lunge`
      offset. Depth still keys off the true position, so a lunge can't pop
      the player in front of something they haven't walked past
- [x] Attack beat: face target → wind up → swing → lunge → impact effect
      on the near side of the monster → flash + recoil → floating damage.
      Crits swing wider, tint gold, add a burst and shake the camera. The
      swing plays on a miss too — a miss is attacking and failing, not
      standing still
- [x] Monster attacks got the mirror treatment: monster lunges and swings,
      player flashes and is knocked back
- [x] Defeat is now a beat rather than a tint swap: burst, topple, then
      settle into the dark idle corpse. Respawn undoes it
- [x] **Effect library** (`fx.png`), built as a system rather than the one
      slash today's combat needs: 8 effects x 4 frames on a uniform 32x32
      grid — slash, impact, bolt, heal, fire, frost, lightning, buff —
      behind one `playEffect(name, x, y, {scale, tint, angle})` call. A
      future spell picks a row and a tint instead of needing new art
- [x] **Sound**: the game had no audio at all. 10 cues synthesised offline
      as 16-bit WAVs (swing/hit/crit/miss/hurt/die/gather/levelup, plus
      `cast` and `heal` which exist ahead of the spell system that will
      want them), behind `playSfx(name, volume)` with a per-cue rate limit
      — auto-battle fires several results a second and would otherwise
      turn the mix into a buzz. `[M]` toggles sound
- [x] Level-up and healing now have their own effect + cue, already using
      the shared library

## Phase 40 — Idle model removed; proximity combat + monster AI; armour art
User: drop the idle framing and build a real auto-battler that "makes
sense"; weapon placement looked wrong; how would armour be shown at all;
and (mid-phase) monsters should move and aggro like any normal RPG.
- [x] **Idle model deleted.** No GATHER_START / BATTLE_START / STOP_ACTION,
      no standing intents, no cycle progress bars, no offline progress
      simulation (~120 lines out of `db.ts`, plus its shared helpers).
      `MOVE` is now the only action input in the game
- [x] **Combat is proximity-driven**: each tick the server finds the nearest
      alive monster within `ENGAGE_RANGE_PX` and swings on the player's own
      attack interval. Fighting pre-empts gathering — you can't calmly chop
      a tree while something is biting you. The first tick in range only
      starts the clock, so stepping in and out can't rush swings
- [x] **Attack speed is now a property of the attacker**, not the target.
      `battleDurationMs(weapon, power, monsterKind)` became
      `playerAttackIntervalMs(weapon, power, agility)` — a troll used to
      make your arms slower, which never made sense; a tough monster should
      be tough through HP/armour/evasion, which it already is
- [x] **Monster AI state machine** (idle → chase → return): sticky aggro on
      one target rather than re-picking the nearest each tick (which makes
      packs flip-flop), gives up when the target dies/logs out/outruns the
      radius with slack so boundary-walking doesn't blink aggro, leashes
      when dragged too far from home, and heals to full on arriving back —
      the standard MMO reset. Corpses return to their post before respawn
      so a chased pack doesn't permanently relocate
- [x] Monster counter-attacks are keyed by monster instead of by player,
      since any number of players can now stand in one monster's reach
- [x] Client follows moving monsters (position/shadow/label/HP bar/weapon),
      and skips repositioning while a lunge tween owns the sprite
- [x] **Armour is visible**: four player rows in the atlas, the same knight
      with its two armour tones repainted — leather / bronze / steel / gold.
      See the decisions log for why this beat the alternatives. Other
      players' armour and weapons show too (`armorRarity` added to
      `PlayerState` alongside `weaponRarity`)
- [x] **Weapon placement fixed.** Two real bugs, not just bad offsets:
      rare/epic used the 29-30px long swords, which are as tall as the
      wielder; and starting a swing kills the previous tween, skipping its
      onComplete and stranding the weapon mid-arc — which is why goblins
      stood around holding axes diagonally. Now short blades throughout,
      grips read off the sprites' actual gauntlet pixels, and the rest
      angle is re-asserted (and mirrored with facing) whenever no swing is
      running. The troll lost its weapon: the ogre art already holds a club
- [x] Verified with a scripted WebSocket client rather than by eye: walked
      a bot into a slime camp and confirmed monsters closed 29px on their
      own, 5 auto-attacks and 16 counter-attacks landed with no input, and
      gear rarity is present on the wire

## Phase 41 — Targeting, skills, positioning, feedback, balance
The five improvements identified at the end of Phase 40, plus mouse
targeting and a skills system, all requested together.
- [x] **Click to target** (1): left-click an enemy to select it, click empty
      ground to clear, `Tab` cycles the pack by distance. The server
      prefers your selected target and falls back to nearest when unset —
      so walking into a camp still fights back, but selecting something
      lets you focus it. Server validates the id rather than trusting it
- [x] **Skills system** (2): five cooldown-gated actives on keys 1-5 and
      clickable, each answering a different problem rather than being five
      damage buttons — Cleave (pack damage), Firebolt (reach, 320px vs
      your 62px melee), Frost Nova (escape, slows), Mend (sustain), War
      Cry (burst, +35% damage). Server-authoritative: it checks cooldown,
      range and target, and the client starts its cooldown sweep from the
      server's reply rather than optimistically on keypress, so rejected
      attempts don't punish the player. Skills scale off the same
      attributes as auto-attacks, so gear choices carry over
- [x] Deliberately **no mana**: a resource bar means a second economy
      (regen, HUD bar, a stat feeding it) for the same decision cooldowns
      already create. Noted as the natural next addition, not a
      prerequisite
- [x] **Positioning now matters** (3): per-kind reach and chase speed.
      Wolves run at 200px/s against your 220 and cannot be shaken off;
      trolls lumber at 92 but swing from 82px away; slimes must physically
      touch you at 42px. Kiting works or doesn't per monster, by design.
      Frost Nova cuts speed to 40% for 3.5s, which is what makes escape a
      real option rather than a stat
- [x] **Feedback** (4): target ring on the ground, a target frame with the
      enemy's name and health, chilled enemies tinted blue, cooldown
      curtains on the hotbar, and an "in combat" indicator inferred from
      recent combat traffic rather than a protocol flag
- [x] **Balance** (5): monster speeds were 42px/s against a player's 220 —
      nothing could ever catch you, which made the whole chase system
      inert. Retuned per kind against the player's actual speed
- [x] One timed-modifier mechanism serves both the monster slow and the
      player buff, rather than two bespoke systems
- [x] Verified with a second scripted client: all five skills fired
      (Cleave hit 4 in a pack, Firebolt hit the selected target at range,
      Frost Nova applied its 3.5s slow, War Cry its 8s buff, Mend healed
      22), a sixth cast was correctly refused as "cooling down", 5
      auto-attacks landed on the *selected* target, and the wolf moved
      exactly 20px/tick = 200px/s, matching its stat

## Phase 42 — Combat depth: threat, kill credit, crowding, GCD, telegraphs
The five gaps found by auditing Phase 41's code. Two were corrections to
things that were arguably broken; three add depth.
- [x] **Shared kill credit** (was broken): `addXp`/`maybeDropLoot` fired only
      for whoever landed the last blow, so two players on one monster meant
      one got *nothing* — which made co-op pointless. A per-monster damage
      table now splits XP proportionally, with a `MIN_XP_SHARE` floor so a
      small contribution doesn't round to zero. Loot isn't divisible, so it
      goes to the largest contributor rather than being duplicated
- [x] **Threat table** (was broken): monsters attacked whoever was
      *nearest*, so a player merely walking past stole a monster off the
      person fighting it, and no group role could exist. The same
      accumulated-damage table now decides who it turns on. Using damage as
      threat means one structure answers both questions, and clearing it on
      death/leash is what gives threat its decay — no separate decay pass
- [x] **Melee crowding**: chasing alone converged a whole pack onto one
      point, so four wolves rendered as one silhouette and all hit you from
      zero distance. Added separation steering (bodies push apart) plus a
      melee-slot cap — only `MAX_MELEE_ATTACKERS` press into contact, the
      rest hold at successively wider rings and rotate in
- [x] **AoE cap**: `monsters.filter(...)` was unbounded, so one Cleave in a
      big camp hit everything at full damage. Capped at 5, nearest first
- [x] **Global cooldown**: only per-skill cooldowns existed, so all five
      skills could be dumped in a single frame. A 900ms GCD makes the bar a
      rotation rather than one alpha strike
- [x] **Skills now roll to hit and crit** (was an inconsistency): they
      applied flat `power − armor`, bypassing accuracy, evasion and crit
      entirely — so Agility silently stopped mattering the moment you
      pressed a hotbar key, which nothing in the UI hinted at. They now go
      through `resolveHit` like any swing. Control effects still land on a
      miss, since a nova that both misses *and* fails to slow would be
      miserable on an 11s cooldown
- [x] **Telegraphed troll slam**: the first enemy answered with your feet
      rather than your stats. It winds up visibly for 900ms, then hits
      everything within 120px of wherever it is standing *at that moment* —
      deliberately not re-checking range at wind-up time, because walking
      out is the whole mechanic. Carried on the snapshot as `windingUp`
      rather than a new message: the client only needs to know a wind-up is
      in progress, and the radius is a static per-kind stat it can look up.
      The danger circle growing to full size *is* the countdown
- [x] Verified by script with three concurrent clients: the second skill in
      a frame was refused ("not ready") and the same skill succeeded after
      the GCD; a skill genuinely **missed** (`hit: false`), impossible
      before; the slime pack's closest pair held 39.6px apart (above the
      34px separation threshold) instead of stacking; **both** players on
      one camp earned XP; and the troll's wind-up was observed

## Phase 43 — Stakes, monster abilities, co-op support, mobility
Third audit pass. Three findings were things that made combat unlosable or
un-cooperative; the rest add verbs.
- [x] **Potion cooldown** (was exploitable): `USE_POTION` had no gate at
      all, so a stocked player could drink their whole stack in one frame
      and could not be killed. 9s cooldown, with an INFO on refusal
- [x] **Regen no longer ticks in combat** (was a hole): healing ran while
      you were being hit, so disengaging to recover was never necessary and
      Mend had no job. Gated behind 6s since the last damage either way
- [x] **Death now costs something** (was backwards): respawn was free *and*
      teleported you home *and* reset the monster to full, so suiciding beat
      retreating. Now: lose 15% of progress toward the current level (never
      a level, never below zero) plus a 20s Weakened debuff that bites into
      the same damage number War Cry inflates, so the two are comparable
- [x] **One ability per monster**, so kinds differ by verb and not just by
      stat block:
      - **Wolf** — leap gap-closer at 3.4x speed. Only front-rank wolves
        leap, so a pack doesn't all pounce at once
      - **Goblin** — call for help: the first hit wakes packmates within
        210px, turning pulling into something you plan
      - **Slime** — death burst, so wading into a swarm and cleaving it
        down is not entirely free
      - **Troll** — telegraphed slam (Phase 42)
- [x] **Co-op support skills**: Mend and War Cry now prefer a selected ally
      and fall back to self. One selection covers both — the server looks
      the id up in monsters *and* players and stores it as whichever it is,
      so clicking an enemy gives you something to attack and clicking a
      player gives you someone to help, with no second message or click.
      This is the first mechanical reason to play together rather than
      merely alongside
- [x] **Dash** (6th skill, 5s cooldown): surges you 170px in your movement
      direction, or directly away from the nearest enemy when standing
      still. Resolved client-side once the server confirms the cooldown,
      consistent with movement already being client-authoritative — the
      server owns the part that needed trusting. Without it, disengaging
      from a wolf (200px/s vs your 220) was effectively impossible
- [x] **Range indicators**: faint melee-reach ring under the player while
      fighting, and the target ring doubles as a readout — gold in reach,
      grey out of it, with the target frame saying "out of reach"
- [x] **Skills scale with level**: `skillPower` read only strength/vitality,
      so the hotbar quietly fell behind as auto-attacks kept scaling
      through gear
- [x] Verified by script with four concurrent clients. First run *failed*
      and was right to: it stood the bots inside the camps, where nothing
      ever has to approach, so leap and call-for-help could not trigger —
      and Mend's "refused" was correct, the ally was at full HP. Re-run
      with the bots outside: wolf leapt at 68px/tick against a 20px walk
      (its exact 3.4x), 3 of 4 goblins engaged from a single pull, potions
      refused 4 of 5 rapid uses, Dash accepted, and Mend healed an ally for
      27 with the ally receiving the notification

## Phase 44 — Class system: warrior / ranger / mage
Classes with their own art, weapons, stats, spells and skill trees; a new
Intelligence attribute driving a mana pool; and higher-fidelity effect art.
- [x] **Three classes**, differing in more than numbers. Each has its own
      body art, its own weapon family it alone may equip, its own primary
      attribute driving damage, and its own **auto-attack range** — the
      single number that most changes how they play: a warrior must close
      to 62px, a ranger opens fire at 300, a mage sits at 250
- [x] **Class art**: 12 player rows (3 classes x 4 armour tiers), built by
      palette-swapping each source sprite's two garment tones. Each class
      tiers through its *own* ramp — a warrior through metals, a ranger
      through leathers and greens, a mage through robe dyes — so tier stays
      readable without every class converging on the same gold at the top
- [x] **Weapon families**: swords / bows / staffs, three tiers each. A class
      may equip only its own, enforced server-side, and weapon drops roll
      the finder's family — loot is per-player anyway, and handing someone a
      weapon they are forbidden to use is a non-reward, not a decision
- [x] Fixed a latent bug the new weapons exposed: bows are gripped at their
      *middle* and staffs a third up, but everything pivoted at the sword's
      pommel, so bows and staffs floated over the wielder's head. The sprite
      origin is now per weapon family
- [x] **Intelligence + mana**: a fourth attribute driving mana pool, mana
      regen and mage damage. Mana answers "how many in a row" where
      cooldowns answer "how often". It regenerates *during* combat, unlike
      health, because a caster who runs dry mid-pull has nothing to do but
      auto-attack — the opposite of playing a mage
- [x] **21 skills — 7 per class, 5 active + 2 passive** — unlocked by level
      (1/1/4/8/12/16/20) and shown in a skill-tree panel (`K`). Level gating
      rather than spendable points on purpose: the game already has a point
      economy in attributes, and a second one competing with it would make
      both feel thin. Passives fold into the stat maths at their level
- [x] Hotbar rebuilds per class and level, and dims what you cannot afford
- [x] **Effects rebuilt at higher fidelity**: 32→48px cells, 4→6 frames,
      8→14 effects, and the primitives gained soft alpha falloff. The old
      ones read as flat shapes because every pixel in a disc had identical
      alpha; ramping alpha by radius is what makes a glow look like light
      rather than a sticker
- [x] Skills with no target now auto-pick the nearest in range, as
      auto-attack already did — refusing to cast at something you are
      visibly standing in front of, purely because you never clicked it, is
      friction nobody would defend
- [x] Failure reasons reordered so permanent facts precede transient ones:
      being told "not ready" when the real answer is "your class will never
      have this" is actively misleading
- [x] Verified by script, three classes in separate camps: distinct
      stat/HP/mana profiles, class-gated skills refused with correct
      reasons, mana actually spent, a ranger engaging from 250px where a
      warrior cannot. Two real bugs were caught this way — an infinite
      recursion in `maxHpOf` (a bulk find-and-replace had rewritten the
      function's own body, crashing the server on connect) and the
      mis-ordered failure reasons

## Phase 45 — Class from your weapon; naked body + layered gear
User: drop picking a class at login, let the equipped weapon decide it (like
Path of Exile); make characters naked by default and show armour and
accessories only when equipped; add a lot more weapon/armour variety with
their own art. Started in the previous session (shared + server + art
finished, client mid-refactor and not compiling), completed here.
- [x] **Class is derived, never stored.** `classForWeapon` is the single
      function that answers "what am I", and skills, auto-attack range,
      damage attribute and mana pool all route through it. `HELLO` no longer
      carries a class and the login screen has no picker — it explains the
      rule instead. `fist` is a real weapon family, so an unarmed character
      is an Adventurer rather than a broken state with no skills and no reach
- [x] Eight weapon families (fist/sword/axe/mace/dagger/bow/staff/wand), each
      tuning its archetype's baseline with range/speed/damage multipliers —
      so two warrior weapons play differently (a fast sword against a slow
      axe that hits far harder), with the damage multiplier as roughly the
      inverse of the speed one so the choice is burst-vs-steady rather than
      one family simply winning
- [x] `weapons.png` rebuilt: 7 families x 3 rarities plus the goblin's axe,
      every cell bottom-aligned so one rotation tween reads as a swing. Each
      family declares where the hand closes on it
      (`WEAPON_GRIP_FROM_BOTTOM`) — the bow is gripped at its middle and the
      staff a third up, which is what stops them floating over the head
- [x] **Paperdoll rendering.** Players are no longer a baked sprite row per
      class per armour tier — they are `body.png` (naked, 8 frames) plus one
      `gear.png` layer per equipped visible slot. Layers do not run their own
      animations: they read whichever frame the body is currently on, so they
      cannot drift by a frame and detach. The body and every layer are
      generated from the same parametric skeleton at build time, so alignment
      is correct by construction rather than by hand-matched offsets
- [x] Six equipment slots (weapon/helm/armor/cape/boots/ring), four of them
      visible on the character. Style names which art a layer draws; rarity
      only tints it — so "plate vs robe" and "common vs epic" are independent,
      which the old baked rows could not express
- [x] The local player is a `Paperdoll` like everyone else, so there is one
      drawing path instead of a self-case and an others-case. Appearance goes
      over the wire on every snapshot, so equipping something is visible to
      other players with no dedicated message
- [x] `actors.png` rebuilt as monsters only (4 rows). Its 12 player rows were
      dead once the paperdoll existed, and leaving them would have left
      `ACTOR_ROW` computing monster rows from a class list it no longer has
      any business reading
- [x] **Helm and cape were rolling stats nothing read.** Both slots existed
      with roll tables, but no combat formula consumed them — equipping a helm
      did nothing. Fixed at the root: `gearArmor`/`gearEvasion`/
      `gearCritChance`/`gearMoveBonus`/`gearDamageBonus` in shared are now the
      only places contributions are summed, and the server's four combat sites
      plus the client's stat sheet all call them. Adding a slot is one line,
      once, instead of four edits nobody gets reminded about
- [x] Character sheet corrected while wiring it to those helpers: it computed
      the hit band from `strength` regardless of class (wrong for a ranger or
      mage, whose damage scales off agility/intelligence) and ignored the
      weapon's own speed and damage multipliers, so it quoted numbers the
      fight did not use
- [x] **Crafting is where changing class is deliberate.** The workbench gained
      a weapon-family picker, each button labelled with the class it would
      make you; the tier rows craft the selected family. Omitting the family
      means "the one I already wield", so upgrading never re-classes you by
      accident — the reason the server takes an explicit family rather than
      rolling one
- [x] **Bug fix (server, would not boot):** `insertCharacter` had 23
      placeholders for 22 columns after `characterClass` was dropped from the
      insert — every fresh start crashed on `db.prepare` before the socket
      opened
- [x] **Bug fix (client):** Intelligence was missing from the character
      panel's attribute list, so the mage's own primary attribute was the one
      stat no one could spend a point on
- [x] Verified by script over a real socket: crafted and equipped all five of
      sword/bow/staff/dagger/axe and watched the class follow the weapon
      (warrior/ranger/mage/ranger/warrior) with the mana pool tracking it
      (48/68/138), and equipped helm/cape/armor/boots to confirm each reaches
      the appearance layers other clients draw from. Both workspaces
      typecheck; all seven atlases serve 200. Paperdoll alignment and every
      weapon grip checked against a rendered composite of the real atlases —
      which is how the bow grip was caught planting the bottom limb below the
      character's feet.
- [x] **Confirmed in-browser 2026-08-18** (headless Playwright — no display is
      attached to this machine): a fresh character spawns naked at the
      workbench; crafting and equipping a common sword shows the blade in-hand
      on the naked body with the toast "Sword in hand — you fight as a
      Warrior", and the character panel's weapon slot reflects it. Wandered
      into a wolf and fought it live — hit/miss/crit combat log, target ring,
      in-combat indicator, floating damage text, and every world-object label
      (Wolf, Goblin, Rock, Herb Bush, Tree, Workbench) rendered correctly with
      zero browser console errors. No visual bugs found (the workbench in
      particular renders as the correct animated forge, not the Phase 38
      mis-tiled-flower regression)

## Phase 46 — Named: WieldBound
- [x] The project had no name of its own — it was still called after the game
      it was originally a study of, which stopped being accurate around Phase
      40 when the idle model was deleted outright
- [x] **WieldBound**, after the rule that actually distinguishes it: your
      class is derived from your equipped weapon, so you are bound by what you
      wield. Checked before committing to it — no Steam app, no itch.io page,
      no GitHub repo, no npm package, and wieldbound.com/.io/.net/.game/.gg
      all unregistered. Trademark registries (EUIPO/USPTO) were NOT checked;
      they need a manual search before any commercial release
- [x] Renamed: page title and login header, `package.json`/`package-lock.json`,
      the SQLite file (`idlekin.db` → `wieldbound.db`, existing characters
      migrated by renaming the file and its WAL/SHM siblings), README, this
      plan's title, the repo directory, and the GitHub remote
- [x] Deliberately NOT renamed: every reference to Idlekin in the phase log
      and decisions log below. Those describe what was actually being mirrored
      at the time — rewriting them would turn an accurate build record into a
      false one

## Phase 47 — Renderer rewrite: 2D Phaser → 3D Three.js
User asked for higher quality overall — "better models, animations and effects"
— and whether 2D could become 2.5D. Investigated properly rather than answering
from memory, and the investigation changed the answer twice.

**How the decision was reached (worth keeping, because the first two answers
were wrong):**
- First pass recommended staying 2D in a 3/4 perspective. The reasoning was
  sound as far as it went: the game already Y-depth-sorts with feet-on-position
  origins, so it *has* the 2.5D skeleton; what reads as flat is (a) characters
  only ever facing the camera via `flipX`, (b) no lighting whatsoever, (c) a
  ground plane with no elevation, (d) 8 frames per actor. None of those are
  fixed by changing projection.
- Phaser 3.90 turned out to ship far more than assumed — `Bloom`, `Bokeh`
  (tilt-shift), `Glow`, `Vignette`, `ColorMatrix`, `LightPipeline` — so the
  HD-2D *look* was partly reachable in-engine. Checked `node_modules` rather
  than trusting memory.
- The argument against 3D was the asset pipeline, not the renderer: PowerShell
  + `System.Drawing` is excellent at 16px pixel art and cannot produce models,
  rigs or hand-painted textures. The claim was that free 3D assets would look
  generic and mismatched.
- User asked whether assets could be sourced autonomously. **That is what
  overturned it.** Quaternius ships CC0 rigged+animated fantasy characters with
  direct download URLs, no login and no interactive flow — verified by actually
  downloading the pack, reading its `License.txt` (CC0 1.0) and parsing 16
  animation stacks out of `Warrior.fbx`, whose clip list (Idle / Walk / Run /
  Sword_Attack / RecieveHit / Death / Cast) is almost exactly this game's
  existing combat vocabulary
- Built a throwaway look-dev spike before committing anything
  (`scratchpad/spike3d`) — real assets, real rig, orbit camera, day/dusk/night,
  rolling terrain, live weapon swapping. User compared it against the running 2D
  game and chose 3D. **Deciding by eye on a working scene rather than by
  argument was the right call and should be repeated for changes this large**

**The finding that makes this fit WieldBound specifically:** the Quaternius rig
ships a dedicated `WeaponR` socket bone with the weapon already parented to it.
So "class is whatever you are holding" becomes one mesh swap on one bone, with
every rig animation carrying it for free — architecturally *cleaner* than the
2D grip-offset system built across Phases 39-45, not a regression from it.

- [x] **M1 — playable 3D client.** Three.js scene, terrain, camera follow,
      actors from `STATE_SNAPSHOT`, movement input, DOM panels intact.
      Verified in-browser: 23 monsters load, walked 630px to the wolf den, the
      wolf's server-side chase AI closed the rest, and a real fight ran —
      hits/misses/crits both ways, HP 60→47, wolf 22→13, floating damage,
      nameplates and HP bars. Both workspaces typecheck; no console errors.
      Notes from building it:
      - `client/src/three/{assets,Actor,World,hud,Game}.ts` replace
        `scenes/WorldScene.ts`. `net/socket.ts` and all six DOM panels were
        reused *without modification*, which is the clearest evidence the
        renderer really was the only coupled part
      - The HUD moved from canvas-drawn to DOM (unit frame, nameplates,
        floating combat text). It inherits the existing gold/parchment theme,
        needs no resize handling, and renders text crisply — the class of bug
        that produced Phase 38's tofu-glyph portrait is now unrepresentable
      - **Occlusion fading** had to be built: in 2D the player was always drawn
        over anything nearer the camera by Y-sorting, so a tree could never
        hide them. In 3D it genuinely does, and fighting inside a wood was
        fighting blind. Anything between camera and player now fades to 20%,
        with `depthWrite` off so the faded trunk does not punch a hole in what
        is behind it
      - Skinned meshes must be cloned with `SkeletonUtils.clone`, not
        `Object3D.clone` — the latter keeps pointing at the original skeleton,
        so every monster of a kind shares one pose
      - Nameplate projection needs a camera-space test before the perspective
        divide. `Vector3.project()` alone maps points *behind* the camera back
        into the viewport, mirrored, which pinned labels to the screen edges
      - Vite's watcher must ignore `public/models` and `public/textures`: on
        Windows it grabs a handle mid-write and kills the dev server with
        `EBUSY` whenever an asset is regenerated while it is running
      - Movement looked broken under headless SwiftShader (~70px/s against a
        stated 220). It is not: software rendering drops the frame rate and the
        `dt` clamp throttles the step. Worth remembering before chasing it
        again — verify movement against `__wieldbound` state, not by eye
- [x] **M1.5 — the real monster roster, and a world big enough to hold it.**
      User supplied the Drive-gated Quaternius Ultimate Monsters pack (50
      animated creatures, CC0), so the M1 stand-ins are gone.
      - **4 monster kinds → 13**, in five difficulty bands. Each has a role
        rather than a bigger stat line: `spikyblob` punishes standing in a
        cluster (death burst 13 in 110px), `armabee` outruns you at 215px/s and
        leaps but folds when caught, `ghost` answers *accuracy* not damage (38
        evasion — a low-Agility build simply cannot land on it), `golem` has 14
        armour so chip damage does nothing, `dragon` both telegraphs and closes
        the gap so neither standing nor running is a whole answer
      - **World 2200x1600 → 4800x3600.** The point is not size: difficulty is
        now laid out as *distance from spawn*, so walking further is the
        progression. Verified by walking a bot outward — HP fell 60 → 53 → 42
        → 30 → 19 across the bands without ever choosing to fight
      - Monster and node layout became polar (`ringPack`, `ringNodes`) rather
        than absolute coordinates. The old node list had been written against
        the 2200x1600 world and all of it bunched into one corner the moment
        the world grew; relative placement cannot go stale that way
      - **glTF added alongside FBX.** 2.7x smaller for the same model, texture
        embedded, and none of the FBX material/UV fixing needed. `name` carries
        the extension so both coexist
      - **Distance culling** for monsters: ~80 exist, and the server correctly
        sends all of them, but building 80 skinned meshes is another matter.
        Models are created within 1150px and torn down past 1550px — the gap is
        hysteresis, since a single threshold thrashes a whole camp in and out
        as the player walks the boundary. First tried 1500/2000, which rendered
        54 meshes while standing still at spawn
      - Deleted `scenes/WorldScene.ts` and dropped the `phaser` dependency. It
        was orphaned by M1 and only surfaced now because growing `MonsterKind`
        broke its exhaustive `Record<MonsterKind, ActorName>` — which is the
        Phase 29 exhaustiveness check doing its job one last time on the way out
- [x] **M2 — combat feedback, effects, sound and UI polish.** User: combat is
      "very clunky", "very buggy", wants animations and effects for everything
      and the UI working properly. Audited the M1 port against the server
      rather than guessing, and most of it was *missing wiring*, not broken
      logic — the server had been resolving all of this correctly the whole
      time and the client simply was not showing it.

      **Real bugs found and fixed:**
      - `Hotbar.update()` is documented "called every frame" and drives the
        cooldown curtains, but M1 only called it from `onManaUpdate` — so every
        cooldown was visually frozen at whatever it was when mana last changed.
        This is almost certainly the single biggest source of "clunky".
        Verified fixed by sampling the curtain as it drains: 92.7% → 77.7% →
        60.3% → 35.6% → 20.3% with the counter ticking down
      - Mobility skills (Dash / Charge / Disengage) consumed a cooldown and did
        *nothing*. They are resolved client-side by design — movement is
        already client-authoritative and the server only owns the cooldown —
        and M1 never implemented that half
      - The target frame never hid, so it sat on screen showing a dead
        monster's last known health indefinitely
      - Skill failures were silent. The server sends a real reason ("not enough
        mana", "nothing in range", "cooling down") and it was being dropped.
        Now toasted at the moment of the press. This immediately paid for
        itself — it is how a test that looked like "skills do not fire" turned
        out to be a bot standing out of range
      - Ally targeting was unimplemented, so Mend and War Cry could never
        benefit anyone else — the whole co-op mechanic from Phase 43
      - `MonsterState.windingUp` was ignored, so the troll/golem/dragon
        telegraph was invisible and those fights just looked unfairly hard
      - `MonsterState.slowed` was ignored, so Frost Nova had no visible effect

      **Added:**
      - Effects, reusing `fx.png` — the 14-school x 6-frame atlas built for the
        2D client — as camera-facing additive quads. The schools already match
        `SkillDef.effect` one-for-one, so adding a spell is still picking a row
        and a tint, which is the promise Phase 39 made. Verified all 14 render
      - Sound, reusing the 10 synthesised cues. Rate-limited per cue and pooled
        4-deep per sound, because auto-attack against a pack fires several
        results a second and one `Audio` element cuts itself off
      - Ground indicators: target ring (gold in reach, grey out of it), the
        player's own reach ring while fighting, and a pulsing danger circle
        covering exactly the area a telegraphed slam will hit
      - Hit flash and chill tint on actors, via emissive with the flash
        overriding the chill and then handing it back
      - Camera shake on crits, healing feedback (silent before — a potion
        looked identical to nothing happening), level-up burst
      - **Swings are a beat, not an instant.** The server reports the whole
        outcome at once; playing wind-up and impact on the same frame reads as
        a number popping out of nowhere. The animation and swing sound fire
        immediately, the hit lands 170ms later
      - Effects scale and sit at the target's *middle*, derived from the
        monster's height — a constant offset buried the burst in the ground on
        a 0.8-unit slime and put it at the ankles of a 3.4-unit dragon
      - UI: ready-glow on usable skills, bigger slots, target frame with real
        HP numbers and a separate status column, and nameplates suppressed
        behind the unit frame instead of drawing over the player's own health
- [x] **M3 — gear and class in 3D.** Equipping now changes what you look like,
      not just what your stat sheet says. Two axes, kept independent exactly as
      Phase 45's paperdoll kept them: **style picks the mesh, rarity only tints
      it**. And one axis the 2D game never had — **your class is your whole
      body**, not just your weapon.

      **The rest of the character pack turned out to be fetchable.** M1 shipped
      with only `Warrior.fbx`, but the textures for all six characters were
      already sitting in `public/textures/` — the models had simply never been
      downloaded. The pack is one zip from OpenGameArt, and all six share ONE
      skeleton: every bone within about a unit in three hundred of its
      counterpart on every other body. That single measured fact is what the
      milestone is built on, because it means one set of armour fits all four
      class bodies with no per-body fitting at all.

      - **Class is now a silhouette.** `CLASS_BODIES` maps the four classes to
        four rigs — adventurer→Monk, warrior→Warrior, ranger→Ranger,
        mage→Wizard — and `setAppearance` swaps the entire body mid-fight when
        the weapon changes. Pick up a staff and you are not a soldier holding a
        staff, you are a robed mage. The Monk is the right bare-handed body
        because it reads as "carries nothing" rather than as a disarmed soldier,
        which is precisely what Adventurer is meant to be
      - **Grips are harvested, never tuned.** Every body ships its own weapon
        already parented to `WeaponR` with the offset, rotation and scale the
        artist exported. So a weapon is lifted off its native rig *with its
        local transform*, rather than having those numbers copied into constants
        that can drift. Axe and mace, which the pack has no model for, are built
        procedurally inside the **sword's own geometry space**, so they inherit
        that same grip without introducing a constant of their own. All eight
        families verified in hand
      - **Armour is authored in rig coordinates.** Each piece is modelled in the
        space the rig measures in — feet at y=0, crown at y≈296 — and handed to
        a holder parented to its bone whose local matrix is that bone's rest
        pose *undone*. So a helm is written as "a dome at y=254, radius 40"
        instead of as an offset inside some bone's rotated local frame, and it
        still rides the head through every animation for free. The numbers came
        from measuring the rig's own vertices per bone, not from eyeballing
      - Ten styles across four visible slots, each a real silhouette rather than
        a recolour: plate has pauldrons on the arm bones and tassets at the hip,
        chain a mail skirt, robe a floor-length skirt hung from the *waist* bone
        (pinned to the ribs it rides up when you run), leather crossed straps,
        the great helm a visor slit, tall boots a shin cuff on the knee bone
      - **A contact-sheet preview page** at `/preview/`, the 3D descendant of the
        2D era's `preview_doll.ps1` and built for the same reason: alignment is
        what goes wrong with a paperdoll and alignment is invisible in a stat
        panel. It drives the real `Actor.setAppearance`, so a helm that sits on
        a character's chin there sits on their chin in the game. Its `?hidebody=1`
        flag earned its place immediately — see the decisions log

      **Four real bugs found on the way, two of them pre-existing:**
      - `SkeletonUtils.clone` reuses materials *by reference* (three's own docs
        say so, and `Mesh.copy` confirms it). So every actor built from one model
        shared one emissive channel: M2's hit flash on a single wolf flashed the
        entire pack, and chilling one slime tinted them all. Each actor now
        clones its materials on build. **Pre-existing, shipped in M2**
      - `Actor.dispose()` disposed geometry that `SkeletonUtils.clone` shares with
        the cached prototype — so every monster despawn past the cull radius
        freed the buffers of every future monster of that kind, forcing a GPU
        re-upload on each respawn. Geometry is owned by the model cache and is no
        longer disposed per actor. **Pre-existing, shipped in M1.5**
      - The attack clip was matched loosely, and a loose match for "Attack" finds
        `Idle_Attacking` on the Wizard and `Attacking_Idle` on the Rogue. A mage
        would have cast spells by standing still. Fixed by listing the
        class-specific names, since `findClip` tries every exact name first
      - A body swap rebuilt the action map but never restarted playback, leaving
        the character frozen in the bind pose — arms out sideways, weapon aimed
        at the horizon. It looked exactly like the weapon being attached wrong,
        and cost the most time of the four

      Verified: all six weapon families equipped in sequence against a live
      server, each swapping the body and re-attaching all ten armour meshes to
      the new rig with no accumulation and no console errors; a second client
      confirming a remote player renders fully geared while its own bare-handed
      body stays a Monk; flashing that remote leaving the local player's emissive
      at 0, which is the shared-material fix proving itself; a walk-in fight
      against a slime exchanging hits both ways with HP 60→41; `smoke.mjs` green
      across every weapon family and every visible slot; both workspaces
      typecheck clean.
- [x] **M3.5 — bodies occupy space, and nothing ice-skates.** User feedback,
      and both halves were real: you could walk into the middle of a troll and
      stand there, and characters slid around with the wrong animation playing.

      **Collision.** Nothing in the game had a size. Monsters kept a fixed 34px
      apart from *each other*, but a player was a point and could stand inside
      anything. Every creature now has a `bodyRadiusPx` sized to the model the
      client actually draws, and one shared `resolveBodyCollision` pushes bodies
      apart. Shared is the point: the client runs it while you move, so a wall
      feels like a wall instead of like lag, and the server re-runs it on the
      position it is told about, so a client that skipped it gains nothing. The
      `MOVE` handler previously assigned `msg.payload.x/y` with no checking at
      all — not even world bounds.
      - Monsters also stop at contact rather than at a pure reach fraction, and
        a chase step is clamped to the remaining gap so a leap cannot overshoot
        into the player
      - Monster separation now uses each pair's own radii, so a golem and a
        dragon no longer overlap while two slimes stand absurdly far apart
      - A second server pass pushes monsters out of *players*, because the
        separation pass is blind to them and could shove a body through one.
        The monster yields, never the player: displacing a player from the
        server would fight the client's authority and feel like being shoved by
        something invisible
      - The client re-resolves both per frame *and* on every snapshot. Only the
        first was there at first, and it left a visible overlap whenever a
        monster walked into a standing player between frames

      **Ice-skating, which was four separate faults:**
      - The local player was position-interpolated like everything else. Its
        position is recomputed exactly every frame, so the easing was pure lag:
        measured at ~5px mean and 9.6px peak under a slow frame rate, and about
        15px at 60fps — a whole body radius — decaying over ~250ms after you
        release the key. That decay *is* the glide. Now 0px, exactly, every frame
      - Attack one-shots blocked the run animation, so for the ~1s of every
        swing the model held a planted pose while the character kept travelling.
        Since auto-attacks fire while you move, this was most of the "sliding
        during combat". Running now cancels the swing; standing still still lets
        it play out
      - Run/idle for monsters and remote players was decided by comparing
        *rendered* positions, which are interpolated and therefore lag. They were
        told to idle while still visibly catching up. Now measured between
        consecutive server positions, with two thresholds instead of one because
        a single one chatters when a monster holds station at its stop distance
      - Monster separation could shove a monster sideways faster than its own
        top speed. Capped to what it could walk in the same tick

      Verified per rendered frame rather than by eye: 260 consecutive frames
      walking into a slime camp with zero frames overlapping and a settled
      distance of exactly the contact distance; player model lag max and mean
      both 0px against 9.6/4.8 before; 1 frame in 83 moving without the run
      animation and 4 in 419 monsters sliding while idle, both down from
      systematic. New `tools/test/bodies.mjs` asserts the two invariants that
      make collision safe — every weapon reaches past every body, and every
      monster reaches back — across all 13 kinds and all 8 weapon families, with
      a required 8px of slack. It caught fists-vs-dragon sitting at +4px, which
      is why the two largest bodies were trimmed. `smoke.mjs` and the M3
      appearance sweep both still pass; both workspaces typecheck.

- [x] **M3.6 — targeting you do not have to do, and skills you can always
      use.** Both from user feedback: picking a specific monster every fight
      felt strange, especially in a crowd, and the hotbar refused to work
      outside combat.

      **The targeting complaint turned out to be a feedback bug, not a controls
      one.** The server has always fought the nearest enemy for you whether or
      not you ever clicked — auto-attack falls back to nearest-in-reach, and so
      does every skill. The client simply drew nothing unless you clicked, so
      clicking *felt* mandatory when it never was. Targeting is now two things
      kept deliberately apart:
      - `engagedId` — what you are fighting this instant, derived every frame
        from the same rule the server swings by, and always drawn. Walk toward
        a camp and the ring appears on its own
      - `lockedId` — a deliberate choice, and the only thing a click changes.
        It gets its own outer ring, survives until it dies, and clicking it
        again releases it. The frame says "locked" so the distinction is legible

      The client tells the server its auto-pick (only when nothing is locked and
      no ally is selected, or co-op targeting would be clobbered), so the ring,
      the auto-attack and a single-target skill are guaranteed to agree.

      **Three real defects behind "strange when monsters are close together":**
      - Click picking returned the first monster in *map iteration order* whose
        mesh the ray hit, not the nearest one. With two bodies overlapping you
        could select the one behind. Now resolved by ray depth
      - There was no click tolerance at all. A slime is under a metre tall and
        renders perhaps twenty pixels across, so selecting one was a test of aim.
        A miss now falls back to the nearest silhouette within 42px
      - Tab cycled every monster with a model — about thirty across four camps,
        since models build out to 1150px — so reaching the one in front of you
        took a dozen presses. Scoped to the engage radius, and it starts from
        what you are fighting rather than from your last click

      Auto-targeting is sticky by 26px, which is not a detail: monster
      separation moves bodies every tick, so plain "nearest" hands the target
      back and forth between two enemies standing shoulder to shoulder. Measured
      at 0 changes across 50 samples standing beside a pack of four. A hover
      ring shows which of two overlapping bodies a click would take.

      **Skills no longer need a target.** Pressing one with nothing in range
      returned "nothing in range" and did nothing, which made the hotbar feel
      like it belonged to the monsters — you could not swing at the air, see
      what a spell looked like, or open a fight with your opener instead of
      walking into auto-attack range first. A skill now fires whenever the
      *caster* can afford it: off cooldown, enough mana, right class, unlocked.
      Whether it connects is a separate question and `hits: []` is a fine answer
      to it. Ground-targeted AoE with nothing to aim at lands at the caster's
      feet rather than being refused, and a shot that finds nothing still plays
      its effect along the caster's facing — otherwise a press with nothing in
      range looks identical to a press that was ignored. **The refusals that
      remain are all about the caster, never about the world.**

      That also fixed a plain bug: a mobility skill used while standing still
      with no enemy nearby had no direction to go, so it returned early — after
      the server had already charged the cooldown and the mana. It falls back to
      facing now, which is always defined.

      Verified: walked into a camp without clicking once and a target was
      acquired after 600ms, sent to the server, and fought — Cleave connected
      with no click anywhere in the run; 0 target changes standing in a pack;
      click locks, holds, and releases on a second click; Tab moves on; all five
      warrior skills fire at spawn with the nearest monster 550px away, none
      refused, and Charge visibly displaced the player 180px. Collision, ice-
      skating, body-rule and M3 appearance suites all still pass.

- [x] **M3.7 — every weapon family fights like itself.** User feedback: an
      auto-attack looked the same whatever you held. A ranger three hundred
      pixels away hit things with an invisible melee swing, a mage did the same
      with a stick, and both made the noise of a sword going through air.

      One table in `attacks.ts` now says how each of the eight families
      delivers a blow, and — this is the part that matters — **the same table
      decides when the blow lands**. A projectile's beat is its flight time over
      the real gap, so the damage number cannot appear before its own arrow
      does, at any range, rather than at the one range a constant happened to
      suit. Melee keeps a fixed beat, because a swing's timing belongs to the
      swing and not to the distance.
      - **bow** fires the pack's own `Ranger_Arrow` model, flown from the weapon
        socket to the target and pointed along its path. Measured 90ms at point
        blank rising to 200ms at 300px
      - **staff** throws a travelling arcane bolt — a moving `fx.png` quad, so
        it needed no new art, which is the promise Phase 39 made
      - **wand** fires a beam, as the user asked for: instant, thin, a white
        core inside a tinted glow, drawn between two points rather than at one.
        It is what makes the wand a sidearm beside the staff instead of a
        shorter copy of it
      - **melee** differs by weight rather than by kind: dagger 105ms and a
        small pale arc, sword 170ms, mace 215ms with a shockwave, axe 235ms and
        the heaviest burst of the five. Fists get their own small, weaponless
        impact
      - Two new synthesised cues, `bow` (a string snap over a falling twang)
        and `beam` (a vibrato zap), because a bow that goes *whoosh* like a
        sword was the loudest thing wrong with ranger combat. Re-running the
        generator reproduced the other ten byte for byte, which is the check
        that nothing else moved

      Projectiles leave the **weapon socket**, not the body, so an arrow comes
      off the bow rather than out of the archer's chest — and it keeps tracking
      through the draw, since the socket is a bone. The arrow is deliberately
      oversized with a warm trail: at this camera a player is about fifty pixels
      tall, so a correctly-scaled arrow is a two-pixel splinter and firing one
      is indistinguishable from firing nothing. Its long axis is found by
      measuring the bounding box rather than assumed, because the weapon FBXs in
      this pack disagree about which axis that is.

      Verified by instrumenting the real code path per family: sword/axe/dagger
      release `swing` and spawn nothing; bow releases `bow` and spawned 4
      arrows; staff releases `cast` and spawned 5 travelling bolts; wand
      releases `beam` and spawned 9 beams; mace releases `swing`. The beat
      table was checked across four distances per family, and both an arrow
      mid-flight and a beam were screenshotted to confirm orientation and
      readability. Collision, ice-skating, targeting, skill-freedom, body-rule,
      M3 appearance and smoke suites all still pass.

- [x] **M3.8 — the default attack is a real action, and combat is something
      you start.** Two pieces of user feedback that turned out to be one
      change: the basic attack should be a slot on the bar like any other, and
      the character should not attack anything just because it walked near it.

      **Combat no longer starts itself.** Since Phase 40 the server decided
      what a player was doing from where they stood, and proximity was an
      instruction to draw a weapon — the last piece of idle-era reasoning left
      in the game. An attack order is now something you give, by pressing the
      default attack or any offensive skill, and it stands on its own
      afterwards so a fight needs no keypress per swing or per corpse. It lapses
      two seconds after nothing has been in reach.
      - **The two seconds are load-bearing.** The window has to outlast the gaps
        *inside* a fight — a target dying while you pick the next, chasing
        something that fled — without outlasting the walk *between* fights. The
        first attempt used four, and the test caught it re-engaging on arrival
        at the next camp, which is the exact thing an attack order exists to
        prevent
      - Heals, buffs and dashes deliberately do not give the order. Mending an
        ally or dashing away from something is not an instruction to fight it
      - Dying cancels the order, so you respawn standing rather than mid-fight

      **The default attack is a bar slot, per weapon.** `DEFAULT_ATTACKS` is
      keyed by weapon rather than class, because a bow and a dagger are both a
      ranger's and have nothing in common — Slash, Hew, Crush, Stab, Shoot,
      Arcane Blast, Zap and Jab. It sits in slot 1 with the skills after it, and
      pressing it does something waiting does not: an undefined swing clock
      means "just closed", and the press cashes that in immediately instead of
      eating the closing wind-up. Opening a fight is an action, not a pause.
      Deliberately exempt from the global cooldown — auto-attacks never were,
      and putting the manual press under it would make pressing your own attack
      worse than not pressing it.

      **Combat enhancements that came with it:**
      - **Weapon speed is finally visible.** The attack slot's curtain is the
        swing timer, so dagger 330ms, wand 385ms, sword/bow/staff 550ms, mace
        660ms and axe 743ms are readable at a glance. The 0.6x–1.35x speed
        multipliers have existed since Phase 45 and nothing on screen had ever
        counted them. Sent on equip and on connect too, not just after the first
        blow — telling an axe from a dagger should not require hitting something
      - **A lit border on the attack slot says an order is standing**, plus
        "You engage" / "You break off" in the log. With combat no longer
        starting itself, "am I actually fighting?" has to be answerable
      - **A wind-up bar on the target frame.** The danger circle already said
        WHERE a telegraphed slam would land; this says WHEN, which is the half
        you need to judge whether there is time to walk out. Troll 900ms, dragon
        950ms, golem 1100ms

      Verified: stood beside a monster for six seconds pressing nothing and
      landed zero blows; pressing 1 opened the fight and landed four; pressing a
      *skill* opened it equally well; retreating to open ground lapsed the order;
      all seven craftable families show their own attack name, icon and swing
      interval; every weapon's delivery still fires once ordered. Collision,
      ice-skating, targeting, skill-freedom, body-rule, M3 appearance and smoke
      suites all still pass.

- [x] **M3.9 — a talent tree per weapon.** The biggest change since the
      renderer rewrite, and it replaces the class skill system outright.
      Started as a question about off-hand weapons and became something better:
      one weapon at a time, and *using* a weapon is what levels that weapon.

      **Two progressions that answer different questions.** Character level is
      WHO YOU ARE — hit points and stat points, following you across every
      weapon. Weapon proficiency is WHAT YOU CAN DO WITH THIS THING — talent
      points in that weapon's tree and nothing else's. Proficiency is earned
      only while the weapon is in hand, so it accumulates exactly where the
      playing happened, and picking up a staff for the first time really does
      mean starting that tree at zero. That is what makes "you are whatever
      you're holding" a commitment rather than a costume change.

      **Nothing unlocks itself any more.** Skills used to appear on the bar by
      character level; now every one of them is a node you buy. `unlockLevel`
      and `classId` are gone from `SkillDef` entirely, and the seven passive
      `SkillDef`s are gone with them — a skill is something you press, and a
      passive is a talent rank.

      - **Eight trees, 73 nodes, 27 skills.** Keyed by weapon rather than by
        class, because three warrior weapons sharing one spell list made an axe
        a sword with different numbers. The axe tree is heavy single blows and
        crit damage; the mace tree is armour, control and staying power; both
        are still "a warrior" because the weapon still decides the archetype.
        Eleven new skills were written to fill them out
      - **A node is data** — a name, a rank cap, and either one `SkillId` or a
        bag of `PassiveBonus`. Seventy-odd nodes only stays maintainable if
        rebalancing means editing numbers rather than behaviour, which is also
        why actives are single-rank
      - `PassiveBonus` grew from 7 knobs to 16, and all nine new ones are
        threaded into the shared formulas — damage, attack speed, crit damage,
        reach, skill power, mana cost, cooldowns, max HP, accuracy. A tree full
        of percentages that never reached the maths would be decoration
      - **Stat points now come with advice.** Which attributes a weapon wants
        genuinely changes with the weapon, since that is what decides which one
        multiplies your damage — so the character panel stars the primary, dims
        the two that barely matter, and says why in a sentence
      - Free unlimited respec per weapon. A tree you cannot experiment with is
        a tree you read a guide for

      **The test caught a real design failure.** `tools/test/talents.mjs`
      asserts, among other things, that a tree cannot fit inside its own point
      budget — and the first draft did, every one of them: 19-20 ranks against
      20 points at the cap, so you would simply buy everything and never
      choose, which is precisely what the feature was for. Passive rank caps
      went up by two across the board; trees now run 29-31 ranks against 20
      points, so a finished weapon has about two thirds of its tree and which
      two thirds is the build. The same test checks every granted skill exists,
      every prerequisite is in the same tree and in an earlier tier, no node is
      inert, no skill is stranded outside every tree, and each tree can
      actually be walked from level 1 to the cap without the points getting
      stuck.

      Two narrow SQLite tables rather than columns: both are keyed by
      (character, weapon) and one additionally by node, which a wide row cannot
      hold without becoming JSON — and an absent row is the honest way to say
      "never touched that weapon".

      Verified live: a fresh character starts with one point, an empty tree and
      a bar holding nothing but its default attack; buying `fist.haymaker`
      puts a second slot on the bar; a second purchase with no points is
      refused by the server, as is a tier-4 node at proficiency 1. Fighting
      with a sword took the sword from 0 to 104 xp and proficiency 1 to 3 while
      the axe tree stayed at zero. Keen Edge moved the sheet's damage 16-50 to
      17-52, Tempered moved armour 2 to 4, Precision moved crit 35% to 38%.
      Refund returns the points. Stat advice follows the weapon: sword stars
      Strength, staff stars Intelligence. Every earlier suite still passes.

- [x] **M3.10 — a real RPG interface.** User: make it a regular MMORPG UI,
      remove what is unnecessary, add what is missing, and let the player own
      the action bar.

      **The action bar belongs to the player now.** It used to be generated —
      every unlocked skill in tree order, keys assigned by position — so there
      was no such thing as *your* layout, and learning a talent could shuffle
      everything one slot to the right and retrain your hands for you. Ten
      slots, and only the player changes them: drag a learned skill out of the
      talent panel, drag slots to reorder, right-click to clear, click a key
      label to rebind to any key. Stored per weapon and per character, because
      the skills are per weapon — a bar that survived a weapon swap would be
      full of things you cannot cast.
      - Cooldowns are keyed by ACTION rather than by slot, so moving a skill
        mid-fight does not reset the cooldown it is already on
      - The rebind listener captures, so the key being bound cannot also fire
        the action it is being bound to on the way past
      - `normalizeHotbar` runs on both sides and repairs anything: wrong
        length, unknown skill ids, duplicate keys, the same skill in two slots
      - A weapon with no stored layout gets a suggested one rather than an
        empty bar, and every layout is pruned of skills the player has since
        refunded, so a talent reset cannot leave a dead button behind

      **Character window: a paperdoll.** Equipment down both sides of a figure
      that shows what you are, what you hold and how far into that weapon you
      are; attributes and statistics behind tabs. The old version stacked six
      labelled boxes, twelve statistics and four attribute rows into one
      column, so the question the window exists to answer — what am I wearing,
      is this an upgrade — competed for space with numbers you read once.
      Empty slots show a ghosted glyph of what belongs there, which teaches the
      layout without a label under every box.

      **Inventory: a real bag.** All thirty slots are drawn whether or not they
      hold anything, so the third slot is always the third slot — the old grid
      drew only the cards it had and reflowed every time anything was looted,
      moving items under the cursor. Materials and consumables moved to a
      footer, since they are counters rather than objects competing with gear
      for grid space. The nine filter tabs are gone: they existed to manage a
      mess that a fixed grid and one Sort button do not have.

      **Removed:** nine inventory filter tabs, the emoji silhouette, the
      labelled equipment boxes, two competing header styles. **Added:** one
      shared window chrome across all five panels, rarity-coloured slot borders
      everywhere, item tooltips on the paperdoll as well as the bag, per-
      attribute worth labels (primary / useful / situational / wasted), a
      capacity readout, and a sell button that carries its own price so the
      only irreversible action in the window never shares a gesture with
      equipping.

      Verified: drag from the talent panel onto slot 3 and drag slot 3 onto
      slot 7, both through the real DOM drag events; rebinding slot 5 to `q`
      and `skillForKey("q")` returning the skill; the whole layout surviving a
      reconnect; right-click clearing. Screenshotted both windows. Collision,
      engagement, targeting, ice-skating, appearance, talent-tree, body-rule
      and smoke suites all still pass.

- [x] **M3.11 — windows that behave like an MMO's.** User: put the icons and
      the windows on the right, let the bag and the character sheet be open at
      once without colliding, some panels are the wrong size, the icons do
      nothing, and the character window looks plain.

      **The dock icons genuinely did nothing.** The markup has been there since
      the 2D client; the Three.js port in M1 carried it across and left its
      listeners behind, so all four buttons had been decorative for eleven
      milestones. Wired now, and lit while their window is open, however it was
      opened.

      **A window rail instead of five full-screen overlays.** Each panel used
      to be centred inside its own dimming backdrop, so two could never be
      usefully open — they stacked in the same place — and every one of them
      hid the game. They now live in one right-anchored rail and lay out
      right-to-left as they open, so the bag sits beside the character sheet
      and you can see what you are equipping.
      - The rail stops short of the left edge, so it can never reach the player
        and target unit frames
      - All four together are wider than any screen, so opening one that will
        not fit closes the oldest rather than pushing a panel off the edge with
        no way back
      - The target frame moved under the player's own frame. Centre-top is
        exactly where the rail reaches with two windows open, and stacking them
        also puts the two health bars you are comparing next to each other

      **The wrong sizes were real.** Panels had a `max-height` and no
      `overflow`, so anything taller was simply cut off — which is why the
      character window's tabs were half missing. Every panel now scrolls its
      body inside a fixed frame, verified per window: all four fit the rail,
      sit on screen, and scroll rather than clip.

      **The character window stopped looking like a form.** A framed portrait
      with a lit bevel, a vignette and a shaft of light; a name plate carrying
      the weapon, its proficiency and a single Gear number summed from the
      rolls combat actually reads; bevelled equipment slots whose border AND
      glow carry the rarity, driven from one `currentColor` assignment. All
      five panels share one window chrome.

      Verified: clicking each dock icon opens and lights it; character and bag
      side by side with measured boxes proving no overlap; opening a fourth
      window evicting the oldest and leaving everything on screen; the bar
      layout surviving a reconnect. Collision, targeting, ice-skating,
      engagement, bar customisation, drag-and-drop, appearance, talent, body
      and smoke suites all still pass.

      One test bug worth remembering: the bar-persistence test appeared to fail
      after this change, and had not — it logged back in under a hardcoded
      different character name after its reload, so it was reading someone
      else's bar. Server and client were both correct the whole time.

- [x] **M4.1 — an interface drawn with icons, and a camera close enough to see
      what you are wearing.** The two things the user named as the biggest
      remaining visual weaknesses, and they turned out to be independent of each
      other: what the interface is drawn WITH, and how far away the world is.

      **Every emoji is gone.** 120 icons from game-icons.net, baked into one
      generated module by `tools/art/icons.mjs`. Emoji were never really art —
      they are a font, so they rendered as somebody else's drawings at somebody
      else's weight, in full colour that fought the gold-and-leather skin, and
      differently on every machine. Each icon is now a single 512-unit path with
      no fill of its own, which is the whole trick: it takes `currentColor`, so
      the same glyph is gold on the action bar, grey and faded in an empty slot,
      and rarity-coloured in the bag without any of those needing a copy. The
      rarity assignment that already lit a slot's border now lights its icon too,
      for free.
      - **Sized in `em`, so the swap needed almost no new CSS.** Every container
        already declared a font-size back when these were emoji, and `1em` means
        a rule saying "22px" still produces a 22px icon. Nine containers needed a
        colour and a `display`; nothing needed re-measuring
      - The shared tables now carry an icon KEY rather than a glyph —
        `icon: "cleave"` instead of `icon: "🗡️"` — so `shared/` names the
        picture and the client owns the drawing, which is the same split the file
        already keeps for everything else
      - Static markup names its icons with `data-icon` and is hydrated at boot,
        so `index.html` carries no path data and a re-map is a change in one
        generated file
      - The leaderboard's top three get three different podiums rather than one
        icon recoloured, so place survives being read by shape alone

      **The camera came in from 14.5 units to 9, and the wheel now owns it.**
      Measured rather than eyeballed: one world unit was 52.8 screen pixels and
      is now 83.1, so everything is 1.57x larger by default, and the wheel spans
      5 to 22 — a 4.4x range. Three details that matter more than the number:
      - **Only the distance changes, never the pitch.** A view that flattened
        toward top-down as it pulled back would change what a telegraph circle
        and a body's footprint look like, and both are things the player reads
        positionally. The camera slides along one fixed direction
      - **The notch is multiplicative.** A fixed step is imperceptible when far
        out and violent when close in; 1.12x per notch feels the same everywhere
      - **The shadow frustum follows the zoom.** It was pinned at a fixed extent
        sized for the old wide framing, so most of a 2048px shadow map was spent
        on ground that was off screen — which is a large part of why armour read
        as a soft blob up close. It now covers what the camera can see and no more
      - Bound to the canvas, not the window, so scrolling the talent tree or the
        bag moves that list instead of hauling the camera around behind it. The
        chosen distance is remembered

      **Two tests, and the first one paid for itself immediately.**
      `tools/art/icons.mjs` validates every name against the real game-icons
      index before it fetches anything — 36 of my 116 names were wrong, almost
      all of them the right icon under the wrong author, and it printed the
      correct path for each. `tools/test/icons.mjs` then asserts that every key
      the game names exists in the baked set, which is the failure that is
      otherwise completely silent: a mistyped icon renders as nothing at all.

      Verified in a real browser rather than by typecheck: each window opened
      one at a time (the rail evicts, so counting once with all four open
      undercounts), every icon on screen measured for a non-zero box, zero emoji
      left anywhere in the DOM, every `data-icon` hydrated, no page errors. The
      camera checks drive the real wheel: zooming in grows the body 159px to
      279px, both clamps hold at exactly 5 and 22, the choice reaches
      localStorage, and scrolling over an open panel moves the camera by 0.00
      units. Both workspaces typecheck; body, talent and smoke suites still pass.

- [x] **M4.2 — a world with ground in it.** The field was one flat green plane
      and a ring of trees standing outside it. Everything below is CC0 and, for
      the first time on this project, all of it fetched programmatically — the
      Stylized Nature MegaKit is a single zip from OpenGameArt rather than the
      Google Drive folder the monsters pack came from.

      **The ground is a real surface.** Poly Haven grass and dirt at 1k, tiled
      every 6 units, with two things happening in the shader that matter more
      than the textures do:
      - **Dirt is mixed in under a low-frequency noise**, so the field has worn
        patches whose shape has nothing to do with the tile grid. Sampled at a
        deliberately incommensurate scale from the grass, because at the same
        one the two line up and the blend reads as a single texture changing
        colour rather than as two surfaces
      - **A much lower-frequency tint multiplies the albedo**, drifting colour
        over tens of metres. This is what actually defeats tiling: the repeat is
        still there, but no two tiles are the same colour. Buying a bigger source
        texture would not have helped, because the eye is picking up the PERIOD
      - One "arm" image carries ambient occlusion, roughness and metalness in
        its R, G and B, and three reads exactly those channels — so one 200 KB
        download does the work of three maps

      **4,800 plants, instanced.** Grass, clover, ferns, flowers, mushrooms and
      pebbles across the whole play area. A tuft is forty triangles, so the
      triangles were never the problem — two thousand Object3Ds is two thousand
      draw calls and it does not matter how small each is.
      - **Nothing in the scatter list is a tree, a boulder or a bush**, because
        those three ARE the harvestable nodes. The Phase 47 rule that kept the
        treeline outside the play bounds, applied to the inside: decor that can
        be mistaken for a resource node is worse than no decor
      - Split into chunks so the frustum test can reject some of it. Measured
        across 22/32/44-unit chunks the totals ran 289 calls / 718k triangles to
        195 calls / 1.06M — a real difference but not the order of magnitude
        culling usually buys, and the reason is worth recording: the play area is
        120x90 units and the camera looks across it at a shallow angle, so most
        of the field is genuinely on screen
      - Sizes normalise to the model's LARGEST dimension, not its height. The
        obvious choice was height and it was wrong: a flower clump and a pebble
        are far wider than they are tall, so pinning their height to 0.2 gave
        them a metre of spread. That shipped, and looked exactly as bad as it
        sounds, before the first screenshot caught it

      **The nodes themselves stopped being placeholders.** Rock and bush had been
      a bare dodecahedron and icosahedron since M1 — fine until everything around
      them had real art. All three kinds now pick a model by a hash of their
      server id, so each looks like itself and every player sees the same one.

- [x] **M4.3 — the world has an hour.** A full day in twenty-four real minutes,
      so one game hour is one real minute.

      **The clock is derived, not sent.** It lives in `shared/protocol-types.ts`
      and is computed from wall-clock time, so every client agrees by
      construction and the protocol did not grow a field. Nothing about it needs
      to be authoritative — it drives light and colour, not damage — and a
      message carrying it is a message that can be missed or arrive late.
      - Eight keyframes from midnight through sunrise, noon and dusk, each
        carrying sky, light colour and intensity, hemisphere fill, star alpha and
        exposure. A table rather than formulas per channel, because colour
        grading is judged by eye and "make dusk more purple" should be one hex
        value rather than tracing which cosine feeds the blue channel
      - **One directional light for the whole cycle, on one continuous arc.** The
        astronomically correct version — sun by day, moon opposite by night — was
        the first attempt and it is visibly wrong: the moon rises exactly as the
        sun sets, so the light teleports across the sky at both crossings and
        every shadow in the world flips end for end in one frame. Measured going
        from x=-0.90 to x=+0.91 across sunrise. The fix floors the elevation
        instead, and a sweep of 240 samples now shows a worst step of 3.5 degrees
      - A seeded star dome, centred on the viewer so it reads as sky, and a
        steering keyframe at dawn because interpolating navy straight into
        sunrise orange runs the sky through a measured #9d6c5f mud for a full
        minute — the midpoint of two opposed hues is grey
      - The hour, its name and a sun or moon sit on the unit frame. The icon is
        only rewritten when it changes, rather than sixty times a second

- [x] **M4.4 — every skill looks like itself.** All twenty-seven drew the same
      thing: one camera-facing quad from `fx.png`, differing only in atlas row
      and tint. Enough to say something happened, not what.

      The same move M3.7 made for weapon attacks, one layer up — **one table says
      how each skill is delivered** — except the shapes are real geometry, because
      what a flat quad cannot express is exactly what distinguishes these skills.
      A ring expanding outward along the ground is a shockwave; a quad scaling up
      is a flash.
      - Six shapes: **nova** (a ring racing outward), **ground** (a disc that
        lingers), **cone** (a wedge on the facing), **pillar** (light from the
        feet), **rain** (staggered falling streaks) and **chain** (segments
        hopping target to target, which is what the skill does — bolts drawn to
        each target from the caster would show a fan, and it is not one)
      - Placement follows the skill's OWN numbers — `radiusPx`, `rangePx` — so a
        rebalance that widens a radius widens the effect drawn for it
      - Brief point lights on the skills that should look hot, which is worth far
        more now that there is a night to cast them in
      - `SKILL_FX` is `Record<SkillId, FxSpec>`, so the compiler already
        guarantees every skill has one. That is a stronger check than any test
        could run, and it is why there is no test for it

      **One real bug, caught by looking.** The fade in `update` wrote
      `material.opacity` every frame and used a flat 1 during the hold, silently
      discarding the opacity every shape had just chosen. Additive blending at
      full opacity saturates, so a frost nova and a cleave both came out white.
      Every shape now holds at its own peak.

      Verified: 27 skills across 7 distinct shapes; a real cast driven through
      the server (learn `fist.haymaker`, press it) producing its cone; all six
      primitives building geometry and every one of them reaped afterwards; no
      page errors. The mid-flight "is it still alive at t+200ms" assertion was
      deliberately removed — under SwiftShader a frame can take hundreds of
      milliseconds, so that measures the harness rather than the game.

- [x] **M4.5 — a minimap, a real smithy, and a tooltip that stops shoving the
      page.** All three from user feedback.

      **The tooltip bug was a missing stylesheet, not a missing rule.**
      `#item-tooltip` had NO css at all — so it was a plain block in normal
      flow, and showing it inserted a real box into the document and reflowed
      everything below. The `left`/`top` the script set on every mousemove did
      nothing, because static elements ignore them. The markup has been there
      since the Phaser client and the CSS did not survive the M1 port — exactly
      the same failure as the dock buttons losing their listeners, and just as
      invisible to a typecheck. It is `position: fixed` now, with
      `pointer-events: none` so it can never intercept the click on the thing it
      describes, and it flips to the other side of the cursor near an edge —
      which matters because the bag lives in a right-anchored rail, so the items
      whose tooltips you most want are the ones nearest the edge it would
      overflow.

      **The workbench is a smithy.** It was a grey box with a point light beside
      it — the last M1 placeholder on screen, and the one fixed landmark in the
      world, since spawn is there and the difficulty bands radiate from it. Six
      pieces from Quaternius's CC0 Fantasy Props MegaKit (an anvil on a stump, a
      bench, a weapon stand, a barrel, a crate, a whetstone), laid out by hand
      because a random arrangement of a bench and a barrel reads as debris, and
      with nothing at the origin so a character cannot spawn inside the anvil.
      The forge fire flickers on two sine waves at unrelated frequencies —
      random flicker is what everyone reaches for and it reads as a faulty lamp,
      because real flame varies smoothly.

      **Model loading is parallel now, and that was a real bug.** Two of the six
      pieces were missing, with no error: the loop awaited each model in turn,
      and these six queue behind the forty-odd the ground cover fetches at the
      same time, so the smithy took **24 seconds** to finish assembling itself.
      Nothing depended on anything else, so the serialisation bought nothing.
      `Promise.all` for both the station and the ground cover took it to **4.6
      seconds**. The catch that hid it now logs.

      **A minimap, top right.** Canvas, fed a plain snapshot once a frame, and
      renderer-agnostic like the rest of `ui/` — it would survive another
      renderer swap the way the DOM panels survived the last one. Shows resource
      nodes by kind, monsters (brighter and ringed for what you are fighting,
      a white ring for what you locked), other players, the workbench, the world
      boundary, and a heading arrow.
      - **Everything is a persisted setting**, because a minimap is a thing
        people have habits about: circle or square, four sizes, zoom from 14 to
        180 units by button or wheel, rotate-with-facing on or off, and a toggle
        per layer plus grid, coordinates and opacity
      - The grid spacing adapts to the zoom, so it stays a readable handful of
        lines instead of a wash when zoomed out
      - The wheel over the map stops propagating, or it would zoom the camera
        behind it as well
      - **The window rail yields to it.** The map writes its own height into a
        `--minimap-bottom` custom property and the rail starts there, so the two
        cannot overlap however large the player makes the map — and the rail
        does not have to know the minimap exists. At XL the map is tall enough
        to reach where the rail used to begin, so a fixed top would have put a
        window straight over it

      Verified: 21 checks through the real DOM — position clear of the dock,
      both zoom clamps exact, a layer toggle measurably changing what is drawn,
      shape and size switching, every setting surviving a reload and being
      re-applied, reset restoring defaults, and the rail starting below the map
      with an open window proven not to overlap it. Plus the tooltip suite:
      nothing in the layout moves when one appears, and it stays on screen at
      all three corners.

- [x] **M4.6 — nameplates that say what kind of thing they name.** Every label
      in the world was the same thing: yellow monospace text with an optional
      red bar. A tree, a boss and another player were typographically identical,
      so a populated field read as a wall of identical labels.

      **Four treatments, deliberately not alike.** The hierarchy is the whole
      point: an ordinary monster is bare text and a bar, an **elite** gets a
      real framed plate, a **resource node** is a small dim pill, and the
      **workbench** is a gold banner. Framing everything equally is exactly what
      turns a camp into a wall of boxes — so only bosses get a frame, and the
      thing that decides which are bosses is `guaranteedDrop`, already in the
      table, rather than a second list to keep in step.

      **Difficulty is now data.** `MonsterStats.band` (1-5) replaces what had
      only ever been a comment above the `MonsterKind` union — the one fact
      deciding where a monster is placed and how dangerous it is could not be
      read by anything. The plate colours the name by it, so what you are
      walking into arrives before it is on top of you: pale grey through green,
      yellow and orange to red.

      - **A damage ghost.** A pale bar holds the previous health for a moment and
        then drains to the new value, so a hit reads as a chunk taken rather than
        as a bar that is simply shorter than it was. It only ever falls — healing
        should not leave a pale trail behind it
      - **The telegraph moved onto the plate.** The target frame already showed
        the wind-up; putting it over the monster's head puts it where the player
        is already looking, which is at the thing about to hit them
      - **Distance scales and fades them, and sets their stacking order.** Thirty
        labels at identical size all overlapping tells you nothing about which is
        near — scaling restores the depth cue the projection threw away, and
        z-index from distance stops two overlapping plates stacking in map order
      - Engaged gets a warm glow and locked gets hard brackets, which is the same
        split the target rings already make in the world: one is derived every
        frame, the other is a deliberate click
      - Remote players' plates carry their real class glyph, taken from the same
        `Appearance` their body is dressed from, so the icon and the rig cannot
        disagree
      - Quarter ticks on the health bar are a repeating gradient, so they cost no
        elements; the class list is built as one string and written only when it
        changes, since this runs for every plate every frame

      Verified with 14 checks: the four kinds distinct, band colours measurably
      apart, a border on elites and none on ordinary monsters, a plate at 55
      units rendering at 7.8px against 11px at 8 units and sorting behind it, the
      telegraph bar appearing only while winding up, the ghost holding 100% while
      the fill drops to 40% and then draining, and — through the real game rather
      than injected specs — four monster plates all carrying a band and the one
      being fought carrying `engaged`.

      **One environment trap worth recording**, which cost the most time here:
      the band data was correct in `shared/` and the client was serving a stale
      copy of the module, so every plate came through with `band: undefined` and
      no colour. Vite had cached it across the many HMR reloads of that session.
      Restarting the dev server fixed it — the same lesson as the `public/`
      404s, one layer up.

- [x] **M4.7 — the unit frames, and a layout bug I had shipped.** User
      screenshot: the target frame was drawing over the player frame's clock
      row, and both looked plain beside everything else.

      **The overlap was mine, from M4.3.** `#target-frame` carried a hardcoded
      `top: 122px`, correct for as long as the player frame was 108px tall —
      and the world clock added a row. A fixed offset against a neighbour whose
      height can change is a bug with a timer on it. The frame now measures
      itself and publishes `--unit-frame-bottom`; the target frame starts from
      there. Third use of that pattern now, after the minimap and the window
      rail, and it is the one that should have been used first.
      - `HUD_FRAME_RECT`, the zone where nameplates are suppressed so they
        cannot draw over your own health, was hardcoded `{ w: 300, h: 130 }` for
        the same reason and had the same rot. It is measured now, and it grows
        and shrinks as the target frame appears
      - Only the CSS write is guarded by "has the height changed"; the exclusion
        zone is recomputed every call, because the target frame comes and goes
        without the player frame's height moving at all

      **Both frames rebuilt as a matched pair**, in the character window's
      language — a lit bevel, a vignette behind the portrait, a keyline inset
      from the edge. Stacking them was already deliberate (the two health bars
      you compare mid-fight end up next to each other); making them look
      related is what finishes that thought.
      - A **portrait** on each: the player's is the class their weapon implies,
        the target's is the monster's own creature glyph. Thirteen real
        portraits rather than four category icons, because the portrait is the
        largest thing in the frame and a hood standing in for a slime reads as
        a person you are about to fight
      - The **level moved onto the portrait's corner** as a badge. It is an
        attribute of who you are, not another number in the stack
      - One bar shape for all four — near-black trough, gradient fill with a lit
        top edge, quarter ticks as a repeating gradient so they cost no
        elements. Only the colour differs, which is what makes three stacked
        bars read as one instrument rather than three widgets. XP is thinner and
        quieter, since it is the one you are not watching mid-fight
      - The target's **portrait and name tint to the difficulty band**, and a
        boss gets the bright border — driven by `guaranteedDrop`, the same flag
        that promotes its nameplate, so the two cannot disagree
      - Its health value moved onto the bar rather than under it; a third line
        of text for a number read at a glance was the tallest part of the frame

      Verified with 15 checks, and the one that matters is measured twice: the
      gap between the frames at their natural size, and again after forcing the
      player frame 40px taller — because a fix that only works at today's height
      is the same bug with a new number. Also that the exclusion zone covers
      both frames with zero nameplates inside, that an elite's border really
      does differ, and that the CSS variable equals the measured height plus its
      offsets.

- [ ] **M4.8 — remaining polish**

**Survives the rewrite untouched:** `server/` entirely, `shared/protocol-types.ts`
(every formula and the whole wire format), `client/src/net/socket.ts` (verified
renderer-agnostic), and all six DOM panels (inventory, character, craft, skills,
leaderboard, combat log).

**Gets rebuilt:** `client/src/scenes/WorldScene.ts` (2057 lines) and the
Phaser-drawn HUD — unit frame, hotbar, floating text, target frame — which move
to DOM, where the rest of this game's UI already lives and where text renders
crisply instead of as canvas glyphs.

**Known asset gaps at the time of the decision:** fully-animated CC0 wolf,
goblin and troll are NOT available by direct link. Quaternius's Ultimate
Monsters pack (50 animated creatures, CC0, glTF included) is exactly right but
is served from a Google Drive folder, which cannot be fetched programmatically —
it needs one manual download. Until then the four monster kinds render with
stand-ins from the packs that did fetch cleanly (slime is a genuine match;
skeleton, dragon and bat stand in for the rest).

## Phase 48+ — Revisit and pick from here
Candidates, in no fixed order: mana as a resource on top of skill
cooldowns, telegraphed boss attacks you can step out of, more skills
(the `lightning` and `bolt` effect rows are still unused), guilds,
real auth (password), going live (VPS + hosted DB), directional (4-way)
character art so facing reads on the Y axis too, ambient world audio and
music, player-facing damage-type/resistances, more crafting recipes
(higher rarities), multiple crafting stations. Not committing to order yet.

---

## Decisions log
(append here as we make non-obvious calls, so we don't relitigate them)

- Class is derived from the equipped weapon on every read rather than cached
  anywhere on the client. A cached copy would have to be invalidated on
  equip, and the failure mode of missing one is the hotbar showing a mage's
  spells while the body swings as a warrior. Reading it back out of the
  weapon makes that state unrepresentable.
- Gear layers are slaved to the body's current frame instead of each playing
  its own copy of the same animation. Four independent animations of the
  same length will stay in step almost always, and the "almost" is a shirt
  visibly detached from its wearer. Reading the body's frame is exact by
  construction, and costs one frame lookup per layer per tick.
- The naked body and every gear layer are generated from one parametric
  skeleton at build time. Authoring gear against borrowed sprites means
  matching their irregular per-frame bob by hand for every piece — fragile,
  and wrong the moment any frame changes. Generating both from the same
  description of where the body is leaves nothing to keep in sync.
- Rarity tints a gear layer rather than selecting different art, and style
  selects the art rather than being implied by rarity. Keeping them
  independent is the whole reason for the paperdoll: baking would need
  styles x rarities x slots rows, and could never tint armour without also
  staining skin.
- `actors.png` was rebuilt monsters-only rather than left with 12 dead player
  rows. Row indices in that sheet are computed, and the old computation read
  the class list — which now has four entries instead of three, so the sheet
  and the code would have disagreed about where the slime is. Deliberately
  a separate build script: the original also rebuilds `weapons.png` from the
  superseded three-family layout and would have clobbered the new sheet.
- Gear contributions are summed by one shared function per stat rather than
  inline at each call site. This is not tidiness — helm and cape shipped
  with roll tables that no combat formula ever read, because adding a slot
  silently required four separate edits. One function per number means the
  server and the character sheet cannot disagree either.
- Crafting takes an explicit weapon family and treats "omitted" as "the one I
  already wield". Rolling a random family at the workbench would mean an
  upgrade could change your class behind your back, which is the one thing
  the whole system needs to stay deliberate.

- Server tsconfig uses `module: ESNext` / `moduleResolution: Bundler` (not NodeNext),
  so relative imports of shared/*.ts don't need explicit .js extensions. Dev runs via
  `tsx` (esbuild-based) so this is fine; revisit if/when we do a real `node dist/`
  production build.
- `shared/` is a plain folder imported via relative paths, not wired as a real npm
  workspace dependency between client/server yet — fine at this scale, revisit if
  it gets unwieldy.
- Server sends a `WELCOME { id }` message right after connect so the client knows
  which player in future snapshots is "itself" (needed since the server assigns
  ids, not the client).
- No sprite art yet — players render as plain Phaser circles (green = local,
  gray = remote) with a name label. Real tilesets/atlases come once we're happy
  with the loop (see Idlekin's asset-catalog for the kind of tileset naming we'd
  eventually want: Tileset_Ground, Atlas_Trees_Bushes, etc.).
- Used Node's built-in `node:sqlite` (DatabaseSync) instead of `better-sqlite3` —
  avoids native module compilation on Windows (no build tools needed), and Node
  24 ships it unflagged. Revisit only if we hit a real limitation.
- "Login" is just a name field, no password — one name = one character, looked
  up by name in the `characters` table. Good enough until we actually want
  multiple people to play with genuinely separate accounts.
- Position writes to SQLite are throttled to at most once/second per player
  while moving (in-memory state updates every MOVE regardless), plus always
  flushed on disconnect — avoids hammering disk on every 50ms position update.
- Gathering is server-authoritative: client predicts its own progress bar
  locally (from when it sent GATHER_START) purely for UI smoothness, but the
  server independently times the gather and re-validates range/availability
  every tick, only awarding wood and depleting the node when *it* decides
  gathering is complete. Client and server can drift cosmetically; server
  always wins.
- Only one resource type so far ("wood", a plain column on `characters`) and
  nodes are not exclusive — multiple players could gather the same node
  simultaneously since MVP doesn't track contention. Revisit both if/when we
  add more resource types or want gathering to feel contested.
- Resource nodes (4 static trees) and their depleted/respawn state live only
  in server memory, not SQLite — resets to all-available on server restart.
  Fine for MVP; revisit if node state needs to survive restarts later.
- Gather-speed upgrade: each level costs `5 + level*5` wood and cuts gather
  duration by 400ms, floored at 500ms (shared formula in protocol-types.ts so
  client's predictive progress bar and server's authoritative timing never
  disagree on the formula, only cosmetically on the clock). Purchase is a
  single atomic SQLite statement keyed off a fresh read of wood/level, so it
  can't be double-spent by rapid double-clicks.
- Renamed `GATHER_RANGE_PX` to `INTERACTION_RANGE_PX` when battling monsters
  needed the same range check — one constant shared by both interaction types
  rather than two identical ones.
- Battle mirrors gathering exactly (channel-in-range, server-authoritative
  completion, client-predicted bar) via a single generalized `ChannelState`
  in WorldScene instead of duplicating the gather/battle bar logic — the two
  differ only in target map, status field value, duration formula, and bar
  color.
- XP is stored as "progress within current level" (resets to the remainder on
  level-up), not lifetime total — `xpToNextLevel(level)` is the shared
  threshold formula. `addXp()` loops in case a single reward crosses more than
  one level at low levels.
- Monster combat has no real damage/HP model yet — defeating a monster is a
  single timed channel, like gathering. Fine for MVP-of-MVP; revisit if combat
  needs to feel more granular (multi-hit, monster fights back, etc).
- Equipment scoped down hard from Idlekin's real system: one slot (weapon),
  three rarity tiers (common/rare/epic vs. their seven), no separate item
  instances — just a `weaponRarity` string on the character, since "better
  rarity always wins and worse is discarded" means there's nothing else to
  track per-item yet. Revisit if a real inventory/itemization system becomes
  worth it (e.g. once there's more than one stat a weapon could roll).
- Loot only ever upgrades or is silently discarded (no "downgrade" prompt, no
  stash) — keeps the server-side rule dead simple (`rarityRank(dropped) >
  rarityRank(current)`) and avoids needing an inventory UI before Phase 7.
- Gathering and battling are standing server-side "intents"
  (`{kind, targetId}`), not one-shot actions: clicking a target sets the
  intent and the player auto-repeats it (channel → award → wait for
  respawn → channel again) until they click the same target again (toggle
  off, sends STOP_ACTION), click a different target (switch), or walk out of
  range (server and client both auto-cancel independently, no message
  needed). This replaced the original one-shot-per-click model after the user
  pointed out it didn't match how idle games actually work.
- Offline progress only continues resource *gathering* specifically (not
  battling) — battling produces discrete XP/loot per kill, not a per-tick
  resource, so "what were you producing when you left" doesn't apply the same
  way. `characters.offlineGatherResource` (wood/ore/null) is set on disconnect
  from whatever gather intent was active; cleared on next reconnect regardless
  of whether it earned anything.
- Offline earn rate uses the *full* auto-gather cycle time
  (`gatherDurationForLevel + GATHER_RESPAWN_MS`), not just the active-channel
  portion — matches actual live throughput, since most of a gather cycle is
  spent waiting for the node to respawn.
- Monster variety via a `MONSTER_STATS` lookup (xpReward + durationMultiplier
  per kind) rather than per-monster fields — keeps adding a new monster kind
  to a one-line table entry. Goblins are 1.6x slime's base battle duration and
  worth ~2.4x the XP.
- Armor slot mirrors weapon exactly (rarity tiers, upgrade-only, one column on
  `characters`) but its effect is an XP multiplier on kills
  (common/rare/epic → +10%/+25%/+50%) rather than a speed bonus — matches
  Idlekin's actual `xp_pve_rate` bonus type from the reverse-engineered
  client bundle. Loot rolls 50/50 between weapon and armor slot before
  rolling rarity, both slots share the same `LOOT_DROP_CHANCE` (30%/kill).
- Added a third slot (boots) and generalized loot handling into
  `ITEM_SLOTS`/`SLOT_MAPS`/`SLOT_SETTERS` lookup tables instead of growing
  another if/else branch — adding a 4th slot later is a one-line addition to
  each table, not a new code path. Boots' rarity bonus is movement speed
  (client-side only, doesn't touch server tick logic at all, unlike
  weapon/armor) — deliberately chosen as the one gear effect a player can
  *see* rather than infer from slightly faster timers.
- Boss monsters are a data flag (`MonsterStats.guaranteedDrop` +
  `respawnMultiplier`), not special-cased branching in the tick loop or loot
  function — `maybeDropLoot` takes the monster and checks the flag itself.
  Keeps "add a new boss" a one-line table entry away.
- Player HP has no passive regen and no in-combat damage-over-time tick loop —
  a monster's counter-hit is rolled once per battle *cycle completion* (the
  same moment XP/loot get awarded), not on a separate per-second timer. Kept
  it simple deliberately: no regen means defeat is a real (if soft) setback,
  and reusing the existing completion event means no new tick-loop plumbing.
  Revisit if combat needs to feel more real-time (e.g. damage mid-channel).
  Defeat always sends the player to the fixed `PLAYER_SPAWN` (400,300) at half
  max HP — no death penalty beyond time lost, matches the game's low-stakes
  idle tone.
- Real inventory replaced "auto-equip if better rarity, discard if worse":
  loot now creates a real row in a new `items` table (per-character, per-slot,
  per-rarity, `equipped` boolean) and the player chooses what to wear via a
  DOM overlay panel (`I` key), not the canvas — deliberately DOM instead of
  Phaser game-objects for this one, since a real grid+click UI with hover
  states is much less code as HTML/CSS than hand-rolled in Phaser, matching
  how the login screen already does it. `weaponRarity`/`armorRarity`/
  `bootsRarity` columns on `characters` stay as a denormalized "currently
  equipped" cache (unchanged consumers: gather/battle duration, move speed,
  XP bonus formulas) — kept in sync by `db.equipItem()` on every equip swap,
  avoids a join on every tick. No inventory cap and no discard/sell yet —
  bag can only grow. No item stats beyond rarity (still just weapon/armor/
  boots +speed/+xp/+movespeed by tier, same as before this phase).
- Real combat resolution (`resolveHit` in shared) replaced the flat
  "hitChance/hitDamage roll, instant kill" model after the user asked for a
  proper stat-driven system. `hitChance = accuracy - evasion` (clamped
  5-95%), `crit = roll < critChance`, `damage = round(minHit..maxHit) *
  (crit ? critMultiplier : 1) - armor` (floored at 1). Same function resolves
  both directions (player→monster, monster→player) — attacker/defender stats
  are just swapped, no duplicated logic.
- Item itemization now has two independent axes: rarity (drop-weighted,
  drives the existing speed/xp/movespeed tier bonuses) and a separate rolled
  `statValue` (ranged by slot+rarity) that drives combat stats — weapon bonus
  damage, armor flat reduction, boots evasion%. Kept to one numeric roll per
  item for this pass rather than multiple affixes; a second roll per item is
  a natural next step if the loot feels too flat.
- `equippedItems` (a new server map of the full equipped `ItemInstance` per
  slot, not just rarity) sits alongside the older `weaponRarities`/
  `armorRarities`/`bootsRarities` maps rather than replacing them — those
  three are still what the speed/xp/movespeed formulas consume, while combat
  resolution needs the item's `statValue` too. Slight duplication, kept
  because splitting it out cleanly would have meant touching every existing
  call site for a same-session feature; revisit if the two ever drift.
- Monster combat stats (accuracy/evasion/armor/crit) live in `MONSTER_STATS`
  per kind, same table pattern as everything else monster-related — adding a
  new monster kind means filling in one more row, not new branching logic.
- Player HP regen still doesn't exist (see Phase 12 decision) — now more
  noticeable since fights take multiple exchanges and monsters hit back each
  one. Revisit if defeat starts feeling too punishing without it.
- World size and spawn point are now shared constants (`WORLD_WIDTH`/
  `WORLD_HEIGHT`/`PLAYER_SPAWN` in protocol-types.ts) instead of separately
  hardcoded numbers in client (`WORLD_BOUNDS`, grid, initial sprite position)
  and server (`loadOrCreateCharacter` default row, defeat-respawn position) —
  the two are structurally guaranteed to agree now, rather than by
  convention.
- Crafting reuses the existing loot/equip pipeline end to end rather than
  inventing a parallel one: `CRAFT_ITEM` calls the same `addItem` the
  monster-loot path uses and pushes the same `LOOT_UPDATE`/`ITEMS_UPDATE`
  messages, so the client's "item found" toast and inventory refresh work
  unmodified for crafted items. Originally common-rarity only; extended to
  all 3 rarities via `craftCostFor` (base cost x a per-rarity multiplier —
  1x/4x/12x for common/rare/epic) rather than a full slot x rarity cost
  table, so crafting became a guaranteed-but-expensive alternative to
  drop RNG rather than strictly a cheap early crutch.
- Crafting station state (`stations: CraftingStationState[]`) lives in
  server memory only, same as resource nodes/monsters — no need to persist
  since there's currently only one, always at map center.
- Object titles are a static `Record<kind, string>` lookup per object type
  (`NODE_LABELS`/`MONSTER_LABELS`/`STATION_LABEL`) rendered once at
  creation, not updated per-tick — labels never change after spawn so
  there's nothing to keep in sync.
- Now that the world (1600x1200) is bigger than the canvas (800x600), the
  camera follows the player and all HUD (`hpText`/`woodText`/etc, the two
  upgrade buttons) had to be pinned via `setScrollFactor(0)` — previously
  world size == canvas size so this was never an issue; anything added to
  the HUD from here on needs the same treatment or it'll drift off-screen
  as the camera scrolls.
- Monster counter-attacks decoupled from the player's own attack-cycle timer:
  previously both sides traded exactly one hit per player battle-cycle
  completion, so upgrading your own attack speed silently also raised how
  often the monster hit you. Now each monster kind has its own
  `attackIntervalMs` (independent tick loop, keyed by `monsterAttackAt` per
  player) — trolls swing slow and heavy, goblins comparatively fast, and
  neither is affected by the player's battle-power/weapon-speed stat.
  `BATTLE_RESULT` is now player-attack-only; the monster's swing moved to a
  new `MONSTER_ATTACK` message so the two combat-log entries don't have to
  be emitted in lockstep.
- Combat log (`CombatLog.ts`) is a plain always-visible DOM panel, not a
  Phaser text object and not a toggleable overlay like the inventory/craft
  panels — it needs to stay readable and scrollable while the player keeps
  playing, unlike those two which pause the moment you'd want to read them.
  Purely client-side, fed by existing message payloads already received for
  floating text — no new server messages needed for this one.
- Packs use a fixed offset shape (diamond for 4, triangle for 3) around a
  center point rather than random scatter within a radius — deterministic
  and guarantees every member is close enough to every other member for
  `BATTLE_RANGE_PX` retargeting to actually work, which random placement
  wouldn't reliably guarantee at small sample sizes (4 monsters).
- Auto-retarget search (`findNearestAliveMonsterOfKind`) is same-kind-only
  and range-limited to `BATTLE_RANGE_PX` from the player's *current*
  position (not the dead monster's position) — deliberately no
  cross-pack-kind retargeting (killing the last slime doesn't auto-start a
  goblin fight) and no player auto-walk to reach a farther pack member; if
  nothing else is in range the old "wait for this one to respawn" behavior
  is the fallback, so a lone monster (or the last kill in a pack) still
  behaves exactly as before this phase.
- Offline combat reuses `battleDurationMs` as the "time per kill" unit for
  the offline math, same way offline gathering already reuses
  `gatherDurationForLevel` — an abstraction, since live combat is no longer
  literally one exchange per `battleDurationMs` (see Phase 17), but a
  reasonable average-time-to-kill proxy for a background simulation that
  doesn't need to be hit-by-hit accurate.
- `offlineGatherResource` and `offlineBattleMonsterKind` are mutually
  exclusive by construction (a player has exactly one standing intent at a
  time) but both columns are defensively cleared together on every offline
  resolution path, not just the one that was actually populated — cheap
  insurance against them ever drifting out of sync.
- `CharacterPanel`/`InventoryPanel` split follows the same DOM-overlay
  pattern as before (not a new architectural direction), just two overlays
  instead of one — `#character-overlay` and `#inventory-overlay` share
  nearly all their CSS (`.inv-header`, `.inv-stats`, etc. now apply to
  both) since they're visually the same "centered modal card" shape, only
  their contents differ.
- Dock buttons are plain DOM elements positioned absolutely over the canvas
  (`#ui-dock`, `.dock-btn`), not Phaser game objects — consistent with
  every other panel-toggle UI in the game being DOM (see the Phase 13
  decision on why: real click/hover states are far less code as HTML/CSS
  than hand-rolled in Phaser).
- `#game-frame` is the actual positioning root for every DOM overlay now —
  `#game-root` stays viewport-sized purely to flex-center `#game-frame`,
  but nothing should ever be positioned directly against `#game-root`
  again, or it'll reintroduce the "corner of the browser, not the corner of
  the canvas" bug. Any new absolutely-positioned UI must go inside
  `#game-frame`.
- Canvas fills the browser window (`Phaser.Scale.RESIZE` against a 100%/100%
  `#game-frame`) rather than being a fixed pixel size — briefly tried a
  fixed 1280x800 box first, but the user specifically wanted the game
  window itself bigger, not just a bigger fixed box, so switched to a
  responsive canvas. `this.scale.width/height` is the live source of truth
  for any Phaser-side (non-DOM) UI that needs to anchor to a screen edge —
  a `resize` listener keeps the two right-anchored upgrade buttons and the
  camera's own size in sync when the window changes. A short-lived
  `client/src/constants.ts` (fixed CANVAS_WIDTH/HEIGHT) was added then
  deleted in the same session once this responsive approach replaced it.
- Item tooltip (`ItemTooltip.ts`) is a single shared DOM element
  (`#item-tooltip`) that every item card re-renders into on hover, not one
  tooltip element per card — standard pattern for cursor-following
  tooltips, avoids dozens of idle absolutely-positioned elements sitting in
  the DOM at once.
- Selling only refunds wood (never ore, never a new currency) — keeps the
  sink feeding straight back into the one resource crafting/upgrades both
  already consume, rather than introducing gold as a fourth thing to
  balance. Sell value is a flat per-rarity table (not tied to item stat
  roll or slot) — deliberately simple; revisit if selling ever needs to
  feel more precise than "how rare was it."
- `db.sellItem` re-reads the item row itself (rarity + equipped flag) by
  id+characterId rather than trusting anything the client sends beyond the
  id — same ownership-check shape as `equipItem`, prevents selling another
  player's item or an equipped one via a forged message.
- Potions are a character-level stack count, not an `items` table row —
  unlike gear, there's no per-instance state (no rarity, no equipped flag,
  no statValue) worth tracking per potion, so a plain counter is the
  correct model, not a table row per potion crafted.
- Secondary stat deliberately picked a *different* flavor per slot
  (crit%/evasion%/move-speed) rather than "the same stat, more of it" —
  makes the two rolls on one item feel like two separate reasons to want
  it, not just a bigger number. Ranges kept smaller than the primary roll
  on purpose so it reads as a bonus, not co-equal with the main stat.
- Double attack is a genuinely separate swing (its own `resolveHit` call,
  its own `BATTLE_RESULT`), not `damage * 2` on a single roll — keeps it
  consistent with how every other combat number in this game is a real
  independent roll, and means a double attack can crit on one swing and
  miss on the other, which a flat multiplier couldn't express.
- Wolf's stat profile was chosen to be genuinely distinct, not a
  reskinned goblin — fastest attack interval of any monster + highest
  evasion-for-tier, vs. low HP, so packs of them play differently (many
  small fast exchanges) than a goblin or troll pack (fewer, bigger hits).
  Placement (1100, 1500) deliberately mirrors the troll lair (1100, 100)
  for a symmetric map rather than picking an arbitrary empty spot.
- Ring needed no server-side "cached rarity" field the way weapon/armor/
  boots each got one — those three exist because gather/battle-duration/
  move-speed formulas need a flat rarity value cheaply on every tick
  without a join; ring's only consumers (max-hit and accuracy) already go
  through the full `equippedItems` map, so adding a redundant cached field
  would've been pure duplication for no formula that needed it.
- Potion recipe now leans almost entirely on herb (8 herb + 2 wood, 0 ore)
  rather than splitting evenly across all 3 materials — makes gathering
  herb specifically worthwhile rather than a token ingredient, and the
  herb bushes being clustered right at the workbench means "go get potion
  ingredients" is a short, self-contained loop.
- `resourceForNodeKind()` replaced an inline ternary that had baked in the
  assumption of exactly 2 node kinds (`kind === "tree" ? wood : ore`) —
  the kind of thing that silently keeps compiling but produces wrong data
  when a 3rd kind is added if not caught. Centralizing it in shared means
  both the live-gather tick loop and the offline-resume-on-reconnect path
  use the same mapping instead of each hand-rolling their own.
- Daily bonus eligibility uses elapsed-time (20h since last claim) instead
  of calendar-day comparison — no timezone handling, no "midnight in whose
  timezone" ambiguity, and it's a single column + subtraction rather than
  date-library logic. 20h instead of 24h deliberately forgives claiming a
  bit earlier each day rather than punishing players who play at a
  slightly different time than yesterday.
- Picked Kenney's "Roguelike/RPG Pack" over other free tile sets
  specifically because it's CC0 (no attribution required, though a license
  copy was kept anyway) and ships as one flat spritesheet rather than a
  Tiled `.tmx` project — a raw `.tmx` was briefly attempted for exact tile
  coordinates but its long base64+zlib "Objects" layer decoded to
  impossible GIDs when hand-transcribed in PowerShell, so tile coordinates
  were instead nailed down by hand-cropping the sheet with row/col labels
  burned into debug PNGs and visually confirming each one — slower but
  unambiguous. Resource nodes moved from `Arc` circles to a new
  `NodeVisual`/`Image`-based type distinct from `InteractableVisual`
  (monsters kept as `Arc`) since Image has no `setFillStyle`; depleted
  state now reads via tint instead of fill color. Superseded in Phase 36:
  `InteractableVisual.shape` also became `Image` once monster bust sprites
  existed, so both visual types now share the tint-based status mechanic.
- Shadows are plain `Ellipse` game objects added immediately before the
  sprite they belong to, relying on same-depth insertion order to render
  behind it, rather than an explicit `setDepth(-1)` — depth -1 would have
  put them behind the background `TileSprite` itself (depth 0), making
  them invisible.
- Reskinned the goblin via `setTint` on a same-pack barbarian bust rather
  than pulling in a third asset pack just for one missing color — Tiny
  Dungeon's roster has no green humanoid bust, and tint was already the
  established mechanism for this pack's dead/depleted states, so reusing
  it for a "different monster flavor" cost nothing new to learn.
  Superseded in Phase 37: the whole Tiny Dungeon pack was dropped once an
  animated pack was found, so the tinted-bust goblin no longer exists.
- Composing our own `actors.png` beat loading 0x72's frames individually
  or using its shipped sheet as-is. Its frames range from 16x16 to 32x36,
  so `load.spritesheet` (fixed cells) can't address them and the shipped
  sheet needs a JSON atlas to interpret. Normalising offline into one
  32x36 grid collapses all of that into `row * 8 + col` and, by
  bottom-aligning each cell, makes `setOrigin(0.5, 1)` mean "feet on the
  world position" for every actor uniformly — which is what lets one
  shadow helper and one label-offset helper serve all six actors.
- Picked 0x72's pack for the *animation frames specifically*: both Kenney
  packs already in the project have good art but zero walk-cycle frames,
  which is why Phase 36 shipped static busts. Sourced the frames from a
  GitHub mirror rather than itch.io because itch's download flow is
  interactive; the mirror exposes per-frame PNGs, so only the ~40 frames
  actually used were fetched instead of the whole pack.
- Substituted `orc_warrior` for the pack's literal `goblin` sprite: the
  real goblin is 16x16 and 45 of its 256 pixels are near-black, so it
  vanished against grass — the exact complaint from Phase 36. Checked the
  pixel histogram before committing rather than eyeballing it on the
  dark-background contact sheet, which had hidden the problem.
- Slime and wolf are drawn from shape primitives (ellipse/rect/triangle
  masks → derived outline → tone bands) rather than hand-typed character
  maps. Character maps are the usual way to do pixel art in code, but
  16-char rows typed by hand came out asymmetric and were painful to
  iterate; primitives stay symmetric by construction and each tweak is a
  number, not a re-typed grid.
- Y-sorting via `setDepth(y)` was not optional polish — it is forced by
  moving actors to a feet-on-position origin. Before that, sprites were
  centre-anchored and overlap barely showed; after it, draw order is
  visible, and the default (creation order) puts the player behind every
  tree and monster because the player exists before the first snapshot.
  Background, scatter, FX and HUD get constants far outside the world's Y
  range so they can never interleave with sorted objects.
- Ground scatter uses full-bleed decorated grass tiles rather than
  transparent props, which normally would show as obvious squares. It
  works here only because those tiles' base green is byte-identical
  (123,173,44) to the plain grass tile — verified before use — and
  because they're placed on the same 32px lattice at the same scale as
  the background TileSprite. A seeded xorshift keeps the layout identical
  across reloads; an unseeded `Math.random` would reshuffle the world
  every time the player logged in. **Reversed in Phase 38**: that
  byte-identical-background trick is exactly what forbade giving the
  grass any tonal variation, and the lattice made the clutter line up
  into a visible grid. Drawing transparent clutter instead removed both
  constraints at once. The seeded-PRNG reasoning still stands.
- Baking `props.png` was driven by a real bug, not tidiness. `row * 57 +
  col` has no way to fail loudly: swap the operands and you still get a
  valid tile index, just the wrong picture — the crafting station shipped
  as a blinking blue flower for exactly this reason, and typechecking,
  linting and asset-loading all passed. A flat 0..N index with named
  constants removes the failure mode rather than fixing one instance of
  it. The secondary win is compositing: the sheet's good trees are two
  tiles stacked, which no single frame index can address.
- Tree and bush frames were originally chosen off a contact sheet drawn on
  a dark background, where every green looked distinct. In the game they
  sit on green grass, and (13,9)/(19,9) turn out to be within a few points
  of the grass hue — hence the "ghost outline" look. Lesson applied since:
  preview candidate art on the background it will actually appear on. The
  props preview now renders over the real grass texture for this reason.
- The ground clutter is hand-drawn rather than borrowed because the sheet
  cannot supply it cleanly: its flower tiles include a stone-path fragment
  bleeding in from the adjacent tile, and its white flowers are drawn in
  greys (153/223/194) that overlap the very stone tones a colour key would
  need to remove. Drawing them also made them far subtler than the sheet's
  five-blossom bouquets, which is what the field actually needed.
- Armour is shown by palette-swapping the body at build time, not by an
  overlay layer or a runtime tint. An overlay would need its own 8 frames
  per piece drawn to match the body's idle/run bob or it detaches from the
  animation; `setTint` multiplies the whole sprite, so it would stain skin,
  plume and gauntlets along with the plate; swapping to a different
  character sprite per tier changes who you are. The knight uses just 6
  colours, exactly two of which are armour, so repainting those two is
  enough — and doing it per-frame at build time is animation-correct by
  construction. The same trick extends to boots (a third colour) if wanted.
- Removing the idle model was the point, not a side effect. Progress bars
  on a click-to-start action, offline accrual, and "standing intents" are
  the idle-game vocabulary; proximity-driven combat plus monsters that come
  to you is the RPG vocabulary. Keeping both would have meant two systems
  deciding what a player is doing.
- Monster aggro is sticky (keeps its target until that target dies, leaves,
  or logs out) rather than "nearest player each tick". Re-picking every
  tick makes a pack visibly flip between two nearby players, and makes
  kiting incoherent. The de-aggro radius is 1.4x the aggro radius for the
  same reason — equal radii make aggro blink on and off when a player walks
  the boundary.
- Monsters heal to full when they reach home after leashing. Without it,
  hit-and-run leaves a camp permanently chipped down and the intended
  difficulty quietly evaporates.
- Weapons are separate sprites parented to a grip offset, not baked into
  the character frames. Baking would mean re-rendering every actor frame
  per weapon (6 actors x 8 frames x N weapons), and the source art is
  drawn for exactly this approach — every weapon points up from a hilt at
  the bottom, so bottom-aligning the cell puts the rotation pivot on the
  hand for free. It also means the swing is one tween rather than an
  animation per weapon.
- The player's authoritative position had to be split out of
  `localSprite.x/y` before any attack animation could exist. With the
  sprite doubling as game state, a lunge tween would have fed a shoved
  position straight into distance checks and `sendMove`. Monsters needed
  no such split — they never move, so their sprite can be tweened freely
  and snapped back to the stored `monster.x`.
- The effect and sound work is deliberately a library, not the two cues
  combat needs today: the user asked for spells/skills to be supported
  ahead of time. So `fx.png` carries elemental and support shapes with no
  current caller (bolt/fire/frost/lightning), and `cast`/`heal` cues exist
  unused-ish for the same reason. Adding a spell later should be picking a
  row and a tint, not producing art.
- SFX are synthesised rather than downloaded. The CC0 sound packs worth
  using are large downloads of mostly-irrelevant clips, whereas a handful
  of short chiptune blips is a few lines of arithmetic — and it keeps the
  whole palette consistent and trivially extensible (add an entry to the
  script, re-run). `playSfx` rate-limits per cue because auto-battle fires
  several results a second and stacked copies just buzz.
- Grass is one baked 256x256 texture rather than per-tile variety chosen at
  runtime. A mosaic of 4 variants x random flips gives 16 distinct-looking
  cells, and the brightness field is generated with wrapping lattice
  indices so the texture still tiles seamlessly after shading — all of it
  paid for once at build time, leaving the runtime a single TileSprite.
- Your class is your whole body, not just the thing in your hand. The rule
  was always "you are whatever you're holding", but until M3 the only visible
  half of it was the weapon. Swapping the rig as well costs one model load
  (cached after the first) and makes the game's central rule readable at a
  glance across a field, which no stat panel can do. The alternative — one
  neutral body wearing class-flavoured gear — would have made the four
  archetypes differ only by the item in the right hand, which is exactly the
  "differently-numbered rather than different" failure Phase 44 set out to
  avoid.
- Weapon grips are harvested off the rig that authored them rather than
  measured into constants. Every character FBX already parents its own weapon
  to `WeaponR` with the correct offset, rotation and scale, so lifting the mesh
  complete with its local transform makes the grip correct by construction —
  there is no number anyone can get wrong, and re-exporting the art fixes the
  game without touching the code. The probe that measured those transforms was
  written first and thrown away afterwards; what survives is the rule that the
  values are never copied out. Axe and mace extend this rather than breaking
  it: with no model in the pack, they are built inside the *sword's* geometry
  space so the sword's harvested grip places them too.
- Armour is authored in rig coordinates, and the bone holder undoes the rest
  pose to make that legal. Writing gear directly in a bone's local frame means
  every offset is expressed inside a rotated, 100x-scaled space that differs
  per bone — unreadable, and unfixable without trial and error. A holder whose
  local matrix is the bone's rest transform inverted lets a helm be written as
  "a dome at y=254, radius 40" in the same numbers the rig itself measures in,
  while still riding the bone through every animation. The rest matrices are
  captured at build time, not read when the gear is attached: equipping happens
  mid-stride, and reading a bone then would pin the gear to whatever pose the
  character was standing in at that instant.
- Armour attaches rigidly to bones instead of being skinned. A rigid piece
  cannot deform, so every style is placed on a part of the body that does not
  need to — skull, torso, hip, foot, shin, shoulder — and the cost is zero
  extra skinning. It is the same win the weapon socket already provided, which
  is why the robe's skirt hangs from the *waist* bone rather than the chest:
  pinned to the ribs it slides up the legs the moment the character runs.
- Do not use `Skeleton.pose()` to force a known rest pose on this rig. It
  writes each root bone's bind-space *world* matrix into its *local* matrix,
  and here the root bone's parent is `CharacterArmature`, a plain Group already
  carrying a scale of 100 — so the scale lands twice and every bone comes out a
  hundred times too big. Building the holders immediately after `instantiate`,
  before any clip has run and with nothing awaited in between, is both simpler
  and actually correct.
- The preview page gained a `?hidebody=1` flag, and it is the reason the armour
  got fitted in two passes instead of ten. On the body, "this helm is too
  small" and "this helm is the right size but sunk inside the skull" look
  identical — both show a thin ring round the ears. With the body hidden the
  pieces were obviously well-formed, which said the fault was clearance, not
  shape: the caps topped out at rig y 287 against a crown at 295, so the skull
  erupted through the dome. Worth reaching for whenever something "looks too
  small" — the question is usually whether it is small or buried.
- Vite's `watch.ignored` on `public/models` (added in M1 to stop Windows EBUSY
  crashes) also means a *newly added* model file 404s into the SPA fallback
  until the dev server is restarted — Vite builds its public-file set at startup
  and the watcher it would learn additions from is the one being ignored. The
  symptom is an FBX parse error reading "Cannot find the version number", which
  is the loader choking on `<!doctype html>`. Restart the dev server after
  dropping a model in; do not go looking for a corrupt download.
- Bodies are one shared function, run on both sides, not a server rule the
  client obeys or a client rule the server trusts. Collision resolved only on
  the server arrives a round trip late and feels like lag rather than like a
  wall; resolved only on the client it is worth exactly as much as the client's
  honesty. Running `resolveBodyCollision` in both places is what makes it both
  immediate and authoritative, and putting it in `shared/` is the only reason
  the two answers agree — the same argument that put every combat formula there.
- When a monster and a player overlap, the monster is the one that moves. The
  server could push either, but pushing the player means overriding the one
  piece of state the client owns, arriving a round trip after the fact, and
  reading as being shoved by something invisible. Moving the monster is
  invisible when it is right and harmless when it is slightly wrong.
- Body radii are sized to the model the client draws, not chosen as gameplay
  numbers. A hitbox that disagrees with the silhouette is a bug the player can
  see and cannot explain. The constraint this creates — every weapon must still
  reach past every body, and every monster must still reach back — is asserted
  in `tools/test/bodies.mjs` rather than left to judgement, because breaking it
  produces no error: melee against that one kind just quietly stops working. It
  earned itself immediately, catching bare fists against a dragon with 4px of
  slack.
- The local player is the one actor that must NOT be interpolated. Easing
  toward a target is right for anything driven by snapshots arriving every
  ~100ms, and it was applied uniformly for that reason — but the local player's
  position is recomputed exactly every frame, so easing toward it can only ever
  add lag. At 60fps that is roughly 15px of permanent trail, decaying over a
  quarter of a second after input stops, which is precisely the "slippery
  ground" the player reported. The general-purpose smoothing was the bug.
- Running cancels a swing; standing still does not. The attack clip is about a
  second long and auto-attacks fire while you move, so a one-shot that refused
  to yield to the run animation meant the model held a planted pose through most
  of every fight while the character kept travelling. Letting *idle* cancel it
  too would mean attacks were rarely seen through, so only movement does — which
  is also what cancelling a swing ought to mean.
- Anything that decides "is this actor moving?" must read the positions the
  server sent, never the rendered ones. Rendered positions are interpolated, so
  they lag: asking them yields "stopped" while the model is still visibly
  catching up, which plays idle over a sliding character — the exact artefact
  the interpolation exists to avoid. Two thresholds rather than one, because a
  monster holding station at its stop distance drifts a pixel either way and a
  single threshold flickers the run cycle on and off every snapshot.
- Nothing may be pushed faster than it can walk. The monster separation shove
  was a fixed 6px per tick regardless of the creature, which for a slow monster
  is faster than its own top speed — a body sliding sideways quicker than it
  could ever move itself is ice-skating by definition, however correct the
  spacing it produces. Capped to the distance that monster could have walked in
  the same tick.
- Verify motion per rendered frame, not by sampling on a timer. The first
  collision measurement sampled every 100ms and reported a 1-3px penetration
  that looked like a real defect; measuring inside `requestAnimationFrame`
  instead showed zero overlapping frames out of 260. The timer had been catching
  the gap between a snapshot landing and the next frame correcting it. The same
  run also reported a 290px model lag that turned out to be the test's own setup
  teleport — worth discounting the warm-up frames before believing any number a
  harness reports about itself.
- Targeting is derived by default and chosen only on purpose. The server had
  always fought the nearest enemy whether or not anyone clicked, so the
  clunkiness players felt was never the controls — it was that the client drew
  nothing unless you clicked, which made a click look compulsory. Splitting the
  idea in two (`engagedId`, worked out every frame; `lockedId`, only ever set by
  a click) means the common case needs no input at all and a deliberate choice
  still overrides it. Worth remembering as a diagnosis, not just a fix: "the
  controls are awkward" can mean "the display is silent about what is already
  happening".
- The client tells the server its automatic pick, rather than both sides
  deriving one independently. Two implementations of "nearest enemy" agree
  almost always, and the times they disagree are the worst possible ones — the
  ring drawn around one monster while a single-target skill fires at another.
  Sending it makes them the same fact. Suppressed while an ally is selected,
  because that selection is what Mend and War Cry read and quietly overwriting
  it would trade co-op for a ring.
- Auto-targeting has to be sticky or it is worse than clicking. Monster
  separation nudges every body each tick, so plain "nearest" swaps the target
  between two enemies standing shoulder to shoulder several times a second —
  flickering the ring, spamming selections down the socket, and making the
  system feel possessed. A 26px margin before switching costs nothing and
  measured 0 changes over 50 samples in a four-monster pack. Same lesson as the
  aggro hysteresis in Phase 40 and the run/idle thresholds in M3.5: anything
  that picks a winner from a moving field needs a margin, not a comparison.
- Picking by raycast alone is a poor pointing device, twice over. It returned
  whichever monster came first in map order rather than the nearest along the
  ray, so with two bodies overlapping you could select the one behind — and it
  demanded a pixel-accurate hit on a slime that renders about twenty pixels
  across. Resolving hits by depth fixes the first; falling back to the nearest
  silhouette within 42px fixes the second. The candidate set is narrowed by
  screen distance first, which keeps it cheap enough to also run on pointer move
  and drive a hover ring.
- Skills refuse for reasons about the caster, never about the world. "Cooling
  down", "not enough mana", "not your class", "unlocks at level N" are all
  facts about you and are worth saying. "Nothing in range" is a fact about the
  field, and enforcing it meant the hotbar only worked when monsters permitted
  it — you could not swing at the air, test what a spell looked like, or open a
  fight with your opener. A skill now always fires and `hits: []` is a perfectly
  good outcome. The cost is that a cooldown can be wasted on empty ground, which
  is the player's business.
- A skill that connects with nothing still has to look like it fired. Mana and
  cooldown are spent either way, so drawing nothing makes a press with no target
  indistinguishable from a press that was ignored — which is the very confusion
  removing the refusal was meant to end. The effect plays along the caster's
  facing instead, which is also the only direction available: the server knows
  where players are but not which way they face, so anything aimed has to be
  resolved client-side, exactly as the dash already was.
- One table decides both what an attack looks like and when it lands. Timing
  and presentation were separate before — a constant 170ms beat next to an
  effect chosen by a `ranged` boolean — and separate is how they drift: an
  arrow that takes 200ms to arrive while the damage lands at 170ms is a
  number appearing in front of its own projectile. Deriving the beat from the
  projectile's speed and the actual gap makes the two agree by construction,
  at every range rather than at the one the constant happened to suit. Melee
  keeps a fixed beat on purpose: a swing's timing is a property of the swing.
- Attack presentation is keyed by weapon, not by class. A ranger's bow and
  dagger want nothing in common — one flies, one stabs — while a sword and an
  axe differ only in weight. Keying by class would have forced the bow and the
  dagger to share a delivery and given the game three presentations for eight
  weapons, which is the same flattening Phase 45 rejected when it gave each
  family its own range, speed and damage multipliers.
- Projectiles are launched from the weapon socket rather than from the actor's
  position plus an offset. The socket is a bone, so it tracks the draw
  animation for free and an arrow leaves the bow instead of the archer's
  sternum. Same reasoning as the weapon meshes in M3: the rig already knows
  where the hand is, and any constant that answers the same question is a
  constant that can be wrong.
- The arrow is drawn far larger than scale, and that is the correct call. This
  camera puts a player at roughly fifty pixels tall, so a proportionate arrow
  is a two-pixel splinter against grass — firing one would be
  indistinguishable from firing nothing, which defeats the entire point of
  making ranged combat visible. It gets an additive trail for the same reason:
  low-poly geometry catches almost no light at that distance. Readability beats
  proportion whenever the two disagree at this scale.
- The arrow's long axis is measured, not assumed. The weapon models in this
  pack disagree about orientation — the standalone bow lies along Z while the
  Wizard's built-in staff runs along Y — so any hard-coded axis is a guess that
  a re-export can silently invalidate, and the failure mode is an arrow flying
  sideways. Rotating whichever bounding-box side is longest into +Z means
  orientation cannot be wrong, only the model can.
- Beams are not effects and do not belong in `Effects`. Everything in that
  system is a camera-facing quad from `fx.png` positioned at a point; a beam is
  a shape defined by two endpoints, and an arrow is a real mesh that has to
  point where it is going. Bending the atlas system to cover them would have
  cost more than a small sibling class that does exactly those two things —
  while the travelling bolt, which genuinely is a moving quad, stayed in
  `Effects` and needed no new code at all.
- Standing near something is not an instruction to attack it. Phase 40 removed
  the idle model but kept its central habit — the server reading intent off the
  player's position — and proximity-driven combat is the last place that
  survived. It meant a player crossing the map picked fights they never chose,
  and it sat badly beside everything added since: explicit targeting, free
  skill use, a bar you press. An attack order you give and that lapses on its
  own is the same idea Phase 40 was reaching for (no standing intents, no
  progress bars) applied honestly to combat rather than stopping short of it.
- The attack order lapses on a timer rather than clearing when its target dies.
  Clearing per corpse is the strictest reading of "you must press to attack",
  and it would mean a keypress per kill in a four-monster camp — friction of
  exactly the kind the targeting work had just removed. A window that outlasts
  the gaps inside a fight but not the walk between them gets the deliberate
  engagement without the tax. Two seconds; four was measured re-engaging the
  player on arrival at the next camp.
- The default attack is keyed by weapon, not by class, and is not a SkillDef.
  A bow and a dagger are both a ranger's and share nothing; meanwhile a default
  attack has no cooldown, no mana cost and no unlock level, so most of SkillDef
  would have been dead fields describing it. A separate small table keyed the
  way the game already thinks — "you are whatever you're holding" — costs one
  extra type and keeps both shapes honest.
- The default attack is exempt from the global cooldown. Auto-attacks were
  never GCD-gated, and they still are not; putting the *manual* press under the
  GCD would mean pressing your own attack made you worse than ignoring it, and
  would let a basic attack lock out a real spell. The swing timer is the only
  clock that governs it, which is also what makes that curtain meaningful.
- The swing timer is sent by the server even though every ingredient is already
  in `shared`. The client could re-derive it — it has `playerAttackIntervalMs`
  and the weapon multiplier — but the swing clock is a running state machine
  the server owns: it starts on first coming into reach, resets per swing, and
  is thrown away on disengage. Re-deriving that is re-implementing it, and any
  drift shows up as a bar disagreeing with when you actually hit. Sending it on
  equip and on connect as well as on each swing means the bar is never guessing.
- Putting the swing timer on screen was the cheapest combat improvement
  available, because the mechanic already existed and was merely invisible.
  Weapon speed multipliers have been in the game since Phase 45 — a dagger
  swings at 0.6x and an axe at 1.35x — and no player could perceive the
  difference, so two of the three knobs distinguishing weapon families were
  doing their work in the dark. The same reasoning produced the wind-up bar:
  the telegraph's *radius* was drawn and its *timing* was not, so a mechanic
  meant to be answered by moving could only be answered by guessing.
- Character level and weapon proficiency are separate progressions because they
  answer separate questions. Level is who you are — hit points and stat points
  that follow you across every weapon, so switching never throws the character
  away. Proficiency is what you can do with the thing in your hand, and it is
  earned only while holding it. Merging them would have meant either a level-20
  character being instantly expert with a weapon they had never swung, or
  switching weapons costing you your hit points; keeping them apart is what lets
  a weapon swap be a real commitment without being a punishment.
- Talent trees are keyed by weapon, not by class. Three warrior weapons sharing
  one spell list is what made an axe a sword with different numbers — the same
  flattening that M3.7 fixed for attack presentation, one layer deeper. A tree
  each lets the axe be heavy single blows and the mace be armour and control
  while both stay warriors, because the weapon still decides the archetype.
- A talent node is data, never behaviour: a name, a rank cap, and either one
  `SkillId` or a bag of `PassiveBonus`. Seventy-odd nodes across eight trees is
  only maintainable if rebalancing means editing numbers, and the fixed
  `PassiveBonus` vocabulary is what makes that possible — sixteen knobs that
  every node draws from and that the shared formulas all read. It is also why
  actives are single-rank: "do I have this skill" is a clean question, and
  making every skill separately rankable would put a scaling rule in eighty
  places.
- Every talent percentage had to be threaded into the shared formulas, not just
  displayed. A tree whose numbers never reach the combat maths is decoration,
  and the failure would be invisible — the panel would say +24% damage and the
  damage would not move. So `PassiveBonus` gained nine fields and each got a
  named helper in `shared/` (`applyDamagePercent`, `applyAttackSpeed`,
  `applyCooldown`, `applyManaCost`, plus optional arguments on the existing
  range/crit/accuracy/HP functions) so the server's resolution and the client's
  stat sheet apply them identically. The sheet was updated in the same pass for
  exactly that reason.
- A tree that fits inside its own point budget is a checklist. The first draft
  of all eight had 19-20 total ranks against 20 points at the cap, so a player
  would buy everything and never make a decision — the precise opposite of the
  feature's purpose, and completely invisible while reading the data. Only
  `tools/test/talents.mjs` asserting "total ranks must exceed the budget" caught
  it. Trees now run 29-31 ranks, so a finished weapon has about two thirds of
  its tree and which two thirds is the build. Worth generalising: whenever a
  system's point is that the player chooses, something should assert that the
  choice is real, because a system with no scarcity still looks correct.
- Weapon progression lives in two narrow tables rather than columns on
  `characters`. Both are keyed by (character, weapon) and one additionally by
  node, which is a shape a wide row cannot hold without turning into JSON — and
  rows mean the absence of a row is the honest representation of "never touched
  that weapon" rather than eight columns of zero on every character.
- Stat points needed advice once weapons had trees. Which attribute is worth
  buying genuinely changes with what you hold, because that is what decides
  which one multiplies your damage — a bow wants Agility for damage AND
  accuracy, a staff wants Intelligence for damage AND mana. The rankings are not
  opinions; they fall out of `primaryStatValue` and what each weapon does with
  the rest. Points are permanent, so leaving the player to guess was the one
  part of building a character the game had never explained.
- A generated action bar is not the player's bar. Listing every unlocked skill
  in tree order and assigning keys by position looks tidy and is quietly
  hostile: learning a talent inserts an entry and every key after it now does
  something else, so the game retrains your hands on its own schedule. Storing a
  layout the player edits costs one table and one message, and it is the
  difference between a bar you use and a bar you have to re-read.
- Bar cooldowns are keyed by action, not by slot. Slots are furniture the player
  rearranges; a cooldown belongs to the skill. Keying by slot would mean
  dragging a spell mid-fight either reset its cooldown or inherited the previous
  occupant's — both wrong, and both the kind of bug that only shows up when
  someone reorganises under pressure.
- The rebind listener captures. Bound on the window in capture phase and
  stopping propagation, so the key being assigned cannot also trigger the action
  it is being assigned to, or a panel toggle, or movement, on its way through.
  Obvious in hindsight and invisible until someone binds a skill to "i" and the
  inventory opens every time they press it.
- Hotbar layouts are stored per weapon, like the trees that feed them. A bar
  that survived a weapon swap would be full of skills the player cannot cast,
  because the tree changed underneath it. The same argument that made talents
  per weapon makes the bar per weapon; anything else would need a "which of
  these buttons still work" pass on every equip.
- Every slot in the bag is drawn, filled or not. Rendering only the cards that
  exist means the grid reflows on every loot drop and items move under the
  cursor mid-click. A fixed grid costs thirty empty divs and buys the one
  property a bag needs: the third slot is always the third slot.
- Filter tabs were solving a problem the layout created. Nine of them existed
  because gear, materials and potions shared one reflowing grid and became
  unfindable. Giving materials and consumables their own footer — they are
  counters, not objects — and adding one Sort button removed the need for all
  nine. Worth checking, when a UI grows controls, whether they are managing a
  mess that a better arrangement would not produce.
- Selling never shares a gesture with equipping. It is the only irreversible
  action in the inventory, so it gets its own button, revealed on hover, with
  the price written on it. A right-click-to-sell would be faster and would
  eventually cost somebody an epic.
- Panels belong in one rail, not in five independent full-screen overlays. Each
  overlay centred its own panel behind its own backdrop, so two open at once
  stacked in the same place and every one of them hid the game. A single
  right-anchored flex rail gives non-overlapping layout for free, keeps the
  world visible, and puts the windows on the side the buttons that open them
  now live on.
- The rail must have a `left`, not only a `right`. Absolutely positioned with
  just `right`/`top`/`bottom` it shrink-wraps its contents — so its width IS
  whatever is already open, and "will the next window still fit?" becomes
  unanswerable. The fitter silently evicted almost everything until the rail
  was given a real span to measure against.
- When windows cannot all fit, close the oldest rather than letting one slide
  off the edge. Four panels are wider than any screen. Overflowing leaves one
  half off-screen with no way to reach it; evicting is predictable, and
  oldest-first is right because the one just opened is the one being looked at.
- A `max-height` with no `overflow` is a silent truncation. Several panels had
  exactly that, which is why the character sheet's tabs were cut in half — the
  content was there, the frame simply ended. Every panel now scrolls a body
  inside a fixed frame, and the check is per window: does it fit the rail, is
  it on screen, does its content scroll rather than clip.
- Dock buttons had been dead since the M1 port. The markup survived the move
  from Phaser to Three.js and the listeners did not, so four icons sat on
  screen doing nothing for eleven milestones — including across several of my
  own passes over that file. Markup that outlives its wiring is invisible to
  typechecking and to every test that drives the game by keyboard, which is
  exactly how the tests here drive it. Worth clicking a UI occasionally rather
  than only scripting it.
- Ornament is cheap and does most of the work. The character window read as
  "plain and default" not because anything was missing but because every
  surface was one flat fill with one stroke. A vignette behind the portrait, a
  lit inner bevel, a keyline inset from the frame edge and a rarity glow that
  follows `currentColor` cost about forty lines of CSS and no new assets.

- Emoji were never art, and treating them as art is what made the interface the
  weakest-looking part of the game. They are a font: rendered by somebody else's
  drawings at somebody else's weight, in full colour that fought the
  gold-and-leather skin the rest of the UI was carefully given, and differently
  on every machine the game is opened on. Replacing them with single-path icons
  is not merely a nicer picture — it makes every glyph obey `currentColor`, which
  is what lets the rarity assignment that already lights a slot's border light
  its icon in the same stroke.
- Icons are sized in `em`, not in pixels. Every container had already declared a
  font-size back when it held an emoji, so `width: 1em` means the entire existing
  stylesheet keeps working — a rule saying "22px" still yields a 22px icon. The
  whole 120-icon swap needed colour and `display` on nine containers and no
  re-measuring anywhere. Worth remembering as a migration tactic: inherit the
  units the old thing was already sized by, and the change stops being a layout
  pass.
- `shared/` names the picture; the client draws it. The icon fields carry a key
  (`"cleave"`) rather than a glyph, so the wire format and the formulas stay free
  of presentation while there is still exactly one place that decides which
  picture a skill has — the same split the file already keeps between what a
  skill costs and how its effect is rendered.
- The icon generator validates every name against the real index before fetching
  a single file, and this was not defensive over-engineering: 36 of 116 names
  were wrong on the first run, almost all of them the right icon under the wrong
  author. The failure mode is what justifies it — a mistyped icon name renders as
  nothing at all, so the alternative was finding blank squares by eye across a
  hundred keys and four panels. Same argument as the talent-tree test: when the
  data is hand-authored and its failure is silent, assert it.
- The camera changes distance only, never pitch. Pulling back by flattening
  toward top-down is the cheap way to show more, and it would quietly alter what
  a telegraph circle and a body's footprint look like — both of which the player
  reads positionally to decide where to stand. Sliding along one fixed direction
  keeps every composition the game was built against intact at every zoom.
- Zoom notches are multiplicative. A fixed step is imperceptible at the far end
  and violent at the near one, because what the eye judges is the RATIO of the
  change and not its size in world units. The same reasoning as the aggro and
  targeting margins: anything a human perceives relatively should be adjusted
  relatively.
- The shadow frustum had to follow the zoom, and this was a real bug rather than
  polish. It was pinned at an extent sized for the old wide framing, so once the
  camera came in most of a 2048px shadow map was being spent on ground that was
  off screen — the armour detail M3 built was being blurred away by a shadow map
  resolving a field nobody could see. Anything sized against the camera needs to
  be re-derived when the camera becomes adjustable.
- The wheel is bound to the canvas, not the window. Bound globally it would haul
  the camera around whenever someone scrolled the talent tree or the bag, both of
  which overflow by design — and the panels are DOM while the camera is WebGL, so
  the two never contend if the listener simply lives on the right element.
- `deltaY` is only trusted for its sign. Browsers report wheel deltas in pixels,
  lines or pages depending on the device and the platform, so the magnitude is
  not a quantity the game can reason about; the sign is the only part that means
  the same thing everywhere.

- Source files in this checkout are a mix of CRLF and LF (`core.autocrlf=true`),
  which silently breaks multi-line find-and-replace against the CRLF ones —
  single-line patterns match and multi-line ones do not, so a patch script
  reports success having changed only some of what it was asked to. Normalise to
  LF for matching and restore the file's own endings on write. Cost a confusing
  "pattern not found" against a file whose contents visibly contained the
  pattern.
- `tsx watch` restarting the server while a client still holds the SQLite file
  produces `Error: database is locked` and kills the server outright. It is a
  race between the outgoing and incoming process, not a code fault — editing
  `shared/protocol-types.ts` triggers it most often, since both workspaces watch
  it. Restart `npm run dev`; do not go looking for a corrupt database.

- Tiling is defeated by breaking the PERIOD, not by raising the resolution. A
  ground texture repeated every few metres reads as wallpaper however good the
  source image is, because what the eye locks onto is the repeat interval — so a
  4k download would have cost eight times the bytes and fixed nothing. Two cheap
  noise fields in the shader do fix it: one mixes in a second surface so the
  field has patches whose shape ignores the tile grid, and one drifts the albedo
  colour over tens of metres so no two tiles are the same colour.
- The second surface is sampled at an incommensurate scale from the first. At
  the same scale the two textures line up tile for tile, and the blend stops
  reading as two materials meeting and starts reading as one material changing
  colour — which is the entire thing the blend exists to avoid.
- Ground cover is instanced, and the reason is draw calls rather than triangles.
  A grass tuft is forty triangles; four thousand of them is nothing for a GPU
  and four thousand draw calls is fatal. This is the difference between placing
  enough plants to read as ground cover and placing enough to read as decoration
  somebody remembered.
- Scatter is normalised by the model's LARGEST dimension, not its height.
  Normalising by height is the obvious reading of "how big is this plant" and it
  is wrong for anything wider than it is tall: a flower clump pinned to 0.2 units
  of height came out a metre across. Largest-dimension makes one number mean the
  same thing for a grass blade and a pebble. Worth remembering as a general rule
  for placing art you did not author — the bounding box you normalise against
  encodes an assumption about the model's proportions.
- Nothing scattered inside the play area may resemble a resource node. The three
  harvestables ARE a tree, a rock and a bush, so the ground cover is deliberately
  grass, clover, ferns, flowers, mushrooms and pebbles and nothing else. This is
  the Phase 47 rule that kept the treeline outside the bounds, applied to the
  inside, and it is worth more than the decor it forbids: scenery that can be
  mistaken for something interactive teaches the player to click on scenery.
- Chunking ground cover for frustum culling helped less than expected, and the
  measurement is the point. Across chunk sizes of 22, 32 and 44 units the scene
  ran between 289 calls / 718k triangles and 195 calls / 1.06M — a real trade,
  but not the order of magnitude culling normally buys, because the play area is
  only 120x90 units and the camera looks across it at a shallow angle. There is
  very little off screen to reject. If the world grows, this is the first number
  to revisit.
- The time of day is derived from wall-clock time in `shared/`, not sent by the
  server. It drives light and colour and nothing the server resolves, so making
  it a message would add something that can arrive late or be missed in exchange
  for authority nobody needs — while a shared function makes every client agree
  by construction, exactly as every combat formula already does. It lives in
  shared rather than the client because the server wants it the moment anything
  is nocturnal.
- Day and night are eight keyframes, not formulas per channel. Colour grading is
  judged by looking at it, so the representation worth having is the one where
  "make dusk more purple" is editing one hex value — not working out which
  cosine feeds the blue channel. The cost is a table that has to stay ordered;
  the benefit is that it can be tuned by anyone, including by eye.
- One directional light for the whole cycle, on one continuous arc, even though
  that is astronomically wrong. Sun by day and moon opposite by night is the
  correct model and it looks broken: the moon rises exactly as the sun sets, so
  the light jumps across the sky at both horizon crossings and every shadow in
  the world flips end for end in a single frame — measured at x=-0.90 to x=+0.91
  across sunrise. Flooring the elevation instead keeps the arc continuous (worst
  step now 3.5 degrees over 240 samples). Nobody tracks which way moonlight
  falls; everybody notices shadows snapping round.
- Interpolating between two opposed hues passes through grey, and dawn is where
  that shows. Navy straight into sunrise orange spent a full minute at a
  measured #9d6c5f mud, so there is a violet keyframe in between whose only job
  is to steer the blend around the colourful side of the wheel. A useful thing
  to watch for anywhere two colours are lerped rather than authored.
- Skill effects are geometry, not more atlas frames. The atlas was the right
  call for the flash and it still plays, but every skill drawing one
  camera-facing quad meant a nova, a chain and a cone differed only by tint —
  and the shapes that distinguish them are precisely the ones a flat quad cannot
  express. Same conclusion Beams reached in M3.7: a small sibling that does two
  things exactly beats bending the atlas system to cover them.
- Effect placement reads the skill's own `radiusPx` and `rangePx` rather than a
  per-skill size constant. A constant is a second copy of a number that already
  exists, and the failure mode is a rebalance widening a radius while the effect
  drawn for it stays the old size — the same argument that made M3.7 derive a
  projectile's timing from its real flight instead of from a matching constant.
- `SKILL_FX` is a `Record<SkillId, FxSpec>`, so completeness is a compile error
  rather than a test. Worth stating because the icon work in M4.1 needed the
  opposite: icon keys are strings crossing a generated boundary, so nothing but
  a runtime test can check them. Use the type system where the data is typed,
  and a test where it is not.
- A per-frame fade must respect what each effect chose. The first version wrote
  `material.opacity = 1` for the hold phase, which silently threw away the
  opacity every shape had just set — and with additive blending, full opacity
  saturates, so a blue frost nova and a gold cleave both rendered white. The bug
  is invisible in the code (the fade looks correct in isolation) and obvious in a
  screenshot. Anything that writes a property every frame owns that property,
  and has to be given the value rather than assuming one.
- Do not assert on a timer mid-animation under SwiftShader. A test checking an
  effect was still alive 200ms after creation failed while the effect was
  provably alive for 520ms — because a frame here can take hundreds of
  milliseconds and a `setTimeout(200)` routinely lands a second later. Creation
  and eventual cleanup are unambiguous; the middle is a statement about the
  harness. Same lesson as measuring motion per rendered frame in M3.5.

- An element with no `position` cannot be moved, and showing it moves the page
  instead. The item tooltip set `left`/`top` on every mousemove and had no CSS
  at all, so those writes were silently discarded while `display: block`
  inserted a real box into the document's flow — which is what the user saw as
  the screen "resizing for a moment" on hover. Two failures that look like one:
  the positioning never worked, and the reflow was the only visible symptom.
  Worth generalising: markup that outlives its stylesheet is as broken as markup
  that outlives its listeners, and neither shows up in a typecheck.
- A tooltip must never take pointer events. It follows the cursor by definition,
  so any pointer-events surface on it is a surface between the player and the
  thing they are hovering — and the bug only appears when someone tries to click
  what the tooltip is describing.
- The tooltip flips sides near a screen edge rather than always offsetting
  down-right. Not cosmetic here: the bag opens in a right-anchored rail, so the
  items whose tooltips matter most are exactly the ones closest to the edge a
  fixed offset would push the tooltip off.
- Load independent models with `Promise.all`, not with `await` in a loop. The
  smithy's six pieces were fetched one at a time behind the ground cover's
  forty-odd, so the last two took 24 seconds to appear — long after the player
  had walked away from spawn — and because each failure was caught per
  iteration, nothing reported anything. Parallelising took it to 4.6 seconds.
  The serial version bought nothing at all: the pieces do not depend on each
  other, and the placement afterwards is pure arithmetic.
- A catch that swallows silently is how two of six props went missing with no
  sign anything had failed. "A missing prop is a sparser smithy, not a broken
  station" is the right *behaviour* and the wrong *silence* — the fallback
  should still say what it fell back from.
- Fire flickers on summed sines, not on a random walk. Random is the obvious
  reach and it reads as a faulty lamp, because real flame varies smoothly;
  two waves at incommensurate frequencies vary smoothly and never settle into a
  visible loop. Same family of reasoning as the seeded scatter: "random" is
  rarely what the eye actually wants.
- The minimap is fed a snapshot rebuilt every frame rather than kept in sync as
  things change. It is a pure view of state that already exists, and an
  incrementally-maintained copy is one more thing that can silently disagree
  with the world — the same argument that keeps class derived from the equipped
  weapon rather than cached. A few dozen objects a frame costs nothing.
- The minimap publishes its height as a CSS custom property and the window rail
  starts from it. The alternative — the minimap reaching into the rail, or the
  rail hard-coding a gap — couples two things that have no reason to know each
  other, and breaks the moment the map is resizable. At the XL size the map
  reaches past where the rail used to begin, so this is load-bearing rather than
  tidy.
- The wheel handler on the minimap stops propagation as well as preventing
  default. The camera's own wheel listener is on the canvas beneath it, so
  without this, zooming the map zooms the world at the same time — the same
  class of problem as the rebind listener needing to capture.
- Every minimap preference is stored, and the stored blob is merged over the
  defaults rather than trusted. A saved object from an older version is missing
  whatever was added since, and spreading it over a full default keeps a new
  setting from arriving as `undefined` in code that assumes a boolean.

- Nameplates are styled by hierarchy, not uniformly. A field holds a dozen at
  once, so making them all look alike is what turns a camp into a wall of
  labels — and the fix is not smaller text, it is deciding which of them
  deserve weight. An ordinary monster is bare text and a bar; only a boss gets
  a frame. A frame everything has is a frame that says nothing.
- The thing that decides which monsters are "elite" on a plate is the same flag
  that already decides they drop loot. Two lists would drift; one fact cannot.
- The difficulty band became a field because it was load-bearing and unreadable.
  It had lived as a comment over the `MonsterKind` union since the roster grew
  to thirteen — the one property that decides where a monster is placed and how
  dangerous it is, and nothing in the code could ask for it. Colouring a plate
  by it is a small feature; making it data is the part worth keeping.
- The health bar keeps a ghost that trails the real value. A bar that simply
  becomes shorter shows the new state and hides the event — you cannot tell a
  big hit from a small one at a glance. A pale bar holding the old value for a
  beat makes the SIZE of the hit the visible thing. It only ever falls: letting
  it rise would leave a pale trail behind healing, which reads as damage.
- The telegraph belongs on the nameplate as well as the target frame. The frame
  is at the top of the screen and the thing winding up to hit you is in the
  middle of it — and a mechanic answered by moving has to be readable without
  looking away from where you are moving.
- Plates scale and sort by distance from the CAMERA, not from the player.
  Their size is a property of the view: at a close zoom the player can be
  metres from a monster the camera is right behind, and sizing off the player
  would shrink a label that fills a third of the screen. Distance also drives
  z-index, or two overlapping plates stack in whatever order the map iterates.
- The plate's class list is composed as one string and written only when it
  differs. This runs for every plate every frame, and incremental
  `classList.toggle` calls were the most expensive thing the HUD did — six
  toggles times thirty plates times sixty frames, to change nothing almost
  always.
- Vite serves a stale copy of `shared/protocol-types.ts` after enough HMR
  reloads, and the failure is silent: a newly added field arrives as
  `undefined` while the source on disk plainly has it. Cost real time here —
  the nameplate band data was correct everywhere and every plate rendered
  uncoloured. Restart the dev server. Same family as the `public/` 404s: when
  data that is definitely in the file is definitely not in the browser, suspect
  the server before the code.

- A fixed offset against a neighbour whose height can change is a bug with a
  timer on it. `#target-frame` sat at `top: 122px` and was correct until the
  world clock added a row to the frame above it, three milestones later — and
  the symptom was a panel drawing over the player's own clock, which reads as a
  rendering fault rather than as a stale number. Same story for
  `HUD_FRAME_RECT`, the nameplate exclusion zone, hardcoded at 130px tall.
  Measure and publish; let the neighbour read it. This is now the third use of
  that pattern after the minimap and the window rail, and it should have been
  the first.
- Guard the write, not the computation. `syncLayout` originally returned early
  when the frame's height was unchanged, which is right for the CSS variable and
  wrong for everything else it does — the target frame appears and disappears
  constantly without the player frame moving a pixel, so the exclusion zone
  would have been frozen at whatever it was when the height last changed.
- The player frame and the target frame are one design, not two. They were
  already stacked deliberately, so that the two health bars a player compares
  mid-fight sit next to each other; styling them as a matched pair — same
  bevel, same portrait treatment, same bar shape — is what makes that
  adjacency read as a relationship rather than as two panels that happen to be
  near each other.
- One bar shape, four colours. Health, mana, experience and the target's health
  share a trough, a gradient, a lit top edge and quarter ticks, and differ only
  in hue. Three stacked bars drawn three ways read as three widgets; drawn one
  way they read as one instrument, and the colour is then free to carry all of
  the meaning.
- Thirteen monster portraits rather than four category glyphs. The portrait is
  the biggest thing in the target frame, and the first pass grouped kinds by
  archetype — which put a hooded figure on a slime, reading as a person the
  player was about to fight. When an icon is large enough to be identified, it
  has to be right; category glyphs work at 12px and fail at 28.

- This machine (a fresh Windows box picking up the project) had neither Git
  nor Node.js preinstalled; both were installed via `winget` (`Git.Git`,
  `OpenJS.NodeJS`) rather than assuming either was already present. Also has
  no attached display, so "confirm in-browser" here means headless Playwright
  (Chromium) driving the Vite dev server and screenshotting — installed into
  the scratch/temp directory, not as a repo dependency, since it's a
  verification tool rather than something the game itself needs. Worth
  reusing this approach for future in-browser confirmations on this machine
  rather than re-deriving a driver each time.

## Current status
Phase 0 through 47 M4.7 complete (2026-08-19). **Latest: M4.7 — the unit frames,
and a layout bug I had shipped.** The target frame was drawing over the player
frame's clock row: it carried a hardcoded `top: 122px`, correct until M4.3's
world clock added a row to the frame above it. A fixed offset against a
neighbour whose height can change is a bug with a timer on it — the frame now
measures itself and publishes `--unit-frame-bottom`, the third use of that
pattern after the minimap and the window rail. `HUD_FRAME_RECT`, the zone that
stops nameplates drawing over your own health, had rotted the same way and is
measured now too. Both frames were then rebuilt as a matched pair in the
character window's language: portraits (the player's class, and thirteen real
monster glyphs rather than four category icons), the level as a badge on the
portrait corner, and one bar shape for all four bars so they read as one
instrument. The target's portrait and name tint to the difficulty band and a
boss gets the bright border, driven by the same `guaranteedDrop` that promotes
its nameplate. 15 checks, including the frame gap measured again after forcing
the player frame 40px taller.
**Next: M4.8 — remaining polish.**

Before that, Phase 0 through 47 M4.6 (2026-08-19). **Latest: M4.6 — nameplates that
say what kind of thing they name.** Every label in the world used to be the same
yellow monospace text with an optional red bar, so a tree, a boss and another
player were typographically identical. There are four treatments now, and the
hierarchy is the point: an ordinary monster is bare text and a bar, an elite gets
a framed plate, a resource node is a small dim pill, the workbench is a gold
banner. `MonsterStats.band` (1-5) became a real field — it had only ever been a
comment over the `MonsterKind` union, despite deciding where a monster is placed
and how dangerous it is — and the plate colours the name by it. Plus a damage
ghost that holds the old health for a beat so a hit reads as a chunk taken, the
telegraph bar moved onto the plate where the player is already looking, distance
scaling and z-ordering so a crowded field has depth again, and remote players
carrying their real class glyph. Verified with 14 checks including the ghost
draining and, through the real game, the engaged monster carrying its class.
**Next: M4.7 — remaining polish.**

Before that, Phase 0 through 47 M4.5 (2026-08-19). **Latest: M4.5 — a minimap, a
real smithy, and a tooltip that stops shoving the page.** All three from user
feedback. The tooltip "resizing the screen" on hover was a missing stylesheet:
`#item-tooltip` had no CSS at all, so it sat in normal flow (showing it reflowed
the document) and the `left`/`top` set on every mousemove were silently
discarded, since static elements ignore them — the markup survived the M1 port
and its styling did not, exactly like the dock buttons losing their listeners.
The workbench, the last M1 placeholder and the world's one fixed landmark, is
now a six-piece smithy from the CC0 Fantasy Props MegaKit with a forge that
flickers on summed sines. Building it exposed a real bug: two of the six pieces
were silently missing because the loop awaited each model behind the ground
cover's forty-odd, taking 24 seconds to finish — `Promise.all` for both took it
to 4.6. And there is a minimap top-right: canvas, renderer-agnostic, showing
nodes by kind, monsters with the engaged one ringed, players, the workbench and
the world boundary, with every preference persisted — circle or square, four
sizes, zoom 14-180 units, rotate-with-facing, and a toggle per layer. It
publishes its own height as a CSS variable that the window rail starts from, so
the two can never overlap however large it is made.
**Next: M4.6 — remaining polish.**

Before that, Phase 0 through 47 M4.4 (2026-08-19). **Latest: M4.2 (a world with
ground in it), M4.3 (the world has an hour) and M4.4 (every skill looks like
itself).** The field was a flat green plane ringed by trees; it now has a real
tiled PBR ground that mixes grass into dirt under one noise field and drifts its
colour under another — which is what defeats tiling, since the eye locks onto
the repeat interval and a bigger source texture would have fixed nothing. On top
of it sit 4,800 instanced plants from the CC0 Stylized Nature MegaKit, none of
which is a tree, a boulder or a bush, because those three are the harvestable
nodes and scenery that can be mistaken for something interactive teaches players
to click on scenery. The nodes themselves stopped being placeholder polyhedra.
A full day now runs in 24 real minutes, derived from wall-clock time in
`shared/` so every client agrees without a message, graded through eight
keyframes with a star dome and a clock on the unit frame. And all 27 skills got
their own shape — nova, ground pool, cone, pillar, volley or chain, as real
geometry rather than the single atlas quad they all used to share. Three bugs
worth remembering: scatter normalised by height gave wide flat models a metre of
spread, the day/night light flipped end for end at both horizon crossings until
the arc was made continuous, and the per-frame fade overwrote each effect's
chosen opacity so every additive shape saturated to white.
**Next: M4.5 — remaining polish.**

Before that, Phase 0 through 47 M4.1 (2026-08-19). **Latest: M4.1 — an interface
drawn with icons, and a camera close enough to see what you are wearing.** The
two weaknesses the user named, and they were independent. Every emoji is gone:
120 game-icons.net glyphs baked into one generated module, each a single path
with no fill of its own so it takes `currentColor` — the assignment that already
lit a slot's border by rarity now lights its icon too. Sized in `em`, so the
whole swap reused the font-sizes the containers already declared and needed
almost no new CSS. `shared/` now carries an icon key rather than a glyph. The
camera came in from 14.5 units to 9 — one world unit went from 52.8 to 83.1
screen pixels, so everything is 1.57x larger — with the wheel spanning 5 to 22,
distance-only so the pitch never changes, multiplicative notches, and a shadow
frustum that follows the zoom instead of spending a 2048px map on off-screen
ground. Two new tests: the icon generator validates every name against the real
index before fetching (36 of 116 were wrong, mostly right icon/wrong author) and
`tools/test/icons.mjs` asserts every key the game names exists. Verified in a
real browser: zero emoji left in the DOM, every icon measured for a non-zero box,
both zoom clamps exact, panel scrolling moves the camera 0.00 units.
**Next: the rest of M4 — skill VFX and day/night.**

Before that, M3.11 — windows
that behave like an MMO's. The dock icons genuinely did nothing: the markup
survived the M1 port from Phaser and its listeners did not, so all four had
been decorative for eleven milestones. They are wired now, moved to the right
edge, and lit while their window is open. The five full-screen dimming
overlays became one right-anchored window rail: panels lay out right-to-left
as they open, so the bag sits beside the character sheet instead of on top of
it, the world stays visible, and the rail stops short of the unit frames.
Opening a fourth window closes the oldest rather than pushing one off screen.
The "wrong size" reports were real — panels had a `max-height` and no
`overflow`, so content was silently truncated; every panel now scrolls a body
inside a fixed frame. And the character window stopped looking like a form: a
framed portrait with a vignette and a lit bevel, a name plate carrying the
weapon, its proficiency and one Gear number summed from the rolls combat
reads, and equipment slots whose border and glow both carry the rarity.
Verified by clicking each icon, measuring that the windows do not overlap,
checking every panel fits and scrolls, and confirming the bar survives a
reconnect. Every earlier suite still passes.

Before that, M3.10 — a real RPG
interface.** The action bar belongs to the player now: ten slots, and only the
player changes them — drag a learned skill out of the talent panel, drag slots
to reorder, right-click to clear, click a key label to rebind to any key.
Stored per weapon and per character, because the skills are. It used to be
generated from the tree, which meant there was no such thing as *your* layout
and learning a talent could shuffle everything one slot right. Cooldowns are
keyed by action rather than slot, so rearranging mid-fight cannot reset one.
The character window became a paperdoll — equipment down both sides of a
figure showing what you are, what you hold and how far into that weapon you
are, with attributes and statistics behind tabs instead of stacked in one
column. The inventory became a real bag: all thirty slots drawn whether filled
or not, so the third slot is always the third slot, with materials and
consumables moved to a footer and the nine filter tabs replaced by one Sort
button — they had existed to manage a mess a fixed grid does not have. All
five panels now share one window chrome. Verified with the real DOM drag
events (talent to slot 3, slot 3 to slot 7), a rebind to `q` that
`skillForKey` resolves, and the whole layout surviving a reconnect; both
windows screenshotted. Every earlier suite still passes.

Before that, M3.9 — a talent tree
per weapon**, the biggest change since the renderer rewrite. It started as a
question about off-hand weapons and became something better: one weapon at a
time, and *using* a weapon is what levels that weapon. Character level and
weapon proficiency now answer different questions — level is who you are (hit
points, stat points, carried across every weapon), proficiency is what you can
do with the thing in your hand, earned only while holding it. Nothing unlocks
itself any more: `unlockLevel` and `classId` are gone from `SkillDef`, the
seven passive `SkillDef`s are gone entirely, and every skill is a node you
buy. Eight trees, 73 nodes, 27 skills (eleven newly written), keyed by weapon
rather than class so an axe can be about heavy blows and a mace about armour
and control while both stay warriors. `PassiveBonus` grew from 7 knobs to 16
and all nine new ones are threaded into the shared formulas — a tree of
percentages that never reached the maths would be decoration. Stat points come
with per-weapon advice now, since which attribute is worth buying genuinely
changes with what you hold. Free unlimited respec per weapon. **The test
caught a real design failure**: `tools/test/talents.mjs` asserts a tree cannot
fit inside its own point budget, and the first draft of all eight did — 19-20
ranks against 20 points, so you would buy everything and never choose, which
was the entire point of the feature. Trees now run 29-31 ranks. Verified live:
a fresh character has one point, an empty tree and a bar holding only its
default attack; overspending and tier-skipping are both refused server-side;
fighting with a sword took the sword to proficiency 3 while the axe stayed at
zero; Keen Edge moved sheet damage 16-50 to 17-52 and Precision moved crit 35%
to 38%. Every earlier suite still passes.

Before that, M3.8 — the default
attack is a real action, and combat is something you start.** Two pieces of
user feedback that turned out to be one change. Since Phase 40 the server read
intent off the player's position, so walking near a monster was an instruction
to fight it — the last piece of idle-era reasoning in the game, and badly at
odds with everything added since. An attack order is now something you give,
by pressing the default attack or any offensive skill; it stands afterwards so
a fight needs no keypress per swing or per corpse, and lapses two seconds after
nothing has been in reach. That number is load-bearing: it must outlast the
gaps *inside* a fight without outlasting the walk *between* them, and the first
attempt at four seconds was caught re-engaging the player on arrival at the
next camp. Heals, buffs and dashes deliberately do not give the order. The
default attack itself is now a bar slot in position 1, keyed by weapon rather
than class — Slash, Hew, Crush, Stab, Shoot, Arcane Blast, Zap, Jab — and
pressing it does something waiting does not: it skips the closing wind-up, so
opening a fight is an action rather than a pause. It is exempt from the global
cooldown, since auto-attacks never were. Three combat enhancements came with
it: **weapon speed is finally visible** (the slot's curtain is the swing timer,
so dagger 330ms through axe 743ms is readable at a glance — the 0.6x–1.35x
multipliers have existed since Phase 45 with nothing on screen counting them),
a lit border and log lines saying whether an order stands, and a **wind-up bar**
on the target frame, because the danger circle said where a slam would land and
never when. Verified: six seconds beside a monster pressing nothing landed zero
blows; pressing 1 opened the fight; a skill opened it equally well; retreating
lapsed the order; all seven craftable families show their own attack and swing
interval. Every earlier suite still passes.

Before that, M3.7 — every weapon
family fights like itself.** An auto-attack used to look identical whatever you
held: a ranger three hundred pixels away hit things with an invisible melee
swing, a mage did the same with a stick, and both made the sound of a sword
going through air. One table in `attacks.ts` now says how each of the eight
families delivers a blow, and the same table decides **when** the blow lands —
a projectile's beat is its flight time over the real gap, so the damage number
cannot appear before its own arrow does at any range. The bow fires the pack's
`Ranger_Arrow` model from the weapon socket, pointed along its path (90ms at
point blank, 200ms at 300px); the staff throws a travelling arcane bolt, which
is just a moving `fx.png` quad and so needed no new art; the wand fires a beam
— instant, a white core inside a tinted glow — which is what makes it a sidearm
beside the staff rather than a shorter copy; and melee differs by weight, from
a 105ms dagger to a 235ms axe with the heaviest burst of the five. Two new
synthesised cues, `bow` and `beam`, because a bow going *whoosh* like a sword
was the loudest thing wrong with ranger combat — re-running the generator
reproduced the other ten byte for byte. The arrow is deliberately oversized
with an additive trail: at this camera a player is fifty pixels tall, so a
correctly-scaled arrow is a splinter nobody can see. Verified by instrumenting
the real code path per family — sword/axe/dagger spawn nothing and release
`swing`, bow released `bow` and spawned 4 arrows, staff `cast` and 5 bolts,
wand `beam` and 9 beams — plus the beat table across four distances and
screenshots of an arrow mid-flight and a beam. Every earlier suite still passes.

Before that, M3.6 — targeting you
do not have to do, and skills you can always use.** Both from user feedback.
The targeting complaint turned out to be a feedback bug rather than a controls
one: the server has always fought the nearest enemy whether or not anyone
clicked, but the client drew nothing unless you did, so clicking felt
compulsory when it never was. Targeting is now two things — `engagedId`, what
you are fighting this instant, derived every frame from the rule the server
swings by and always drawn; and `lockedId`, a deliberate choice that is the
only thing a click changes, with its own ring, surviving until it dies and
released by clicking it again. The client sends its auto-pick so the ring, the
auto-attack and a single-target skill cannot disagree. Three real defects sat
behind "strange when monsters are close together": click picking returned the
first monster in map order rather than the nearest along the ray, so you could
select the one *behind*; there was no click tolerance at all, making a slime a
test of aim; and Tab cycled all ~30 monsters with models rather than the ones
near you. Auto-targeting is sticky by 26px, without which separation jitter
swaps the target several times a second — measured at 0 changes over 50 samples
in a pack of four. Skills no longer need a target at all: they refuse for
reasons about the caster (cooling down, mana, class, level) and never about the
world, so you can swing at the air or open a fight with your opener; a shot
that finds nothing still plays its effect along your facing, and ground-targeted
AoE lands at your feet rather than being refused. That also fixed a plain bug
where a dash used standing still with no enemy nearby returned early *after*
the server had charged the cooldown. Verified: walked into a camp without
clicking once — target acquired in 600ms, sent, and Cleave connected with no
click anywhere in the run; all five warrior skills fire at spawn with the
nearest monster 550px away and Charge displaced the player 180px. Collision,
ice-skating, body-rule and M3 appearance suites all still pass.

Before that, M3.5 — bodies occupy
space, and nothing ice-skates.** Both from user feedback and both real. Nothing
in the game had a size: monsters kept 34px from each other but a player was a
point, so you could stand in the middle of a troll, and the `MOVE` handler
accepted whatever position arrived without even a bounds check. Every creature
now has a `bodyRadiusPx` matching the model the client draws, and one shared
`resolveBodyCollision` runs on both sides — the client while you move, so a
body feels like a wall rather than like lag, and the server on what it is told,
so skipping it gains nothing. Monsters stop at contact, a leap is clamped so it
cannot overshoot into you, separation uses each pair's own radii, and a second
pass pushes monsters out of players (the monster yields, never the player).
The ice-skating was four separate faults: the local player was position-
interpolated like everything else, though its position is exact every frame, so
the easing was pure lag — ~15px of permanent trail at 60fps decaying over a
quarter second after you release a key, which *is* the glide; attack one-shots
blocked the run animation, so for the ~1s of every swing the model held a
planted pose while the character kept moving, which was most of the sliding
during combat; run/idle was decided by comparing interpolated *rendered*
positions, which lag, so actors were told to idle while still visibly catching
up; and the separation shove could slide a monster sideways faster than its own
top speed. Verified per rendered frame rather than by eye: 260 consecutive
frames walking into a slime camp with zero overlapping and a settled distance
of exactly contact; model lag max and mean both 0px, against 9.6/4.8 before; 1
frame in 83 moving without the run animation. New `tools/test/bodies.mjs`
asserts the invariants that make collision safe — every weapon reaches past
every body, every monster reaches back — over all 13 kinds and 8 weapon
families with 8px of required slack; it caught bare fists against a dragon at
+4px, which is why the two largest bodies were trimmed. Also fixed a stale
absolute `file:///` import in `smoke.mjs` that pointed into a different
checkout and only worked on the machine that wrote it.

Before that, M3 — gear and class are
visible on the 3D character.** Equipping changes what you look like, not just
what the stat sheet says, on two axes kept independent the way Phase 45's
paperdoll kept them: style picks the mesh, rarity only tints it. Plus one the
2D game never had — class is your whole body. `CLASS_BODIES` maps the four
classes to four rigs and `setAppearance` swaps the entire body mid-fight, so
picking up a staff does not make you a soldier holding a staff, it makes you a
robed mage. This was unlocked by finding that the rest of the character pack
was one zip away (M1 had shipped only `Warrior.fbx`, though the textures for
all six were already in the repo) and that all six share ONE skeleton, every
bone within about a unit in three hundred — which is why a single set of
armour fits every class with no per-body fitting. Two rules do the work:
weapon grips are *harvested* off the rig that authored them, transform and
all, so no grip is ever a number someone can get wrong (axe and mace, absent
from the pack, are built inside the sword's own geometry space to inherit it);
and armour is authored in plain rig coordinates — "a dome at y=254, radius 40"
— with a per-bone holder that undoes the rest pose, so it reads like a
measurement and still rides the bone through every animation. Ten styles
across four visible slots, each a real silhouette: plate has pauldrons and
tassets, chain a mail skirt, robe a floor-length skirt hung from the waist
bone, the great helm a visor slit. A contact-sheet preview page at `/preview/`
drives the real `setAppearance` — the 3D descendant of `preview_doll.ps1`, and
its `?hidebody=1` flag is what separated "this helm is too small" from "this
helm is buried in the skull" in one look. Four real bugs fixed on the way, two
of them pre-existing and shipped: `SkeletonUtils.clone` shares materials by
reference, so M2's hit flash on one wolf flashed the whole pack and chilling
one slime tinted them all; `dispose()` freed geometry owned by the model cache,
forcing a GPU re-upload for every monster of a kind on respawn; the attack clip
was matched loosely, so a mage cast spells by standing still (`Idle_Attacking`
matches "Attack"); and a body swap never restarted playback, freezing the
character in its bind pose. Verified against a live server: every weapon family
equipped in sequence, each swapping the rig and re-attaching all ten armour
meshes; a second client seeing a remote player fully geared while its own
bare-handed body stayed a Monk; flashing that remote leaving the local player
untouched; a real fight, HP 60→41; `smoke.mjs` green; both workspaces
typecheck clean. **Not yet eyeballed by a human in a real browser** — this
machine has no display, so everything above is headless Playwright plus the
contact sheets.

Before that, the project got a name of
its own — **WieldBound** — after the rule that distinguishes it, replacing a
working title that named the game it was originally a study of and had been
inaccurate since the idle model was deleted in Phase 40. Availability checked
across Steam, itch.io, GitHub, npm and five TLDs before committing; trademark
registries still need a manual search if this ever goes commercial. Before
that, Phase 45: class comes from the weapon
in your hand, not a choice at login — `classForWeapon` is the one function
that answers "what am I", and skills, reach, damage attribute and mana all
route through it, so swapping weapons swaps class mid-fight and bare hands
are a real (weak) archetype rather than a broken state. Eight weapon families
across three archetypes, each tuning its archetype with range/speed/damage
multipliers so two warrior weapons genuinely play differently. Characters are
now drawn as a paperdoll: a naked `body.png` plus one `gear.png` layer per
equipped visible slot, layers slaved to the body's current frame so they
cannot drift, and both generated from one parametric skeleton so alignment is
correct by construction. Six slots, four of them visible; style picks the art,
rarity only tints it. Three real bugs fixed on the way through: the server
could not boot at all (`insertCharacter` had 23 placeholders for 22 columns),
helm and cape rolled stats that no combat formula ever read, and the character
sheet computed damage from strength regardless of class. The workbench gained
a weapon-family picker, which is where changing class is a deliberate act.
Verified by script across all five families and all four visible slots; both
workspaces typecheck and every atlas serves. Confirmed in-browser 2026-08-18
(headless Playwright, this machine has no display): naked-by-default spawn,
sword visibly in-hand after crafting/equipping with the class-change toast
firing, and a live fight against a wolf with working combat log/target
ring/floating damage and no console errors.
Before that, Phase 44: the class system —
warrior, ranger and mage, each with its own body art across four armour
tiers, its own weapon family (sword / bow / staff) that only it may equip,
its own primary attribute, and crucially its own auto-attack range, which is
what makes them feel different rather than merely differently-numbered. A
fourth attribute, Intelligence, drives a new mana pool that gates skills
alongside their cooldowns. 21 skills — seven per class, five active and two
passive — unlock by level and are shown in a skill-tree panel (`K`); the
hotbar rebuilds itself per class and level. Effects were rebuilt at higher
fidelity (48px cells, 6 frames, 14 schools, soft alpha falloff). Character
class is chosen at the login screen and fixed at creation; the DB migrates
existing characters to warrior. Verified by script with all three classes in
separate camps. Before that, Phase 43: stakes, monster verbs and
co-op. Three fixes were the difference between combat that can be lost and
combat that cannot: potions had no cooldown at all (drink the stack, become
unkillable), regen ticked while you were being hit, and dying was free —
respawn cost nothing, teleported you home, and reset the monster to full, so
suicide beat retreat. Each monster kind now has an ability rather than only
a stat block: wolves leap, goblins call for help, slimes burst on death,
trolls telegraph. Mend and War Cry can target a selected ally, which is the
first mechanical reason to play together rather than alongside — one click
selects either an enemy or an ally and the server resolves which. Added
Dash (the answer to a 200px/s wolf), range indicators, and level scaling for
skills. Verified with four scripted clients; the first run failed for the
right reason (bots stood inside the camps, so nothing had to approach and
the new abilities could not fire) and passed once repositioned. Before that,
Phase 42: combat depth, from an
audit of the previous phase's own code. Two findings were real defects, not
missing features: kill credit went entirely to whoever landed the last blow
(so a second player on the same monster earned nothing, making co-op
pointless), and monsters attacked whoever was *nearest* rather than whoever
was hurting them (so a passer-by stole aggro, and no group role could
exist). Both are now served by one per-monster damage table that doubles as
threat and as the XP split. Also: melee crowding (separation steering plus a
cap on how many can press into contact, since a pack previously collapsed
onto one point), an AoE target cap, a 900ms global cooldown, skills routed
through `resolveHit` so they can miss and crit like any swing — they
previously bypassed accuracy entirely, quietly making Agility irrelevant on
the hotbar — and a telegraphed troll slam you answer by walking out of it.
Verified with three concurrent scripted clients: GCD refusal then success, a
skill that genuinely missed, a pack holding 39.6px apart instead of
stacking, both players earning XP from one camp, and the wind-up observed.
Before that, Phase 41: combat gained actual
decisions. Left-click selects a target (Tab cycles), and the server prefers
it over "nearest" while still auto-attacking if you have none. Five
cooldown skills on keys 1-5, each answering a different problem — pack
damage, reach, escape, sustain, burst — validated server-side, with the
client's cooldown driven by the server's reply rather than the keypress.
Positioning matters now that each monster kind has its own reach and chase
speed measured against the player's 220px/s: wolves stick to you, trolls
outrange you but can be outrun, slimes must touch you. Feedback added:
target ring, target frame, chill tint, cooldown curtains, in-combat
indicator. The balance fix that mattered most: monster speed was 42 against
the player's 220, so nothing could ever catch you and the chase system was
inert. Verified by script — all five skills fire correctly, a sixth cast is
refused as cooling down, auto-attacks land on the *selected* target, and
the wolf moves at exactly its stated 200px/s. Before that, Phase 40:
the idle model is gone
and combat is a real fight. No click-to-start, no progress bars, no
standing intents, no offline progress — the server decides what a player is
doing from where they stand, and `MOVE` is the only action input left.
Monsters run a proper idle/chase/return AI with sticky aggro, leashing and
heal-on-reset, so packs come to you and fleeing means something. Attack
speed became a property of the attacker rather than the target. Armour is
now visible via build-time palette swaps of the knight's two armour tones
(leather/bronze/steel/gold), and other players' weapons and armour render
too. Weapon placement had two real bugs fixed: over-long rare/epic blades,
and swings stranded mid-arc by killed tweens. Verified with a scripted
WebSocket client — a bot walked into a slime camp, monsters closed 29px on
their own, and 5 auto-attacks plus 16 counter-attacks landed with no input.
Not yet confirmed in-browser. Before that, Phase 39: combat animation and the
systems behind it. Equipped weapons are now genuinely held — `weapons.png`
is bottom-aligned so the sprite pivots on its grip, and rarity picks the
art so an upgrade is visible in the world; monsters and other players
wield too (the latter needed `weaponRarity` added to `PlayerState`,
merged in at broadcast from the existing server map). This forced a real
fix first: the player's position lived on `localSprite.x/y`, so the render
object was also the game state and any visual lunge would have corrupted
what was sent to the server — `playerX/playerY` are now authoritative with
the sprite as a view. Full attack beat (face, wind up, swing, lunge,
impact, flash, recoil, crit shake), mirrored for monster attacks, plus a
proper defeat animation. Built as systems per the user's mid-phase
request: an 8-effect x 4-frame library behind `playEffect()`, and 10
synthesised WAV cues behind a rate-limited `playSfx()` — including `cast`
and `heal`, which exist ahead of the spell system that will use them.
`[M]` toggles sound. Verified: both workspaces typecheck, dev server
clean, all 5 atlases and 10 sounds serve 200 — not yet confirmed
in-browser. Before that, Phase 38: first round of fixes
against the running game. The crafting station was rendering as a blinking
blue flower — `STATION_FRAMES` had row and column swapped in the
`row * 57 + col` tile formula, which silently yields a real but wrong
tile. Fixed structurally by baking `props.png`, a flat 0..14 index of every
non-actor object, which also unlocked two-tile-tall trees. Trees and bushes
were nearly the same hue as the grass (chosen off a dark-background contact
sheet) so they read as ghost outlines — swapped for contrasting variants.
Grass was one tile repeated and looked flat and gridded — now a baked
256x256 mosaic of four flipped variants under a wrapping brightness field.
Ground clutter was dense bouquets snapped to a lattice — now hand-drawn
tufts/flowers/pebbles placed freely. HUD portrait was a tofu-glyph emoji —
now the player's live idle animation. Plus per-node art variants hashed
from node id, redrawn rocks, and `ACTOR_SCALE` 2 → 3. Verified: typecheck
clean, dev server clean, all assets serve 200 — not yet re-confirmed
visually in-browser. Before that, Phase 37: `npm run dev` from repo root runs
server (ws://localhost:8080) + client (http://localhost:5173) via
`concurrently`; both `server` and `client` typecheck clean
(`npx tsc --noEmit --allowImportingTsExtensions`). Latest: a full art
pass — the user asked to upgrade every sprite, animate what needs
animating, and get proper animated character art. Turned on `pixelArt`
(the whole game had been silently bilinear-blurred), brought in 0x72's
CC0 "DungeonTileset II" for its 4-frame idle/run animations, composed a
uniform 32x36 `actors.png` from it, and hand-drew the slime and wolf that
pack lacks. Player/other players/all 4 monsters are now animated sprites
with idle+run loops and facing; the crafting station is an animated
forge; trees and bushes sway; hits flash and recoil the monster; ~320
seeded flower tiles decorate the ground; and real Y-depth sorting was
added (forced by the new feet-on-position origin, and it also fixed
world objects being able to draw over the HUD). Verified: typecheck
clean, dev server clean, all three asset files serve 200 over HTTP — but
not yet confirmed visually in-browser. Before that: sprite
visibility fixes + character/monster art, in response to user feedback
that Phase 35's nodes were "barely visible" against the grass and the
rock "does not look like rock at all" — added ground-shadow ellipses for
contrast and a hand-drawn boulder, and gave actors static bust sprites
(since superseded by the animated art above). Before that: real terrain/
environment sprites — a CC0 Kenney tileset (`client/public/assets/
tiles.png`) replaces the plain colored `Grid` background (now a grass
`TileSprite`) and the tree/rock/bush resource nodes (now cropped tile
`Image`s instead of colored circles, depleted state via tint) — user
explicitly asked to "download and add some basic stuff" for environment
art. Before that: a 30-item
inventory cap (loot/craft/offline-battle-loot all respect it, new generic
`INFO` toast message for the "bag full" notice, live "(N/30)" counter in
the Inventory header). Before that: a second
consumable, XP Tonic (craft at workbench for 12 herb + 4 ore, click to use
for +25 XP), mirroring the potion pattern with a shared render helper.
Before that: a daily login
bonus (20 wood/20 ore/15 herb/1 potion, claimable every 20h, checked on
every connect). Before that: a 3rd
gatherable resource, Herb (from new bush nodes clustered by the
workbench), Health Potions reworked to cost mostly herb instead of
wood/ore, and Vitality now
also boosts passive HP regen amount (new "HP Regen" character-sheet stat)
— proceeding autonomously per the user's explicit "add herb + more stats,
improvise" request. Not yet confirmed live. Before that: a leaderboard
(🏆 dock icon / `L`, top 10 by level, reads live from SQLite so offline
characters still rank). Before that: a 4th
equipment slot, Ring (bonus damage + bonus accuracy%) — confirmed the
item-slot architecture really does generalize as designed, `tsc`'s
exhaustiveness checks caught every touch point. Before
that: a 4th monster kind, Wolf — fast/evasive glass-cannon, new 4-wolf den
at (1100, 1500). Before that: Agility now also grants a double-attack
chance (capped 25%, own combat-log line per swing). Before that: the
top-left HUD became a real unit
frame (portrait + HP/XP bars) instead of plain text. Before that: every
item now rolls a second stat of a different flavor than its primary
(weapon crit%, armor evasion%, boots
move speed). Before that: craftable Health Potions (workbench recipe, +30
HP, click the
inventory stack to use). Before that: unequipped items can now be sold for
wood (rarity-scaled: common 5 /
rare 20 / epic 60) via a hover-revealed sell button per card and a new
`SELL_ITEM` message, since the bag had no sink at all before this.
Before that: wood/ore moved out of the HUD entirely and into the Inventory
panel as stackable material slots (🪵/🪨 with an xN quantity badge) with
their own filter tab, confirmed via AskUserQuestion that HUD counters
should go away rather than duplicate the display. Before that: user
pushed back on the reference-inspired redesign ("looks nothing like it") —
the gap was the visual *style* (gold/leather fantasy skin), not just
layout, and after AskUserQuestion confirmed the whole UI should be
reskinned, not just the two panels touched so far. Applied a gold/brown/
parchment CSS theme via custom properties across every DOM surface (login,
all 3 panels, dock, combat log, tooltip) plus a matching pass on the
Phaser-rendered HUD (new
background panel behind the top-left stat block, recolored text/buttons,
serif font). Functional signal colors (HP threshold colors, combat
floating-text, item rarity borders) deliberately left alone. Not yet
confirmed live in-browser (typecheck + clean dev-server
reloads confirmed only). Before that: the MMO-style dock went through two
rounds of user-caught fixes in quick succession — first the dock/panels
were positioned against the full-viewport `#game-root` instead of the
canvas (fixed with a `#game-frame` wrapper), then the user clarified they
wanted the actual game window bigger, not just a bigger fixed box, so the
canvas now fills the whole browser window via `Phaser.Scale.RESIZE`; the
dock itself was then also re-centered to bottom-middle and enlarged
(48px → 60px) per direct feedback once visible. Inventory grid separately
reworked from plain text cards to icon + rarity-glow slots with a hover
tooltip (`ItemTooltip.ts`). Before that: combat reworked
into a true auto-battler per explicit user direction — monsters regrouped
into packs (2 slime/2 goblin packs of 4, 1 troll pack of 3, world grown to
2200x1600 to fit them), killing one auto-retargets to the nearest living
pack-mate of the same kind (new `BATTLE_RANGE_PX` = 110, looser than
gathering's 40), and offline progress now covers battling too — reconnect
after being disconnected mid-fight simulates kills/XP at the normal rate but
loot at 20% of the normal drop chance (capped at 5 items), toasted via a new
`OFFLINE_COMBAT_SUMMARY` message — user moved on to the next request before
explicitly confirming this one live in-browser. Before that: a
persistent combat-log DOM panel (bottom-left, fading history of
hits/misses/crits/loot/level-ups/defeats) — confirmed live. Before that:
monster counter-attacks moved to their own per-kind cadence
(`attackIntervalMs`) instead of firing once per player attack cycle, so
weapon/battle-power speed only affects your own attack rate — confirmed
live. Crafting extended from common-only to all 3 rarity tiers (cost scales
1x/4x/12x). Before that: world first expanded to 1600x1200 with a
populated layout, camera-follow + screen-pinned HUD, name/title labels
above every node/monster/station, and the crafting station itself
(confirmed live). Before that: passive HP regen (1 HP/5s while below max)
and a full stat-driven combat resolution system (Strength/Agility/Vitality
driving damage/accuracy-crit/HP, item stat rolls, monster HP bars, floating
combat text). Earlier in the session the background dev-server process was
found stopped mid-session and had to be
restarted before testing could continue — worth remembering: if a
task-notification reports a background process stopped unexpectedly, verify
the port is actually listening (`Get-NetTCPConnection`) before trusting the
next "it works" at face value.
User is directing an open-ended "keep upgrading it, use Idlekin as reference
— combat, monsters, items, UI" build — proceeding autonomously through
further additions in that space, pausing only for the user to eyeball the
browser at testable milestones (I can't see the canvas myself), not for
go-ahead permission on what to build next. No committed next phase — see
Phase 35+ candidates above.
